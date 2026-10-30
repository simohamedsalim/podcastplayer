'use client';
import { Artwork } from './Artwork';
import { Icon } from './Icon';
import { skipBack, skipForward, togglePlay } from '@/lib/player';
import { usePlayer } from '@/store/player';

export function MiniPlayer() {
  const cur = usePlayer((s) => s.current);
  const playing = usePlayer((s) => s.playing);
  const buffering = usePlayer((s) => s.buffering);
  const pos = usePlayer((s) => s.positionSec);
  const dur = usePlayer((s) => s.durationSec);
  const open = usePlayer((s) => s.set);
  if (!cur) return null;
  const frac = dur > 0 ? Math.min(1, pos / dur) : 0;
  return (
    <div className="border-t border-line bg-surface">
      <div className="h-0.5 bg-line"><div className="h-0.5 bg-accent" style={{ width: `${frac * 100}%` }} /></div>
      <div className="mx-auto flex max-w-3xl items-center gap-3 p-2.5">
        <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => open({ open: true })} aria-label="Open player">
          <Artwork src={cur.artworkUrl ?? cur.podcastArtwork} size={44} title={cur.podcastTitle} className="rounded-lg" />
          <span className="min-w-0">
            <span className="block truncate font-semibold">{cur.title}</span>
            <span className="block truncate text-xs text-mute">{buffering ? 'Loading…' : cur.podcastTitle}</span>
          </span>
        </button>
        <button aria-label="Back 15 seconds" className="text-ink" onClick={skipBack}><Icon name="back" size={26} /></button>
        <button aria-label={playing ? 'Pause' : 'Play'} className="text-accent" onClick={() => void togglePlay()}><Icon name={playing ? 'pause' : 'play'} size={40} /></button>
        <button aria-label="Forward 30 seconds" className="text-ink" onClick={skipForward}><Icon name="fwd" size={26} /></button>
      </div>
    </div>
  );
}
