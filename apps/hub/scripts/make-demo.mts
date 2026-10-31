// Instantané de DÉMONSTRATION pour les tests de bout en bout et les captures : entrées construites
// à la main (marquées comme telles à l'écran), passées dans les vrais calculs de l'app.
// Usage : npx tsx scripts/make-demo.mts <ISO time> <sortie.json>
import { readFileSync, writeFileSync } from "node:fs";
import type { Buoy, Flights, Iss, Marine, Metar, News, SpaceWeather, Weather } from "@maroubra/core";
import { beach } from "../src/derive/beach";
import { facts, ruleBrief } from "../src/derive/brief";
import { moments } from "../src/derive/moments";
import { scoreSunrise } from "../src/derive/sunrise";
import { loadTide } from "../src/derive/tide";
import { normalize, runwayMode, type RawAc } from "../src/sources/flights";
import { parseFires } from "../src/sources/hazards";

const at = new Date(process.argv[2] ?? "2026-11-14T03:00:00Z");
const out = process.argv[3] ?? "e2e-demo.json";
const nowS = Math.floor(at.getTime() / 1000);
const h0 = nowS - (nowS % 3600);
const hours = Array.from({ length: 60 }, (_, i) => h0 - 24 * 3600 + i * 3600);
const localHour = (t: number) => Number(new Intl.DateTimeFormat("en-AU", { hour: "numeric", hourCycle: "h23", timeZone: "Australia/Sydney" }).format(t * 1000));
const diurnal = (t: number) => Math.sin(((localHour(t) - 9) / 24) * 2 * Math.PI);

const weather: Weather = {
  current: { t: nowS, temp: 24.6, feels: 25.1, humidity: 62, precip: 0, code: 2, cloud: 35, wind: 17, windDir: 65, gust: 28, uv: 9.4, isDay: true },
  hourly: hours.map((t, i) => ({
    t, temp: 21 + 4 * diurnal(t), feels: 21 + 4.5 * diurnal(t), pop: i > 34 && i < 40 ? 60 : 10, precip: i > 35 && i < 39 ? 1.2 : 0, code: i > 35 && i < 39 ? 61 : 2,
    cloud: 35, cloudLow: 10, cloudMid: 30, cloudHigh: 20, wind: 12 + 6 * Math.max(0, diurnal(t)), windDir: localHour(t) >= 11 && localHour(t) <= 18 ? 60 : 280,
    gust: 25, uv: Math.max(0, 10 * diurnal(t)), visibility: 20000, humidity: 60,
  })).filter((x) => x.t >= nowS - 3600),
  daily: Array.from({ length: 7 }, (_, i) => ({ t: h0 + i * 86400, code: [2, 61, 3, 1, 0, 2, 80][i], max: [26, 22, 23, 27, 29, 25, 21][i], min: [18, 17, 16, 18, 19, 18, 16][i], precip: [0, 6, 1, 0, 0, 0.5, 9][i], pop: [10, 70, 30, 5, 0, 20, 80][i], uvMax: 10, windMax: 25, gustMax: 40, windDir: [60, 180, 200, 270, 300, 60, 170][i] })),
  rainPast24h: 0.4,
};
const metar: Metar = { station: "YSSY", t: nowS - 20 * 60, temp: 24, dewpoint: 16, windDir: 50, windKt: 11, gustKt: null, visibility: "6+", qnh: 1016, raw: "YSSY SAMPLE DATA" };
const marine: Marine = { hourly: hours.filter((t) => t >= nowS - 3600).map((t, i) => ({ t, waveHeight: 1.3 + 0.01 * i, waveDir: 140, wavePeriod: 9, swellHeight: 1.1 + 0.008 * i, swellDir: 150, swellPeriod: 11.5, windWaveHeight: 0.4, sst: 20.4 })) };
const buoy: Buoy = { station: "Sydney Waverider (MHL)", lat: -33.75, lon: 151.4, latest: { t: nowS - 2 * 3600, hs: 1.45, hmax: 2.6, tp: 11.8, dir: 148 },
  series: Array.from({ length: 44 }, (_, i) => ({ t: nowS - (46 - i) * 3600, hs: 1.2 + 0.4 * Math.sin(i / 7), hmax: 2.3, tp: 11 + Math.sin(i / 9), dir: 150 })) };
const raw: RawAc[] = [
  { hex: "7c6b2d", flight: "QFA432", r: "VH-VZA", t: "B738", alt_baro: 2100, gs: 165, track: 338, baro_rate: -640, lat: -34.012, lon: 151.205, seen_pos: 1 },
  { hex: "7c4920", flight: "VOZ821", r: "VH-YIA", t: "B738", alt_baro: 7800, gs: 290, track: 160, baro_rate: 1800, lat: -33.99, lon: 151.21, seen_pos: 1 },
  { hex: "c81e2f", flight: "ANZ103", t: "B789", alt_baro: 9000, gs: 300, track: 255, baro_rate: -900, lat: -33.93, lon: 151.42, seen_pos: 1 },
  { hex: "7c0001", flight: "QFA1", r: "VH-OQA", t: "A388", alt_baro: 5200, gs: 250, track: 95, baro_rate: 1500, lat: -33.951, lon: 151.215, seen_pos: 1 },
  { hex: "7c81b5", flight: "RSCU201", t: "AW139", alt_baro: 900, gs: 110, track: 20, lat: -33.97, lon: 151.27, seen_pos: 2 },
  { hex: "7c533a", flight: "JST512", t: "A321", alt_baro: 12000, gs: 320, track: 200, baro_rate: -1200, lat: -33.80, lon: 151.30, seen_pos: 1 },
];
const routes = new Map([
  ["QFA432", { callsign: "QFA432", airport_codes: "YMML-YSSY", _airport_codes_iata: "MEL-SYD", plausible: true, _airports: [{ iata: "MEL", name: "Melbourne", location: "Melbourne" }, { iata: "SYD", name: "Sydney Kingsford Smith", location: "Sydney" }] }],
  ["QFA1", { callsign: "QFA1", airport_codes: "YSSY-OMDB-EGLL", _airport_codes_iata: "SYD-DXB-LHR", plausible: true, _airports: [{ iata: "SYD", name: "Sydney Kingsford Smith", location: "Sydney" }, { iata: "LHR", name: "Heathrow", location: "London" }] }],
  ["VOZ821", { callsign: "VOZ821", airport_codes: "YSSY-YBBN", _airport_codes_iata: "SYD-BNE", plausible: true, _airports: [{ iata: "SYD", name: "Sydney Kingsford Smith", location: "Sydney" }, { iata: "BNE", name: "Brisbane", location: "Brisbane" }] }],
]);
const trails = new Map(raw.map((r) => [r.hex, Array.from({ length: 12 }, (_, i) => [r.lat! - Math.cos(((r.track ?? 0) * Math.PI) / 180) * 0.004 * (12 - i), r.lon! - Math.sin(((r.track ?? 0) * Math.PI) / 180) * 0.005 * (12 - i)] as [number, number])]));
const aircraft = normalize(raw, routes as never, trails);
const flights: Flights = { aircraft, runway: runwayMode(aircraft), curfew: false, seenToday: 214 };
const fires = parseFires(JSON.parse(readFileSync(new URL("../test/fixtures/rfs-majorincidents-2020-10-10.json", import.meta.url), "utf8")), weather.current.windDir);
const space: SpaceWeather = { kpNow: 3.3, kpMax24h: 4, forecastMax: 5, forecastAt: new Date(at.getTime() + 9 * 3600e3).toISOString(), aurora: "none" };
const iss: Iss = { tleEpoch: at.toISOString(), passes: [
  { start: new Date(at.getTime() + 6.2 * 3600e3).toISOString(), max: new Date(at.getTime() + 6.25 * 3600e3).toISOString(), end: new Date(at.getTime() + 6.3 * 3600e3).toISOString(), maxAlt: 64, startAz: 300, endAz: 120, durationMin: 6 },
  { start: new Date(at.getTime() + 30.1 * 3600e3).toISOString(), max: new Date(at.getTime() + 30.13 * 3600e3).toISOString(), end: new Date(at.getTime() + 30.17 * 3600e3).toISOString(), maxAlt: 22, startAz: 250, endAz: 170, durationMin: 4 },
] };
const air = { current: { t: nowS, pm25: 6.2, pm10: 13, aqi: 26, uv: 9.4 }, hourly: hours.map((t) => ({ t, pm25: 6, aqi: 25 })), modelled: true as const };
const news: News = { triagedBy: "keywords", items: Array.from({ length: 6 }, (_, i) => ({
  id: `sample-${i}`, title: `Sample local headline ${i + 1} (test data, not real news)`, link: "https://example.com/", source: "Sample source",
  published: new Date(at.getTime() - (i * 5 + 1) * 3600e3).toISOString(), summary: "Placeholder summary used only to test the layout.", topic: ["beach", "council", "community", "events", "environment", "transport"][i], local: true,
})) };
const tide = loadTide(new URL("../../web/public", import.meta.url).pathname);
const b = beach(weather, marine, buoy, tide, at.getTime());
const s = scoreSunrise([{ low: 10, mid: 45, high: 30 }, { low: 10, mid: 40, high: 40 }, { low: 5, mid: 15, high: 10 }, { low: 0, mid: 5, high: 0 }]);
const sunrise = { date: "2026-11-15", time: "2026-11-14T18:42:00Z", ...s };
const ms = moments({ weather, beach: b, sunrise, iss, space, fires, flights }, at);
const brief = { text: ruleBrief(facts(weather, b, "low tide at 18:40", ms, at)), at: at.toISOString(), by: "rules" };
writeFileSync(out, JSON.stringify({ weather, metar, marine, buoy, flights, fires, air, space, iss, sunrise, news, beach: b, moments: ms, brief }));
console.log(out, "beach", b.score, b.label, "moments", ms.length, "fires", fires.nearby.length, "brief:", brief.text);
