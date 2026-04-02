import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { buildFundDashboard, listFunds, type FundDashboard, type FundRecord } from '@/lib/services/capital';
import { formatCurrency, formatNumber } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function FundsPage() {
  const funds = await listFunds();
  const rows: Array<{ fund: FundRecord; dashboard: FundDashboard }> = funds.map((fund) => ({
    fund,
    dashboard: buildFundDashboard(fund)
  }));

  return (
    <div className="space-y-8">
      <section className="surface hero-mesh">
        <div className="eyebrow">Capital OS Shell</div>
        <h1 className="mt-3 text-5xl font-semibold leading-[0.96] tracking-[-0.05em] text-white md:text-6xl">
          Funds, vehicles, commitments, and reporting shells for an investment firm.
        </h1>
        <p className="mt-4 max-w-4xl text-base leading-8 text-slate-200">
          This is not a retail capital surface. It is the first institutional data model for commitments, calls,
          distributions, investor reporting, and DDQ responses.
        </p>
      </section>

      <div className="grid gap-5">
        {rows.map(({ fund, dashboard }) => (
          <Link key={fund.id} href={`/admin/funds/${fund.id}`} className="block">
            <Card className="transition hover:border-white/20 hover:bg-white/[0.05]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="text-2xl font-semibold text-white">{fund.name}</div>
                    <Badge>{fund.code}</Badge>
                    {fund.strategy ? <Badge tone="neutral">{fund.strategy}</Badge> : null}
                  </div>
                  <p className="mt-3 text-sm leading-7 text-slate-300">{dashboard.investorUpdateDraft}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <div className="fine-print">Commitments</div>
                    <div className="mt-2 text-sm text-white">{formatCurrency(dashboard.math.totalCommitmentKrw)}</div>
                  </div>
                  <div>
                    <div className="fine-print">Called</div>
                    <div className="mt-2 text-sm text-white">{formatCurrency(dashboard.math.totalCalledKrw)}</div>
                  </div>
                  <div>
                    <div className="fine-print">Distributed</div>
                    <div className="mt-2 text-sm text-white">{formatCurrency(dashboard.math.totalDistributedKrw)}</div>
                  </div>
                  <div>
                    <div className="fine-print">Investors</div>
                    <div className="mt-2 text-sm text-white">{formatNumber(fund.commitments.length, 0)}</div>
                  </div>
                </div>
              </div>
            </Card>
          </Link>
        ))}

        {rows.length === 0 ? (
          <Card>
            <div className="eyebrow">No Fund Shell Yet</div>
            <h2 className="mt-3 text-2xl font-semibold text-white">Seed or connect a capital structure</h2>
            <p className="mt-3 text-sm leading-7 text-slate-400">
              Capital OS starts with fund, vehicle, investor, commitment, call, distribution, and reporting shells.
            </p>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
