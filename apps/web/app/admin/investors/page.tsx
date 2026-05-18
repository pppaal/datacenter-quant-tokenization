import { Card } from '@/components/ui/card';
import { listInvestors, type InvestorRecord } from '@/lib/services/capital';
import { formatCurrency, formatNumber } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function InvestorsPage() {
  const investors: InvestorRecord[] = await listInvestors();

  return (
    <div className="space-y-8">
      <section className="surface hero-mesh">
        <div className="eyebrow">Investor Shell</div>
        <h1 className="mt-3 text-5xl font-semibold leading-[0.96] tracking-[-0.05em] text-white md:text-6xl">
          Investor relationships, commitments, and reporting history.
        </h1>
        <p className="mt-4 max-w-4xl text-base leading-8 text-slate-200">
          This page is the minimal institutional investor surface: commitments, recent reporting,
          and DDQ readiness.
        </p>
      </section>

      <div className="grid gap-5">
        {investors.map((investor) => {
          const commitmentKrw = investor.commitments.reduce(
            (total, item) => total + item.commitmentKrw,
            0
          );
          const calledKrw = investor.commitments.reduce((total, item) => total + item.calledKrw, 0);
          const distributedKrw = investor.commitments.reduce(
            (total, item) => total + item.distributedKrw,
            0
          );

          return (
            <Card key={investor.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xl font-semibold text-white">{investor.name}</div>
                  <div className="mt-2 text-sm text-slate-400">
                    {investor.investorType ?? 'Institutional investor'} /{' '}
                    {investor.domicile ?? 'KR'}
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <div className="fine-print">Commitment</div>
                    <div className="mt-2 text-sm text-white">{formatCurrency(commitmentKrw)}</div>
                  </div>
                  <div>
                    <div className="fine-print">Called</div>
                    <div className="mt-2 text-sm text-white">{formatCurrency(calledKrw)}</div>
                  </div>
                  <div>
                    <div className="fine-print">Distributed</div>
                    <div className="mt-2 text-sm text-white">{formatCurrency(distributedKrw)}</div>
                  </div>
                </div>
              </div>
              <div className="mt-4 text-sm text-slate-400">
                {formatNumber(investor.investorReports.length, 0)} recent reports /{' '}
                {formatNumber(investor.ddqResponses.length, 0)} DDQ responses
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
