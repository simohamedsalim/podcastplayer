'use client';
import {
  getEpisode, getQueue, kvGet, kvSet, queueAdd, queueRemove, saveDuration, saveProgress, dlGetBlob, type EpisodeView,
} from './db';
import { usePlayer } from '@/store/player';
import { useTick } from '@/store/tick';

export const SKIP_BACK_SEC = 15;
export const SKIP_FORWARD_SEC = 30;
export const RATES = [0.8, 1, 1.2, 1.5, 1.75, 2, 2.5, 3];
const SAVE_EVERY_MS = 5000;

let audio: HTMLAudioElement | null = null;
let objectUrl: string | null = null;
let usingProxy = false;
let pendingSeek: number | null = null;
let lastSave = 0;
let lastPosState = 0;
let sleepTimer: ReturnType<typeof setTimeout> | null = null;
let advancing = false;
let initialised = false;

const set = usePlayer.getState().set;
const st = () => usePlayer.getState();
const bump = () => useTick.getState().bump();

function el(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.preload = 'auto';
    audio.setAttribute('playsinline', '');
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('durationchange', onDuration);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('play', () => { set({ playing: true }); updatePlaybackState(); });
    audio.addEventListener('pause', () => { set({ playing: false }); updatePlaybackState(); void persist(); });
    audio.addEventListener('waiting', () => set({ buffering: true }));
    audio.addEventListener('playing', () => set({ buffering: false, error: null }));
    audio.addEventListener('canplay', () => set({ buffering: false }));
    audio.addEventListener('ended', () => { void onEnded(); });
    audio.addEventListener('error', onError);
  }
  return audio;
}

function onLoaded(): void {
  const a = el();
  if (pendingSeek !== null) { a.currentTime = pendingSeek; pendingSeek = null; }
  a.playbackRate = st().rate;
}
function onDuration(): void {
  const a = el();
  const cur = st().current;
  if (cur && Number.isFinite(a.duration) && a.duration > 0) {
    set({ durationSec: a.duration });
    void saveDuration(cur.id, a.duration);
  }
}
function onTime(): void {
  const a = el();
  const cur = st().current;
  if (!cur) return;
  if (pendingSeek === null) set({ positionSec: a.currentTime });
  const now = Date.now();
  if (!a.paused && now - lastSave > SAVE_EVERY_MS) { lastSave = now; void saveProgress(cur.id, a.currentTime); }
  if (now - lastPosState > 1000) { lastPosState = now; updatePositionState(); }
}
function onError(): void {
  const a = el();
  const cur = st().current;
  if (!cur) return;
  // Direct playback failed (mixed content, hotlink protection…): retry once through the server proxy.
  if (!usingProxy && !objectUrl) {
    usingProxy = true;
    const resumeAt = a.currentTime || st().positionSec;
    pendingSeek = resumeAt > 1 ? resumeAt : null;
    a.src = `/api/audio?url=${encodeURIComponent(cur.audioUrl)}`;
    if (st().playing || st().buffering) void a.play().catch(() => undefined);
    return;
  }
  set({ error: 'This episode could not be played. Check your connection or try another episode.', buffering: false, playing: false });
}

async function onEnded(): Promise<void> {
  const cur = st().current;
  if (!cur || advancing) return;
  advancing = true;
  try {
    await saveProgress(cur.id, 0, true);
    await queueRemove(cur.id);
    bump();
    const next = (await getQueue()).find((e) => e.id !== cur.id);
    if (next) await playEpisode(next.id);
    else { set({ playing: false, positionSec: 0 }); await kvSet('now_playing', ''); clearMediaSession(); }
  } finally { advancing = false; }
}

async function persist(): Promise<void> {
  const cur = st().current;
  if (cur) await saveProgress(cur.id, el().currentTime || st().positionSec);
}

async function setSource(ep: EpisodeView): Promise<void> {
  const a = el();
  if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
  usingProxy = false;
  if (ep.dl?.status === 'done') {
    const blob = await dlGetBlob(ep.id);
    if (blob) { objectUrl = URL.createObjectURL(blob); a.src = objectUrl; return; }
  }
  a.src = ep.audioUrl;
}

async function load(ep: EpisodeView, autoplay: boolean): Promise<void> {
  const a = el();
  const resumeAt = ep.played ? 0 : ep.positionSec;
  pendingSeek = resumeAt > 3 ? resumeAt : null;
  set({ current: ep, positionSec: resumeAt, durationSec: ep.durationSec, error: null, buffering: autoplay, playing: false });
  await setSource(ep);
  a.playbackRate = st().rate;
  a.load();
  applyMetadata(ep);
  await kvSet('now_playing', String(ep.id));
  if (autoplay) await a.play().catch((e) => set({ error: e instanceof Error ? e.message : 'Playback blocked', buffering: false }));
}

export async function initPlayer(): Promise<void> {
  if (initialised) return;
  initialised = true;
  const rate = Number((await kvGet('rate')) ?? '1');
  if (RATES.includes(rate)) set({ rate });
  registerMediaSessionHandlers();
  const id = Number((await kvGet('now_playing')) || 0);
  if (id) { const ep = await getEpisode(id); if (ep) await load(ep, false); }
  window.addEventListener('pagehide', () => { void persist(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void persist(); });
}

export async function playEpisode(id: number): Promise<void> {
  try {
    const prev = st().current;
    if (prev?.id === id) { await el().play(); return; }
    if (prev) await saveProgress(prev.id, el().currentTime || st().positionSec);
    const ep = await getEpisode(id);
    if (!ep) throw new Error('Episode not found');
    await queueRemove(id);
    await load(ep, true);
    bump();
  } catch (e) {
    set({ error: e instanceof Error ? e.message : String(e), buffering: false });
  }
}
/** Must be called from a user gesture on first play (browser autoplay policy) – all UI calls satisfy this. */
export async function togglePlay(): Promise<void> {
  if (!st().current) return;
  const a = el();
  if (a.paused) await a.play().catch((e) => set({ error: e instanceof Error ? e.message : 'Playback blocked' }));
  else a.pause();
}
export function seekTo(sec: number): void {
  const max = st().durationSec > 0 ? st().durationSec : Number.MAX_SAFE_INTEGER;
  const t = Math.max(0, Math.min(sec, max));
  set({ positionSec: t });
  el().currentTime = t;
  updatePositionState();
}
export const skipBack = () => seekTo(el().currentTime - SKIP_BACK_SEC);
export const skipForward = () => seekTo(el().currentTime + SKIP_FORWARD_SEC);
export async function setRate(rate: number): Promise<void> {
  set({ rate });
  el().playbackRate = rate;
  await kvSet('rate', String(rate));
  updatePositionState();
}
export async function playNext(): Promise<void> {
  const cur = st().current;
  const next = (await getQueue()).find((e) => e.id !== cur?.id);
  if (next) await playEpisode(next.id);
}
export async function enqueue(id: number, atFront = false): Promise<void> {
  if (st().current?.id === id) return;
  await queueAdd(id, atFront);
  bump();
}
export function setSleepTimer(minutes: number | null): void {
  if (sleepTimer) clearTimeout(sleepTimer);
  sleepTimer = null;
  if (!minutes) { set({ sleepEndsAt: null }); return; }
  set({ sleepEndsAt: Date.now() + minutes * 60000 });
  sleepTimer = setTimeout(() => { sleepTimer = null; set({ sleepEndsAt: null }); el().pause(); }, minutes * 60000);
}

// ---- Media Session (notification, lock screen, headset/Bluetooth buttons)
function applyMetadata(ep: EpisodeView): void {
  if (!('mediaSession' in navigator)) return;
  const art = ep.artworkUrl ?? ep.podcastArtwork;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: ep.title,
    artist: ep.podcastTitle,
    album: ep.podcastTitle,
    artwork: art ? [{ src: art, sizes: '512x512' }] : [],
  });
}
function clearMediaSession(): void {
  if ('mediaSession' in navigator) { navigator.mediaSession.metadata = null; navigator.mediaSession.playbackState = 'none'; }
}
function updatePlaybackState(): void {
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = el().paused ? 'paused' : 'playing';
}
function updatePositionState(): void {
  if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
  const a = el();
  if (!Number.isFinite(a.duration) || a.duration <= 0) return;
  try {
    navigator.mediaSession.setPositionState({ duration: a.duration, playbackRate: a.playbackRate || 1, position: Math.min(a.currentTime, a.duration) });
  } catch { /* some browsers reject transient inconsistent values */ }
}
function registerMediaSessionHandlers(): void {
  if (!('mediaSession' in navigator)) return;
  const h = (action: MediaSessionAction, fn: MediaSessionActionHandler) => {
    try { navigator.mediaSession.setActionHandler(action, fn); } catch { /* unsupported action */ }
  };
  h('play', () => { void togglePlay(); });
  h('pause', () => el().pause());
  h('seekbackward', (d) => seekTo(el().currentTime - (d.seekOffset ?? SKIP_BACK_SEC)));
  h('seekforward', (d) => seekTo(el().currentTime + (d.seekOffset ?? SKIP_FORWARD_SEC)));
  h('seekto', (d) => { if (typeof d.seekTime === 'number') seekTo(d.seekTime); });
  h('previoustrack', () => skipBack());
  h('nexttrack', () => { void playNext(); });
  h('stop', () => el().pause());
}
