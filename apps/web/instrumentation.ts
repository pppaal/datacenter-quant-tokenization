/**
 * Next.js instrumentation hook. Routes runtime-specific Sentry init so
 * Node and Edge runtimes each load their own config. No-op when
 * SENTRY_DSN is unset (the config files self-gate).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export { captureRequestError as onRequestError } from '@sentry/nextjs';
