import type { AirQuality, Metar, SourceEntry, Weather as W } from "@maroubra/core";
import { CardHead, Empty, Fresh, WxIcon, wxText } from "../components/bits";
import { compass, shortDate, time } from "../lib/format";

type E<T> = (SourceEntry<T> & { stale: boolean; ageMin: number | null }) | null;

function HourChart({ w }: { w: W }) {
  const hrs = w.hourly.slice(0, 25);
  if (hrs.length < 2) return null;
  const Wd = 1000, H = 220, P = 30;
  const temps = hrs.map((h) => h.temp);
  const lo = Math.floor(Math.min(...temps) - 1), hi = Math.ceil(Math.max(...temps) + 1);
  const x = (i: number) => P + (i / (hrs.length - 1)) * (Wd - 2 * P);
  const y = (t: number) => 30 + (1 - (t - lo) / (hi - lo)) * (H - 90);
  const maxP = Math.max(2, ...hrs.map((h) => h.precip));
  return (
    <svg className="chart" viewBox={`0 0 ${Wd} ${H}`} role="img" aria-label="Temperature and rain over the next 24 hours">
      {hrs.map((h, i) => h.precip > 0 && (
        <rect key={`r${h.t}`} x={x(i) - 12} width="24" y={H - 26 - (h.precip / maxP) * 50} height={(h.precip / maxP) * 50} rx="4" fill="var(--accent)" opacity="0.55" />
      ))}
      <path d={hrs.map((h, i) => `${i ? "L" : "M"}${x(i)},${y(h.temp)}`).join(" ")} fill="none" stroke="#e0a100" strokeWidth="3" />
      {hrs.map((h, i) => i % 3 === 0 && (
        <g key={h.t}>
          <text x={x(i)} y={y(h.temp) - 10} textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--ink)">{Math.round(h.temp)}°</text>
          <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="13" fill="var(--muted)">{time(new Date(h.t * 1000)).slice(0, 2)}h</text>
          {h.pop != null && h.pop >= 20 && <text x={x(i)} y={H - 32 - (h.precip / maxP) * 50} textAnchor="middle" fontSize="12" fill="var(--accent)">{h.pop}%</text>}
        </g>
      ))}
    </svg>
  );
}

export function Weather({ e, metar, air, night }: { e: E<W>; metar: E<Metar>; air: E<AirQuality>; night: boolean }) {
  const w = e?.data;
  if (!w) return <section className="card"><CardHead title="Weather"><Fresh e={e} /></CardHead><Empty>Waiting for the forecast.</Empty></section>;
  const c = w.current;
  const m = metar?.data;
  return (
    <section aria-labelledby="wx-title" style={{ display: "grid", gap: 16 }}>
      <div className="card">
        <CardHead title="Weather at Maroubra"><Fresh e={e} /></CardHead>
        <h1 id="wx-title" className="sr-only">Weather</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <WxIcon code={c.code} size={64} night={night} />
          <div className="huge">{Math.round(c.temp)}°</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{wxText(c.code)}</div>
            <div className="muted">Feels like {Math.round(c.feels)}°, humidity {Math.round(c.humidity)}%</div>
            <div className="muted">Wind {compass(c.windDir)} {Math.round(c.wind)} km/h, gusts {Math.round(c.gust)}, UV {Math.round(c.uv)}</div>
          </div>
        </div>
        {m && (
          <p className="note">
            Measured at Sydney Airport at {time(new Date(m.t * 1000))}: {m.temp ?? "n/a"}°C, wind {m.windDir != null ? compass(m.windDir) : "variable"} {m.windKt ?? "?"} kt{m.gustKt ? ` gusting ${m.gustKt}` : ""}. <Fresh e={metar} label="Observation" />
          </p>
        )}
      </div>
      <div className="card chart-scroll" style={{ padding: 12 }}>
        <HourChart w={w} />
      </div>
      <div className="grid">
        <div className="card">
          <h2>Next 7 days</h2>
          <ul className="list days">
            {w.daily.slice(0, 7).map((d) => (
              <li key={d.t}>
                <span className="when">{shortDate(new Date(d.t * 1000 + 12 * 3600e3)).split(",")[0]}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <WxIcon code={d.code} size={24} />
                  <span><strong>{Math.round(d.max)}°</strong> <span className="muted">{Math.round(d.min)}°</span></span>
                  <span className="muted">{d.pop != null && d.pop >= 20 ? `${d.pop}% rain` : wxText(d.code)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <CardHead title="Air"><Fresh e={air} /></CardHead>
          {air?.data ? (
            <dl className="kv">
              <dt>Fine particles PM2.5</dt><dd>{air.data.current.pm25?.toFixed(1) ?? "n/a"} µg/m³</dd>
              <dt>Air quality index (US)</dt><dd>{air.data.current.aqi ?? "n/a"} {aqiLabel(air.data.current.aqi)}</dd>
              <dt>UV index</dt><dd>{air.data.current.uv?.toFixed(0) ?? "n/a"}</dd>
            </dl>
          ) : <Empty>Air quality not available.</Empty>}
          <p className="note">Modelled by the Copernicus atmosphere service, not measured on site.</p>
        </div>
      </div>
    </section>
  );
}

export function aqiLabel(aqi: number | null): string {
  if (aqi == null) return "";
  return aqi <= 50 ? "Good" : aqi <= 100 ? "Moderate" : aqi <= 150 ? "Unhealthy for sensitive groups" : aqi <= 200 ? "Unhealthy" : "Very unhealthy";
}
