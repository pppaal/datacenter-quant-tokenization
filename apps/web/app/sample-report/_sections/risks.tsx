import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { classifyRisks, inferRiskCategory } from '@/lib/services/im/risk-classify';
import type { SampleReportData } from './types';

export function RisksSection({ data }: { data: SampleReportData }) {
  const { latestRun } = data;
  if (!(latestRun.keyRisks.length > 0 || latestRun.ddChecklist.length > 0)) {
    return null;
  }
  const classifiedRisks = classifyRisks(latestRun.keyRisks);
  const highCount = classifiedRisks.filter((r) => r.severity === 'High').length;
  return (
    <section id="im-risks" className="app-shell py-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {classifiedRisks.length > 0 ? (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="eyebrow">Key risk register</div>
              <div className="flex items-center gap-2">
                {highCount > 0 ? <Badge tone="danger">{highCount} high</Badge> : null}
                <Badge tone="warn">{classifiedRisks.length} total</Badge>
              </div>
            </div>
            <p className="mt-2 text-sm text-[hsl(var(--foreground-muted))]">
              Outstanding underwriting risks, severity-ranked. Severity and category are inferred
              from the model’s risk language — confirm against diligence before committee sign-off.
            </p>
            <ul className="mt-5 space-y-2">
              {classifiedRisks.map((risk, idx) => (
                <li
                  key={`risk-${idx}`}
                  className="rounded-[14px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={risk.tone}>{risk.severity}</Badge>
                    <span className="text-[11px] uppercase tracking-[0.16em] text-[hsl(var(--muted))]">
                      {risk.category}
                    </span>
                  </div>
                  <span className="mt-2 block leading-6 text-[hsl(var(--foreground))]">
                    {risk.text}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {latestRun.ddChecklist.length > 0 ? (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="eyebrow">Due diligence checklist</div>
              <Badge>{latestRun.ddChecklist.length} open</Badge>
            </div>
            <p className="mt-2 text-sm text-[hsl(var(--foreground-muted))]">
              Outstanding diligence items required to close, tagged by discipline (inferred). Items
              resolve as documents and structured inputs replace placeholders, lifting confidence
              toward investment-committee promotion.
            </p>
            <ul className="mt-5 space-y-2">
              {latestRun.ddChecklist.map((item, idx) => (
                <li
                  key={`dd-${idx}`}
                  className="flex gap-3 rounded-[14px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-3 py-2 text-sm"
                >
                  <span
                    aria-hidden
                    className="mt-1.5 inline-block h-3 w-3 shrink-0 rounded-[3px] border border-slate-500"
                  />
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-[hsl(var(--muted))]">
                      {inferRiskCategory(item)}
                    </div>
                    <span className="leading-6 text-[hsl(var(--foreground))]">{item}</span>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </section>
  );
}
