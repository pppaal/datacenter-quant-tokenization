import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { MacroTransmissionMap } from '@/components/valuation/macro-transmission-map';
import type { MacroInterpretation } from '@/lib/services/macro/regime';
import { formatDate, formatNumber, formatPercent } from '@/lib/utils';

function formatMacroValue(point: MacroInterpretation['series'][number]) {
  if (point.unit === '%') {
    return formatPercent(point.value);
  }

  return formatNumber(point.value, 0);
}

function formatFactorValue(point: MacroInterpretation['factors'][number]) {
  if (!point.isObserved || point.value === null) return 'N/A';
  if (point.unit === '%') return formatPercent(point.value);
  if (point.unit === 'bps') return `${formatNumber(point.value, 0)} bps`;
  if (point.unit === 'idx') return formatNumber(point.value, 0);
  return `${formatNumber(point.value, 1)} ${point.unit}`.trim();
}

function toneForStatus(status: string) {
  if (status === 'FRESH') return 'good' as const;
  if (status === 'STALE' || status === 'FAILED') return 'warn' as const;
  return 'neutral' as const;
}

function toneForRegime(state: string) {
  if (state === 'SUPPORTIVE' || state === 'STRONG' || state === 'LOW' || state === 'CONTAINED') return 'good' as const;
  if (state === 'TIGHT' || state === 'SOFT' || state === 'HIGH') return 'warn' as const;
  return 'neutral' as const;
}

function toneForDirection(direction: string) {
  if (direction === 'POSITIVE') return 'good' as const;
  if (direction === 'NEGATIVE') return 'warn' as const;
  return 'neutral' as const;
}

function toneForImpact(direction: string) {
  if (direction === 'TAILWIND') return 'good' as const;
  if (direction === 'HEADWIND') return 'warn' as const;
  return 'neutral' as const;
}

export function MacroRegimePanel({ macroRegime }: { macroRegime: MacroInterpretation | null }) {
  if (!macroRegime || macroRegime.series.length === 0) return null;

  return (
    <Card className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Macro Regime</div>
          <h3 className="mt-2 text-xl font-semibold text-white">
            {macroRegime.market} / {macroRegime.assetClass.replaceAll('_', ' ')}
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-400">{macroRegime.profile.label}</p>
          {macroRegime.profile.adjustmentSummary.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {macroRegime.profile.adjustmentSummary.map((item) => (
                <Badge key={item}>{item}</Badge>
              ))}
            </div>
          ) : null}
        </div>
        <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
          {macroRegime.asOf ? `as of ${formatDate(macroRegime.asOf)}` : 'latest snapshot'}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Object.values(macroRegime.regimes).map((regime) => (
          <div key={regime.key} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="fine-print">{regime.label}</div>
              <Badge tone={toneForRegime(regime.state)}>{regime.state.toLowerCase()}</Badge>
            </div>
            <p className="mt-3 text-sm leading-7 text-slate-300">{regime.commentary}</p>
            <div className="mt-3 space-y-1 text-xs text-slate-500">
              {regime.signals.map((signal) => (
                <div key={signal}>{signal}</div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-[22px] border border-accent/20 bg-accent/10 p-4">
        <div className="fine-print text-accent">Underwriting Guidance</div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            ['Country', macroRegime.profile.country ?? 'N/A'],
            ['Submarket', macroRegime.profile.submarket ?? 'N/A'],
            ['Capital Beta', `${formatNumber(macroRegime.profile.capitalRateSensitivity, 2)}x`],
            ['Liquidity Beta', `${formatNumber(macroRegime.profile.liquiditySensitivity, 2)}x`],
            ['Leasing Beta', `${formatNumber(macroRegime.profile.leasingSensitivity, 2)}x`],
            ['Construction Beta', `${formatNumber(macroRegime.profile.constructionSensitivity, 2)}x`]
          ].map(([label, value]) => (
            <div key={label} className="rounded-[18px] border border-white/10 bg-slate-950/35 px-4 py-3">
              <div className="fine-print">{label}</div>
              <div className="mt-2 text-lg font-semibold text-white">{value}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {[
            ['Discount Rate', `${formatNumber(macroRegime.guidance.discountRateShiftPct, 2)} pts`],
            ['Exit Cap', `${formatNumber(macroRegime.guidance.exitCapRateShiftPct, 2)} pts`],
            ['Debt Cost', `${formatNumber(macroRegime.guidance.debtCostShiftPct, 2)} pts`],
            ['Occupancy', `${formatNumber(macroRegime.guidance.occupancyShiftPct, 2)} pts`],
            ['Growth', `${formatNumber(macroRegime.guidance.growthShiftPct, 2)} pts`],
            ['Replacement Cost', `${formatNumber(macroRegime.guidance.replacementCostShiftPct, 2)}%`]
          ].map(([label, value]) => (
            <div key={label} className="rounded-[18px] border border-white/10 bg-slate-950/35 px-4 py-3">
              <div className="fine-print">{label}</div>
              <div className="mt-2 text-lg font-semibold text-white">{value}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-2 text-sm text-slate-200">
          {macroRegime.guidance.summary.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </div>

      <div>
        <div className="eyebrow">Common Macro Factors</div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {macroRegime.factors.map((point) => (
            <div key={point.key} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="fine-print">{point.label}</div>
                <Badge tone={toneForDirection(point.direction)}>
                  {point.isObserved ? point.direction.toLowerCase() : 'unknown'}
                </Badge>
              </div>
              <div className="mt-3 text-2xl font-semibold text-white">{formatFactorValue(point)}</div>
              <p className="mt-3 text-sm leading-7 text-slate-300">{point.commentary}</p>
              <div className="mt-3 space-y-1 text-xs text-slate-500">
                {point.inputs.map((item) => (
                  <div key={item}>{item}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="eyebrow">Impact Transmission</div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {macroRegime.impacts.dimensions.map((dimension) => (
            <div key={dimension.key} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="fine-print">{dimension.label}</div>
                <Badge tone={toneForImpact(dimension.direction)}>{dimension.direction.toLowerCase()}</Badge>
              </div>
              <div className="mt-3 text-2xl font-semibold text-white">{formatNumber(dimension.score, 2)}</div>
              <p className="mt-3 text-sm leading-7 text-slate-300">{dimension.commentary}</p>
              <div className="mt-3 space-y-1 text-xs text-slate-500">
                {dimension.channels.map((item) => (
                  <div key={item}>{item}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <MacroTransmissionMap impacts={macroRegime.impacts} />
        </div>
        <div className="mt-4 rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
          <div className="fine-print">Transmission Paths</div>
          <div className="mt-4 grid gap-3">
            {macroRegime.impacts.paths.map((path) => (
              <div key={`${path.factorKey}-${path.targetKey}`} className="rounded-[18px] border border-white/10 bg-slate-950/35 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-white">
                    {path.factorLabel} {'->'} {path.targetLabel}
                  </div>
                  <Badge tone={toneForImpact(path.direction)}>
                    {path.direction.toLowerCase()} / {formatNumber(path.strength, 2)}
                  </Badge>
                </div>
                <p className="mt-2 text-sm leading-7 text-slate-300">{path.rationale}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2 text-sm text-slate-200">
            {macroRegime.impacts.summary.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {macroRegime.series.map((point) => (
          <div key={point.seriesKey} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="fine-print">{point.label}</div>
              <Badge tone={toneForStatus(point.sourceStatus)}>{point.sourceStatus.toLowerCase()}</Badge>
            </div>
            <div className="mt-3 text-2xl font-semibold text-white">{formatMacroValue(point)}</div>
            <div className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">{point.sourceSystem}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
