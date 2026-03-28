import Link from 'next/link';
import { DealStage } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DealCreateForm } from '@/components/admin/deal-create-form';
import { DealRestoreButton } from '@/components/admin/deal-restore-button';
import { DealViewTabs } from '@/components/admin/deal-view-tabs';
import { formatDealStage, getDealStageTone } from '@/lib/deals/config';
import { prisma } from '@/lib/db/prisma';
import { buildDealExecutionSnapshot, listDeals } from '@/lib/services/deals';
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams?: Promise<{
    view?: string;
  }>;
};

export default async function DealsPage({ searchParams }: Props) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const [deals, assets] = await Promise.all([
    listDeals(),
    prisma.asset.findMany({
      select: {
        id: true,
        name: true,
        assetCode: true,
        assetClass: true,
        market: true,
        address: {
          select: {
            city: true,
            country: true
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      },
      take: 50
    })
  ]);

  const stageSummary = Object.values(DealStage).map((stage) => ({
    stage,
    count: deals.filter((deal) => deal.stage === stage).length
  }));
  const urgentDeals = deals.filter((deal) =>
    deal.tasks.some((task) => task.status !== 'DONE' && (task.priority === 'URGENT' || task.priority === 'HIGH'))
  );
  const blockedDeals = deals.filter((deal) => deal.riskFlags.some((risk) => !risk.isResolved));
  const view = resolvedSearchParams.view ?? 'active';
  const visibleDeals = deals
    .map((deal) => ({
      deal,
      snapshot: buildDealExecutionSnapshot(deal as any)
    }))
    .filter(({ deal }) => {
      const isArchived = deal.statusLabel === 'ARCHIVED' || deal.archivedAt != null;
      if (view === 'archived') return isArchived;
      if (view === 'actionable') {
        return (
          !isArchived &&
          (deal.tasks.some((task) => task.status !== 'DONE' && task.dueDate != null) ||
            deal.riskFlags.some((risk) => !risk.isResolved) ||
            !deal.nextAction)
        );
      }
      return !isArchived;
    })
    .sort((left, right) => {
      const leftSnapshot = left.snapshot;
      const rightSnapshot = right.snapshot;
      const leftScore =
        (leftSnapshot?.overdueTaskCount ?? 0) * 5 +
        (leftSnapshot?.dueSoonTaskCount ?? 0) * 3 +
        (leftSnapshot?.openRiskCount ?? 0) * 2 +
        (left.deal.nextAction ? 0 : 1);
      const rightScore =
        (rightSnapshot?.overdueTaskCount ?? 0) * 5 +
        (rightSnapshot?.dueSoonTaskCount ?? 0) * 3 +
        (rightSnapshot?.openRiskCount ?? 0) * 2 +
        (right.deal.nextAction ? 0 : 1);
      if (rightScore !== leftScore) return rightScore - leftScore;
      const leftDue = leftSnapshot?.nextTask?.dueDate?.getTime() ?? left.deal.nextActionAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightDue = rightSnapshot?.nextTask?.dueDate?.getTime() ?? right.deal.nextActionAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return leftDue - rightDue;
    });

  return (
    <div className="space-y-8">
      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="hero-mesh">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="warn">Deal Execution OS</Badge>
            <Badge>{formatNumber(deals.length, 0)} live deals</Badge>
          </div>
          <h2 className="mt-5 text-4xl font-semibold tracking-[-0.04em] text-white">
            Run one real process from first teaser to handoff.
          </h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400">
            The deal pipeline keeps next action, counterparties, diligence tasks, and risk flags in one operator view.
            This surface is meant for actual processes, not report generation.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="metric-card">
              <div className="fine-print">Urgent Deals</div>
              <div className="mt-3 text-4xl font-semibold text-white">{formatNumber(urgentDeals.length, 0)}</div>
              <p className="mt-2 text-sm text-slate-400">At least one urgent or high-priority task is still open.</p>
            </div>
            <div className="metric-card">
              <div className="fine-print">Blocked Deals</div>
              <div className="mt-3 text-4xl font-semibold text-white">{formatNumber(blockedDeals.length, 0)}</div>
              <p className="mt-2 text-sm text-slate-400">Open execution blockers or unresolved risk flags.</p>
            </div>
            <div className="metric-card">
              <div className="fine-print">Closing Queue</div>
              <div className="mt-3 text-4xl font-semibold text-white">
                {formatNumber(deals.filter((deal) => deal.stage === DealStage.CLOSING).length, 0)}
              </div>
              <p className="mt-2 text-sm text-slate-400">Deals already in document, funds flow, or sign-close mode.</p>
            </div>
          </div>
        </Card>

        <Card>
          <DealCreateForm
            assets={assets.map((asset) => ({
              id: asset.id,
              name: asset.name,
              assetCode: asset.assetCode,
              assetClass: asset.assetClass,
              market: asset.market,
              city: asset.address?.city ?? null,
              country: asset.address?.country ?? null
            }))}
          />
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="eyebrow">Stage Coverage</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Pipeline state machine</h2>
          </div>
          <Badge tone="neutral">sourced to asset management</Badge>
        </div>
        <DealViewTabs initialView={view as 'active' | 'actionable' | 'archived'} />
        <div className="mt-5 grid gap-3 md:grid-cols-4 xl:grid-cols-8">
          {stageSummary.map((item) => (
            <div key={item.stage} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
              <div className="fine-print">{formatDealStage(item.stage)}</div>
              <div className="mt-3 text-3xl font-semibold text-white">{formatNumber(item.count, 0)}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-5">
        {visibleDeals.map(({ deal, snapshot }) => {
          const openTasks = deal.tasks.filter((task) => task.status !== 'DONE').length;
          const openRisks = deal.riskFlags.filter((risk) => !risk.isResolved).length;
          const lastActivity = deal.activityLogs[0] ?? null;
          const latestValuation = deal.asset?.valuations[0] ?? null;
          const latestBid = deal.bidRevisions[0] ?? null;
          const isStale = deal.updatedAt.getTime() <= Date.now() - 1000 * 60 * 60 * 24 * 7;

          return (
            <div
              key={deal.id}
              className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6 transition hover:border-white/20 hover:bg-white/[0.05]"
            >
              <Link href={`/admin/deals/${deal.id}`} className="block">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="text-xl font-semibold text-white">{deal.title}</div>
                    <Badge tone={getDealStageTone(deal.stage)}>{formatDealStage(deal.stage)}</Badge>
                    <Badge>{deal.dealCode}</Badge>
                  </div>
                  <div className="mt-2 text-sm text-slate-400">
                    {deal.assetClass ? deal.assetClass.replaceAll('_', ' ') : 'Asset class pending'} /{' '}
                    {deal.city ?? deal.asset?.address?.city ?? deal.market}
                    {deal.asset ? ` / linked to ${deal.asset.assetCode}` : ''}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge tone={snapshot && snapshot.checklistCompletionPct < 100 ? 'warn' : 'good'}>
                      checklist {snapshot ? `${formatNumber(snapshot.checklistCompletionPct, 0)}%` : 'N/A'}
                    </Badge>
                    {snapshot?.overdueTaskCount ? <Badge tone="danger">{snapshot.overdueTaskCount} overdue</Badge> : null}
                    {snapshot?.dueSoonTaskCount ? <Badge tone="warn">{snapshot.dueSoonTaskCount} due soon</Badge> : null}
                    {isStale ? <Badge tone="warn">stale</Badge> : null}
                    {deal.statusLabel === 'ARCHIVED' ? <Badge>archived</Badge> : null}
                  </div>
                  <p className="mt-4 text-sm leading-7 text-slate-300">
                    {deal.nextAction ?? deal.headline ?? 'No next action yet. Open the deal and set the immediate move.'}
                  </p>
                  {snapshot ? <p className="mt-3 text-sm text-slate-500">{snapshot.reminderSummary}</p> : null}
                </div>
                <div className="grid gap-3 text-right md:grid-cols-2 md:text-left xl:grid-cols-4">
                  <div>
                    <div className="fine-print">Target Close</div>
                    <div className="mt-2 text-sm text-white">{formatDate(deal.targetCloseDate)}</div>
                  </div>
                  <div>
                    <div className="fine-print">Open Tasks</div>
                    <div className="mt-2 text-sm text-white">{formatNumber(openTasks, 0)}</div>
                  </div>
                  <div>
                    <div className="fine-print">Open Risks</div>
                    <div className="mt-2 text-sm text-white">{formatNumber(openRisks, 0)}</div>
                  </div>
                  <div>
                    <div className="fine-print">Bid Guidance</div>
                    <div className="mt-2 text-sm text-white">{formatCurrency(deal.bidGuidanceKrw)}</div>
                  </div>
                  <div>
                    <div className="fine-print">Latest Bid</div>
                    <div className="mt-2 text-sm text-white">
                      {latestBid ? formatCurrency(latestBid.bidPriceKrw) : 'No bid yet'}
                    </div>
                  </div>
                  <div>
                    <div className="fine-print">Latest Valuation</div>
                    <div className="mt-2 text-sm text-white">
                      {latestValuation ? formatCurrency(latestValuation.baseCaseValueKrw) : 'No run'}
                    </div>
                  </div>
                </div>
              </div>
              </Link>
              <div className="mt-5 grid gap-4 border-t border-white/10 pt-5 md:grid-cols-[1fr_auto]">
                <div className="text-sm text-slate-400">
                  Last activity:{' '}
                  {lastActivity
                    ? `${lastActivity.title} on ${formatDate(lastActivity.createdAt)}`
                    : 'No activity yet. Use the deal page to start the log.'}
                </div>
                <div className="flex flex-wrap gap-2">
                  {deal.counterparties.slice(0, 3).map((counterparty) => (
                    <Badge key={counterparty.id}>{counterparty.role}</Badge>
                  ))}
                  {deal.counterparties.length > 3 ? <Badge>+{deal.counterparties.length - 3}</Badge> : null}
                  {latestBid ? <Badge>{latestBid.status.toLowerCase()}</Badge> : null}
                  <Link href={`/admin/deals/${deal.id}`}>
                    <Button variant="ghost">Open</Button>
                  </Link>
                  {deal.statusLabel === 'ARCHIVED' || deal.archivedAt ? (
                    <DealRestoreButton dealId={deal.id} />
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}

        {visibleDeals.length === 0 ? (
          <Card>
            <div className="eyebrow">No Deals Yet</div>
            <h2 className="mt-3 text-2xl font-semibold text-white">Open the first execution record</h2>
            <p className="mt-3 text-sm leading-7 text-slate-400">
              {view === 'archived'
                ? 'No archived deals yet.'
                : 'Use the form above to create a sourced opportunity and start tracking stage movement, counterparties, tasks, and risks.'}
            </p>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
