'use client';
import { getPodcast, getPodcastByFeed, listSubscriptions, setSubscribed, upsertPodcastFromFeed } from './db';
import type { ParsedFeed } from './feedParser';

export function normalizeFeedUrl(input: string): string {
  let url = input.trim();
  if (/^(feed|itpc|pcast):\/\//i.test(url)) url = 'https://' + url.replace(/^[a-z]+:\/\//i, '');
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  new URL(url);
  return url;
}

async function fetchFeed(url: string): Promise<{ feedUrl: string; feed: ParsedFeed }> {
  const res = await fetch(`/api/feed?url=${encodeURIComponent(url)}`);
  const body = (await res.json().catch(() => ({}))) as { error?: string; feedUrl?: string; feed?: ParsedFeed };
  if (!res.ok || !body.feed) throw new Error(body.error ?? `Feed request failed (${res.status})`);
  return { feedUrl: url, feed: body.feed };
}

/** Stored under the URL the user/directory gave us (stable key for sync/OPML), not the post-redirect URL. */
export async function refreshFeed(feedUrl: string, fallbackArtwork?: string | null): Promise<number> {
  const { feed } = await fetchFeed(feedUrl);
  return upsertPodcastFromFeed(feedUrl, feed, fallbackArtwork);
}
export async function subscribeToFeed(raw: string, fallbackArtwork?: string | null): Promise<number> {
  const id = await refreshFeed(normalizeFeedUrl(raw), fallbackArtwork);
  await setSubscribed(id, true);
  return id;
}
export async function openFeed(raw: string, fallbackArtwork?: string | null): Promise<number> {
  const url = normalizeFeedUrl(raw);
  const existing = await getPodcastByFeed(url);
  if (existing && Date.now() - existing.lastRefreshed < 10 * 60 * 1000) return existing.id;
  return refreshFeed(url, fallbackArtwork);
}
export async function refreshPodcast(id: number): Promise<void> {
  const p = await getPodcast(id);
  if (p) await refreshFeed(p.feedUrl);
}
export async function refreshAll(): Promise<{ ok: number; failed: number }> {
  const queue = [...(await listSubscriptions())];
  let ok = 0, failed = 0;
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      try { await refreshFeed(p.feedUrl); ok++; } catch { failed++; }
    }
  }));
  return { ok, failed };
}
