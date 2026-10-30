'use client';
import { dlDelete, dlPut, dlSaveBlob, getEpisode } from './db';
import { useTick } from '@/store/tick';

const controllers = new Map<number, AbortController>();
const bump = () => useTick.getState().bump();
export const isDownloading = (id: number) => controllers.has(id);

async function openStream(url: string, signal: AbortSignal): Promise<Response> {
  try {
    const direct = await fetch(url, { signal, mode: 'cors', credentials: 'omit' });
    if (direct.ok && direct.body) return direct;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    // CORS or mixed-content failure → fall through to the proxy
  }
  const proxied = await fetch(`/api/audio?url=${encodeURIComponent(url)}`, { signal });
  if (!proxied.ok || !proxied.body) throw new Error(`Download failed (HTTP ${proxied.status})`);
  return proxied;
}

export async function startDownload(episodeId: number): Promise<void> {
  if (controllers.has(episodeId)) return;
  const ep = await getEpisode(episodeId);
  if (!ep) throw new Error('Episode not found');
  if (ep.dl?.status === 'done') return;
  const ctrl = new AbortController();
  controllers.set(episodeId, ctrl);
  await dlPut({ episodeId, status: 'downloading', bytes: 0, total: 0 });
  bump();
  try {
    void navigator.storage?.persist?.();
    const res = await openStream(ep.audioUrl, ctrl.signal);
    const total = Number(res.headers.get('content-length') ?? 0);
    const reader = res.body!.getReader();
    const chunks: Uint8Array[] = [];
    let got = 0, lastTick = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.byteLength;
      const now = Date.now();
      if (now - lastTick > 600) { lastTick = now; await dlPut({ episodeId, status: 'downloading', bytes: got, total }); bump(); }
    }
    const mime = res.headers.get('content-type')?.split(';')[0] || 'audio/mpeg';
    const blob = new Blob(chunks as BlobPart[], { type: mime.startsWith('audio/') || mime.startsWith('video/') ? mime : 'audio/mpeg' });
    await dlSaveBlob(episodeId, blob, { episodeId, status: 'done', bytes: blob.size, total: blob.size });
  } catch (e) {
    if ((e as Error).name === 'AbortError') await dlDelete(episodeId);
    else await dlPut({ episodeId, status: 'error', bytes: 0, total: 0, error: e instanceof Error ? e.message : String(e) });
  } finally {
    controllers.delete(episodeId);
    bump();
  }
}
export async function cancelOrRemoveDownload(episodeId: number): Promise<void> {
  const c = controllers.get(episodeId);
  if (c) { c.abort(); controllers.delete(episodeId); }
  await dlDelete(episodeId);
  bump();
}
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  const e = await navigator.storage?.estimate?.();
  return e ? { usage: e.usage ?? 0, quota: e.quota ?? 0 } : null;
}
