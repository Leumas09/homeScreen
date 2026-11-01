// Page de connexion rendue par le serveur : fonctionne sans JavaScript, thème jour ou nuit du système.
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function loginPage(opts: { error?: string; next?: string } = {}): string {
  const next = opts.next && opts.next.startsWith("/") && !opts.next.startsWith("//") ? opts.next : "/";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Maroubra</title>
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<style>
:root{--bg:#eef3f5;--ink:#0e2a3b;--muted:#4f6878;--card:#fff;--accent:#0b6e99;--err:#9a2d0e;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#0b1016;--ink:#e6edf3;--muted:#8b98a8;--card:#121a23;--accent:#4cc9f0;--err:#ff8a7a;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:16px/1.4 system-ui,sans-serif;padding:16px}
form{background:var(--card);border-radius:24px;padding:28px;width:100%;max-width:380px;display:grid;gap:16px}
h1{margin:0;font-size:28px;letter-spacing:-.5px}p{margin:0;color:var(--muted)}
label{font-weight:600;font-size:14px}input[type=password]{width:100%;font:inherit;padding:14px;border-radius:14px;border:1.5px solid var(--muted);background:transparent;color:inherit;margin-top:6px}
.row{display:flex;gap:10px;align-items:center;min-height:44px}.row input{width:22px;height:22px}
button{font:inherit;font-weight:700;padding:14px;border:0;border-radius:14px;background:var(--accent);color:#fff;min-height:48px;cursor:pointer}
.err{color:var(--err);font-weight:600}:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
</style>
</head>
<body>
<form method="post" action="/login">
<h1>Maroubra</h1>
<p>The sky, the sea and the beach, for the family.</p>
${opts.error ? `<p class="err" role="alert">${esc(opts.error)}</p>` : ""}
<div><label for="pw">Family password</label><input id="pw" name="password" type="password" autocomplete="current-password" required autofocus></div>
<div class="row"><input id="remember" name="remember" type="checkbox" value="1" checked><label for="remember">Keep me signed in on this device</label></div>
<input type="hidden" name="next" value="${esc(next)}">
<button type="submit">Sign in</button>
</form>
</body>
</html>`;
}
