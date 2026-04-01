import { ReviewQueuePanel } from '@/components/admin/review-queue-panel';
import { listPendingAssetReviewSummaries } from '@/lib/services/review';

export const dynamic = 'force-dynamic';

export default async function AdminReviewPage() {
  const summaries = await listPendingAssetReviewSummaries();

  return (
    <div className="space-y-6">
      <section className="surface hero-mesh">
        <div className="eyebrow">Underwriting Review</div>
        <h1 className="mt-3 text-5xl font-semibold leading-[0.96] tracking-[-0.05em] text-white md:text-6xl">
          Normalize, review, and approve evidence before committee use.
        </h1>
        <p className="mt-4 max-w-4xl text-base leading-8 text-slate-200">
          This queue is the control point between raw diligence capture and the approved feature layer used by
          valuation, IC outputs, and registry-ready packaging.
        </p>
      </section>

      <ReviewQueuePanel
        summaries={summaries}
        title="Global Review Queue"
        emptyMessage="All normalized micro, legal, and lease records are currently reviewed."
      />
    </div>
  );
}
