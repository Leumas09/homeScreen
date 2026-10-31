// Appels HTTP sortants : délai maximal, identification polie, erreurs lisibles.
const UA = "Maroubra/1.0 (family home screen; maroubra.apps.akakiwi.com)";

export async function fetchText(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<string> {
  const res = await fetch(url, {
    ...init,
    headers: { "User-Agent": UA, Accept: "*/*", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(init.timeoutMs ?? 20_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${new URL(url).host}`);
  return res.text();
}

export async function fetchJson<T = unknown>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const text = await fetchText(url, { ...init, headers: { Accept: "application/json", ...(init.headers ?? {}) } });
  return JSON.parse(text) as T;
}

export async function fetchBytes(url: string, timeoutMs = 30_000): Promise<ArrayBuffer> {
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${res.status} for ${new URL(url).host}`);
  return res.arrayBuffer();
}
