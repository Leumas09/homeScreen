// Moteur du ciel de Maroubra : éphémérides calculées localement (astronomy-engine),
// sans aucun appel réseau. Vérifié contre Skyfield + JPL DE421 (test/skyfield.test.ts).
import * as A from "astronomy-engine";

export interface Site {
  lat: number;
  lon: number;
  /** Altitude de l'œil au-dessus de la mer, pour l'abaissement de l'horizon marin. */
  eyeHeightM: number;
  /** Secteur d'azimut (degrés) où l'horizon est la mer. Hypothèse à mesurer sur carte. */
  seaAzimuth: [number, number];
}

export const MAROUBRA: Site = {
  lat: -33.9496,
  lon: 151.2577,
  eyeHeightM: 0,
  // Hypothèse : de la pointe nord (vers Lurline Bay) au cap sud (Mahon Pool).
  seaAzimuth: [40, 160],
};

const observer = (s: Site) => new A.Observer(s.lat, s.lon, 0);

export interface RiseSet {
  rise: Date | null;
  set: Date | null;
}

/** Prochain lever ou coucher après `from`, sur une fenêtre d'un jour. */
export function riseSet(body: A.Body, from: Date, site: Site = MAROUBRA): RiseSet {
  const o = observer(site);
  const rise = A.SearchRiseSet(body, o, +1, from, 1, site.eyeHeightM);
  const set = A.SearchRiseSet(body, o, -1, from, 1, site.eyeHeightM);
  return { rise: rise?.date ?? null, set: set?.date ?? null };
}

/** Prochain passage du centre du Soleil à `altitude` degrés, en montée (+1) ou en descente (-1). */
export function sunAltitudeCrossing(altitude: number, direction: 1 | -1, from: Date, site: Site = MAROUBRA): Date | null {
  return A.SearchAltitude(A.Body.Sun, observer(site), direction, from, 1, altitude)?.date ?? null;
}

export interface Horizontal {
  alt: number;
  az: number;
}

export function horizontal(body: A.Body, at: Date, site: Site = MAROUBRA): Horizontal {
  const o = observer(site);
  const eq = A.Equator(body, at, o, true, true);
  const h = A.Horizon(at, o, eq.ra, eq.dec, "normal");
  return { alt: h.altitude, az: h.azimuth };
}

export function moonIllumination(at: Date): number {
  return A.Illumination(A.Body.Moon, at).phase_fraction;
}

/** Phase en degrés : 0 nouvelle lune, 90 premier quartier, 180 pleine lune, 270 dernier quartier. */
export function moonPhaseAngle(at: Date): number {
  return A.MoonPhase(at);
}

export function inSeaSector(az: number, site: Site = MAROUBRA): boolean {
  const [a, b] = site.seaAzimuth;
  return az >= a && az <= b;
}

export interface MoonriseOverSea {
  time: Date;
  azimuth: number;
  illumination: number;
  /** Minutes entre le coucher du Soleil et le lever de la Lune (négatif : la Lune se lève avant). */
  afterSunsetMin: number;
}

/**
 * Lever de Lune visible sur la mer : la Lune sort de l'océan dans le secteur marin,
 * assez éclairée pour tracer un chemin sur l'eau, et le ciel est déjà sombre ou presque.
 */
export function moonriseOverSea(from: Date, site: Site = MAROUBRA, minIllum = 0.6): MoonriseOverSea | null {
  const { rise } = riseSet(A.Body.Moon, from, site);
  if (!rise) return null;
  const az = horizontal(A.Body.Moon, rise, site).az;
  const illum = moonIllumination(rise);
  const dayStart = new Date(rise.getTime() - 12 * 3600e3);
  const sunset = riseSet(A.Body.Sun, dayStart, site).set;
  const afterSunsetMin = sunset ? (rise.getTime() - sunset.getTime()) / 60e3 : NaN;
  if (!inSeaSector(az, site) || illum < minIllum || afterSunsetMin < -30) return null;
  return { time: rise, azimuth: az, illumination: illum, afterSunsetMin };
}

export interface Window {
  start: Date;
  end: Date;
}

/**
 * Fenêtres de nuit noire entre `from` et `from + hours` : Soleil sous -18° et Lune
 * sous l'horizon (ou presque nouvelle). Échantillonnage à la minute, suffisant pour l'affichage.
 */
export function darkSkyWindows(from: Date, hours = 24, site: Site = MAROUBRA): Window[] {
  const out: Window[] = [];
  let open: Date | null = null;
  const stepMs = 60e3;
  for (let t = from.getTime(); t <= from.getTime() + hours * 3600e3; t += stepMs) {
    const at = new Date(t);
    const dark =
      horizontal(A.Body.Sun, at, site).alt < -18 &&
      (horizontal(A.Body.Moon, at, site).alt < 0 || moonIllumination(at) < 0.05);
    if (dark && !open) open = at;
    if (!dark && open) {
      out.push({ start: open, end: at });
      open = null;
    }
  }
  if (open) out.push({ start: open, end: new Date(from.getTime() + hours * 3600e3) });
  return out;
}

export interface VisiblePlanet {
  name: string;
  alt: number;
  az: number;
  magnitude: number;
}

const PLANETS = [A.Body.Mercury, A.Body.Venus, A.Body.Mars, A.Body.Jupiter, A.Body.Saturn];

/** Planètes au-dessus de `minAlt` degrés à l'instant donné, les plus brillantes d'abord. */
export function visiblePlanets(at: Date, site: Site = MAROUBRA, minAlt = 10): VisiblePlanet[] {
  return PLANETS.map((b) => ({ name: b, ...horizontal(b, at, site), magnitude: A.Illumination(b, at).mag }))
    .filter((p) => p.alt >= minAlt)
    .sort((a, b) => a.magnitude - b.magnitude);
}

export { A as astronomy };
