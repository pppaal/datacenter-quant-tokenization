/**
 * Safe outbound fetch helper that blocks SSRF.
 *
 * Why this exists:
 *   The research agent and the macro data-provider plumbing both call
 *   fetch() against URLs that originate from agent / vendor / search-result
 *   payloads. Without an allow-list and IP-range check that's a textbook
 *   SSRF surface — an attacker who controls (or tricks the agent into
 *   visiting) a URL pointing at internal IPs can read AWS IMDS
 *   (169.254.169.254), the local DB, internal admin routes, or any other
 *   service reachable from the Node runtime.
 *
 * What this enforces:
 *   1. Scheme is http or https (no file:// / gopher:// / data:).
 *   2. Hostname resolves to a public IP. Loopback, RFC1918, link-local,
 *      multicast, broadcast, and v6 ULAs are all rejected.
 *   3. DNS resolution is run before fetch on every hop; redirects are
 *      followed manually so each new Location target is re-validated.
 *   4. Optional domain allowlist; when set, hostnames must match.
 *   5. Hard timeout via AbortController.
 *
 * Limits: this helper does not pin the resolved IP across the dns →
 * connect window. A theoretical DNS-rebinding attacker with TTL=0 control
 * over the upstream DNS could in principle flip an answer between our
 * lookup and undici's connect. Mitigating that requires a custom undici
 * Dispatcher with `connect.lookup`; out of scope for this layer. The
 * pre-check still blocks every attack that doesn't require sub-millisecond
 * race control over the resolver.
 *
 * Usage:
 *   await safeFetch(url, { timeoutMs: 8000, maxRedirects: 5 });
 */
import { lookup as dnsLookupCb, type LookupAddress } from 'node:dns';
import { promisify } from 'node:util';
import { isIP } from 'node:net';

const dnsLookup = promisify(dnsLookupCb);

export type SafeFetchOptions = {
  timeoutMs?: number;
  maxRedirects?: number;
  allowedHosts?: string[] | null;
  headers?: Record<string, string>;
  method?: string;
};

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_REDIRECTS = 5;

function ipv4ToInt(address: string): number | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    result = result * 256 + n;
  }
  return result;
}

function isPrivateIpv4(address: string): boolean {
  const value = ipv4ToInt(address);
  if (value === null) return true; // unparseable → reject defensively
  // 0.0.0.0/8
  if (value >= 0 && value <= 0x00ffffff) return true;
  // 10.0.0.0/8
  if (value >= 0x0a000000 && value <= 0x0affffff) return true;
  // 100.64.0.0/10 — CGNAT
  if (value >= 0x64400000 && value <= 0x647fffff) return true;
  // 127.0.0.0/8 — loopback
  if (value >= 0x7f000000 && value <= 0x7fffffff) return true;
  // 169.254.0.0/16 — link-local + AWS IMDS / GCP metadata
  if (value >= 0xa9fe0000 && value <= 0xa9feffff) return true;
  // 172.16.0.0/12
  if (value >= 0xac100000 && value <= 0xac1fffff) return true;
  // 192.0.0.0/24
  if (value >= 0xc0000000 && value <= 0xc00000ff) return true;
  // 192.0.2.0/24 — TEST-NET-1
  if (value >= 0xc0000200 && value <= 0xc00002ff) return true;
  // 192.168.0.0/16
  if (value >= 0xc0a80000 && value <= 0xc0a8ffff) return true;
  // 198.18.0.0/15 — benchmark
  if (value >= 0xc6120000 && value <= 0xc613ffff) return true;
  // 198.51.100.0/24 — TEST-NET-2
  if (value >= 0xc6336400 && value <= 0xc63364ff) return true;
  // 203.0.113.0/24 — TEST-NET-3
  if (value >= 0xcb007100 && value <= 0xcb0071ff) return true;
  // 224.0.0.0/4 — multicast
  if (value >= 0xe0000000 && value <= 0xefffffff) return true;
  // 240.0.0.0/4 — reserved + 255.255.255.255 broadcast
  if (value >= 0xf0000000) return true;
  return false;
}

function isPrivateIpv6(address: string): boolean {
  const lower = address.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  // ::ffff:x.y.z.w — IPv4-mapped, defer to v4 check
  if (lower.startsWith('::ffff:')) {
    const v4 = lower.slice('::ffff:'.length);
    if (isIP(v4) === 4) return isPrivateIpv4(v4);
    return true;
  }
  // fe80::/10 — link-local
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) {
    return true;
  }
  // fc00::/7 — unique local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  // ff00::/8 — multicast
  if (lower.startsWith('ff')) return true;
  // 2002::/16 + 6to4 to 0.0.0.0 etc — be conservative on anything starting with private mapped prefixes
  return false;
}

export function isPrivateIp(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return true;
}

async function resolveSafeAddress(hostname: string): Promise<LookupAddress> {
  // If the hostname IS an IP literal, lookup returns it; we still validate.
  let resolved: LookupAddress;
  try {
    resolved = await dnsLookup(hostname, { verbatim: true });
  } catch (error) {
    throw new UnsafeUrlError(
      `DNS resolution failed for ${hostname}: ${error instanceof Error ? error.message : 'unknown'}`
    );
  }
  if (isPrivateIp(resolved.address)) {
    throw new UnsafeUrlError(`Hostname ${hostname} resolved to private/disallowed IP ${resolved.address}.`);
  }
  return resolved;
}

function assertHostAllowed(hostname: string, allowedHosts: string[] | null | undefined) {
  if (!allowedHosts || allowedHosts.length === 0) return;
  const normalized = hostname.toLowerCase();
  for (const entry of allowedHosts) {
    const e = entry.toLowerCase();
    if (normalized === e) return;
    if (normalized.endsWith('.' + e)) return;
  }
  throw new UnsafeUrlError(`Hostname ${hostname} is not in the allowlist.`);
}

function ensureSafeUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError(`Invalid URL: ${rawUrl}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new UnsafeUrlError(`Disallowed scheme: ${parsed.protocol}`);
  }
  if (!parsed.hostname) {
    throw new UnsafeUrlError(`URL has no hostname: ${rawUrl}`);
  }
  return parsed;
}

/**
 * Fetch with SSRF protection: scheme, hostname allowlist, and IP-range checks
 * are run on the original URL plus every redirect target. Manual redirect
 * handling is required because fetch() cannot pin the resolved IP per hop.
 */
export async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const headers = options.headers ?? {};
  const method = options.method ?? 'GET';
  const allow = options.allowedHosts ?? null;

  const startedAt = Date.now();
  let currentUrl = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const parsed = ensureSafeUrl(currentUrl);
    assertHostAllowed(parsed.hostname, allow);
    const resolved = await resolveSafeAddress(parsed.hostname);

    const remaining = timeoutMs - (Date.now() - startedAt);
    if (remaining <= 0) {
      throw new UnsafeUrlError(`safeFetch timeout exceeded before request to ${parsed.hostname}.`);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);

    // resolved is captured for the pre-check; we don't pin it on the
    // dispatcher because the standard fetch() API doesn't expose that knob.
    void resolved;

    let response: Response;
    try {
      response = await fetch(parsed.toString(), {
        method,
        headers,
        redirect: 'manual',
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }

    const status = response.status;
    if (status >= 300 && status < 400 && response.headers.has('location')) {
      const next = response.headers.get('location')!;
      // Resolve the Location relative to the current URL so relative paths work.
      currentUrl = new URL(next, parsed).toString();
      continue;
    }
    return response;
  }
  throw new UnsafeUrlError(`Too many redirects (>${maxRedirects}) starting at ${rawUrl}.`);
}
