import { resolveFeedUrl } from '@/lib/discovery';
import { COUNTRY_RE, fail, json } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET(req: Request): Promise<Response> {
  const sp = new URL(req.url).searchParams;
  const id = sp.get('id') ?? '';
  const cc = (sp.get('cc') ?? 'us').toLowerCase();
  if (!/^\d{1,15}$/.test(id)) return fail('Invalid id');
  if (!COUNTRY_RE.test(cc)) return fail('Invalid country code');
  try {
    return json({ feedUrl: await resolveFeedUrl(id, cc) }, 200, 'public, s-maxage=3600');
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Lookup error', 502);
  }
}
