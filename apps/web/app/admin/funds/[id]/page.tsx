import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { AdminAccessScopeType } from '@prisma/client';
import { InvestorReportReleasePanel } from '@/components/admin/investor-report-release-panel';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { canActorAccessScope } from '@/lib/security/admin-access';
import { prisma } from '@/lib/db/prisma';
import { resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';
import { buildFundDashboard, buildFundOperatorBriefs, getFundById } from '@/lib/services/capital';
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function FundDetailPage({ params }: Props) {
  const { id } = await params;
  const actor = await resolveVerifiedAdminActorFromHeaders(await headers(), prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  const canAccessFund = await canActorAccessScope(actor, AdminAccessScopeType.FUND, id, prisma);
  if (!canAccessFund) notFound();
  const fund = await getFundById(id);
  if (!fund) notFound();

  const dashboard = buildFundDashboard(fund);
  const briefs = buildFundOperatorBriefs(fund, dashboard);

  return (
    <div className="space-y-8">
      <section className="surface hero-mesh">
        <div className="flex flex-wrap items-center gap-3">
          <div className="eyebrow">Fund Shell</div>
          <Badge>{fund.code}</Badge>
          {fund.strategy ? <Badge tone="neutral">{fund.strategy}</Badge> : null}
        </div>
        <h1 className="mt-3 text-5xl font-semibold leading-[0.96] tracking-[-0.05em] text-white md:text-6xl">
          {fund.name}
        </h1>
        <p className="mt-4 max-w-4xl text-base leading-8 text-slate-200">{dashboard.investorUpdateDraft}</p>
      </section>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <div className="fine-print">Commitments</div>
          <div className="mt-3 text-3xl font-semibold text-white">{formatCurrency(dashboard.math.totalCommitmentKrw)}</div>
        </Card>
        <Card>
          <div className="fine-print">Called</div>
          <div className="mt-3 text-3xl font-semibold text-white">{formatCurrency(dashboard.math.totalCalledKrw)}</div>
        </Card>
        <Card>
          <div className="fine-print">Distributed</div>
          <div className="mt-3 text-3xl font-semibold text-white">{formatCurrency(dashboard.math.totalDistributedKrw)}</div>
        </Card>
        <Card>
          <div className="fine-print">Dry Powder</div>
          <div className="mt-3 text-3xl font-semibold text-white">{formatCurrency(dashboard.math.dryPowderKrw)}</div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <div className="eyebrow">AI Operator Brief</div>
          <div className="mt-4 space-y-4">
            <div>
              <div className="fine-print">Capital Activity Summary</div>
              <p className="mt-2 text-sm leading-7 text-slate-300">{briefs.capitalActivityBrief}</p>
            </div>
            <div>
              <div className="fine-print">Investor Coverage Summary</div>
              <p className="mt-2 text-sm leading-7 text-slate-300">{briefs.investorCoverageBrief}</p>
            </div>
            <div>
              <div className="fine-print">Report Release Summary</div>
              <p className="mt-2 text-sm leading-7 text-slate-300">{briefs.reportReleaseBrief}</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="eyebrow">Investor Update Draft</div>
          <p className="mt-4 text-sm leading-7 text-slate-300">{briefs.investorUpdateDraft}</p>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <div className="eyebrow">Top Investors</div>
          <div className="mt-4 space-y-3">
            {dashboard.topInvestors.map((commitment) => (
              <div key={commitment.id} className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-white">{commitment.investor.name}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {commitment.investor.investorType ?? 'Institutional investor'}
                    </div>
                  </div>
                  <div className="text-right text-sm text-white">
                    <div>{formatCurrency(commitment.commitmentKrw)}</div>
                    <div>called {formatCurrency(commitment.calledKrw)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="eyebrow">Vehicles And Mandates</div>
          <div className="mt-4 space-y-3">
            {fund.vehicles.map((vehicle) => (
              <div key={vehicle.id} className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-white">{vehicle.name}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {vehicle.vehicleType.toLowerCase()} / {vehicle.assetClassFocus ?? 'multi-asset'}
                    </div>
                  </div>
                  <div className="text-right text-sm text-white">{vehicle.jurisdiction ?? 'KR'}</div>
                </div>
              </div>
            ))}
            {fund.mandates.map((mandate) => (
              <div key={mandate.id} className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
                <div className="text-sm font-semibold text-white">{mandate.title}</div>
                <div className="mt-1 text-xs text-slate-400">
                  {mandate.investorName ?? 'Institutional mandate'} / {mandate.statusLabel}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <div className="eyebrow">Capital Calls And Distributions</div>
          <div className="mt-4 space-y-3">
            {fund.capitalCalls.map((call) => (
              <div key={call.id} className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-white">Capital Call</div>
                    <div className="mt-1 text-xs text-slate-400">{formatDate(call.callDate)} / {call.status.toLowerCase()}</div>
                  </div>
                  <div className="text-right text-sm text-white">{formatCurrency(call.amountKrw)}</div>
                </div>
              </div>
            ))}
            {fund.distributions.map((distribution) => (
              <div key={distribution.id} className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-white">Distribution</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {formatDate(distribution.distributionDate)} / {distribution.status.toLowerCase()}
                    </div>
                  </div>
                  <div className="text-right text-sm text-white">{formatCurrency(distribution.amountKrw)}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <InvestorReportReleasePanel reports={fund.investorReports} />
      </div>

      <Card>
          <div className="eyebrow">Investor Reporting And DDQ</div>
          <div className="mt-4 space-y-3">
            {fund.investorReports.map((report) => (
              <div key={report.id} className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold text-white">{report.title}</div>
                  <Badge tone={report.releaseStatus === 'RELEASED' ? 'good' : report.releaseStatus === 'READY' ? 'warn' : 'neutral'}>
                    {report.releaseStatus.toLowerCase().replaceAll('_', ' ')}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  {report.reportType.toLowerCase().replaceAll('_', ' ')} / {report.periodEnd ? formatDate(report.periodEnd) : 'period pending'}
                </div>
                {report.draftSummary ? <div className="mt-2 text-xs leading-6 text-slate-400">{report.draftSummary}</div> : null}
              </div>
            ))}
            {fund.ddqResponses.map((ddq) => (
              <div key={ddq.id} className="rounded-[20px] border border-white/[0.03] p-4">
                <div className="text-sm font-semibold text-white">{ddq.title}</div>
                <div className="mt-1 text-xs text-slate-400">{ddq.statusLabel}</div>
              </div>
            ))}
          </div>
      </Card>
    </div>
  );
}
