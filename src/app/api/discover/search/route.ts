import { searchPodcasts } from '@/lib/discovery';
import { COUNTRY_RE, fail, json } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET(req: Request): Promise<Response> {
  const sp = new URL(req.url).searchParams;
  const q = (sp.get('q') ?? '').trim();
  const cc = (sp.get('cc') ?? 'us').toLowerCase();
  if (!q || q.length > 100) return fail('Invalid query');
  if (!COUNTRY_RE.test(cc)) return fail('Invalid country code');
  try {
    return json({ items: await searchPodcasts(q, cc) }, 200, 'public, s-maxage=600');
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Search error', 502);
  }
}
