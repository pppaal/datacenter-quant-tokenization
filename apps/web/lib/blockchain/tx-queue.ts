/**
 * Per-signer mutex queue for serializing onchain writes.
 *
 * Why this exists:
 *   - viem.walletClient.writeContract auto-resolves the nonce from the public
 *     mempool/RPC at send time. When two requests fire concurrently against
 *     the same signer, both can read the same pending nonce and one will be
 *     replaced or stuck.
 *   - This module exposes `runSerial(key, fn)` which runs `fn` only after the
 *     previous task on the same `key` settles, so concurrent admin actions
 *     produce sequential nonces without an explicit nonce manager.
 *
 * Scope: in-process only. A horizontally-scaled deployment with multiple
 * Node instances sharing one signer must additionally fence with a
 * distributed lock (Upstash Redis is the existing pattern in
 * `lib/security/distributed-rate-limit.ts`). For the single-tenant operator
 * console MVP this in-process queue is sufficient.
 */
const tails = new Map<string, Promise<unknown>>();

export async function runSerial<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  const current = previous.then(fn, fn);
  tails.set(key, current);
  try {
    return await current;
  } finally {
    if (tails.get(key) === current) {
      tails.delete(key);
    }
  }
}
