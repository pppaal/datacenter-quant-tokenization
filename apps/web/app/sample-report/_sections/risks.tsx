import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { SampleReportData } from './types';

export function RisksSection({ data }: { data: SampleReportData }) {
  const { latestRun } = data;
  if (!(latestRun.keyRisks.length > 0 || latestRun.ddChecklist.length > 0)) {
    return null;
  }
  return (
    <section id="im-risks" className="app-shell py-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {latestRun.keyRisks.length > 0 ? (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="eyebrow">Key risks</div>
              <Badge tone="warn">{latestRun.keyRisks.length}</Badge>
            </div>
            <p className="mt-2 text-sm text-slate-400">
              Outstanding underwriting risks. Each item requires committee discussion; unresolved
              risks reduce confidence and may shift the recommendation.
            </p>
            <ul className="mt-5 space-y-2">
              {latestRun.keyRisks.map((risk, idx) => (
                <li
                  key={`risk-${idx}`}
                  className="flex gap-3 rounded-[14px] border border-amber-300/20 bg-amber-300/[0.04] px-3 py-2 text-sm"
                >
                  <span
                    aria-hidden
                    className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-amber-300"
                  />
                  <span className="leading-6 text-slate-200">{risk}</span>
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
            <p className="mt-2 text-sm text-slate-400">
              Outstanding diligence items required to close. Items resolve as documents and
              structured inputs replace placeholders, lifting confidence toward investment-committee
              promotion.
            </p>
            <ul className="mt-5 space-y-2">
              {latestRun.ddChecklist.map((item, idx) => (
                <li
                  key={`dd-${idx}`}
                  className="flex gap-3 rounded-[14px] border border-white/5 bg-white/[0.02] px-3 py-2 text-sm"
                >
                  <span
                    aria-hidden
                    className="mt-1.5 inline-block h-3 w-3 shrink-0 rounded-[3px] border border-slate-500"
                  />
                  <span className="leading-6 text-slate-200">{item}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </section>
  );
}
