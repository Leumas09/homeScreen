// Actualités locales (Randwick, Maroubra et alentours) en anglais : Google News RSS, qui regroupe
// les médias locaux et les communiqués du conseil. Le modèle de Foundry trie et résume ;
// sans modèle, un filtre par mots-clés garantit au moins des titres locaux.
import type { News, NewsItem } from "@maroubra/core";
import { XMLParser } from "fast-xml-parser";
import { createHash } from "node:crypto";
import { fetchText } from "../http";
import type { Collector } from "../collector";
import type { Llm } from "../llm";

export const PLACES = ["Maroubra", "Randwick", "Coogee", "Malabar", "Matraville", "Kingsford", "Little Bay", "La Perouse", "Kensington", "Clovelly", "South Coogee", "Chifley", "Phillip Bay"];

export function newsUrl(): string {
  const q = `(${PLACES.map((p) => (p.includes(" ") ? `"${p}"` : p)).join(" OR ")}) when:7d`;
  return `https://news.google.com/rss/search?${new URLSearchParams({ q, hl: "en-AU", gl: "AU", ceid: "AU:en" })}`;
}

export function parseRss(xml: string): NewsItem[] {
  const doc = new XMLParser({ ignoreAttributes: false }).parse(xml);
  const items = [doc?.rss?.channel?.item ?? []].flat() as { title: string; link: string; pubDate: string; source?: string | { "#text": string } }[];
  return items.map((it) => {
    const source = typeof it.source === "string" ? it.source : it.source?.["#text"] ?? "";
    const title = String(it.title).replace(new RegExp(`\\s+-\\s+${source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), "");
    return {
      id: createHash("sha1").update(it.link).digest("hex").slice(0, 12),
      title, link: it.link, source, published: new Date(it.pubDate).toISOString(), summary: null, topic: null, local: null,
    };
  });
}

/** Regroupe les reprises d'une même dépêche (titres presque identiques). */
export function dedupe(items: NewsItem[]): NewsItem[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(" ").filter((w) => w.length > 3);
  const out: NewsItem[] = [];
  for (const it of items.sort((a, b) => b.published.localeCompare(a.published))) {
    const w = new Set(norm(it.title));
    const dup = out.some((o) => {
      const ow = norm(o.title);
      const common = ow.filter((x) => w.has(x)).length;
      return common / Math.max(1, Math.min(ow.length, w.size)) >= 0.7;
    });
    if (!dup) out.push(it);
  }
  return out;
}

export const keywordLocal = (title: string) => PLACES.some((p) => title.toLowerCase().includes(p.toLowerCase()));

export function newsCollector(llm: Llm | null): Collector<News> {
  const triaged = new Map<string, Pick<NewsItem, "summary" | "topic" | "local">>();
  return {
    id: "news",
    everyMs: 20 * 60e3,
    staleAfterMs: 6 * 3600e3,
    run: async () => {
      const items = dedupe(parseRss(await fetchText(newsUrl()))).slice(0, 40);
      const todo = items.filter((i) => !triaged.has(i.id));
      let by: News["triagedBy"] = "keywords";
      if (llm && todo.length) {
        try {
          const res = await llm.triageNews(todo.map((i) => ({ id: i.id, title: i.title, source: i.source })));
          for (const r of res) triaged.set(r.id, { local: r.local, topic: r.topic, summary: r.summary });
          by = "model";
        } catch (err) {
          console.error(JSON.stringify({ event: "news_triage_failed", error: String(err) }));
        }
      } else if (llm) by = "model";
      const out = items.map((i) => ({ ...i, ...(triaged.get(i.id) ?? { local: keywordLocal(i.title) }) }));
      return { items: out.filter((i) => i.local !== false).slice(0, 25), triagedBy: by };
    },
  };
}
