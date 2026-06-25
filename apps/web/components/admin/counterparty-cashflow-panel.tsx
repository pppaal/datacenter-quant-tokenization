import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatCurrencyFromKrwAtRate, type SupportedCurrency } from '@/lib/finance/currency';
import { projectCfadsDscr } from '@/lib/services/im/cash-flow';
import type { AssetFinancialStatement } from '@/lib/services/financial-statements';
import { formatNumber } from '@/lib/utils';

type Props = {
  statements: AssetFinancialStatement[];
  displayCurrency?: SupportedCurrency;
  fxRateToKrw?: number | null;
};

function toNumber(value: { toString(): string } | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

function dscrTone(dscr: number | null): 'good' | 'warn' | 'danger' | 'neutral' {
  if (dscr === null) return 'neutral';
  if (dscr >= 1.5) return 'good';
  if (dscr >= 1.2) return 'warn';
  return 'danger';
}

// One forward CFADS/DSCR projection per counterparty, built from their latest
// statement and their own historical revenue CAGR.
function buildProjections(statements: AssetFinancialStatement[]) {
  const byCounterparty = new Map<string, AssetFinancialStatement[]>();
  for (const statement of statements) {
    const existing = byCounterparty.get(statement.counterpartyId);
    if (existing) existing.push(statement);
    else byCounterparty.set(statement.counterpartyId, [statement]);
  }

  return Array.from(byCounterparty.values())
    .map((group) => {
      // Query orders fiscalYear desc within counterparty: [0] is newest.
      const sorted = [...group].sort((a, b) => (b.fiscalYear ?? 0) - (a.fiscalYear ?? 0));
      const latest = sorted[0];
      const oldest = sorted[sorted.length - 1];

      const revenue = toNumber(latest.revenueKrw);
      const ebitda = toNumber(latest.ebitdaKrw);
      const totalDebt = toNumber(latest.totalDebtKrw);
      const interest = toNumber(latest.interestExpenseKrw);
      if (!revenue || revenue <= 0 || ebitda === null || !totalDebt || totalDebt <= 0) {
        return null;
      }

      const oldestRevenue = toNumber(oldest.revenueKrw);
      const spanYears = (latest.fiscalYear ?? 0) - (oldest.fiscalYear ?? 0);
      const revenueGrowthPct =
        oldestRevenue && oldestRevenue > 0 && spanYears > 0
          ? (Math.pow(revenue / oldestRevenue, 1 / spanYears) - 1) * 100
          : 3;
      const interestRatePct = interest && interest > 0 ? (interest / totalDebt) * 100 : 4.5;

      const rows = projectCfadsDscr(
        {
          revenueKrw: revenue,
          ebitdaMarginPct: (ebitda / revenue) * 100,
          interestRatePct,
          totalDebtKrw: totalDebt
        },
        {
          revenueGrowthPct,
          debtAmortizationPct: 5,
          horizonYears: 9,
          taxRate: 0.242
        }
      );

      const minDscr = rows.reduce<number | null>((min, row) => {
        if (row.cfadsDscr === null) return min;
        return min === null ? row.cfadsDscr : Math.min(min, row.cfadsDscr);
      }, null);

      return {
        counterparty: latest.counterparty,
        revenueGrowthPct,
        interestRatePct,
        rows,
        minDscr
      };
    })
    .filter((value): value is NonNullable<typeof value> => value !== null);
}

export function CounterpartyCashflowPanel({
  statements,
  displayCurrency = 'KRW',
  fxRateToKrw
}: Props) {
  const projections = buildProjections(statements);
  const money = (value: number) => formatCurrencyFromKrwAtRate(value, displayCurrency, fxRateToKrw);

  if (projections.length === 0) return null;

  return (
    <Card data-testid="counterparty-cashflow-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Counterparty Cash Flow</div>
          <h3 className="mt-2 text-2xl font-semibold text-[hsl(var(--foreground))]">
            10-year CFADS and DSCR projection
          </h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[hsl(var(--muted))]">
            Forward debt-service coverage projected from each counterparty&apos;s latest statement,
            grown at their own historical revenue CAGR. Lowest projected DSCR flags the tightest
            coverage year.
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        {projections.map((projection) => (
          <div
            key={projection.counterparty.id}
            className="rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-[hsl(var(--foreground))]">
                  {projection.counterparty.name}
                </div>
                <div className="mt-1 text-xs uppercase tracking-[0.2em] text-[hsl(var(--muted))]">
                  Growth {formatNumber(projection.revenueGrowthPct, 1)}% / Rate{' '}
                  {formatNumber(projection.interestRatePct, 1)}%
                </div>
              </div>
              <Badge tone={dscrTone(projection.minDscr)}>
                Min DSCR{' '}
                {projection.minDscr !== null ? `${formatNumber(projection.minDscr, 2)}x` : 'N/A'}
              </Badge>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.16em] text-[hsl(var(--muted))]">
                    <th className="px-3 py-2">Year</th>
                    <th className="px-3 py-2 text-right">EBITDA</th>
                    <th className="px-3 py-2 text-right">Operating CF</th>
                    <th className="px-3 py-2 text-right">FCF</th>
                    <th className="px-3 py-2 text-right">CFADS</th>
                    <th className="px-3 py-2 text-right">Debt Service</th>
                    <th className="px-3 py-2 text-right">DSCR</th>
                  </tr>
                </thead>
                <tbody>
                  {projection.rows.map((row) => (
                    <tr key={row.year} className="border-t border-[hsl(var(--border))]">
                      <td className="px-3 py-2 font-mono text-[hsl(var(--foreground-muted))]">
                        {row.year}
                      </td>
                      <td className="px-3 py-2 text-right text-[hsl(var(--foreground))]">
                        {money(row.ebitdaKrw)}
                      </td>
                      <td className="px-3 py-2 text-right text-[hsl(var(--foreground))]">
                        {money(row.cashFlowOperatingKrw)}
                      </td>
                      <td className="px-3 py-2 text-right text-[hsl(var(--foreground))]">
                        {money(row.freeCashFlowKrw)}
                      </td>
                      <td className="px-3 py-2 text-right text-[hsl(var(--foreground))]">
                        {money(row.cfadsKrw)}
                      </td>
                      <td className="px-3 py-2 text-right text-[hsl(var(--foreground))]">
                        {money(row.debtServiceKrw)}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-[hsl(var(--foreground))]">
                        {row.cfadsDscr !== null ? `${formatNumber(row.cfadsDscr, 2)}x` : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
