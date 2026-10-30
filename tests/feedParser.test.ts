import { describe, it, expect } from 'vitest';
import { parseDuration, parseFeed, stripHtml } from '@/lib/feedParser';

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
  <title>Hello &amp; Welcome</title>
  <itunes:author>Jane Doe</itunes:author>
  <description><![CDATA[<p>A <b>great</b> show</p>]]></description>
  <itunes:image href="https://img.example/cover.jpg"/>
  <item>
    <title>Episode 2</title>
    <guid isPermaLink="false">abc-2</guid>
    <pubDate>Tue, 14 Oct 2025 08:00:00 GMT</pubDate>
    <itunes:duration>01:02:03</itunes:duration>
    <enclosure url="https://cdn.example/e2.mp3" length="123" type="audio/mpeg"/>
    <content:encoded><![CDATA[<p>Notes&nbsp;here</p>]]></content:encoded>
  </item>
  <item>
    <title>Episode 1</title>
    <pubDate>Tue, 07 Oct 2025 08:00:00 GMT</pubDate>
    <itunes:duration>1800</itunes:duration>
    <enclosure url="https://cdn.example/e1.mp3" type="audio/mpeg"/>
  </item>
  <item><title>Text only post</title></item>
  <item><title>PDF</title><enclosure url="https://x/y.pdf" type="application/pdf"/></item>
</channel></rss>`;

describe('parseFeed', () => {
  const feed = parseFeed(FEED);
  it('reads channel metadata', () => {
    expect(feed.title).toBe('Hello & Welcome');
    expect(feed.author).toBe('Jane Doe');
    expect(feed.description).toBe('A great show');
    expect(feed.artworkUrl).toBe('https://img.example/cover.jpg');
  });
  it('keeps only audio episodes', () => {
    expect(feed.episodes).toHaveLength(2);
  });
  it('parses episode fields', () => {
    const e = feed.episodes[0]!;
    expect(e.guid).toBe('abc-2');
    expect(e.audioUrl).toBe('https://cdn.example/e2.mp3');
    expect(e.durationSec).toBe(3723);
    expect(e.publishedAt).toBe(Date.UTC(2025, 9, 14, 8));
    expect(e.description).toBe('Notes here');
  });
  it('falls back to the audio URL as guid', () => {
    expect(feed.episodes[1]!.guid).toBe('https://cdn.example/e1.mp3');
    expect(feed.episodes[1]!.durationSec).toBe(1800);
  });
  it('rejects non-RSS input', () => {
    expect(() => parseFeed('<html></html>')).toThrow();
  });
});

describe('helpers', () => {
  it('parseDuration', () => {
    expect(parseDuration('59:30')).toBe(3570);
    expect(parseDuration('')).toBe(0);
    expect(parseDuration('abc')).toBe(0);
  });
  it('stripHtml', () => {
    expect(stripHtml('a<br/>b &amp; c')).toBe('a\nb & c');
  });
});
