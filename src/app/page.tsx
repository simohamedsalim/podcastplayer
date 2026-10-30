'use client';
import { useState } from 'react';
import Link from 'next/link';
import { listLatest, listSubscriptions } from '@/lib/db';
import { refreshAll } from '@/lib/feeds';
import { useLive } from '@/lib/useLive';
import { useTick } from '@/store/tick';
import { EpisodeItem } from '@/components/EpisodeItem';
import { Empty, PageTitle } from '@/components/Page';

export default function Latest() {
  const { data } = useLive(() => listLatest(80));
  const subs = useLive(listSubscriptions);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const refresh = async () => {
    setBusy(true); setMsg(null);
    const r = await refreshAll();
    useTick.getState().bump();
    setMsg(r.failed ? `${r.failed} feed(s) could not be refreshed.` : null);
    setBusy(false);
  };
  return (
    <>
      <PageTitle right={<button className="rounded-full bg-hi px-4 py-1.5 text-sm font-semibold disabled:opacity-50" disabled={busy} onClick={() => void refresh()}>{busy ? 'Refreshing…' : 'Refresh'}</button>}>Latest</PageTitle>
      {msg && <p className="px-4 text-sm text-danger">{msg}</p>}
      <ul>{(data ?? []).map((e) => <EpisodeItem key={e.id} ep={e} />)}</ul>
      {data && data.length === 0 && (
        <Empty>
          {subs.data && subs.data.length > 0
            ? 'You are all caught up: no unplayed episodes. Pull new ones with Refresh.'
            : <>No subscriptions yet. Go to <Link href="/discover" className="text-accent">Discover</Link>, open a podcast and press <b>Subscribe</b> (or paste an RSS URL and press Add).</>}
        </Empty>
      )}
    </>
  );
}
