// Score du lever de soleil sur la mer (0 à 10), méthode des photographes : il faut des nuages
// moyens ou hauts près de nous pour « prendre la couleur », et un horizon dégagé de nuages bas
// au large, le long de l'azimut du Soleil, pour que la lumière passe. Expérimental : vérifié
// ensuite par les votes de la famille et la couverture nuageuse satellite à l'heure du lever.
import type { Sunrise } from "@maroubra/core";
import { astronomy as A, horizontal, riseSet } from "@maroubra/sky";
import { SITE } from "../config";
import { destination } from "../geo";
import { fetchJson } from "../http";
import type { Collector } from "../collector";

export const DISTANCES_KM = [0, 30, 80, 150];

export interface CloudAt { low: number; mid: number; high: number }

export function scoreSunrise(points: CloudAt[]): { score: number; label: string; why: string } {
  const [home, near, mid, far] = points;
  const canvasCover = (Math.max(home.mid, home.high) + Math.max(near.mid, near.high)) / 2;
  const canvas = 5 * Math.max(0, 1 - Math.abs(canvasCover - 50) / 50);
  const lowFar = (mid.low + far.low) / 2;
  const clearPath = 2 * (1 - lowFar / 100);
  const overcast = home.low > 70 ? Math.min(3, (home.low - 70) / 10) : 0;
  const score = Math.max(0, Math.min(10, Math.round((3 + canvas + clearPath - overcast) * 10) / 10));
  const why =
    home.low > 70 ? "Low cloud overhead will likely block the colour"
      : lowFar > 60 ? "A bank of low cloud on the sea horizon may hide the sun"
        : canvasCover < 15 ? "Clear sky: a clean sunrise, little colour"
          : canvasCover > 85 ? "Thick cloud layer, colour unlikely"
            : "Broken mid and high cloud with a clear horizon: good chance of colour";
  return { score, label: score >= 7 ? "Worth getting up" : score >= 5 ? "Maybe" : "Skip it", why };
}

export const sunrise: Collector<Sunrise> = {
  id: "sunrise",
  everyMs: 60 * 60e3,
  staleAfterMs: 6 * 3600e3,
  run: async ({ now }) => {
    const rise = riseSet(A.Body.Sun, now).rise;
    if (!rise) throw new Error("no sunrise");
    const az = horizontal(A.Body.Sun, rise).az;
    const pts = DISTANCES_KM.map((d) => destination(SITE.lat, SITE.lon, az, d));
    const q = new URLSearchParams({
      latitude: pts.map((p) => p[0].toFixed(3)).join(","), longitude: pts.map((p) => p[1].toFixed(3)).join(","),
      hourly: "cloud_cover_low,cloud_cover_mid,cloud_cover_high", timeformat: "unixtime", forecast_days: "2", timezone: "Australia/Sydney",
    });
    const res = await fetchJson<{ hourly: { time: number[]; cloud_cover_low: number[]; cloud_cover_mid: number[]; cloud_cover_high: number[] } }[]>(
      `https://api.open-meteo.com/v1/forecast?${q}`,
    );
    const target = Math.round(rise.getTime() / 3600e3) * 3600;
    const clouds = res.map((r) => {
      const i = Math.max(0, r.hourly.time.findIndex((t) => t >= target));
      return { low: r.hourly.cloud_cover_low[i], mid: r.hourly.cloud_cover_mid[i], high: r.hourly.cloud_cover_high[i] };
    });
    const s = scoreSunrise(clouds);
    return {
      date: new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(rise),
      time: rise.toISOString(), score: s.score, label: s.label, why: s.why,
    };
  },
};
