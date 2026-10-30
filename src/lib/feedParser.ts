import { XMLParser } from 'fast-xml-parser';

export interface ParsedEpisode {
  guid: string;
  title: string;
  description: string;
  audioUrl: string;
  publishedAt: number;
  durationSec: number;
  artworkUrl: string | null;
}

export interface ParsedFeed {
  title: string;
  author: string;
  description: string;
  artworkUrl: string | null;
  episodes: ParsedEpisode[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false,
  trimValues: true,
  processEntities: true,
});

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Returns a plain string from a node that may be a string, a CDATA object or an object with attributes. */
function text(node: unknown): string {
  if (node === undefined || node === null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (typeof node === 'object') {
    const t = (node as Record<string, unknown>)['#text'];
    return typeof t === 'string' ? t : '';
  }
  return '';
}

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Accepts "3600", "59:30" or "01:02:03" and returns seconds. */
export function parseDuration(raw: string): number {
  const s = raw.trim();
  if (!s) return 0;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s));
  const parts = s.split(':').map((p) => Number(p));
  if (parts.some((p) => Number.isNaN(p))) return 0;
  return Math.round(parts.reduce((acc, p) => acc * 60 + p, 0));
}

function imageHref(node: unknown): string | null {
  if (!node) return null;
  const first = asArray<unknown>(node as unknown)[0];
  if (typeof first === 'object' && first !== null) {
    const rec = first as Record<string, unknown>;
    const href = rec['@_href'];
    if (typeof href === 'string' && href) return href;
    const u = text(rec['url']);
    if (u) return u;
  }
  return null;
}

export function parseFeed(xml: string): ParsedFeed {
  const doc = parser.parse(xml) as Record<string, any>;
  const channel = doc?.rss?.channel ? asArray<Record<string, any>>(doc.rss.channel)[0] : undefined;
  if (!channel) {
    throw new Error('Not a valid RSS podcast feed (no <channel> found).');
  }

  const artworkUrl = imageHref(channel['itunes:image']) ?? imageHref(channel.image);

  const episodes: ParsedEpisode[] = [];
  for (const item of asArray<Record<string, any>>(channel.item)) {
    const enclosure = asArray<Record<string, any>>(item.enclosure)[0];
    const audioUrl = typeof enclosure?.['@_url'] === 'string' ? enclosure['@_url'].trim() : '';
    if (!audioUrl) continue; // not an audio episode
    const type = String(enclosure?.['@_type'] ?? '');
    if (type && !/^(audio|video)\//i.test(type) && !/octet-stream/i.test(type)) continue;

    const title = text(item.title) || 'Untitled episode';
    const guid = text(item.guid) || audioUrl;
    const pub = Date.parse(text(item.pubDate));
    const rawDesc =
      text(item['content:encoded']) || text(item.description) || text(item['itunes:summary']);

    episodes.push({
      guid,
      title,
      description: stripHtml(rawDesc),
      audioUrl,
      publishedAt: Number.isNaN(pub) ? 0 : pub,
      durationSec: parseDuration(text(item['itunes:duration'])),
      artworkUrl: imageHref(item['itunes:image']),
    });
  }

  return {
    title: text(channel.title) || 'Untitled podcast',
    author: text(channel['itunes:author']) || text(channel.managingEditor),
    description: stripHtml(text(channel.description) || text(channel['itunes:summary'])),
    artworkUrl,
    episodes,
  };
}
