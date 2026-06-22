import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatCurrencyFromKrwAtRate, type SupportedCurrency } from '@/lib/finance/currency';
import type {
  MacroFactorAttributionResult,
  MacroStressAnalysis,
  MacroStressScenarioResult
} from '@/lib/services/valuation/macro-stress';
import { formatNumber } from '@/lib/utils';

function verdictTone(verdict: MacroStressScenarioResult['verdict']): 'good' | 'neutral' | 'warn' {
  switch (verdict) {
    case 'RESILIENT':
      return 'good';
    case 'SENSITIVE':
      return 'neutral';
    case 'VULNERABLE':
    case 'BREACH':
      return 'warn';
  }
}

function formatDelta(delta: number | null, suffix: string): string {
  if (delta === null) return 'N/A';
  const prefix = delta >= 0 ? '+' : '';
  return `${prefix}${formatNumber(delta, 2)}${suffix}`;
}

function ScenarioCard({
  scenario,
  displayCurrency,
  fxRateToKrw
}: {
  scenario: MacroStressScenarioResult;
  displayCurrency: SupportedCurrency;
  fxRateToKrw?: number | null;
}) {
  const tone = verdictTone(scenario.verdict);
  const borderClass =
    tone === 'good'
      ? 'border-[hsl(var(--success)/0.25)] bg-[hsl(var(--success-tint))]'
      : tone === 'warn'
        ? 'border-[hsl(var(--danger)/0.25)] bg-[hsl(var(--danger-tint))]'
        : 'border-[hsl(var(--warning)/0.25)] bg-[hsl(var(--warning-tint))]';

  return (
    <div className={`rounded-[26px] border p-4 ${borderClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[hsl(var(--foreground))]">
            {scenario.scenarioName}
          </div>
          <div className="mt-1 text-xs text-[hsl(var(--foreground-muted))]">
            {scenario.description}
          </div>
        </div>
        <Badge tone={tone}>{scenario.verdict}</Badge>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-4">
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-[hsl(var(--muted))]">
            Equity IRR
          </div>
          <div className="mt-1 text-sm font-semibold text-[hsl(var(--foreground))]">
            {scenario.stressed.equityIrr !== null
              ? `${formatNumber(scenario.stressed.equityIrr, 2)}%`
              : 'N/A'}
          </div>
          <div className="text-[11px] text-[hsl(var(--foreground-muted))]">
            {formatDelta(scenario.equityIrrDeltaPct, 'pp')}
          </div>
        </div>
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-[hsl(var(--muted))]">
            Multiple
          </div>
          <div className="mt-1 text-sm font-semibold text-[hsl(var(--foreground))]">
            {formatNumber(scenario.stressed.equityMultiple, 2)}x
          </div>
          <div className="text-[11px] text-[hsl(var(--foreground-muted))]">
            {formatDelta(scenario.equityMultipleDelta, 'x')}
          </div>
        </div>
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-[hsl(var(--muted))]">
            Worst DSCR
          </div>
          <div className="mt-1 text-sm font-semibold text-[hsl(var(--foreground))]">
            {scenario.worstDscr !== null ? `${formatNumber(scenario.worstDscr, 2)}x` : 'N/A'}
          </div>
          <div className="text-[11px] text-[hsl(var(--foreground-muted))]">
            {scenario.worstDscr !== null && scenario.worstDscr < 1.0
              ? 'Covenant breach'
              : 'Covenant safe'}
          </div>
        </div>
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-[hsl(var(--muted))]">
            Ending Debt
          </div>
          <div className="mt-1 text-sm font-semibold text-[hsl(var(--foreground))]">
            {formatCurrencyFromKrwAtRate(
              scenario.stressedEndingDebtKrw,
              displayCurrency,
              fxRateToKrw
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 text-xs text-[hsl(var(--foreground-muted))]">{scenario.commentary}</div>

      {scenario.correlationPenaltyApplied ? (
        <div className="mt-3 rounded-2xl border border-[hsl(var(--warning)/0.25)] bg-[hsl(var(--warning-tint))] px-3 py-2 text-xs text-[hsl(var(--warning))]">
          {scenario.correlationPenaltyApplied.commentary}
        </div>
      ) : null}

      {scenario.lineItemImpacts.length > 0 ? (
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          {scenario.lineItemImpacts.map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-3"
            >
              <div className="text-[11px] uppercase tracking-[0.16em] text-[hsl(var(--muted))]">
                {item.label}
              </div>
              <div className="mt-1 text-sm text-[hsl(var(--foreground))]">
                {formatCurrencyFromKrwAtRate(item.stressedKrw, displayCurrency, fxRateToKrw)}
              </div>
              <div
                className={`text-[11px] ${item.deltaPct >= 0 ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--danger))]'}`}
              >
                {item.deltaPct >= 0 ? '+' : ''}
                {formatNumber(item.deltaPct, 2)}%
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FactorAttributionBar({ attribution }: { attribution: MacroFactorAttributionResult }) {
  const sortedFactors = [...attribution.factors].sort(
    (a, b) => b.contributionShareOfTotalDelta - a.contributionShareOfTotalDelta
  );

  return (
    <div className="rounded-[26px] border border-[hsl(var(--border))] bg-[hsl(var(--surface-hover))] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[hsl(var(--foreground))]">
            Factor Attribution: {attribution.scenarioName}
          </div>
          <div className="mt-1 text-xs text-[hsl(var(--foreground-muted))]">
            Isolates each factor's contribution to the total IRR shift.
          </div>
        </div>
        <div className="text-xs text-[hsl(var(--foreground-muted))]">
          Total IRR shift: {formatDelta(attribution.totalIrrDeltaPct, 'pp')}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {sortedFactors.map((f) => (
          <div
            key={f.factor}
            className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-3"
          >
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-[hsl(var(--foreground))]">{f.factorLabel}</span>
              <span className="text-[hsl(var(--foreground-muted))]">
                {formatDelta(f.isolatedIrrDeltaPct, 'pp')} ·{' '}
                <span className="text-[hsl(var(--muted))]">
                  {formatNumber(f.contributionShareOfTotalDelta, 0)}% share
                </span>
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-[hsl(var(--surface-hover))]">
              <div
                className={`h-1.5 rounded-full ${
                  (f.isolatedIrrDeltaPct ?? 0) < 0
                    ? 'bg-[hsl(var(--danger))]'
                    : 'bg-[hsl(var(--success))]'
                }`}
                style={{ width: `${Math.min(100, f.contributionShareOfTotalDelta)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MacroStressPanel({
  analysis,
  attribution,
  displayCurrency = 'KRW',
  fxRateToKrw
}: {
  analysis: MacroStressAnalysis;
  attribution?: MacroFactorAttributionResult | null;
  displayCurrency?: SupportedCurrency;
  fxRateToKrw?: number | null;
}) {
  if (analysis.scenarios.length === 0) {
    return null;
  }

  const worstScenario = [...analysis.scenarios].sort((a, b) => {
    const aDelta = a.equityIrrDeltaPct ?? 0;
    const bDelta = b.equityIrrDeltaPct ?? 0;
    return aDelta - bDelta;
  })[0]!;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Macro Stress Pro Forma</div>
          <div className="mt-2 text-sm text-[hsl(var(--foreground-muted))]">
            Full re-run of the underwriting pipeline under macro scenarios.
          </div>
        </div>
        <Badge tone={verdictTone(worstScenario.verdict)}>
          Worst: {worstScenario.scenarioName} ({worstScenario.verdict})
        </Badge>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-[hsl(var(--muted))]">
            Baseline IRR
          </div>
          <div className="mt-1 text-lg font-semibold text-[hsl(var(--foreground))]">
            {analysis.baseline.equityIrr !== null
              ? `${formatNumber(analysis.baseline.equityIrr, 2)}%`
              : 'N/A'}
          </div>
        </div>
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-[hsl(var(--muted))]">
            Baseline Multiple
          </div>
          <div className="mt-1 text-lg font-semibold text-[hsl(var(--foreground))]">
            {formatNumber(analysis.baseline.equityMultiple, 2)}x
          </div>
        </div>
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-[hsl(var(--muted))]">
            Baseline Cash-on-Cash
          </div>
          <div className="mt-1 text-lg font-semibold text-[hsl(var(--foreground))]">
            {formatNumber(analysis.baseline.averageCashOnCash, 2)}%
          </div>
        </div>
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-[hsl(var(--muted))]">
            Baseline Payback
          </div>
          <div className="mt-1 text-lg font-semibold text-[hsl(var(--foreground))]">
            {analysis.baseline.paybackYear !== null
              ? `Year ${analysis.baseline.paybackYear}`
              : 'Beyond horizon'}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {analysis.scenarios.map((scenario) => (
          <ScenarioCard
            key={scenario.scenarioName}
            scenario={scenario}
            displayCurrency={displayCurrency}
            fxRateToKrw={fxRateToKrw}
          />
        ))}
      </div>

      {attribution ? (
        <div className="mt-4">
          <FactorAttributionBar attribution={attribution} />
        </div>
      ) : null}
    </Card>
  );
}
