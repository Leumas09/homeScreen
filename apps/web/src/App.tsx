import { useEffect, useMemo, useState } from "react";
import { longDate, pct, time } from "./lib/format";
import type { SkyModel } from "./lib/sky-model";
import { loadTide, tideNow, type TideTable } from "./lib/tide";
import { Sky } from "./views/Sky";
import { Tide } from "./views/Tide";
import { TrackRecord } from "./views/TrackRecord";

type View = "sky" | "tide" | "track";
const VIEWS: View[] = ["sky", "tide", "track"];

/** `?at=2026-11-14T09:00:00Z` fige l'heure (captures et tests). */
function startTime(): Date | null {
  const at = new URLSearchParams(location.search).get("at");
  return at ? new Date(at) : null;
}

function useNow(): Date {
  const fixed = useMemo(startTime, []);
  const [now, setNow] = useState(() => fixed ?? new Date());
  useEffect(() => {
    if (fixed) return;
    const id = setInterval(() => setNow(new Date()), 30e3);
    return () => clearInterval(id);
  }, [fixed]);
  return now;
}

/** Éphémérides calculées dans un Web Worker, recalculées à chaque minute. */
function useSky(now: Date): SkyModel | null {
  const minute = Math.floor(now.getTime() / 60e3);
  const [sky, setSky] = useState<SkyModel | null>(null);
  const worker = useMemo(() => new Worker(new URL("./lib/sky.worker.ts", import.meta.url), { type: "module" }), []);
  useEffect(() => {
    worker.onmessage = (e: MessageEvent<SkyModel>) => setSky(e.data);
    return () => worker.terminate();
  }, [worker]);
  useEffect(() => worker.postMessage(minute * 60e3), [worker, minute]);
  return sky;
}

export function App() {
  const now = useNow();
  const sky = useSky(now);
  const [view, setView] = useState<View>(() => VIEWS.find((v) => location.hash === `#${v}`) ?? "sky");
  const [tide, setTide] = useState<TideTable | null>(null);
  useEffect(() => { loadTide().then(setTide).catch(() => setTide(null)); }, []);
  const tNow = tide ? tideNow(tide, now) : null;

  const night = sky?.isNight;
  useEffect(() => {
    if (night === undefined) return;
    document.documentElement.dataset.theme = night ? "night" : "day";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", night ? "#0B1016" : "#EEF3F5");
  }, [night]);

  const go = (v: View) => () => { setView(v); history.replaceState(null, "", v === "sky" ? location.pathname + location.search : `#${v}`); };
  const nextMoment = sky?.moments.find((m) => m.at >= now) ?? sky?.moments[0];

  return (
    <div className="app">
      <nav className="strip" aria-label="Maroubra right now">
        <div className="clock">
          <div className="time">{time(now)}</div>
          <div className="date">{longDate(now)}</div>
        </div>
        <button className="tile" aria-current={view === "sky" ? "page" : undefined} onClick={go("sky")}>
          <span className="label">Sky</span>
          <span className="value">{!sky ? "·" : sky.isNight ? pct(sky.moon.illumination) : time(sky.sun.set)}</span>
          <span className="sub">{!sky ? "Computing" : sky.isNight ? sky.moon.phase : "Sunset"}</span>
        </button>
        <button className="tile" onClick={go("sky")}>
          <span className="label">Next</span>
          <span className="value">{nextMoment ? time(nextMoment.at) : "n/a"}</span>
          <span className="sub">{nextMoment?.title ?? "Nothing in the next 24 h"}</span>
        </button>
        <button className="tile" aria-current={view === "tide" ? "page" : undefined} onClick={go("tide")}>
          <span className="label">{tNow ? (tNow.rising ? "Tide rising" : "Tide falling") : "Tide"}</span>
          <span className="value">{tNow ? time(tNow.next.t) : "·"}</span>
          <span className="sub">{tNow ? `${tNow.next.kind === "high" ? "High" : "Low"} ${tNow.next.h >= 0 ? "+" : "−"}${Math.abs(tNow.next.h).toFixed(1)} m` : "Loading"}</span>
        </button>
        <button className="tile" aria-current={view === "track" ? "page" : undefined} onClick={go("track")}>
          <span className="label">Track record</span>
          <span className="value">How right?</span>
          <span className="sub">Forecasts vs reality</span>
        </button>
        {["Weather", "Beach", "Overhead"].map((name) => (
          <button key={name} className="tile" aria-disabled="true" title="Coming with live data in phase 1">
            <span className="label">{name}</span>
            <span className="value" aria-hidden="true">·</span>
            <span className="sub">Live data soon</span>
          </button>
        ))}
      </nav>
      <div className="layout">
        <main>
          {view === "track" ? <TrackRecord /> : view === "tide" ? <Tide table={tide} now={now} />
            : sky ? <Sky s={sky} /> : <div className="card" style={{ minHeight: 320 }} aria-busy="true" />}
        </main>
        <aside className="side card" aria-labelledby="next-title">
          <h2 id="next-title">Next 24 h</h2>
          <ul className="list">
            {sky?.moments.map((m) => (
              <li key={m.title + m.at.toISOString()}>
                <span className="when">{time(m.at)}</span>
                <span><strong>{m.title}</strong><br /><span className="muted">{m.detail}</span></span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
