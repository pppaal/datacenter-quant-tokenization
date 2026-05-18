import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { DealReport } from '@/lib/services/reports';
import { formatDate } from '@/lib/utils';

function checklistTone(status: 'complete' | 'partial' | 'open') {
  if (status === 'complete') return 'good' as const;
  if (status === 'partial') return 'warn' as const;
  return 'danger' as const;
}

export function ReportShell({
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
  return (
    <div className="space-y-6 pb-16">
      <section className="surface hero-mesh">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={report.status === 'production-ready' ? 'good' : 'warn'}>
            {report.statusLabel}
          </Badge>
          <Badge>{report.audienceLabel}</Badge>
          <Badge>{assetCode}</Badge>
        </div>

        <div className="mt-4 rounded-[20px] border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm leading-7 text-amber-100">
          {report.distributionNotice}
        </div>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="space-y-5">
            <div>
              <div className="eyebrow">Institutional Underwriting Output</div>
              <h1 className="mt-3 text-5xl font-semibold leading-[0.96] tracking-[-0.05em] text-white md:text-6xl">
                {report.title}
                <br />
                {assetName}
              </h1>
            </div>
            <p className="max-w-4xl text-base leading-8 text-slate-200">{report.heroSummary}</p>
          </div>

          <Card className="grid gap-4">
            <div className="eyebrow">Document Control</div>
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

      <section className="grid gap-4 md:grid-cols-4 xl:grid-cols-6">
        {report.heroFacts.map((fact) => (
          <div key={fact.label} className="metric-card">
            <div className="fine-print">{fact.label}</div>
            <div className="mt-3 text-2xl font-semibold text-white">{fact.value}</div>
            {fact.detail ? (
              <p className="mt-2 text-sm leading-7 text-slate-400">{fact.detail}</p>
            ) : null}
          </div>
        ))}
      </section>

      <section className="space-y-6">
        {report.sections.map((section) => (
          <Card key={section.id}>
            {section.kicker ? <div className="eyebrow">{section.kicker}</div> : null}
            <h2 className="mt-2 text-2xl font-semibold text-white">{section.title}</h2>

            {section.body?.length ? (
              <div className="mt-5 space-y-4">
                {section.body.map((paragraph) => (
                  <p key={paragraph} className="text-sm leading-8 text-slate-300">
                    {paragraph}
                  </p>
                ))}
              </div>
            ) : null}

            {section.facts?.length ? (
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {section.facts.map((fact) => (
                  <div
                    key={`${section.id}-${fact.label}`}
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
            ) : null}

            {section.bullets?.length ? (
              <ul className="mt-5 space-y-3 text-sm text-slate-300">
                {section.bullets.map((bullet) => (
                  <li
                    key={`${section.id}-${bullet}`}
                    className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3"
                  >
                    {bullet}
                  </li>
                ))}
              </ul>
            ) : null}

            {section.checklist?.length ? (
              <div className="mt-5 space-y-3">
                {section.checklist.map((item) => (
                  <div
                    key={`${section.id}-${item.label}`}
                    className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-white">{item.label}</div>
                      <Badge tone={checklistTone(item.status)}>{item.status}</Badge>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-slate-400">{item.detail}</p>
                    {item.sources?.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.sources.map((source) => (
                          <span
                            key={`${section.id}-${item.label}-${source}`}
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
            ) : null}
          </Card>
        ))}
      </section>

      <section className="grid gap-6 print-break xl:grid-cols-[1.02fr_0.98fr]">
        <Card>
          <div className="eyebrow">Document Schedule</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Versioned Support Pack</h2>
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm text-slate-300">
              <thead className="text-slate-500">
                <tr>
                  <th className="px-0 py-3 font-medium">Document</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Version</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                  <th className="px-4 py-3 font-medium">Hash</th>
                </tr>
              </thead>
              <tbody>
                {report.documents.map((document) => (
                  <tr key={document.id} className="border-t border-white/10 align-top">
                    <td className="px-0 py-4">
                      <div className="font-medium text-white">{document.title}</div>
                      {document.summary ? (
                        <div className="mt-1 text-xs leading-6 text-slate-400">
                          {document.summary}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">{document.documentType}</td>
                    <td className="px-4 py-4">v{document.currentVersion}</td>
                    <td className="px-4 py-4">{formatDate(document.updatedAt)}</td>
                    <td className="px-4 py-4">
                      <div>{document.hash ? document.hash.slice(0, 12) : 'N/A'}</div>
                      {document.anchoredTxHash ? (
                        <div className="mt-1 text-xs text-slate-400">
                          Anchor {document.anchoredTxHash.slice(0, 12)} /{' '}
                          {document.chainId ?? 'Unknown'}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <div className="eyebrow">Traceability</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Export Control And Integrity</h2>
          <div className="mt-5 space-y-3">
            {report.traceability.map((fact) => (
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

          <div className="mt-6 rounded-[20px] border border-accent/20 bg-accent/10 p-5">
            <div className="fine-print text-accent">Template Notes</div>
            <ul className="mt-3 space-y-2 text-sm leading-7 text-slate-200">
              {report.readinessNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        </Card>
      </section>

      <section>
        <Card>
          <div className="eyebrow">Control Sheet</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Report Control Record</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {report.controlSheet.map((fact) => (
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
