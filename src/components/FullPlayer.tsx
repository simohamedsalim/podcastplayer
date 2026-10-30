'use client';
import { useRef, useState } from 'react';
import { Artwork } from './Artwork';
import { Icon } from './Icon';
import { RATES, SKIP_BACK_SEC, SKIP_FORWARD_SEC, playNext, seekTo, setRate, setSleepTimer, skipBack, skipForward, togglePlay } from '@/lib/player';
import { formatTime } from '@/lib/format';
import { usePlayer } from '@/store/player';

function SeekBar() {
  const pos = usePlayer((s) => s.positionSec);
  const dur = usePlayer((s) => s.durationSec);
  const [drag, setDrag] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const shown = drag ?? pos;
  const frac = dur > 0 ? Math.min(1, shown / dur) : 0;
  const at = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * dur;
  };
  return (
    <div>
      <div
        ref={ref}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(dur)}
        aria-valuenow={Math.round(shown)}
        tabIndex={0}
        className="relative flex h-9 touch-none items-center"
        onPointerDown={(e) => { if (dur > 0) { e.currentTarget.setPointerCapture(e.pointerId); setDrag(at(e.clientX)); } }}
        onPointerMove={(e) => { if (drag !== null) setDrag(at(e.clientX)); }}
        onPointerUp={(e) => { if (drag !== null) { seekTo(at(e.clientX)); setDrag(null); } }}
        onPointerCancel={() => setDrag(null)}
        onKeyDown={(e) => { if (e.key === 'ArrowRight') seekTo(pos + 5); if (e.key === 'ArrowLeft') seekTo(pos - 5); }}
      >
        <div className="h-1.5 w-full rounded bg-line"><div className="h-1.5 rounded bg-accent" style={{ width: `${frac * 100}%` }} /></div>
        <div className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 rounded-full bg-accent" style={{ left: `${frac * 100}%` }} />
      </div>
      <div className="flex justify-between text-sm text-mute"><span>{formatTime(shown)}</span><span>-{formatTime(Math.max(0, dur - shown))}</span></div>
    </div>
  );
}

export function FullPlayer() {
  const cur = usePlayer((s) => s.current);
  const open = usePlayer((s) => s.open);
  const playing = usePlayer((s) => s.playing);
  const buffering = usePlayer((s) => s.buffering);
  const rate = usePlayer((s) => s.rate);
  const sleepEndsAt = usePlayer((s) => s.sleepEndsAt);
  const error = usePlayer((s) => s.error);
  const set = usePlayer((s) => s.set);
  if (!open || !cur) return null;
  const sleepOptions = [15, 30, 60];
  const sleepLeft = sleepEndsAt ? Math.max(1, Math.ceil((sleepEndsAt - Date.now()) / 60000)) : null;
  const cycleSleep = () => {
    const i = sleepLeft === null ? -1 : sleepOptions.findIndex((m) => m >= sleepLeft);
    setSleepTimer(sleepLeft === null ? sleepOptions[0]! : (sleepOptions[i + 1] ?? null));
  };
  const chip = 'flex items-center gap-1.5 rounded-full bg-hi px-4 py-2 font-bold';
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-bg pt-[env(safe-area-inset-top)]" role="dialog" aria-modal="true" aria-label="Player">
      <div className="mx-auto flex max-w-md flex-col gap-5 p-5">
        <button aria-label="Close player" className="self-start text-ink" onClick={() => set({ open: false })}><Icon name="chev" size={34} /></button>
        <div className="flex justify-center"><Artwork src={cur.artworkUrl ?? cur.podcastArtwork} size={280} title={cur.podcastTitle} className="rounded-3xl" /></div>
        <div>
          <h2 className="text-xl font-bold leading-snug">{cur.title}</h2>
          <p className="mt-1 text-accent">{cur.podcastTitle}</p>
          {error && <p className="mt-2 text-danger">{error}</p>}
        </div>
        <SeekBar />
        <div className="flex items-center justify-around">
          <button aria-label={`Back ${SKIP_BACK_SEC} seconds`} className="flex flex-col items-center" onClick={skipBack}><Icon name="back" size={36} /><span className="text-[11px] text-mute">{SKIP_BACK_SEC}s</span></button>
          <button aria-label={playing ? 'Pause' : 'Play'} className="text-accent" onClick={() => void togglePlay()}>
            {buffering && !playing ? <span className="flex h-[84px] w-[84px] items-center justify-center text-sm text-mute">Loading…</span> : <Icon name={playing ? 'pause' : 'play'} size={84} />}
          </button>
          <button aria-label={`Forward ${SKIP_FORWARD_SEC} seconds`} className="flex flex-col items-center" onClick={skipForward}><Icon name="fwd" size={36} /><span className="text-[11px] text-mute">{SKIP_FORWARD_SEC}s</span></button>
        </div>
        <div className="flex justify-around">
          <button className={chip} onClick={() => void setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length] ?? 1)}>{rate}×</button>
          <button className={chip} onClick={cycleSleep}><Icon name="moon" size={16} />{sleepLeft ? `${sleepLeft} min` : 'Sleep'}</button>
          <button className={chip} onClick={() => void playNext()}><Icon name="next" size={16} />Next</button>
        </div>
        <p className="whitespace-pre-line text-sm leading-relaxed text-mute">{cur.description}</p>
      </div>
    </div>
  );
}
