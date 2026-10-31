// La mer : prévision de houle Open-Meteo Marine et mesures de la bouée Waverider de Sydney
// (Manly Hydraulics Laboratory, archive AODN « cloud optimised » sur AWS, sans clé).
import type { Buoy, BuoyObs, Marine } from "@maroubra/core";
import { parquetReadObjects } from "hyparquet";
import { fetchBytes, fetchJson, fetchText } from "../http";
import type { Collector } from "../collector";

export function marineUrl(): string {
  const vars = ["wave_height", "wave_direction", "wave_period", "swell_wave_height", "swell_wave_direction", "swell_wave_period", "wind_wave_height", "sea_surface_temperature"];
  const q = new URLSearchParams({
    latitude: "-33.95", longitude: "151.27", timezone: "Australia/Sydney", timeformat: "unixtime", forecast_days: "7", hourly: vars.join(","),
  });
  return `https://marine-api.open-meteo.com/v1/marine?${q}`;
}

export function parseMarine(j: { hourly: Record<string, (number | null)[]> & { time: number[] } }, now = Date.now()): Marine {
  const h = j.hourly;
  return {
    hourly: h.time.map((t, i) => ({
      t, waveHeight: h.wave_height[i], waveDir: h.wave_direction[i], wavePeriod: h.wave_period[i], swellHeight: h.swell_wave_height[i],
      swellDir: h.swell_wave_direction[i], swellPeriod: h.swell_wave_period[i], windWaveHeight: h.wind_wave_height[i], sst: h.sea_surface_temperature[i],
    })).filter((x) => x.t >= now / 1000 - 3600),
  };
}

export const marine: Collector<Marine> = {
  id: "marine",
  everyMs: 30 * 60e3,
  staleAfterMs: 3 * 3600e3,
  run: async () => parseMarine(await fetchJson(marineUrl())),
};

const AODN = "https://aodn-cloud-optimised.s3.amazonaws.com";
const PREFIX = "wave_buoy_realtime_nonqc.parquet/site_name=Sydney/";

/** Clés des fichiers mensuels de la bouée, triées (la clé contient l'époque du début de mois). */
export async function buoyKeys(): Promise<string[]> {
  const out: string[] = [];
  let token: string | null = null;
  do {
    const url = `${AODN}/?list-type=2&prefix=${encodeURIComponent(PREFIX)}&max-keys=1000${token ? `&continuation-token=${encodeURIComponent(token)}` : ""}`;
    const xml = await fetchText(url);
    out.push(...[...xml.matchAll(/<Key>([^<]+\.parquet)<\/Key>/g)].map((m) => m[1]));
    token = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1] ?? null;
  } while (token);
  const epoch = (k: string) => Number(k.match(/timestamp=(\d+)/)?.[1] ?? 0);
  return out.sort((a, b) => epoch(a) - epoch(b));
}

interface BuoyRow { TIME: Date | number | string; WSSH?: number | null; WHTH?: number | null; WMXH?: number | null; WPPE?: number | null; WPDI?: number | null; LATITUDE?: number; LONGITUDE?: number }

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function parseBuoyRows(rows: BuoyRow[], now = Date.now()): Buoy {
  const obs: BuoyObs[] = rows
    .map((r) => ({
      t: Math.round(new Date(r.TIME as string).getTime() / 1000),
      hs: num(r.WSSH) ?? num(r.WHTH),
      hmax: num(r.WMXH),
      tp: num(r.WPPE),
      dir: num(r.WPDI),
    }))
    .filter((o) => Number.isFinite(o.t) && o.hs != null && o.hs > 0 && o.hs < 15)
    .sort((a, b) => a.t - b.t);
  const last = rows.at(-1);
  return {
    station: "Sydney Waverider (MHL)",
    lat: num(last?.LATITUDE) ?? -33.77,
    lon: num(last?.LONGITUDE) ?? 151.41,
    latest: obs.at(-1) ?? null,
    series: obs.filter((o) => o.t >= now / 1000 - 48 * 3600),
  };
}

export const buoy: Collector<Buoy> = {
  id: "buoy",
  everyMs: 20 * 60e3,
  staleAfterMs: 6 * 3600e3,
  run: async () => {
    const keys = (await buoyKeys()).slice(-2); // mois précédent et mois en cours
    const rows: BuoyRow[] = [];
    for (const k of keys) {
      const buf = await fetchBytes(`${AODN}/${k.split("/").map(encodeURIComponent).join("/")}`);
      rows.push(...((await parquetReadObjects({ file: buf, columns: ["TIME", "WSSH", "WHTH", "WMXH", "WPPE", "WPDI", "LATITUDE", "LONGITUDE"] })) as BuoyRow[]));
    }
    return parseBuoyRows(rows);
  },
};
