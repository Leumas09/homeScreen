// Notifications Web Push (VAPID). Abonnements gardés dans Table Storage pour survivre aux redémarrages.
// Chaque appareil choisit ses types de moments ; heures calmes et budget quotidien évitent le harcèlement.
import { createHash } from "node:crypto";
import webpush, { type PushSubscription } from "web-push";
import type { Moment } from "@maroubra/core";
import type { TableClient } from "@azure/data-tables";

export interface Prefs {
  kinds?: Moment["kind"][];
  quiet?: boolean; // respecter les heures calmes (21:30 à 07:00)
}

interface Sub {
  subscription: PushSubscription;
  prefs: Prefs;
  sentDay: string;
  sentCount: number;
}

const DEFAULT_KINDS: Moment["kind"][] = ["beach", "aurora", "fire", "iss", "moon", "rain"];
const DAILY_BUDGET = 3;
const keyOf = (endpoint: string) => createHash("sha256").update(endpoint).digest("hex").slice(0, 32);

function sydneyClock(now: Date): { day: string; minutes: number } {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return { day: `${g("year")}-${g("month")}-${g("day")}`, minutes: Number(g("hour")) * 60 + Number(g("minute")) };
}

export class Push {
  private subs = new Map<string, Sub>();
  private sent = new Set<string>();
  readonly publicKey: string;

  constructor(keys: { publicKey: string; privateKey: string; subject: string }, private table: TableClient | null) {
    webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
    this.publicKey = keys.publicKey;
  }

  async load() {
    if (!this.table) return;
    try {
      for await (const e of this.table.listEntities<{ json: string }>({ queryOptions: { filter: "PartitionKey eq 'sub'" } })) {
        const s = JSON.parse(e.json) as Sub;
        this.subs.set(e.rowKey!, s);
      }
    } catch (err) {
      console.error(JSON.stringify({ event: "push_load_failed", error: String(err) }));
    }
  }

  private async save(id: string, s: Sub) {
    this.subs.set(id, s);
    await this.table?.upsertEntity({ partitionKey: "sub", rowKey: id, json: JSON.stringify(s) }).catch(() => {});
  }

  async subscribe(subscription: PushSubscription, prefs: Prefs) {
    const id = keyOf(subscription.endpoint);
    const prev = this.subs.get(id);
    await this.save(id, { subscription, prefs: { kinds: prefs.kinds ?? DEFAULT_KINDS, quiet: prefs.quiet ?? true }, sentDay: prev?.sentDay ?? "", sentCount: prev?.sentCount ?? 0 });
  }

  async unsubscribe(endpoint: string) {
    const id = keyOf(endpoint);
    this.subs.delete(id);
    await this.table?.deleteEntity("sub", id).catch(() => {});
  }

  async test(endpoint: string): Promise<boolean> {
    const s = this.subs.get(keyOf(endpoint));
    if (!s) return false;
    return this.send(keyOf(endpoint), s, { title: "Maroubra", body: "Notifications are on. You will hear from the sea and the sky." });
  }

  /** Envoie les moments nouveaux aux appareils qui les ont choisis. */
  async dispatch(moments: Moment[], now = new Date()) {
    const { day, minutes } = sydneyClock(now);
    const quietNow = minutes >= 21 * 60 + 30 || minutes < 7 * 60;
    for (const m of moments) {
      if (this.sent.has(m.key)) continue;
      this.sent.add(m.key);
      for (const [id, s] of this.subs) {
        if (!(s.prefs.kinds ?? DEFAULT_KINDS).includes(m.kind)) continue;
        if (s.prefs.quiet !== false && quietNow && m.priority > 1) continue;
        if (s.sentDay !== day) { s.sentDay = day; s.sentCount = 0; }
        if (s.sentCount >= DAILY_BUDGET && m.priority > 1) continue;
        if (await this.send(id, s, { title: m.title, body: m.detail, tag: m.key })) {
          s.sentCount++;
          await this.save(id, s);
        }
      }
    }
    if (this.sent.size > 2000) this.sent = new Set([...this.sent].slice(-500));
  }

  private async send(id: string, s: Sub, payload: { title: string; body: string; tag?: string }): Promise<boolean> {
    try {
      await webpush.sendNotification(s.subscription, JSON.stringify(payload), { TTL: 3600 });
      return true;
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await this.unsubscribe(s.subscription.endpoint);
      else console.error(JSON.stringify({ event: "push_failed", id, code }));
      return false;
    }
  }
}
