'use client';
import { useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { getPodcast, listEpisodes, setPlayed, setSubscribed } from '@/lib/db';
import { refreshPodcast } from '@/lib/feeds';
import { useLive } from '@/lib/useLive';
import { useTick } from '@/store/tick';
import { Artwork } from '@/components/Artwork';
import { EpisodeItem } from '@/components/EpisodeItem';
import { Empty } from '@/components/Page';
import { formatDate, formatDurationShort } from '@/lib/format';

export default function PodcastPage() {
  const { id } = useParams<{ id: string }>();
  const focus = Number(useSearchParams().get('ep') ?? 0);
  const pid = Number(id);
  const pod = useLive(() => getPodcast(pid), [pid]);
  const eps = useLive(() => listEpisodes(pid), [pid]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const p = pod.data;
  if (pod.loading) return <Empty>Loading…</Empty>;
  if (!p) return <Empty>Podcast not found.</Empty>;
  const bump = () => useTick.getState().bump();
  const detail = focus ? eps.data?.find((e) => e.id === focus) : undefined;
  return (
    <>
      <div className="space-y-3 p-4">
        <div className="flex gap-4">
          <Artwork src={p.artworkUrl} size={110} title={p.title} className="rounded-2xl" />
          <div className="flex min-w-0 flex-col justify-center"><h1 className="text-lg font-bold leading-snug">{p.title}</h1><p className="text-mute">{p.author}</p></div>
        </div>
        <div className="flex gap-2">
          <button className={`flex-1 rounded-2xl py-3 font-bold ${p.subscribed ? 'bg-hi' : 'bg-accent text-black'}`} onClick={() => void setSubscribed(p.id, !p.subscribed).then(bump)}>{p.subscribed ? 'Subscribed ✓' : 'Subscribe'}</button>
          <button className="rounded-2xl bg-hi px-5 font-semibold disabled:opacity-50" disabled={busy} onClick={async () => { setBusy(true); setErr(null); try { await refreshPodcast(p.id); bump(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } setBusy(false); }}>{busy ? '…' : 'Refresh'}</button>
        </div>
        {err && <p className="text-danger">{err}</p>}
        <p className="line-clamp-5 text-sm text-mute">{p.description}</p>
      </div>
      {detail && (
        <div className="mx-4 mb-3 rounded-2xl bg-surface p-4">
          <p className="font-bold">{detail.title}</p>
          <p className="text-xs text-mute">{[formatDate(detail.publishedAt), formatDurationShort(detail.durationSec)].filter(Boolean).join(' · ')}</p>
          <button className="mt-2 rounded-full bg-hi px-3 py-1 text-sm" onClick={() => void setPlayed(detail.id, !detail.played).then(bump)}>{detail.played ? 'Mark as unplayed' : 'Mark as played'}</button>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">{detail.description || 'No description.'}</p>
        </div>
      )}
      <ul>{(eps.data ?? []).map((e) => <EpisodeItem key={e.id} ep={e} showPodcast={false} />)}</ul>
    </>
  );
}
