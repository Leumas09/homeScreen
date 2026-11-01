import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { heightAt, tideNow, type TideTable } from "../src/lib/tide";

const raw = JSON.parse(readFileSync(new URL("../public/data/tide-ors065.json", import.meta.url), "utf8"));
const table: TideTable = {
  source: raw.source,
  verified: raw.verified,
  extrema: raw.extrema.map(([t, h, k]: [string, number, string]) => ({ t: new Date(t), h, kind: k === "h" ? "high" : "low" })),
};

describe("table des marées", () => {
  it("alterne pleines et basses mers, 3 à 4 par jour", () => {
    const ex = table.extrema;
    for (let i = 1; i < ex.length; i++) expect(ex[i].kind).not.toBe(ex[i - 1].kind);
    const days = (ex.at(-1)!.t.getTime() - ex[0].t.getTime()) / 86400e3;
    expect(ex.length / days).toBeGreaterThan(3.7);
    expect(ex.length / days).toBeLessThan(4.0);
  });

  it("vaut l'extremum aux pleines et basses mers, et reste entre deux", () => {
    const ex = table.extrema.slice(0, 200);
    for (let i = 0; i < ex.length - 1; i++) {
      expect(heightAt(table, ex[i].t)).toBeCloseTo(ex[i].h, 6);
      const mid = heightAt(table, new Date((ex[i].t.getTime() + ex[i + 1].t.getTime()) / 2))!;
      expect(mid).toBeGreaterThanOrEqual(Math.min(ex[i].h, ex[i + 1].h));
      expect(mid).toBeLessThanOrEqual(Math.max(ex[i].h, ex[i + 1].h));
    }
  });

  it("dit si la mer monte et annonce le prochain extremum", () => {
    const e = table.extrema[10];
    const t = tideNow(table, new Date(e.t.getTime() - 3600e3))!;
    expect(t.next.t).toEqual(e.t);
    expect(t.rising).toBe(e.kind === "high");
  });
});
