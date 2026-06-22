import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatNumber } from '@/lib/utils';
import type { SampleReportData } from './types';

export function SponsorSection({ data }: { data: SampleReportData }) {
  const { sponsorTrack } = data;
  if (!sponsorTrack) {
    return null;
  }
  return (
    <section id="im-sponsor" className="app-shell py-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="eyebrow">Sponsor track record</div>
            <p className="mt-2 text-sm text-[hsl(var(--foreground-muted))]">
              {sponsorTrack.name}
              {sponsorTrack.hqMarket ? ` · ${sponsorTrack.hqMarket}` : ''}
              {sponsorTrack.yearFounded ? ` · founded ${sponsorTrack.yearFounded}` : ''}
              {sponsorTrack.aumKrw
                ? ` · AUM ${formatNumber(sponsorTrack.aumKrw / 1_000_000_000_000, 2)}조 KRW`
                : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {sponsorTrack.averageEquityMultiple !== null ? (
              <Badge tone="good">
                {sponsorTrack.averageWeightingBasis === 'capital' ? 'pooled' : 'avg'}{' '}
                {sponsorTrack.averageEquityMultiple.toFixed(2)}x
              </Badge>
            ) : null}
            {sponsorTrack.averageGrossIrrPct !== null ? (
              <Badge tone="good">
                {sponsorTrack.averageWeightingBasis === 'capital' ? 'pooled' : 'avg'} IRR{' '}
                {sponsorTrack.averageGrossIrrPct.toFixed(1)}%
              </Badge>
            ) : null}
            <Badge>{sponsorTrack.priorDealCount} prior</Badge>
            {sponsorTrack.oldestVintage ? (
              <Badge>
                {sponsorTrack.oldestVintage}–{sponsorTrack.newestVintage} vintage
              </Badge>
            ) : null}
          </div>
        </div>
        {sponsorTrack.recentDeals.length === 0 ? (
          <div className="mt-5 rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--surface-hover))] p-4 text-sm text-[hsl(var(--foreground-muted))]">
            Sponsor on file but no prior deals captured yet — populate the track record on{' '}
            <span className="font-mono text-xs">/admin/sponsors</span>.
          </div>
        ) : (
          <div className="mt-5 overflow-hidden rounded-[18px] border border-[hsl(var(--border))]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[hsl(var(--surface-hover))] text-left text-xs uppercase tracking-wide text-[hsl(var(--muted))]">
                  <th className="px-3 py-2 font-semibold">Deal</th>
                  <th className="px-3 py-2 font-semibold">Vintage</th>
                  <th className="px-3 py-2 font-semibold">Class / market</th>
                  <th className="px-3 py-2 text-right font-semibold">Multiple</th>
                  <th className="px-3 py-2 text-right font-semibold">IRR</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[hsl(var(--border))] text-[hsl(var(--foreground))]">
                {sponsorTrack.recentDeals.map((d) => (
                  <tr key={d.id}>
                    <td className="px-3 py-2 text-sm">{d.dealName}</td>
                    <td className="px-3 py-2 text-xs">
                      {d.vintageYear}
                      {d.exitYear ? ` → ${d.exitYear}` : ''}
                    </td>
                    <td className="px-3 py-2 text-xs text-[hsl(var(--foreground-muted))]">
                      {d.assetClass ?? '—'} / {d.market ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {d.equityMultiple !== null ? `${d.equityMultiple.toFixed(2)}x` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {d.grossIrrPct !== null ? `${d.grossIrrPct.toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <Badge tone={d.status === 'EXITED' ? 'good' : 'warn'}>{d.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {sponsorTrack.averageWeightingBasis ? (
          <p className="mt-3 text-[11px] leading-4 text-[hsl(var(--muted))]">
            Headline multiple / IRR are over exited deals only,{' '}
            {sponsorTrack.averageWeightingBasis === 'capital'
              ? 'capital-weighted (pooled) by each deal’s committed equity.'
              : 'equal-weighted (no per-deal equity captured to pool by).'}{' '}
            Self-reported track record — not independently verified.
          </p>
        ) : null}
      </Card>
    </section>
  );
}
