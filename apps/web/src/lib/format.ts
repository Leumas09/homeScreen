export const TZ = "Australia/Sydney";

const hm = new Intl.DateTimeFormat("en-AU", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TZ });
const day = new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
const longDay = new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });

export const time = (d: Date | null | undefined) => (d ? hm.format(d) : "n/a");
export const shortDate = (d: Date) => day.format(d);
export const longDate = (d: Date) => longDay.format(d);

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export const compass = (az: number) => COMPASS[Math.round((((az % 360) + 360) % 360) / 22.5) % 16];

export const pct = (x: number) => `${Math.round(x * 100)}%`;

export function duration(ms: number): string {
  const m = Math.round(ms / 60e3);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}
