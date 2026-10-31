import { shortDate, time } from "../lib/format";
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

export function Tide({ table, now }: { table: TideTable | null; now: Date }) {
  const t = table && tideNow(table, now);
  return (
    <section aria-labelledby="tide-title" style={{ display: "grid", gap: 16 }}>
      <div className="card">
        <h1 id="tide-title" style={{ margin: "0 0 8px", fontSize: 15, color: "var(--muted)" }}>Tide at Maroubra</h1>
        {t ? (
          <p className="lede">
            {t.rising ? "Rising" : "Falling"}, {t.next.kind} tide at {time(t.next.t)} ({signed(t.next.h)}). Now {signed(t.height)}.
          </p>
        ) : <p className="lede muted">{table ? "Outside the computed tide table." : "Loading the tide table."}</p>}
      </div>
      {table && (
        <div className="card chart-scroll" style={{ padding: 12 }}>
          <TideChart table={table} now={now} />
        </div>
      )}
      {t && (
        <div className="grid">
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
          </div>
          <div className="card">
            <h2>How this is computed</h2>
            <p style={{ margin: 0, lineHeight: 1.5 }}>
              Our own harmonic analysis of 4 years of bottom pressure at the IMOS ocean reference station off Bondi, 7 km north.
              No tide API involved. Checked on 2025, a year it never saw: high and low water heights within 3 cm on average.
            </p>
            <p className="note">Heights are relative to mean sea level, not to chart datum. Times could not be checked closer than ±14 min with this sensor; a one-minute tide gauge will settle it.</p>
          </div>
        </div>
      )}
    </section>
  );
}
