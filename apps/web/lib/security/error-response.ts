/**
 * Helpers for returning client-safe error responses from API route handlers.
 *
 * Unexpected failures (5xx, raw Prisma errors, anything we can't map to a
 * known business-rule status) must NOT leak `error.message` to the client —
 * Prisma error strings routinely embed table/column names, query fragments,
 * and connection details. Instead we:
 *   - log the real error server-side (logger + reportError → Sentry/webhook)
 *   - return a generic message plus a `requestId` the client can quote in a
 *     support ticket so operators can correlate it to the server log line.
 */
import { NextResponse } from 'next/server';
import { getRequestContext, reportError } from '@/lib/observability/logger';

const GENERIC_MESSAGE = 'Internal server error.';

/** Resolve a request id: prefer an explicit one, else the request-scoped
 *  context (set by `withRequestContext`), else a fresh uuid. */
function resolveRequestId(explicit?: string): string {
  if (explicit?.trim()) return explicit.trim();
  const ctx = getRequestContext();
  if (ctx?.requestId) return ctx.requestId;
  return crypto.randomUUID();
}

/**
 * Build a generic error response and report the underlying error to the
 * server-side observability backends. The client only ever sees
 * `{ error: <generic message>, requestId }`.
 */
export function genericErrorResponse(
  error: unknown,
  options: {
    status?: number;
    message?: string;
    requestId?: string;
    /** Extra structured context forwarded to `reportError` only. */
    context?: Record<string, unknown>;
  } = {}
): NextResponse {
  const requestId = resolveRequestId(options.requestId);
  const status = options.status ?? 500;

  // Fire-and-forget: error reporting must never delay or break the response.
  void reportError(error, { requestId, ...options.context });

  return NextResponse.json(
    { error: options.message ?? GENERIC_MESSAGE, requestId },
    { status, headers: { 'X-Request-Id': requestId } }
  );
}
