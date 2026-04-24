/**
 * AbortController-backed wrappers for external connector calls.
 *
 * Every public-data connector can in principle reach out to a third-party
 * API (한국부동산원, DART, etc.). Even the mocks sit behind an async method
 * so future replacements slot in without touching callers. These helpers
 * add (a) a hard timeout and (b) typed failure-without-throwing so the
 * orchestrator can degrade to sensible defaults instead of bombing the
 * whole analysis.
 */

export const DEFAULT_CONNECTOR_TIMEOUT_MS = 8_000;

export class ConnectorTimeoutError extends Error {
  constructor(label: string, timeoutMs: number) {
    super(`Connector "${label}" timed out after ${timeoutMs}ms`);
    this.name = 'ConnectorTimeoutError';
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs: number = DEFAULT_CONNECTOR_TIMEOUT_MS
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new ConnectorTimeoutError(label, timeoutMs)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type ConnectorOutcome<T> =
  | { ok: true; value: T; label: string }
  | { ok: false; error: Error; label: string };

export async function safeConnectorCall<T>(
  label: string,
  call: () => Promise<T>,
  timeoutMs: number = DEFAULT_CONNECTOR_TIMEOUT_MS
): Promise<ConnectorOutcome<T>> {
  try {
    const value = await withTimeout(call(), label, timeoutMs);
    return { ok: true, value, label };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error)),
      label
    };
  }
}

/**
 * fetch() wrapper with a hard AbortController deadline. Use this in any
 * future real connector that replaces a mock.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_CONNECTOR_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
