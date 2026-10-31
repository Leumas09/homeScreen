// Le brief : une ou deux phrases en tête d'écran. Rédigé par le modèle à partir des seuls faits
// calculés ; s'il n'est pas joignable, une version par règles prend le relais.
import type { Beach, Brief, Moment, Weather } from "@maroubra/core";
import type { Llm } from "../llm";

export interface BriefFacts {
  localTime: string;
  weather?: { now: string; tempC: number; feelsC: number; windKmh: number; windFrom: number; maxToday: number; rainChanceToday: number | null } | null;
  beach?: { score: number; label: string; best: string | null; sea: string; waterC: number | null } | null;
  tide?: { next: string } | null;
  moments: { title: string; detail: string }[];
}

const WMO: Record<number, string> = { 0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "overcast", 45: "foggy", 48: "foggy", 51: "light drizzle", 53: "drizzle", 55: "heavy drizzle", 61: "light rain", 63: "rain", 65: "heavy rain", 80: "showers", 81: "showers", 82: "heavy showers", 95: "thunderstorms", 96: "thunderstorms with hail", 99: "thunderstorms with hail" };
export const describe = (code: number) => WMO[code] ?? "changeable";

export function facts(w: Weather | null, b: Beach | null, tideNext: string | null, ms: Moment[], now = new Date()): BriefFacts {
  const localDay = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(t);
  const today = w?.daily.find((d) => localDay(d.t * 1000) === localDay(now.getTime())) ?? w?.daily[0];
  const hm = (d: number) => new Intl.DateTimeFormat("en-AU", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Australia/Sydney" }).format(d);
  return {
    localTime: new Intl.DateTimeFormat("en-AU", { weekday: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Australia/Sydney" }).format(now),
    weather: w ? { now: describe(w.current.code), tempC: Math.round(w.current.temp), feelsC: Math.round(w.current.feels), windKmh: Math.round(w.current.wind), windFrom: Math.round(w.current.windDir), maxToday: Math.round(today?.max ?? w.current.temp), rainChanceToday: today?.pop ?? null } : null,
    beach: b ? { score: b.score, label: b.label, best: b.best ? `${hm(b.best.start * 1000)} to ${hm(b.best.end * 1000)} (${b.best.score}/10)` : null, sea: b.sea.label, waterC: b.waterTemp == null ? null : Math.round(b.waterTemp) } : null,
    tide: tideNext ? { next: tideNext } : null,
    moments: ms.slice(0, 4).map((m) => ({ title: m.title, detail: m.detail })),
  };
}

export function ruleBrief(f: BriefFacts): string {
  const parts: string[] = [];
  if (f.weather) parts.push(`${f.weather.now[0].toUpperCase()}${f.weather.now.slice(1)}, ${f.weather.tempC}°C, up to ${f.weather.maxToday}°C`);
  if (f.beach) parts.push(f.beach.best && f.beach.score >= 5 ? `Best swim ${f.beach.best}` : `Beach ${f.beach.label.toLowerCase()}, ${f.beach.sea.toLowerCase()} sea`);
  if (f.moments[0]) parts.push(f.moments[0].title);
  return parts.map((x) => `${x}.`).join(" ");
}

const INSTRUCTIONS =
  "You write the one-line brief at the top of a home screen in Maroubra, Sydney, read by a family of four adults and teenagers (youngest 12). " +
  "Use only the facts given, in plain friendly English, Australian spelling, no emoji, no exclamation marks, at most 2 short sentences and 35 words. " +
  "Lead with what is most worth knowing in the next few hours (beach, sky, weather, a notable moment). Never invent numbers or events.";

export async function writeBrief(llm: Llm | null, f: BriefFacts, now = new Date()): Promise<Brief> {
  if (llm) {
    try {
      const text = (await llm.text(INSTRUCTIONS, JSON.stringify(f), 300)).trim();
      if (text) return { text, at: now.toISOString(), by: "model" };
    } catch (err) {
      console.error(JSON.stringify({ event: "brief_failed", error: String(err) }));
    }
  }
  return { text: ruleBrief(f), at: now.toISOString(), by: "rules" };
}
