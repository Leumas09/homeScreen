import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Auth, clientIp, LoginLimiter } from "../src/auth";
import type { Config } from "../src/config";
import { createApp } from "../src/server";
import { Store } from "../src/store";

const dir = join(tmpdir(), "maroubra-static");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "index.html"), "<!doctype html><title>app</title>");

const cfg: Config = {
  port: 0, staticDir: dir, password: "test-family-password", sessionSecret: "test-secret", secureCookies: true, version: "test", offline: true,
  foundry: { deployment: "gpt-6.1-sol" }, vapid: { subject: "mailto:x@y" },
};

async function login(app: ReturnType<typeof createApp>, password: string, remember = true, ip = "1.2.3.4") {
  const body = new URLSearchParams({ password, next: "/", ...(remember ? { remember: "1" } : {}) });
  return app.request("/login", { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": `9.9.9.9, ${ip}` } });
}

describe("authentification par mot de passe familial", () => {
  it("refuse sans session et renvoie vers la page de connexion", async () => {
    const app = createApp(cfg, new Store());
    const r = await app.request("/");
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("/login?next=%2F");
    expect((await app.request("/api/state")).status).toBe(401);
  });

  it("accepte le bon mot de passe et pose un cookie sûr et durable", async () => {
    const app = createApp(cfg, new Store());
    const r = await login(app, "test-family-password");
    expect(r.status).toBe(303);
    const cookie = r.headers.get("set-cookie")!;
    expect(cookie).toMatch(/mb_s=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Max-Age=345\d{5}/); // 400 jours
    const token = cookie.match(/mb_s=([^;]+)/)![1];
    const s = await app.request("/api/state", { headers: { cookie: `mb_s=${token}` } });
    expect(s.status).toBe(200);
  });

  it("session courte si l'appareil ne doit pas rester connecté", async () => {
    const app = createApp(cfg, new Store());
    const cookie = (await login(app, "test-family-password", false)).headers.get("set-cookie")!;
    expect(cookie).not.toMatch(/Max-Age/);
  });

  it("refuse un mauvais mot de passe, et bloque après 8 essais", async () => {
    const app = createApp(cfg, new Store());
    for (let i = 0; i < 8; i++) expect((await login(app, "maroubra", true, "5.5.5.5")).status).toBe(401);
    const r = await login(app, "test-family-password", true, "5.5.5.5");
    expect(r.status).toBe(429);
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
    // une autre adresse n'est pas bloquée
    expect((await login(app, "test-family-password", true, "6.6.6.6")).status).toBe(303);
  }, 20_000);

  it("invalide les sessions quand le mot de passe change", () => {
    const a = new Auth("test-family-password", "k");
    const t = a.issue(true).token;
    expect(a.verify(t)).toBe(true);
    expect(new Auth("Other", "k").verify(t)).toBe(false);
    expect(new Auth("test-family-password", "k2").verify(t)).toBe(false);
    expect(a.verify(t.slice(0, -2) + "xx")).toBe(false);
    expect(a.verify(a.issue(false, Date.now() - 13 * 3600e3).token)).toBe(false);
  });

  it("limiteur global contre les essais répartis", () => {
    const l = new LoginLimiter(8, 5);
    for (let i = 0; i < 5; i++) l.fail(`10.0.0.${i}`);
    expect(l.retryAfterSeconds("10.0.0.99")).toBeGreaterThan(0);
  });

  it("prend l'adresse la plus à droite de X-Forwarded-For", () => {
    expect(clientIp("1.1.1.1, 2.2.2.2")).toBe("2.2.2.2");
    expect(clientIp(undefined, "x")).toBe("x");
  });

  it("la santé est publique mais ne révèle aucune donnée", async () => {
    const store = new Store();
    store.register("weather", 1000);
    store.success("weather", { secret: 1 });
    const r = await createApp(cfg, store).request("/health");
    const j = await r.json();
    expect(j.status).toBe("ok");
    expect(JSON.stringify(j)).not.toContain("secret");
    expect(r.headers.get("x-robots-tag")).toContain("noindex");
    expect(r.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });

  it("refuse les écritures d'une autre origine", async () => {
    const app = createApp(cfg, new Store(), { push: { publicKey: "k", subscribe: async () => {}, unsubscribe: async () => {}, test: async () => true } as never });
    const token = (await login(app, "test-family-password")).headers.get("set-cookie")!.match(/mb_s=([^;]+)/)![1];
    const r = await app.request("/api/push/subscribe", { method: "POST", body: "{}", headers: { cookie: `mb_s=${token}`, origin: "https://evil.example", host: "maroubra.apps.akakiwi.com", "content-type": "application/json" } });
    expect(r.status).toBe(403);
  });
});

describe("flux temps réel", () => {
  it("envoie l'état complet puis les mises à jour", async () => {
    const store = new Store();
    store.register("weather", 1000);
    const app = createApp(cfg, store);
    const token = (await login(app, "test-family-password")).headers.get("set-cookie")!.match(/mb_s=([^;]+)/)![1];
    const res = await app.request("/api/stream", { headers: { cookie: `mb_s=${token}` } });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let text = dec.decode((await reader.read()).value);
    expect(text).toContain("event: snapshot");
    store.success("weather", { temp: 21 });
    text = dec.decode((await reader.read()).value);
    expect(text).toContain("event: patch");
    expect(text).toContain('"temp":21');
    await reader.cancel();
  });
});
