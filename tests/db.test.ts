import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { parseFeed } from '@/lib/feedParser';
import {
  getQueue, listEpisodes, listLatest, listSubscriptions, queueAdd, queueRemove, saveProgress, setSubscribed, upsertPodcastFromFeed,
} from '@/lib/db';

const RSS = (extra = '') => `<?xml version="1.0"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel><title>Show</title>
<item><title>E1</title><guid>g1</guid><pubDate>Tue, 07 Oct 2025 08:00:00 GMT</pubDate><enclosure url="https://c/e1.mp3" type="audio/mpeg"/></item>
<item><title>E2</title><guid>g2</guid><pubDate>Tue, 14 Oct 2025 08:00:00 GMT</pubDate><enclosure url="https://c/e2.mp3" type="audio/mpeg"/></item>${extra}</channel></rss>`;

describe('IndexedDB library flow', () => {
  it('stores a feed, subscribes, lists latest', async () => {
    const id = await upsertPodcastFromFeed('https://x/rss', parseFeed(RSS()));
    expect(id).toBeGreaterThan(0);
    expect(await listLatest()).toHaveLength(0); // not subscribed yet
    await setSubscribed(id, true);
    expect((await listSubscriptions()).map((p) => p.title)).toEqual(['Show']);
    const latest = await listLatest();
    expect(latest.map((e) => e.title)).toEqual(['E2', 'E1']);
  });
  it('refresh keeps progress and adds new episodes without duplicating', async () => {
    const eps = await listEpisodes(1);
    await saveProgress(eps.find((e) => e.guid === 'g1')!.id, 42);
    await upsertPodcastFromFeed('https://x/rss', parseFeed(RSS('<item><title>E3</title><guid>g3</guid><enclosure url="https://c/e3.mp3" type="audio/mpeg"/></item>')));
    const after = await listEpisodes(1);
    expect(after).toHaveLength(3);
    expect(after.find((e) => e.guid === 'g1')!.positionSec).toBe(42);
  });
  it('queue add / order / remove', async () => {
    const eps = await listEpisodes(1);
    await queueAdd(eps[0]!.id); await queueAdd(eps[1]!.id); await queueAdd(eps[2]!.id, true);
    expect((await getQueue()).map((e) => e.id)).toEqual([eps[2]!.id, eps[0]!.id, eps[1]!.id]);
    await queueRemove(eps[0]!.id);
    expect(await getQueue()).toHaveLength(2);
  });
});
