export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

function defaultSleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchJsonWithRetry(
  url: string,
  init: RequestInit | undefined,
  options?: {
    retries?: number;
    backoffMs?: number;
    fetcher?: Fetcher;
    sleep?: (ms: number) => Promise<void>;
  }
) {
  const retries = options?.retries ?? Number(process.env.SOURCE_RETRY_COUNT ?? 2);
  const backoffMs = options?.backoffMs ?? Number(process.env.SOURCE_RETRY_BACKOFF_MS ?? 250);
  const fetcher = options?.fetcher ?? fetch;
  const sleep = options?.sleep ?? defaultSleep;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetcher(url, init);
      if (!response.ok) {
        if (response.status === 429 || response.status >= 500) {
          throw new Error(`retryable:${response.status}`);
        }

        const text = await response.text();
        throw new Error(`request_failed:${response.status}:${text}`);
      }

      return await response.json();
    } catch (error) {
      lastError = error as Error;
      if (attempt === retries) break;
      await sleep(backoffMs * (attempt + 1));
    }
  }

  throw lastError ?? new Error('request_failed:unknown');
}

export async function fetchTextWithRetry(
  url: string,
  init: RequestInit | undefined,
  options?: {
    retries?: number;
    backoffMs?: number;
    fetcher?: Fetcher;
    sleep?: (ms: number) => Promise<void>;
  }
) {
  const retries = options?.retries ?? Number(process.env.SOURCE_RETRY_COUNT ?? 2);
  const backoffMs = options?.backoffMs ?? Number(process.env.SOURCE_RETRY_BACKOFF_MS ?? 250);
  const fetcher = options?.fetcher ?? fetch;
  const sleep = options?.sleep ?? defaultSleep;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetcher(url, init);
      if (!response.ok) {
        if (response.status === 429 || response.status >= 500) {
          throw new Error(`retryable:${response.status}`);
        }

        const text = await response.text();
        throw new Error(`request_failed:${response.status}:${text}`);
      }

      return await response.text();
    } catch (error) {
      lastError = error as Error;
      if (attempt === retries) break;
      await sleep(backoffMs * (attempt + 1));
    }
  }

  throw lastError ?? new Error('request_failed:unknown');
}
