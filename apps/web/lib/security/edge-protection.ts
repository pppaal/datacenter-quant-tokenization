/**
 * Edge-runtime safe IP allowlist and per-IP rate limiter used from
 * `middleware.ts`. Intentionally dependency-free — Vercel's edge runtime
 * cannot import Node-only modules from middleware.
 *
 * The rate limiter is in-process and therefore best-effort: each edge
 * region keeps its own counters, so a true distributed limit needs an
 * upstream WAF (Vercel Firewall, Cloudflare, ...). The in-memory limiter
 * is here to absorb obvious abuse cheaply and to give a deterministic
 * error surface in tests.
 */

const HEADER_FORWARDED_FOR = 'x-forwarded-for';
const HEADER_REAL_IP = 'x-real-ip';
const HEADER_VERCEL_IP = 'x-vercel-forwarded-for';

export type EdgeRequestLike = {
  headers: { get(name: string): string | null };
  nextUrl: { pathname: string };
};

/**
 * Number of trusted reverse-proxy hops in front of this app. Each trusted proxy
 * APPENDS the address it received the connection from to `x-forwarded-for`, so
 * with N trusted proxies the real client IP is the Nth-from-the-right entry; any
 * entries to the LEFT of that are attacker-controlled (a client can send a
 * pre-populated `x-forwarded-for` header that the proxies merely extend).
 *
 * Default 1 matches Vercel's single edge proxy. Behind two proxies (e.g. a CDN
 * in front of Vercel) set `TRUSTED_PROXY_HOP_COUNT=2`. Setting it too LOW only
 * ever makes IP resolution MORE conservative (it trusts a proxy-inserted hop
 * rather than a client-supplied one); setting it too HIGH would trust a hop the
 * client controls, so err low if unsure.
 */
const DEFAULT_TRUSTED_PROXY_HOP_COUNT = 1;

function getTrustedProxyHopCount(): number {
  const raw = process.env.TRUSTED_PROXY_HOP_COUNT?.trim();
  if (!raw) return DEFAULT_TRUSTED_PROXY_HOP_COUNT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_TRUSTED_PROXY_HOP_COUNT;
  return n;
}

/**
 * Resolve the originating client IP from edge headers. Returns `null` when
 * no upstream proxy populated a forwarded-for-style header (e.g. local dev).
 *
 * SECURITY: `x-forwarded-for` is a client-spoofable, comma-separated chain
 * `client, proxy1, proxy2, ...` where each trusted proxy APPENDS on the right.
 * Trusting the leftmost (`split(',')[0]`) entry lets any client forge its
 * source IP — bypassing the IP allowlist and per-IP rate limiter. We instead
 * trust only the entry inserted by the configured trusted-proxy hop count
 * (`TRUSTED_PROXY_HOP_COUNT`, default 1 = Vercel's single proxy): the
 * Nth-from-the-right entry. `x-vercel-forwarded-for` is preferred when present
 * because Vercel sets it past its own proxy and a client cannot forge it.
 */
export function resolveClientIp(request: {
  headers: { get(name: string): string | null };
}): string | null {
  // Vercel's own header is set past its edge proxy and is not client-forgeable;
  // prefer it outright when present. Take its leftmost entry (Vercel populates
  // it with the true client IP).
  const vercel = request.headers.get(HEADER_VERCEL_IP);
  if (vercel) {
    const first = vercel.split(',')[0]?.trim();
    if (first) return first;
  }

  const forwardedFor = request.headers.get(HEADER_FORWARDED_FOR);
  if (forwardedFor) {
    const chain = forwardedFor
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    if (chain.length > 0) {
      // The trusted proxy inserted the Nth-from-the-right entry. Clamp the index
      // to the start of the chain so a short chain (fewer hops than configured)
      // still resolves to the leftmost *proxy-observed* address rather than
      // reading undefined.
      const hopCount = getTrustedProxyHopCount();
      const index = Math.max(0, chain.length - hopCount);
      const trusted = chain[index];
      if (trusted) return trusted;
    }
  }

  const realIp = request.headers.get(HEADER_REAL_IP);
  if (realIp) {
    const first = realIp.split(',')[0]?.trim();
    if (first) return first;
  }

  return null;
}

function parseAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function ipMatches(ip: string, entry: string): boolean {
  if (entry === ip) return true;
  // Very small CIDR matcher: only handles IPv4 /N. IPv6 / arbitrary masks
  // require a richer matcher; for those, prefer Vercel Firewall rules.
  const [base, maskRaw] = entry.split('/');
  if (!base || !maskRaw) return false;
  const mask = Number(maskRaw);
  if (!Number.isInteger(mask) || mask < 0 || mask > 32) return false;
  const ipBytes = ip.split('.').map((part) => Number(part));
  const baseBytes = base.split('.').map((part) => Number(part));
  if (ipBytes.length !== 4 || baseBytes.length !== 4) return false;
  if (ipBytes.some((byte) => Number.isNaN(byte) || byte < 0 || byte > 255)) return false;
  if (baseBytes.some((byte) => Number.isNaN(byte) || byte < 0 || byte > 255)) return false;
  let bitsRemaining = mask;
  for (let i = 0; i < 4; i++) {
    if (bitsRemaining >= 8) {
      if (ipBytes[i] !== baseBytes[i]) return false;
      bitsRemaining -= 8;
      continue;
    }
    if (bitsRemaining === 0) return true;
    const shift = 8 - bitsRemaining;
    if (ipBytes[i]! >> shift !== baseBytes[i]! >> shift) return false;
    return true;
  }
  return true;
}

/**
 * Returns `true` when the IP is admitted by the allowlist (or no allowlist
 * is configured for the path category). Categories:
 *   - admin   : `ADMIN_IP_ALLOWLIST`   (applies to /admin/* and /api/admin/*)
 *   - ops     : `OPS_IP_ALLOWLIST`     (applies to /api/ops/*)
 */
export function isAllowedIp(pathname: string, ip: string | null): boolean {
  const isAdminPath = pathname.startsWith('/admin/') || pathname.startsWith('/api/admin/');
  const isOpsPath = pathname.startsWith('/api/ops/');
  const adminList = parseAllowlist(process.env.ADMIN_IP_ALLOWLIST);
  const opsList = parseAllowlist(process.env.OPS_IP_ALLOWLIST);
  if (isAdminPath && adminList.length > 0) {
    if (!ip) return false;
    return adminList.some((entry) => ipMatches(ip, entry));
  }
  if (isOpsPath && opsList.length > 0) {
    if (!ip) return false;
    return opsList.some((entry) => ipMatches(ip, entry));
  }
  return true;
}

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

function pruneIfLarge() {
  if (rateLimitStore.size <= 5_000) return;
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt <= now) rateLimitStore.delete(key);
  }
}

/**
 * In-memory token-bucket-ish rate limiter, scoped by `(category, key)`.
 * Returns the retry-after milliseconds when the key is over the limit, or
 * `null` to admit the request.
 */
export function checkEdgeRateLimit(
  category: string,
  key: string,
  windowMs: number,
  maxRequests: number
): number | null {
  const now = Date.now();
  const composite = `${category}:${key}`;
  const entry = rateLimitStore.get(composite);
  if (!entry || now >= entry.resetAt) {
    rateLimitStore.set(composite, { count: 1, resetAt: now + windowMs });
    pruneIfLarge();
    return null;
  }
  if (entry.count >= maxRequests) {
    return Math.max(1, entry.resetAt - now);
  }
  entry.count += 1;
  return null;
}

/**
 * Parse a positive-number env override, falling back to `fallback` when the
 * value is missing, non-numeric, non-finite, or <= 0. Without this guard a
 * misconfigured value (e.g. `ADMIN_API_RATE_MAX="240 "` or `"60s"`) yields
 * `NaN`, and every `count >= NaN` / `now >= now+NaN` comparison in
 * `checkEdgeRateLimit` is false — i.e. the limiter silently FAILS OPEN. Mirrors
 * the guard in `getTrustedProxyHopCount` and the `env.ts` optionalNumber transform.
 */
function rateNum(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const ADMIN_API_RATE_WINDOW_MS = rateNum(process.env.ADMIN_API_RATE_WINDOW_MS, 60_000);
const ADMIN_API_RATE_MAX = rateNum(process.env.ADMIN_API_RATE_MAX, 240);
const OPS_API_RATE_WINDOW_MS = rateNum(process.env.OPS_API_RATE_WINDOW_MS, 60_000);
const OPS_API_RATE_MAX = rateNum(process.env.OPS_API_RATE_MAX, 60);
const PUBLIC_API_RATE_WINDOW_MS = rateNum(process.env.PUBLIC_API_RATE_WINDOW_MS, 60_000);
const PUBLIC_API_RATE_MAX = rateNum(process.env.PUBLIC_API_RATE_MAX, 60);

export type EdgeRateDecision = {
  category: 'admin-api' | 'ops-api' | 'public-api' | null;
  retryAfterMs: number | null;
};

/**
 * Apply the per-category edge rate limit. Returns a non-null `retryAfterMs`
 * when the request must be denied with HTTP 429.
 *
 * Limits are configurable via env (`*_RATE_WINDOW_MS`, `*_RATE_MAX`); the
 * defaults are conservative for a single-tenant operator app and can be
 * tightened further behind a real WAF.
 */
export function applyEdgeRateLimit(pathname: string, ip: string | null): EdgeRateDecision {
  if (!ip) return { category: null, retryAfterMs: null };
  if (pathname.startsWith('/api/admin/')) {
    return {
      category: 'admin-api',
      retryAfterMs: checkEdgeRateLimit(
        'admin-api',
        ip,
        ADMIN_API_RATE_WINDOW_MS,
        ADMIN_API_RATE_MAX
      )
    };
  }
  if (pathname.startsWith('/api/ops/')) {
    return {
      category: 'ops-api',
      retryAfterMs: checkEdgeRateLimit('ops-api', ip, OPS_API_RATE_WINDOW_MS, OPS_API_RATE_MAX)
    };
  }
  if (pathname.startsWith('/api/')) {
    return {
      category: 'public-api',
      retryAfterMs: checkEdgeRateLimit(
        'public-api',
        ip,
        PUBLIC_API_RATE_WINDOW_MS,
        PUBLIC_API_RATE_MAX
      )
    };
  }
  return { category: null, retryAfterMs: null };
}
