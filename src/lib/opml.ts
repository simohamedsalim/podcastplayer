import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: false });

function collect(node: any, out: string[]): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((n) => collect(n, out)); return; }
  const url = node['@_xmlUrl'];
  if (typeof url === 'string' && /^https?:\/\//i.test(url.trim())) out.push(url.trim());
  if (node.outline) collect(node.outline, out);
}

/** Returns unique feed URLs from an OPML document (nested folders supported). */
export function parseOpml(xml: string): string[] {
  const doc = parser.parse(xml) as any;
  if (!doc?.opml?.body) throw new Error('Not a valid OPML file.');
  const out: string[] = [];
  collect(doc.opml.body, out);
  return [...new Set(out)];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function buildOpml(items: { title: string; feedUrl: string }[]): string {
  const lines = items.map((i) => `    <outline type="rss" text="${esc(i.title)}" title="${esc(i.title)}" xmlUrl="${esc(i.feedUrl)}"/>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head><title>Rawi subscriptions</title></head>\n  <body>\n${lines.join('\n')}\n  </body>\n</opml>\n`;
}
