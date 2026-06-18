import { Card } from '@/components/ui/card';
import { formatCompactCurrencyFromKrwAtRate, type SupportedCurrency } from '@/lib/finance/currency';
import { formatNumber, formatPercent } from '@/lib/utils';

type Scenario = {
  name: string;
  valuationKrw: number;
  impliedYieldPct?: number | null;
  exitCapRatePct?: number | null;
  debtServiceCoverage?: number | null;
};

type Props = {
  baseCaseValueKrw?: number | null;
  scenarios?: Scenario[];
  /** From the valuation run assumptions — drive the direct-cap sensitivity grid. */
  stabilizedNoiKrw?: number | null;
  capRatePct?: number | null;
  displayCurrency?: SupportedCurrency;
  fxRateToKrw?: number | null;
};

// Symmetric deltas for the two-way grid. Cap rate moves in absolute
// percentage points (a 25bp grid is the institutional default); NOI moves in
// relative percent.
const CAP_DELTAS_BP = [-50, -25, 0, 25, 50];
const NOI_DELTAS_PCT = [-10, -5, 0, 5, 10];

function deltaTone(deltaPct: number): string {
  if (Math.abs(deltaPct) < 0.05) return 'bg-[hsl(var(--accent-tint))] text-accent';
  if (deltaPct > 0) return 'bg-[hsl(var(--success-tint))] text-[hsl(var(--success))]';
  return 'bg-[hsl(var(--danger-tint))] text-[hsl(var(--danger))]';
}

export function ValuationScenarioMatrix({
  baseCaseValueKrw,
  scenarios = [],
  stabilizedNoiKrw,
  capRatePct,
  displayCurrency = 'KRW',
  fxRateToKrw
}: Props) {
  const base = typeof baseCaseValueKrw === 'number' ? baseCaseValueKrw : null;
  const money = (krw: number | null | undefined) =>
    krw == null ? '—' : formatCompactCurrencyFromKrwAtRate(krw, displayCurrency, fxRateToKrw);

  const hasGrid =
    typeof stabilizedNoiKrw === 'number' &&
    stabilizedNoiKrw > 0 &&
    typeof capRatePct === 'number' &&
    capRatePct > 0;

  // Direct-cap value: NOI*(1+g) / cap. Mirrors the engine's base case so the
  // centre cell reconciles to baseCaseValueKrw.
  const cell = (capDeltaBp: number, noiDeltaPct: number) => {
    if (!hasGrid) return null;
    const cap = (capRatePct as number) + capDeltaBp / 100;
    if (cap <= 0) return null;
    const noi = (stabilizedNoiKrw as number) * (1 + noiDeltaPct / 100);
    return noi / (cap / 100);
  };

  if (!scenarios.length && !hasGrid) return null;

  return (
    <Card data-testid="valuation-scenario-matrix">
      <div className="eyebrow">Scenario &amp; Sensitivity</div>
      <h3 className="mt-2 text-2xl font-semibold text-foreground">
        Value range and the levers that move it
      </h3>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
        Single-point values hide the risk. The scenario set shows the underwritten range; the grid
        isolates the two levers a direct-cap value is most sensitive to — exit cap rate and
        stabilized NOI.
      </p>

      {scenarios.length ? (
        <div className="mt-6 overflow-hidden rounded-[12px] border border-border">
          <table className="data-table w-full text-sm">
            <thead>
              <tr className="bg-[hsl(var(--panel-alt))] text-left">
                <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                  Scenario
                </th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                  Value
                </th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                  Δ vs Base
                </th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                  Implied Cap
                </th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                  Exit Cap
                </th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                  DSCR
                </th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((scenario) => {
                const deltaPct =
                  base && base !== 0 ? ((scenario.valuationKrw - base) / base) * 100 : null;
                return (
                  <tr key={scenario.name} className="border-t border-border">
                    <td className="px-4 py-2.5 font-medium text-foreground">{scenario.name}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-foreground">
                      {money(scenario.valuationKrw)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right tabular-nums ${
                        deltaPct == null
                          ? 'text-muted'
                          : deltaPct >= 0
                            ? 'text-[hsl(var(--success))]'
                            : 'text-[hsl(var(--danger))]'
                      }`}
                    >
                      {deltaPct == null
                        ? '—'
                        : `${deltaPct >= 0 ? '+' : ''}${formatNumber(deltaPct, 1)}%`}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-foregroundMuted">
                      {scenario.impliedYieldPct != null
                        ? formatPercent(scenario.impliedYieldPct)
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-foregroundMuted">
                      {scenario.exitCapRatePct != null
                        ? formatPercent(scenario.exitCapRatePct)
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-foregroundMuted">
                      {scenario.debtServiceCoverage != null
                        ? `${formatNumber(scenario.debtServiceCoverage, 2)}x`
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {hasGrid ? (
        <div className="mt-6">
          <div className="fine-print mb-2">
            Value sensitivity — exit cap rate (rows) × stabilized NOI (columns)
          </div>
          <div className="overflow-x-auto rounded-[12px] border border-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[hsl(var(--panel-alt))]">
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                    Cap ＼ NOI
                  </th>
                  {NOI_DELTAS_PCT.map((noiDelta) => (
                    <th
                      key={noiDelta}
                      className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.1em] text-muted"
                    >
                      {noiDelta > 0 ? '+' : ''}
                      {noiDelta}%
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CAP_DELTAS_BP.map((capDelta) => {
                  const rowCap = (capRatePct as number) + capDelta / 100;
                  return (
                    <tr key={capDelta} className="border-t border-border">
                      <th className="whitespace-nowrap bg-[hsl(var(--panel-alt))] px-3 py-2.5 text-left text-xs font-semibold tabular-nums text-foregroundMuted">
                        {formatNumber(rowCap, 2)}%
                        <span className="ml-1 text-[10px] font-normal text-muted">
                          ({capDelta > 0 ? '+' : ''}
                          {capDelta}bp)
                        </span>
                      </th>
                      {NOI_DELTAS_PCT.map((noiDelta) => {
                        const value = cell(capDelta, noiDelta);
                        const deltaPct =
                          value != null && base && base !== 0
                            ? ((value - base) / base) * 100
                            : null;
                        const isBase = capDelta === 0 && noiDelta === 0;
                        return (
                          <td
                            key={noiDelta}
                            className={`px-3 py-2.5 text-right text-xs tabular-nums ${
                              deltaPct == null ? 'text-muted' : deltaTone(deltaPct)
                            } ${isBase ? 'font-bold ring-1 ring-inset ring-accent' : 'font-medium'}`}
                          >
                            {money(value)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">
            Centre cell is the base case ({money(base)}). Green cells price above base, red below.
          </p>
        </div>
      ) : null}
    </Card>
  );
}
