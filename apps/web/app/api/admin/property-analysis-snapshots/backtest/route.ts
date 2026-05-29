import { NextResponse } from 'next/server';
import { AssetClass } from '@prisma/client';
import { withAdminApi } from '@/lib/security/with-admin-api';
import { runAnalysisBacktestFromDb } from '@/lib/services/property-analyzer/analysis-backtest-loader';

/**
 * Realized-price calibration backtest over persisted analysis snapshots:
 * MAPE / mean bias / cap-rate residuals by asset class and vintage, with
 * strict point-in-time separation (predictions only compared to prices
 * realized AFTER the prediction date).
 */
export const GET = withAdminApi({
  requiredRole: 'ANALYST',
  auditAction: 'property-analysis.backtest',
  auditEntityType: 'PropertyAnalysisSnapshot',
  async handler({ request }) {
    const url = new URL(request.url);
    const assetClassRaw = url.searchParams.get('assetClass')?.trim();
    const assetClass =
      assetClassRaw && assetClassRaw in AssetClass ? (assetClassRaw as AssetClass) : undefined;

    const result = await runAnalysisBacktestFromDb({ assetClass });
    return NextResponse.json(result);
  }
});
