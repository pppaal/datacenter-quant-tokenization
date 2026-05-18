/**
 * Prisma client singleton.
 *
 * Lifecycle:
 *   - dev / test  : reuse the same client across hot reloads via
 *                   `globalThis.__prisma` so Next.js's HMR doesn't leak a
 *                   new connection on every edit.
 *   - production  : each Vercel serverless instance creates its own
 *                   client. Connection re-use across invocations is
 *                   handled by the database pooler (Neon `-pooler`,
 *                   Supabase `aws-0-...pooler...`, RDS Proxy, ...). Do
 *                   NOT enable the singleton in prod — it would silently
 *                   share connections across cold-start workers.
 *
 * Logging:
 *   - `PRISMA_LOG_QUERY=true`  enables query logs (verbose; off by default)
 *   - `PRISMA_LOG_LEVEL=warn`  forwards warn+error to stderr (default)
 *
 * To swap to a connection-pooled URL only at runtime (e.g. read replicas),
 * configure via `DATABASE_URL` directly and Prisma will route per the URL.
 */
import { PrismaClient, type Prisma } from '@prisma/client';

declare global {
  var __prisma: PrismaClient | undefined;
}

function resolveLogConfig(): Prisma.LogLevel[] {
  const requested = process.env.PRISMA_LOG_LEVEL?.trim().toLowerCase();
  const queryEnabled =
    process.env.PRISMA_LOG_QUERY === 'true' || process.env.PRISMA_LOG_QUERY === '1';
  const base: Prisma.LogLevel[] =
    requested === 'error'
      ? ['error']
      : requested === 'info'
        ? ['warn', 'info', 'error']
        : ['warn', 'error'];
  return queryEnabled ? Array.from(new Set([...base, 'query'])) : base;
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: resolveLogConfig()
  });
}

export const prisma = globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}
