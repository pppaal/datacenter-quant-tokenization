import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AssetClass } from '@prisma/client';
import { withAdminApi } from '@/lib/security/with-admin-api';
import { deriveAssetCapRateBenchmark } from '@/lib/services/research/cap-rate-benchmark';

export const dynamic = 'force-dynamic';

/**
 * Surface the comp → underwriting cap-rate benchmark (benchmark #8 wiring).
 *
 * Reads the aggregated RTMS/indicator comps for a target (market / region / class / tier)
 * and returns the blended benchmark + confidence + freshness, so underwriting and IC memos
 * can compare the model cap rate against the live comp set. VIEWER+; read-only.
 */
export const POST = withAdminApi({
  bodySchema: z.object({
    market: z.string().min(1),
    region: z.string().min(1).optional(),
    assetClass: z.nativeEnum(AssetClass).optional(),
    assetTier: z.string().min(1).optional()
  }),
  requiredRole: 'VIEWER',
  async handler({ body }) {
    const benchmark = await deriveAssetCapRateBenchmark({
      market: body.market,
      region: body.region ?? null,
      assetClass: body.assetClass ?? null,
      assetTier: body.assetTier ?? null
    });
    return NextResponse.json({ benchmark });
  }
});
