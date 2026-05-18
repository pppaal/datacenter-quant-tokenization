import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DealFlowForm } from '@/components/admin/deal-flow-form';
import { prisma } from '@/lib/db/prisma';
import { formatDate, formatNumber } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const STATUS_TONES: Record<string, 'good' | 'warn' | 'danger'> = {
  LIVE: 'good',
  CLOSED: 'good',
  WITHDRAWN: 'warn',
  LOST: 'danger'
};

function formatPriceKrw(value: number | null) {
  if (value === null) return '—';
  if (value >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(2)}조`;
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(0)}억`;
  return formatNumber(value, 0);
}

export default async function DealFlowPage() {
  const rows = await prisma.dealFlowEntry.findMany({
    orderBy: [{ status: 'asc' }, { observedAt: 'desc' }],
    include: { recordedBy: { select: { name: true, email: true } } }
  });

  const liveCount = rows.filter((r) => r.status === 'LIVE').length;
  const totalLiveSizeKrw = rows
    .filter((r) => r.status === 'LIVE' && typeof r.estimatedSizeKrw === 'number')
    .reduce((sum, r) => sum + (r.estimatedSizeKrw ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Research</div>
          <h2 className="mt-2 text-3xl font-semibold text-white">Deal flow log</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Proprietary log of deals seen in the market — sale processes, refis, JVs, recaps,
            developments. Distinct from our own pipeline (the Deal table). The signal here is what
            REB / MOLIT can&apos;t see: capital being deployed by everyone else, sponsor mix
            shifts, cap-rate clearing levels disclosed by closed comps.
          </p>
        </div>
        <Link href="/admin/research">
          <Button variant="ghost">← Research workspace</Button>
        </Link>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Total entries"
          primary={formatNumber(rows.length, 0)}
          detail={`${formatNumber(liveCount, 0)} LIVE`}
        />
        <StatCard
          label="Live deal size (est.)"
          primary={formatPriceKrw(totalLiveSizeKrw)}
          detail="Sum of estimatedSizeKrw across LIVE rows"
        />
        <StatCard
          label="Distinct sponsors"
          primary={formatNumber(
            new Set(rows.map((r) => r.sponsor).filter(Boolean)).size,
            0
          )}
          detail="By sponsor name"
        />
      </section>

      <DealFlowForm />

      <Card className="space-y-4">
        <div>
          <div className="eyebrow">Deal flow log</div>
          <p className="mt-1 text-sm text-slate-400">
            LIVE deals first, then most recently observed. Use the filter URL pattern (e.g.
            <code className="mx-1 rounded bg-white/5 px-1.5 py-0.5">?market=KR&amp;dealType=SALE</code>)
            to narrow — this initial cut renders all rows.
          </p>
        </div>
        {rows.length === 0 ? (
          <div className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
            No deal flow logged yet. Use the form above to capture a deal you saw in the market.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[18px] border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/[0.04] text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-semibold">Asset</th>
                  <th className="px-3 py-2 font-semibold">Submarket</th>
                  <th className="px-3 py-2 font-semibold">Class / tier</th>
                  <th className="px-3 py-2 font-semibold">Type</th>
                  <th className="px-3 py-2 text-right font-semibold">Size</th>
                  <th className="px-3 py-2 text-right font-semibold">Cap %</th>
                  <th className="px-3 py-2 font-semibold">Sponsor</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Source</th>
                  <th className="px-3 py-2 font-semibold">Observed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-200">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2 text-sm font-semibold">{row.assetName ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-slate-400">
                      {row.market}/{row.region ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {row.assetClass ?? '—'} / {row.assetTier ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-xs">{row.dealType}</td>
                    <td className="px-3 py-2 text-right text-xs">
                      {formatPriceKrw(row.estimatedSizeKrw)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {row.estimatedCapPct !== null && row.estimatedCapPct !== undefined
                        ? `${row.estimatedCapPct.toFixed(2)}%`
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs">{row.sponsor ?? '—'}</td>
                    <td className="px-3 py-2">
                      <Badge tone={STATUS_TONES[row.status] ?? 'warn'}>{row.status}</Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-400">
                      {row.brokerSource ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">
                      {formatDate(row.observedAt)} ·{' '}
                      {row.recordedBy?.name ?? row.recordedBy?.email ?? 'system'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
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
