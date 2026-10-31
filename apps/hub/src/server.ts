import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context } from "hono";
import { compress } from "hono/compress";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Auth, clientIp, COOKIE, LoginLimiter } from "./auth";
import type { Config } from "./config";
import { loginPage } from "./login-page";
import type { Push } from "./push";
import type { Store } from "./store";

/** Container Apps coupe une requête HTTP au bout de 240 s : on ferme le flux avant, le client se reconnecte. */
export const SSE_MAX_MS = 200_000;
const SSE_HEARTBEAT_MS = 15_000;

export function createApp(cfg: Config, store: Store, deps: { push?: Push } = {}) {
  const app = new Hono();
  const auth = new Auth(cfg.password!, cfg.sessionSecret);
  const limiter = new LoginLimiter();
  const indexPath = join(cfg.staticDir, "index.html");

  app.use("*", async (c, next) => {
    await next();
    c.header("X-Robots-Tag", "noindex, nofollow");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("Referrer-Policy", "same-origin");
    if (cfg.secureCookies) c.header("Strict-Transport-Security", "max-age=31536000");
    c.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
        "font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
  });

  // Compression gzip des réponses, sauf le flux temps réel (qui doit partir sans tampon).
  const gzip = compress();
  app.use("*", (c, next) => (c.req.path === "/api/stream" ? next() : gzip(c, next)));

  // Public : santé (sans donnée), page de connexion, icône et service worker.
  app.get("/health", (c) => c.json({ status: "ok", version: cfg.version, sources: store.health() }));
  for (const f of ["/icon.svg", "/icon-192.png", "/icon-512.png", "/manifest.webmanifest", "/sw.js"]) app.get(f, serveStatic({ root: cfg.staticDir }));
  app.get("/login", (c) => c.html(loginPage({ next: c.req.query("next") })));

  app.post("/login", async (c) => {
    const ip = clientIp(c.req.header("x-forwarded-for"), "local");
    const wait = limiter.retryAfterSeconds(ip);
    if (wait > 0) {
      c.header("Retry-After", String(wait));
      return c.html(loginPage({ error: `Too many attempts. Try again in ${Math.ceil(wait / 60)} min.` }), 429);
    }
    const form = await c.req.parseBody();
    const password = typeof form.password === "string" ? form.password : "";
    const next = typeof form.next === "string" ? form.next : "/";
    if (!auth.checkPassword(password)) {
      limiter.fail(ip);
      await new Promise((r) => setTimeout(r, 400));
      console.warn(JSON.stringify({ event: "login_failed", ip }));
      return c.html(loginPage({ error: "Wrong password.", next }), 401);
    }
    limiter.success(ip);
    const { token, maxAgeSeconds } = auth.issue(form.remember === "1");
    setCookie(c, COOKIE, token, { httpOnly: true, secure: cfg.secureCookies, sameSite: "Lax", path: "/", maxAge: maxAgeSeconds });
    return c.redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/", 303);
  });

  app.post("/logout", (c) => {
    deleteCookie(c, COOKIE, { path: "/" });
    return c.redirect("/login", 303);
  });

  // Tout le reste exige une session.
  app.use("*", async (c, next) => {
    if (auth.verify(getCookie(c, COOKIE))) return next();
    if (c.req.path.startsWith("/api/")) return c.json({ error: "unauthorized" }, 401);
    return c.redirect(`/login?next=${encodeURIComponent(c.req.path)}`, 303);
  });

  // Requêtes qui modifient quelque chose : même origine obligatoire.
  app.use("/api/*", async (c, next) => {
    if (c.req.method !== "GET") {
      const origin = c.req.header("origin");
      const host = c.req.header("host");
      if (origin && host && new URL(origin).host !== host) return c.json({ error: "bad origin" }, 403);
    }
    return next();
  });

  app.get("/api/state", (c) => {
    c.header("Cache-Control", "no-store");
    return c.json(store.snapshot());
  });

  app.get("/api/stream", (c) => {
    c.header("Cache-Control", "no-cache");
    c.header("X-Accel-Buffering", "no");
    return streamSSE(c, async (stream) => {
      const snap = store.snapshot();
      await stream.writeSSE({ event: "snapshot", data: JSON.stringify(snap), id: String(snap.version), retry: 1000 });
      const queue: string[] = [];
      let wake: (() => void) | null = null;
      const unsubscribe = store.subscribe((id, entry, version) => {
        queue.push(JSON.stringify({ id, entry, version }));
        wake?.();
      });
      const started = Date.now();
      stream.onAbort(() => { unsubscribe(); wake?.(); });
      try {
        while (!stream.aborted && Date.now() - started < SSE_MAX_MS) {
          while (queue.length) await stream.writeSSE({ event: "patch", data: queue.shift()! });
          await new Promise<void>((r) => { wake = r; setTimeout(r, SSE_HEARTBEAT_MS); });
          wake = null;
          if (!queue.length) await stream.write(": keep-alive\n\n");
        }
      } finally {
        unsubscribe();
      }
    });
  });

  if (deps.push) {
    const push = deps.push;
    app.get("/api/push/key", (c) => c.json({ publicKey: push.publicKey }));
    app.post("/api/push/subscribe", async (c) => {
      const body = await c.req.json().catch(() => null);
      if (!body?.subscription?.endpoint) return c.json({ error: "subscription required" }, 400);
      await push.subscribe(body.subscription, body.prefs ?? {});
      return c.json({ ok: true });
    });
    app.post("/api/push/unsubscribe", async (c) => {
      const body = await c.req.json().catch(() => null);
      if (body?.endpoint) await push.unsubscribe(body.endpoint);
      return c.json({ ok: true });
    });
    app.post("/api/push/test", async (c) => {
      const body = await c.req.json().catch(() => null);
      const sent = body?.endpoint ? await push.test(body.endpoint) : false;
      return c.json({ ok: sent });
    });
  }

  // Fichiers de l'app : ressources versionnées en cache long, page d'entrée jamais en cache.
  app.use("/assets/*", async (c, next) => {
    await next();
    c.header("Cache-Control", "public, max-age=31536000, immutable");
  });
  app.use("*", serveStatic({ root: cfg.staticDir }));
  app.get("*", (c: Context) => {
    if (!existsSync(indexPath)) return c.text("App not built", 503);
    c.header("Cache-Control", "no-cache");
    return c.html(readFileSync(indexPath, "utf8"));
  });

  return app;
}
