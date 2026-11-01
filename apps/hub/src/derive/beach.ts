// Score de baignade de Maroubra (0 à 10), heure par heure, avec ses raisons.
// Plage orientée à l'est (normale vers 100°) : vent d'ouest = de terre (« offshore »), vent d'est = de mer.
// Règles reprises de la pratique des sauveteurs et de Beachwatch : houle, vent de mer, eau froide,
// pluie récente (eaux pluviales : éviter la baignade jusqu'à un jour après la pluie), basse mer
// (courants de baïnes plus actifs), physalies apportées par les vents d'est en saison chaude.
import type { Beach, Buoy, Marine, Weather } from "@maroubra/core";
import { angleDiff } from "../geo";
import { minutesFromLow, type TideExtremum } from "./tide";

const BEACH_NORMAL = 100;
const NEARSHORE = 0.8; // atténuation approximative de la houle du large à la plage

export type WindSide = "offshore" | "cross-shore" | "onshore";
export function windSide(fromDeg: number): WindSide {
  const d = angleDiff(fromDeg, BEACH_NORMAL);
  return d <= 60 ? "onshore" : d >= 120 ? "offshore" : "cross-shore";
}

const sydneyHour = (tS: number) => Number(new Intl.DateTimeFormat("en-AU", { hour: "numeric", hourCycle: "h23", timeZone: "Australia/Sydney" }).format(tS * 1000));
const sydneyMonth = (tS: number) => Number(new Intl.DateTimeFormat("en-AU", { month: "numeric", timeZone: "Australia/Sydney" }).format(tS * 1000));
const sydneyDay = (tS: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(tS * 1000);

interface HourInput { t: number; surf: number | null; period: number | null; wind: number; windDir: number; sst: number | null; feels: number; precip: number; pop: number | null; uv: number }

export function scoreHour(h: HourInput, ctx: { afterRain: boolean; bluebottles: boolean; tide: TideExtremum[] }): { score: number; reasons: Beach["reasons"] } {
  let s = 10;
  const r: Beach["reasons"] = [];
  if (h.surf != null) {
    const pen = h.surf < 0.6 ? 0 : h.surf < 1 ? 1 : h.surf < 1.5 ? 2.5 : h.surf < 2 ? 4 : 6;
    s -= pen;
    r.push({ text: `Surf about ${h.surf.toFixed(1)} m${h.surf < 0.6 ? ", gentle" : h.surf >= 2 ? ", big and powerful" : ""}`, effect: pen ? "minus" : "plus" });
    if (h.period != null && h.period >= 12 && h.surf >= 1) { s -= 1; r.push({ text: `Long-period swell (${Math.round(h.period)} s) breaks hard`, effect: "minus" }); }
  }
  const side = windSide(h.windDir);
  if (side === "onshore" && h.wind >= 15) {
    s -= h.wind >= 25 ? 2 : 1;
    r.push({ text: `Onshore wind ${Math.round(h.wind)} km/h, choppy water`, effect: "minus" });
  } else if (side === "offshore") r.push({ text: "Offshore breeze, clean water", effect: "plus" });
  if (h.sst != null) {
    const pen = h.sst < 16 ? 2 : h.sst < 18 ? 1 : 0;
    s -= pen;
    r.push({ text: `Water ${h.sst.toFixed(0)}°C`, effect: pen ? "minus" : h.sst >= 22 ? "plus" : "info" });
  }
  if (h.feels < 15) { s -= 3; r.push({ text: `Feels like ${Math.round(h.feels)}°C on the sand`, effect: "minus" }); }
  else if (h.feels < 18) { s -= 1.5; r.push({ text: `Cool air, feels like ${Math.round(h.feels)}°C`, effect: "minus" }); }
  else if (h.feels >= 26) r.push({ text: `Warm, feels like ${Math.round(h.feels)}°C`, effect: "plus" });
  if (h.precip >= 0.5) { s -= 2; r.push({ text: "Rain expected", effect: "minus" }); }
  else if ((h.pop ?? 0) >= 60) { s -= 1; r.push({ text: `Rain likely (${h.pop}%)`, effect: "minus" }); }
  if (ctx.afterRain) { s -= 3; r.push({ text: "Heavy rain in the last day: stormwater may pollute the water (Beachwatch advice)", effect: "minus" }); }
  const fromLow = minutesFromLow(ctx.tide, h.t);
  if (fromLow != null && fromLow <= 90) { s -= 0.5; r.push({ text: "Near low tide, rips are stronger", effect: "minus" }); }
  if (ctx.bluebottles) { s -= 1; r.push({ text: "Easterly winds: bluebottles likely", effect: "minus" }); }
  if (h.uv >= 8) r.push({ text: `UV ${Math.round(h.uv)}, very high`, effect: "info" });
  return { score: Math.max(0, Math.min(10, Math.round(s * 10) / 10)), reasons: r };
}

export function label(score: number): Beach["label"] {
  return score >= 8 ? "Great" : score >= 6.5 ? "Good" : score >= 5 ? "Fair" : score >= 3 ? "Poor" : "Stay out";
}

export function beach(weather: Weather, marine: Marine | null, buoy: Buoy | null, tide: TideExtremum[], now = Date.now()): Beach {
  const nowS = now / 1000;
  const mByT = new Map((marine?.hourly ?? []).map((m) => [m.t, m]));
  // Physalies : vent d'est soutenu sur les dernières 24 h, de novembre à avril.
  const past = weather.hourly.filter((h) => h.t <= nowS && h.t > nowS - 86400);
  const easterly = past.filter((h) => angleDiff(h.windDir, 70) <= 45 && h.wind >= 15).length;
  const month = sydneyMonth(nowS);
  const bluebottles = easterly >= 6 && (month >= 11 || month <= 4);
  const afterRain = weather.rainPast24h >= 10;
  const buoyNow = buoy?.latest && nowS - buoy.latest.t < 6 * 3600 ? buoy.latest : null;

  const inputs: HourInput[] = weather.hourly
    .filter((h) => h.t >= nowS - 3600 && h.t <= nowS + 36 * 3600)
    .map((h) => {
      const m = mByT.get(h.t);
      // La bouée fait foi pour les premières heures, la prévision ensuite.
      const offshoreHs = h.t - nowS < 3 * 3600 && buoyNow?.hs != null ? buoyNow.hs : m?.swellHeight ?? m?.waveHeight ?? null;
      return {
        t: h.t, surf: offshoreHs == null ? null : offshoreHs * NEARSHORE, period: (h.t - nowS < 3 * 3600 ? buoyNow?.tp : null) ?? m?.swellPeriod ?? null,
        wind: h.wind, windDir: h.windDir, sst: m?.sst ?? marine?.hourly[0]?.sst ?? null, feels: h.feels, precip: h.precip, pop: h.pop, uv: h.uv,
      };
    });
  const ctx = { afterRain, bluebottles, tide };
  const daylight = inputs.filter((h) => { const hr = sydneyHour(h.t); return hr >= 7 && hr <= 18; });
  const hours = daylight.map((h) => ({ t: h.t, score: scoreHour(h, ctx).score }));
  const nowInput = inputs.find((h) => h.t >= nowS - 1800) ?? inputs[0];
  const current = nowInput ? scoreHour(nowInput, ctx) : { score: 0, reasons: [] };

  // Meilleur créneau de 2 heures, aujourd'hui (ou demain après 17 h)
  const targetDay = sydneyHour(nowS) >= 17 ? sydneyDay(nowS + 86400) : sydneyDay(nowS);
  const day = hours.filter((h) => sydneyDay(h.t) === targetDay && h.t >= nowS - 3600);
  let best: Beach["best"] = null;
  for (let i = 0; i + 1 < day.length; i++) {
    const s = (day[i].score + day[i + 1].score) / 2;
    if (!best || s > best.score) best = { start: day[i].t, end: day[i + 1].t + 3600, score: Math.round(s * 10) / 10 };
  }
  const w = weather.current;
  const side = windSide(w.windDir);
  const hs = buoyNow?.hs ?? marine?.hourly[0]?.swellHeight ?? null;
  const seaLabel = hs == null ? "Unknown" : hs < 0.5 ? "Flat" : side === "onshore" && w.wind >= 20 ? "Choppy and messy" : hs > 2.5 ? "Big and powerful" : side === "offshore" ? "Clean" : "Moderate";
  return {
    score: current.score, label: label(current.score), reasons: current.reasons, best, hours,
    sea: { label: seaLabel, surfM: hs == null ? null : Math.round(hs * NEARSHORE * 10) / 10, periodS: buoyNow?.tp ?? marine?.hourly[0]?.swellPeriod ?? null, dir: buoyNow?.dir ?? marine?.hourly[0]?.swellDir ?? null, wind: `${side}, ${Math.round(w.wind)} km/h` },
    bluebottles, afterRain, waterTemp: marine?.hourly[0]?.sst ?? null,
  };
}
