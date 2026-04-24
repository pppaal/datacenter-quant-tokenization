import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AssetClass } from '@prisma/client';
import { autoAnalyzeProperty } from '@/lib/services/property-analyzer/auto-analyze';
import { buildFullReport } from '@/lib/services/property-analyzer/full-report';
import { createRateLimiter, RateLimitError } from '@/lib/security/rate-limit';
import { recordAuditEvent } from '@/lib/services/audit';
import { LruCache, hashCacheKey } from '@/lib/services/property-analyzer/report-cache';
import type { FullReport } from '@/lib/services/property-analyzer/full-report';

const reportCache = new LruCache<FullReport>({ max: 64, ttlMs: 10 * 60_000 });

const analyzeRateLimiter = createRateLimiter('property-analyze', {
  windowMs: 60_000,
  maxRequests: 10
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
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
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

  let parsedBody: z.infer<typeof bodySchema>;
  try {
    const raw = await request.json();
    parsedBody = bodySchema.parse(raw);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request body', details: err.issues }, { status: 400 });
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
        overrideAssetClass: parsedBody.overrideAssetClass ?? null
      }
    }).catch(() => {});

    return NextResponse.json(report, { headers: { 'x-cache': 'miss' } });
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
    return NextResponse.json({ error: 'Analysis failed. Please try again later.' }, { status: 500 });
  }
}
