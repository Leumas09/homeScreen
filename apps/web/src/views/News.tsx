import type { News as N, SourceEntry } from "@maroubra/core";
import { CardHead, Empty, Fresh } from "../components/bits";
import { shortDate, time } from "../lib/format";

type E<T> = (SourceEntry<T> & { stale: boolean; ageMin: number | null }) | null;

function ago(iso: string, now: Date): string {
  const h = (now.getTime() - Date.parse(iso)) / 3600e3;
  return h < 1 ? `${Math.max(1, Math.round(h * 60))} min ago` : h < 24 ? `${Math.round(h)} h ago` : `${shortDate(new Date(iso))}, ${time(new Date(iso))}`;
}

export function News({ e, now }: { e: E<N>; now: Date }) {
  const n = e?.data;
  return (
    <section aria-labelledby="news-title" style={{ display: "grid", gap: 16 }}>
      <div className="card">
        <CardHead title="Randwick and Maroubra news"><Fresh e={e} /></CardHead>
        <h1 id="news-title" className="sr-only">News</h1>
        {!n?.items.length ? <Empty>No local story in the last week.</Empty> : (
          <ul className="news">
            {n.items.map((it) => (
              <li key={it.id}>
                <a href={it.link} target="_blank" rel="noreferrer"><strong>{it.title}</strong></a>
                {it.summary && <p>{it.summary}</p>}
                <span className="muted">{it.source} · {ago(it.published, now)}{it.topic ? ` · ${it.topic}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="note">Local stories from the last 7 days via Google News. {n?.triagedBy === "model" ? "Sorted and summarised by our AI model from the headlines only." : "Filtered by suburb names."}</p>
      </div>
    </section>
  );
}
