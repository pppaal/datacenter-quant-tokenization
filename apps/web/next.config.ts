import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  distDir: 'build',
  experimental: {
    serverActions: { bodySizeLimit: '5mb' }
  }
};

// Sentry build-time wrapper. When SENTRY_AUTH_TOKEN + SENTRY_ORG +
// SENTRY_PROJECT are present, this uploads source maps and tags the
// release. Without those env vars it leaves the build untouched.
const sentryEnabled =
  !!process.env.SENTRY_AUTH_TOKEN &&
  !!process.env.SENTRY_ORG &&
  !!process.env.SENTRY_PROJECT;

export default sentryEnabled
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG!,
      project: process.env.SENTRY_PROJECT!,
      silent: !process.env.CI,
      widenClientFileUpload: true,
      disableLogger: true,
      automaticVercelMonitors: false
    })
  : nextConfig;
