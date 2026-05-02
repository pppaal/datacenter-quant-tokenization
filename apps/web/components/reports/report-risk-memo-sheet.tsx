import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type {
  DealReport,
  ReportChecklistItem,
  ReportFact,
  ReportSection
} from '@/lib/services/reports';

function findSection(report: DealReport, id: string) {
  return report.sections.find((section) => section.id === id);
}

function statusTone(status: ReportChecklistItem['status']) {
  if (status === 'complete') return 'good' as const;
  if (status === 'partial') return 'warn' as const;
  return 'danger' as const;
}

function renderFacts(facts: ReportFact[] | undefined, keyPrefix: string) {
  if (!facts?.length) return null;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
      {facts.map((fact) => (
        <div
          key={`${keyPrefix}-${fact.label}`}
          className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4"
        >
          <div className="fine-print">{fact.label}</div>
          <div className="mt-3 text-lg font-semibold text-white">{fact.value}</div>
          {fact.detail ? (
            <p className="mt-2 text-sm leading-7 text-slate-400">{fact.detail}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function renderBody(section: ReportSection | undefined) {
  if (!section?.body?.length) return null;
  return (
    <div className="space-y-4">
      {section.body.map((paragraph) => (
        <p key={paragraph} className="text-sm leading-8 text-slate-300">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

function renderChecklist(items: ReportChecklistItem[] | undefined) {
  if (!items?.length) return null;
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div
          key={`${item.label}-${item.detail}`}
          className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold text-white">{item.label}</div>
            <Badge tone={statusTone(item.status)}>{item.status}</Badge>
          </div>
          <p className="mt-3 text-sm leading-7 text-slate-400">{item.detail}</p>
          {item.sources?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {item.sources.map((source) => (
                <span
                  key={`${item.label}-${source}`}
                  className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-slate-400"
                >
                  {source}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function ReportRiskMemoSheet({
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
  const posture = findSection(report, 'risk-posture');
  const primaryRisks = findSection(report, 'primary-risks');
  const mitigation = findSection(report, 'mitigation');
  const evidence = findSection(report, 'evidence');

  const heroFacts = report.heroFacts.slice(0, 4);
  const traceability = report.traceability.slice(0, 4);
  const controlFacts = report.controlSheet.slice(0, 4);

  return (
    <div className="report-risk-sheet space-y-6 pb-16">
      <section className="surface hero-mesh report-risk-hero">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={report.status === 'production-ready' ? 'good' : 'warn'}>
            {report.statusLabel}
          </Badge>
          <Badge>{report.audienceLabel}</Badge>
          <Badge>{assetCode}</Badge>
          <Badge>{locationLabel}</Badge>
        </div>

        <div className="mt-4 rounded-[20px] border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm leading-7 text-amber-100">
          {report.distributionNotice}
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-5">
            <div>
              <div className="eyebrow">Internal Downside Note</div>
              <h1 className="mt-3 text-5xl font-semibold leading-[0.96] tracking-[-0.05em] text-white md:text-6xl">
                {assetName}
              </h1>
              <p className="mt-3 text-base font-medium text-accent">{report.title}</p>
            </div>
            <p className="max-w-4xl text-base leading-8 text-slate-200">{report.heroSummary}</p>
          </div>

          <Card className="grid gap-4">
            <div className="eyebrow">{posture?.kicker ?? 'Risk Posture'}</div>
            <h2 className="text-2xl font-semibold text-white">
              {posture?.title ?? 'Current Downside View'}
            </h2>
            {renderBody(posture)}
            <div className="grid gap-3 text-sm text-slate-300">
              <div className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3">
                <span>Asset</span>
                <span>{assetName}</span>
              </div>
              <div className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3">
                <span>Location</span>
                <span>{locationLabel}</span>
              </div>
              <div className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3">
                <span>Generated</span>
                <span>{report.generatedAtLabel}</span>
              </div>
              <div className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3">
                <span>Version</span>
                <span>{report.versionLabel}</span>
              </div>
            </div>
          </Card>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {heroFacts.map((fact) => (
          <div key={fact.label} className="metric-card">
            <div className="fine-print">{fact.label}</div>
            <div className="mt-3 text-2xl font-semibold text-white">{fact.value}</div>
            {fact.detail ? (
              <p className="mt-2 text-sm leading-7 text-slate-400">{fact.detail}</p>
            ) : null}
          </div>
        ))}
      </section>

      <section className="report-export-appendix grid gap-6 xl:grid-cols-[0.98fr_1.02fr]">
        <Card>
          <div className="eyebrow">{primaryRisks?.kicker ?? 'Primary Risks'}</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            {primaryRisks?.title ?? 'Issues Requiring Management Attention'}
          </h2>
          <div className="mt-5">{renderChecklist(primaryRisks?.checklist)}</div>
        </Card>

        <Card>
          <div className="eyebrow">{mitigation?.kicker ?? 'Mitigation'}</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            {mitigation?.title ?? 'Near-Term Mitigants And Open Items'}
          </h2>
          <div className="mt-5">{renderChecklist(mitigation?.checklist)}</div>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <div className="eyebrow">Risk Metrics</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Downside Scorecard</h2>
          <div className="mt-5">{renderFacts(posture?.facts, 'posture')}</div>
        </Card>

        <Card>
          <div className="eyebrow">{evidence?.kicker ?? 'Evidence'}</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            {evidence?.title ?? 'Document Support'}
          </h2>
          <div className="mt-5">{renderFacts(evidence?.facts, 'evidence')}</div>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.98fr_1.02fr]">
        <Card>
          <div className="eyebrow">Traceability</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Control And Integrity</h2>
          <div className="mt-5 space-y-3">
            {traceability.map((fact) => (
              <div
                key={fact.label}
                className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-4"
              >
                <div className="fine-print">{fact.label}</div>
                <div className="mt-2 text-lg font-semibold text-white">{fact.value}</div>
                {fact.detail ? (
                  <p className="mt-2 text-sm leading-7 text-slate-400">{fact.detail}</p>
                ) : null}
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="eyebrow">Control Sheet</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Report Control Record</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {controlFacts.map((fact) => (
              <div
                key={fact.label}
                className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="fine-print">{fact.label}</div>
                <div className="mt-3 text-lg font-semibold text-white">{fact.value}</div>
                {fact.detail ? (
                  <p className="mt-2 text-sm leading-7 text-slate-400">{fact.detail}</p>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section>
        <Card className="border-amber-500/20 bg-amber-500/10">
          <div className="eyebrow text-amber-200">Distribution Note</div>
          <p className="mt-3 text-sm leading-7 text-amber-100">{report.footerNotice}</p>
        </Card>
      </section>
    </div>
  );
}
