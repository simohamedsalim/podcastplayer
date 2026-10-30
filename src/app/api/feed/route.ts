import { parseFeed } from '@/lib/feedParser';
import { BlockedUrlError, readTextLimited, safeFetch } from '@/lib/ssrf';
import { fail, json } from '@/lib/http';

export const runtime = 'nodejs';
export const maxDuration = 30;
const MAX_FEED_BYTES = 20 * 1024 * 1024;

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url).searchParams.get('url');
  if (!url) return fail('Missing url');
  try {
    const { res, finalUrl } = await safeFetch(url, {
      headers: { Accept: 'application/rss+xml, application/xml, text/xml, */*', 'User-Agent': 'Rawi/0.1 (personal podcast player)' },
    });
    if (!res.ok) return fail(`Feed returned HTTP ${res.status}`, 502);
    const xml = await readTextLimited(res, MAX_FEED_BYTES);
    const feed = parseFeed(xml);
    return json({ feedUrl: finalUrl, feed }, 200, 'private, max-age=300');
  } catch (e) {
    if (e instanceof BlockedUrlError) return fail(e.message, 400);
    return fail(e instanceof Error ? e.message : 'Feed error', 502);
  }
}
