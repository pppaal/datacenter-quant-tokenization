type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitConfig = {
  windowMs: number;
  maxRequests: number;
};

const stores = new Map<string, Map<string, RateLimitEntry>>();

function getStore(name: string) {
  let store = stores.get(name);
  if (!store) {
    store = new Map<string, RateLimitEntry>();
    stores.set(name, store);
  }
  return store;
}

export class RateLimitError extends Error {
  readonly status = 429;
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super('Too many requests. Please try again later.');
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

export function createRateLimiter(name: string, config: RateLimitConfig) {
  const store = getStore(name);

  return {
    check(key: string) {
      const now = Date.now();
      const entry = store.get(key);

      if (!entry || now >= entry.resetAt) {
        store.set(key, { count: 1, resetAt: now + config.windowMs });
        return;
      }

      if (entry.count >= config.maxRequests) {
        throw new RateLimitError(entry.resetAt - now);
      }

      entry.count += 1;
    },

    reset(key: string) {
      store.delete(key);
    }
  };
}

export const authRateLimiter = createRateLimiter('auth', {
  windowMs: 60_000,
  maxRequests: 10
});

export const mutationRateLimiter = createRateLimiter('mutation', {
  windowMs: 10_000,
  maxRequests: 20
});

export const uploadRateLimiter = createRateLimiter('upload', {
  windowMs: 60_000,
  maxRequests: 5
});
