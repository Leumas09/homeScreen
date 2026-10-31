// Ce que le ciel de Maroubra offre dans les prochaines 24 h, calculé localement
// avec @maroubra/sky (vérifié contre Skyfield + JPL DE421).
import {
  astronomy as A,
  darkSkyWindows,
  horizontal,
  inSeaSector,
  MAROUBRA,
  moonIllumination,
  moonPhaseAngle,
  moonriseOverSea,
  riseSet,
  sunAltitudeCrossing,
  visiblePlanets,
  type VisiblePlanet,
  type Window,
} from "@maroubra/sky";

export interface Moment {
  at: Date;
  title: string;
  detail: string;
  kind: "sun" | "moon" | "dark" | "planet";
}

export interface TrackPoint {
  t: Date;
  alt: number;
  az: number;
}

export interface SkyModel {
  now: Date;
  isNight: boolean;
  sunAltNow: number;
  sun: { rise: Date | null; set: Date | null; goldenEvening: Date | null; civilDusk: Date | null; astroDusk: Date | null; nextRise: Date | null; civilDawn: Date | null };
  moon: { rise: Date | null; set: Date | null; riseAz: number | null; riseOverSea: boolean; illumination: number; phase: string; altNow: number; nextFull: Date; nextNew: Date };
  dark: Window[];
  planets: VisiblePlanet[];
  planetsAt: Date;
  moonriseOverSeaNext: { time: Date; azimuth: number; illumination: number }[];
  moments: Moment[];
  tracks: { sun: TrackPoint[]; moon: TrackPoint[]; planets: Record<string, TrackPoint[]> };
}

export function phaseName(angle: number): string {
  const names = ["New moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full moon", "Waning gibbous", "Last quarter", "Waning crescent"];
  return names[Math.round(angle / 45) % 8];
}

function track(body: A.Body, from: Date, hours: number, stepMin = 10): TrackPoint[] {
  const out: TrackPoint[] = [];
  for (let m = 0; m <= hours * 60; m += stepMin) {
    const t = new Date(from.getTime() + m * 60e3);
    out.push({ t, ...horizontal(body, t) });
  }
  return out;
}

export function computeSky(now: Date): SkyModel {
  const dayStart = new Date(now.getTime() - 6 * 3600e3);
  const sunAltNow = horizontal(A.Body.Sun, now).alt;
  const sunRS = riseSet(A.Body.Sun, dayStart);
  const set = sunRS.set && sunRS.set > dayStart ? sunRS.set : null;
  const goldenEvening = set ? sunAltitudeCrossing(6, -1, new Date(set.getTime() - 3 * 3600e3)) : null;
  const civilDusk = sunAltitudeCrossing(-6, -1, dayStart);
  const astroDusk = sunAltitudeCrossing(-18, -1, dayStart);
  const nextRise = riseSet(A.Body.Sun, now).rise;
  const civilDawn = sunAltitudeCrossing(-6, +1, now);

  const moonRS = riseSet(A.Body.Moon, dayStart);
  const riseAz = moonRS.rise ? horizontal(A.Body.Moon, moonRS.rise).az : null;
  const phaseAngle = moonPhaseAngle(now);

  const dark = darkSkyWindows(now, 24);
  // Planètes à l'heure où on les regarde vraiment : la nuit tombée, ou maintenant s'il fait déjà nuit
  const planetsAt = sunAltNow < -12 ? now : civilDusk && civilDusk > now ? new Date(civilDusk.getTime() + 45 * 60e3) : now;
  const planets = visiblePlanets(planetsAt);

  // Levers de Lune sur la mer dans les 30 prochains jours
  const moonriseOverSeaNext: SkyModel["moonriseOverSeaNext"] = [];
  let cursor = dayStart;
  for (let i = 0; i < 31 && moonriseOverSeaNext.length < 3; i++) {
    const r = riseSet(A.Body.Moon, cursor).rise;
    if (!r) { cursor = new Date(cursor.getTime() + 86400e3); continue; }
    const m = moonriseOverSea(new Date(r.getTime() - 60e3));
    if (m && m.time > dayStart) moonriseOverSeaNext.push(m);
    cursor = new Date(r.getTime() + 3600e3);
  }

  const moments: Moment[] = [];
  const horizon = now.getTime() + 24 * 3600e3;
  const add = (m: Moment | null) => { if (m && m.at.getTime() >= now.getTime() - 15 * 60e3 && m.at.getTime() <= horizon) moments.push(m); };
  if (goldenEvening) add({ at: goldenEvening, title: "Golden hour", detail: "Warm, low light until sunset", kind: "sun" });
  if (set) add({ at: set, title: "Sunset", detail: "Behind the city, to the west", kind: "sun" });
  if (nextRise) add({ at: nextRise, title: "Sunrise over the sea", detail: `Rises ${horizontal(A.Body.Sun, nextRise).az.toFixed(0)}° from north`, kind: "sun" });
  for (const w of dark) add({ at: w.start, title: "Dark sky", detail: `No Sun, no Moon until ${new Intl.DateTimeFormat("en-AU", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Australia/Sydney" }).format(w.end)}`, kind: "dark" });
  const m0 = moonriseOverSeaNext[0];
  if (m0) add({ at: m0.time, title: "Moonrise over the sea", detail: `${Math.round(m0.illumination * 100)}% lit, a path of light on the water`, kind: "moon" });
  else if (moonRS.rise) add({ at: moonRS.rise, title: "Moonrise", detail: `${Math.round(moonIllumination(moonRS.rise) * 100)}% lit`, kind: "moon" });
  if (planets[0]) add({ at: planetsAt, title: `${planets[0].name} is up`, detail: `Brightest planet tonight, ${planets[0].alt.toFixed(0)}° high`, kind: "planet" });
  moments.sort((a, b) => a.at.getTime() - b.at.getTime());

  return {
    now,
    isNight: sunAltNow < -6,
    sunAltNow,
    sun: { rise: sunRS.rise, set, goldenEvening, civilDusk, astroDusk, nextRise, civilDawn },
    moon: {
      rise: moonRS.rise,
      set: moonRS.set,
      riseAz,
      riseOverSea: riseAz != null && inSeaSector(riseAz),
      illumination: moonIllumination(now),
      phase: phaseName(phaseAngle),
      altNow: horizontal(A.Body.Moon, now).alt,
      nextFull: A.SearchMoonPhase(180, now, 40)!.date,
      nextNew: A.SearchMoonPhase(0, now, 40)!.date,
    },
    dark,
    planets,
    planetsAt,
    moonriseOverSeaNext,
    moments,
    tracks: {
      sun: track(A.Body.Sun, now, 24, 15),
      moon: track(A.Body.Moon, now, 24, 15),
      planets: Object.fromEntries(planets.map((p) => [p.name, track(p.name as A.Body, now, 12, 15)])),
    },
  };
}

export const SITE = MAROUBRA;
