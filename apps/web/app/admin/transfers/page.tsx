import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { KeyValueRow } from '@/components/ui/key-value-row';
import { prisma } from '@/lib/db/prisma';
import { shortenHash } from '@/lib/blockchain/registry';
import { formatDate } from '@/lib/utils';
import { statusTone } from '@/lib/ui/status-tone';

export const dynamic = 'force-dynamic';

function tone(status: string) {
  return statusTone(
    status,
    { SETTLED: 'good', REJECTED: 'danger', CANCELLED: 'danger', EXPIRED: 'danger' },
    'warn'
  );
}

export default async function TransfersPage() {
  const tickets = await prisma.transferTicket.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="eyebrow">OTC transfers</div>
        <h2 className="mt-2 text-3xl font-semibold text-white">Pre-cleared share transfers</h2>
        <p className="mt-2 text-sm text-slate-400">
          Broker-dealers open a ticket; issuers approve or reject after KYC + accreditation review;
          settlement pulls shares via{' '}
          <code className="ml-1 rounded bg-white/5 px-1.5 py-0.5">TransferAgent.settle</code>, which
          calls{' '}
          <code className="mx-1 rounded bg-white/5 px-1.5 py-0.5">AssetToken.forceTransfer</code>.
          Open a new ticket via
          <code className="ml-1 rounded bg-white/5 px-1.5 py-0.5">
            POST /api/tokenization/transfers
          </code>
          with <code>action: "open"</code>.
        </p>
      </div>

      {tickets.length === 0 ? (
        <Card>
          <div className="text-sm text-slate-300">
            No transfer tickets yet. Once an operator opens one it will appear here with pending
            issuer approval.
          </div>
        </Card>
      ) : (
        <div className="grid gap-4">
          {tickets.map((t) => (
            <Card key={t.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-white">
                    Ticket #{t.ticketId}
                    <span className="ml-2 text-sm font-normal text-slate-400">
                      opened {formatDate(t.createdAt)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    agent {shortenHash(t.transferAgentAddress)} / token{' '}
                    {shortenHash(t.tokenAddress)}
                  </div>
                </div>
                <Badge tone={tone(t.status)}>{t.status}</Badge>
              </div>
              <dl className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-3">
                <KeyValueRow label="Seller">{shortenHash(t.sellerAddress)}</KeyValueRow>
                <KeyValueRow label="Buyer">{shortenHash(t.buyerAddress)}</KeyValueRow>
                <KeyValueRow label="Shares">{t.shareAmount}</KeyValueRow>
                <KeyValueRow label="Quote">
                  {t.quotePrice} {t.quoteAssetSymbol}
                </KeyValueRow>
                <KeyValueRow label="RFQ ref">{shortenHash(t.rfqRef, 8)}</KeyValueRow>
                <KeyValueRow label="Expires">
                  {t.expiresAt ? formatDate(t.expiresAt) : '—'}
                </KeyValueRow>
                <KeyValueRow label="Opened by">{t.openedBy}</KeyValueRow>
                <KeyValueRow label="Decided by">{t.decidedBy ?? '—'}</KeyValueRow>
                <KeyValueRow label="Settle tx">
                  {t.settledTxHash ? shortenHash(t.settledTxHash) : '—'}
                </KeyValueRow>
              </dl>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
