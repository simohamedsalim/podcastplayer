'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './Icon';
import { MiniPlayer } from './MiniPlayer';
import { FullPlayer } from './FullPlayer';
import { dlFailStale, getDb, kvGet, kvSet } from '@/lib/db';
import { refreshAll } from '@/lib/feeds';
import { initPlayer } from '@/lib/player';
import { useTick } from '@/store/tick';

const NAV = [
  { href: '/', label: 'Latest', icon: 'latest' },
  { href: '/library', label: 'Library', icon: 'lib' },
  { href: '/discover', label: 'Discover', icon: 'disc' },
  { href: '/queue', label: 'Up next', icon: 'list' },
  { href: '/offline', label: 'Offline', icon: 'down' },
];
const REFRESH_EVERY_MS = 30 * 60 * 1000;

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      await getDb();
      await dlFailStale();
      await initPlayer();
      setReady(true);
      if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
        navigator.serviceWorker.register('/sw.js').catch(() => undefined);
      }
      const last = Number((await kvGet('last_refresh_all')) ?? '0');
      if (Date.now() - last > REFRESH_EVERY_MS) {
        await kvSet('last_refresh_all', String(Date.now()));
        await refreshAll();
        useTick.getState().bump();
      }
    })().catch((e) => setFatal(e instanceof Error ? e.message : String(e)));
  }, []);

  if (fatal) {
    return <div className="p-6 text-danger">Startup failed: {fatal}. This app needs IndexedDB (private browsing may block it).</div>;
  }
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto w-full max-w-3xl flex-1 pb-44 pt-[env(safe-area-inset-top)]">{ready ? children : <p className="p-8 text-center text-mute">Loading…</p>}</main>
      <div className="fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)] bg-surface">
        <MiniPlayer />
        <nav className="border-t border-line">
          <ul className="mx-auto flex max-w-3xl">
            {NAV.map((n) => {
              const active = n.href === '/' ? path === '/' : path.startsWith(n.href);
              return (
                <li key={n.href} className="flex-1">
                  <Link href={n.href} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${active ? 'text-accent' : 'text-mute'}`}>
                    <Icon name={n.icon} size={22} />{n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
      <FullPlayer />
    </div>
  );
}
