import { AssetClass, type MarketIndicatorSeries, type RentComp, type TransactionComp } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatCurrencyFromKrwAtRate, type SupportedCurrency } from '@/lib/finance/currency';
import { formatDate, formatNumber, formatPercent } from '@/lib/utils';

type MarketEvidencePanelProps = {
  assetClass: AssetClass;
  displayCurrency?: SupportedCurrency;
  fxRateToKrw?: number | null;
  transactionComps: TransactionComp[];
  rentComps: RentComp[];
  marketIndicators: MarketIndicatorSeries[];
};

function formatCompPricing(
  assetClass: AssetClass,
  comp: Pick<TransactionComp, 'priceKrw' | 'pricePerSqmKrw' | 'pricePerMwKrw' | 'capRatePct'>,
  displayCurrency: SupportedCurrency,
  fxRateToKrw?: number | null
) {
  if (assetClass === AssetClass.DATA_CENTER) {
    if (comp.pricePerMwKrw != null) {
      return `${formatCurrencyFromKrwAtRate(comp.pricePerMwKrw, displayCurrency, fxRateToKrw)} / MW`;
    }
  } else if (comp.pricePerSqmKrw != null) {
    return `${formatCurrencyFromKrwAtRate(comp.pricePerSqmKrw, displayCurrency, fxRateToKrw)} / sqm`;
  }

  if (comp.priceKrw != null) {
    return formatCurrencyFromKrwAtRate(comp.priceKrw, displayCurrency, fxRateToKrw);
  }

  if (comp.capRatePct != null) {
    return `Cap rate ${formatPercent(comp.capRatePct)}`;
  }

  return 'Pricing not supplied';
}

function formatRentComp(
  assetClass: AssetClass,
  comp: Pick<RentComp, 'monthlyRentPerSqmKrw' | 'monthlyRatePerKwKrw' | 'occupancyPct' | 'escalationPct'>,
  displayCurrency: SupportedCurrency,
  fxRateToKrw?: number | null
) {
  const primaryValue =
    assetClass === AssetClass.DATA_CENTER ? comp.monthlyRatePerKwKrw : comp.monthlyRentPerSqmKrw;
  const unit = assetClass === AssetClass.DATA_CENTER ? '/ kW' : '/ sqm';
  const occupancy = comp.occupancyPct != null ? ` / Occ ${formatPercent(comp.occupancyPct)}` : '';
  const escalation = comp.escalationPct != null ? ` / Esc ${formatPercent(comp.escalationPct)}` : '';

  if (primaryValue == null) {
    return `${occupancy || 'Rent missing'}${escalation}`;
  }

  return `${formatCurrencyFromKrwAtRate(primaryValue, displayCurrency, fxRateToKrw)} ${unit}${occupancy}${escalation}`;
}

export function MarketEvidencePanel({
  assetClass,
  displayCurrency = 'KRW',
  fxRateToKrw,
  transactionComps,
  rentComps,
  marketIndicators
}: MarketEvidencePanelProps) {
  const topTransactionComps = transactionComps.slice(0, 4);
  const topRentComps = rentComps.slice(0, 4);
  const topIndicators = marketIndicators.slice(0, 6);
  const hasEvidence =
    topTransactionComps.length > 0 || topRentComps.length > 0 || topIndicators.length > 0;

  if (!hasEvidence) return null;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Market Evidence</div>
          <h3 className="mt-2 text-2xl font-semibold text-white">Live comps and market indicator feed</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {topTransactionComps.length > 0 ? <Badge>{topTransactionComps.length} transaction comps</Badge> : null}
          {topRentComps.length > 0 ? <Badge>{topRentComps.length} rent comps</Badge> : null}
          {topIndicators.length > 0 ? <Badge>{topIndicators.length} indicators</Badge> : null}
        </div>
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          <div className="fine-print">Transaction Evidence</div>
          {topTransactionComps.length > 0 ? (
            topTransactionComps.map((comp) => (
              <div key={comp.id} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">{comp.comparableType}</div>
                    <div className="mt-1 text-base text-slate-200">{comp.region}</div>
                  </div>
                  <div className="text-right text-sm text-slate-400">{formatDate(comp.transactionDate)}</div>
                </div>
                <div className="mt-3 text-sm text-slate-300">
                  {formatCompPricing(assetClass, comp, displayCurrency, fxRateToKrw)}
                </div>
                <div className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                  {comp.buyerType ?? 'buyer n/a'} / {comp.sellerType ?? 'seller n/a'}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
              No transaction comps loaded from the market feed yet.
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="fine-print">Rent And Leasing Evidence</div>
          {topRentComps.length > 0 ? (
            topRentComps.map((comp) => (
              <div key={comp.id} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">{comp.comparableType}</div>
                    <div className="mt-1 text-base text-slate-200">{comp.region}</div>
                  </div>
                  <div className="text-right text-sm text-slate-400">{formatDate(comp.observationDate)}</div>
                </div>
                <div className="mt-3 text-sm text-slate-300">
                  {formatRentComp(assetClass, comp, displayCurrency, fxRateToKrw)}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
              No rent comps loaded from the market feed yet.
            </div>
          )}
        </div>
      </div>

      <div className="mt-6">
        <div className="fine-print">Indicator Tape</div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {topIndicators.length > 0 ? (
            topIndicators.map((indicator) => (
              <div key={indicator.id} className="rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-4">
                <div className="fine-print">{indicator.indicatorKey.replace(/_/g, ' ')}</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {formatNumber(indicator.value)} {indicator.unit ?? ''}
                </div>
                <div className="mt-1 text-sm text-slate-400">
                  {(indicator.region ?? 'region n/a')} / {formatDate(indicator.observationDate)}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-slate-400 md:col-span-2 xl:col-span-3">
              No market indicators loaded from the market feed yet.
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
