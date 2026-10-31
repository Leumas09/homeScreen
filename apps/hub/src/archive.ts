// Archive des prévisions émises et des observations, dès le premier jour : c'est la matière du
// Track record en production (on ne peut pas vérifier après coup ce qu'on n'a pas gardé).
import type { Buoy, Marine, Metar, Weather } from "@maroubra/core";
import type { TableClient } from "@azure/data-tables";
import type { Store } from "./store";

const hourKey = (d: Date) => d.toISOString().slice(0, 13).replace(/[-T]/g, "");

export async function archiveHour(table: TableClient | null, store: Store, now = new Date()) {
  if (!table) return 0;
  const run = hourKey(now);
  const rows: { partitionKey: string; rowKey: string; [k: string]: unknown }[] = [];
  const w = store.data<Weather>("weather");
  for (const h of w?.hourly.slice(0, 49) ?? []) {
    rows.push({ partitionKey: `fc-openmeteo-${run.slice(0, 8)}`, rowKey: `${run}-${h.t}`, issued: run, valid: h.t, temp: h.temp, wind: h.wind, windDir: h.windDir, gust: h.gust, precip: h.precip, pop: h.pop ?? -1, cloud: h.cloud });
  }
  const m = store.data<Marine>("marine");
  for (const h of m?.hourly.slice(0, 49) ?? []) {
    rows.push({ partitionKey: `fc-marine-${run.slice(0, 8)}`, rowKey: `${run}-${h.t}`, issued: run, valid: h.t, hs: h.waveHeight ?? -1, swell: h.swellHeight ?? -1, tp: h.swellPeriod ?? -1, sst: h.sst ?? -1 });
  }
  const o = store.data<Metar>("metar");
  if (o) rows.push({ partitionKey: `obs-yssy-${run.slice(0, 6)}`, rowKey: String(o.t), temp: o.temp ?? -99, windKt: o.windKt ?? -1, windDir: o.windDir ?? -1, raw: o.raw });
  const b = store.data<Buoy>("buoy")?.latest;
  if (b) rows.push({ partitionKey: `obs-buoy-${run.slice(0, 6)}`, rowKey: String(b.t), hs: b.hs ?? -1, tp: b.tp ?? -1, dir: b.dir ?? -1 });
  let n = 0;
  for (const r of rows) {
    try { await table.upsertEntity(r, "Replace"); n++; } catch (err) { console.error(JSON.stringify({ event: "archive_failed", error: String(err) })); break; }
  }
  return n;
}
