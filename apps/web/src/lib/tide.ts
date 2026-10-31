// Marée de Maroubra : pleines et basses mers issues de l'analyse harmonique (bench/tide.py),
// hauteur entre deux extremums par interpolation en cosinus (forme d'une onde de marée).
export interface Extremum {
  t: Date;
  h: number;
  kind: "high" | "low";
}

export interface TideTable {
  source: string;
  verified: string;
  extrema: Extremum[];
}

export async function loadTide(): Promise<TideTable> {
  const r = await fetch("/data/tide-ors065.json");
  const j = (await r.json()) as { source: string; verified: string; extrema: [string, number, string][] };
  return {
    source: j.source,
    verified: j.verified,
    extrema: j.extrema.map(([t, h, k]) => ({ t: new Date(t), h, kind: k === "h" ? "high" : "low" })),
  };
}

function bracket(table: TideTable, at: Date): [Extremum, Extremum] | null {
  const ex = table.extrema;
  let lo = 0;
  let hi = ex.length - 1;
  if (!ex.length || at < ex[0].t || at > ex[hi].t) return null;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ex[mid].t <= at) lo = mid;
    else hi = mid;
  }
  return [ex[lo], ex[hi]];
}

export function heightAt(table: TideTable, at: Date): number | null {
  const b = bracket(table, at);
  if (!b) return null;
  const [a, c] = b;
  const f = (at.getTime() - a.t.getTime()) / (c.t.getTime() - a.t.getTime());
  return a.h + (c.h - a.h) * (1 - Math.cos(Math.PI * f)) / 2;
}

export interface TideNow {
  height: number;
  rising: boolean;
  next: Extremum;
  after: Extremum[];
}

export function tideNow(table: TideTable, at: Date): TideNow | null {
  const b = bracket(table, at);
  const h = heightAt(table, at);
  if (!b || h == null) return null;
  const i = table.extrema.indexOf(b[1]);
  return { height: h, rising: b[1].kind === "high", next: b[1], after: table.extrema.slice(i, i + 5) };
}

export function curve(table: TideTable, from: Date, hours: number, stepMin = 10): { t: Date; h: number }[] {
  const out: { t: Date; h: number }[] = [];
  for (let m = 0; m <= hours * 60; m += stepMin) {
    const t = new Date(from.getTime() + m * 60e3);
    const h = heightAt(table, t);
    if (h != null) out.push({ t, h });
  }
  return out;
}
