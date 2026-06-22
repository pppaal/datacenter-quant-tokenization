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
    <section className="report-cover-page print-only rounded-[28px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] text-[hsl(var(--foreground))]">
      <div className="space-y-8 p-10">
        <div className="flex flex-wrap items-center gap-3">
          <Badge>{report.audienceLabel}</Badge>
          <Badge>{assetCode}</Badge>
        </div>

        <div className="space-y-4">
          <div className="font-mono text-[11px] uppercase tracking-[0.34em] text-[hsl(var(--muted))]">
            {coverTitle(report)}
          </div>
          <h1 className="text-5xl font-semibold leading-[0.95] tracking-[-0.05em] text-[hsl(var(--foreground))]">
            {assetName}
          </h1>
          <p className="max-w-3xl text-base leading-8 text-[hsl(var(--foreground))]">
            {coverSubtitle(report)}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[20px] border border-[hsl(var(--border))] px-4 py-4">
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[hsl(var(--muted))]">
              Location
            </div>
            <div className="mt-2 text-lg font-semibold text-[hsl(var(--foreground))]">
              {locationLabel}
            </div>
          </div>
          <div className="rounded-[20px] border border-[hsl(var(--border))] px-4 py-4">
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[hsl(var(--muted))]">
              Generated
            </div>
            <div className="mt-2 text-lg font-semibold text-[hsl(var(--foreground))]">
              {report.generatedAtLabel}
            </div>
          </div>
          <div className="rounded-[20px] border border-[hsl(var(--border))] px-4 py-4">
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[hsl(var(--muted))]">
              Version
            </div>
            <div className="mt-2 text-lg font-semibold text-[hsl(var(--foreground))]">
              {report.versionLabel}
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {leadFacts.map((fact) => (
            <div
              key={fact.label}
              className="rounded-[20px] border border-[hsl(var(--border))] px-4 py-4"
            >
              <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[hsl(var(--muted))]">
                {fact.label}
              </div>
              <div className="mt-2 text-lg font-semibold text-[hsl(var(--foreground))]">
                {fact.value}
              </div>
              {fact.detail ? (
                <p className="mt-2 text-sm leading-7 text-[hsl(var(--muted))]">{fact.detail}</p>
              ) : null}
            </div>
          ))}
        </div>

        <div className="rounded-[20px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-5 py-5">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[hsl(var(--muted))]">
            Distribution Notice
          </div>
          <p className="mt-3 text-sm leading-7 text-[hsl(var(--foreground))]">
            {report.distributionNotice}
          </p>
        </div>
      </div>
    </section>
  );
}
