import Link from 'next/link';
import { DealStage, RiskSeverity, TaskPriority } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatDealStage, getDealStageTone } from '@/lib/deals/config';
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils';

type DealPipelineSummary = {
  totalDeals: number;
  urgentDeals: number;
  blockedDeals: number;
  closingDeals: number;
  byStage: Array<{
    stage: DealStage;
    count: number;
  }>;
  watchlist: Array<{
    id: string;
    dealCode: string;
    title: string;
    stage: DealStage;
    nextAction: string | null;
    targetCloseDate: Date | null;
    urgentTaskCount: number;
    openRiskCount: number;
    readinessScorePct: number;
    readinessBlockerCount: number;
    closeProbabilityPct: number;
    closeProbabilityBand: 'LOW' | 'MEDIUM' | 'HIGH';
    latestCounterpartyRoles: string[];
    latestValuation: {
      id: string;
      baseCaseValueKrw: number;
      confidenceScore: number;
      createdAt: Date;
    } | null;
  }>;
};

type Props = {
  summary: DealPipelineSummary;
};

export function DealPipelinePanel({ summary }: Props) {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="eyebrow">Deal Pipeline</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Live execution queue</h2>
        </div>
        <Link href="/admin/deals">
          <Button variant="ghost">Open Deals</Button>
        </Link>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-4">
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
          <div className="fine-print">Tracked Deals</div>
          <div className="mt-3 text-3xl font-semibold text-white">{formatNumber(summary.totalDeals, 0)}</div>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
          <div className="fine-print">Urgent</div>
          <div className="mt-3 text-3xl font-semibold text-white">{formatNumber(summary.urgentDeals, 0)}</div>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
          <div className="fine-print">Blocked</div>
          <div className="mt-3 text-3xl font-semibold text-white">{formatNumber(summary.blockedDeals, 0)}</div>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
          <div className="fine-print">Closing</div>
          <div className="mt-3 text-3xl font-semibold text-white">{formatNumber(summary.closingDeals, 0)}</div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4 xl:grid-cols-8">
        {summary.byStage.map((item) => (
          <div key={item.stage} className="rounded-[20px] border border-white/10 bg-slate-950/35 p-4">
            <div className="fine-print">{formatDealStage(item.stage)}</div>
            <div className="mt-3 text-2xl font-semibold text-white">{formatNumber(item.count, 0)}</div>
          </div>
        ))}
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
                  <Badge tone={getDealStageTone(deal.stage)}>{formatDealStage(deal.stage)}</Badge>
                  <Badge>{deal.dealCode}</Badge>
                </div>
                <p className="mt-2 text-sm leading-7 text-slate-400">
                  {deal.nextAction ?? 'No next action set yet.'}
                </p>
              </div>
              <div className="grid gap-2 text-right text-sm text-slate-300 md:grid-cols-3 md:text-left">
                <div>
                  <div className="fine-print">Close</div>
                  <div className="mt-1">{formatDate(deal.targetCloseDate)}</div>
                </div>
                <div>
                  <div className="fine-print">Urgent</div>
                  <div className="mt-1">{formatNumber(deal.urgentTaskCount, 0)}</div>
                </div>
                <div>
                  <div className="fine-print">Risks</div>
                  <div className="mt-1">{formatNumber(deal.openRiskCount, 0)}</div>
                </div>
                <div>
                  <div className="fine-print">Readiness</div>
                  <div className="mt-1">
                    {formatNumber(deal.readinessScorePct, 0)}% / {formatNumber(deal.readinessBlockerCount, 0)} blockers
                  </div>
                </div>
                <div>
                  <div className="fine-print">P(Close)</div>
                  <div className="mt-1">
                    {formatNumber(deal.closeProbabilityPct, 0)}% / {deal.closeProbabilityBand.toLowerCase()}
                  </div>
                </div>
                <div>
                  <div className="fine-print">Valuation</div>
                  <div className="mt-1">
                    {deal.latestValuation ? `${formatNumber(deal.latestValuation.confidenceScore, 0)} / ${formatDate(deal.latestValuation.createdAt)}` : 'No run'}
                  </div>
                </div>
                <div className="md:col-span-4">
                  <div className="fine-print">Roles</div>
                  <div className="mt-1">
                    {deal.latestCounterpartyRoles.length > 0 ? deal.latestCounterpartyRoles.join(', ') : 'No contacts'}
                  </div>
                </div>
                <div className="md:col-span-4">
                  <div className="fine-print">Latest Value</div>
                  <div className="mt-1">
                    {deal.latestValuation ? formatCurrency(deal.latestValuation.baseCaseValueKrw) : 'No linked value yet'}
                  </div>
                </div>
              </div>
            </Link>
          ))
        ) : (
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">
            No deals are tracked yet. Open the first execution record from `/admin/deals`.
          </div>
        )}
      </div>
    </Card>
  );
}
