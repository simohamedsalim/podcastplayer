import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async (host: string) => {
    if (host === 'internal.example') return [{ address: '10.0.0.5', family: 4 }];
    if (host === 'mixed.example') return [{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }];
    return [{ address: '93.184.216.34', family: 4 }];
  }),
}));

import { assertPublicHttpUrl, isPrivateIp, BlockedUrlError } from '@/lib/ssrf';
import { GET as feedGET } from '@/app/api/feed/route';
import { GET as audioGET } from '@/app/api/audio/route';

const RSS = `<?xml version="1.0"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel><title>T</title>
<item><title>E1</title><guid>g1</guid><enclosure url="https://cdn.example/a.mp3" type="audio/mpeg"/></item></channel></rss>`;

describe('isPrivateIp', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1'])('blocks %s', (ip) => {
    expect(isPrivateIp(ip)).toBe(true);
  });
  it.each(['8.8.8.8', '93.184.216.34', '172.32.0.1', '2606:4700:4700::1111'])('allows %s', (ip) => {
    expect(isPrivateIp(ip)).toBe(false);
  });
});

describe('assertPublicHttpUrl', () => {
  it.each([
    'file:///etc/passwd', 'ftp://example.com/x', 'http://localhost/x', 'http://127.0.0.1/x', 'http://[::1]/x',
    'http://169.254.169.254/latest/meta-data', 'http://user:pw@example.com/', 'http://example.com:22/', 'http://internal.example/x', 'http://mixed.example/x', 'not a url',
  ])('rejects %s', async (u) => {
    await expect(assertPublicHttpUrl(u)).rejects.toBeInstanceOf(BlockedUrlError);
  });
  it('accepts a public host', async () => {
    await expect(assertPublicHttpUrl('https://example.com/feed.xml')).resolves.toBeInstanceOf(URL);
  });
});

describe('/api/feed', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  it('rejects private targets without fetching', async () => {
    const spy = vi.fn(); globalThis.fetch = spy as unknown as typeof fetch;
    const res = await feedGET(new Request('http://app/api/feed?url=' + encodeURIComponent('http://169.254.169.254/')));
    expect(res.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });
  it('parses a feed', async () => {
    globalThis.fetch = vi.fn(async () => new Response(RSS, { status: 200 })) as unknown as typeof fetch;
    const res = await feedGET(new Request('http://app/api/feed?url=' + encodeURIComponent('https://example.com/rss')));
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.feed.title).toBe('T');
    expect(body.feed.episodes[0].audioUrl).toBe('https://cdn.example/a.mp3');
  });
  it('re-validates redirects (redirect to internal host is blocked)', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://10.0.0.1/secret' } })) as unknown as typeof fetch;
    const res = await feedGET(new Request('http://app/api/feed?url=' + encodeURIComponent('https://example.com/rss')));
    expect(res.status).toBe(400);
  });
  it('rejects oversized feeds', async () => {
    const big = new Uint8Array(21 * 1024 * 1024);
    globalThis.fetch = vi.fn(async () => new Response(big, { status: 200 })) as unknown as typeof fetch;
    const res = await feedGET(new Request('http://app/api/feed?url=' + encodeURIComponent('https://example.com/rss')));
    expect(res.status).toBe(400);
  });
});

describe('/api/audio', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });
  it('forwards Range and streams 206', async () => {
    const spy = vi.fn(async (_u: string, init?: RequestInit) => new Response('abc', { status: 206, headers: { 'content-type': 'audio/mpeg', 'content-range': 'bytes 0-2/10' } }));
    globalThis.fetch = spy as unknown as typeof fetch;
    const res = await audioGET(new Request('http://app/api/audio?url=' + encodeURIComponent('https://cdn.example/a.mp3'), { headers: { range: 'bytes=0-2' } }));
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 0-2/10');
    expect((spy.mock.calls[0]![1]!.headers as Record<string, string>)['Range']).toBe('bytes=0-2');
    expect(await res.text()).toBe('abc');
  });
  it('refuses non-audio upstreams', async () => {
    globalThis.fetch = vi.fn(async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch;
    const res = await audioGET(new Request('http://app/api/audio?url=' + encodeURIComponent('https://cdn.example/page')));
    expect(res.status).toBe(415);
  });
  it('blocks private targets', async () => {
    const res = await audioGET(new Request('http://app/api/audio?url=' + encodeURIComponent('http://192.168.0.1/a.mp3')));
    expect(res.status).toBe(400);
  });
});
