import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { listInvestors, type InvestorRecord } from '@/lib/services/capital';
import {
  buildInvestorComplianceView,
  type InvestorComplianceView
} from '@/lib/services/aml/investor-compliance-view';
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const REASON_LABELS: Record<string, string> = {
  KYC_NOT_APPROVED: 'KYC not approved',
  SANCTIONS_BLOCKED: 'Sanctions/PEP block',
  NOT_SCREENED: 'Not screened',
  NOT_ACCREDITED: 'Not accredited'
};

export default async function InvestorsPage() {
  const investors: InvestorRecord[] = await listInvestors();
  const compliance = new Map<string, InvestorComplianceView | null>(
    await Promise.all(
      investors.map(
        async (investor) => [investor.id, await buildInvestorComplianceView(investor.id)] as const
      )
    )
  );

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

              {(() => {
                const view = compliance.get(investor.id) ?? null;
                if (!view) return null;
                const elig = view.eligibility;
                return (
                  <div className="mt-5 rounded-[20px] border border-white/10 bg-white/[0.02] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="eyebrow">AML / Compliance</div>
                      <Badge
                        tone={elig.eligible ? 'good' : 'danger'}
                        label={elig.eligible ? 'Eligible' : 'Blocked'}
                      />
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-4">
                      <div>
                        <div className="fine-print">KYC</div>
                        <div className="mt-1 text-sm text-white">{view.kycStatus ?? 'Unknown'}</div>
                      </div>
                      <div>
                        <div className="fine-print">Screening</div>
                        <div className="mt-1 text-sm text-white">
                          {view.screening
                            ? `${view.screening.status}${view.screening.isPep ? ' / PEP' : ''}`
                            : 'Not screened'}
                        </div>
                        {view.screening?.rescreenDueAt ? (
                          <div
                            className={
                              view.screening.rescreenOverdue
                                ? 'mt-1 text-xs text-rose-300'
                                : 'mt-1 text-xs text-slate-400'
                            }
                          >
                            Re-screen {view.screening.rescreenOverdue ? 'overdue' : 'due'}{' '}
                            {formatDate(view.screening.rescreenDueAt)}
                          </div>
                        ) : null}
                      </div>
                      <div>
                        <div className="fine-print">AML Risk</div>
                        <div className="mt-1 text-sm text-white">
                          {view.riskRating
                            ? `${view.riskRating.rating} (${view.riskRating.score})`
                            : 'Unrated'}
                        </div>
                      </div>
                      <div>
                        <div className="fine-print">Accreditation</div>
                        <div className="mt-1 text-sm text-white">
                          {view.accreditationStatus ?? 'Unassessed'}
                        </div>
                      </div>
                    </div>
                    {!elig.eligible && elig.reasons.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {elig.reasons.map((reason) => (
                          <Badge
                            key={reason}
                            tone="danger"
                            label={REASON_LABELS[reason] ?? reason}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })()}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
