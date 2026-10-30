/**
 * Server-side request guard. The proxy routes fetch user-supplied URLs, so they must never reach
 * loopback, private, link-local (cloud metadata) or other non-public addresses.
 * Redirects are followed manually so every hop is validated.
 * Residual risk: DNS rebinding between our lookup and fetch()'s own lookup (mitigated by validating all A/AAAA records).
 */
import { lookup } from 'node:dns/promises';
import net from 'node:net';

export class BlockedUrlError extends Error {}

const ALLOWED_PORTS = new Set(['', '80', '443', '8080', '8443']);

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number) as [number, number];
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::' || v === '::1') return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    if (mapped) return isPrivateIp(mapped[1]!);
    return v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb') || v.startsWith('ff') || v.startsWith('64:ff9b');
  }
  return true; // not an IP: treat as unsafe
}

export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedUrlError('Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new BlockedUrlError('Only http(s) URLs are allowed');
  if (url.username || url.password) throw new BlockedUrlError('Credentials in URLs are not allowed');
  if (!ALLOWED_PORTS.has(url.port)) throw new BlockedUrlError('Port not allowed');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    throw new BlockedUrlError('Host not allowed');
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new BlockedUrlError('Address not allowed');
    return url;
  }
  const records = await lookup(host, { all: true }).catch(() => {
    throw new BlockedUrlError('Host could not be resolved');
  });
  if (records.length === 0 || records.some((r) => isPrivateIp(r.address))) throw new BlockedUrlError('Address not allowed');
  return url;
}

export interface SafeFetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxRedirects?: number;
  fetchImpl?: typeof fetch;
}

export async function safeFetch(raw: string, opts: SafeFetchOptions = {}): Promise<{ res: Response; finalUrl: string }> {
  const doFetch = opts.fetchImpl ?? fetch;
  let current = raw;
  for (let hop = 0; hop <= (opts.maxRedirects ?? 5); hop++) {
    const url = await assertPublicHttpUrl(current);
    const res = await doFetch(url.toString(), {
      headers: opts.headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(opts.timeoutMs ?? 20000),
      cache: 'no-store',
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location')!, url).toString();
      await res.body?.cancel().catch(() => undefined);
      continue;
    }
    return { res, finalUrl: url.toString() };
  }
  throw new BlockedUrlError('Too many redirects');
}

export async function readTextLimited(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new BlockedUrlError('Response too large');
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { buf.set(c, o); o += c.byteLength; }
  return new TextDecoder('utf-8').decode(buf);
}
