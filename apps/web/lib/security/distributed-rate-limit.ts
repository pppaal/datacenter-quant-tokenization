/**
 * Distributed rate limiter backed by Upstash Redis (REST). Use this from
 * Node-runtime route handlers when the in-memory edge limiter in
 * `edge-protection.ts` is not enough — for example, brute-force protection
 * on `/api/admin/session` where the in-memory store can be bypassed by
 * cycling edge regions.
 *
 * Behavior:
 *   - When `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are unset,
 *     the limiter admits every request (returns null) so dev environments
 *     are unaffected.
 *   - When configured, increments a windowed counter via `INCR` + `EXPIRE`.
 *     Returns `retryAfterMs` when the counter exceeds `maxRequests`.
 *
 * The implementation uses one round-trip per check (pipelined INCR + EXPIRE).
 * For high-volume endpoints, consider Upstash's `Ratelimit` SDK instead.
 */
type LimitDecision = { allowed: boolean; retryAfterMs: number };

function readUpstashConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ''), token };
}

async function pipeline(commands: Array<Array<string | number>>): Promise<unknown[]> {
  const config = readUpstashConfig();
  if (!config) throw new Error('Upstash REST credentials are not configured.');
  const response = await fetch(`${config.url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commands)
  });
  if (!response.ok) {
    throw new Error(`Upstash pipeline failed: HTTP ${response.status}`);
  }
  const payload = (await response.json()) as Array<{ result?: unknown; error?: string }>;
  return payload.map((entry) => {
    if (entry.error) throw new Error(`Upstash command failed: ${entry.error}`);
    return entry.result;
  });
}

/**
 * Returns `null` to admit the request, or the retry-after milliseconds
 * when the key is over the configured threshold. Soft-fails on transport
 * error (admits the request) so a Redis outage doesn't take the API down —
 * the in-memory edge limiter in `edge-protection.ts` remains the safety
 * net.
 */
export async function checkDistributedRateLimit(
  category: string,
  key: string,
  windowMs: number,
  maxRequests: number
): Promise<LimitDecision> {
  const config = readUpstashConfig();
  if (!config) return { allowed: true, retryAfterMs: 0 };
  const composite = `rate:${category}:${key}`;
  try {
    const [count, ttl] = (await pipeline([
      ['INCR', composite],
      ['PEXPIRE', composite, windowMs, 'NX']
    ])) as [number, number];
    void ttl;
    if (typeof count !== 'number') return { allowed: true, retryAfterMs: 0 };
    if (count > maxRequests) {
      return { allowed: false, retryAfterMs: windowMs };
    }
    return { allowed: true, retryAfterMs: 0 };
  } catch {
    return { allowed: true, retryAfterMs: 0 };
  }
}
