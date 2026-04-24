/**
 * Lightweight LRU cache for property-analyze full reports.
 *
 * Heavy path: geocode → 6 connector fetches → classify → bundle → valuation
 * (cap-rate + IRR + NPV) → pro-forma → Monte Carlo 1,000 iter × Cholesky →
 * sensitivities × 4 → refinancing × years → deal-risk scoring × 7 scenarios →
 * LLM memo. End-to-end this can cost 3-8 s + a Claude call. Identical input
 * should not re-pay that cost for a few minutes while a user explores the UI.
 *
 * Scope: in-process only (no Redis). Cheap to reset by restarting the node.
 * Not a correctness guarantee — purely a UX speedup. TTL bounds staleness.
 */

type CacheEntry<V> = {
  value: V;
  expiresAt: number;
};

type LruCacheOptions = {
  max?: number;
  ttlMs?: number;
};

export class LruCache<V> {
  private readonly max: number;
  private readonly ttlMs: number;
  private readonly store = new Map<string, CacheEntry<V>>();

  constructor(options: LruCacheOptions = {}) {
    this.max = Math.max(1, options.max ?? 64);
    this.ttlMs = Math.max(1_000, options.ttlMs ?? 10 * 60_000);
  }

  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    // Re-insert to bump recency (Map preserves insertion order → LRU).
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V): void {
    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    while (this.store.size > this.max) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

// djb2 — deterministic, collision-acceptable for a cache key (we tolerate
// the ~1-in-4B collision rate vs. importing node:crypto into edge bundles).
export function hashCacheKey(parts: Array<string | number | null | undefined>): string {
  const joined = parts.map((p) => (p === null || p === undefined ? '∅' : String(p))).join('|');
  let h = 5381;
  for (let i = 0; i < joined.length; i++) {
    h = ((h << 5) + h + joined.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}
