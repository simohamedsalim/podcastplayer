import { describe, expect, it } from 'vitest';
import { buildOpml, parseOpml } from '@/lib/opml';

describe('opml', () => {
  it('parses nested outlines, dedupes, ignores non-http', () => {
    const xml = `<?xml version="1.0"?><opml version="2.0"><head/><body>
      <outline text="Folder"><outline type="rss" xmlUrl="https://a.example/rss"/><outline type="rss" xmlUrl="https://b.example/rss"/></outline>
      <outline type="rss" xmlUrl="https://a.example/rss"/><outline xmlUrl="javascript:alert(1)"/></body></opml>`;
    expect(parseOpml(xml)).toEqual(['https://a.example/rss', 'https://b.example/rss']);
  });
  it('rejects non-OPML', () => { expect(() => parseOpml('<rss/>')).toThrow(); });
  it('round-trips with escaping', () => {
    const out = buildOpml([{ title: 'A & "B"', feedUrl: 'https://x.example/rss?a=1&b=2' }]);
    expect(out).toContain('A &amp; &quot;B&quot;');
    expect(parseOpml(out)).toEqual(['https://x.example/rss?a=1&b=2']);
  });
});
