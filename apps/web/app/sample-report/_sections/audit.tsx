import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import type { SampleReportData } from './types';

export function AuditSection({ data }: { data: SampleReportData }) {
  const { auditTrail } = data;
  if (!(auditTrail.events.length > 0)) {
    return null;
  }
  return (
    <section id="im-audit" className="app-shell py-4">
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow">Audit trail</div>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Recent system events on the asset, valuation run, and counterparties. Establishes who
              touched the underwriting most recently — required for committee review of data lineage
              and for SOC-2 / fund-administrator review.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge>{auditTrail.totalCount} events total</Badge>
            {auditTrail.failureCount > 0 ? (
              <Badge tone="warn">{auditTrail.failureCount} non-success</Badge>
            ) : null}
          </div>
        </div>
        <div className="mt-3 text-[11px] text-slate-500">
          Last event: {auditTrail.lastEventAt ? formatDate(auditTrail.lastEventAt) : '—'} · Distinct
          actors:{' '}
          <span className="font-mono text-slate-300">{auditTrail.uniqueActors.join(', ')}</span>
        </div>
        <div className="mt-4 overflow-x-auto rounded-[14px] border border-white/10">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2 font-semibold">When</th>
                <th className="px-2 py-2 font-semibold">Actor</th>
                <th className="px-2 py-2 font-semibold">Action</th>
                <th className="px-2 py-2 font-semibold">Entity</th>
                <th className="px-2 py-2 text-right font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-slate-200">
              {auditTrail.events.map((e) => {
                const ok = /SUCCESS|OK/i.test(e.statusLabel);
                return (
                  <tr key={e.id}>
                    <td className="px-2 py-2 font-mono text-[10px] text-slate-400">
                      {formatDate(e.createdAt)}
                    </td>
                    <td className="px-2 py-2">
                      <div className="text-white">{e.actorIdentifier}</div>
                      <div className="text-[10px] text-slate-500">{e.actorRole}</div>
                    </td>
                    <td className="px-2 py-2 font-mono text-[11px] text-slate-300">{e.action}</td>
                    <td className="px-2 py-2 text-[11px] text-slate-400">{e.entityType}</td>
                    <td
                      className={`px-2 py-2 text-right font-mono text-[10px] ${
                        ok ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {e.statusLabel}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
