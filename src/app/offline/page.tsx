'use client';
import { listDownloads } from '@/lib/db';
import { useLive } from '@/lib/useLive';
import { EpisodeItem } from '@/components/EpisodeItem';
import { Empty, PageTitle } from '@/components/Page';
import { formatBytes } from '@/lib/format';

export default function Offline() {
  const { data } = useLive(listDownloads);
  const items = data ?? [];
  const total = items.filter((e) => e.dl?.status === 'done').reduce((n, e) => n + (e.dl?.bytes ?? 0), 0);
  return (
    <>
      <PageTitle>Offline</PageTitle>
      {items.length > 0 && <p className="px-4 pb-2 text-sm text-mute">{formatBytes(total)} stored in this browser. Tap the green check to delete an episode.</p>}
      <ul>{items.map((e) => <EpisodeItem key={e.id} ep={e} />)}</ul>
      {data && items.length === 0 && <Empty>No downloads yet.</Empty>}
    </>
  );
}
