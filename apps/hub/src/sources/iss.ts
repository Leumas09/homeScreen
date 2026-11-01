// Passages visibles de la Station spatiale internationale au-dessus de Maroubra.
// Éléments orbitaux Celestrak (TLE), propagation SGP4 (satellite.js). Un passage est « visible »
// quand la station dépasse 10° de hauteur, qu'elle est éclairée par le Soleil et que le ciel est sombre.
import type { Iss, IssPass } from "@maroubra/core";
import { astronomy as A, horizontal } from "@maroubra/sky";
import * as sat from "satellite.js";
import { SITE } from "../config";
import { fetchText } from "../http";
import type { Collector } from "../collector";

const EARTH_KM = 6378.137;
const AU_KM = 149_597_870.7;

/** Ombre cylindrique de la Terre : précise à quelques secondes près pour l'entrée en éclipse. */
export function sunlit(posKm: { x: number; y: number; z: number }, at: Date): boolean {
  const s = A.GeoVector(A.Body.Sun, at, false);
  const sx = s.x * AU_KM, sy = s.y * AU_KM, sz = s.z * AU_KM;
  const sn = Math.hypot(sx, sy, sz);
  const ux = sx / sn, uy = sy / sn, uz = sz / sn;
  const dot = posKm.x * ux + posKm.y * uy + posKm.z * uz;
  if (dot > 0) return true;
  const px = posKm.x - dot * ux, py = posKm.y - dot * uy, pz = posKm.z - dot * uz;
  return Math.hypot(px, py, pz) > EARTH_KM;
}

export function passes(tle: [string, string], from: Date, hours = 72, stepS = 20): IssPass[] {
  const rec = sat.twoline2satrec(tle[0], tle[1]);
  const obs = { latitude: sat.degreesToRadians(SITE.lat), longitude: sat.degreesToRadians(SITE.lon), height: 0.01 };
  const out: IssPass[] = [];
  let cur: { start: Date; max: Date; maxAlt: number; startAz: number; endAz: number; end: Date } | null = null;
  for (let t = from.getTime(); t <= from.getTime() + hours * 3600e3; t += stepS * 1000) {
    const at = new Date(t);
    const pv = sat.propagate(rec, at);
    if (!pv || !pv.position || typeof pv.position === "boolean") continue;
    const ecf = sat.eciToEcf(pv.position, sat.gstime(at));
    const look = sat.ecfToLookAngles(obs, ecf);
    const alt = sat.radiansToDegrees(look.elevation);
    const az = (sat.radiansToDegrees(look.azimuth) + 360) % 360;
    const visible = alt >= 10 && sunlit(pv.position, at) && horizontal(A.Body.Sun, at).alt < -6;
    if (visible) {
      if (!cur) cur = { start: at, max: at, maxAlt: alt, startAz: az, endAz: az, end: at };
      if (alt > cur.maxAlt) { cur.maxAlt = alt; cur.max = at; }
      cur.end = at;
      cur.endAz = az;
    } else if (cur) {
      if ((cur.end.getTime() - cur.start.getTime()) / 60e3 >= 1) {
        out.push({
          start: cur.start.toISOString(), max: cur.max.toISOString(), end: cur.end.toISOString(), maxAlt: Math.round(cur.maxAlt),
          startAz: Math.round(cur.startAz), endAz: Math.round(cur.endAz), durationMin: Math.round((cur.end.getTime() - cur.start.getTime()) / 60e3),
        });
      }
      cur = null;
    }
  }
  return out;
}

export function issCollector(): Collector<Iss> {
  let tle: { lines: [string, string]; at: number } | null = null;
  return {
    id: "iss",
    everyMs: 30 * 60e3,
    staleAfterMs: 24 * 3600e3,
    run: async ({ now }) => {
      if (!tle || now.getTime() - tle.at > 6 * 3600e3) {
        const txt = (await fetchText("https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE")).trim().split(/\r?\n/);
        const l1 = txt.find((l) => l.startsWith("1 "));
        const l2 = txt.find((l) => l.startsWith("2 "));
        if (!l1 || !l2) throw new Error("TLE ISS illisible");
        tle = { lines: [l1, l2], at: now.getTime() };
      }
      const rec = sat.twoline2satrec(tle.lines[0], tle.lines[1]);
      const epochMs = Date.UTC(2000 + (rec.epochyr % 100), 0, 1) + (rec.epochdays - 1) * 86400e3;
      return { passes: passes(tle.lines, now), tleEpoch: new Date(epochMs).toISOString() };
    },
  };
}
