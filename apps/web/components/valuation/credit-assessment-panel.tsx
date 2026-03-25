import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatCurrencyFromKrwAtRate, type SupportedCurrency } from '@/lib/finance/currency';
import { formatDate, formatNumber } from '@/lib/utils';

type CreditMetrics = {
  leverageMultiple?: number | null;
  debtToEquityRatio?: number | null;
  interestCoverage?: number | null;
  cashToDebtRatio?: number | null;
  currentRatio?: number | null;
  workingCapitalKrw?: number | null;
  operatingCashFlowToDebtRatio?: number | null;
  currentMaturityCoverage?: number | null;
};

type CreditAssessment = {
  id: string;
  assessmentType: string;
  score: number;
  riskLevel: string;
  summary: string;
  createdAt: Date | string;
  metrics: unknown;
  counterparty: {
    name: string;
    role: string;
  };
};

function toneForRisk(riskLevel: string) {
  if (riskLevel === 'LOW') return 'good' as const;
  if (riskLevel === 'HIGH') return 'warn' as const;
  return 'neutral' as const;
}

export function CreditAssessmentPanel({
  assessments,
  displayCurrency = 'KRW',
  fxRateToKrw
}: {
  assessments: CreditAssessment[];
  displayCurrency?: SupportedCurrency;
  fxRateToKrw?: number | null;
}) {
  if (assessments.length === 0) return null;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Credit View</div>
          <h3 className="mt-2 text-xl font-semibold text-white">Counterparty financial strength</h3>
        </div>
        <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Derived from uploaded financials</div>
      </div>

      <div className="mt-5 grid gap-4">
        {assessments.map((assessment) => {
          const metrics =
            typeof assessment.metrics === 'object' && assessment.metrics !== null
              ? (assessment.metrics as CreditMetrics)
              : {};

          return (
            <div key={assessment.id} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-semibold text-white">{assessment.counterparty.name}</div>
                  <div className="mt-1 text-sm text-slate-400">
                    {assessment.counterparty.role} / {assessment.assessmentType}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={toneForRisk(assessment.riskLevel)}>{assessment.riskLevel}</Badge>
                  <Badge>Score {formatNumber(assessment.score, 0)}</Badge>
                </div>
              </div>

              <p className="mt-4 text-sm leading-7 text-slate-300">{assessment.summary}</p>

              <div className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-[18px] border border-white/10 bg-slate-950/40 p-3">
                  <div className="fine-print">Leverage</div>
                  <div className="mt-2 text-white">
                    {metrics.leverageMultiple !== undefined && metrics.leverageMultiple !== null
                      ? `${formatNumber(metrics.leverageMultiple, 2)}x`
                      : 'N/A'}
                  </div>
                </div>
                <div className="rounded-[18px] border border-white/10 bg-slate-950/40 p-3">
                  <div className="fine-print">Debt / Equity</div>
                  <div className="mt-2 text-white">
                    {metrics.debtToEquityRatio !== undefined && metrics.debtToEquityRatio !== null
                      ? `${formatNumber(metrics.debtToEquityRatio, 2)}x`
                      : 'N/A'}
                  </div>
                </div>
                <div className="rounded-[18px] border border-white/10 bg-slate-950/40 p-3">
                  <div className="fine-print">Interest Coverage</div>
                  <div className="mt-2 text-white">
                    {metrics.interestCoverage !== undefined && metrics.interestCoverage !== null
                      ? `${formatNumber(metrics.interestCoverage, 2)}x`
                      : 'N/A'}
                  </div>
                </div>
                <div className="rounded-[18px] border border-white/10 bg-slate-950/40 p-3">
                  <div className="fine-print">Cash / Debt</div>
                  <div className="mt-2 text-white">
                    {metrics.cashToDebtRatio !== undefined && metrics.cashToDebtRatio !== null
                      ? `${formatNumber(metrics.cashToDebtRatio, 2)}x`
                      : 'N/A'}
                  </div>
                </div>
                <div className="rounded-[18px] border border-white/10 bg-slate-950/40 p-3">
                  <div className="fine-print">Current Ratio</div>
                  <div className="mt-2 text-white">
                    {metrics.currentRatio !== undefined && metrics.currentRatio !== null
                      ? `${formatNumber(metrics.currentRatio, 2)}x`
                      : 'N/A'}
                  </div>
                </div>
                <div className="rounded-[18px] border border-white/10 bg-slate-950/40 p-3">
                  <div className="fine-print">OCF / Debt</div>
                  <div className="mt-2 text-white">
                    {metrics.operatingCashFlowToDebtRatio !== undefined && metrics.operatingCashFlowToDebtRatio !== null
                      ? `${formatNumber(metrics.operatingCashFlowToDebtRatio, 2)}x`
                      : 'N/A'}
                  </div>
                </div>
                <div className="rounded-[18px] border border-white/10 bg-slate-950/40 p-3">
                  <div className="fine-print">Maturity Coverage</div>
                  <div className="mt-2 text-white">
                    {metrics.currentMaturityCoverage !== undefined && metrics.currentMaturityCoverage !== null
                      ? `${formatNumber(metrics.currentMaturityCoverage, 2)}x`
                      : 'N/A'}
                  </div>
                </div>
                <div className="rounded-[18px] border border-white/10 bg-slate-950/40 p-3">
                  <div className="fine-print">Working Capital</div>
                  <div className="mt-2 text-white">
                    {metrics.workingCapitalKrw !== undefined && metrics.workingCapitalKrw !== null
                      ? formatCurrencyFromKrwAtRate(metrics.workingCapitalKrw, displayCurrency, fxRateToKrw)
                      : 'N/A'}
                  </div>
                </div>
              </div>

              <div className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">
                Assessed {formatDate(assessment.createdAt)}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
