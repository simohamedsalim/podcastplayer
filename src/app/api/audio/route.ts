import { BlockedUrlError, safeFetch } from '@/lib/ssrf';
import { fail } from '@/lib/http';

/**
 * Streaming proxy used ONLY as a fallback when the browser cannot reach an enclosure directly
 * (http:// on an https page, or CORS needed for offline downloads). Normal playback does not use it.
 * Note: it consumes your hosting bandwidth/function time.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

const PASS = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified'];

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url).searchParams.get('url');
  if (!url) return fail('Missing url');
  try {
    const headers: Record<string, string> = { 'User-Agent': 'Rawi/0.1 (personal podcast player)' };
    const range = req.headers.get('range');
    if (range && /^bytes=\d*-\d*$/.test(range)) headers['Range'] = range;
    const { res } = await safeFetch(url, { headers, timeoutMs: 30000 });
    if (!(res.status === 200 || res.status === 206)) return fail(`Upstream HTTP ${res.status}`, 502);
    const type = (res.headers.get('content-type') ?? '').toLowerCase();
    if (!(type.startsWith('audio/') || type.startsWith('video/') || type.includes('octet-stream') || type === '')) {
      await res.body?.cancel().catch(() => undefined);
      return fail('Upstream is not audio', 415);
    }
    const out = new Headers();
    for (const h of PASS) { const v = res.headers.get(h); if (v) out.set(h, v); }
    out.set('Cache-Control', 'private, no-store');
    out.set('Access-Control-Allow-Origin', new URL(req.url).origin);
    return new Response(res.body, { status: res.status, headers: out });
  } catch (e) {
    if (e instanceof BlockedUrlError) return fail(e.message, 400);
    return fail(e instanceof Error ? e.message : 'Audio error', 502);
  }
}
