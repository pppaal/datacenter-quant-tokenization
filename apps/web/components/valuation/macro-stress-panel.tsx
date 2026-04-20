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
    tone === 'good' ? 'border-emerald-400/20 bg-emerald-500/[0.04]'
      : tone === 'warn' ? 'border-rose-400/20 bg-rose-500/[0.04]'
        : 'border-amber-400/20 bg-amber-500/[0.04]';

  return (
    <div className={`rounded-[26px] border p-4 ${borderClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">{scenario.scenarioName}</div>
          <div className="mt-1 text-xs text-slate-400">{scenario.description}</div>
        </div>
        <Badge tone={tone}>{scenario.verdict}</Badge>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Equity IRR</div>
          <div className="mt-1 text-sm font-semibold text-white">
            {scenario.stressed.equityIrr !== null ? `${formatNumber(scenario.stressed.equityIrr, 2)}%` : 'N/A'}
          </div>
          <div className="text-[11px] text-slate-400">{formatDelta(scenario.equityIrrDeltaPct, 'pp')}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Multiple</div>
          <div className="mt-1 text-sm font-semibold text-white">
            {formatNumber(scenario.stressed.equityMultiple, 2)}x
          </div>
          <div className="text-[11px] text-slate-400">{formatDelta(scenario.equityMultipleDelta, 'x')}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Worst DSCR</div>
          <div className="mt-1 text-sm font-semibold text-white">
            {scenario.worstDscr !== null ? `${formatNumber(scenario.worstDscr, 2)}x` : 'N/A'}
          </div>
          <div className="text-[11px] text-slate-400">
            {scenario.worstDscr !== null && scenario.worstDscr < 1.0 ? 'Covenant breach' : 'Covenant safe'}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Ending Debt</div>
          <div className="mt-1 text-sm font-semibold text-white">
            {formatCurrencyFromKrwAtRate(scenario.stressedEndingDebtKrw, displayCurrency, fxRateToKrw)}
          </div>
        </div>
      </div>

      <div className="mt-3 text-xs text-slate-300">{scenario.commentary}</div>

      {scenario.correlationPenaltyApplied ? (
        <div className="mt-3 rounded-2xl border border-orange-400/20 bg-orange-500/[0.06] px-3 py-2 text-xs text-orange-100">
          {scenario.correlationPenaltyApplied.commentary}
        </div>
      ) : null}

      {scenario.lineItemImpacts.length > 0 ? (
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          {scenario.lineItemImpacts.map((item) => (
            <div key={item.label} className="rounded-2xl border border-white/10 bg-slate-950/35 p-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{item.label}</div>
              <div className="mt-1 text-sm text-white">
                {formatCurrencyFromKrwAtRate(item.stressedKrw, displayCurrency, fxRateToKrw)}
              </div>
              <div className={`text-[11px] ${item.deltaPct >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                {item.deltaPct >= 0 ? '+' : ''}{formatNumber(item.deltaPct, 2)}%
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
    <div className="rounded-[26px] border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">
            Factor Attribution: {attribution.scenarioName}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Isolates each factor's contribution to the total IRR shift.
          </div>
        </div>
        <div className="text-xs text-slate-400">
          Total IRR shift: {formatDelta(attribution.totalIrrDeltaPct, 'pp')}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {sortedFactors.map((f) => (
          <div key={f.factor} className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-white">{f.factorLabel}</span>
              <span className="text-slate-300">
                {formatDelta(f.isolatedIrrDeltaPct, 'pp')} ·{' '}
                <span className="text-slate-500">{formatNumber(f.contributionShareOfTotalDelta, 0)}% share</span>
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-slate-800">
              <div
                className={`h-1.5 rounded-full ${
                  (f.isolatedIrrDeltaPct ?? 0) < 0 ? 'bg-rose-400' : 'bg-emerald-400'
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
          <div className="mt-2 text-sm text-slate-400">
            Full re-run of the underwriting pipeline under macro scenarios.
          </div>
        </div>
        <Badge tone={verdictTone(worstScenario.verdict)}>
          Worst: {worstScenario.scenarioName} ({worstScenario.verdict})
        </Badge>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Baseline IRR</div>
          <div className="mt-1 text-lg font-semibold text-white">
            {analysis.baseline.equityIrr !== null ? `${formatNumber(analysis.baseline.equityIrr, 2)}%` : 'N/A'}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Baseline Multiple</div>
          <div className="mt-1 text-lg font-semibold text-white">
            {formatNumber(analysis.baseline.equityMultiple, 2)}x
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Baseline Cash-on-Cash</div>
          <div className="mt-1 text-lg font-semibold text-white">
            {formatNumber(analysis.baseline.averageCashOnCash, 2)}%
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Baseline Payback</div>
          <div className="mt-1 text-lg font-semibold text-white">
            {analysis.baseline.paybackYear !== null ? `Year ${analysis.baseline.paybackYear}` : 'Beyond horizon'}
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
