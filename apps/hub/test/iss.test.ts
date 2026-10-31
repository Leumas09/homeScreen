// Juge extérieur : passages calculés par Skyfield (bench/iss_reference.py) sur un TLE réel de l'ISS.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { passes } from "../src/sources/iss";

const ref = JSON.parse(readFileSync(new URL("./fixtures/iss-passes-skyfield-2018-07.json", import.meta.url), "utf8"));

describe("passages visibles de l'ISS contre Skyfield", () => {
  const mine = passes(ref.tle, new Date("2018-06-26T12:00:00Z"), 15 * 24, 10);
  it("mêmes passages", () => {
    expect(mine.length).toBe(ref.passes.length);
  });
  it("début et culmination à 20 s près, hauteur maximale à 1° près", () => {
    ref.passes.forEach((p: { start: string; max: string; maxAlt: number }, i: number) => {
      expect(Math.abs(Date.parse(mine[i].start) - Date.parse(p.start)) / 1000).toBeLessThanOrEqual(20);
      expect(Math.abs(Date.parse(mine[i].max) - Date.parse(p.max)) / 1000).toBeLessThanOrEqual(20);
      expect(Math.abs(mine[i].maxAlt - p.maxAlt)).toBeLessThanOrEqual(1);
    });
  });
});
