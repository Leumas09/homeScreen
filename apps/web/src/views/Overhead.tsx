import type { Aircraft, Flights, SourceEntry } from "@maroubra/core";
import { useState } from "react";
import { CardHead, Empty, Fresh } from "../components/bits";
import land from "../data/sydney-land.json";
import { compass } from "../lib/format";

type E<T> = (SourceEntry<T> & { stale: boolean; ageMin: number | null }) | null;

const HOME = { lat: -33.9496, lon: 151.2577 };
const YSSY = { lat: -33.9461, lon: 151.1772 };
// Projection équirectangulaire locale centrée sur Maroubra, 30 km de rayon environ.
const SPAN_LON = 0.5, SPAN_LAT = SPAN_LON * Math.cos((HOME.lat * Math.PI) / 180);
const W = 1000, H = 640;
const sx = (lon: number) => W / 2 + ((lon - HOME.lon) / SPAN_LON) * W;
const sy = (lat: number) => H / 2 - ((lat - HOME.lat) / SPAN_LAT) * W;
const kmPx = (km: number) => (km / 111.32 / SPAN_LAT) * W;

function landPath(): string {
  const g = land.geometry as { type: string; coordinates: number[][][][] | number[][][] };
  const polys = (g.type === "Polygon" ? [g.coordinates] : g.coordinates) as number[][][][];
  return polys.map((poly) => poly.map((ring) => ring.map(([lo, la], i) => `${i ? "L" : "M"}${sx(lo).toFixed(1)},${sy(la).toFixed(1)}`).join(" ") + " Z").join(" ")).join(" ");
}
const LAND = landPath();

const PLANE = "M12 2l1.6 7 7.4 4v2l-7.4-2.5-.6 5.5 2.5 2v1.5L12 20.5 8.5 21.5V20l2.5-2-.6-5.5L3 15v-2l7.4-4z";
const ft = (a: Aircraft) => (a.onGround ? "on ground" : a.altFt != null ? `${a.altFt.toLocaleString("en-AU")} ft` : "n/a");

function Map({ f, sel, pick }: { f: Flights; sel: string | null; pick: (hex: string) => void }) {
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Map of ${f.aircraft.length} aircraft around Maroubra`}>
      <rect width={W} height={H} fill="var(--sea)" rx="14" />
      <path d={LAND} fill="var(--land)" stroke="var(--line)" strokeWidth="1" />
      {[5, 10, 20].map((km) => (
        <g key={km}>
          <circle cx={sx(HOME.lon)} cy={sy(HOME.lat)} r={kmPx(km)} fill="none" stroke="var(--accent)" strokeOpacity="0.35" strokeDasharray="4 6" />
          <text x={sx(HOME.lon) + kmPx(km) * 0.71 + 4} y={sy(HOME.lat) - kmPx(km) * 0.71 - 4} fontSize="12" fill="var(--accent)">{km} km</text>
        </g>
      ))}
      <text x={sx(YSSY.lon)} y={sy(YSSY.lat) + 34} textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--muted)">Sydney Airport</text>
      <text x={sx(151.17)} y={sy(-34.01)} textAnchor="middle" fontSize="13" fontStyle="italic" fill="var(--muted)">Botany Bay</text>
      <text x={sx(151.45)} y={sy(-33.86)} textAnchor="middle" fontSize="13" fontStyle="italic" fill="var(--muted)">Tasman Sea</text>
      <circle cx={sx(HOME.lon)} cy={sy(HOME.lat)} r="7" fill="var(--accent)" stroke="var(--card)" strokeWidth="3" />
      <text x={sx(HOME.lon) + 12} y={sy(HOME.lat) + 4} fontSize="14" fontWeight="800" fill="var(--ink)">Maroubra</text>
      {f.aircraft.filter((a) => !a.onGround).map((a) => {
        const on = a.hex === sel;
        const color = on ? "var(--alert)" : a.interesting ? "#e0a100" : "var(--ink)";
        return (
          <g key={a.hex} onClick={() => pick(a.hex)} style={{ cursor: "pointer" }}>
            {a.trail.length > 1 && <path d={a.trail.map(([la, lo], i) => `${i ? "L" : "M"}${sx(lo)},${sy(la)}`).join(" ")} fill="none" stroke={color} strokeOpacity="0.4" strokeWidth="2" />}
            <g transform={`translate(${sx(a.lon) - 13},${sy(a.lat) - 13}) rotate(${a.track ?? 0} 13 13)`}>
              <path d={PLANE} transform="scale(1.08)" fill={color} stroke="var(--card)" strokeWidth="1" />
            </g>
            <text x={sx(a.lon) + 16} y={sy(a.lat) + 4} fontSize="13" fontWeight="700" fill={color}>{a.callsign ?? a.reg ?? a.hex}</text>
          </g>
        );
      })}
      <text x={W - 10} y={H - 10} textAnchor="end" fontSize="11" fill="var(--muted)">Map © OpenStreetMap contributors. Positions: adsb.lol</text>
    </svg>
  );
}

export function Overhead({ e }: { e: E<Flights> }) {
  const f = e?.data;
  const [sel, setSel] = useState<string | null>(null);
  if (!f) return <section className="card"><CardHead title="Overhead"><Fresh e={e} /></CardHead><Empty>Waiting for aircraft positions.</Empty></section>;
  const airborne = f.aircraft.filter((a) => !a.onGround);
  const s = airborne.find((a) => a.hex === sel) ?? airborne.find((a) => a.overhead) ?? airborne[0];
  return (
    <section aria-labelledby="ov-title" style={{ display: "grid", gap: 16 }}>
      <div className="card">
        <CardHead title="Above Maroubra"><Fresh e={e} /></CardHead>
        <h1 id="ov-title" className="sr-only">Overhead</h1>
        <p className="lede" style={{ margin: 0 }}>
          {airborne.length} aircraft within 45 km{f.runway ? `. ${f.runway.mode}` : ""}.
          {f.curfew ? " Airport curfew until 06:00: only exempt flights." : ""} {f.seenToday} flights over the suburb today.
        </p>
      </div>
      <div className="card chart-scroll" style={{ padding: 12 }}><Map f={f} sel={s?.hex ?? null} pick={setSel} /></div>
      <div className="grid">
        {s && (
          <div className="card">
            <h2>{s.callsign ?? s.reg ?? s.hex}{s.rare ? ` · ${s.rare}` : ""}</h2>
            {s.route && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "4px 0 12px" }}>
                <div><div className="big">{s.route.from?.iata ?? "?"}</div><div className="muted">{s.route.from?.location}</div></div>
                <div className="muted">to</div>
                <div style={{ textAlign: "right" }}><div className="big">{s.route.to?.iata ?? "?"}</div><div className="muted">{s.route.to?.location}</div></div>
              </div>
            )}
            <dl className="kv">
              <dt>Aircraft</dt><dd>{s.type ?? "n/a"}{s.reg ? `, ${s.reg}` : ""}</dd>
              <dt>Altitude</dt><dd>{ft(s)}{s.vrate ? (s.vrate > 300 ? ", climbing" : s.vrate < -300 ? ", descending" : "") : ""}</dd>
              <dt>Speed</dt><dd>{s.speedKt != null ? `${Math.round(s.speedKt * 1.852)} km/h` : "n/a"}</dd>
              <dt>From Maroubra</dt><dd>{s.distKm} km {compass(s.bearing)}</dd>
              {s.overhead && <><dt>Overhead</dt><dd>in {s.overhead.inMin} min</dd></>}
            </dl>
          </div>
        )}
        <div className="card">
          <h2>Nearest first</h2>
          <ul className="list planes">
            {airborne.slice(0, 8).map((a) => (
              <li key={a.hex}>
                <button className="row-btn" onClick={() => setSel(a.hex)} aria-pressed={a.hex === s?.hex}>
                  <strong>{a.callsign ?? a.hex}</strong>
                  <span className="muted">{a.route?.codes ?? a.type ?? ""}</span>
                  <span>{ft(a)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
