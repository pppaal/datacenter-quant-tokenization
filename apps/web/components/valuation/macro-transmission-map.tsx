import { Badge } from '@/components/ui/badge';
import type { MacroImpactMatrix } from '@/lib/services/macro/impact';
import { cn, formatNumber } from '@/lib/utils';

function toneForImpact(direction: string) {
  if (direction === 'TAILWIND') return 'good' as const;
  if (direction === 'HEADWIND') return 'warn' as const;
  return 'neutral' as const;
}

function barWidth(strength: number) {
  return `${Math.max(18, Math.min(strength * 42, 100))}%`;
}

function borderClass(direction: string) {
  if (direction === 'TAILWIND') return 'border-emerald-400/30 bg-emerald-400/10';
  if (direction === 'HEADWIND') return 'border-amber-300/30 bg-amber-300/10';
  return 'border-white/10 bg-white/[0.03]';
}

function fillClass(direction: string) {
  if (direction === 'TAILWIND') return 'bg-emerald-400/80';
  if (direction === 'HEADWIND') return 'bg-amber-300/80';
  return 'bg-slate-400/70';
}

export function MacroTransmissionMap({ impacts }: { impacts: MacroImpactMatrix }) {
  const factors = Array.from(
    impacts.paths.reduce((map, path) => {
      if (!map.has(path.factorKey)) {
        map.set(path.factorKey, {
          key: path.factorKey,
          label: path.factorLabel,
          count: 0
        });
      }
      map.get(path.factorKey)!.count += 1;
      return map;
    }, new Map<string, { key: string; label: string; count: number }>())
  ).map(([, value]) => value);

  const dimensions = impacts.dimensions.map((dimension) => ({
    key: dimension.key,
    label: dimension.label,
    score: dimension.score,
    direction: dimension.direction
  }));

  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="fine-print">Transmission Map</div>
          <p className="mt-2 text-sm leading-7 text-slate-300">
            Shows which macro factors are currently feeding which underwriting transmission dimensions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="good">tailwind</Badge>
          <Badge tone="warn">headwind</Badge>
          <Badge>neutral</Badge>
        </div>
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-[0.9fr_1.2fr_0.9fr]">
        <div className="space-y-3">
          <div className="fine-print">Factors</div>
          {factors.map((factor) => (
            <div key={factor.key} className="rounded-[18px] border border-white/10 bg-slate-950/35 p-4">
              <div className="text-sm font-semibold text-white">{factor.label}</div>
              <div className="mt-2 text-xs uppercase tracking-[0.14em] text-slate-500">
                {factor.count} active path{factor.count === 1 ? '' : 's'}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <div className="fine-print">Transmission Paths</div>
          {impacts.paths.map((path) => (
            <div
              key={`${path.factorKey}-${path.targetKey}`}
              className={cn('rounded-[18px] border p-4', borderClass(path.direction))}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-semibold text-white">
                  {path.factorLabel} {'->'} {path.targetLabel}
                </div>
                <Badge tone={toneForImpact(path.direction)}>
                  {path.direction.toLowerCase()} / {formatNumber(path.strength, 2)}
                </Badge>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-950/60">
                <div
                  className={cn('h-full rounded-full', fillClass(path.direction))}
                  style={{ width: barWidth(path.strength) }}
                />
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-300">{path.rationale}</p>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <div className="fine-print">Targets</div>
          {dimensions.map((dimension) => (
            <div key={dimension.key} className="rounded-[18px] border border-white/10 bg-slate-950/35 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-semibold text-white">{dimension.label}</div>
                <Badge tone={toneForImpact(dimension.direction)}>
                  {dimension.direction.toLowerCase()}
                </Badge>
              </div>
              <div className="mt-3 text-2xl font-semibold text-white">{formatNumber(dimension.score, 2)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
