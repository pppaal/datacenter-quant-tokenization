export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

function defaultSleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Default per-attempt request timeout (ms). Override via SOURCE_TIMEOUT_MS or the option. */
const DEFAULT_TIMEOUT_MS = 15_000;

type RetryOptions = {
  retries?: number;
  backoffMs?: number;
  /** Per-attempt timeout in ms. Falls back to SOURCE_TIMEOUT_MS env, then 15s. */
  timeoutMs?: number;
  fetcher?: Fetcher;
  sleep?: (ms: number) => Promise<void>;
};

/**
 * Shared fetch-with-retry core. Returns the raw `Response` (callers parse).
 *
 * Two correctness properties the previous implementation lacked:
 *  1. **Every attempt gets a FRESH timeout signal.** Previously a caller-supplied
 *     `init.signal` was reused across retries, so once it aborted (timeout) the
 *     remaining retries fired against an already-aborted signal and failed
 *     instantly — the retry loop was a no-op after the first timeout. We mint a
 *     new `AbortSignal.timeout(timeoutMs)` per attempt and combine it with the
 *     caller's signal (if any) via `AbortSignal.any`.
 *  2. **There is always a timeout.** Adapters that passed no signal previously had
 *     no deadline and could hang indefinitely on a slow upstream.
 *
 * If the caller's own signal aborts (i.e. an explicit cancel, not our per-attempt
 * timeout) we stop retrying.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit | undefined,
  options: RetryOptions | undefined
): Promise<Response> {
  const retries = options?.retries ?? Number(process.env.SOURCE_RETRY_COUNT ?? 2);
  const backoffMs = options?.backoffMs ?? Number(process.env.SOURCE_RETRY_BACKOFF_MS ?? 250);
  const timeoutMs =
    options?.timeoutMs ?? Number(process.env.SOURCE_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const fetcher = options?.fetcher ?? fetch;
  const sleep = options?.sleep ?? defaultSleep;
  const callerSignal = init?.signal ?? undefined;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    // Fresh timeout each attempt so a prior timeout never poisons later retries.
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal;

    try {
      const response = await fetcher(url, { ...init, signal });
      if (!response.ok) {
        if (response.status === 429 || response.status >= 500) {
          throw new Error(`retryable:${response.status}`);
        }
        const text = await response.text();
        throw new Error(`request_failed:${response.status}:${text}`);
      }
      return response;
    } catch (error) {
      lastError = error as Error;
      // Explicit caller cancellation (not our per-attempt timeout): don't retry.
      if (callerSignal?.aborted) break;
      if (attempt === retries) break;
      await sleep(backoffMs * (attempt + 1));
    }
  }

  throw lastError ?? new Error('request_failed:unknown');
}

export async function fetchJsonWithRetry(
  url: string,
  init: RequestInit | undefined,
  options?: RetryOptions
) {
  const response = await fetchWithRetry(url, init, options);
  return response.json();
}

export async function fetchTextWithRetry(
  url: string,
  init: RequestInit | undefined,
  options?: RetryOptions
) {
  const response = await fetchWithRetry(url, init, options);
  return response.text();
}
