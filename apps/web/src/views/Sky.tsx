import { HorizonChart } from "../components/HorizonChart";
import { compass, duration, pct, shortDate, time } from "../lib/format";
import type { SkyModel } from "../lib/sky-model";

function lede(s: SkyModel): string {
  const parts: string[] = [];
  if (!s.isNight && s.sun.set) parts.push(`Sunset ${time(s.sun.set)}`);
  const dark = s.dark[0];
  if (dark) parts.push(`dark sky from ${time(dark.start)} for ${duration(dark.end.getTime() - dark.start.getTime())}`);
  else parts.push("no truly dark sky tonight, the Moon is up");
  const m = s.moonriseOverSeaNext[0];
  if (m && m.time.getTime() - s.now.getTime() < 24 * 3600e3) parts.push(`the Moon rises over the sea at ${time(m.time)}`);
  if (s.planets.length) parts.push(`${s.planets.map((p) => p.name).join(" and ")} ${s.planets.length > 1 ? "are" : "is"} up`);
  const text = parts.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1) + ".";
}

export function Sky({ s }: { s: SkyModel }) {
  return (
    <section aria-labelledby="sky-title" className="layout-main" style={{ display: "grid", gap: 16 }}>
      <div className="card">
        <h1 id="sky-title" style={{ margin: "0 0 8px", fontSize: 15, color: "var(--muted)" }}>{s.isNight ? "Tonight over Maroubra" : "The sky over Maroubra"}</h1>
        <p className="lede">{lede(s)}</p>
      </div>
      <div className="card chart-scroll" style={{ padding: 12 }}>
        <HorizonChart sun={s.tracks.sun} moon={s.tracks.moon} planets={s.tracks.planets} summary={lede(s)} />
      </div>
      <div className="grid">
        <div className="card">
          <h2>Sun</h2>
          <dl className="kv">
            <dt>Sunrise</dt><dd>{time(s.sun.rise)}</dd>
            <dt>Golden hour</dt><dd>{time(s.sun.goldenEvening)}</dd>
            <dt>Sunset</dt><dd>{time(s.sun.set)}</dd>
            <dt>Last light</dt><dd>{time(s.sun.civilDusk)}</dd>
            <dt>Fully dark</dt><dd>{time(s.sun.astroDusk)}</dd>
            <dt>Next sunrise</dt><dd>{time(s.sun.nextRise)}</dd>
          </dl>
        </div>
        <div className="card">
          <h2>Moon</h2>
          <div className="big">{pct(s.moon.illumination)}</div>
          <p className="sub" style={{ margin: "4px 0 12px" }}>{s.moon.phase}</p>
          <dl className="kv">
            <dt>Moonrise</dt><dd>{time(s.moon.rise)}{s.moon.riseAz != null ? ` ${compass(s.moon.riseAz)}` : ""}</dd>
            <dt>Moonset</dt><dd>{time(s.moon.set)}</dd>
            <dt>Full moon</dt><dd>{shortDate(s.moon.nextFull)}</dd>
            <dt>New moon</dt><dd>{shortDate(s.moon.nextNew)}</dd>
          </dl>
        </div>
        <div className="card">
          <h2>Dark sky</h2>
          {s.dark.length ? (
            <ul className="list">
              {s.dark.map((w) => (
                <li key={w.start.toISOString()}><span className="when">{time(w.start)}</span><span>until {time(w.end)}, {duration(w.end.getTime() - w.start.getTime())} with no Sun and no Moon</span></li>
              ))}
            </ul>
          ) : <p className="muted" style={{ margin: 0 }}>The Moon lights the sky all night. Best for the Moon itself, not for faint stars.</p>}
        </div>
        <div className="card">
          <h2>Planets at {time(s.planetsAt)}</h2>
          {s.planets.length ? (
            <ul className="list">
              {s.planets.map((p) => (
                <li key={p.name}><span className="when">{p.name}</span><span>{p.alt.toFixed(0)}° high, {compass(p.az)}, magnitude {p.magnitude.toFixed(1)}</span></li>
              ))}
            </ul>
          ) : <p className="muted" style={{ margin: 0 }}>No bright planet above 10° at that time.</p>}
        </div>
        <div className="card">
          <h2>Moonrise over the sea, next 30 days</h2>
          {s.moonriseOverSeaNext.length ? (
            <ul className="list">
              {s.moonriseOverSeaNext.map((m) => (
                <li key={m.time.toISOString()}><span className="when">{shortDate(m.time)}</span><span>{time(m.time)}, {compass(m.azimuth)}, {pct(m.illumination)} lit</span></li>
              ))}
            </ul>
          ) : <p className="muted" style={{ margin: 0 }}>None with a bright Moon in the next 30 days.</p>}
          <p className="note">Sea horizon assumed between {40}° and {160}° from north, to be measured on site.</p>
        </div>
      </div>
    </section>
  );
}
