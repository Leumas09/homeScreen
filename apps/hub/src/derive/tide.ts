// Table des marées calculée par analyse harmonique (bench/tide.py), lue depuis les fichiers de l'app.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface TideExtremum { t: number; h: number; kind: "high" | "low" }

export function loadTide(staticDir: string): TideExtremum[] {
  const p = join(staticDir, "data", "tide-ors065.json");
  if (!existsSync(p)) return [];
  const j = JSON.parse(readFileSync(p, "utf8")) as { extrema: [string, number, string][] };
  return j.extrema.map(([t, h, k]) => ({ t: Date.parse(t) / 1000, h, kind: k === "h" ? "high" : "low" }));
}

/** Minutes jusqu'à la basse mer la plus proche (passée ou à venir). */
export function minutesFromLow(tide: TideExtremum[], tS: number): number | null {
  let best: number | null = null;
  for (const e of tide) {
    if (e.kind !== "low") continue;
    const d = Math.abs(e.t - tS) / 60;
    if (best == null || d < best) best = d;
    if (e.t > tS + 86400) break;
  }
  return best;
}
