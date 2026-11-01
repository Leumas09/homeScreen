// Juge extérieur : chaque événement calculé par @maroubra/sky est comparé à
// Skyfield + JPL DE421 (fixture générée par bench/sky_reference.py) sur toute l'année 2027.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { astronomy as A, horizontal, MAROUBRA, moonIllumination, riseSet, sunAltitudeCrossing } from "../src/index";

const ref = JSON.parse(readFileSync(new URL("./fixtures/skyfield_2027.json", import.meta.url), "utf8"));
const site = { ...MAROUBRA, eyeHeightM: 0 };

// Objectifs durs (docs/PLAN.md) : levers et couchers à 30 s, positions à 1 minute d'arc.
const MAX_EVENT_S = 30;
const MAX_ARCMIN = 1;

function worst(refTimes: string[], find: (from: Date) => Date | null) {
  const errs = refTimes.map((iso) => {
    const r = new Date(iso);
    const got = find(new Date(r.getTime() - 3 * 3600e3));
    return got ? Math.abs(got.getTime() - r.getTime()) / 1e3 : Infinity;
  });
  return { max: Math.max(...errs), mean: errs.reduce((a, b) => a + b, 0) / errs.length, n: errs.length };
}

const report: Record<string, unknown> = {};

describe("événements solaires et lunaires 2027", () => {
  const cases: [string, (from: Date) => Date | null][] = [
    ["sunrise", (f) => riseSet(A.Body.Sun, f, site).rise],
    ["sunset", (f) => riseSet(A.Body.Sun, f, site).set],
    ["civil_dusk", (f) => sunAltitudeCrossing(-6, -1, f, site)],
    ["astro_dusk", (f) => sunAltitudeCrossing(-18, -1, f, site)],
    ["moonrise", (f) => riseSet(A.Body.Moon, f, site).rise],
    ["moonset", (f) => riseSet(A.Body.Moon, f, site).set],
  ];
  for (const [name, find] of cases) {
    it(`${name} à moins de ${MAX_EVENT_S} s`, () => {
      const w = worst(ref[name], find);
      report[name] = w;
      expect(w.n).toBeGreaterThan(300);
      expect(w.max).toBeLessThan(MAX_EVENT_S);
    });
  }

  it("azimut et éclairement de la Lune à son lever", () => {
    let maxAz = 0;
    let maxIllum = 0;
    ref.moonrise.forEach((iso: string, i: number) => {
      const t = new Date(iso);
      maxAz = Math.max(maxAz, Math.abs(horizontal(A.Body.Moon, t, site).az - ref.moonrise_az[i]) * 60);
      maxIllum = Math.max(maxIllum, Math.abs(moonIllumination(t) - ref.moonrise_illum[i]));
    });
    report.moonrise_az_arcmin = maxAz;
    report.moonrise_illum = maxIllum;
    expect(maxAz).toBeLessThan(MAX_ARCMIN * 2); // au ras de l'horizon, la réfraction domine
    expect(maxIllum).toBeLessThan(0.002);
  });
});

describe("planètes le soir, 2027", () => {
  for (const name of ["Venus", "Mars", "Jupiter", "Saturn"] as const) {
    it(`${name} à moins de ${MAX_ARCMIN}′`, () => {
      let max = 0;
      ref.evening_utc.forEach((iso: string, i: number) => {
        const h = horizontal(A.Body[name], new Date(iso), site);
        if (ref.planets[name].alt[i] < 5) return; // hors de l'horizon utile
        const dAlt = h.alt - ref.planets[name].alt[i];
        const dAz = (h.az - ref.planets[name].az[i]) * Math.cos((h.alt * Math.PI) / 180);
        max = Math.max(max, Math.hypot(dAlt, dAz) * 60);
      });
      report[name] = max;
      expect(max).toBeLessThan(MAX_ARCMIN);
    });
  }
});

describe("rapport", () => {
  it("écrit les écarts mesurés", async () => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    mkdirSync(new URL("../../../bench/results/", import.meta.url), { recursive: true });
    writeFileSync(new URL("../../../bench/results/sky_vs_skyfield.json", import.meta.url), JSON.stringify(report, null, 2));
  });
});
