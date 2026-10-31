import data from "../data/track-record.json";

interface Check {
  name: string;
  target: string;
  result: string;
  pass: boolean;
  status?: "untestable" | "missed";
  judge: string;
  detail?: string;
}

interface LeadRow { lead: number; raw: number; best: number }

interface Verification {
  title: string;
  unit: string;
  test: string;
  best: string;
  gain: number;
  ci: [number, number];
  target: number;
  methods: { name: string; mae: number }[];
  leads: LeadRow[];
}

const checks = data.checks as Check[];
const verifications = data.verifications as Verification[];

function LeadChart({ v }: { v: Verification }) {
  const W = 520, H = 180, P = 34;
  const max = Math.max(...v.leads.map((l) => l.raw)) * 1.15;
  const xs = (i: number) => P + (i / (v.leads.length - 1)) * (W - 2 * P);
  const ys = (e: number) => H - 24 - (e / max) * (H - 44);
  const line = (k: "raw" | "best") => v.leads.map((l, i) => `${i ? "L" : "M"}${xs(i)},${ys(l[k])}`).join(" ");
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`Mean absolute error by forecast lead time: raw model against ${v.best}`}>
      <line x1={P} x2={W - P} y1={H - 24} y2={H - 24} stroke="var(--line)" />
      <path d={line("raw")} fill="none" stroke="var(--muted)" strokeWidth="2.5" strokeDasharray="5 5" />
      <path d={line("best")} fill="none" stroke="var(--accent)" strokeWidth="3" />
      {v.leads.map((l, i) => (
        <text key={l.lead} x={xs(i)} y={H - 6} textAnchor="middle" fontSize="12" fill="var(--muted)">{l.lead} h</text>
      ))}
      <text x={W - P} y={ys(v.leads.at(-1)!.raw) - 8} textAnchor="end" fontSize="12" fill="var(--muted)">raw model</text>
      <text x={W - P} y={ys(v.leads.at(-1)!.best) + 18} textAnchor="end" fontSize="12" fontWeight="700" fill="var(--accent)">corrected</text>
    </svg>
  );
}

export function TrackRecord() {
  return (
    <section aria-labelledby="tr-title" style={{ display: "grid", gap: 16 }}>
      <div className="card">
        <h1 id="tr-title" style={{ margin: "0 0 8px", fontSize: 15, color: "var(--muted)" }}>Track record</h1>
        <p className="lede">Every forecast this screen makes is checked against what really happened, on data it never saw while learning. Missed targets stay on this page.</p>
        <p className="note">Updated {data.generated}. Weather judged against Sydney Airport observations (NOAA ISD), waves against the Sydney Waverider buoy (Manly Hydraulics Laboratory, via AODN), sky against Skyfield with the JPL DE421 ephemeris.</p>
      </div>
      <div className="card">
        <h2>Targets</h2>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th scope="col">Check</th><th scope="col">Target</th><th scope="col">Result</th><th scope="col">Status</th></tr></thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.name}>
                  <td>{c.name}<div className="muted" style={{ fontSize: 12 }}>{c.judge}</div></td>
                  <td>{c.target}</td>
                  <td>{c.result}</td>
                  <td><span className={`pill ${c.pass ? "good" : c.status === "untestable" ? "wait" : "miss"}`}>{c.pass ? "Met" : c.status === "untestable" ? "Not testable yet" : "Missed"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="grid">
        {verifications.map((v) => (
          <div className="card" key={v.title}>
            <h2>{v.title}</h2>
            <div className="big">{v.gain > 0 ? "−" : "+"}{Math.abs(v.gain * 100).toFixed(1)}%</div>
            <p className="sub" style={{ margin: "4px 0 12px" }}>
              error vs raw model ({v.best}), 95% interval {(v.ci[0] * 100).toFixed(1)} to {(v.ci[1] * 100).toFixed(1)}%. Target −{v.target * 100}%.
            </p>
            <LeadChart v={v} />
            <table style={{ marginTop: 8 }}>
              <thead><tr><th scope="col">Method</th><th scope="col">Mean error ({v.unit})</th></tr></thead>
              <tbody>{v.methods.map((m) => <tr key={m.name}><td>{m.name}</td><td>{m.mae.toFixed(2)}</td></tr>)}</tbody>
            </table>
            <p className="note">Held-out test: {v.test}.</p>
          </div>
        ))}
      </div>
    </section>
  );
}
