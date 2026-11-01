import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { beach, label, scoreHour, windSide } from "../src/derive/beach";
import { due, moments } from "../src/derive/moments";
import { ruleBrief } from "../src/derive/brief";
import { scoreSunrise } from "../src/derive/sunrise";
import { isCurfew, normalize, predictOverhead, runwayMode, type RawAc } from "../src/sources/flights";
import { auroraFromKp, parseDescription, parseFires, parseSpace } from "../src/sources/hazards";
import { dedupe, keywordLocal, parseRss } from "../src/sources/news";
import { parseBuoyRows } from "../src/sources/sea";
import { parseMetar, parseWeather } from "../src/sources/weather";
import { outputText } from "../src/llm";

const rfs = JSON.parse(readFileSync(new URL("./fixtures/rfs-majorincidents-2020-10-10.json", import.meta.url), "utf8"));

describe("feux NSW RFS (flux réel du 10/10/2020)", () => {
  it("lit les champs cachés dans la description", () => {
    const kv = parseDescription(rfs.features[0].properties.description);
    expect(kv["ALERT LEVEL"]).toBe("Advice");
    expect(kv["COUNCIL AREA"]).toBe("Lithgow");
    expect(kv.SIZE).toBe("2 ha");
  });
  it("garde les feux à moins de 200 km, triés par niveau d'alerte puis distance", () => {
    const f = parseFires(rfs, 270);
    expect(f.totalNsw).toBe(45);
    expect(f.nearby.length).toBeGreaterThan(0);
    for (const x of f.nearby) expect(x.distKm).toBeLessThanOrEqual(200);
    const hartley = f.nearby.find((x) => x.title.includes("Hartley"))!;
    expect(hartley.distKm).toBeGreaterThan(90);
    expect(hartley.distKm).toBeLessThan(120);
    expect(hartley.sizeHa).toBe(2);
  });
  it("fumée vers nous seulement si le vent pousse du feu vers Maroubra", () => {
    // Feu à l'ouest (Hartley) : vent d'ouest (270°) pousse la fumée vers l'est, donc vers nous
    const big = { ...rfs, features: [{ ...rfs.features[0], properties: { ...rfs.features[0].properties, description: rfs.features[0].properties.description.replace("2 ha", "500 ha").replace("Under control", "Being controlled") } }] };
    expect(parseFires(big, 270).nearby[0].smokeTowardUs).toBe(true);
    expect(parseFires(big, 90).nearby[0].smokeTowardUs).toBe(false);
  });
});

describe("avions (format v2 d'adsb.lol, données construites à la main)", () => {
  const raw: RawAc[] = [
    { hex: "7c6b2d", flight: "QFA432  ", r: "VH-VZA", t: "B738", alt_baro: 1800, gs: 160, track: 340, baro_rate: -700, lat: -34.02, lon: 151.20, seen_pos: 1 },
    { hex: "7c0001", flight: "QFA1", t: "A388", alt_baro: 4000, gs: 250, track: 90, lat: -33.9496, lon: 151.20, seen_pos: 1 },
    { hex: "7cffff", alt_baro: "ground", lat: -33.94, lon: 151.18, seen_pos: 2 },
    { hex: "stale", lat: -33.9, lon: 151.2, seen_pos: 200 },
  ];
  const routes = new Map([["QFA432", { callsign: "QFA432", airport_codes: "YMML-YSSY", _airport_codes_iata: "MEL-SYD", plausible: true, _airports: [{ iata: "MEL", name: "Melbourne", location: "Melbourne" }, { iata: "SYD", name: "Sydney Kingsford Smith", location: "Sydney" }] }]]);
  const acs = normalize(raw, routes as never, new Map());
  it("normalise, trie par distance et ignore les positions trop anciennes", () => {
    expect(acs.map((a) => a.hex)).not.toContain("stale");
    expect(acs[0].distKm).toBeLessThanOrEqual(acs[1].distKm);
    const q = acs.find((a) => a.hex === "7c6b2d")!;
    expect(q.callsign).toBe("QFA432");
    expect(q.route?.codes).toBe("MEL-SYD");
    expect(acs.find((a) => a.hex === "7cffff")!.onGround).toBe(true);
  });
  it("repère l'A380 et prévoit son survol", () => {
    const a = acs.find((x) => x.hex === "7c0001")!;
    expect(a.rare).toBe("Airbus A380");
    expect(a.overhead).not.toBeNull();
    expect(a.overhead!.inMin).toBeGreaterThanOrEqual(1);
  });
  it("pas de survol pour un avion qui s'éloigne", () => {
    expect(predictOverhead({ lat: -33.9496, lon: 151.30, track: 90, speedKt: 250 })).toBeNull();
  });
  it("déduit le mode de pistes et le couvre-feu", () => {
    expect(runwayMode(acs)?.mode).toBe("Arrivals on runway 34L/34R");
    expect(isCurfew(new Date("2026-11-14T13:30:00Z"))).toBe(true); // 00:30 à Sydney
    expect(isCurfew(new Date("2026-11-14T03:00:00Z"))).toBe(false);
  });
});

describe("météo, METAR, bouée", () => {
  it("Open-Meteo : heure, jour et pluie des dernières 24 h", () => {
    const t0 = 1_800_000_000;
    const hours = Array.from({ length: 30 }, (_, i) => t0 - 24 * 3600 + i * 3600);
    const col = (v: number) => hours.map(() => v);
    const w = parseWeather({
      current: { time: t0, temperature_2m: 22, apparent_temperature: 21, relative_humidity_2m: 60, precipitation: 0, weather_code: 1, cloud_cover: 20, wind_speed_10m: 15, wind_direction_10m: 90, wind_gusts_10m: 25, uv_index: 6, is_day: 1 },
      hourly: { time: hours, temperature_2m: col(20), apparent_temperature: col(19), precipitation_probability: col(10), precipitation: col(0.5), weather_code: col(1), cloud_cover: col(20), cloud_cover_low: col(5), cloud_cover_mid: col(10), cloud_cover_high: col(10), wind_speed_10m: col(12), wind_direction_10m: col(90), wind_gusts_10m: col(20), uv_index: col(5), visibility: col(20000), relative_humidity_2m: col(60) },
      daily: { time: [t0 - 86400, t0], weather_code: [1, 2], temperature_2m_max: [24, 25], temperature_2m_min: [17, 18], precipitation_sum: [0, 1], precipitation_probability_max: [10, 20], uv_index_max: [9, 9], wind_speed_10m_max: [20, 25], wind_gusts_10m_max: [30, 35], wind_direction_10m_dominant: [90, 180] },
    } as never, t0 * 1000);
    expect(w.rainPast24h).toBe(12);
    expect(w.hourly[0].t).toBeGreaterThanOrEqual(t0 - 3600);
    expect(w.current.isDay).toBe(true);
  });
  it("METAR : garde la plus récente", () => {
    const m = parseMetar([{ icaoId: "YSSY", obsTime: 1, rawOb: "old" }, { icaoId: "YSSY", obsTime: 2, temp: 21, wdir: "VRB", wspd: 3, rawOb: "new" }]);
    expect(m.raw).toBe("new");
    expect(m.windDir).toBeNull();
  });
  it("bouée : valeurs aberrantes écartées", () => {
    const now = Date.parse("2026-10-31T01:00:00Z");
    const b = parseBuoyRows([
      { TIME: "2026-10-31T00:00:00Z", WSSH: 1.55, WPPE: 13.8, WPDI: 156 },
      { TIME: "2026-10-30T23:00:00Z", WSSH: null, WHTH: 1.5 },
      { TIME: "2026-10-30T22:00:00Z", WSSH: 99 },
    ], now);
    expect(b.latest?.hs).toBe(1.55);
    expect(b.series.length).toBe(2);
  });
});

describe("plage", () => {
  const base = { t: 0, surf: 0.4, period: 8, wind: 10, windDir: 270, sst: 22, feels: 27, precip: 0, pop: 5, uv: 6 };
  const ctx = { afterRain: false, bluebottles: false, tide: [] };
  it("journée idéale : score élevé", () => {
    expect(scoreHour(base, ctx).score).toBeGreaterThanOrEqual(9);
    expect(label(9)).toBe("Great");
  });
  it("grosse houle, vent de mer et pluie récente : rester dehors", () => {
    const s = scoreHour({ ...base, surf: 2.4, period: 14, wind: 30, windDir: 90 }, { ...ctx, afterRain: true });
    expect(s.score).toBeLessThan(3);
    expect(s.reasons.some((r) => r.text.includes("Beachwatch"))).toBe(true);
  });
  it("orientation de la plage : ouest = de terre, est = de mer", () => {
    expect(windSide(270)).toBe("offshore");
    expect(windSide(90)).toBe("onshore");
    expect(windSide(0)).toBe("cross-shore");
  });
  it("meilleur créneau trouvé dans la journée", () => {
    const now = Date.parse("2026-12-05T21:00:00Z"); // 08:00 à Sydney
    const nowS = now / 1000;
    const hours = Array.from({ length: 40 }, (_, i) => nowS - 24 * 3600 + i * 3600);
    const w = { current: { t: nowS, temp: 25, feels: 26, humidity: 60, precip: 0, code: 1, cloud: 10, wind: 10, windDir: 270, gust: 15, uv: 8, isDay: true }, rainPast24h: 0, daily: [],
      hourly: hours.map((t) => ({ t, temp: 25, feels: 26, pop: 0, precip: 0, code: 1, cloud: 10, cloudLow: 0, cloudMid: 0, cloudHigh: 0, wind: 10, windDir: 270, gust: 15, uv: 8, visibility: null, humidity: 60 })) };
    const b = beach(w as never, { hourly: hours.map((t) => ({ t, waveHeight: 0.6, waveDir: 120, wavePeriod: 9, swellHeight: 0.5, swellDir: 120, swellPeriod: 9, windWaveHeight: 0.2, sst: 21 })) }, null, [], now);
    expect(b.best).not.toBeNull();
    expect(b.best!.score).toBeGreaterThanOrEqual(8);
    expect(b.sea.label).toBe("Clean");
  });
});

describe("lever de soleil, aurore, moments, brief, modèle", () => {
  it("nuages moyens près de nous et horizon dégagé : à ne pas rater", () => {
    expect(scoreSunrise([{ low: 5, mid: 50, high: 40 }, { low: 5, mid: 45, high: 50 }, { low: 0, mid: 20, high: 10 }, { low: 0, mid: 0, high: 0 }]).score).toBeGreaterThanOrEqual(7);
    expect(scoreSunrise([{ low: 95, mid: 0, high: 0 }, { low: 90, mid: 0, high: 0 }, { low: 90, mid: 0, high: 0 }, { low: 90, mid: 0, high: 0 }]).score).toBeLessThan(3);
  });
  it("aurore : seuils de Kp pour Sydney", () => {
    expect(auroraFromKp(5)).toBe("none");
    expect(auroraFromKp(7.3)).toBe("possible");
    expect(auroraFromKp(8.7)).toBe("likely");
  });
  it("NOAA SWPC : formats tableau avec en-tête et liste d'objets", () => {
    const now = Date.parse("2026-10-31T00:00:00Z");
    const s = parseSpace([["time_tag", "Kp", "a_running", "station_count"], ["2026-10-30 21:00:00.000", "3.33", "18", "8"]],
      [{ time_tag: "2026-10-31T12:00:00", kp: 7.33, observed: "predicted" }], now);
    expect(s.kpNow).toBeCloseTo(3.33);
    expect(s.forecastMax).toBeCloseTo(7.33);
    expect(s.aurora).toBe("possible");
  });
  it("moments : aurore immédiate, ISS 15 min avant", () => {
    const now = new Date("2026-11-14T09:00:00Z");
    const list = moments({
      space: { kpNow: 7, kpMax24h: 7, forecastMax: 7.5, forecastAt: null, aurora: "possible" },
      iss: { tleEpoch: "", passes: [{ start: "2026-11-14T09:10:00Z", max: "2026-11-14T09:13:00Z", end: "2026-11-14T09:16:00Z", maxAlt: 60, startAz: 300, endAz: 120, durationMin: 6 }] },
    }, now);
    expect(list[0].kind).toBe("aurora");
    expect(due(list, now).map((m) => m.kind).sort()).toEqual(["aurora", "iss"]);
    const early = new Date("2026-11-14T08:40:00Z");
    const earlyList = moments({ space: { kpNow: 7, kpMax24h: 7, forecastMax: 7.5, forecastAt: null, aurora: "possible" }, iss: { tleEpoch: "", passes: [{ start: "2026-11-14T09:10:00Z", max: "2026-11-14T09:13:00Z", end: "2026-11-14T09:16:00Z", maxAlt: 60, startAz: 300, endAz: 120, durationMin: 6 }] } }, early);
    expect(due(earlyList, early).map((m) => m.kind)).toEqual(["aurora"]);
  });
  it("brief par règles quand le modèle est absent", () => {
    expect(ruleBrief({ localTime: "", moments: [{ title: "Moonrise over the sea at 19:34", detail: "" }], weather: { now: "clear", tempC: 22, feelsC: 21, windKmh: 10, windFrom: 270, maxToday: 26, rainChanceToday: 0 } }))
      .toBe("Clear, 22°C, up to 26°C. Moonrise over the sea at 19:34.");
  });
  it("API Responses : texte de sortie", () => {
    expect(outputText({ output: [{ type: "reasoning" }, { type: "message", content: [{ type: "output_text", text: "Hi" }] }] })).toBe("Hi");
    expect(outputText({ output_text: "Yo" })).toBe("Yo");
  });
});

describe("actualités", () => {
  // RSS 2.0 construit à la main, au format des flux de recherche Google News
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>
<item><title>Maroubra Beach closed after shark sighting - The Daily Telegraph</title><link>https://n.example/1</link><pubDate>Fri, 30 Oct 2026 21:00:00 GMT</pubDate><source url="https://dt">The Daily Telegraph</source></item>
<item><title>Maroubra beach closed after shark sighting on Friday - ABC News</title><link>https://n.example/2</link><pubDate>Fri, 30 Oct 2026 20:00:00 GMT</pubDate><source url="https://abc">ABC News</source></item>
<item><title>Interest rates on hold - SMH</title><link>https://n.example/3</link><pubDate>Fri, 30 Oct 2026 19:00:00 GMT</pubDate><source url="https://smh">SMH</source></item>
</channel></rss>`;
  it("lit le flux, retire le nom du média du titre et regroupe les doublons", () => {
    const items = parseRss(xml);
    expect(items[0].title).toBe("Maroubra Beach closed after shark sighting");
    expect(items[0].source).toBe("The Daily Telegraph");
    expect(dedupe(items).length).toBe(2);
    expect(keywordLocal(items[2].title)).toBe(false);
  });
});
