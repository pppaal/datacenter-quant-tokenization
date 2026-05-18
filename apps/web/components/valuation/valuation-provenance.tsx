import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type ProvenanceEntry = {
  field: string;
  sourceSystem: string;
  value: unknown;
  mode: string;
  freshnessLabel: string;
};

function toneForMode(mode: string) {
  const normalized = mode.toLowerCase();
  if (normalized === 'api') return 'good' as const;
  if (normalized === 'fallback') return 'warn' as const;
  return 'neutral' as const;
}

export function ValuationProvenance({ entries }: { entries: ProvenanceEntry[] }) {
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="eyebrow">Source Provenance</div>
        <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Field-level trace</div>
      </div>
      <div className="space-y-3">
        {entries.map((entry) => (
          <div
            key={`${entry.field}-${entry.sourceSystem}`}
            className="rounded-2xl border border-border bg-slate-950/40 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-semibold text-white">{entry.field}</div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={toneForMode(entry.mode)}>{entry.mode}</Badge>
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  {entry.sourceSystem}
                </span>
              </div>
            </div>
            <div className="mt-3 text-sm text-slate-300">{String(entry.value ?? 'N/A')}</div>
            <div className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">
              {entry.freshnessLabel}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
