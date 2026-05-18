import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { prisma } from '@/lib/db/prisma';
import { shortenHash } from '@/lib/blockchain/registry';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

function statusTone(status: string): 'good' | 'warn' | 'danger' {
  switch (status) {
    case 'APPROVED':
      return 'good';
    case 'REJECTED':
    case 'REVOKED':
      return 'danger';
    default:
      return 'warn';
  }
}

export default async function IdentityPage() {
  const records = await prisma.kycRecord.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="eyebrow">Identity</div>
        <h2 className="mt-2 text-3xl font-semibold text-white">KYC records &amp; chain bridging</h2>
        <p className="mt-2 text-sm text-slate-400">
          Off-chain KYC records ingested via provider webhooks. Approved records can be bridged into
          the on-chain IdentityRegistry per tokenized asset using
          <code className="mx-1 rounded bg-white/5 px-1.5 py-0.5">POST /api/kyc/bridge</code>.
          Rejected and revoked records remove the wallet from any registry where it was previously
          allow-listed.
        </p>
      </div>

      {records.length === 0 ? (
        <Card>
          <div className="text-sm text-slate-300">
            No KYC records yet. POST test events to
            <code className="mx-1 rounded bg-white/5 px-1.5 py-0.5">/api/kyc/webhook/mock</code>
            with <code>KYC_MOCK_SKIP_SIG=1</code> set for local runs.
          </div>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-slate-300">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2 text-left">Provider</th>
                  <th className="px-2 py-2 text-left">Wallet</th>
                  <th className="px-2 py-2 text-left">Country</th>
                  <th className="px-2 py-2 text-left">Status</th>
                  <th className="px-2 py-2 text-left">Bridged</th>
                  <th className="px-2 py-2 text-left">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {records.map((r) => (
                  <tr key={r.id}>
                    <td className="px-2 py-2 font-mono text-xs">{r.provider}</td>
                    <td className="px-2 py-2 font-mono text-xs">{shortenHash(r.wallet)}</td>
                    <td className="px-2 py-2">{r.countryCode}</td>
                    <td className="px-2 py-2">
                      <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                    </td>
                    <td className="px-2 py-2 font-mono text-xs">
                      {r.bridgedTxHash ? shortenHash(r.bridgedTxHash) : '—'}
                    </td>
                    <td className="px-2 py-2 text-xs text-slate-500">{formatDate(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
