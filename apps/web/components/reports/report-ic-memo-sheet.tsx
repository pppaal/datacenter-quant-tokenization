import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { DealReport, ReportFact, ReportSection } from '@/lib/services/reports';

function findSection(report: DealReport, id: string) {
  return report.sections.find((section) => section.id === id);
}

function renderFactGrid(facts: ReportFact[] | undefined, keyPrefix: string, columns = 'md:grid-cols-2 xl:grid-cols-3') {
  if (!facts?.length) return null;
  return (
    <div className={`grid gap-4 ${columns}`}>
      {facts.map((fact) => (
        <div key={`${keyPrefix}-${fact.label}`} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
          <div className="fine-print">{fact.label}</div>
          <div className="mt-3 text-lg font-semibold text-white">{fact.value}</div>
          {fact.detail ? <p className="mt-2 text-sm leading-7 text-slate-400">{fact.detail}</p> : null}
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

function renderBullets(section: ReportSection | undefined, tone: 'neutral' | 'warn' = 'neutral') {
  if (!section?.bullets?.length) return null;
  return (
    <ul className="space-y-3">
      {section.bullets.map((bullet) => (
        <li
          key={bullet}
          className={[
            'rounded-[18px] border px-4 py-3 text-sm leading-7',
            tone === 'warn'
              ? 'border-amber-500/20 bg-amber-500/10 text-amber-100'
              : 'border-white/10 bg-white/[0.03] text-slate-300'
          ].join(' ')}
        >
          {bullet}
        </li>
      ))}
    </ul>
  );
}

export function ReportIcMemoSheet({
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
  const transaction = findSection(report, 'transaction');
  const valuation = findSection(report, 'valuation');
  const cashflow = findSection(report, 'cashflow');
  const diligence = findSection(report, 'diligence');
  const decision = findSection(report, 'decision-request');

  const heroFacts = report.heroFacts.slice(0, 6);
  const traceability = report.traceability.slice(0, 4);
  const controlFacts = report.controlSheet.slice(0, 6);
  const evidenceDocs = report.documents.slice(0, 6);

  return (
    <div className="report-ic-sheet space-y-6 pb-16">
      <section className="surface hero-mesh report-ic-hero">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={report.status === 'production-ready' ? 'good' : 'warn'}>{report.statusLabel}</Badge>
          <Badge>{report.audienceLabel}</Badge>
          <Badge>{assetCode}</Badge>
        </div>

        <div className="mt-4 rounded-[20px] border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm leading-7 text-amber-100">
          {report.distributionNotice}
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-5">
            <div>
              <div className="eyebrow">Investment Committee Draft</div>
              <h1 className="mt-3 text-5xl font-semibold leading-[0.96] tracking-[-0.05em] text-white md:text-6xl">
                {assetName}
              </h1>
              <p className="mt-3 text-base font-medium text-accent">{report.title}</p>
            </div>
            <p className="max-w-4xl text-base leading-8 text-slate-200">{report.heroSummary}</p>
          </div>

          <Card className="grid gap-4">
            <div className="eyebrow">{decision?.kicker ?? 'Decision Request'}</div>
            <h2 className="text-2xl font-semibold text-white">{decision?.title ?? 'Committee Posture'}</h2>
            {renderBody(decision)}
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

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {heroFacts.map((fact) => (
          <div key={fact.label} className="metric-card">
            <div className="fine-print">{fact.label}</div>
            <div className="mt-3 text-2xl font-semibold text-white">{fact.value}</div>
            {fact.detail ? <p className="mt-2 text-sm leading-7 text-slate-400">{fact.detail}</p> : null}
          </div>
        ))}
      </section>

      <section className="report-export-appendix grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <Card>
          <div className="eyebrow">{transaction?.kicker ?? 'Transaction Context'}</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">{transaction?.title ?? 'Why This Deal Is On The Table'}</h2>
          <div className="mt-5">{renderBody(transaction)}</div>
          {transaction?.bullets?.length ? (
            <div className="mt-5">
              <div className="fine-print">Current distress markers</div>
              <div className="mt-3">{renderBullets(transaction, 'warn')}</div>
            </div>
          ) : null}
        </Card>

        <Card>
          <div className="eyebrow">{valuation?.kicker ?? 'Valuation'}</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">{valuation?.title ?? 'Underwriting And Downside Frame'}</h2>
          <div className="mt-5">{renderFactGrid(valuation?.facts, 'valuation')}</div>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <div className="eyebrow">{cashflow?.kicker ?? 'Cash Flow'}</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">{cashflow?.title ?? 'Opening-Year Cash Flow And Capital Stack'}</h2>
          <div className="mt-5">{renderFactGrid(cashflow?.facts, 'cashflow')}</div>
          {cashflow?.bullets?.length ? (
            <div className="mt-5">
              <div className="fine-print">Capital stack notes</div>
              <div className="mt-3">{renderBullets(cashflow)}</div>
            </div>
          ) : null}
        </Card>

        <Card>
          <div className="eyebrow">{diligence?.kicker ?? 'Diligence'}</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">{diligence?.title ?? 'Coverage And Gating Items'}</h2>
          <div className="mt-5">{renderFactGrid(diligence?.facts, 'diligence')}</div>
          {diligence?.bullets?.length ? (
            <div className="mt-5">
              <div className="fine-print">Current gating items</div>
              <div className="mt-3">{renderBullets(diligence, 'warn')}</div>
            </div>
          ) : null}
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <Card>
          <div className="eyebrow">Evidence Pack</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Linked Support Documents</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {evidenceDocs.map((document) => (
              <div key={document.id} className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-4">
                <div className="text-sm font-semibold text-white">{document.title}</div>
                <div className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                  {document.documentType} / v{document.currentVersion}
                </div>
                <p className="report-export-doc-summary mt-3 text-sm leading-7 text-slate-400">
                  {document.summary ?? 'No document summary is currently stored.'}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="eyebrow">Traceability</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Control And Integrity</h2>
          <div className="mt-5 space-y-3">
            {traceability.map((fact) => (
              <div key={fact.label} className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-4">
                <div className="fine-print">{fact.label}</div>
                <div className="mt-2 text-lg font-semibold text-white">{fact.value}</div>
                {fact.detail ? <p className="mt-2 text-sm leading-7 text-slate-400">{fact.detail}</p> : null}
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
          <div className="mt-5">{renderFactGrid(controlFacts, 'control')}</div>
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
