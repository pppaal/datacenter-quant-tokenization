import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { prisma } from '@/lib/db/prisma';
import { shortenHash } from '@/lib/blockchain/registry';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

function tone(status: string): 'good' | 'warn' | 'danger' {
  switch (status) {
    case 'FUNDED':
      return 'good';
    case 'RECLAIMED':
      return 'danger';
    default:
      return 'warn';
  }
}

export default async function DistributionsPage() {
  const distributions = await prisma.tokenDistribution.findMany({
    include: {
      allocations: { select: { id: true, claimedAt: true, amount: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: 50
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="eyebrow">Distributions</div>
        <h2 className="mt-2 text-3xl font-semibold text-white">
          Dividend &amp; coupon distributions
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Pull-based payouts via on-chain DividendDistributor. Operators draft a distribution from a
          balance snapshot, fund it on-chain, and serve per-holder proofs from
          <code className="ml-1 rounded bg-white/5 px-1.5 py-0.5">
            /api/tokenization/distributions/&lt;id&gt;/proofs/&lt;holder&gt;
          </code>
          .
        </p>
      </div>

      {distributions.length === 0 ? (
        <Card>
          <div className="text-sm text-slate-300">
            No distributions recorded yet. Use
            <code className="mx-1 rounded bg-white/5 px-1.5 py-0.5">
              POST /api/tokenization/distributions
            </code>
            with <code>action: "draft"</code> to scaffold one.
          </div>
        </Card>
      ) : (
        <div className="grid gap-4">
          {distributions.map((d) => {
            const claimed = d.allocations.filter((a) => a.claimedAt !== null).length;
            return (
              <Card key={d.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-white">
                      Distribution #{d.distId}
                      <span className="ml-2 text-sm font-normal text-slate-400">
                        record {formatDate(d.recordDate)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      distributor {shortenHash(d.distributorAddress)} / quote{' '}
                      {shortenHash(d.quoteAssetAddress)}
                    </div>
                  </div>
                  <Badge tone={tone(d.status)}>{d.status}</Badge>
                </div>
                <dl className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-3">
                  <Row label="Total amount">{d.totalAmount}</Row>
                  <Row label="Allocations">
                    {claimed}/{d.allocations.length} claimed
                  </Row>
                  <Row label="Reclaim after">{formatDate(d.reclaimAfter)}</Row>
                  <Row label="Merkle root">{shortenHash(d.merkleRoot, 8)}</Row>
                  <Row label="Funding tx">{d.txHash ? shortenHash(d.txHash) : '—'}</Row>
                  <Row label="Created">{formatDate(d.createdAt)}</Row>
                </dl>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[18px] border border-white/10 bg-white/[0.03] p-3">
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 font-mono text-xs text-slate-200">{children}</dd>
    </div>
  );
}
