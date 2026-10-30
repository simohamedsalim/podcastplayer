'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { COUNTRIES } from '@/lib/countries';
import type { DiscoveryItem } from '@/lib/discovery';
import { openFeed, subscribeToFeed } from '@/lib/feeds';
import { kvGet, kvSet } from '@/lib/db';
import { useTick } from '@/store/tick';
import { Artwork } from '@/components/Artwork';
import { Icon } from '@/components/Icon';
import { PageTitle } from '@/components/Page';

async function api<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
}

export default function Discover() {
  const router = useRouter();
  const [country, setCountry] = useState('ma');
  const [term, setTerm] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [rss, setRss] = useState('');
  const [items, setItems] = useState<DiscoveryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => { void kvGet('country').then((c) => c && setCountry(c)); }, []);
  useEffect(() => {
    let alive = true;
    setItems(null); setError(null);
    const url = submitted ? `/api/discover/search?q=${encodeURIComponent(submitted)}&cc=${country}` : `/api/discover/top?cc=${country}`;
    api<{ items: DiscoveryItem[] }>(url).then((r) => alive && setItems(r.items)).catch((e: Error) => alive && setError(e.message));
    return () => { alive = false; };
  }, [country, submitted]);

  const open = async (item: DiscoveryItem) => {
    setBusy(item.key);
    try {
      const feed = item.feedUrl ?? (item.appleId ? (await api<{ feedUrl: string }>(`/api/discover/resolve?id=${item.appleId}&cc=${country}`)).feedUrl : null);
      if (!feed) throw new Error('No RSS feed available for this podcast.');
      const id = await openFeed(feed, item.artworkUrl);
      useTick.getState().bump();
      router.push(`/podcast/${id}`);
    } catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  const addRss = async () => {
    if (!rss.trim()) return;
    setBusy('rss');
    try { const id = await subscribeToFeed(rss); useTick.getState().bump(); setRss(''); router.push(`/podcast/${id}`); }
    catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  const countryName = COUNTRIES.find((c) => c.code === country)?.name ?? country.toUpperCase();
  const field = 'w-full rounded-2xl border border-line bg-surface px-4 py-2.5 outline-none focus:border-accent';

  return (
    <>
      <PageTitle>Discover</PageTitle>
      <div className="space-y-2 px-4">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setSubmitted(term.trim()); }}>
          <input className={field} value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search podcasts" enterKeyHint="search" />
          {submitted && <button type="button" className="text-sm font-semibold text-accent" onClick={() => { setSubmitted(''); setTerm(''); }}>Charts</button>}
        </form>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void addRss(); }}>
          <input className={field} value={rss} onChange={(e) => setRss(e.target.value)} placeholder="…or paste an RSS feed URL" inputMode="url" autoCapitalize="none" autoCorrect="off" />
          <button className="rounded-2xl bg-accent px-5 font-bold text-black disabled:opacity-50" disabled={busy === 'rss'}>{busy === 'rss' ? '…' : 'Add'}</button>
        </form>
        <button className="flex items-center gap-1.5 py-1 font-semibold" onClick={() => setPicker(true)}>
          <Icon name="globe" size={18} className="text-accent" />{submitted ? 'Results' : 'Top podcasts'} · {countryName}<Icon name="chev" size={16} className="text-mute" />
        </button>
      </div>
      {error && <div className="p-4"><p className="text-danger">Could not load: {error}</p><p className="mt-2 text-sm text-mute">You can still add any podcast by pasting its RSS URL above.</p></div>}
      {!error && items === null && <p className="p-8 text-center text-mute">Loading…</p>}
      {items && items.length === 0 && <p className="p-8 text-center text-mute">No results.</p>}
      <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
        {(items ?? []).map((it, i) => (
          <li key={it.key}>
            <button className="block w-full text-left" onClick={() => void open(it)} disabled={busy === it.key}>
              <div className="relative">
                <Artwork src={it.artworkUrl} size={200} title={it.title} className="aspect-square !h-auto !w-full rounded-2xl" />
                {!submitted && <span className="absolute left-1.5 top-1.5 rounded-md bg-black/65 px-1.5 text-[11px]">#{i + 1}</span>}
                {busy === it.key && <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50 text-sm">Opening…</span>}
              </div>
              <p className="mt-1.5 line-clamp-2 font-semibold leading-snug">{it.title}</p>
              <p className="truncate text-xs text-mute">{it.author}</p>
            </button>
          </li>
        ))}
      </ul>
      {picker && (
        <div className="fixed inset-0 z-50 flex flex-col bg-bg pt-[env(safe-area-inset-top)]" role="dialog" aria-label="Choose a country">
          <div className="flex gap-2 p-3">
            <input autoFocus className={field} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter countries" />
            <button className="text-accent" onClick={() => setPicker(false)}>Close</button>
          </div>
          <ul className="flex-1 overflow-y-auto">
            {COUNTRIES.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase())).map((c) => (
              <li key={c.code}>
                <button className="flex w-full justify-between border-b border-line p-4 text-left" onClick={() => { setCountry(c.code); void kvSet('country', c.code); setSubmitted(''); setPicker(false); setFilter(''); }}>
                  {c.name}{c.code === country && <Icon name="check" className="text-accent" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
