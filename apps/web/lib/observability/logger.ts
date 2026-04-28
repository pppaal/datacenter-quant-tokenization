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
export function withRequestContext<T>(context: RequestContext, fn: () => Promise<T> | T): Promise<T> | T {
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
  return JSON.stringify(value, (_key, val) => {
    if (typeof val === 'bigint') return val.toString();
    if (val instanceof Error) {
      return {
        name: val.name,
        message: val.message,
        stack: val.stack
      };
    }
    return val;
  });
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

/**
 * Forwards an error to an external error-tracking webhook
 * (`ERROR_REPORT_WEBHOOK_URL`). Sentry-compatible projects can wire their
 * envelope endpoint here by setting `SENTRY_DSN` separately and using the
 * Sentry SDK at runtime; this helper exists so the rest of the app can
 * call a single function regardless of which backend is configured.
 *
 * The call is fire-and-forget so it never delays the user request, and it
 * silently drops on transport failure to avoid recursive logging loops.
 */
export async function reportError(
  error: unknown,
  context?: Record<string, unknown>
): Promise<void> {
  const url = process.env.ERROR_REPORT_WEBHOOK_URL?.trim();
  logger.error('runtime_error', {
    error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
    ...context
  });
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
      })
    });
  } catch {
    // Swallow: error reporting itself must never throw.
  }
}
