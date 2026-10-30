'use client';
import Link from 'next/link';
import { listSubscriptions } from '@/lib/db';
import { useLive } from '@/lib/useLive';
import { Artwork } from '@/components/Artwork';
import { Empty, PageTitle } from '@/components/Page';

export default function Library() {
  const { data } = useLive(listSubscriptions);
  return (
    <>
      <PageTitle right={<Link href="/settings" className="rounded-full bg-hi px-4 py-1.5 text-sm font-semibold">Settings</Link>}>Library</PageTitle>
      <ul className="grid grid-cols-3 gap-3 p-4 sm:grid-cols-4">
        {(data ?? []).map((p) => (
          <li key={p.id}>
            <Link href={`/podcast/${p.id}`} className="block">
              <Artwork src={p.artworkUrl} size={160} title={p.title} className="aspect-square !h-auto !w-full rounded-2xl" />
              <p className="mt-1.5 line-clamp-2 text-xs font-medium">{p.title}</p>
            </Link>
          </li>
        ))}
      </ul>
      {data && data.length === 0 && <Empty>Your subscriptions will appear here. You can also import an OPML file from Settings (e.g. exported from Pocket Casts).</Empty>}
    </>
  );
}
