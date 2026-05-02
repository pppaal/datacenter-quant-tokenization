import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TenantDemandForm } from '@/components/admin/tenant-demand-form';
import { prisma } from '@/lib/db/prisma';
import { formatDate, formatNumber } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const STATUS_TONES: Record<string, 'good' | 'warn' | 'danger'> = {
  ACTIVE: 'good',
  SIGNED: 'good',
  WITHDRAWN: 'danger',
  STALLED: 'warn'
};

export default async function TenantDemandPage() {
  const rows = await prisma.tenantDemand.findMany({
    orderBy: [{ status: 'asc' }, { observedAt: 'desc' }],
    include: { recordedBy: { select: { name: true, email: true } } }
  });

  const activeCount = rows.filter((r) => r.status === 'ACTIVE').length;
  const totalSqmActive = rows
    .filter((r) => r.status === 'ACTIVE' && typeof r.targetSizeSqm === 'number')
    .reduce((sum, r) => sum + (r.targetSizeSqm ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Research</div>
          <h2 className="mt-2 text-3xl font-semibold text-white">Tenant in the market</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Named tenant requirements captured from leasing brokers. CBRE / JLL maintain this list
            as a private signal — having our own keeps the forward rent / vacancy view honest.
            Active requirements feed the workspace's downstream conviction signals.
          </p>
        </div>
        <Link href="/admin/research">
          <Button variant="ghost">← Research workspace</Button>
        </Link>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Total requirements"
          primary={formatNumber(rows.length, 0)}
          detail={`${formatNumber(activeCount, 0)} ACTIVE`}
        />
        <StatCard
          label="Active sqm in market"
          primary={`${formatNumber(totalSqmActive, 0)} sqm`}
          detail="Sum of targetSizeSqm across ACTIVE rows"
        />
        <StatCard
          label="Distinct tenants"
          primary={formatNumber(new Set(rows.map((r) => r.tenantName)).size, 0)}
          detail="By tenantName"
        />
      </section>

      <TenantDemandForm />

      <Card className="space-y-4">
        <div>
          <div className="eyebrow">Live + historical record</div>
          <p className="mt-1 text-sm text-slate-400">
            Sorted by status (ACTIVE first), then most recently observed. Use the status column to
            filter post-deal: a SIGNED requirement is the leading indicator of net absorption.
          </p>
        </div>
        {rows.length === 0 ? (
          <div className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
            No tenant requirements recorded yet. Use the form above to capture one from your last
            leasing-broker call.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[18px] border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/[0.04] text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-semibold">Tenant</th>
                  <th className="px-3 py-2 font-semibold">Submarket</th>
                  <th className="px-3 py-2 font-semibold">Class / tier</th>
                  <th className="px-3 py-2 text-right font-semibold">Size sqm</th>
                  <th className="px-3 py-2 font-semibold">Move-in</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Source</th>
                  <th className="px-3 py-2 font-semibold">Recorded</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-200">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2 text-sm font-semibold">{row.tenantName}</td>
                    <td className="px-3 py-2 text-xs text-slate-400">
                      {row.market}/{row.region ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {row.assetClass ?? '—'} / {row.assetTier ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      {row.targetSizeSqm ? formatNumber(row.targetSizeSqm, 0) : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-400">
                      {row.targetMoveInDate ? formatDate(row.targetMoveInDate) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={STATUS_TONES[row.status] ?? 'warn'}>{row.status}</Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-400">{row.source ?? '—'}</td>
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
