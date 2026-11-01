// Accès familial par mot de passe partagé. Sécurité volontairement simple (données publiques),
// mais sans faille évidente : comparaison à temps constant, jeton signé HMAC, cookie HttpOnly,
// limitation des essais par adresse et globale, et invalidation de toutes les sessions
// quand le mot de passe ou la clé de session change.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest();
const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export const COOKIE = "mb_s";
const LONG_MS = 400 * 86400e3; // durée maximale admise par les navigateurs pour un cookie

export class Auth {
  private readonly secret: Buffer;
  private readonly pwHash: Buffer;
  private readonly pwVersion: string;

  constructor(password: string, sessionSecret: string | undefined) {
    if (!password) throw new Error("APP_PASSWORD manquant");
    this.pwHash = sha256(password);
    this.pwVersion = this.pwHash.subarray(0, 6).toString("hex");
    // Sans clé fournie, une clé aléatoire : les sessions ne survivent pas à un redémarrage.
    this.secret = sessionSecret ? sha256(sessionSecret) : randomBytes(32);
  }

  checkPassword(input: string): boolean {
    return timingSafeEqual(sha256(input ?? ""), this.pwHash);
  }

  issue(remember: boolean, now = Date.now()): { token: string; maxAgeSeconds?: number } {
    const exp = now + (remember ? LONG_MS : 12 * 3600e3);
    const payload = b64url(JSON.stringify({ v: this.pwVersion, exp }));
    return { token: `${payload}.${this.sign(payload)}`, maxAgeSeconds: remember ? Math.floor(LONG_MS / 1000) : undefined };
  }

  verify(token: string | undefined, now = Date.now()): boolean {
    if (!token) return false;
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return false;
    const expected = Buffer.from(this.sign(payload));
    const got = Buffer.from(sig);
    if (expected.length !== got.length || !timingSafeEqual(expected, got)) return false;
    try {
      const { v, exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      return v === this.pwVersion && typeof exp === "number" && exp > now;
    } catch {
      return false;
    }
  }

  private sign(payload: string): string {
    return createHmac("sha256", this.secret).update(payload).digest("base64url");
  }
}

/** Limite les essais : par adresse (8 échecs par 15 min) et au total (60 par 15 min). */
export class LoginLimiter {
  private perIp = new Map<string, number[]>();
  private all: number[] = [];

  constructor(private perIpMax = 8, private globalMax = 60, private windowMs = 15 * 60e3) {}

  retryAfterSeconds(ip: string, now = Date.now()): number {
    const cut = now - this.windowMs;
    const mine = (this.perIp.get(ip) ?? []).filter((t) => t > cut);
    this.all = this.all.filter((t) => t > cut);
    if (mine.length >= this.perIpMax) return Math.ceil((mine[0] + this.windowMs - now) / 1000);
    if (this.all.length >= this.globalMax) return Math.ceil((this.all[0] + this.windowMs - now) / 1000);
    return 0;
  }

  fail(ip: string, now = Date.now()) {
    const list = (this.perIp.get(ip) ?? []).filter((t) => t > now - this.windowMs);
    list.push(now);
    this.perIp.set(ip, list);
    this.all.push(now);
    if (this.perIp.size > 10_000) this.perIp.clear();
  }

  success(ip: string) {
    this.perIp.delete(ip);
  }
}

/** Container Apps ne transmet que l'adresse la plus à droite de X-Forwarded-For. */
export function clientIp(xff: string | undefined, fallback = "unknown"): string {
  const parts = (xff ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return parts.at(-1) ?? fallback;
}
