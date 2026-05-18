import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SponsorForms } from '@/components/admin/sponsor-form';
import { prisma } from '@/lib/db/prisma';
import { formatNumber } from '@/lib/utils';

export const dynamic = 'force-dynamic';

function formatPriceKrw(value: number | null) {
  if (value === null || value === undefined) return '—';
  if (value >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(2)}조`;
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(0)}억`;
  return formatNumber(value, 0);
}

export default async function SponsorsPage() {
  const sponsors = await prisma.sponsor.findMany({
    orderBy: { name: 'asc' },
    include: {
      priorDeals: {
        orderBy: [{ vintageYear: 'desc' }, { dealName: 'asc' }]
      }
    }
  });

  const totalDeals = sponsors.reduce((sum, s) => sum + s.priorDeals.length, 0);
  const sponsorsWithRecord = sponsors.filter((s) => s.priorDeals.length > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Sponsors</div>
          <h2 className="mt-2 text-3xl font-semibold text-white">Sponsor track record</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Manager-level track record library for the IM. The sample IM auto-links a card when
            <span className="mx-1 font-mono text-xs">Asset.sponsorName</span> case-insensitive
            matches a row here. LPs read sponsor track record next to deal returns to underwrite
            manager skill, not just the deal.
          </p>
        </div>
        <Link href="/admin">
          <Button variant="ghost">← Admin overview</Button>
        </Link>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="Sponsors" primary={formatNumber(sponsors.length, 0)} detail="In library" />
        <StatCard
          label="Sponsors with track record"
          primary={formatNumber(sponsorsWithRecord, 0)}
          detail={`${formatNumber(sponsors.length - sponsorsWithRecord, 0)} blank`}
        />
        <StatCard label="Prior deals" primary={formatNumber(totalDeals, 0)} detail="Aggregated" />
      </section>

      <SponsorForms sponsors={sponsors.map((s) => ({ id: s.id, name: s.name }))} />

      {sponsors.length === 0 ? (
        <Card>
          <div className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
            No sponsors yet. Add one above to start populating IM track-record cards.
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {sponsors.map((s) => {
            const closedDeals = s.priorDeals.filter((d) => d.status === 'EXITED');
            const multiples = closedDeals
              .map((d) => d.equityMultiple)
              .filter((v): v is number => typeof v === 'number');
            const irrs = closedDeals
              .map((d) => d.grossIrrPct)
              .filter((v): v is number => typeof v === 'number');
            const avgMultiple =
              multiples.length === 0
                ? null
                : multiples.reduce((sum, v) => sum + v, 0) / multiples.length;
            const avgIrr =
              irrs.length === 0 ? null : irrs.reduce((sum, v) => sum + v, 0) / irrs.length;

            return (
              <Card key={s.id} className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold text-white">{s.name}</h3>
                    <div className="mt-1 text-xs text-slate-500">
                      {s.hqMarket ? `${s.hqMarket} · ` : ''}
                      {s.yearFounded ? `founded ${s.yearFounded} · ` : ''}
                      {s.aumKrw ? `AUM ${formatPriceKrw(s.aumKrw)} KRW` : 'AUM unknown'}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {avgMultiple !== null ? (
                      <Badge tone="good">avg {avgMultiple.toFixed(2)}x</Badge>
                    ) : null}
                    {avgIrr !== null ? <Badge tone="good">avg IRR {avgIrr.toFixed(1)}%</Badge> : null}
                    <Badge>
                      {s.priorDeals.length} prior · {closedDeals.length} exited
                    </Badge>
                  </div>
                </div>
                {s.priorDeals.length === 0 ? (
                  <div className="rounded-[18px] border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-400">
                    No prior deals captured yet.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-[18px] border border-white/10">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-white/[0.04] text-left text-xs uppercase tracking-wide text-slate-500">
                          <th className="px-3 py-2 font-semibold">Deal</th>
                          <th className="px-3 py-2 font-semibold">Vintage</th>
                          <th className="px-3 py-2 font-semibold">Exit</th>
                          <th className="px-3 py-2 font-semibold">Class / market</th>
                          <th className="px-3 py-2 text-right font-semibold">Equity</th>
                          <th className="px-3 py-2 text-right font-semibold">Multiple</th>
                          <th className="px-3 py-2 text-right font-semibold">IRR</th>
                          <th className="px-3 py-2 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-slate-200">
                        {s.priorDeals.map((d) => (
                          <tr key={d.id}>
                            <td className="px-3 py-2 text-sm">{d.dealName}</td>
                            <td className="px-3 py-2 text-xs">{d.vintageYear}</td>
                            <td className="px-3 py-2 text-xs">{d.exitYear ?? '—'}</td>
                            <td className="px-3 py-2 text-xs text-slate-400">
                              {d.assetClass ?? '—'} / {d.market ?? '—'}
                            </td>
                            <td className="px-3 py-2 text-right text-xs">
                              {formatPriceKrw(d.equityKrw)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-xs">
                              {d.equityMultiple !== null && d.equityMultiple !== undefined
                                ? `${d.equityMultiple.toFixed(2)}x`
                                : '—'}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-xs">
                              {d.grossIrrPct !== null && d.grossIrrPct !== undefined
                                ? `${d.grossIrrPct.toFixed(1)}%`
                                : '—'}
                            </td>
                            <td className="px-3 py-2 text-xs">
                              <Badge tone={d.status === 'EXITED' ? 'good' : 'warn'}>
                                {d.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  primary,
  detail
}: {
  label: string;
  primary: string;
  detail: string;
}) {
  return (
    <Card className="space-y-2">
      <div className="fine-print">{label}</div>
      <div className="text-2xl font-semibold text-white">{primary}</div>
      <div className="text-xs text-slate-500">{detail}</div>
    </Card>
  );
}
