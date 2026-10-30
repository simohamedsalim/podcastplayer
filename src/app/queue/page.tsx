'use client';
import { getQueue, queueClear, queueRemove, queueReorder } from '@/lib/db';
import { playEpisode } from '@/lib/player';
import { useLive } from '@/lib/useLive';
import { useTick } from '@/store/tick';
import { Artwork } from '@/components/Artwork';
import { Icon } from '@/components/Icon';
import { Empty, PageTitle } from '@/components/Page';

export default function Queue() {
  const { data } = useLive(getQueue);
  const items = data ?? [];
  const bump = () => useTick.getState().bump();
  const move = async (i: number, d: number) => {
    const ids = items.map((e) => e.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    await queueReorder(ids);
    bump();
  };
  return (
    <>
      <PageTitle right={items.length ? <button className="text-sm font-semibold text-accent" onClick={() => { if (confirm('Clear the whole queue?')) void queueClear().then(bump); }}>Clear</button> : undefined}>Up next</PageTitle>
      <ul>
        {items.map((e, i) => (
          <li key={e.id} className="flex items-center gap-3 border-b border-line p-3">
            <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => void playEpisode(e.id)}>
              <Artwork src={e.artworkUrl ?? e.podcastArtwork} size={52} title={e.podcastTitle} className="rounded-lg" />
              <span className="min-w-0"><span className="line-clamp-2 font-semibold">{e.title}</span><span className="block truncate text-xs text-mute">{e.podcastTitle}</span></span>
            </button>
            <button aria-label="Move up" className="text-mute" onClick={() => void move(i, -1)}><Icon name="up" /></button>
            <button aria-label="Move down" className="rotate-180 text-mute" onClick={() => void move(i, 1)}><Icon name="up" /></button>
            <button aria-label="Remove" className="text-danger" onClick={() => void queueRemove(e.id).then(bump)}><Icon name="x" /></button>
          </li>
        ))}
      </ul>
      {data && items.length === 0 && <Empty>The queue is empty. Use + on an episode. The queue is saved in this browser and survives restarts.</Empty>}
    </>
  );
}
