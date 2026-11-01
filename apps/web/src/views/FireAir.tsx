import type { Fires, SourceEntry, SpaceWeather } from "@maroubra/core";
import { CardHead, Empty, Fresh } from "../components/bits";
import { compass } from "../lib/format";

type E<T> = (SourceEntry<T> & { stale: boolean; ageMin: number | null }) | null;

const ALERT_CLASS: Record<string, string> = { "Emergency Warning": "miss", "Watch and Act": "miss", Advice: "wait" };

export function FireAir({ fires }: { fires: E<Fires> }) {
  const f = fires?.data;
  const active = f?.nearby.filter((x) => !/out/i.test(x.status)) ?? [];
  const smoke = active.filter((x) => x.smokeTowardUs);
  return (
    <section aria-labelledby="fire-title" style={{ display: "grid", gap: 16 }}>
      <div className="card">
        <CardHead title="Bushfires within 200 km"><Fresh e={fires} /></CardHead>
        <h1 id="fire-title" className="sr-only">Fires</h1>
        {!f ? <Empty>Waiting for the NSW Rural Fire Service feed.</Empty> : (
          <p className="lede" style={{ margin: 0 }}>
            {active.length ? `${active.length} incident${active.length > 1 ? "s" : ""} nearby` : "No fire incident within 200 km"}
            {smoke.length ? `, smoke may drift towards Maroubra from ${smoke[0].title}.` : "."}
          </p>
        )}
      </div>
      {active.length > 0 && (
        <div className="card">
          <ul className="list fires">
            {active.slice(0, 12).map((x) => (
              <li key={x.id}>
                <span className={`pill ${ALERT_CLASS[x.alert] ?? "wait"}`}>{x.alert === "Not Applicable" ? "Info" : x.alert}</span>
                <span>
                  <strong>{x.title}</strong> <span className="muted">{x.distKm} km {compass(x.bearing)}{x.council ? `, ${x.council}` : ""}</span><br />
                  <span className="muted">{[x.type, x.status, x.sizeHa != null ? `${x.sizeHa.toLocaleString("en-AU")} ha` : null].filter(Boolean).join(", ")}{x.smokeTowardUs ? ". Wind is carrying smoke our way." : ""}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="note">Source: NSW Rural Fire Service, Fires Near Me feed (CC BY 4.0). For warnings and what to do, use the official Hazards Near Me app.</p>
        </div>
      )}
    </section>
  );
}

export function auroraText(s: SpaceWeather | null): string {
  if (!s) return "No space weather data.";
  const kp = s.forecastMax ?? s.kpNow;
  const base = `Geomagnetic activity Kp ${s.kpNow?.toFixed(1) ?? "?"} now, up to ${kp?.toFixed(1) ?? "?"} expected.`;
  return {
    none: `${base} No aurora from Sydney: it takes Kp 6 or more.`,
    camera: `${base} A long-exposure photo facing south from a dark spot may catch a faint glow.`,
    possible: `${base} Aurora possible low on the southern horizon after dark, away from lights.`,
    likely: `${base} Aurora likely: look south after dark, the whole family should see it.`,
  }[s.aurora];
}
