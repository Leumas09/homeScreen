import type { Beach as B, SourceEntry } from "@maroubra/core";
import { CardHead, Empty, Fresh } from "../components/bits";
import { compass, time } from "../lib/format";

type E<T> = (SourceEntry<T> & { stale: boolean; ageMin: number | null }) | null;

function ScoreBars({ b, now }: { b: B; now: Date }) {
  const hrs = b.hours.slice(0, 26);
  if (!hrs.length) return null;
  const W = 1000, H = 170, P = 24;
  const bw = (W - 2 * P) / hrs.length;
  const color = (s: number) => (s >= 8 ? "var(--good)" : s >= 6.5 ? "var(--accent)" : s >= 5 ? "#e0a100" : "var(--alert)");
  let lastDay = "";
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Swim score hour by hour, daylight only">
      {hrs.map((h, i) => {
        const d = new Date(h.t * 1000);
        const day = d.toLocaleDateString("en-AU", { weekday: "short", timeZone: "Australia/Sydney" });
        const showDay = day !== lastDay;
        lastDay = day;
        const hh = (h.score / 10) * (H - 60);
        return (
          <g key={h.t}>
            <rect x={P + i * bw + 3} y={H - 30 - hh} width={bw - 6} height={hh} rx="5" fill={color(h.score)} opacity={h.t * 1000 < now.getTime() - 3600e3 ? 0.35 : 1} />
            <text x={P + i * bw + bw / 2} y={H - 12} textAnchor="middle" fontSize="12" fill="var(--muted)">{time(d).slice(0, 2)}</text>
            {showDay && <text x={P + i * bw + 3} y="14" fontSize="12" fontWeight="700" fill="var(--muted)">{day}</text>}
          </g>
        );
      })}
    </svg>
  );
}

export function Beach({ e, now }: { e: E<B>; now: Date }) {
  const b = e?.data;
  if (!b) return <section className="card"><CardHead title="Beach"><Fresh e={e} /></CardHead><Empty>Waiting for weather and sea data.</Empty></section>;
  const hour = Number(new Intl.DateTimeFormat("en-AU", { hour: "numeric", hourCycle: "h23", timeZone: "Australia/Sydney" }).format(now));
  const daylight = hour >= 7 && hour < 19;
  return (
    <section aria-labelledby="beach-title" style={{ display: "grid", gap: 16 }}>
      <div className="card">
        <CardHead title="Maroubra Beach"><Fresh e={e} label="Computed" /></CardHead>
        <h1 id="beach-title" className="sr-only">Beach</h1>
        {daylight ? (
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
            <span className="huge">{b.score.toFixed(1)}</span>
            <span style={{ fontSize: 24, fontWeight: 800 }}>{b.label}</span>
            <span className="muted">swim score out of 10, right now</span>
          </div>
        ) : <p className="lede" style={{ margin: 0 }}>Beach time is over for today.</p>}
        {b.best && (
          <p className="lede" style={{ marginTop: 10 }}>
            Best window {time(new Date(b.best.start * 1000))} to {time(new Date(b.best.end * 1000))}, {b.best.score}/10.
          </p>
        )}
        {(b.afterRain || b.bluebottles) && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {b.afterRain && <span className="pill miss">Stormwater after rain</span>}
            {b.bluebottles && <span className="pill miss">Bluebottles likely</span>}
          </div>
        )}
      </div>
      <div className="card chart-scroll" style={{ padding: 12 }}><ScoreBars b={b} now={now} /></div>
      <div className="grid">
        <div className="card">
          <h2>{daylight ? "Why this score" : "Conditions now"}</h2>
          <ul className="reasons">
            {b.reasons.map((r) => <li key={r.text} className={r.effect}>{r.text}</li>)}
          </ul>
        </div>
        <div className="card">
          <h2>The water</h2>
          <dl className="kv">
            <dt>Sea</dt><dd>{b.sea.label}</dd>
            <dt>Surf at the beach</dt><dd>{b.sea.surfM != null ? `about ${b.sea.surfM} m` : "n/a"}</dd>
            <dt>Swell period</dt><dd>{b.sea.periodS != null ? `${Math.round(b.sea.periodS)} s` : "n/a"}</dd>
            <dt>Swell from</dt><dd>{b.sea.dir != null ? compass(b.sea.dir) : "n/a"}</dd>
            <dt>Wind</dt><dd>{b.sea.wind}</dd>
            <dt>Water temperature</dt><dd>{b.waterTemp != null ? `${b.waterTemp.toFixed(1)}°C` : "n/a"}</dd>
          </dl>
          <p className="note">
            Always swim between the red and yellow flags. Official patrol status and closures: search Maroubra on <a href="https://beachsafe.org.au/" target="_blank" rel="noreferrer">Beachsafe</a>.
          </p>
        </div>
      </div>
    </section>
  );
}
