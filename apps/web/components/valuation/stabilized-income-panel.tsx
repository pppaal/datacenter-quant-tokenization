import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatCurrencyFromKrwAtRate, type SupportedCurrency } from '@/lib/finance/currency';
import type { StabilizedIncomeView } from '@/lib/services/valuation/pro-forma';
import { formatNumber, toSentenceCase } from '@/lib/utils';

type Props = {
  view: StabilizedIncomeView;
  displayCurrency?: SupportedCurrency;
  fxRateToKrw?: number | null;
};

export function StabilizedIncomePanel({ view, displayCurrency = 'KRW', fxRateToKrw }: Props) {
  const money = (value: number | null) =>
    formatCurrencyFromKrwAtRate(value, displayCurrency, fxRateToKrw);
  const impliedValueKrw = view.stabilizedNoiKrw / (view.capRatePct / 100);

  const debtKrw =
    view.purchasePriceKrw != null && view.debtLtvPct != null
      ? view.purchasePriceKrw * (view.debtLtvPct / 100)
      : null;
  const annualInterestKrw =
    debtKrw != null && view.debtCostPct != null ? debtKrw * (view.debtCostPct / 100) : null;
  const interestCoverage =
    annualInterestKrw && annualInterestKrw > 0 ? view.stabilizedNoiKrw / annualInterestKrw : null;

  const summary: Array<[string, string]> = [
    ['Stabilized NOI', money(view.stabilizedNoiKrw)],
    ['Cap Rate', `${formatNumber(view.capRatePct, 2)}%`],
    ['Implied Value (NOI ÷ cap)', money(impliedValueKrw)],
    ['Purchase Price', money(view.purchasePriceKrw)],
    ['Occupancy', view.occupancyPct != null ? `${formatNumber(view.occupancyPct, 1)}%` : 'N/A'],
    [
      'Rent / sqm / mo',
      view.monthlyRentPerSqmKrw != null ? money(view.monthlyRentPerSqmKrw) : 'N/A'
    ]
  ];

  const bridge: Array<[string, string, 'default' | 'subtotal' | 'emphasis', boolean]> = [
    ['Gross Potential Rent', money(view.grossPotentialRentKrw), 'default', false],
    ['Effective Rental Revenue', money(view.effectiveRentalRevenueKrw), 'subtotal', false],
    ['Other Income', money(view.otherIncomeKrw), 'default', false],
    ['Operating Expense', money(view.annualOpexKrw), 'default', true],
    ['Capex Reserve', money(view.annualCapexReserveKrw), 'default', true],
    ['Stabilized NOI', money(view.stabilizedNoiKrw), 'emphasis', false]
  ];

  return (
    <Card data-testid="stabilized-income-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Stabilized Valuation</div>
          <h3 className="mt-2 text-2xl font-semibold text-white">Direct-capitalization view</h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
            {view.assetClass ? toSentenceCase(view.assetClass) : 'This asset class'} is valued on a
            stabilized direct-capitalization basis — stabilized NOI capitalized at the market cap
            rate — rather than a multi-year DCF.
          </p>
        </div>
        {view.marketEvidenceCapRatePct != null ? (
          <Badge tone="neutral">Market cap {formatNumber(view.marketEvidenceCapRatePct, 2)}%</Badge>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {summary.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</div>
            <div className="mt-2 text-lg font-semibold text-white">{value}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-[26px] border border-white/10 bg-white/[0.03] p-4">
        <div className="text-xs uppercase tracking-[0.18em] text-slate-500">NOI Bridge</div>
        <table className="mt-3 w-full text-sm">
          <tbody>
            {bridge.map(([label, value, tone, negative]) => (
              <tr
                key={label}
                className={
                  tone === 'emphasis'
                    ? 'font-semibold text-white'
                    : tone === 'subtotal'
                      ? 'font-medium text-slate-100'
                      : 'text-slate-300'
                }
              >
                <td className="py-2">{label}</td>
                <td className="py-2 text-right font-mono">
                  {negative && value !== 'N/A' ? `(${value})` : value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {view.debtLtvPct != null ? (
          <Badge tone="neutral">LTV {formatNumber(view.debtLtvPct, 0)}%</Badge>
        ) : null}
        {view.debtCostPct != null ? (
          <Badge tone="neutral">Debt cost {formatNumber(view.debtCostPct, 2)}%</Badge>
        ) : null}
        {interestCoverage != null ? (
          <Badge
            tone={interestCoverage >= 1.5 ? 'good' : interestCoverage >= 1.2 ? 'warn' : 'danger'}
          >
            Interest coverage {formatNumber(interestCoverage, 2)}x
          </Badge>
        ) : null}
        {view.comparableEntryCount ? (
          <Badge tone="neutral">{view.comparableEntryCount} comps</Badge>
        ) : null}
        {view.marketTransactionCompCount ? (
          <Badge tone="neutral">{view.marketTransactionCompCount} txn evidence</Badge>
        ) : null}
        {view.marketRentCompCount ? (
          <Badge tone="neutral">{view.marketRentCompCount} rent evidence</Badge>
        ) : null}
      </div>
    </Card>
  );
}
