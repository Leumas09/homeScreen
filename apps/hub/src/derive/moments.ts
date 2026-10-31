// Les « moments » : ce qui vaut le coup dans les prochaines 24 h, et ce qui demande d'agir maintenant.
// Chaque moment a une clé stable (une seule notification par moment) et une avance de notification.
import type { Beach, Fires, Flights, Iss, Moment, SpaceWeather, Sunrise, Weather } from "@maroubra/core";
import { moonriseOverSea } from "@maroubra/sky";
import { compass } from "../geo";

const hm = (d: Date | number) =>
  new Intl.DateTimeFormat("en-AU", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Australia/Sydney" }).format(d);
const day = (d: Date | number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(d);

/** Avance de notification par type (minutes avant le moment). */
export const LEAD_MIN: Record<Moment["kind"], number> = {
  beach: 90, sun: 10 * 60, moon: 30, iss: 15, aurora: 0, fire: 0, rain: 0, plane: 0, dark: 0, planet: 0, sea: 0,
};

export interface MomentInputs {
  weather?: Weather | null;
  beach?: Beach | null;
  sunrise?: Sunrise | null;
  iss?: Iss | null;
  space?: SpaceWeather | null;
  fires?: Fires | null;
  flights?: Flights | null;
}

export function moments(i: MomentInputs, now = new Date()): Moment[] {
  const out: Moment[] = [];
  const nowMs = now.getTime();
  const horizon = nowMs + 24 * 3600e3;
  const within = (t: number) => t >= nowMs - 10 * 60e3 && t <= horizon;

  const b = i.beach?.best;
  if (b && b.score >= 7 && within(b.start * 1000)) {
    out.push({ key: `beach-${day(b.start * 1000)}`, at: new Date(b.start * 1000).toISOString(), kind: "beach", priority: 2,
      title: `Best swim ${hm(b.start * 1000)} to ${hm(b.end * 1000)}`, detail: `Swim score ${b.score}/10 at Maroubra.` });
  }
  const s = i.sunrise;
  if (s && s.score >= 7 && within(Date.parse(s.time))) {
    out.push({ key: `sunrise-${s.date}`, at: s.time, kind: "sun", priority: 3, title: `Sunrise worth getting up for, ${hm(Date.parse(s.time))}`, detail: `${s.score}/10. ${s.why}.` });
  }
  const m = moonriseOverSea(new Date(nowMs - 30 * 60e3));
  if (m && within(m.time.getTime())) {
    out.push({ key: `moon-${day(m.time)}`, at: m.time.toISOString(), kind: "moon", priority: 3,
      title: `Moonrise over the sea at ${hm(m.time)}`, detail: `${Math.round(m.illumination * 100)}% lit, rising ${compass(m.azimuth)}. Look east from the beach.` });
  }
  for (const p of i.iss?.passes ?? []) {
    const t = Date.parse(p.start);
    if (p.maxAlt >= 30 && within(t)) {
      out.push({ key: `iss-${p.start}`, at: p.start, kind: "iss", priority: 2,
        title: `Space Station overhead at ${hm(t)}`, detail: `Bright moving star from ${compass(p.startAz)} to ${compass(p.endAz)}, up to ${p.maxAlt}° high, ${p.durationMin} min.` });
    }
  }
  const sw = i.space;
  if (sw && (sw.aurora === "possible" || sw.aurora === "likely")) {
    out.push({ key: `aurora-${day(now)}`, at: now.toISOString(), kind: "aurora", priority: 1,
      title: sw.aurora === "likely" ? "Aurora likely tonight" : "Aurora possible tonight",
      detail: `Geomagnetic activity Kp ${sw.forecastMax ?? sw.kpNow}. Look low to the south after dark, away from lights; a phone camera sees more than the eye.` });
  }
  for (const f of i.fires?.nearby ?? []) {
    const urgent = (f.alert === "Emergency Warning" || f.alert === "Watch and Act") && f.distKm <= 100;
    if (urgent || (f.smokeTowardUs && f.distKm <= 120)) {
      out.push({ key: `fire-${f.id}-${f.alert}-${f.smokeTowardUs}`, at: now.toISOString(), kind: "fire", priority: urgent ? 1 : 2,
        title: urgent ? `${f.alert}: ${f.title}` : `Smoke may drift our way`, detail: `${f.title}, ${f.distKm} km ${compass(f.bearing)}. ${f.status}.` });
    }
  }
  const w = i.weather;
  if (w) {
    const nowS = nowMs / 1000;
    const h0 = w.hourly.find((h) => h.t <= nowS && h.t > nowS - 3600);
    const h1 = w.hourly.find((h) => h.t > nowS && h.t <= nowS + 3600);
    if (h0 && h1 && h0.precip < 0.1 && h1.precip >= 0.5 && (h1.pop ?? 0) >= 60) {
      out.push({ key: `rain-${h1.t}`, at: new Date(h1.t * 1000).toISOString(), kind: "rain", priority: 2, title: "Rain within the hour", detail: `${h1.precip.toFixed(1)} mm expected around ${hm(h1.t * 1000)}.` });
    }
  }
  for (const a of i.flights?.aircraft ?? []) {
    if (a.interesting && a.overhead && a.overhead.inMin <= 5) {
      out.push({ key: `plane-${a.hex}-${day(now)}`, at: new Date(nowMs + a.overhead.inMin * 60e3).toISOString(), kind: "plane", priority: 2,
        title: `${a.rare ?? a.type ?? "Unusual aircraft"} overhead in ${a.overhead.inMin} min`, detail: `${a.callsign ?? a.reg ?? a.hex}${a.route ? `, ${a.route.codes}` : ""}, ${a.altFt ?? "?"} ft.` });
    }
  }
  return out.sort((x, y) => x.priority - y.priority || Date.parse(x.at) - Date.parse(y.at));
}

/** Moments à notifier maintenant, selon l'avance propre à chaque type. */
export function due(list: Moment[], now = new Date()): Moment[] {
  const n = now.getTime();
  return list.filter((m) => { const t = Date.parse(m.at); return n >= t - LEAD_MIN[m.kind] * 60e3 && n <= t + 15 * 60e3; });
}
