import type { DealCloseProbability, DealClosingReadiness } from '@/lib/services/deals';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatNumber } from '@/lib/utils';

type Props = {
  readiness: DealClosingReadiness;
  probability: DealCloseProbability;
};

export function DealClosingReadinessPanel({ readiness, probability }: Props) {
  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="eyebrow">Closing Readiness</div>
          <h2 className="mt-2 text-2xl font-semibold text-[hsl(var(--foreground))]">
            Can this deal actually close?
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            tone={readiness.readyToClose ? 'good' : readiness.scorePct >= 60 ? 'warn' : 'danger'}
          >
            {formatNumber(readiness.scorePct, 0)}%
          </Badge>
          <Badge tone={readiness.readyToClose ? 'good' : 'warn'}>
            {readiness.readyToClose
              ? 'ready'
              : `${readiness.blockerCount} blocker${readiness.blockerCount === 1 ? '' : 's'}`}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="metric-card">
          <div className="fine-print">Checks Complete</div>
          <div className="mt-3 text-3xl font-semibold text-[hsl(var(--foreground))]">
            {readiness.completedCount} / {readiness.totalCount}
          </div>
        </div>
        <div className="metric-card">
          <div className="fine-print">Blocking Gaps</div>
          <div className="mt-3 text-3xl font-semibold text-[hsl(var(--foreground))]">
            {readiness.blockerCount}
          </div>
        </div>
        <div className="metric-card">
          <div className="fine-print">Status</div>
          <div className="mt-3 text-3xl font-semibold text-[hsl(var(--foreground))]">
            {readiness.readyToClose ? 'Ready' : 'Work'}
          </div>
        </div>
        <div className="metric-card">
          <div className="fine-print">Execution Momentum</div>
          <div className="mt-3 text-3xl font-semibold text-[hsl(var(--foreground))]">
            {formatNumber(probability.scorePct, 0)}
          </div>
          <p className="mt-2 text-sm leading-7 text-[hsl(var(--foreground-muted))]">
            {probability.headline}
          </p>
        </div>
        <div className="metric-card">
          <div className="fine-print">Primary Readout</div>
          <p className="mt-3 text-sm leading-7 text-[hsl(var(--foreground-muted))]">
            {readiness.readyToClose
              ? 'Commercial, financing, and process gates are covered.'
              : (readiness.blockers[0] ?? 'A closing blocker still needs to be cleared.')}
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="grid gap-3">
          {readiness.checks.map((check) => (
            <div
              key={check.key}
              className="rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-semibold text-[hsl(var(--foreground))]">
                  {check.title}
                </div>
                <div className="flex items-center gap-2">
                  {check.isBlocker ? <Badge tone="warn">blocker</Badge> : null}
                  <Badge
                    tone={
                      check.status === 'done' ? 'good' : check.status === 'open' ? 'warn' : 'danger'
                    }
                  >
                    {check.status}
                  </Badge>
                </div>
              </div>
              <p className="mt-3 text-sm leading-7 text-[hsl(var(--muted))]">{check.detail}</p>
            </div>
          ))}
        </div>

        <div className="rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-5">
          <div className="fine-print">Close Blockers</div>
          <div className="mt-3 text-base font-semibold text-[hsl(var(--foreground))]">
            {readiness.blockers.length > 0 ? 'Still missing before close' : 'No blockers flagged'}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge
              tone={
                probability.band === 'HIGH'
                  ? 'good'
                  : probability.band === 'MEDIUM'
                    ? 'warn'
                    : 'danger'
              }
            >
              {probability.band.toLowerCase()} momentum
            </Badge>
          </div>
          <div className="mt-4 grid gap-2">
            {readiness.blockers.length > 0 ? (
              readiness.blockers.map((blocker) => (
                <div
                  key={blocker}
                  className="rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-4 py-3 text-sm text-[hsl(var(--foreground-muted))]"
                >
                  {blocker}
                </div>
              ))
            ) : (
              <div className="text-sm text-[hsl(var(--muted))]">
                Accepted bid, financing, diligence, and current-stage process gates are all covered.
              </div>
            )}
          </div>
          <div className="mt-5 grid gap-2">
            {probability.drivers.map((driver) => (
              <div
                key={driver}
                className="rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-4 py-3 text-sm text-[hsl(var(--foreground-muted))]"
              >
                {driver}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
