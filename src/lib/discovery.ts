/** Apple public, key-less endpoints (free, rate limited, subject to Apple's terms). Server-side only. */
export interface DiscoveryItem {
  key: string;
  title: string;
  author: string;
  artworkUrl: string | null;
  feedUrl: string | null;
  appleId: string | null;
}

export function upscaleArtwork(url: string | null | undefined, size = 400): string | null {
  if (!url) return null;
  return url.replace(/\/\d+x\d+(bb)?\.(jpg|png|webp)$/i, `/${size}x${size}bb.$2`);
}

export function mapChart(json: any): DiscoveryItem[] {
  const results: any[] = json?.feed?.results ?? [];
  return results
    .filter((r) => r && r.id && r.name)
    .map((r) => ({
      key: String(r.id),
      title: String(r.name),
      author: String(r.artistName ?? ''),
      artworkUrl: upscaleArtwork(r.artworkUrl100),
      feedUrl: null,
      appleId: String(r.id),
    }));
}

export function mapSearch(json: any): DiscoveryItem[] {
  const results: any[] = json?.results ?? [];
  return results
    .filter((r) => r && r.feedUrl && r.collectionName)
    .map((r) => ({
      key: String(r.collectionId ?? r.feedUrl),
      title: String(r.collectionName),
      author: String(r.artistName ?? ''),
      artworkUrl: r.artworkUrl600 ?? upscaleArtwork(r.artworkUrl100),
      feedUrl: String(r.feedUrl),
      appleId: r.collectionId ? String(r.collectionId) : null,
    }));
}

export function mapLookupFeeds(json: any): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of (json?.results ?? []) as any[]) {
    if (r?.collectionId && r?.feedUrl) out[String(r.collectionId)] = String(r.feedUrl);
  }
  return out;
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000), next: { revalidate: 900 } });
  if (!res.ok) throw new Error(`Upstream HTTP ${res.status}`);
  return res.json();
}

export async function fetchTopByCountry(cc: string, limit = 50): Promise<DiscoveryItem[]> {
  const chart = mapChart(await getJson(`https://rss.marketingtools.apple.com/api/v2/${cc}/podcasts/top/${limit}/podcasts.json`));
  if (chart.length === 0) return chart;
  const ids = chart.map((c) => c.appleId).filter(Boolean).join(',');
  let feeds: Record<string, string> = {};
  try {
    feeds = mapLookupFeeds(await getJson(`https://itunes.apple.com/lookup?id=${ids}&country=${cc}`));
  } catch {
    /* resolved lazily on open */
  }
  return chart.map((c) => ({ ...c, feedUrl: (c.appleId && feeds[c.appleId]) || null }));
}

export async function resolveFeedUrl(appleId: string, cc: string): Promise<string> {
  const map = mapLookupFeeds(await getJson(`https://itunes.apple.com/lookup?id=${encodeURIComponent(appleId)}&country=${cc}`));
  const url = map[appleId];
  if (!url) throw new Error('This podcast does not publish a public RSS feed.');
  return url;
}

export async function searchPodcasts(term: string, cc: string, limit = 30): Promise<DiscoveryItem[]> {
  return mapSearch(await getJson(`https://itunes.apple.com/search?media=podcast&entity=podcast&limit=${limit}&country=${cc}&term=${encodeURIComponent(term)}`));
}
