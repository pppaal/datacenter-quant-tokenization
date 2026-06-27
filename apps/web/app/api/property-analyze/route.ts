import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AssetClass } from '@prisma/client';
import { autoAnalyzeProperty } from '@/lib/services/property-analyzer/auto-analyze';
import { buildFullReport } from '@/lib/services/property-analyzer/full-report';
import { createRateLimiter, RateLimitError } from '@/lib/security/rate-limit';
import { checkDistributedRateLimit } from '@/lib/security/distributed-rate-limit';
import { resolveClientIp } from '@/lib/security/edge-protection';
import { recordAuditEvent } from '@/lib/services/audit';
import { LruCache, hashCacheKey } from '@/lib/services/property-analyzer/report-cache';
import { persistAnalysisSnapshot } from '@/lib/services/property-analyzer/snapshot';
import { logger } from '@/lib/observability/logger';
import type { FullReport } from '@/lib/services/property-analyzer/full-report';

const reportCache = new LruCache<FullReport>({ max: 64, ttlMs: 10 * 60_000 });

// This endpoint is expensive (geocode + many external connectors + DCF/Monte
// Carlo), so throttle it in two layers like the admin-login path: an always-on
// in-process limiter, plus a cross-instance Upstash counter (soft-fails open
// when Redis is unconfigured, so dev/CI/e2e are unaffected). The in-process
// limiter alone is per-instance, i.e. N× the intended limit on multi-instance
// serverless.
const ANALYZE_RATE_WINDOW_MS = 60_000;
const ANALYZE_RATE_MAX = 10;

const analyzeRateLimiter = createRateLimiter('property-analyze', {
  windowMs: ANALYZE_RATE_WINDOW_MS,
  maxRequests: ANALYZE_RATE_MAX
});

const bodySchema = z
  .object({
    address: z.string().trim().min(1).max(256).optional(),
    location: z
      .object({
        latitude: z.number().finite().min(-90).max(90),
        longitude: z.number().finite().min(-180).max(180)
      })
      .optional(),
    includeAlternatives: z.number().int().min(0).max(2).optional(),
    overrideAssetClass: z.nativeEnum(AssetClass).optional()
  })
  .refine((b) => Boolean(b.address || b.location), {
    message: 'Either `address` or `location` is required'
  });

function clientKey(request: Request): string {
  // Hardened, hop-aware resolution so the per-IP rate-limit key can't be
  // defeated by rotating a spoofed leftmost x-forwarded-for entry on this
  // expensive public endpoint (honors TRUSTED_PROXY_HOP_COUNT).
  const resolved = resolveClientIp(request);
  if (resolved) return resolved;
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'anonymous';
}

export async function POST(request: Request) {
  const ip = clientKey(request);

  try {
    analyzeRateLimiter.check(ip);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'Too many requests. Please retry shortly.' },
        { status: 429, headers: { 'retry-after': String(Math.ceil(err.retryAfterMs / 1000)) } }
      );
    }
    throw err;
  }

  const distributed = await checkDistributedRateLimit(
    'property-analyze',
    ip,
    ANALYZE_RATE_WINDOW_MS,
    ANALYZE_RATE_MAX
  );
  if (!distributed.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please retry shortly.' },
      {
        status: 429,
        headers: { 'retry-after': String(Math.ceil(distributed.retryAfterMs / 1000)) }
      }
    );
  }

  let parsedBody: z.infer<typeof bodySchema>;
  try {
    const raw = await request.json();
    parsedBody = bodySchema.parse(raw);
  } catch (err) {
    if (err instanceof z.ZodError) {
      // Surface only a flattened field summary (path + message) — never the raw
      // `issues` array, which can echo received values back to an unauthenticated
      // caller. Field-level messages preserve form feedback without disclosure.
      const summary = err.issues
        .map((issue) =>
          issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message
        )
        .join('; ');
      return NextResponse.json({ error: summary || 'Invalid request body' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const cacheKey = hashCacheKey([
    parsedBody.address ?? '',
    parsedBody.location?.latitude ?? '',
    parsedBody.location?.longitude ?? '',
    parsedBody.includeAlternatives ?? 0,
    parsedBody.overrideAssetClass ?? ''
  ]);

  try {
    const cached = reportCache.get(cacheKey);
    if (cached) {
      return NextResponse.json(cached, { headers: { 'x-cache': 'hit' } });
    }

    const auto = await autoAnalyzeProperty({
      address: parsedBody.address,
      location: parsedBody.location,
      includeAlternatives: parsedBody.includeAlternatives ?? 0,
      overrideAssetClass: parsedBody.overrideAssetClass
    });
    const report = await buildFullReport(auto);
    reportCache.set(cacheKey, report);

    // Persist an immutable system-of-record snapshot of this analysis. Done
    // before the response so the returned `snapshotId` is a stable URL, but
    // never allowed to fail the request — a persistence outage degrades to the
    // prior ephemeral behavior.
    let snapshotId: string | null = null;
    try {
      const persisted = await persistAnalysisSnapshot(report);
      snapshotId = persisted.id;
    } catch (persistError) {
      logger.error('property-analyze snapshot persist failed', {
        error: persistError instanceof Error ? persistError.message : 'unknown'
      });
    }

    recordAuditEvent({
      action: 'property.analyze',
      entityType: 'PropertyAnalysis',
      entityId: parsedBody.address ?? null,
      requestPath: '/api/property-analyze',
      requestMethod: 'POST',
      ipAddress: ip,
      statusLabel: 'SUCCESS',
      metadata: {
        hasAddress: Boolean(parsedBody.address),
        hasLocation: Boolean(parsedBody.location),
        includeAlternatives: parsedBody.includeAlternatives ?? 0,
        overrideAssetClass: parsedBody.overrideAssetClass ?? null,
        snapshotId
      }
    }).catch(() => {});

    return NextResponse.json({ ...report, snapshotId }, { headers: { 'x-cache': 'miss' } });
  } catch (error) {
    console.error('[property-analyze] failure', error);
    recordAuditEvent({
      action: 'property.analyze',
      entityType: 'PropertyAnalysis',
      entityId: parsedBody.address ?? null,
      requestPath: '/api/property-analyze',
      requestMethod: 'POST',
      ipAddress: ip,
      statusLabel: 'FAILURE',
      metadata: {
        errorMessage: error instanceof Error ? error.message.slice(0, 200) : 'unknown'
      }
    }).catch(() => {});
    return NextResponse.json(
      { error: 'Analysis failed. Please try again later.' },
      { status: 500 }
    );
  }
}
