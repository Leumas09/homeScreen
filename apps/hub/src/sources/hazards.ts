// Feux de brousse (NSW RFS, flux GeoJSON officiel, CC BY 4.0), qualité de l'air (modèle CAMS via
// Open-Meteo, valeurs modélisées et non mesurées) et météo de l'espace (NOAA SWPC, indice Kp).
import type { AirQuality, Fire, Fires, SpaceWeather } from "@maroubra/core";
import { SITE } from "../config";
import { angleDiff, bearingDeg, distanceKm } from "../geo";
import { fetchJson } from "../http";
import type { Collector } from "../collector";

type Geometry = { type: string; coordinates?: unknown; geometries?: Geometry[] };

function firstPoint(g: Geometry | null | undefined): [number, number] | null {
  if (!g) return null;
  if (g.type === "Point") return g.coordinates as [number, number];
  for (const sub of g.geometries ?? []) {
    const p = firstPoint(sub);
    if (p) return p;
  }
  if (g.type === "Polygon") return (g.coordinates as [number, number][][])[0][0];
  return null;
}

/** Le champ description contient « CLÉ: valeur <br />CLÉ: valeur ». */
export function parseDescription(desc: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of desc.split(/<br\s*\/?>/i)) {
    const i = part.indexOf(":");
    if (i > 0) out[part.slice(0, i).trim().toUpperCase()] = part.slice(i + 1).trim();
  }
  return out;
}

const ALERT_RANK: Record<string, number> = { "Emergency Warning": 0, "Watch and Act": 1, Advice: 2 };

export function parseFires(j: { features: { properties: Record<string, string>; geometry: Geometry }[] }, windFromDeg: number | null, maxKm = 200): Fires {
  const nearby: Fire[] = [];
  for (const f of j.features ?? []) {
    const p = firstPoint(f.geometry);
    if (!p) continue;
    const [lon, lat] = p;
    const d = distanceKm(SITE.lat, SITE.lon, lat, lon);
    if (d > maxKm) continue;
    const kv = parseDescription(f.properties.description ?? "");
    const size = Number.parseFloat((kv.SIZE ?? "").replace(/[^\d.]/g, ""));
    const fireToHome = bearingDeg(lat, lon, SITE.lat, SITE.lon);
    const smokeHeading = windFromDeg == null ? null : (windFromDeg + 180) % 360;
    nearby.push({
      id: f.properties.guid ?? f.properties.title,
      title: f.properties.title,
      alert: kv["ALERT LEVEL"] ?? f.properties.category ?? "Not Applicable",
      status: kv.STATUS ?? "", type: kv.TYPE ?? "", sizeHa: Number.isFinite(size) ? size : null,
      council: kv["COUNCIL AREA"] ?? "", location: kv.LOCATION ?? "", updated: kv.UPDATED ?? f.properties.pubDate ?? "",
      lat, lon, distKm: Math.round(d), bearing: Math.round(bearingDeg(SITE.lat, SITE.lon, lat, lon)),
      // Fumée vers nous : le vent pousse du feu vers Maroubra (à 35° près), feu étendu et actif, à moins de 150 km.
      smokeTowardUs: smokeHeading != null && angleDiff(smokeHeading, fireToHome) <= 35 && d <= 150 && (size >= 50 || Number.isNaN(size)) && !/out|patrol/i.test(kv.STATUS ?? ""),
    });
  }
  nearby.sort((a, b) => (ALERT_RANK[a.alert] ?? 3) - (ALERT_RANK[b.alert] ?? 3) || a.distKm - b.distKm);
  return { nearby, totalNsw: (j.features ?? []).length };
}

export const fires: Collector<Fires> = {
  id: "fires",
  everyMs: 5 * 60e3,
  staleAfterMs: 60 * 60e3,
  run: async ({ store }) => {
    const wind = store.data<{ current: { windDir: number } }>("weather")?.current.windDir ?? null;
    return parseFires(await fetchJson("https://www.rfs.nsw.gov.au/feeds/majorIncidents.json"), wind);
  },
};

export function parseAir(j: { current: Record<string, number | null>; hourly: Record<string, (number | null)[]> & { time: number[] } }): AirQuality {
  const c = j.current;
  return {
    current: { t: c.time as number, pm25: c.pm2_5 ?? null, pm10: c.pm10 ?? null, aqi: c.us_aqi ?? null, uv: c.uv_index ?? null },
    hourly: j.hourly.time.map((t, i) => ({ t, pm25: j.hourly.pm2_5[i], aqi: j.hourly.us_aqi[i] })),
    modelled: true,
  };
}

export const air: Collector<AirQuality> = {
  id: "air",
  everyMs: 30 * 60e3,
  staleAfterMs: 3 * 3600e3,
  run: async () => {
    const q = new URLSearchParams({
      latitude: String(SITE.lat), longitude: String(SITE.lon), timezone: "Australia/Sydney", timeformat: "unixtime", forecast_days: "2",
      current: "pm2_5,pm10,us_aqi,uv_index", hourly: "pm2_5,us_aqi",
    });
    return parseAir(await fetchJson(`https://air-quality-api.open-meteo.com/v1/air-quality?${q}`));
  },
};

/** Les produits SWPC sont des tableaux avec ligne d'en-tête, ou des listes d'objets selon la version. */
export function rows(j: unknown): Record<string, unknown>[] {
  if (!Array.isArray(j) || !j.length) return [];
  if (Array.isArray(j[0])) {
    const [head, ...rest] = j as unknown[][];
    return rest.map((r) => Object.fromEntries((head as string[]).map((k, i) => [k.toLowerCase(), r[i]])));
  }
  return (j as Record<string, unknown>[]).map((o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.toLowerCase(), v])));
}

/**
 * Aurore australe vue de Sydney (latitude géomagnétique d'environ -42°) : règle empirique.
 * Kp 6 : visible en photo vers le sud par ciel noir ; Kp 7 : possible à l'œil ; Kp 8 et plus : probable.
 */
export function auroraFromKp(kp: number | null): SpaceWeather["aurora"] {
  if (kp == null || kp < 6) return "none";
  if (kp < 7) return "camera";
  if (kp < 8) return "possible";
  return "likely";
}

export function parseSpace(observed: unknown, forecast: unknown, now = Date.now()): SpaceWeather {
  const obs = rows(observed).map((r) => ({ t: Date.parse(String(r.time_tag).replace(" ", "T") + (String(r.time_tag).endsWith("Z") ? "" : "Z")), kp: Number(r.kp ?? r.kp_index) }))
    .filter((r) => Number.isFinite(r.kp) && Number.isFinite(r.t));
  const fc = rows(forecast).map((r) => ({ t: Date.parse(String(r.time_tag).replace(" ", "T") + (String(r.time_tag).endsWith("Z") ? "" : "Z")), kp: Number(r.kp), observed: String(r.observed) }))
    .filter((r) => Number.isFinite(r.kp) && r.t > now && r.t < now + 48 * 3600e3);
  const last = obs.at(-1);
  const max24 = obs.filter((r) => r.t > now - 86400e3).reduce((m, r) => Math.max(m, r.kp), -1);
  const fmax = fc.reduce<{ kp: number; t: number } | null>((m, r) => (!m || r.kp > m.kp ? { kp: r.kp, t: r.t } : m), null);
  const kpNow = last?.kp ?? null;
  return {
    kpNow, kpMax24h: max24 >= 0 ? max24 : null, forecastMax: fmax?.kp ?? null, forecastAt: fmax ? new Date(fmax.t).toISOString() : null,
    aurora: auroraFromKp(Math.max(kpNow ?? 0, fmax?.kp ?? 0)),
  };
}

export const space: Collector<SpaceWeather> = {
  id: "space",
  everyMs: 30 * 60e3,
  staleAfterMs: 6 * 3600e3,
  run: async () => parseSpace(
    await fetchJson("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json"),
    await fetchJson("https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json"),
  ),
};
