import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { DealReport, ReportFact, ReportSection } from '@/lib/services/reports';

function findSection(report: DealReport, id: string) {
  return report.sections.find((section) => section.id === id);
}

function renderFactCard(fact: ReportFact, key: string) {
  return (
    <div
      key={key}
      className="rounded-[22px] border border-[hsl(var(--border))] bg-[hsl(var(--surface-hover))] p-4"
    >
      <div className="fine-print">{fact.label}</div>
      <div className="mt-3 text-lg font-semibold text-[hsl(var(--foreground))]">{fact.value}</div>
      {fact.detail ? (
        <p className="mt-2 text-sm leading-7 text-[hsl(var(--foreground-muted))]">{fact.detail}</p>
      ) : null}
    </div>
  );
}

function renderBody(section: ReportSection | undefined) {
  if (!section?.body?.length) return null;
  return (
    <div className="space-y-3">
      {section.body.map((paragraph) => (
        <p key={paragraph} className="text-sm leading-8 text-[hsl(var(--foreground-muted))]">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

function renderBulletList(
  section: ReportSection | undefined,
  tone: 'neutral' | 'danger' = 'neutral'
) {
  if (!section?.bullets?.length) return null;
  return (
    <ul className="space-y-3">
      {section.bullets.map((bullet) => (
        <li
          key={bullet}
          className={[
            'rounded-[18px] border px-4 py-3 text-sm leading-7',
            tone === 'danger'
              ? 'border-[hsl(var(--danger)/0.25)] bg-[hsl(var(--danger-tint))] text-[hsl(var(--danger))]'
              : 'border-[hsl(var(--border))] bg-[hsl(var(--surface-hover))] text-[hsl(var(--foreground-muted))]'
          ].join(' ')}
        >
          {bullet}
        </li>
      ))}
    </ul>
  );
}

export function ReportTeaserSheet({
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
  const situation = findSection(report, 'situation');
  const snapshot = findSection(report, 'snapshot');
  const materials = findSection(report, 'materials');
  const process = findSection(report, 'process');
  const risks = findSection(report, 'risks');

  const leadFacts = report.heroFacts.slice(0, 4);
  const pricingFacts = snapshot?.facts?.slice(0, 6) ?? [];
  const supportPack = report.documents.slice(0, 4);
  const traceability = report.traceability.slice(0, 3);
  const controlFacts = report.controlSheet.slice(0, 4);

  return (
    <div className="report-teaser-sheet space-y-5 pb-16">
      <section className="surface hero-mesh report-teaser-hero">
        <div className="flex flex-wrap items-center gap-3">
          <Badge>{report.audienceLabel}</Badge>
          <Badge>{assetCode}</Badge>
          <Badge>{locationLabel}</Badge>
        </div>

        <div className="mt-4 rounded-[20px] border border-[hsl(var(--warning)/0.25)] bg-[hsl(var(--warning-tint))] px-4 py-3 text-sm leading-7 text-[hsl(var(--warning))]">
          {report.distributionNotice}
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
          <div className="space-y-5">
            <div>
              <div className="eyebrow">Institutional One-Page Teaser</div>
              <h1 className="mt-3 text-5xl font-semibold leading-[0.96] tracking-[-0.05em] text-[hsl(var(--foreground))] md:text-6xl">
                {assetName}
              </h1>
              <p className="mt-3 text-base font-medium text-accent">{report.title}</p>
            </div>
            <p className="max-w-4xl text-base leading-8 text-[hsl(var(--foreground))]">
              {report.heroSummary}
            </p>
          </div>

          <Card className="grid gap-3">
            <div className="eyebrow">Process Control</div>
            <div className="grid gap-3 text-sm text-[hsl(var(--foreground-muted))]">
              <div className="flex items-center justify-between rounded-[20px] border border-[hsl(var(--border))] bg-[hsl(var(--surface-hover))] px-4 py-3">
                <span>Asset</span>
                <span>{assetName}</span>
              </div>
              <div className="flex items-center justify-between rounded-[20px] border border-[hsl(var(--border))] bg-[hsl(var(--surface-hover))] px-4 py-3">
                <span>Location</span>
                <span>{locationLabel}</span>
              </div>
              <div className="flex items-center justify-between rounded-[20px] border border-[hsl(var(--border))] bg-[hsl(var(--surface-hover))] px-4 py-3">
                <span>Generated</span>
                <span>{report.generatedAtLabel}</span>
              </div>
              <div className="flex items-center justify-between rounded-[20px] border border-[hsl(var(--border))] bg-[hsl(var(--surface-hover))] px-4 py-3">
                <span>Version</span>
                <span>{report.versionLabel}</span>
              </div>
            </div>
          </Card>
        </div>
      </section>

      <section className="report-teaser-summary grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {leadFacts.map((fact) => renderFactCard(fact, `hero-${fact.label}`))}
      </section>

      <section className="report-teaser-block grid gap-5 xl:grid-cols-[1.04fr_0.96fr]">
        <Card>
          <div className="eyebrow">{situation?.kicker ?? 'Situation'}</div>
          <h2 className="mt-2 text-2xl font-semibold text-[hsl(var(--foreground))]">
            {situation?.title ?? 'Opportunity Frame'}
          </h2>
          <div className="mt-5">{renderBody(situation)}</div>
          {situation?.bullets?.length ? (
            <div className="mt-5">
              <div className="fine-print">Current opportunity context</div>
              <div className="mt-3">{renderBulletList(situation)}</div>
            </div>
          ) : null}
        </Card>

        <Card>
          <div className="eyebrow">{snapshot?.kicker ?? 'Snapshot'}</div>
          <h2 className="mt-2 text-2xl font-semibold text-[hsl(var(--foreground))]">
            {snapshot?.title ?? 'Asset And Pricing Snapshot'}
          </h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {pricingFacts.map((fact) => renderFactCard(fact, `snapshot-${fact.label}`))}
          </div>
        </Card>
      </section>

      <section className="report-teaser-block grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <div className="eyebrow">{process?.kicker ?? 'Process'}</div>
          <h2 className="mt-2 text-2xl font-semibold text-[hsl(var(--foreground))]">
            {process?.title ?? 'Current Process Position'}
          </h2>
          <div className="mt-5">{renderBulletList(process)}</div>
        </Card>

        <Card>
          <div className="eyebrow">{risks?.kicker ?? 'Key Flags'}</div>
          <h2 className="mt-2 text-2xl font-semibold text-[hsl(var(--foreground))]">
            {risks?.title ?? 'Primary Risks'}
          </h2>
          <div className="mt-5">{renderBulletList(risks, 'danger')}</div>
        </Card>
      </section>

      <section className="report-teaser-block grid gap-5 xl:grid-cols-[1.04fr_0.96fr]">
        <Card>
          <div className="eyebrow">{materials?.kicker ?? 'Materials'}</div>
          <h2 className="mt-2 text-2xl font-semibold text-[hsl(var(--foreground))]">
            {materials?.title ?? 'Data Room Excerpt'}
          </h2>
          <div className="mt-5 space-y-3">
            {materials?.bullets?.length ? (
              materials.bullets.map((bullet) => (
                <div
                  key={bullet}
                  className="rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--surface-hover))] px-4 py-3 text-sm leading-7 text-[hsl(var(--foreground-muted))]"
                >
                  {bullet}
                </div>
              ))
            ) : (
              <div className="rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--surface-hover))] px-4 py-3 text-sm text-[hsl(var(--foreground-muted))]">
                No data room excerpt is available yet.
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="eyebrow">Support Pack</div>
          <h2 className="mt-2 text-2xl font-semibold text-[hsl(var(--foreground))]">
            Versioned Documents And Integrity
          </h2>
          <div className="mt-5 space-y-3">
            {supportPack.map((document) => (
              <div
                key={document.id}
                className="rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--surface-hover))] px-4 py-4"
              >
                <div className="text-sm font-semibold text-[hsl(var(--foreground))]">
                  {document.title}
                </div>
                <div className="mt-2 text-xs uppercase tracking-[0.16em] text-[hsl(var(--muted))]">
                  {document.documentType} / v{document.currentVersion}
                </div>
                <p className="report-teaser-doc-summary mt-3 text-sm leading-7 text-[hsl(var(--foreground-muted))]">
                  {document.summary ?? 'No document summary is currently stored.'}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="report-teaser-block report-export-appendix grid gap-5 xl:grid-cols-[0.98fr_1.02fr]">
        <Card>
          <div className="eyebrow">Traceability</div>
          <h2 className="mt-2 text-2xl font-semibold text-[hsl(var(--foreground))]">
            Control And Audit Trail
          </h2>
          <div className="mt-5 space-y-3">
            {traceability.map((fact) => (
              <div
                key={fact.label}
                className="rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--surface-hover))] px-4 py-4"
              >
                <div className="fine-print">{fact.label}</div>
                <div className="mt-2 text-lg font-semibold text-[hsl(var(--foreground))]">
                  {fact.value}
                </div>
                {fact.detail ? (
                  <p className="mt-2 text-sm leading-7 text-[hsl(var(--foreground-muted))]">
                    {fact.detail}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="eyebrow">Control Sheet</div>
          <h2 className="mt-2 text-2xl font-semibold text-[hsl(var(--foreground))]">
            Distribution Controls
          </h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {controlFacts.map((fact) => renderFactCard(fact, `control-${fact.label}`))}
          </div>
          <div className="mt-6 rounded-[20px] border border-[hsl(var(--warning)/0.25)] bg-[hsl(var(--warning-tint))] p-5">
            <div className="fine-print text-[hsl(var(--warning))]">Distribution Note</div>
            <p className="mt-3 text-sm leading-7 text-[hsl(var(--warning))]">
              {report.footerNotice}
            </p>
          </div>
        </Card>
      </section>

      <section className="report-teaser-footer rounded-[20px] border border-[hsl(var(--border))] bg-[hsl(var(--surface-hover))] px-5 py-4">
        <div className="grid gap-3 text-xs uppercase tracking-[0.16em] text-[hsl(var(--muted))] md:grid-cols-[1.2fr_0.8fr_1fr]">
          <div>
            {report.versionLabel}
            <span className="ml-2 text-[hsl(var(--foreground-muted))]">
              Generated {report.generatedAtLabel}
            </span>
          </div>
          <div>{assetCode}</div>
          <div className="md:text-right">{report.footerNotice}</div>
        </div>
      </section>
    </div>
  );
}
