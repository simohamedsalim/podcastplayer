'use client';
import Link from 'next/link';
import type { EpisodeView } from '@/lib/db';
import { Artwork } from './Artwork';
import { Icon } from './Icon';
import { formatDate, formatDurationShort } from '@/lib/format';
import { enqueue, playEpisode } from '@/lib/player';
import { cancelOrRemoveDownload, startDownload } from '@/lib/downloads';
import { usePlayer } from '@/store/player';

export function EpisodeItem({ ep, showPodcast = true }: { ep: EpisodeView; showPodcast?: boolean }) {
  const isCurrent = usePlayer((s) => s.current?.id === ep.id);
  const playing = usePlayer((s) => s.current?.id === ep.id && s.playing);
  const left = ep.durationSec > 0 && ep.positionSec > 0 && !ep.played ? `${formatDurationShort(Math.max(0, ep.durationSec - ep.positionSec))} left` : formatDurationShort(ep.durationSec);
  const dl = ep.dl;
  const pct = dl?.total ? Math.round((dl.bytes / dl.total) * 100) : null;
  const btn = 'p-1 -m-1 rounded-full text-mute hover:text-ink';
  return (
    <li className={`flex gap-3 border-b border-line p-3 ${ep.played && !isCurrent ? 'opacity-55' : ''}`}>
      <Artwork src={ep.artworkUrl ?? ep.podcastArtwork} size={64} title={ep.podcastTitle} className="rounded-xl" />
      <div className="min-w-0 flex-1">
        {showPodcast && <p className="truncate text-xs font-semibold text-accent">{ep.podcastTitle}</p>}
        <p className="line-clamp-2 text-[15px] font-semibold leading-snug">{ep.title}</p>
        <p className="mt-1 text-xs text-mute">{[formatDate(ep.publishedAt), left].filter(Boolean).join(' · ')}</p>
        <div className="mt-2 flex items-center gap-5">
          <button aria-label={playing ? 'Playing' : 'Play'} className="-m-1 p-1 text-accent" onClick={() => void playEpisode(ep.id)}>
            <Icon name={playing ? 'pause' : 'play'} size={28} />
          </button>
          <button aria-label="Add to queue" className={btn} onClick={() => void enqueue(ep.id)}><Icon name="plus" size={24} /></button>
          {dl?.status === 'done' ? (
            <button aria-label="Remove download" className={`${btn} !text-ok`} onClick={() => void cancelOrRemoveDownload(ep.id)}><Icon name="check" size={24} /></button>
          ) : dl?.status === 'downloading' ? (
            <button aria-label="Cancel download" className={`${btn} flex items-center gap-1`} onClick={() => void cancelOrRemoveDownload(ep.id)}>
              <Icon name="x" size={22} /><span className="text-xs">{pct !== null ? `${pct}%` : '…'}</span>
            </button>
          ) : (
            <button aria-label="Download" title={dl?.error} className={`${btn} ${dl?.status === 'error' ? '!text-danger' : ''}`} onClick={() => void startDownload(ep.id)}>
              <Icon name={dl?.status === 'error' ? 'retry' : 'down'} size={24} />
            </button>
          )}
          <Link aria-label="Details" className={btn} href={`/podcast/${ep.podcastId}?ep=${ep.id}`}><Icon name="info" size={24} /></Link>
        </div>
      </div>
    </li>
  );
}
