import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { AdminAccessScopeType } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DealClosingReadinessPanel } from '@/components/admin/deal-closing-readiness-panel';
import { DealCloseProbabilityHistoryPanel } from '@/components/admin/deal-close-probability-history-panel';
import { DealDataCoveragePanel } from '@/components/admin/deal-data-coverage-panel';
import { DealDiligenceWorkstreamPanel } from '@/components/admin/deal-diligence-workstream-panel';
import { DealOperatorConsole } from '@/components/admin/deal-operator-console';
import { DealTimelinePanel } from '@/components/admin/deal-timeline-panel';
import { DocumentUploadForm } from '@/components/admin/document-upload-form';
import { formatDealStage, getDealStageTone } from '@/lib/deals/config';
import { canActorAccessScope } from '@/lib/security/admin-access';
import { prisma } from '@/lib/db/prisma';
import { resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';
import {
  buildDealCloseProbability,
  buildDealCloseProbabilityHistory,
  buildDealClosingReadiness,
  buildDealDataCoverage,
  buildDealExecutionSnapshot,
  buildDealOriginationProfile,
  buildDealTimeline,
  getDealById
} from '@/lib/services/deals';
import { formatCurrency, formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function DealDetailPage({ params }: Props) {
  const { id } = await params;
  const actor = await resolveVerifiedAdminActorFromHeaders(await headers(), prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  const canAccessDeal = await canActorAccessScope(actor, AdminAccessScopeType.DEAL, id, prisma);
  if (!canAccessDeal) notFound();
  const deal = await getDealById(id);

  if (!deal) {
    notFound();
  }

  const snapshot = buildDealExecutionSnapshot(deal);
  if (!snapshot) {
    notFound();
  }
  const latestValuation = deal.asset?.valuations[0] ?? null;
  const latestBid = deal.bidRevisions[0] ?? null;
  const latestLenderQuote = deal.lenderQuotes[0] ?? null;
  const latestNegotiationEvent = deal.negotiationEvents[0] ?? null;
  const timeline = buildDealTimeline(deal);
  const coverage = buildDealDataCoverage(deal, snapshot);
  const closingReadiness = buildDealClosingReadiness(deal, snapshot);
  const closeProbability = buildDealCloseProbability(deal, snapshot, closingReadiness);
  const origination = buildDealOriginationProfile(deal, snapshot);
  const closeProbabilityHistory = buildDealCloseProbabilityHistory(deal, {
    readiness: closingReadiness,
    probability: closeProbability
  });

  return (
    <div className="space-y-8">
      <Card className="hero-mesh">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-4xl">
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={getDealStageTone(deal.stage)}>{formatDealStage(deal.stage)}</Badge>
              <Badge>{deal.dealCode}</Badge>
              {deal.asset ? <Badge>{deal.asset.assetCode}</Badge> : null}
            </div>
            <h2 className="mt-5 text-4xl font-semibold tracking-[-0.04em] text-white">
              {deal.title}
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-300">
              {deal.headline ??
                'No headline yet. Use the operator console below to set the live process readout.'}
            </p>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div className="metric-card">
                <div className="fine-print">Next Action</div>
                <div className="mt-3 text-base font-semibold text-white">
                  {deal.nextActionAt ? formatDate(deal.nextActionAt) : 'No date'}
                </div>
                <p className="mt-2 text-sm text-slate-400">
                  {deal.nextAction ?? 'No next action set yet.'}
                </p>
              </div>
              <div className="metric-card">
                <div className="fine-print">Target Close</div>
                <div className="mt-3 text-base font-semibold text-white">
                  {formatDate(deal.targetCloseDate)}
                </div>
                <p className="mt-2 text-sm text-slate-400">{deal.strategy ?? 'Strategy not set'}</p>
              </div>
              <div className="metric-card">
                <div className="fine-print">Seller Guidance</div>
                <div className="mt-3 text-base font-semibold text-white">
                  {formatCurrency(deal.sellerGuidanceKrw)}
                </div>
                <p className="mt-2 text-sm text-slate-400">
                  Bid {formatCurrency(deal.bidGuidanceKrw)}
                </p>
              </div>
              <div className="metric-card">
                <div className="fine-print">Latest Bid Revision</div>
                <div className="mt-3 text-base font-semibold text-white">
                  {latestBid ? formatCurrency(latestBid.bidPriceKrw) : 'No bid yet'}
                </div>
                <p className="mt-2 text-sm text-slate-400">
                  {latestBid
                    ? `${latestBid.label} / ${latestBid.status.toLowerCase()}`
                    : 'Log negotiation terms once price discovery starts.'}
                </p>
              </div>
              <div className="metric-card">
                <div className="fine-print">Latest Lender Quote</div>
                <div className="mt-3 text-base font-semibold text-white">
                  {latestLenderQuote ? formatCurrency(latestLenderQuote.amountKrw) : 'No quote yet'}
                </div>
                <p className="mt-2 text-sm text-slate-400">
                  {latestLenderQuote
                    ? `${latestLenderQuote.facilityLabel} / ${latestLenderQuote.status.toLowerCase()}`
                    : 'Track financing certainty once the process reaches IC or closing.'}
                </p>
              </div>
              <div className="metric-card">
                <div className="fine-print">Latest Negotiation Event</div>
                <div className="mt-3 text-base font-semibold text-white">
                  {latestNegotiationEvent
                    ? latestNegotiationEvent.eventType.toLowerCase().replaceAll('_', ' ')
                    : 'No event yet'}
                </div>
                <p className="mt-2 text-sm text-slate-400">
                  {latestNegotiationEvent?.expiresAt
                    ? `Clock ends ${formatDate(latestNegotiationEvent.expiresAt)}`
                    : (latestNegotiationEvent?.title ??
                      'Log seller counters, feedback, and exclusivity changes.')}
                </p>
              </div>
              <div className="metric-card">
                <div className="fine-print">Linked Asset</div>
                <div className="mt-3 text-base font-semibold text-white">
                  {deal.asset?.name ?? 'Standalone deal'}
                </div>
                <p className="mt-2 text-sm text-slate-400">
                  {deal.city ?? deal.asset?.address?.city ?? deal.market} /{' '}
                  {deal.assetClass?.replaceAll('_', ' ') ?? 'Class pending'}
                </p>
              </div>
              <div className="metric-card">
                <div className="fine-print">Origination</div>
                <div className="mt-3 text-base font-semibold text-white">
                  {origination.sourceLabel}
                </div>
                <p className="mt-2 text-sm text-slate-400">
                  sourcing {origination.scorePct.toFixed(0)}% / {origination.exclusivityLabel}
                </p>
              </div>
              <div className="metric-card">
                <div className="fine-print">Latest Valuation</div>
                <div className="mt-3 text-base font-semibold text-white">
                  {latestValuation
                    ? formatCurrency(latestValuation.baseCaseValueKrw)
                    : 'No run yet'}
                </div>
                <p className="mt-2 text-sm text-slate-400">
                  {latestValuation
                    ? `Run ${formatDate(latestValuation.createdAt)}`
                    : 'Link a valuation run to commercial decisions.'}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link href="/admin/deals">
              <Button variant="secondary">Back To Deals</Button>
            </Link>
            <Link href={`/api/deals/${deal.id}/workpaper?format=md`}>
              <Button variant="ghost">Export DD Workpaper</Button>
            </Link>
            {deal.asset ? (
              <Link href={`/admin/assets/${deal.asset.id}`}>
                <Button variant="ghost">Open Linked Asset</Button>
              </Link>
            ) : null}
            {latestValuation ? (
              <Link href={`/admin/valuations/${latestValuation.id}`}>
                <Button variant="ghost">Open Latest Valuation</Button>
              </Link>
            ) : null}
            <Link href={`/api/deals/${deal.id}/workpaper?format=json`}>
              <Button variant="ghost">DD Workpaper JSON</Button>
            </Link>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="metric-card">
          <div className="fine-print">Checklist Completion</div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {snapshot.checklistCompletionPct.toFixed(0)}%
          </div>
          <p className="mt-2 text-sm text-slate-400">
            {snapshot.completedChecklistCount} of {snapshot.requiredChecklistCount} stage
            requirements are complete.
          </p>
        </div>
        <div className="metric-card">
          <div className="fine-print">Overdue Tasks</div>
          <div className="mt-3 text-3xl font-semibold text-white">{snapshot.overdueTaskCount}</div>
          <p className="mt-2 text-sm text-slate-400">{snapshot.reminderSummary}</p>
        </div>
        <div className="metric-card">
          <div className="fine-print">Exclusivity / Due Soon</div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {snapshot.exclusivityExpiresSoon ? 'Live' : snapshot.dueSoonTaskCount}
          </div>
          <p className="mt-2 text-sm text-slate-400">
            {snapshot.activeExclusivityEvent?.expiresAt
              ? `Exclusivity until ${formatDate(snapshot.activeExclusivityEvent.expiresAt)}`
              : 'Tasks due inside the next 72 hours.'}
          </p>
        </div>
      </div>

      <DealOperatorConsole deal={deal} snapshot={snapshot} origination={origination} />

      <DealDiligenceWorkstreamPanel
        dealId={deal.id}
        stageLabel={formatDealStage(deal.stage)}
        workstreams={deal.diligenceWorkstreams}
        availableDocuments={
          deal.asset?.documents.map((document) => ({
            id: document.id,
            title: document.title,
            documentType: document.documentType,
            currentVersion: document.currentVersion,
            documentHash: document.documentHash
          })) ?? []
        }
      />

      <DealClosingReadinessPanel readiness={closingReadiness} probability={closeProbability} />

      <DealCloseProbabilityHistoryPanel history={closeProbabilityHistory} />

      <DealDataCoveragePanel coverage={coverage} />

      {deal.asset ? (
        <Card>
          <div className="eyebrow">Deal Documents</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            Upload diligence directly into this process
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
            Uploading from the deal page scopes DD auto-match to this execution record and avoids
            cross-deal leakage on shared assets.
          </p>
          <div className="mt-6">
            <DocumentUploadForm assetId={deal.asset.id} dealId={deal.id} />
          </div>
        </Card>
      ) : null}

      <DealTimelinePanel events={timeline} />
    </div>
  );
}
