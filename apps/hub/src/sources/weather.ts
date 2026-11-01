// Prévisions Open-Meteo (meilleure combinaison de modèles pour Sydney, dont BOM ACCESS-G),
// et observation METAR de l'aéroport de Sydney (aviationweather.gov, NOAA).
import type { Metar, Weather } from "@maroubra/core";
import { SITE } from "../config";
import { fetchJson } from "../http";
import type { Collector } from "../collector";

const HOURLY = ["temperature_2m", "apparent_temperature", "precipitation_probability", "precipitation", "weather_code", "cloud_cover",
  "cloud_cover_low", "cloud_cover_mid", "cloud_cover_high", "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m", "uv_index",
  "visibility", "relative_humidity_2m"];
const DAILY = ["weather_code", "temperature_2m_max", "temperature_2m_min", "precipitation_sum", "precipitation_probability_max",
  "uv_index_max", "wind_speed_10m_max", "wind_gusts_10m_max", "wind_direction_10m_dominant"];
const CURRENT = ["temperature_2m", "apparent_temperature", "relative_humidity_2m", "precipitation", "weather_code", "cloud_cover",
  "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m", "uv_index", "is_day"];

export function weatherUrl(lat = SITE.lat, lon = SITE.lon): string {
  const q = new URLSearchParams({
    latitude: String(lat), longitude: String(lon), timezone: "Australia/Sydney", timeformat: "unixtime",
    forecast_days: "8", past_days: "1", wind_speed_unit: "kmh",
    hourly: HOURLY.join(","), daily: DAILY.join(","), current: CURRENT.join(","),
  });
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}

type Cols = Record<string, (number | null)[]>;
const n = (v: number | null | undefined, d = 0) => (v == null ? d : v);

export function parseWeather(j: { current: Record<string, number>; hourly: Cols & { time: number[] }; daily: Cols & { time: number[] } }, now = Date.now()): Weather {
  const h = j.hourly;
  const all = h.time.map((t, i) => ({
    t, temp: n(h.temperature_2m[i]), feels: n(h.apparent_temperature[i]), pop: h.precipitation_probability[i] ?? null,
    precip: n(h.precipitation[i]), code: n(h.weather_code[i]), cloud: n(h.cloud_cover[i]), cloudLow: n(h.cloud_cover_low[i]),
    cloudMid: n(h.cloud_cover_mid[i]), cloudHigh: n(h.cloud_cover_high[i]), wind: n(h.wind_speed_10m[i]), windDir: n(h.wind_direction_10m[i]),
    gust: n(h.wind_gusts_10m[i]), uv: n(h.uv_index[i]), visibility: h.visibility[i] ?? null, humidity: n(h.relative_humidity_2m[i]),
  }));
  const nowS = now / 1000;
  const rainPast24h = all.filter((x) => x.t > nowS - 86400 && x.t <= nowS).reduce((s, x) => s + x.precip, 0);
  const d = j.daily;
  const c = j.current;
  return {
    current: {
      t: c.time, temp: c.temperature_2m, feels: c.apparent_temperature, humidity: c.relative_humidity_2m, precip: c.precipitation,
      code: c.weather_code, cloud: c.cloud_cover, wind: c.wind_speed_10m, windDir: c.wind_direction_10m, gust: c.wind_gusts_10m,
      uv: c.uv_index, isDay: c.is_day === 1,
    },
    hourly: all.filter((x) => x.t >= nowS - 3600),
    daily: d.time.map((t, i) => ({
      t, code: n(d.weather_code[i]), max: n(d.temperature_2m_max[i]), min: n(d.temperature_2m_min[i]), precip: n(d.precipitation_sum[i]),
      pop: d.precipitation_probability_max[i] ?? null, uvMax: n(d.uv_index_max[i]), windMax: n(d.wind_speed_10m_max[i]),
      gustMax: n(d.wind_gusts_10m_max[i]), windDir: n(d.wind_direction_10m_dominant[i]),
    })).filter((x) => x.t >= nowS - 86400),
    rainPast24h: Math.round(rainPast24h * 10) / 10,
  };
}

export const weather: Collector<Weather> = {
  id: "weather",
  everyMs: 15 * 60e3,
  staleAfterMs: 2 * 3600e3,
  run: async () => parseWeather(await fetchJson(weatherUrl())),
};

interface RawMetar { icaoId: string; obsTime: number; temp?: number; dewp?: number; wdir?: number | string; wspd?: number; wgst?: number; visib?: number | string; altim?: number; rawOb: string }

export function parseMetar(list: RawMetar[]): Metar {
  const m = [...list].sort((a, b) => b.obsTime - a.obsTime)[0];
  if (!m) throw new Error("no METAR");
  return {
    station: m.icaoId, t: m.obsTime, temp: m.temp ?? null, dewpoint: m.dewp ?? null,
    windDir: typeof m.wdir === "number" ? m.wdir : null, windKt: m.wspd ?? null, gustKt: m.wgst ?? null,
    visibility: m.visib == null ? null : String(m.visib), qnh: m.altim ?? null, raw: m.rawOb,
  };
}

export const metar: Collector<Metar> = {
  id: "metar",
  everyMs: 10 * 60e3,
  staleAfterMs: 90 * 60e3,
  run: async () => parseMetar(await fetchJson("https://aviationweather.gov/api/data/metar?ids=YSSY&format=json&hours=3")),
};
