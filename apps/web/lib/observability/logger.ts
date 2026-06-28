/**
 * Structured logger that emits JSON lines so log drains (Vercel Log Drains,
 * Datadog, Logtail, ...) can ingest the stream as-is. Falls back to a
 * console writer when no drain is configured.
 *
 * Each line includes:
 *   - level    : debug | info | warn | error
 *   - timestamp: ISO-8601
 *   - msg      : human-readable string
 *   - ...rest  : caller-supplied structured fields
 *
 * The logger is intentionally synchronous and dependency-free so it can be
 * used both in the Node.js runtime and (with limited fields) at the edge.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type RequestContext = {
  requestId: string;
  actor?: string;
  role?: string;
};

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Run `fn` inside a request-scoped logging context. Every `logger.*` call
 * made underneath will automatically include the bound `requestId` (and
 * optional actor / role) so the entire request can be reconstructed from
 * a log drain by filtering on a single trace id.
 */
export function withRequestContext<T>(
  context: RequestContext,
  fn: () => Promise<T> | T
): Promise<T> | T {
  return requestContextStorage.run(context, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

function resolveMinLevel(): number {
  const raw = process.env.LOG_LEVEL?.toLowerCase()?.trim();
  if (raw && raw in LEVEL_PRIORITY) {
    return LEVEL_PRIORITY[raw as LogLevel];
  }
  return process.env.NODE_ENV === 'production' ? LEVEL_PRIORITY.info : LEVEL_PRIORITY.debug;
}

function safeStringify(value: unknown): string {
  // An observability helper must NEVER throw — a logged value with a circular
  // reference (a Prisma entity with back-refs, an undici fetch error whose
  // request<->response reference each other, a request-context object) would
  // otherwise make JSON.stringify throw "Converting circular structure to JSON"
  // and propagate synchronously into every logger.* caller. Track seen objects
  // and emit '[Circular]' for repeats; wrap the whole thing so a pathological
  // value degrades to a minimal fallback line instead of crashing the caller.
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_key, val) => {
      if (typeof val === 'bigint') return val.toString();
      if (val instanceof Error) {
        return {
          name: val.name,
          message: val.message,
          stack: val.stack
        };
      }
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) return '[Circular]';
        seen.add(val);
      }
      return val;
    });
  } catch (error) {
    const msg =
      value && typeof value === 'object' && 'msg' in value
        ? (value as { msg?: unknown }).msg
        : undefined;
    return JSON.stringify({
      level: 'error',
      timestamp: new Date().toISOString(),
      msg: typeof msg === 'string' ? msg : 'log_serialize_failed',
      _serializeError: error instanceof Error ? error.message : 'unknown'
    });
  }
}

function emit(level: LogLevel, msg: string, fields?: Record<string, unknown>): void {
  if (LEVEL_PRIORITY[level] < resolveMinLevel()) return;
  const ctx = getRequestContext();
  const payload: Record<string, unknown> = {
    level,
    timestamp: new Date().toISOString(),
    msg,
    ...(ctx?.requestId ? { requestId: ctx.requestId } : null),
    ...(ctx?.actor ? { actor: ctx.actor } : null),
    ...(ctx?.role ? { role: ctx.role } : null),
    ...fields
  };
  const line = safeStringify(payload);
  if (level === 'error' || level === 'warn') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug(msg: string, fields?: Record<string, unknown>) {
    emit('debug', msg, fields);
  },
  info(msg: string, fields?: Record<string, unknown>) {
    emit('info', msg, fields);
  },
  warn(msg: string, fields?: Record<string, unknown>) {
    emit('warn', msg, fields);
  },
  error(msg: string, fields?: Record<string, unknown>) {
    emit('error', msg, fields);
  }
};

/** Deadline for the error-report webhook POST so it can never hang a caller. */
const REPORT_WEBHOOK_TIMEOUT_MS = 5_000;

/**
 * Forwards an error to the configured error backend(s):
 *   - Sentry (via `@sentry/nextjs`) when `SENTRY_DSN` is set — auto-init
 *     happens in `instrumentation.ts`.
 *   - Generic webhook (`ERROR_REPORT_WEBHOOK_URL`) when set — kept for
 *     Datadog / Logtail / custom pipelines that don't speak Sentry envelope.
 *
 * Both are fire-and-forget so they never delay the user request, and both
 * silently drop on transport failure to avoid recursive logging loops.
 */
export async function reportError(
  error: unknown,
  context?: Record<string, unknown>
): Promise<void> {
  logger.error('runtime_error', {
    error:
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : error,
    ...context
  });

  // Sentry path — lazy-load so the SDK only initializes if it was wired
  // through instrumentation.ts (DSN present).
  if (process.env.SENTRY_DSN?.trim()) {
    try {
      const sentry = await import('@sentry/nextjs');
      sentry.captureException(error, { extra: context });
    } catch {
      // Sentry SDK absent at runtime (e.g. edge bundle stripped it) — skip.
    }
  }

  // Generic webhook path.
  const url = process.env.ERROR_REPORT_WEBHOOK_URL?.trim();
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: safeStringify({
        timestamp: new Date().toISOString(),
        environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
        release: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : { message: String(error) },
        context: context ?? {}
      }),
      // Bound the POST so a slow/hung error-report endpoint can't hold the
      // connection open or block an awaiting caller (e.g. the audit-prune cron
      // route awaits reportError). The catch below swallows the AbortError. This
      // mirrors the http.ts per-attempt AbortSignal.timeout convention.
      signal: AbortSignal.timeout(REPORT_WEBHOOK_TIMEOUT_MS)
    });
  } catch {
    // Swallow: error reporting itself must never throw.
  }
}
