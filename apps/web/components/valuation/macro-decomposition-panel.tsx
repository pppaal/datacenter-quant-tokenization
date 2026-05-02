import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { MacroDecomposition } from '@/lib/services/macro/decomposition';
import { formatDate, formatNumber } from '@/lib/utils';

function toneForDelta(delta: number | null) {
  if (delta === null) return 'neutral' as const;
  if (delta > 0) return 'warn' as const;
  if (delta < 0) return 'good' as const;
  return 'neutral' as const;
}

function toneForImpact(direction: string | null) {
  if (direction === 'TAILWIND') return 'good' as const;
  if (direction === 'HEADWIND') return 'warn' as const;
  return 'neutral' as const;
}

function formatShift(value: number | null, unit: string) {
  if (value === null) return 'N/A';
  return `${value > 0 ? '+' : ''}${formatNumber(value, 2)}${unit}`;
}

function formatFactorValue(value: number | null) {
  if (value === null) return 'N/A';
  return formatNumber(value, 2);
}

export function MacroDecompositionPanel({
  decomposition
}: {
  decomposition: MacroDecomposition | null;
}) {
  if (!decomposition) return null;

  return (
    <Card className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Macro Decomposition</div>
          <h3 className="mt-2 text-xl font-semibold text-white">
            Why The Underwriting View Changed
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-400">
            Compares the current macro interpretation against the previous valuation run and shows
            which overlays, transmission scores, and factors actually moved.
          </p>
        </div>
        <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
          {decomposition.previousCreatedAt
            ? `vs ${decomposition.previousRunLabel} / ${formatDate(decomposition.previousCreatedAt)}`
            : 'first comparable run'}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {decomposition.summary.map((line) => (
          <div
            key={line}
            className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4 text-sm leading-7 text-slate-300"
          >
            {line}
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          <div className="eyebrow">Guidance Delta</div>
          <div className="grid gap-3">
            {decomposition.guidanceChanges.map((item) => (
              <div
                key={item.key}
                className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-white">{item.label}</div>
                  <Badge tone={toneForDelta(item.delta)}>
                    {formatShift(item.delta, item.unit)}
                  </Badge>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <div className="fine-print">Current</div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      {formatShift(item.currentValue, item.unit)}
                    </div>
                  </div>
                  <div>
                    <div className="fine-print">Previous</div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      {formatShift(item.previousValue, item.unit)}
                    </div>
                  </div>
                  <div>
                    <div className="fine-print">Delta</div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      {formatShift(item.delta, item.unit)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="eyebrow">Impact Delta</div>
          <div className="grid gap-3">
            {decomposition.impactChanges.map((item) => (
              <div
                key={item.key}
                className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-white">{item.label}</div>
                  <div className="flex gap-2">
                    <Badge tone={toneForImpact(item.previousDirection)}>
                      prev {item.previousDirection?.toLowerCase() ?? 'n/a'}
                    </Badge>
                    <Badge tone={toneForImpact(item.currentDirection)}>
                      now {item.currentDirection.toLowerCase()}
                    </Badge>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <div className="fine-print">Current</div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      {formatNumber(item.currentScore, 2)}
                    </div>
                  </div>
                  <div>
                    <div className="fine-print">Previous</div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      {item.previousScore === null ? 'N/A' : formatNumber(item.previousScore, 2)}
                    </div>
                  </div>
                  <div>
                    <div className="fine-print">Delta</div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      {item.delta === null
                        ? 'N/A'
                        : `${item.delta > 0 ? '+' : ''}${formatNumber(item.delta, 2)}`}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="eyebrow">Factor Drivers</div>
        <div className="mt-4 grid gap-3">
          {decomposition.factorDrivers.map((item) => (
            <div
              key={item.key}
              className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-semibold text-white">{item.label}</div>
                <div className="flex gap-2">
                  <Badge
                    tone={
                      item.previousDirection === 'NEGATIVE'
                        ? 'warn'
                        : item.previousDirection === 'POSITIVE'
                          ? 'good'
                          : 'neutral'
                    }
                  >
                    prev {item.previousDirection?.toLowerCase() ?? 'n/a'}
                  </Badge>
                  <Badge
                    tone={
                      item.currentDirection === 'NEGATIVE'
                        ? 'warn'
                        : item.currentDirection === 'POSITIVE'
                          ? 'good'
                          : 'neutral'
                    }
                  >
                    now {item.currentDirection.toLowerCase()}
                  </Badge>
                </div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div>
                  <div className="fine-print">Current</div>
                  <div className="mt-2 text-lg font-semibold text-white">
                    {formatFactorValue(item.currentValue)}
                  </div>
                </div>
                <div>
                  <div className="fine-print">Previous</div>
                  <div className="mt-2 text-lg font-semibold text-white">
                    {formatFactorValue(item.previousValue)}
                  </div>
                </div>
                <div>
                  <div className="fine-print">Delta</div>
                  <div className="mt-2 text-lg font-semibold text-white">
                    {item.delta === null
                      ? 'Direction change'
                      : `${item.delta > 0 ? '+' : ''}${formatNumber(item.delta, 2)}`}
                  </div>
                </div>
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-300">{item.commentary}</p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
