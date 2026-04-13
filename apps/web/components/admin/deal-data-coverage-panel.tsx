import type { DealDataCoverage } from '@/lib/services/deals';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatNumber } from '@/lib/utils';

type Props = {
  coverage: DealDataCoverage;
};

export function DealDataCoveragePanel({ coverage }: Props) {
  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="eyebrow">Data Coverage</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Execution data readiness</h2>
        </div>
        <Badge tone={coverage.scorePct >= 75 ? 'good' : coverage.scorePct >= 50 ? 'warn' : 'danger'}>
          {formatNumber(coverage.scorePct, 0)}%
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        <div className="metric-card">
          <div className="fine-print">Checks Complete</div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {coverage.completedCount} / {coverage.totalCount}
          </div>
        </div>
        <div className="metric-card">
          <div className="fine-print">Documents</div>
          <div className="mt-3 text-3xl font-semibold text-white">{coverage.evidence.documentCount}</div>
        </div>
        <div className="metric-card">
          <div className="fine-print">Valuations</div>
          <div className="mt-3 text-3xl font-semibold text-white">{coverage.evidence.valuationCount}</div>
        </div>
        <div className="metric-card">
          <div className="fine-print">Counterparties</div>
          <div className="mt-3 text-3xl font-semibold text-white">{coverage.evidence.counterpartyCount}</div>
        </div>
        <div className="metric-card">
          <div className="fine-print">Bid Revisions</div>
          <div className="mt-3 text-3xl font-semibold text-white">{coverage.evidence.bidRevisionCount}</div>
        </div>
        <div className="metric-card">
          <div className="fine-print">Lender Quotes</div>
          <div className="mt-3 text-3xl font-semibold text-white">{coverage.evidence.lenderQuoteCount}</div>
        </div>
        <div className="metric-card">
          <div className="fine-print">Negotiation Events</div>
          <div className="mt-3 text-3xl font-semibold text-white">{coverage.evidence.negotiationEventCount}</div>
        </div>
        <div className="metric-card">
          <div className="fine-print">DD Workstreams</div>
          <div className="mt-3 text-3xl font-semibold text-white">{coverage.evidence.diligenceWorkstreamCount}</div>
        </div>
        <div className="metric-card">
          <div className="fine-print">Signed Off</div>
          <div className="mt-3 text-3xl font-semibold text-white">{coverage.evidence.signedOffWorkstreamCount}</div>
        </div>
        <div className="metric-card">
          <div className="fine-print">Blocked</div>
          <div className="mt-3 text-3xl font-semibold text-white">{coverage.evidence.blockedWorkstreamCount}</div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="grid gap-3">
          {coverage.checks.map((check) => (
            <div key={check.key} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm font-semibold text-white">{check.title}</div>
                <Badge tone={check.status === 'done' ? 'good' : 'warn'}>{check.status}</Badge>
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-400">{check.detail}</p>
            </div>
          ))}
        </div>

        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
          <div className="fine-print">Current Gaps</div>
          <div className="mt-3 text-base font-semibold text-white">
            {coverage.gaps.length > 0 ? 'What is still missing' : 'Core data is in place'}
          </div>
          <div className="mt-4 grid gap-2">
            {coverage.gaps.length > 0 ? (
              coverage.gaps.map((gap) => (
                <div key={gap} className="rounded-[18px] border border-white/10 bg-slate-950/35 px-4 py-3 text-sm text-slate-300">
                  {gap}
                </div>
              ))
            ) : (
              <div className="text-sm text-slate-400">
                No immediate data gaps in the current execution record.
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
