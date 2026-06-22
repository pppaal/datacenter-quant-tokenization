import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import type { SampleReportData } from './types';

export function SideLettersSection({ data }: { data: SampleReportData }) {
  const { asset } = data;
  if (!(asset.sideLetters && asset.sideLetters.length > 0)) {
    return null;
  }
  return (
    <section id="im-side-letters" className="app-shell py-4">
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow">Side-letter terms</div>
            <p className="mt-2 max-w-3xl text-sm text-[hsl(var(--foreground-muted))]">
              LP-specific carve-outs from the LPA. Most-favored-nation entries propagate to every LP
              at or below the threshold; co-investment, fee, ESG and reporting terms apply per
              signing LP. The IM surfaces the register so the committee can confirm fund-economics
              consistency before close.
            </p>
          </div>
          <Badge>
            {asset.sideLetters.length} term
            {asset.sideLetters.length === 1 ? '' : 's'}
          </Badge>
        </div>
        <div className="mt-5 overflow-x-auto rounded-[14px] border border-[hsl(var(--border))]">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[hsl(var(--surface-hover))] text-left uppercase tracking-wide text-[hsl(var(--muted))]">
                <th className="px-2 py-2 font-semibold">LP</th>
                <th className="px-2 py-2 font-semibold">Category</th>
                <th className="px-2 py-2 font-semibold">Term</th>
                <th className="px-2 py-2 text-right font-semibold">Effective</th>
                <th className="px-2 py-2 text-right font-semibold">MFN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[hsl(var(--border))] text-[hsl(var(--foreground))]">
              {asset.sideLetters.map((sl) => (
                <tr key={sl.id}>
                  <td className="px-2 py-2">
                    <div className="text-[hsl(var(--foreground))]">{sl.lpName}</div>
                    {sl.lpEntityType ? (
                      <div className="text-[9px] text-[hsl(var(--muted))]">
                        {sl.lpEntityType.replace(/_/g, ' ').toLowerCase()}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-2 py-2">
                    <span className="rounded-[6px] border border-[hsl(var(--border))] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-[hsl(var(--foreground-muted))]">
                      {sl.termCategory.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-[11px] text-[hsl(var(--foreground-muted))]">
                    {sl.termSummary}
                    {sl.notes ? (
                      <div className="mt-0.5 text-[9px] text-[hsl(var(--muted))]">{sl.notes}</div>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-[hsl(var(--foreground-muted))]">
                    {sl.effectiveFrom ? formatDate(sl.effectiveFrom) : '—'}
                  </td>
                  <td className="px-2 py-2 text-right text-[10px]">
                    {sl.mfnEligible ? (
                      <span className="font-mono text-[hsl(var(--success))]">MFN-eligible</span>
                    ) : (
                      <span className="text-[hsl(var(--muted))]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
