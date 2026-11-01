// Petits éléments partagés : fraîcheur d'une source, icônes météo, en-tête de carte.
import type { ReactNode } from "react";

export function Fresh({ e, label = "Updated" }: { e: { ageMin: number | null; stale: boolean; ok: boolean; error: string | null } | null; label?: string }) {
  if (!e) return null;
  if (e.ageMin == null) return <span className="fresh bad">{e.error ? "Source unavailable" : "Waiting for data"}</span>;
  const age = e.ageMin < 1 ? "just now" : e.ageMin < 60 ? `${Math.round(e.ageMin)} min ago` : `${Math.round(e.ageMin / 60)} h ago`;
  return <span className={`fresh ${e.stale ? "bad" : ""}`}>{e.stale ? `Out of date, ${age}` : `${label} ${age}`}</span>;
}

export function CardHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card-head">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted" style={{ margin: 0 }}>{children}</p>;
}

/** Icône météo d'après le code WMO, en traits simples (pas d'emoji). */
export function WxIcon({ code, size = 28, night = false }: { code: number; size?: number; night?: boolean }) {
  const sun = <g stroke="#e0a100" strokeWidth="2" fill="none" strokeLinecap="round"><circle cx="9" cy="9" r="3.5" /><path d="M9 2v1.5M2 9h1.5M4 4l1 1M14 4l-1 1M16 9h-1.5" /></g>;
  const moon = <path d="M11 3a6 6 0 1 0 6 8 5 5 0 0 1-6-8z" fill="none" stroke="currentColor" strokeWidth="1.8" />;
  const cloud = <path d="M8 20h10a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6 1.6A2.7 2.7 0 0 0 8 20z" fill="var(--card)" stroke="currentColor" strokeWidth="1.8" />;
  const rain = <path d="M10 21.5l-1 2M14 21.5l-1 2M18 21.5l-1 2" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" />;
  const bolt = <path d="M13 19l-2 3h3l-2 3" stroke="#e0a100" strokeWidth="1.8" fill="none" />;
  const fog = <path d="M4 15h16M6 18h14M4 21h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />;
  const parts =
    code === 0 || code === 1 ? [night ? moon : sun]
      : code === 2 ? [night ? moon : sun, cloud]
        : code === 3 ? [cloud]
          : code === 45 || code === 48 ? [fog]
            : code >= 95 ? [cloud, bolt]
              : code >= 51 ? [cloud, rain] : [cloud];
  return (
    <svg width={size} height={size} viewBox="0 0 24 26" aria-hidden="true" style={{ flex: "none" }}>
      {parts.map((p, i) => <g key={i}>{p}</g>)}
    </svg>
  );
}

const WMO: Record<number, string> = { 0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain", 80: "Showers", 81: "Showers", 82: "Heavy showers", 95: "Thunderstorms", 96: "Storms with hail", 99: "Storms with hail" };
export const wxText = (code: number) => WMO[code] ?? "Changeable";
