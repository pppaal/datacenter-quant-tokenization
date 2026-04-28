/**
 * Liveness + readiness probe.
 *
 *   GET /api/health           -> 200 always (liveness)
 *   GET /api/health?deep=1    -> 200 only when DB + storage are reachable
 *
 * The deep probe is intentionally cheap (one `SELECT 1`, one bucket
 * `HeadBucket` when S3 is configured). Use it from external uptime checks
 * and from Vercel's deployment-protection healthcheck. Do not expose this
 * route's response body publicly without sanitizing — failure messages
 * include configuration hints that should stay internal.
 */
import { NextResponse } from 'next/server';
import { HeadBucketCommand, S3Client, type S3ClientConfig } from '@aws-sdk/client-s3';
import { prisma } from '@/lib/db/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ProbeResult = {
  ok: boolean;
  durationMs: number;
  detail?: string;
};

async function probeDatabase(): Promise<ProbeResult> {
  const started = Date.now();
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    return { ok: true, durationMs: Date.now() - started };
  } catch (error) {
    return {
      ok: false,
      durationMs: Date.now() - started,
      detail: error instanceof Error ? error.message : 'unknown'
    };
  }
}

async function probeStorage(): Promise<ProbeResult> {
  const started = Date.now();
  const bucket = process.env.DOCUMENT_STORAGE_BUCKET?.trim();
  if (!bucket) {
    return {
      ok: true,
      durationMs: 0,
      detail: 'skipped (no DOCUMENT_STORAGE_BUCKET configured)'
    };
  }
  const config: S3ClientConfig = {
    region: process.env.DOCUMENT_STORAGE_REGION?.trim() || process.env.AWS_REGION?.trim() || 'us-east-1',
    endpoint: process.env.DOCUMENT_STORAGE_ENDPOINT?.trim() || undefined,
    forcePathStyle: process.env.DOCUMENT_STORAGE_FORCE_PATH_STYLE === 'true'
  };
  if (process.env.DOCUMENT_STORAGE_ACCESS_KEY_ID && process.env.DOCUMENT_STORAGE_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: process.env.DOCUMENT_STORAGE_ACCESS_KEY_ID,
      secretAccessKey: process.env.DOCUMENT_STORAGE_SECRET_ACCESS_KEY
    };
  }
  const client = new S3Client(config);
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return { ok: true, durationMs: Date.now() - started };
  } catch (error) {
    return {
      ok: false,
      durationMs: Date.now() - started,
      detail: error instanceof Error ? error.message : 'unknown'
    };
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const deep = url.searchParams.get('deep') === '1' || url.searchParams.get('deep') === 'true';

  if (!deep) {
    return NextResponse.json({
      status: 'ok',
      mode: 'liveness',
      release: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      timestamp: new Date().toISOString()
    });
  }

  const [database, storage] = await Promise.all([probeDatabase(), probeStorage()]);
  const ok = database.ok && storage.ok;
  return NextResponse.json(
    {
      status: ok ? 'ok' : 'degraded',
      mode: 'readiness',
      release: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      timestamp: new Date().toISOString(),
      checks: { database, storage }
    },
    { status: ok ? 200 : 503 }
  );
}
