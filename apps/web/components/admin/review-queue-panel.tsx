import Link from 'next/link';
import { ReviewStatus } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import type { AssetEvidenceReviewSummary } from '@/lib/services/review';
import { ReviewActionForm } from '@/components/admin/review-action-form';

function toneForStatus(status: ReviewStatus) {
  switch (status) {
    case ReviewStatus.APPROVED:
      return 'good' as const;
    case ReviewStatus.REJECTED:
      return 'danger' as const;
    default:
      return 'warn' as const;
  }
}

export function ReviewQueuePanel({
  summaries,
  title = 'Evidence Review Queue',
  emptyMessage = 'No pending underwriting evidence is currently waiting on approval.'
}: {
  summaries: AssetEvidenceReviewSummary[];
  title?: string;
  emptyMessage?: string;
}) {
  const pendingCount = summaries.reduce((count, summary) => count + summary.pendingEvidenceCount, 0);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="eyebrow">{title}</div>
          <h3 className="mt-2 text-2xl font-semibold text-white">
            Approve normalized evidence before it enters the approved feature layer
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-400">
            Review power, permit, legal, and lease rows before valuation, IC material, and readiness packaging rely on
            them.
          </p>
        </div>
        <Badge>{pendingCount} pending</Badge>
      </div>

      {summaries.length === 0 ? (
        <div className="mt-5 rounded-[24px] border border-white/10 bg-white/[0.03] p-5 text-sm leading-7 text-slate-400">
          {emptyMessage}
        </div>
      ) : (
        <div className="mt-5 space-y-6">
          {summaries.map((summary) => (
            <div key={summary.assetId} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="eyebrow">{summary.assetCode}</div>
                  <h4 className="mt-2 text-xl font-semibold text-white">{summary.assetName}</h4>
                  <p className="mt-2 text-sm text-slate-400">
                    {summary.totals.approved} approved · {summary.totals.pending} pending · {summary.totals.rejected}{' '}
                    rejected
                  </p>
                  {summary.pendingBlockers.length > 0 ? (
                    <div className="mt-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs leading-6 text-amber-100">
                      Approval blockers: {summary.pendingBlockers.slice(0, 3).join(' · ')}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs leading-6 text-emerald-100">
                      No open approval blockers in the current evidence queue.
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-start gap-3">
                  <div className="flex flex-wrap gap-2">
                    {summary.disciplines.map((discipline) => (
                      <Badge key={discipline.key} tone={discipline.pendingCount > 0 ? 'warn' : 'good'}>
                        {discipline.label}: {discipline.pendingCount} pending
                      </Badge>
                    ))}
                  </div>
                  <Link
                    href={`/admin/assets/${summary.assetId}`}
                    className="text-xs font-medium uppercase tracking-[0.18em] text-accent transition hover:text-accent/80"
                  >
                    Open Asset Dossier
                  </Link>
                </div>
              </div>

              <div className="mt-5 grid gap-4">
                {summary.disciplines
                  .filter((discipline) => discipline.items.length > 0)
                  .map((discipline) => (
                    <div key={discipline.key} className="rounded-[20px] border border-white/10 bg-slate-950/25 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-white">{discipline.label}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {discipline.approvedCount} approved · {discipline.pendingCount} pending ·{' '}
                            {discipline.rejectedCount} rejected
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-4">
                        {discipline.items.map((item) => (
                          <div key={item.recordId} className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="text-sm font-semibold text-white">{item.title}</div>
                                  <Badge tone={toneForStatus(item.reviewStatus)}>{item.reviewStatus}</Badge>
                                </div>
                                <div className="text-sm text-slate-400">{item.detail}</div>
                                <div className="text-xs text-slate-500">
                                  Updated {formatDate(item.updatedAt)}
                                  {item.sourceUpdatedAt ? ` · source ${formatDate(item.sourceUpdatedAt)}` : ''}
                                </div>
                                {item.reviewNotes ? (
                                  <div className="rounded-2xl border border-white/10 bg-slate-950/30 px-3 py-2 text-xs text-slate-400">
                                    Current note: {item.reviewNotes}
                                  </div>
                                ) : null}
                              </div>
                            </div>

                            <div className="mt-4">
                              <ReviewActionForm
                                recordType={item.recordType}
                                recordId={item.recordId}
                                currentStatus={item.reviewStatus}
                                currentNotes={item.reviewNotes}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
