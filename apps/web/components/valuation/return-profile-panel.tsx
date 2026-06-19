import { Card } from '@/components/ui/card';
import { formatCompactCurrencyFromKrwAtRate, type SupportedCurrency } from '@/lib/finance/currency';
import { formatNumber, formatPercent } from '@/lib/utils';

type Props = {
  assumptions?: Record<string, unknown> | null;
  /** Concluded base-case value (run.baseCaseValueKrw) for the TV-%-of-value ratio. */
  concludedValueKrw?: number | null;
  displayCurrency?: SupportedCurrency;
  fxRateToKrw?: number | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function num(record: Record<string, unknown> | null, key: string): number | null {
  const value = record?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * The institutional returns block, read from the persisted base-case proforma
 * summary (`assumptions.proForma.baseCase.summary`) that the engine already
 * writes — levered/unlevered IRR, MOIC, cash-on-cash, payback, plus the two
 * lender headline metrics (debt yield, terminal-value share) the IC asks for
 * but the page never showed.
 */
export function ReturnProfilePanel({
  assumptions,
  concludedValueKrw,
  displayCurrency = 'KRW',
  fxRateToKrw
}: Props) {
  const proForma = asRecord(asRecord(asRecord(assumptions)?.proForma)?.baseCase);
  const summary = asRecord(proForma?.summary);
  if (!summary) return null;

  const equityIrr = num(summary, 'equityIrr');
  const unleveragedIrr = num(summary, 'unleveragedIrr');
  const moic = num(summary, 'equityMultiple');
  const coc = num(summary, 'averageCashOnCash');
  const paybackYear = num(summary, 'paybackYear');
  const stabilizedNoiKrw = num(summary, 'stabilizedNoiKrw');
  const initialDebtKrw = num(summary, 'initialDebtFundingKrw');
  const initialEquityKrw = num(summary, 'initialEquityKrw');
  const peakEquityKrw = num(summary, 'peakEquityExposureKrw');
  const terminalValueKrw = num(summary, 'terminalValueKrw');
  const terminalYear = num(summary, 'terminalYear');

  if (equityIrr == null && moic == null && unleveragedIrr == null) return null;

  const metrics = asRecord(asRecord(assumptions)?.metrics);
  const discountRatePct =
    num(metrics, 'discountRatePct') ?? num(asRecord(assumptions), 'discountRatePct');
  const capRatePct = num(metrics, 'capRatePct') ?? num(asRecord(assumptions), 'capRatePct');

  // Yield-on-cost = stabilized NOI / total project cost (equity + debt funded);
  // the spread over the going-in cap is the development margin a build earns
  // over buying stabilized (institutional comfort ~75–150bps).
  const totalCapexKrw =
    initialEquityKrw != null && initialDebtKrw != null ? initialEquityKrw + initialDebtKrw : null;
  const yieldOnCostPct =
    stabilizedNoiKrw != null && totalCapexKrw && totalCapexKrw > 0
      ? (stabilizedNoiKrw / totalCapexKrw) * 100
      : null;
  const devSpreadBps =
    yieldOnCostPct != null && capRatePct != null
      ? Math.round((yieldOnCostPct - capRatePct) * 100)
      : null;

  // Year-1 debt yield = stabilized NOI / loan funded — the lender's
  // rate/amort-independent leverage test.
  const debtYieldPct =
    stabilizedNoiKrw != null && initialDebtKrw && initialDebtKrw > 0
      ? (stabilizedNoiKrw / initialDebtKrw) * 100
      : null;

  // Terminal value as % of concluded value (PV of the exit, so a true
  // exit-reliance ratio). >70% means the value rests on the sale assumption.
  const tvPctOfValue =
    terminalValueKrw != null &&
    terminalYear != null &&
    discountRatePct != null &&
    concludedValueKrw &&
    concludedValueKrw > 0
      ? (terminalValueKrw / Math.pow(1 + discountRatePct / 100, terminalYear) / concludedValueKrw) *
        100
      : null;

  const money = (value: number | null) =>
    value == null ? '—' : formatCompactCurrencyFromKrwAtRate(value, displayCurrency, fxRateToKrw);

  const tiles: Array<{ label: string; value: string; hint?: string; tone?: 'warn' }> = [
    { label: 'Levered IRR', value: equityIrr != null ? formatPercent(equityIrr) : '—' },
    { label: 'Unlevered IRR', value: unleveragedIrr != null ? formatPercent(unleveragedIrr) : '—' },
    { label: 'Equity Multiple', value: moic != null ? `${formatNumber(moic, 2)}x` : '—' },
    { label: 'Avg Cash-on-Cash', value: coc != null ? formatPercent(coc) : '—' },
    {
      label: 'Payback',
      value: paybackYear != null ? `Yr ${formatNumber(paybackYear, 0)}` : '—'
    },
    {
      label: 'Debt Yield (Y1)',
      value: debtYieldPct != null ? formatPercent(debtYieldPct) : '—',
      hint: 'NOI / loan',
      tone: debtYieldPct != null && debtYieldPct < 8 ? 'warn' : undefined
    },
    {
      label: 'Terminal Value',
      value: tvPctOfValue != null ? `${formatPercent(tvPctOfValue)} of value` : '—',
      hint: 'exit reliance',
      tone: tvPctOfValue != null && tvPctOfValue > 70 ? 'warn' : undefined
    },
    {
      label: 'Initial Equity',
      value: money(initialEquityKrw),
      hint: money(peakEquityKrw) + ' peak'
    },
    {
      label: 'Yield on Cost',
      value: yieldOnCostPct != null ? formatPercent(yieldOnCostPct) : '—',
      hint:
        devSpreadBps != null
          ? `${devSpreadBps >= 0 ? '+' : ''}${devSpreadBps}bp dev spread`
          : undefined,
      tone: devSpreadBps != null && devSpreadBps < 75 ? 'warn' : undefined
    }
  ];

  return (
    <Card data-testid="return-profile-panel">
      <div className="eyebrow">Return Profile</div>
      <h3 className="mt-2 text-2xl font-semibold text-foreground">
        Levered returns, coverage, and exit reliance
      </h3>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
        The base-case return profile from the underwriting run — equity and project IRR, multiple,
        and the lender&apos;s debt-yield and terminal-value-reliance checks.
      </p>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="rounded-[12px] border border-border bg-[hsl(var(--panel-alt))] p-4"
          >
            <dt className="text-[11px] uppercase tracking-[0.12em] text-muted">{tile.label}</dt>
            <dd
              className={`mt-1.5 text-lg font-semibold tabular-nums ${
                tile.tone === 'warn' ? 'text-[hsl(var(--warning))]' : 'text-foreground'
              }`}
            >
              {tile.value}
            </dd>
            {tile.hint ? <dd className="mt-0.5 text-xs text-muted">{tile.hint}</dd> : null}
          </div>
        ))}
      </dl>
    </Card>
  );
}
