import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { getAssetReportBundle, listReportTemplates } from '@/lib/services/reports';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AssetReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await getAssetReportBundle(id);
  if (!bundle) notFound();

  const templates = listReportTemplates();

  return (
    <div className="space-y-6">
      <section className="surface hero-mesh">
        <div className="flex flex-wrap items-center gap-3">
          <Badge>Report Pack</Badge>
          <Badge>{bundle.assetCode}</Badge>
          <Badge tone={bundle.latestValuation ? 'good' : 'warn'}>
            {bundle.latestValuation ? 'Valuation Linked' : 'Needs Valuation'}
          </Badge>
        </div>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="space-y-5">
            <div>
              <div className="eyebrow">Underwriting Output Library</div>
              <h1 className="mt-3 text-5xl font-semibold leading-[0.96] tracking-[-0.05em] text-white md:text-6xl">
                Underwriting Reports
                <br />
                {bundle.assetName}
              </h1>
            </div>
            <p className="max-w-4xl text-base leading-8 text-slate-200">
              Generate committee-ready memos, diligence checklists, risk notes, and controlled
              teaser material from the current valuation, approved evidence layer, document set, and
              registry traceability record.
            </p>
          </div>

          <Card className="grid gap-4">
            <div className="eyebrow">Package Snapshot</div>
            <div className="grid gap-3 text-sm text-slate-300">
              <div className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3">
                <span>Latest Valuation</span>
                <span>
                  {bundle.latestValuation ? bundle.latestValuation.runLabel : 'Not generated'}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3">
                <span>Version Fingerprint</span>
                <span>{bundle.reportFingerprint}</span>
              </div>
              <div className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3">
                <span>Approved Evidence</span>
                <span>{bundle.reviewSummary.totals.approved}</span>
              </div>
              <div className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3">
                <span>Pending Evidence</span>
                <span>{bundle.reviewSummary.totals.pending}</span>
              </div>
              <div className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3">
                <span>Documents</span>
                <span>{bundle.counts.documents}</span>
              </div>
              <div className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3">
                <span>Anchored Docs</span>
                <span>{bundle.counts.anchoredDocuments}</span>
              </div>
              <div className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3">
                <span>Review Packet</span>
                <span>{bundle.latestReviewPacket?.fingerprint ? 'Staged' : 'Not staged'}</span>
              </div>
              <div className="rounded-[20px] border border-accent/20 bg-accent/10 px-4 py-3 text-xs leading-6 text-slate-100">
                Latest document hash: {bundle.documents[0]?.hash ?? 'No document hash yet'}{' '}
                {bundle.latestReviewPacket?.fingerprint
                  ? `/ packet ${bundle.latestReviewPacket.fingerprint.slice(0, 16)}`
                  : '/ packet not yet staged'}
              </div>
            </div>
          </Card>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        {templates.map((template) => (
          <Card key={template.kind} className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={template.status === 'production-ready' ? 'good' : 'warn'}>
                {template.status}
              </Badge>
              <Badge>{template.audience === 'investor' ? 'Investor' : 'Operator / IC'}</Badge>
            </div>

            <div>
              <div className="eyebrow">{template.shortLabel}</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">{template.title}</h2>
              <p className="mt-3 text-sm leading-7 text-slate-400">{template.description}</p>
            </div>

            <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
              <div className="fine-print">Template Note</div>
              <p className="mt-3 text-sm leading-7 text-slate-300">{template.notes}</p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <a
                href={`/admin/assets/${bundle.assetId}/reports/${template.kind}`}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-slate-100 transition duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:bg-white/[0.08]"
              >
                Open
              </a>
              <a
                href={`/api/assets/${bundle.assetId}/reports/${template.kind}?format=md`}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-slate-100 transition duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:bg-white/[0.08]"
              >
                Markdown
              </a>
              <a
                href={`/api/assets/${bundle.assetId}/reports/${template.kind}?format=json`}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-slate-100 transition duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:bg-white/[0.08]"
              >
                JSON
              </a>
            </div>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="good">packet</Badge>
            <Badge>Investor</Badge>
          </div>

          <div>
            <div className="eyebrow">Investor Packet</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Institutional Teaser Bundle</h2>
            <p className="mt-3 text-sm leading-7 text-slate-400">
              One-click packet for limited institutional circulation. Best used with print or
              save-as-PDF from the packet page.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <a
              href={`/admin/assets/${bundle.assetId}/reports/packet/investor`}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-slate-100 transition duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:bg-white/[0.08]"
            >
              Open Packet
            </a>
            <a
              href={`/api/assets/${bundle.assetId}/reports/packet/investor?format=md`}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-slate-100 transition duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:bg-white/[0.08]"
            >
              Packet Markdown
            </a>
            <a
              href={`/api/assets/${bundle.assetId}/reports/packet/investor?format=json`}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-slate-100 transition duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:bg-white/[0.08]"
            >
              Packet JSON
            </a>
          </div>
        </Card>

        <Card className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="warn">packet</Badge>
            <Badge>Operator / IC</Badge>
          </div>

          <div>
            <div className="eyebrow">IC Packet</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Internal Committee Bundle</h2>
            <p className="mt-3 text-sm leading-7 text-slate-400">
              Combined IC memo, DD checklist, and risk memo export for operator review and committee
              circulation.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <a
              href={`/admin/assets/${bundle.assetId}/reports/packet/operator`}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-slate-100 transition duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:bg-white/[0.08]"
            >
              Open Packet
            </a>
            <a
              href={`/api/assets/${bundle.assetId}/reports/packet/operator?format=md`}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-slate-100 transition duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:bg-white/[0.08]"
            >
              Packet Markdown
            </a>
            <a
              href={`/api/assets/${bundle.assetId}/reports/packet/operator?format=json`}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-slate-100 transition duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:bg-white/[0.08]"
            >
              Packet JSON
            </a>
          </div>
        </Card>
      </section>

      <Card>
        <div className="eyebrow">How To Export</div>
        <h2 className="mt-2 text-2xl font-semibold text-white">Operator And Investor Flow</h2>
        <ul className="mt-5 space-y-3 text-sm text-slate-300">
          <li className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3">
            Use <strong>One-Page Teaser</strong> for external institutional outreach. Open the page,
            review the document schedule, then print or save as PDF.
          </li>
          <li className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3">
            Use <strong>IC Memo</strong>, <strong>DD Checklist</strong>, and{' '}
            <strong>Risk Memo</strong> as operator and committee material. Export markdown if you
            need to mark up the draft outside the app.
          </li>
          <li className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3">
            Every output carries a deterministic version fingerprint and a traceability panel
            showing the linked valuation, approved evidence counts, latest document hash, and
            optional registry anchor reference.
          </li>
        </ul>

        <div className="mt-5 fine-print">Generated {formatDate(bundle.generatedAt)}</div>
        <div className="mt-3">
          <Link
            href={`/admin/assets/${bundle.assetId}`}
            className="text-sm font-semibold text-accent"
          >
            Back to asset dossier
          </Link>
        </div>
      </Card>
    </div>
  );
}
