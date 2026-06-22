import { formatCompactCurrencyFromKrwAtRate } from '@/lib/finance/currency';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import type { SampleReportData } from './types';

export function InsuranceSection({ data }: { data: SampleReportData }) {
  const { displayCurrency, fxRateToKrw, insuranceSummary } = data;
  if (!insuranceSummary) {
    return null;
  }
  return (
    <section id="im-insurance" className="app-shell py-4">
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow">Insurance register</div>
            <p className="mt-2 max-w-3xl text-sm text-[hsl(var(--foreground-muted))]">
              Active policies covering property, business interruption, liability, construction, and
              cyber. Renewals expiring within 90 days are flagged for pre-IC review; coverage limits
              anchor the LP-side underwriting of catastrophic loss exposure.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {insuranceSummary.expiringSoonCount > 0 ? (
              <Badge tone="warn">{insuranceSummary.expiringSoonCount} expiring &lt; 90d</Badge>
            ) : null}
            <Badge>
              {insuranceSummary.policies.length} polic
              {insuranceSummary.policies.length === 1 ? 'y' : 'ies'}
            </Badge>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {insuranceSummary.tilesByType.map((tile) => {
            const tone =
              tile.status === 'EXPIRING'
                ? 'border-[hsl(var(--warning)/0.25)] bg-[hsl(var(--warning-tint))]'
                : tile.status === 'EXPIRED'
                  ? 'border-[hsl(var(--danger)/0.25)] bg-[hsl(var(--danger-tint))]'
                  : 'border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))]';
            const dot =
              tile.status === 'EXPIRING'
                ? 'bg-[hsl(var(--warning))]'
                : tile.status === 'EXPIRED'
                  ? 'bg-[hsl(var(--danger))]'
                  : 'bg-[hsl(var(--success))]';
            return (
              <div
                key={`${tile.policyType}-${tile.insurer ?? ''}-${tile.expiresOn ?? ''}`}
                className={`rounded-[16px] border ${tone} p-3`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] uppercase tracking-wide text-[hsl(var(--muted))]">
                    {tile.label}
                  </div>
                  <span className="flex items-center gap-1.5 text-[10px] text-[hsl(var(--foreground-muted))]">
                    <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                    {tile.status}
                  </span>
                </div>
                <div className="mt-2 font-mono text-sm font-semibold text-[hsl(var(--foreground))]">
                  {tile.coverageKrw !== null
                    ? formatCompactCurrencyFromKrwAtRate(
                        tile.coverageKrw,
                        displayCurrency,
                        fxRateToKrw
                      )
                    : '—'}
                </div>
                <div className="mt-1 text-[10px] text-[hsl(var(--muted))]">
                  {tile.insurer ?? '—'}
                  {tile.premiumKrw !== null
                    ? ` · premium ${formatCompactCurrencyFromKrwAtRate(tile.premiumKrw, displayCurrency, fxRateToKrw)}`
                    : ''}
                </div>
                {tile.expiresOn ? (
                  <div className="mt-1 text-[10px] text-[hsl(var(--muted))]">
                    Expires {formatDate(tile.expiresOn)}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="mt-4 grid gap-3 text-[11px] md:grid-cols-3">
          <div className="rounded-[12px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-[hsl(var(--muted))]">
              Total coverage
            </div>
            <div className="mt-1 font-mono text-sm text-[hsl(var(--foreground))]">
              {formatCompactCurrencyFromKrwAtRate(
                insuranceSummary.totalCoverageKrw,
                displayCurrency,
                fxRateToKrw
              )}
            </div>
          </div>
          <div className="rounded-[12px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-[hsl(var(--muted))]">
              Total annual premium
            </div>
            <div className="mt-1 font-mono text-sm text-[hsl(var(--foreground))]">
              {formatCompactCurrencyFromKrwAtRate(
                insuranceSummary.totalPremiumKrw,
                displayCurrency,
                fxRateToKrw
              )}
            </div>
          </div>
          <div className="rounded-[12px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-[hsl(var(--muted))]">
              Avg deductible
            </div>
            <div className="mt-1 font-mono text-sm text-[hsl(var(--foreground))]">
              {insuranceSummary.averageDeductibleKrw !== null
                ? formatCompactCurrencyFromKrwAtRate(
                    insuranceSummary.averageDeductibleKrw,
                    displayCurrency,
                    fxRateToKrw
                  )
                : '—'}
            </div>
          </div>
        </div>
      </Card>
    </section>
  );
}
