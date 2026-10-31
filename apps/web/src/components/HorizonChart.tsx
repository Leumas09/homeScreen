import type { TrackPoint } from "../lib/sky-model";
import { SITE } from "../lib/sky-model";
import { time } from "../lib/format";

const W = 1000;
const H = 280;
const ALT_MIN = -12;
const ALT_MAX = 90;
// Nord au centre, est à droite : le Soleil de Maroubra passe au nord, la mer est à l'est.
const x = (az: number) => ((((az - 180) % 360) + 360) % 360 / 360) * W;
const y = (alt: number) => H - 24 - ((alt - ALT_MIN) / (ALT_MAX - ALT_MIN)) * (H - 40);
const Y0 = y(0);

/** Segments d'une trajectoire au-dessus de l'horizon, coupés au passage du nord (0°/360°). */
function paths(points: TrackPoint[]): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  let prev: TrackPoint | null = null;
  for (const p of points) {
    const visible = p.alt > ALT_MIN;
    const wrap = prev && Math.abs(x(p.az) - x(prev.az)) > W / 2;
    if (!visible || wrap) {
      if (cur.length > 1) out.push(cur.join(" "));
      cur = [];
    }
    if (visible) cur.push(`${cur.length ? "L" : "M"}${x(p.az).toFixed(1)},${y(p.alt).toFixed(1)}`);
    prev = p;
  }
  if (cur.length > 1) out.push(cur.join(" "));
  return out;
}

interface Props {
  sun: TrackPoint[];
  moon: TrackPoint[];
  planets: Record<string, TrackPoint[]>;
  summary: string;
}

export function HorizonChart({ sun, moon, planets, summary }: Props) {
  const [a, b] = SITE.seaAzimuth;
  const now = (pts: TrackPoint[]) => pts[0];
  const labels = ["S", "SW", "W", "NW", "N", "NE", "E", "SE", "S"];
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--sky-top)" />
          <stop offset="1" stopColor="var(--sky-bottom)" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={W} height={Y0} fill="url(#sky)" rx="14" />
      {/* Sous l'horizon : la mer dans le secteur marin, la ville ailleurs */}
      <rect x="0" y={Y0} width={W} height={H - Y0} fill="var(--card-2)" />
      <rect x={x(a)} y={Y0} width={x(b) - x(a)} height={H - Y0} fill="var(--sea)" />
      <text x={(x(a) + x(b)) / 2} y={Y0 + 18} textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--accent)">Tasman Sea</text>
      <line x1="0" x2={W} y1={Y0} y2={Y0} stroke="var(--muted)" strokeWidth="1.5" />
      {[30, 60].map((alt) => (
        <g key={alt}>
          <line x1="0" x2={W} y1={y(alt)} y2={y(alt)} stroke="var(--line)" strokeDasharray="3 6" />
          <text x="6" y={y(alt) - 4} fontSize="11" fill="var(--muted)">{alt}°</text>
        </g>
      ))}
      {labels.map((l, i) => (
        <text key={i} x={Math.min(W - 10, Math.max(10, (i / 8) * W))} y={H - 4} textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--muted)">{l}</text>
      ))}
      {paths(sun).map((d, i) => <path key={`s${i}`} d={d} fill="none" stroke="#e0a100" strokeWidth="3" strokeLinecap="round" />)}
      {paths(moon).map((d, i) => <path key={`m${i}`} d={d} fill="none" stroke="var(--ink)" strokeOpacity="0.55" strokeWidth="2.5" strokeDasharray="1 6" strokeLinecap="round" />)}
      {Object.entries(planets).map(([name, pts]) => paths(pts).map((d, i) => (
        <path key={`${name}${i}`} d={d} fill="none" stroke="var(--accent)" strokeOpacity="0.5" strokeWidth="1.5" />
      )))}
      {[
        { p: now(sun), label: "Sun", fill: "#e0a100", r: 9 },
        { p: now(moon), label: "Moon", fill: "var(--ink)", r: 8 },
        ...Object.entries(planets).map(([name, pts]) => ({ p: now(pts), label: name, fill: "var(--accent)", r: 5 })),
      ]
        .filter((o) => o.p && o.p.alt > ALT_MIN)
        .map((o) => (
          <g key={o.label}>
            <circle cx={x(o.p.az)} cy={y(o.p.alt)} r={o.r} fill={o.fill} stroke="var(--card)" strokeWidth="2" />
            <text x={x(o.p.az) > W - 90 ? x(o.p.az) - o.r - 4 : x(o.p.az) + o.r + 4} textAnchor={x(o.p.az) > W - 90 ? "end" : "start"}
              y={y(o.p.alt) + 4} fontSize="13" fontWeight="700" fill="var(--ink)">{o.label}</text>
          </g>
        ))}
      <text x="8" y="18" fontSize="12" fill="var(--muted)">Facing north. Now {time(sun[0]?.t)}, paths for the next 24 h</text>
    </svg>
  );
}
