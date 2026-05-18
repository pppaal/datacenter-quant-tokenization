/**
 * Sentry config for the Node.js runtime (route handlers, server components,
 * server actions, cron). Auto-disabled when SENTRY_DSN is unset, so dev
 * environments without a Sentry project remain free of network noise.
 */
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.SENTRY_ENVIRONMENT ??
      process.env.VERCEL_ENV ??
      process.env.NODE_ENV ??
      'development',
    release: process.env.VERCEL_GIT_COMMIT_SHA ?? undefined,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    profilesSampleRate: Number(process.env.SENTRY_PROFILES_SAMPLE_RATE ?? '0'),
    sendDefaultPii: false
  });
}
