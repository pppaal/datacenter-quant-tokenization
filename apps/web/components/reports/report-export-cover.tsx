import { Badge } from '@/components/ui/badge';
import type { DealReport } from '@/lib/services/reports';

function coverTitle(report: DealReport) {
  switch (report.kind) {
    case 'teaser':
      return 'Investor Export Cover';
    case 'ic-memo':
      return 'Investment Committee Cover';
    case 'dd-checklist':
      return 'Diligence Workpaper Cover';
    case 'risk-memo':
      return 'Risk Review Cover';
  }
}

function coverSubtitle(report: DealReport) {
  switch (report.kind) {
    case 'teaser':
      return 'Confidential private process material prepared for limited investor circulation.';
    case 'ic-memo':
      return 'Internal memorandum for committee review, downside framing, and conditional approval discussion.';
    case 'dd-checklist':
      return 'Internal diligence status pack showing current workstream coverage and open items.';
    case 'risk-memo':
      return 'Internal downside note summarizing live risk flags, mitigants, and supporting evidence.';
  }
}

export function ReportExportCover({
  assetName,
  assetCode,
  locationLabel,
  report
}: {
  assetName: string;
  assetCode: string;
  locationLabel: string;
  report: DealReport;
}) {
  const leadFacts = report.heroFacts.slice(0, 3);

  return (
    <section className="report-cover-page print-only rounded-[28px] border border-white/10 bg-white text-slate-900">
      <div className="space-y-8 p-10">
        <div className="flex flex-wrap items-center gap-3">
          <Badge>{report.audienceLabel}</Badge>
          <Badge>{report.statusLabel}</Badge>
          <Badge>{assetCode}</Badge>
        </div>

        <div className="space-y-4">
          <div className="font-mono text-[11px] uppercase tracking-[0.34em] text-slate-500">{coverTitle(report)}</div>
          <h1 className="text-5xl font-semibold leading-[0.95] tracking-[-0.05em] text-slate-950">{assetName}</h1>
          <p className="max-w-3xl text-base leading-8 text-slate-700">{coverSubtitle(report)}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[20px] border border-slate-200 px-4 py-4">
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Location</div>
            <div className="mt-2 text-lg font-semibold text-slate-950">{locationLabel}</div>
          </div>
          <div className="rounded-[20px] border border-slate-200 px-4 py-4">
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Generated</div>
            <div className="mt-2 text-lg font-semibold text-slate-950">{report.generatedAtLabel}</div>
          </div>
          <div className="rounded-[20px] border border-slate-200 px-4 py-4">
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Version</div>
            <div className="mt-2 text-lg font-semibold text-slate-950">{report.versionLabel}</div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {leadFacts.map((fact) => (
            <div key={fact.label} className="rounded-[20px] border border-slate-200 px-4 py-4">
              <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">{fact.label}</div>
              <div className="mt-2 text-lg font-semibold text-slate-950">{fact.value}</div>
              {fact.detail ? <p className="mt-2 text-sm leading-7 text-slate-600">{fact.detail}</p> : null}
            </div>
          ))}
        </div>

        <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-5 py-5">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Distribution Notice</div>
          <p className="mt-3 text-sm leading-7 text-slate-700">{report.distributionNotice}</p>
        </div>
      </div>
    </section>
  );
}
