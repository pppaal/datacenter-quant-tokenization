import Link from 'next/link';
import { AssetClass } from '@prisma/client';
import { formatCurrencyFromKrwAtRate, resolveDisplayCurrency } from '@/lib/finance/currency';
import { SatelliteRiskSummary } from '@/components/valuation/satellite-risk-summary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { listAssets } from '@/lib/services/assets';
import { getFxRateMap } from '@/lib/services/fx';
import { formatDate, formatNumber } from '@/lib/utils';
import { resolveSatelliteRiskSnapshot } from '@/lib/valuation/satellite-risk';

export const dynamic = 'force-dynamic';

function getRecommendation(confidenceScore?: number | null) {
  if ((confidenceScore ?? 0) >= 75) return 'Proceed To Committee';
  if ((confidenceScore ?? 0) >= 55) return 'Proceed With Conditions';
  return 'Further Diligence Required';
}

export default async function AssetsPage() {
  const assets = await listAssets();
  const fxRateMap = await getFxRateMap(
    assets.map((asset) => resolveDisplayCurrency(asset.address?.country ?? asset.market))
  );
  const totalArea = assets.reduce(
    (sum, asset) => sum + (asset.rentableAreaSqm ?? asset.grossFloorAreaSqm ?? 0),
    0
  );
  const reviewCount = assets.filter((asset) => asset.status === 'UNDER_REVIEW').length;
  const assetClassCount = new Set(assets.map((asset) => asset.assetClass)).size;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <Card className="hero-mesh">
          <div className="eyebrow">Asset Pipeline</div>
          <h2 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-white">
            Korean real-estate dossiers moving through evidence, valuation, and committee review.
          </h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400">
            Track which office, data-center, logistics, or land opportunities are still in intake, which now have
            approved underwriting evidence, and which are ready for refreshed valuation, IC material, and registry-ready
            packaging.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/admin/assets/new">
              <Button>New Asset Intake</Button>
            </Link>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            ['Tracked Assets', formatNumber(assets.length, 0), 'active dossiers'],
            ['Under Review', formatNumber(reviewCount, 0), 'currently moving through diligence'],
            [
              'Tracked Footprint',
              `${formatNumber(totalArea)} sqm / ${formatNumber(assetClassCount, 0)} sectors`,
              'visible in current pipeline'
            ]
          ].map(([label, value, detail]) => (
            <div key={label} className="metric-card">
              <div className="fine-print">{label}</div>
              <div className="mt-3 text-3xl font-semibold text-white">{value}</div>
              <p className="mt-2 text-sm text-slate-400">{detail}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-5">
        {assets.length === 0 ? (
          <Card className="rounded-[24px] border border-white/10 bg-white/[0.03] p-6 text-sm leading-7 text-slate-400">
            No asset dossiers exist yet. Start with <span className="font-semibold text-slate-200">New Asset Intake</span>{' '}
            to create the first institutional underwriting file.
          </Card>
        ) : null}

        {assets.map((asset) => {
          const latestRun = asset.valuations[0];
          const displayCurrency = resolveDisplayCurrency(asset.address?.country ?? asset.market);
          const fxRateToKrw = fxRateMap[displayCurrency];
          const satelliteRisk = resolveSatelliteRiskSnapshot({
            assumptions: latestRun?.assumptions,
            siteProfile: asset.siteProfile
          });
          const recommendation = getRecommendation(latestRun?.confidenceScore);

          return (
            <Card key={asset.id}>
              <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="fine-print">{asset.assetCode}</div>
                      <Link
                        href={`/admin/assets/${asset.id}`}
                        className="mt-2 block text-2xl font-semibold text-white underline-offset-4 hover:underline"
                      >
                        {asset.name}
                      </Link>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge>{asset.status}</Badge>
                      <Badge tone={latestRun ? 'good' : 'warn'}>{recommendation}</Badge>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-4">
                    <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                    <div className="fine-print">Location</div>
                      <div className="mt-2 text-lg font-semibold text-white">
                        {asset.address?.city ?? 'N/A'} / {asset.assetClass}
                      </div>
                    </div>
                    <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                      <div className="fine-print">
                        {asset.assetClass === AssetClass.DATA_CENTER ? 'Power' : 'Area'}
                      </div>
                      <div className="mt-2 text-lg font-semibold text-white">
                        {asset.assetClass === AssetClass.DATA_CENTER
                          ? `${formatNumber(asset.powerCapacityMw)} MW`
                          : `${formatNumber(asset.rentableAreaSqm ?? asset.grossFloorAreaSqm)} sqm`}
                      </div>
                    </div>
                    <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                      <div className="fine-print">Latest Value</div>
                      <div className="mt-2 text-lg font-semibold text-white">
                        {formatCurrencyFromKrwAtRate(
                          latestRun?.baseCaseValueKrw ?? asset.currentValuationKrw,
                          displayCurrency,
                          fxRateToKrw
                        )}
                      </div>
                    </div>
                    <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                      <div className="fine-print">Updated</div>
                      <div className="mt-2 text-lg font-semibold text-white">{formatDate(asset.updatedAt)}</div>
                    </div>
                  </div>

                  <div className="mt-5">
                    <SatelliteRiskSummary snapshot={satelliteRisk} compact />
                  </div>
                </div>

                <div className="grid gap-4">
                  <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                    <div className="eyebrow">Latest IM Snapshot</div>
                    <p className="mt-4 text-sm leading-7 text-slate-300">
                      {latestRun?.underwritingMemo ?? 'No generated IM yet. Run the analysis to create the first committee memo.'}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Link href={`/admin/assets/${asset.id}`}>
                      <Button>Open Dossier</Button>
                    </Link>
                    {latestRun ? (
                      <Link href={`/admin/valuations/${latestRun.id}`}>
                        <Button variant="secondary">Open IM</Button>
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
