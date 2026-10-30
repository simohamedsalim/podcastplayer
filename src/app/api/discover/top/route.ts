import { fetchTopByCountry } from '@/lib/discovery';
import { COUNTRY_RE, fail, json } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET(req: Request): Promise<Response> {
  const cc = (new URL(req.url).searchParams.get('cc') ?? 'us').toLowerCase();
  if (!COUNTRY_RE.test(cc)) return fail('Invalid country code');
  try {
    return json({ items: await fetchTopByCountry(cc, 50) }, 200, 'public, s-maxage=900');
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Discovery error', 502);
  }
}
