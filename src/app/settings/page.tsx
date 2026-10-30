'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { listSubscriptions } from '@/lib/db';
import { refreshAll, subscribeToFeed } from '@/lib/feeds';
import { buildOpml, parseOpml } from '@/lib/opml';
import { storageEstimate } from '@/lib/downloads';
import { formatBytes } from '@/lib/format';
import { useTick } from '@/store/tick';
import { PageTitle } from '@/components/Page';

export default function Settings() {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const btn = 'w-full rounded-2xl bg-hi py-3 font-semibold disabled:opacity-50';
  useEffect(() => { void storageEstimate().then((e) => e && setUsage(`${formatBytes(e.usage)} used of ~${formatBytes(e.quota)} available to this site`)); }, []);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true); setStatus(null);
    try { setStatus(await fn()); } catch (e) { setStatus(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  return (
    <>
      <PageTitle right={<Link href="/library" className="text-sm text-accent">Back</Link>}>Settings</PageTitle>
      <div className="space-y-3 px-4">
        <button className={btn} disabled={busy} onClick={() => void run(async () => { const r = await refreshAll(); useTick.getState().bump(); return `${r.ok} refreshed, ${r.failed} failed.`; })}>Refresh all subscriptions</button>
        <button className={btn} disabled={busy} onClick={() => void run(async () => {
          const subs = await listSubscriptions();
          if (!subs.length) return 'No subscriptions to export.';
          const url = URL.createObjectURL(new Blob([buildOpml(subs.map((s) => ({ title: s.title, feedUrl: s.feedUrl })))], { type: 'text/x-opml' }));
          const a = document.createElement('a'); a.href = url; a.download = 'rawi-subscriptions.opml'; a.click();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
          return `Exported ${subs.length} subscriptions.`;
        })}>Export subscriptions (OPML)</button>
        <button className={btn} disabled={busy} onClick={() => file.current?.click()}>Import subscriptions (OPML)</button>
        <input ref={file} type="file" accept=".opml,.xml,text/xml,text/x-opml" className="hidden" onChange={(e) => {
          const f = e.target.files?.[0]; e.target.value = '';
          if (!f) return;
          void run(async () => {
            const urls = parseOpml(await f.text());
            let ok = 0, failed = 0;
            const queue = [...urls];
            await Promise.all(Array.from({ length: 4 }, async () => { for (let u = queue.shift(); u; u = queue.shift()) { try { await subscribeToFeed(u); ok++; } catch { failed++; } setStatus(`Importing… ${ok + failed}/${urls.length}`); } }));
            useTick.getState().bump();
            return `Imported ${ok} of ${urls.length} feeds${failed ? ` (${failed} failed)` : ''}.`;
          });
        }} />
        {status && <p className="text-sm text-mute" role="status">{status}</p>}
        {usage && <p className="text-xs text-mute">{usage}</p>}
        <p className="pt-6 text-xs text-mute">Rawi web 0.1.0. Your library lives in this browser (IndexedDB). Clearing site data deletes it; export OPML to back up subscriptions.</p>
      </div>
    </>
  );
}
