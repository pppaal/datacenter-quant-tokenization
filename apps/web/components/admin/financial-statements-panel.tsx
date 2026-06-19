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

type RatioTone = 'good' | 'warn' | 'danger' | 'neutral';
type KrRatio = { label: string; value: string; tone: RatioTone };

const RATIO_CHIP_CLASS: Record<RatioTone, string> = {
  good: 'border-[hsl(var(--success)/0.25)] bg-[hsl(var(--success-tint))] text-[hsl(var(--success))]',
  warn: 'border-[hsl(var(--warning)/0.25)] bg-[hsl(var(--warning-tint))] text-[hsl(var(--warning))]',
  danger: 'border-[hsl(var(--danger)/0.25)] bg-[hsl(var(--danger-tint))] text-[hsl(var(--danger))]',
  neutral: 'border-border bg-[hsl(var(--panel-alt))] text-[hsl(var(--foreground-muted))]'
};

/**
 * KR-convention credit ratios derived from the persisted statement headline
 * figures (no extra data). 부채비율 is the Korean primary leverage gauge on a
 * TOTAL-liabilities basis (총부채 = 총자산 − 자기자본); thresholds follow the
 * KR institutional bands (100% / 200% / 400%).
 */
type StatementFigures = {
  revenueKrw: { toString(): string } | number | null;
  ebitdaKrw: { toString(): string } | number | null;
  cashKrw: { toString(): string } | number | null;
  totalDebtKrw: { toString(): string } | number | null;
  totalAssetsKrw: { toString(): string } | number | null;
  totalEquityKrw: { toString(): string } | number | null;
  currentAssetsKrw?: { toString(): string } | number | null;
  currentLiabilitiesKrw?: { toString(): string } | number | null;
  currentDebtMaturitiesKrw?: { toString(): string } | number | null;
  operatingCashFlowKrw?: { toString(): string } | number | null;
  operatingIncomeKrw?: { toString(): string } | number | null;
  netIncomeKrw?: { toString(): string } | number | null;
  interestExpenseKrw?: { toString(): string } | number | null;
};

function buildKrRatios(statement: StatementFigures): KrRatio[] {
  const revenue = toNumber(statement.revenueKrw);
  const ebitda = toNumber(statement.ebitdaKrw);
  const cash = toNumber(statement.cashKrw) ?? 0;
  const debt = toNumber(statement.totalDebtKrw);
  const assets = toNumber(statement.totalAssetsKrw);
  const equity = toNumber(statement.totalEquityKrw);
  const currentAssets = toNumber(statement.currentAssetsKrw ?? null);
  const currentLiabilities = toNumber(statement.currentLiabilitiesKrw ?? null);
  const currentMaturities = toNumber(statement.currentDebtMaturitiesKrw ?? null);
  const ocf = toNumber(statement.operatingCashFlowKrw ?? null);
  const operatingIncome = toNumber(statement.operatingIncomeKrw ?? null);
  const netIncome = toNumber(statement.netIncomeKrw ?? null);
  const interest = toNumber(statement.interestExpenseKrw ?? null);
  const rows: KrRatio[] = [];

  if (assets != null && equity != null && equity > 0) {
    const debtRatioPct = ((assets - equity) / equity) * 100; // 부채비율 (총부채/자기자본)
    const tone: RatioTone =
      debtRatioPct >= 400
        ? 'danger'
        : debtRatioPct >= 200
          ? 'warn'
          : debtRatioPct < 100
            ? 'good'
            : 'neutral';
    rows.push({ label: '부채비율', value: `${formatNumber(debtRatioPct, 0)}%`, tone });
  }
  if (assets != null && assets > 0 && equity != null) {
    const equityRatioPct = (equity / assets) * 100; // 자기자본비율
    const tone: RatioTone =
      equityRatioPct < 10
        ? 'danger'
        : equityRatioPct < 20
          ? 'warn'
          : equityRatioPct >= 30
            ? 'good'
            : 'neutral';
    rows.push({ label: '자기자본비율', value: `${formatNumber(equityRatioPct, 0)}%`, tone });
  }
  if (debt != null && ebitda != null && ebitda > 0) {
    const netLev = (debt - cash) / ebitda;
    const tone: RatioTone =
      netLev > 6 ? 'danger' : netLev > 4 ? 'warn' : netLev <= 3 ? 'good' : 'neutral';
    rows.push({ label: 'Net Leverage', value: `${formatNumber(netLev, 1)}x`, tone });
  }
  if (revenue != null && revenue > 0 && ebitda != null) {
    const marginPct = (ebitda / revenue) * 100;
    const tone: RatioTone = marginPct < 5 ? 'warn' : marginPct >= 15 ? 'good' : 'neutral';
    rows.push({ label: 'EBITDA Margin', value: `${formatNumber(marginPct, 0)}%`, tone });
  }
  if (currentAssets != null && currentLiabilities != null && currentLiabilities > 0) {
    const cr = currentAssets / currentLiabilities; // 유동비율
    const tone: RatioTone = cr < 1 ? 'danger' : cr < 1.5 ? 'warn' : 'good';
    rows.push({ label: '유동비율', value: `${formatNumber(cr, 1)}x`, tone });
  }
  if (ocf != null && debt != null && debt > 0) {
    const ocfToDebtPct = (ocf / debt) * 100;
    const tone: RatioTone = ocfToDebtPct < 5 ? 'danger' : ocfToDebtPct >= 25 ? 'good' : 'neutral';
    rows.push({ label: 'OCF / Debt', value: `${formatNumber(ocfToDebtPct, 0)}%`, tone });
  }
  if (currentMaturities != null && currentMaturities > 0) {
    const coverage = (cash + (ocf ?? 0)) / currentMaturities;
    const tone: RatioTone = coverage < 1 ? 'danger' : coverage < 1.5 ? 'warn' : 'good';
    rows.push({ label: 'Maturity Coverage', value: `${formatNumber(coverage, 1)}x`, tone });
  }
  if (operatingIncome != null && interest != null && interest > 0) {
    const icr = operatingIncome / interest; // 이자보상배율 (EBIT/이자) — <1.0x = 한계기업 신호
    const tone: RatioTone = icr < 1 ? 'danger' : icr < 3 ? 'warn' : icr >= 5 ? 'good' : 'neutral';
    rows.push({ label: '이자보상배율', value: `${formatNumber(icr, 1)}x`, tone });
  }
  if (operatingIncome != null && revenue != null && revenue > 0) {
    const marginPct = (operatingIncome / revenue) * 100; // 영업이익률
    const tone: RatioTone = marginPct < 2 ? 'danger' : marginPct >= 15 ? 'good' : 'neutral';
    rows.push({ label: '영업이익률', value: `${formatNumber(marginPct, 0)}%`, tone });
  }
  if (netIncome != null && assets != null && assets > 0) {
    const roaPct = (netIncome / assets) * 100;
    const tone: RatioTone = roaPct < 0 ? 'danger' : roaPct >= 7 ? 'good' : 'neutral';
    rows.push({ label: 'ROA', value: `${formatNumber(roaPct, 1)}%`, tone });
  }
  return rows;
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
                      {latestAssessment.grade ? (
                        <Badge tone={latestAssessment.investmentGrade ? 'good' : 'warn'}>
                          {latestAssessment.grade}
                          {latestAssessment.pdPct != null
                            ? ` · PD ${formatNumber(latestAssessment.pdPct, 2)}%`
                            : ''}
                          {latestAssessment.investmentGrade ? ' · IG' : ''}
                        </Badge>
                      ) : null}
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

                    const krRatios = buildKrRatios(statement);

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

                        {krRatios.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {krRatios.map((ratio) => (
                              <span
                                key={ratio.label}
                                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${RATIO_CHIP_CLASS[ratio.tone]}`}
                              >
                                {ratio.label} {ratio.value}
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
