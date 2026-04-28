import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatCurrency, formatNumber } from '@/lib/utils';

type RunLike = {
  id: string;
  runLabel: string;
  baseCaseValueKrw: number;
  confidenceScore: number;
  assumptions: unknown;
  createdAt: Date | string;
};

function getNumber(assumptions: unknown, key: string) {
  if (!assumptions || typeof assumptions !== 'object') return null;
  const value = (assumptions as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : null;
}

function deltaTone(value: number | null) {
  if (value === null) return 'neutral' as const;
  if (value > 0) return 'good' as const;
  if (value < 0) return 'warn' as const;
  return 'neutral' as const;
}

function formatDelta(value: number | null, kind: 'currency' | 'number' | 'bps') {
  if (value === null) return 'N/A';
  const prefix = value > 0 ? '+' : '';
  if (kind === 'currency') return `${prefix}${formatCurrency(value)}`;
  if (kind === 'bps') return `${prefix}${formatNumber(value * 100, 0)} bps`;
  return `${prefix}${formatNumber(value, 2)}`;
}

export function ValuationDeltaCard({
  currentRun,
  previousRun
}: {
  currentRun: RunLike;
  previousRun?: RunLike | null;
}) {
  if (!previousRun) {
    return (
      <Card>
        <div className="eyebrow">Run Delta</div>
        <p className="mt-4 text-sm leading-6 text-slate-300">
          This is the earliest stored run for this asset, so there is no previous valuation snapshot
          to compare against yet.
        </p>
      </Card>
    );
  }

  const baseDelta = currentRun.baseCaseValueKrw - previousRun.baseCaseValueKrw;
  const confidenceDelta = currentRun.confidenceScore - previousRun.confidenceScore;
  const capRateDelta =
    getNumber(currentRun.assumptions, 'capRatePct') !== null &&
    getNumber(previousRun.assumptions, 'capRatePct') !== null
      ? getNumber(currentRun.assumptions, 'capRatePct')! -
        getNumber(previousRun.assumptions, 'capRatePct')!
      : null;
  const discountRateDelta =
    getNumber(currentRun.assumptions, 'discountRatePct') !== null &&
    getNumber(previousRun.assumptions, 'discountRatePct') !== null
      ? getNumber(currentRun.assumptions, 'discountRatePct')! -
        getNumber(previousRun.assumptions, 'discountRatePct')!
      : null;

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Run Delta</div>
          <div className="mt-2 text-sm text-slate-400">Compared with {previousRun.runLabel}</div>
        </div>
        <Badge tone={deltaTone(baseDelta)}>{formatDelta(baseDelta, 'currency')}</Badge>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-slate-950/40 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Base Case Delta</div>
          <div className="mt-2 text-lg font-semibold text-white">
            {formatDelta(baseDelta, 'currency')}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-slate-950/40 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Confidence Delta</div>
          <div className="mt-2 text-lg font-semibold text-white">
            {formatDelta(confidenceDelta, 'number')}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-slate-950/40 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
            Cap / Discount Shift
          </div>
          <div className="mt-2 text-lg font-semibold text-white">
            {formatDelta(capRateDelta, 'bps')} / {formatDelta(discountRateDelta, 'bps')}
          </div>
        </div>
      </div>
    </Card>
  );
}
