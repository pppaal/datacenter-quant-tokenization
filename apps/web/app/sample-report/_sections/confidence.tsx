import { Card } from '@/components/ui/card';
import type { SampleReportData } from './types';

export function ConfidenceSection({ data }: { data: SampleReportData }) {
  const { confidenceBreakdown } = data;
  return (
    <section id="im-confidence" className="app-shell py-4">
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow">Confidence score breakdown</div>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Coverage-driven composite. Each external section, structured section, and anchor
              signal contributes; physical-risk signals subtract. Present (green) and absent (slate)
              signals are listed below — closing the absent ones lifts the score.
            </p>
          </div>
          <div className="rounded-[16px] border border-white/10 bg-white/[0.03] px-4 py-3 text-right">
            <div className="fine-print">Final score</div>
            <div className="mt-1 text-2xl font-semibold text-white">
              {confidenceBreakdown.finalScore.toFixed(1)}
              <span className="ml-1 text-sm font-normal text-slate-500">/ 10</span>
            </div>
            <div className="text-[10px] text-slate-500">
              {confidenceBreakdown.presentCount} / {confidenceBreakdown.totalCount} positive signals
              present
            </div>
          </div>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {(
            [
              'External sections',
              'Structured sections',
              'Geo & price anchors',
              'Risk penalties'
            ] as const
          ).map((group) => {
            const rows = confidenceBreakdown.signals.filter((s) => s.group === group);
            if (rows.length === 0) return null;
            return (
              <div
                key={group}
                className="rounded-[18px] border border-white/10 bg-white/[0.02] p-4"
              >
                <div className="fine-print">{group}</div>
                <ul className="mt-3 space-y-2 text-sm">
                  {rows.map((row) => {
                    const isPenalty = row.direction === 'subtract';
                    const dot = row.present
                      ? isPenalty
                        ? 'bg-rose-400'
                        : 'bg-emerald-400'
                      : 'bg-slate-700';
                    const sign = isPenalty ? '−' : '+';
                    return (
                      <li
                        key={row.label}
                        className="flex items-center justify-between gap-3 rounded-[12px] border border-white/5 bg-white/[0.015] px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
                          <span className="text-slate-200">{row.label}</span>
                        </div>
                        <span className="font-mono text-xs text-slate-400">
                          {row.present
                            ? `${sign}${row.weight.toFixed(2)} pts`
                            : isPenalty
                              ? '—'
                              : `+${row.weight.toFixed(2)} pts (missing)`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-[11px] text-slate-500">
          Per-signal weights are the data-center underwriting framework’s nominal contributions. The
          final score is clamped between 4.5 and 9.9 and adjusted by a credit overlay; the listed
          contributions are illustrative and do not reconcile exactly to the printed value.
        </p>
      </Card>
    </section>
  );
}
