'use client';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ParsedFeed } from './feedParser';

export interface PodcastRow {
  id: number;
  feedUrl: string;
  title: string;
  author: string;
  description: string;
  artworkUrl: string | null;
  subscribed: boolean;
  subscribedAt: number | null;
  lastRefreshed: number;
}
export interface EpisodeRecord {
  id: number;
  podcastId: number;
  guid: string;
  title: string;
  description: string;
  audioUrl: string;
  publishedAt: number;
  durationSec: number;
  artworkUrl: string | null;
  played: boolean;
  positionSec: number;
  progressUpdatedAt: number;
}
export interface DownloadRecord {
  episodeId: number;
  status: 'downloading' | 'done' | 'error';
  bytes: number;
  total: number;
  error?: string;
}
export interface EpisodeView extends EpisodeRecord {
  podcastTitle: string;
  podcastArtwork: string | null;
  dl: DownloadRecord | undefined;
}

interface Schema extends DBSchema {
  podcasts: { key: number; value: PodcastRow; indexes: { feedUrl: string } };
  episodes: { key: number; value: EpisodeRecord; indexes: { podcastId: number; podcastGuid: [number, string] } };
  queue: { key: number; value: { episodeId: number; order: number }; indexes: { order: number } };
  downloads: { key: number; value: DownloadRecord };
  blobs: { key: number; value: Blob };
  kv: { key: string; value: string };
}

let dbp: Promise<IDBPDatabase<Schema>> | null = null;
export function getDb(): Promise<IDBPDatabase<Schema>> {
  if (!dbp) {
    dbp = openDB<Schema>('rawi', 1, {
      upgrade(db) {
        const p = db.createObjectStore('podcasts', { keyPath: 'id', autoIncrement: true });
        p.createIndex('feedUrl', 'feedUrl', { unique: true });
        const e = db.createObjectStore('episodes', { keyPath: 'id', autoIncrement: true });
        e.createIndex('podcastId', 'podcastId');
        e.createIndex('podcastGuid', ['podcastId', 'guid'], { unique: true });
        const q = db.createObjectStore('queue', { keyPath: 'episodeId' });
        q.createIndex('order', 'order');
        db.createObjectStore('downloads', { keyPath: 'episodeId' });
        db.createObjectStore('blobs');
        db.createObjectStore('kv');
      },
    });
    dbp.catch(() => { dbp = null; });
  }
  return dbp;
}

// ---- kv
export async function kvGet(key: string): Promise<string | null> { return (await (await getDb()).get('kv', key)) ?? null; }
export async function kvSet(key: string, value: string): Promise<void> { await (await getDb()).put('kv', value, key); }

// ---- podcasts
export async function upsertPodcastFromFeed(feedUrl: string, feed: ParsedFeed, fallbackArtwork?: string | null): Promise<number> {
  const db = await getDb();
  const tx = db.transaction(['podcasts', 'episodes'], 'readwrite');
  const pods = tx.objectStore('podcasts');
  const existing = await pods.index('feedUrl').get(feedUrl);
  const row: Omit<PodcastRow, 'id'> & { id?: number } = {
    ...(existing ?? { subscribed: false, subscribedAt: null }),
    feedUrl,
    title: feed.title,
    author: feed.author,
    description: feed.description,
    artworkUrl: feed.artworkUrl ?? existing?.artworkUrl ?? fallbackArtwork ?? null,
    lastRefreshed: Date.now(),
  };
  const id = Number(await pods.put(row as PodcastRow));
  const eps = tx.objectStore('episodes');
  const idx = eps.index('podcastGuid');
  for (const ep of feed.episodes) {
    const old = await idx.get([id, ep.guid]);
    // The `id` key must be ABSENT (not undefined) for new rows so the auto-increment generator is used.
    const record: Omit<EpisodeRecord, 'id'> = {
      podcastId: id,
      guid: ep.guid,
      title: ep.title,
      description: ep.description,
      audioUrl: ep.audioUrl,
      publishedAt: ep.publishedAt,
      durationSec: ep.durationSec > 0 ? ep.durationSec : (old?.durationSec ?? 0),
      artworkUrl: ep.artworkUrl,
      played: old?.played ?? false,
      positionSec: old?.positionSec ?? 0,
      progressUpdatedAt: old?.progressUpdatedAt ?? 0,
    };
    await eps.put(old ? { ...record, id: old.id } : (record as EpisodeRecord));
  }
  await tx.done;
  return id;
}
export async function setSubscribed(id: number, subscribed: boolean): Promise<void> {
  const db = await getDb();
  const p = await db.get('podcasts', id);
  if (p) await db.put('podcasts', { ...p, subscribed, subscribedAt: subscribed ? Date.now() : null });
}
export async function getPodcast(id: number): Promise<PodcastRow | undefined> { return (await getDb()).get('podcasts', id); }
export async function getPodcastByFeed(feedUrl: string): Promise<PodcastRow | undefined> { return (await getDb()).getFromIndex('podcasts', 'feedUrl', feedUrl); }
export async function listSubscriptions(): Promise<PodcastRow[]> {
  const all = await (await getDb()).getAll('podcasts');
  return all.filter((p) => p.subscribed).sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
}

// ---- episodes (views join podcast + download info)
async function toViews(eps: EpisodeRecord[]): Promise<EpisodeView[]> {
  const db = await getDb();
  const tx = db.transaction(['podcasts', 'downloads'], 'readonly');
  const podCache = new Map<number, PodcastRow | undefined>();
  const out: EpisodeView[] = [];
  for (const e of eps) {
    if (!podCache.has(e.podcastId)) podCache.set(e.podcastId, await tx.objectStore('podcasts').get(e.podcastId));
    const p = podCache.get(e.podcastId);
    out.push({ ...e, podcastTitle: p?.title ?? '', podcastArtwork: p?.artworkUrl ?? null, dl: await tx.objectStore('downloads').get(e.id) });
  }
  return out;
}
export async function listEpisodes(podcastId: number, limit = 500): Promise<EpisodeView[]> {
  const eps = await (await getDb()).getAllFromIndex('episodes', 'podcastId', podcastId);
  return toViews(eps.sort((a, b) => b.publishedAt - a.publishedAt).slice(0, limit));
}
export async function getEpisode(id: number): Promise<EpisodeView | null> {
  const e = await (await getDb()).get('episodes', id);
  return e ? (await toViews([e]))[0] ?? null : null;
}
export async function listLatest(limit = 80): Promise<EpisodeView[]> {
  const db = await getDb();
  const subs = await listSubscriptions();
  const all: EpisodeRecord[] = [];
  for (const s of subs) {
    const eps = await db.getAllFromIndex('episodes', 'podcastId', s.id);
    all.push(...eps.filter((e) => !e.played));
  }
  return toViews(all.sort((a, b) => b.publishedAt - a.publishedAt).slice(0, limit));
}
export async function saveProgress(id: number, positionSec: number, played?: boolean): Promise<void> {
  const db = await getDb();
  const e = await db.get('episodes', id);
  if (e) await db.put('episodes', { ...e, positionSec, played: played ?? e.played, progressUpdatedAt: Date.now() });
}
export async function setPlayed(id: number, played: boolean): Promise<void> {
  const db = await getDb();
  const e = await db.get('episodes', id);
  if (e) await db.put('episodes', { ...e, played, positionSec: played ? 0 : e.positionSec, progressUpdatedAt: Date.now() });
}
export async function saveDuration(id: number, durationSec: number): Promise<void> {
  const db = await getDb();
  const e = await db.get('episodes', id);
  const d = Math.round(durationSec);
  if (e && (e.durationSec === 0 || Math.abs(e.durationSec - d) > 5)) await db.put('episodes', { ...e, durationSec: d });
}

// ---- queue
export async function getQueue(): Promise<EpisodeView[]> {
  const db = await getDb();
  const q = await db.getAllFromIndex('queue', 'order');
  const eps: EpisodeRecord[] = [];
  for (const item of q) { const e = await db.get('episodes', item.episodeId); if (e) eps.push(e); }
  return toViews(eps);
}
export async function queueAdd(episodeId: number, atFront = false): Promise<void> {
  const db = await getDb();
  const q = await db.getAll('queue');
  const orders = q.map((i) => i.order);
  const order = q.length === 0 ? 0 : atFront ? Math.min(...orders) - 1 : Math.max(...orders) + 1;
  await db.put('queue', { episodeId, order });
}
export async function queueRemove(episodeId: number): Promise<void> { await (await getDb()).delete('queue', episodeId); }
export async function queueClear(): Promise<void> { await (await getDb()).clear('queue'); }
export async function queueReorder(ids: number[]): Promise<void> {
  const tx = (await getDb()).transaction('queue', 'readwrite');
  for (let i = 0; i < ids.length; i++) await tx.store.put({ episodeId: ids[i]!, order: i });
  await tx.done;
}

// ---- downloads
export async function dlPut(rec: DownloadRecord): Promise<void> { await (await getDb()).put('downloads', rec); }
export async function dlSaveBlob(episodeId: number, blob: Blob, rec: DownloadRecord): Promise<void> {
  const tx = (await getDb()).transaction(['blobs', 'downloads'], 'readwrite');
  await tx.objectStore('blobs').put(blob, episodeId);
  await tx.objectStore('downloads').put(rec);
  await tx.done;
}
export async function dlGetBlob(episodeId: number): Promise<Blob | undefined> { return (await getDb()).get('blobs', episodeId); }
export async function dlDelete(episodeId: number): Promise<void> {
  const tx = (await getDb()).transaction(['blobs', 'downloads'], 'readwrite');
  await tx.objectStore('blobs').delete(episodeId);
  await tx.objectStore('downloads').delete(episodeId);
  await tx.done;
}
export async function listDownloads(): Promise<EpisodeView[]> {
  const db = await getDb();
  const recs = await db.getAll('downloads');
  const eps: EpisodeRecord[] = [];
  for (const r of recs) { const e = await db.get('episodes', r.episodeId); if (e) eps.push(e); }
  return toViews(eps.sort((a, b) => b.publishedAt - a.publishedAt));
}
/** Downloads interrupted by a page close cannot resume: flag them so the user can retry. */
export async function dlFailStale(): Promise<void> {
  const db = await getDb();
  for (const r of await db.getAll('downloads')) if (r.status === 'downloading') await db.put('downloads', { ...r, status: 'error', error: 'Interrupted' });
}
