import type { Buoy, Marine, SourceEntry } from "@maroubra/core";
import { CardHead, Empty, Fresh } from "../components/bits";
import { compass, shortDate, time } from "../lib/format";
import { curve, tideNow, type TideTable } from "../lib/tide";

const W = 1000;
const H = 240;
const P = 30;

function TideChart({ table, now }: { table: TideTable; now: Date }) {
  const from = new Date(now.getTime() - 6 * 3600e3);
  const pts = curve(table, from, 30);
  if (pts.length < 2) return null;
  const hMin = -1.1, hMax = 1.3;
  const x = (t: Date) => P + ((t.getTime() - from.getTime()) / (30 * 3600e3)) * (W - 2 * P);
  const y = (h: number) => H - P - ((h - hMin) / (hMax - hMin)) * (H - 2 * P);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.h).toFixed(1)}`).join(" ");
  const area = `${line} L${x(pts.at(-1)!.t)},${H - P} L${x(pts[0].t)},${H - P} Z`;
  const shown = table.extrema.filter((e) => e.t >= from && e.t <= pts.at(-1)!.t);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Tide height over the next 24 hours">
      <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} stroke="var(--line)" strokeDasharray="4 6" />
      <text x={P} y={y(0) - 6} fontSize="12" fill="var(--muted)">mean sea level</text>
      <path d={area} fill="var(--sea)" opacity="0.7" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="3" />
      <line x1={x(now)} x2={x(now)} y1={P - 10} y2={H - P} stroke="var(--alert)" strokeWidth="1.5" strokeDasharray="3 3" />
      <text x={x(now) + 6} y={P} fontSize="12" fontWeight="700" fill="var(--alert)">now</text>
      {shown.map((e) => (
        <g key={e.t.toISOString()}>
          <circle cx={x(e.t)} cy={y(e.h)} r="5" fill="var(--accent)" />
          <text x={x(e.t)} y={e.kind === "high" ? y(e.h) - 12 : y(e.h) + 22} textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--ink)">
            {time(e.t)}
          </text>
        </g>
      ))}
    </svg>
  );
}

const signed = (h: number) => `${h >= 0 ? "+" : "−"}${Math.abs(h).toFixed(2)} m`;

type E<T> = (SourceEntry<T> & { stale: boolean; ageMin: number | null }) | null;

/** Houle mesurée à la bouée (48 h passées) puis prévue (5 jours), sur le même axe. */
function SwellChart({ buoy, marine, now }: { buoy: Buoy | null; marine: Marine | null; now: Date }) {
  const obs = (buoy?.series ?? []).map((o) => ({ t: o.t * 1000, h: o.hs ?? 0 }));
  const fc = (marine?.hourly ?? []).filter((h) => h.t * 1000 >= now.getTime() - 3600e3).slice(0, 120).map((h) => ({ t: h.t * 1000, h: h.swellHeight ?? h.waveHeight ?? 0 }));
  if (obs.length + fc.length < 2) return null;
  const W = 1000, H = 200, P = 34;
  const t0 = now.getTime() - 48 * 3600e3, t1 = now.getTime() + 120 * 3600e3;
  const hi = Math.max(2, ...obs.map((o) => o.h), ...fc.map((f) => f.h)) * 1.15;
  const x = (t: number) => P + ((t - t0) / (t1 - t0)) * (W - 2 * P);
  const y = (h: number) => H - 28 - (h / hi) * (H - 50);
  const line = (pts: { t: number; h: number }[]) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.h).toFixed(1)}`).join(" ");
  const ticks = Array.from({ length: 8 }, (_, i) => t0 + i * 24 * 3600e3);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Swell height measured at the buoy over two days, then forecast for five days">
      {[1, 2, 3].filter((m) => m < hi).map((m) => (
        <g key={m}><line x1={P} x2={W - P} y1={y(m)} y2={y(m)} stroke="var(--line)" strokeDasharray="3 6" /><text x={4} y={y(m) + 4} fontSize="12" fill="var(--muted)">{m} m</text></g>
      ))}
      <path d={line(obs)} fill="none" stroke="var(--ink)" strokeWidth="2.5" />
      <path d={line(fc)} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeDasharray="6 5" />
      <line x1={x(now.getTime())} x2={x(now.getTime())} y1={12} y2={H - 28} stroke="var(--alert)" strokeDasharray="3 3" />
      <text x={x(now.getTime()) - 6} y={20} textAnchor="end" fontSize="12" fontWeight="700" fill="var(--ink)">measured</text>
      <text x={x(now.getTime()) + 6} y={20} fontSize="12" fontWeight="700" fill="var(--accent)">forecast</text>
      {ticks.map((t) => <text key={t} x={x(t)} y={H - 8} textAnchor="middle" fontSize="12" fill="var(--muted)">{shortDate(new Date(t)).split(",")[0]}</text>)}
    </svg>
  );
}

export function Sea({ table, now, buoy, marine }: { table: TideTable | null; now: Date; buoy: E<Buoy>; marine: E<Marine> }) {
  const t = table && tideNow(table, now);
  const b = buoy?.data?.latest;
  const sst = marine?.data?.hourly[0]?.sst;
  return (
    <section aria-labelledby="tide-title" style={{ display: "grid", gap: 16 }}>
      <div className="card">
        <h1 id="tide-title" style={{ margin: "0 0 8px", fontSize: 15, color: "var(--muted)" }}>The sea at Maroubra</h1>
        {t ? (
          <p className="lede">
            Tide {t.rising ? "rising" : "falling"}, {t.next.kind} at {time(t.next.t)} ({signed(t.next.h)}).
            {b?.hs != null ? ` Swell ${b.hs.toFixed(1)} m every ${b.tp ? Math.round(b.tp) : "?"} s from the ${b.dir != null ? compass(b.dir) : "?"} at the buoy.` : ""}
            {sst != null ? ` Water ${sst.toFixed(1)}°C.` : ""}
          </p>
        ) : <p className="lede muted">{table ? "Outside the computed tide table." : "Loading the tide table."}</p>}
      </div>
      {table && (
        <div className="card chart-scroll" style={{ padding: 12 }}>
          <TideChart table={table} now={now} />
        </div>
      )}
      <div className="card chart-scroll" style={{ padding: 12 }}>
        <SwellChart buoy={buoy?.data ?? null} marine={marine?.data ?? null} now={now} />
      </div>
      <div className="grid">
        <div className="card">
          <CardHead title="Sydney buoy"><Fresh e={buoy} label="Reading" /></CardHead>
          {b ? (
            <dl className="kv">
              <dt>Significant height</dt><dd>{b.hs?.toFixed(2) ?? "n/a"} m</dd>
              <dt>Biggest wave</dt><dd>{b.hmax?.toFixed(1) ?? "n/a"} m</dd>
              <dt>Peak period</dt><dd>{b.tp != null ? `${b.tp.toFixed(1)} s` : "n/a"}</dd>
              <dt>From</dt><dd>{b.dir != null ? `${compass(b.dir)} (${Math.round(b.dir)}°)` : "n/a"}</dd>
              <dt>Measured at</dt><dd>{time(new Date(b.t * 1000))}</dd>
            </dl>
          ) : <Empty>No recent buoy reading.</Empty>}
          <p className="note">Waverider buoy about 10 km off Long Reef, north of the Harbour, run by Manly Hydraulics Laboratory, data via the Australian Ocean Data Network.</p>
        </div>
        {t && (
          <div className="card">
            <h2>Next highs and lows</h2>
            <ul className="list">
              {t.after.map((e) => (
                <li key={e.t.toISOString()}>
                  <span className="when">{time(e.t)}</span>
                  <span>{e.kind === "high" ? "High" : "Low"}, {signed(e.h)} <span className="muted">{shortDate(e.t)}</span></span>
                </li>
              ))}
            </ul>
            <p className="note">
              Our own harmonic analysis of the IMOS ocean reference station off Bondi; heights checked to 3 cm on a year it never saw.
              Heights are relative to mean sea level, not chart datum.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
