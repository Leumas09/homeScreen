import { useEffect, useMemo, useState } from "react";
import type { AirQuality, Beach as BeachData, Brief, Buoy, Fires, Flights, Iss, Marine, Metar, Moment, News as NewsData, SpaceWeather, Sunrise, Weather as WeatherData } from "@maroubra/core";
import { WxIcon } from "./components/bits";
import { longDate, pct, time } from "./lib/format";
import { data, entry, isDemo, useLive } from "./lib/live";
import type { SkyModel } from "./lib/sky-model";
import { loadTide, tideNow, type TideTable } from "./lib/tide";
import { Beach } from "./views/Beach";
import { FireAir } from "./views/FireAir";
import { News } from "./views/News";
import { Overhead } from "./views/Overhead";
import { Settings } from "./views/Settings";
import { Sky } from "./views/Sky";
import { Sea } from "./views/Tide";
import { TrackRecord } from "./views/TrackRecord";
import { Weather } from "./views/Weather";

type View = "weather" | "beach" | "sea" | "sky" | "overhead" | "fire" | "news" | "track" | "settings";
const VIEWS: View[] = ["weather", "beach", "sea", "sky", "overhead", "fire", "news", "track", "settings"];

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

/** Écran ambiant : garder l'écran allumé (Screen Wake Lock), le rétablir quand l'onglet revient. */
function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const take = () => navigator.wakeLock.request("screen").then((l) => { lock = l; }).catch(() => {});
    const again = () => document.visibilityState === "visible" && take();
    take();
    document.addEventListener("visibilitychange", again);
    return () => { document.removeEventListener("visibilitychange", again); lock?.release().catch(() => {}); };
  }, [on]);
}

const readFlag = (k: string) => { try { return localStorage.getItem(k) === "1"; } catch { return false; } };

export function App() {
  const now = useNow();
  const sky = useSky(now);
  const { snap, connected } = useLive();
  const [tide, setTide] = useState<TideTable | null>(null);
  useEffect(() => { loadTide().then(setTide).catch(() => setTide(null)); }, []);
  const [ambient, setAmbientState] = useState(() => readFlag("mb.ambient"));
  const setAmbient = (v: boolean) => { setAmbientState(v); try { localStorage.setItem("mb.ambient", v ? "1" : "0"); } catch { /* ignoré */ } };
  useWakeLock(ambient);

  const night = sky?.isNight;
  const fromHash = () => VIEWS.find((v) => location.hash === `#${v}`) ?? null;
  const [view, setView] = useState<View | null>(fromHash);
  useEffect(() => {
    const on = () => setView(fromHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  // Vue par défaut selon le moment : le ciel la nuit, la plage de jour en saison chaude, sinon la météo.
  const month = Number(new Intl.DateTimeFormat("en-AU", { month: "numeric", timeZone: "Australia/Sydney" }).format(now));
  const current: View = view ?? (night ? "sky" : month >= 10 || month <= 4 ? "beach" : "weather");

  useEffect(() => {
    if (night === undefined) return;
    document.documentElement.dataset.theme = night ? "night" : "day";
    document.documentElement.dataset.ambient = ambient && night ? "dim" : "";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", night ? "#0B1016" : "#EEF3F5");
  }, [night, ambient]);

  const go = (v: View) => () => { setView(v); history.replaceState(null, "", `${location.pathname}${location.search}#${v}`); };

  const weather = entry<WeatherData>(snap, "weather");
  const beach = entry<BeachData>(snap, "beach");
  const flights = entry<Flights>(snap, "flights");
  const fires = entry<Fires>(snap, "fires");
  const air = entry<AirQuality>(snap, "air");
  const news = entry<NewsData>(snap, "news");
  const buoy = entry<Buoy>(snap, "buoy");
  const brief = data<Brief>(snap, "brief");
  const tNow = tide ? tideNow(tide, now) : null;
  const w = weather?.data;
  const b = beach?.data;
  const f = flights?.data;
  const overheadNext = f?.aircraft.find((a) => a.overhead);
  const activeFires = fires?.data?.nearby.filter((x) => !/out/i.test(x.status)) ?? [];
  const urgentFire = activeFires.some((x) => x.alert === "Emergency Warning" || x.alert === "Watch and Act" || x.smokeTowardUs);

  const serverMoments = data<Moment[]>(snap, "moments") ?? [];
  const moments = [
    ...serverMoments.map((m) => ({ at: new Date(m.at), title: m.title, detail: m.detail, urgent: m.priority === 1 })),
    ...(sky?.moments ?? []).filter((m) => !serverMoments.some((s) => s.title.split(" at ")[0] === m.title)).map((m) => ({ ...m, urgent: false })),
  ].filter((m) => m.at.getTime() >= now.getTime() - 15 * 60e3).sort((x, y) => Number(y.urgent) - Number(x.urgent) || x.at.getTime() - y.at.getTime()).slice(0, 8);

  const tile = (v: View, label: string, value: React.ReactNode, sub: string, opts: { alert?: boolean; stale?: boolean } = {}) => (
    <button className={`tile${opts.alert ? " alert" : ""}`} aria-current={current === v ? "page" : undefined} onClick={go(v)}>
      <span className="label">{label}{opts.stale ? <span className="dot" aria-label="out of date" /> : null}</span>
      <span className="value">{value}</span>
      <span className="sub">{sub}</span>
    </button>
  );

  return (
    <div className="app">
      <nav className="strip" aria-label="Maroubra right now">
        <div className="clock">
          <div className="time">{time(now)}</div>
          <div className="date">{longDate(now)}</div>
          <a className="settings-link" href="#settings" aria-current={current === "settings" ? "page" : undefined} onClick={(e) => { e.preventDefault(); go("settings")(); }}>Settings</a>
        </div>
        {tile("weather", "Weather", w ? <span className="with-icon"><WxIcon code={w.current.code} night={night} />{Math.round(w.current.temp)}°</span> : "·", w ? `Feels ${Math.round(w.current.feels)}°, max ${Math.round(w.daily.find((d) => new Date(d.t * 1000 + 12 * 3600e3).toDateString() === now.toDateString())?.max ?? w.daily[0]?.max ?? w.current.temp)}°` : "Loading", { stale: weather?.stale && !!w })}
        {tile("beach", "Beach", b ? `${b.score.toFixed(1)}` : "·", b ? (b.best ? `${b.label}, best ${time(new Date(b.best.start * 1000))}` : b.label) : "Loading", { stale: beach?.stale && !!b })}
        {tile("sea", tNow ? (tNow.rising ? "Tide rising" : "Tide falling") : "Sea", tNow ? time(tNow.next.t) : "·", `${tNow ? `${tNow.next.kind === "high" ? "High" : "Low"}` : ""}${buoy?.data?.latest?.hs != null ? `, swell ${buoy.data.latest.hs.toFixed(1)} m` : ""}`)}
        {tile("sky", "Sky", !sky ? "·" : sky.isNight ? pct(sky.moon.illumination) : time(sky.sun.set), !sky ? "Computing" : sky.isNight ? sky.moon.phase : "Sunset")}
        {tile("overhead", "Overhead", f ? `${f.aircraft.filter((a) => !a.onGround).length}` : "·", overheadNext ? `${overheadNext.callsign ?? overheadNext.type} in ${overheadNext.overhead!.inMin} min` : f ? "aircraft nearby" : "Loading", { stale: flights?.stale && !!f })}
        {tile("fire", "Fire & smoke", fires?.data ? `${activeFires.length}` : "·", fires?.data ? (urgentFire ? "Check alerts" : activeFires.length ? "within 200 km" : "No fires nearby") : "Loading", { alert: urgentFire })}
        {tile("news", "Local news", news?.data ? `${news.data.items.length}` : "·", "Randwick, Maroubra")}
        {tile("track", "Track record", "How right?", "Forecasts vs reality")}
      </nav>

      {(isDemo(snap) || brief || (snap && !connected)) && (
        <div className="brief" role="status">
          {isDemo(snap) && <span className="pill miss">Sample data for testing, not live</span>}
          {snap && !connected && <span className="pill wait">Reconnecting…</span>}
          {brief && <span>{brief.text}</span>}
        </div>
      )}

      <div className="layout">
        <main>
          {current === "weather" && <Weather e={weather} metar={entry<Metar>(snap, "metar")} air={air} night={!!night} />}
          {current === "beach" && <Beach e={beach} now={now} />}
          {current === "sea" && <Sea table={tide} now={now} buoy={buoy} marine={entry<Marine>(snap, "marine")} />}
          {current === "sky" && (sky ? <Sky s={sky} iss={entry<Iss>(snap, "iss")} space={entry<SpaceWeather>(snap, "space")} sunrise={entry<Sunrise>(snap, "sunrise")} /> : <div className="card" style={{ minHeight: 320 }} aria-busy="true" />)}
          {current === "overhead" && <Overhead e={flights} />}
          {current === "fire" && <FireAir fires={fires} />}
          {current === "news" && <News e={news} now={now} />}
          {current === "track" && <TrackRecord />}
          {current === "settings" && <Settings ambient={ambient} setAmbient={setAmbient} />}
        </main>
        <aside className="side card" aria-labelledby="next-title">
          <h2 id="next-title">Next 24 h</h2>
          <ul className="list">
            {moments.map((m) => (
              <li key={m.title + m.at.toISOString()} className={m.urgent ? "urgent" : undefined}>
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
