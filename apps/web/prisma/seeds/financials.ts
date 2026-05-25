import type { Prisma, PrismaClient } from '@prisma/client';
import {
  buildCreditAssessmentFromStatement,
  type ParsedFinancialStatement
} from '../../lib/services/financial-statements';

export type CounterpartyFinancialSpec = {
  name: string;
  role: 'TENANT' | 'SPONSOR' | 'LENDER';
  baseRevenueKrw: number;
  revenueGrowthPct: number;
  ebitdaMarginPct: number;
  baseTotalDebtKrw: number;
  debtDeleveragePctPerYear: number;
  interestRatePct: number;
  baseCashKrw: number;
  baseTotalEquityKrw: number;
  equityGrowthPctPerYear: number;
};

const round = (value: number) => Math.round(value);
const grow = (rate: number, years: number) => Math.pow(1 + rate / 100, years);

/**
 * Deterministically builds a counterparty's multi-year financial history
 * oldest-first. Pure (no DB / no clock beyond the supplied ending year) so
 * it can be unit-tested and reused by the seeder.
 */
export function buildCounterpartyStatements(
  spec: CounterpartyFinancialSpec,
  options: { years: number; endingFiscalYear: number }
): ParsedFinancialStatement[] {
  const { years, endingFiscalYear } = options;
  const startYear = endingFiscalYear - (years - 1);

  return Array.from({ length: years }, (_, i) => {
    const fiscalYear = startYear + i;
    const revenue = round(spec.baseRevenueKrw * grow(spec.revenueGrowthPct, i));
    const ebitda = round(revenue * (spec.ebitdaMarginPct / 100));
    const operatingCashFlow = round(ebitda * 0.85);
    const capex = round(revenue * 0.08);
    const cash = round(spec.baseCashKrw * grow(5, i));
    const totalDebt = round(
      spec.baseTotalDebtKrw * Math.pow(1 - spec.debtDeleveragePctPerYear / 100, i)
    );
    const interestExpense = round(totalDebt * (spec.interestRatePct / 100));
    const currentAssets = round(revenue * 0.4 + cash);
    const currentLiabilities = round(revenue * 0.22);
    const currentDebtMaturities = round(totalDebt * 0.1);
    const totalEquity = round(spec.baseTotalEquityKrw * grow(spec.equityGrowthPctPerYear, i));
    const totalAssets = round(totalDebt + totalEquity + currentAssets);

    const lineItems = [
      { lineKey: 'revenueKrw', lineLabel: 'Revenue', valueKrw: revenue },
      { lineKey: 'ebitdaKrw', lineLabel: 'EBITDA', valueKrw: ebitda },
      {
        lineKey: 'operatingCashFlowKrw',
        lineLabel: 'Operating Cash Flow',
        valueKrw: operatingCashFlow
      },
      { lineKey: 'capexKrw', lineLabel: 'Capex', valueKrw: capex },
      { lineKey: 'cashKrw', lineLabel: 'Cash', valueKrw: cash },
      { lineKey: 'totalDebtKrw', lineLabel: 'Total Debt', valueKrw: totalDebt },
      { lineKey: 'currentAssetsKrw', lineLabel: 'Current Assets', valueKrw: currentAssets },
      {
        lineKey: 'currentLiabilitiesKrw',
        lineLabel: 'Current Liabilities',
        valueKrw: currentLiabilities
      },
      { lineKey: 'totalAssetsKrw', lineLabel: 'Total Assets', valueKrw: totalAssets },
      { lineKey: 'totalEquityKrw', lineLabel: 'Total Equity', valueKrw: totalEquity },
      { lineKey: 'interestExpenseKrw', lineLabel: 'Interest Expense', valueKrw: interestExpense }
    ];

    return {
      counterpartyName: spec.name,
      counterpartyRole: spec.role,
      statementType: 'ANNUAL',
      fiscalYear,
      fiscalPeriod: 'FY',
      currency: 'KRW',
      revenueKrw: revenue,
      ebitdaKrw: ebitda,
      cashKrw: cash,
      operatingCashFlowKrw: operatingCashFlow,
      capexKrw: capex,
      totalDebtKrw: totalDebt,
      currentAssetsKrw: currentAssets,
      currentLiabilitiesKrw: currentLiabilities,
      currentDebtMaturitiesKrw: currentDebtMaturities,
      totalAssetsKrw: totalAssets,
      totalEquityKrw: totalEquity,
      interestExpenseKrw: interestExpense,
      lineItems
    } satisfies ParsedFinancialStatement;
  });
}

async function writeCounterpartyFinancials(
  prisma: PrismaClient,
  assetId: string,
  spec: CounterpartyFinancialSpec,
  options: { years: number; endingFiscalYear: number }
) {
  const counterparty = await prisma.counterparty.create({
    data: {
      assetId,
      name: spec.name,
      role: spec.role,
      shortName: spec.name.slice(0, 48)
    }
  });

  const statements = buildCounterpartyStatements(spec, options);

  for (const parsed of statements) {
    const statement = await prisma.financialStatement.create({
      data: {
        assetId,
        counterpartyId: counterparty.id,
        statementType: parsed.statementType,
        fiscalYear: parsed.fiscalYear,
        fiscalPeriod: parsed.fiscalPeriod,
        periodEndDate: new Date(Date.UTC(parsed.fiscalYear ?? 0, 11, 31)),
        currency: parsed.currency,
        provenanceSystem: 'DART',
        revenueKrw: parsed.revenueKrw,
        ebitdaKrw: parsed.ebitdaKrw,
        cashKrw: parsed.cashKrw,
        totalDebtKrw: parsed.totalDebtKrw,
        totalAssetsKrw: parsed.totalAssetsKrw,
        totalEquityKrw: parsed.totalEquityKrw,
        interestExpenseKrw: parsed.interestExpenseKrw
      }
    });

    await prisma.financialLineItem.createMany({
      data: parsed.lineItems.map((lineItem) => ({
        financialStatementId: statement.id,
        lineKey: lineItem.lineKey,
        lineLabel: lineItem.lineLabel,
        valueKrw: lineItem.valueKrw
      }))
    });

    const assessment = buildCreditAssessmentFromStatement(parsed);
    await prisma.creditAssessment.create({
      data: {
        assetId,
        counterpartyId: counterparty.id,
        financialStatementId: statement.id,
        assessmentType: `${spec.role}_CREDIT`,
        score: assessment.score,
        riskLevel: assessment.riskLevel,
        summary: assessment.summary,
        metrics: assessment.metrics as Prisma.InputJsonValue
      }
    });
  }
}

const B = 1_000_000_000;

const ASSET_FINANCIALS: Record<string, CounterpartyFinancialSpec[]> = {
  // Yeouido office — diversified financial-sector tenants.
  'SEOUL-YEOUIDO-01': [
    {
      name: 'Mirae Asset Securities Co., Ltd.',
      role: 'TENANT',
      baseRevenueKrw: 1_200 * B,
      revenueGrowthPct: 4,
      ebitdaMarginPct: 28,
      baseTotalDebtKrw: 900 * B,
      debtDeleveragePctPerYear: 3,
      interestRatePct: 4.2,
      baseCashKrw: 220 * B,
      baseTotalEquityKrw: 1_400 * B,
      equityGrowthPctPerYear: 5
    },
    {
      name: 'Hanwha Investment & Securities',
      role: 'TENANT',
      baseRevenueKrw: 680 * B,
      revenueGrowthPct: 3,
      ebitdaMarginPct: 22,
      baseTotalDebtKrw: 820 * B,
      debtDeleveragePctPerYear: 1,
      interestRatePct: 4.8,
      baseCashKrw: 90 * B,
      baseTotalEquityKrw: 560 * B,
      equityGrowthPctPerYear: 3
    }
  ],
  // Gangseo hyperscale — anchor cloud tenant + infra sponsor.
  'SEOUL-GANGSEO-01': [
    {
      name: 'Naver Cloud Corp.',
      role: 'TENANT',
      baseRevenueKrw: 900 * B,
      revenueGrowthPct: 12,
      ebitdaMarginPct: 34,
      baseTotalDebtKrw: 600 * B,
      debtDeleveragePctPerYear: 4,
      interestRatePct: 4.5,
      baseCashKrw: 280 * B,
      baseTotalEquityKrw: 1_100 * B,
      equityGrowthPctPerYear: 8
    },
    {
      name: 'Nexus Seoul Infra Sponsor',
      role: 'SPONSOR',
      baseRevenueKrw: 240 * B,
      revenueGrowthPct: 6,
      ebitdaMarginPct: 41,
      baseTotalDebtKrw: 520 * B,
      debtDeleveragePctPerYear: 0,
      interestRatePct: 5.6,
      baseCashKrw: 40 * B,
      baseTotalEquityKrw: 300 * B,
      equityGrowthPctPerYear: 4
    }
  ],
  'INCHEON-CHEONGNA-02': [
    {
      name: 'Kakao Enterprise Corp.',
      role: 'TENANT',
      baseRevenueKrw: 520 * B,
      revenueGrowthPct: 10,
      ebitdaMarginPct: 26,
      baseTotalDebtKrw: 540 * B,
      debtDeleveragePctPerYear: 1,
      interestRatePct: 5.1,
      baseCashKrw: 110 * B,
      baseTotalEquityKrw: 420 * B,
      equityGrowthPctPerYear: 5
    }
  ],
  'BUSAN-MYEONGJI-03': [
    {
      name: 'Samsung SDS Co., Ltd.',
      role: 'TENANT',
      baseRevenueKrw: 1_350 * B,
      revenueGrowthPct: 7,
      ebitdaMarginPct: 18,
      baseTotalDebtKrw: 300 * B,
      debtDeleveragePctPerYear: 5,
      interestRatePct: 3.9,
      baseCashKrw: 360 * B,
      baseTotalEquityKrw: 1_800 * B,
      equityGrowthPctPerYear: 6
    }
  ],
  'PYEONGTAEK-GODEOK-04': [
    {
      name: 'Coupang Fulfillment Services',
      role: 'TENANT',
      baseRevenueKrw: 2_100 * B,
      revenueGrowthPct: 15,
      ebitdaMarginPct: 9,
      baseTotalDebtKrw: 1_400 * B,
      debtDeleveragePctPerYear: 0,
      interestRatePct: 5.4,
      baseCashKrw: 180 * B,
      baseTotalEquityKrw: 700 * B,
      equityGrowthPctPerYear: 7
    }
  ],
  'DAEJEON-DAEDEOK-05': [
    {
      name: 'KT Cloud Co., Ltd.',
      role: 'TENANT',
      baseRevenueKrw: 640 * B,
      revenueGrowthPct: 11,
      ebitdaMarginPct: 30,
      baseTotalDebtKrw: 480 * B,
      debtDeleveragePctPerYear: 3,
      interestRatePct: 4.6,
      baseCashKrw: 130 * B,
      baseTotalEquityKrw: 520 * B,
      equityGrowthPctPerYear: 6
    }
  ]
};

/**
 * Seeds 10 fiscal years of counterparty financial statements (+ line items
 * and credit assessments) for one asset, keyed by `assetCode`. Called from the
 * per-asset seeders *before* their valuation runs so the credit overlay in the
 * valuation engine reflects the seeded counterparty credit. No-op when the
 * asset has no configured counterparties.
 */
export async function seedAssetCounterpartyFinancials(
  prisma: PrismaClient,
  assetId: string,
  assetCode: string
): Promise<void> {
  const specs = ASSET_FINANCIALS[assetCode];
  if (!specs) return;

  const endingFiscalYear = new Date().getFullYear() - 1;
  for (const spec of specs) {
    await writeCounterpartyFinancials(prisma, assetId, spec, {
      years: 10,
      endingFiscalYear
    });
  }
}
