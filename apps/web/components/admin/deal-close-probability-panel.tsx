import Link from 'next/link';
import { DealStage } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatDealStage, getDealStageTone } from '@/lib/deals/config';
import { formatDate, formatNumber } from '@/lib/utils';

type Props = {
  summary: {
    highProbabilityCount: number;
    mediumProbabilityCount: number;
    lowProbabilityCount: number;
    watchlist: Array<{
      id: string;
      dealCode: string;
      title: string;
      stage: DealStage;
      probability: {
        scorePct: number;
        band: 'LOW' | 'MEDIUM' | 'HIGH';
        headline: string;
        drivers: string[];
      };
      readiness: {
        scorePct: number;
        blockerCount: number;
      };
      nextAction: string | null;
      targetCloseDate: Date | null;
      openRiskCount: number;
      latestValuation: {
        id: string;
        baseCaseValueKrw: number;
        confidenceScore: number;
        createdAt: Date;
      } | null;
    }>;
  };
};

function getProbabilityTone(band: 'LOW' | 'MEDIUM' | 'HIGH') {
  if (band === 'HIGH') return 'good' as const;
  if (band === 'MEDIUM') return 'warn' as const;
  return 'danger' as const;
}

export function DealCloseProbabilityPanel({ summary }: Props) {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="eyebrow">Close Probability</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Which live deals are most likely to break</h2>
        </div>
        <Link href="/admin/deals?view=actionable">
          <Button variant="ghost">Open Execution Queue</Button>
        </Link>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
          <div className="fine-print">High Probability</div>
          <div className="mt-3 text-3xl font-semibold text-white">{formatNumber(summary.highProbabilityCount, 0)}</div>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
          <div className="fine-print">Medium Probability</div>
          <div className="mt-3 text-3xl font-semibold text-white">{formatNumber(summary.mediumProbabilityCount, 0)}</div>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
          <div className="fine-print">Low Probability</div>
          <div className="mt-3 text-3xl font-semibold text-white">{formatNumber(summary.lowProbabilityCount, 0)}</div>
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        {summary.watchlist.length > 0 ? (
          summary.watchlist.map((deal) => (
            <Link
              key={deal.id}
              href={`/admin/deals/${deal.id}`}
              className="flex items-center justify-between gap-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/20 hover:bg-white/[0.05]"
            >
              <div className="max-w-2xl">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="text-sm font-semibold text-white">{deal.title}</div>
                  <Badge>{deal.dealCode}</Badge>
                  <Badge tone={getDealStageTone(deal.stage)}>{formatDealStage(deal.stage)}</Badge>
                  <Badge tone={getProbabilityTone(deal.probability.band)}>
                    {formatNumber(deal.probability.scorePct, 0)}% {deal.probability.band.toLowerCase()}
                  </Badge>
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-300">{deal.probability.headline}</p>
                <div className="mt-3 space-y-1 text-xs text-slate-500">
                  {deal.probability.drivers.slice(0, 3).map((driver) => (
                    <div key={driver}>{driver}</div>
                  ))}
                </div>
              </div>
              <div className="grid gap-2 text-right text-sm text-slate-300 md:grid-cols-3 md:text-left">
                <div>
                  <div className="fine-print">Close</div>
                  <div className="mt-1">{formatDate(deal.targetCloseDate)}</div>
                </div>
                <div>
                  <div className="fine-print">Readiness</div>
                  <div className="mt-1">
                    {formatNumber(deal.readiness.scorePct, 0)}% / {formatNumber(deal.readiness.blockerCount, 0)} blockers
                  </div>
                </div>
                <div>
                  <div className="fine-print">Open Risks</div>
                  <div className="mt-1">{formatNumber(deal.openRiskCount, 0)}</div>
                </div>
                <div className="md:col-span-3">
                  <div className="fine-print">Next Action</div>
                  <div className="mt-1">{deal.nextAction ?? 'No next action set yet.'}</div>
                </div>
                <div className="md:col-span-3">
                  <div className="fine-print">Latest Valuation</div>
                  <div className="mt-1">
                    {deal.latestValuation
                      ? `${formatNumber(deal.latestValuation.confidenceScore, 0)} confidence / ${formatDate(deal.latestValuation.createdAt)}`
                      : 'No linked valuation'}
                  </div>
                </div>
              </div>
            </Link>
          ))
        ) : (
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">
            No live execution deals beyond screening yet.
          </div>
        )}
      </div>
    </Card>
  );
}
