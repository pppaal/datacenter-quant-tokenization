import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatCompactCurrencyFromKrwAtRate, type SupportedCurrency } from '@/lib/finance/currency';
import type { AssetFinancialStatement } from '@/lib/services/financial-statements';
import { formatNumber, toSentenceCase } from '@/lib/utils';

type Props = {
  statements: AssetFinancialStatement[];
  displayCurrency?: SupportedCurrency;
  fxRateToKrw?: number | null;
};

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

function toNumber(value: { toString(): string } | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

function riskTone(riskLevel: string): 'good' | 'warn' | 'danger' | 'neutral' {
  if (riskLevel === 'LOW') return 'good';
  if (riskLevel === 'MODERATE') return 'warn';
  if (riskLevel === 'HIGH') return 'danger';
  return 'neutral';
}

function groupByCounterparty(statements: AssetFinancialStatement[]) {
  const groups = new Map<string, AssetFinancialStatement[]>();
  for (const statement of statements) {
    const existing = groups.get(statement.counterpartyId);
    if (existing) existing.push(statement);
    else groups.set(statement.counterpartyId, [statement]);
  }
  return Array.from(groups.values());
}

export function FinancialStatementsPanel({
  statements,
  displayCurrency = 'KRW',
  fxRateToKrw
}: Props) {
  const groups = groupByCounterparty(statements);
  const money = (value: { toString(): string } | number | null | undefined) =>
    formatCompactCurrencyFromKrwAtRate(toNumber(value), displayCurrency, fxRateToKrw);

  return (
    <Card data-testid="financial-statements-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Counterparty Financials</div>
          <h3 className="mt-2 text-2xl font-semibold text-white">
            Financial statements and credit screens
          </h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
            Tenant, sponsor, and lender financials ingested from the data room (and manual entry),
            normalized to {displayCurrency} with the latest credit assessment per statement.
          </p>
        </div>
        {statements.length > 0 ? (
          <Badge>
            {statements.length} statement{statements.length === 1 ? '' : 's'}
          </Badge>
        ) : null}
      </div>

      {statements.length === 0 ? (
        <div className="mt-5 rounded-[22px] border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">
          No financial statements ingested yet. Upload a counterparty financial document to the data
          room, or capture one manually — extracted statements and their credit screens will appear
          here automatically.
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {groups.map((group) => {
            const counterparty = group[0].counterparty;
            const latestAssessment = group
              .flatMap((statement) => statement.creditAssessments)
              .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

            return (
              <div
                key={counterparty.id}
                className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
                data-testid="financial-statements-counterparty"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-white">{counterparty.name}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">
                      {toSentenceCase(counterparty.role)}
                    </div>
                  </div>
                  {latestAssessment ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={riskTone(latestAssessment.riskLevel)}>
                        {latestAssessment.riskLevel} risk
                      </Badge>
                      <Badge tone="neutral">Score {formatNumber(latestAssessment.score, 0)}</Badge>
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 space-y-4">
                  {group.map((statement) => {
                    const metrics = (statement.creditAssessments[0]?.metrics ??
                      null) as CreditMetrics | null;
                    const headlineRows = (
                      [
                        ['Revenue', money(statement.revenueKrw)],
                        ['EBITDA', money(statement.ebitdaKrw)],
                        ['Cash', money(statement.cashKrw)],
                        ['Total Debt', money(statement.totalDebtKrw)],
                        ['Total Assets', money(statement.totalAssetsKrw)],
                        ['Total Equity', money(statement.totalEquityKrw)],
                        ['Interest Expense', money(statement.interestExpenseKrw)]
                      ] as Array<[string, string]>
                    ).filter(([, value]) => value !== 'N/A');

                    const creditRows: Array<[string, string]> = metrics
                      ? (
                          [
                            ['Leverage', metrics.leverageMultiple, 'x'],
                            ['Interest Coverage', metrics.interestCoverage, 'x'],
                            ['Debt / Equity', metrics.debtToEquityRatio, 'x'],
                            ['Current Ratio', metrics.currentRatio, 'x'],
                            ['Cash / Debt', metrics.cashToDebtRatio, 'x']
                          ] as Array<[string, number | null | undefined, string]>
                        )
                          .filter(([, value]) => value !== null && value !== undefined)
                          .map(([label, value, unit]): [string, string] => [
                            label,
                            `${formatNumber(value, 2)}${unit}`
                          ])
                      : [];

                    return (
                      <div
                        key={statement.id}
                        className="rounded-[20px] border border-white/10 bg-slate-950/40 p-4"
                        data-testid="financial-statement-row"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-white">
                            FY{statement.fiscalYear ?? '—'}
                            {statement.fiscalPeriod &&
                            !/^(FY|ANNUAL)$/i.test(statement.fiscalPeriod)
                              ? ` ${statement.fiscalPeriod}`
                              : ''}
                          </span>
                          <Badge tone="neutral">{toSentenceCase(statement.statementType)}</Badge>
                          <Badge tone="neutral">
                            {statement.sourceCurrency &&
                            statement.sourceCurrency !== statement.currency
                              ? `${statement.sourceCurrency} → ${statement.currency}`
                              : statement.currency}
                          </Badge>
                          {statement.provenanceSystem ? (
                            <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                              {statement.provenanceSystem}
                            </span>
                          ) : null}
                        </div>

                        {headlineRows.length > 0 ? (
                          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {headlineRows.map(([label, value]) => (
                              <div
                                key={label}
                                className="rounded-[16px] border border-white/10 bg-white/[0.03] px-4 py-3"
                              >
                                <div className="fine-print">{label}</div>
                                <div className="mt-2 text-base font-semibold text-white">
                                  {value}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}

                        {creditRows.length > 0 ? (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {creditRows.map(([label, value]) => (
                              <span
                                key={label}
                                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-300"
                              >
                                {label} {value}
                              </span>
                            ))}
                          </div>
                        ) : null}

                        {statement.lineItems.length > 0 ? (
                          <div className="mt-4 overflow-hidden rounded-[16px] border border-white/10">
                            <table className="w-full text-sm">
                              <tbody>
                                {statement.lineItems.map((lineItem) => (
                                  <tr
                                    key={lineItem.id}
                                    className="border-b border-white/5 last:border-0"
                                  >
                                    <td className="px-4 py-2 text-slate-300">
                                      {lineItem.lineLabel}
                                    </td>
                                    <td className="px-4 py-2 text-right font-mono text-slate-200">
                                      {money(lineItem.valueKrw)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : null}

                        {statement.creditAssessments[0]?.summary ? (
                          <p className="mt-4 text-sm leading-7 text-slate-400">
                            {statement.creditAssessments[0].summary}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
