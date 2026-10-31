// État normalisé en mémoire : une entrée par source, avec sa fraîcheur.
// Chaque mise à jour est diffusée aux flux SSE ouverts.
export interface Entry<T = unknown> {
  ok: boolean;
  data: T | null;
  /** Dernière réussite (ISO). */
  updatedAt: string | null;
  /** Dernière tentative (ISO). */
  checkedAt: string | null;
  error: string | null;
  /** Au-delà, la donnée est affichée comme périmée. */
  staleAfterMs: number;
}

export type Listener = (id: string, entry: Entry, version: number) => void;

export class Store {
  private entries = new Map<string, Entry>();
  private listeners = new Set<Listener>();
  version = 0;

  register(id: string, staleAfterMs: number) {
    if (!this.entries.has(id)) {
      this.entries.set(id, { ok: false, data: null, updatedAt: null, checkedAt: null, error: null, staleAfterMs });
    }
  }

  get<T>(id: string): Entry<T> | undefined {
    return this.entries.get(id) as Entry<T> | undefined;
  }

  data<T>(id: string): T | null {
    return (this.entries.get(id)?.data as T) ?? null;
  }

  success(id: string, data: unknown, at = new Date()) {
    const e = this.entries.get(id) ?? { staleAfterMs: 3600e3 } as Entry;
    const next: Entry = { ...e, ok: true, data, updatedAt: at.toISOString(), checkedAt: at.toISOString(), error: null };
    this.entries.set(id, next);
    this.emit(id, next);
  }

  failure(id: string, err: unknown, at = new Date()) {
    const e = this.entries.get(id) ?? { ok: false, data: null, updatedAt: null, staleAfterMs: 3600e3 } as Entry;
    // On garde la dernière donnée connue : l'écran ne se vide jamais à cause d'une panne.
    const next: Entry = { ...e, ok: false, checkedAt: at.toISOString(), error: String((err as Error)?.message ?? err).slice(0, 300) };
    this.entries.set(id, next);
    this.emit(id, next);
  }

  snapshot(): { version: number; sources: Record<string, Entry> } {
    return { version: this.version, sources: Object.fromEntries(this.entries) };
  }

  health(now = Date.now()) {
    return Object.fromEntries(
      [...this.entries].map(([id, e]) => [id, {
        ok: e.ok,
        ageSeconds: e.updatedAt ? Math.round((now - Date.parse(e.updatedAt)) / 1000) : null,
        stale: !e.updatedAt || now - Date.parse(e.updatedAt) > e.staleAfterMs,
        error: e.error,
      }]),
    );
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(id: string, entry: Entry) {
    this.version++;
    for (const fn of this.listeners) fn(id, entry, this.version);
  }
}
