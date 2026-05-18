import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCreditAssessmentFromStatement,
  ingestFinancialStatement,
  parseFinancialStatement,
  parseFinancialStatementFromText
} from '@/lib/services/financial-statements';

test('financial statement parser extracts core line items and counterparty metadata', () => {
  const parsed = parseFinancialStatementFromText({
    assetName: 'Seoul Hyperscale Campus I',
    title: 'Han River Infrastructure Partners FY2024 Financial Statements',
    extractedText:
      'Sponsor: Han River Infrastructure Partners. Revenue KRW 42000000000. EBITDA KRW 11800000000. Cash KRW 6400000000. Total debt KRW 26000000000. Total assets KRW 72000000000. Total equity KRW 29000000000. Interest expense KRW 2400000000.'
  });

  assert.ok(parsed);
  assert.equal(parsed?.counterpartyName, 'Han River Infrastructure Partners');
  assert.equal(parsed?.counterpartyRole, 'SPONSOR');
  assert.equal(parsed?.revenueKrw, 42000000000);
  assert.equal(parsed?.lineItems.length, 7);
});

test('credit assessment builder derives score and leverage metrics from parsed statements', () => {
  const parsed = parseFinancialStatementFromText({
    assetName: 'Seoul Hyperscale Campus I',
    title: 'Operator FY2024 Financial Statements',
    extractedText:
      'Operator: Seoul Digital Operations. Revenue KRW 52000000000. EBITDA KRW 15000000000. Cash KRW 9000000000. Total debt KRW 18000000000. Total assets KRW 76000000000. Total equity KRW 38000000000. Interest expense KRW 2500000000.'
  });

  assert.ok(parsed);
  const assessment = buildCreditAssessmentFromStatement(parsed!);

  assert.equal(assessment.riskLevel, 'LOW');
  assert.ok((assessment.metrics.leverageMultiple ?? 0) < 2);
  assert.ok((assessment.metrics.interestCoverage ?? 0) > 4);
});

test('financial statement parser handles table-style statements with unit scaling and negatives', () => {
  const parsed = parseFinancialStatementFromText({
    assetName: 'Maple Logistics Hub',
    title: 'Maple Sponsor FY2024 Accounts',
    extractedText: `Sponsor: Maple Sponsor
Statement of Income (KRW in millions)
Revenue 42,000
EBITDA 11,800
Cash and cash equivalents 6,400
Operating cash flow 7,200
Capital expenditures (1,600)
Current assets 13,500
Current liabilities 8,400
Debt due within one year 4,900
Total debt 26,000
Total assets 72,000
Total equity 29,000
Interest expense (2,400)`
  });

  assert.ok(parsed);
  assert.equal(parsed?.revenueKrw, 42_000_000_000);
  assert.equal(parsed?.interestExpenseKrw, -2_400_000_000);
  assert.equal(parsed?.operatingCashFlowKrw, 7_200_000_000);
  assert.equal(parsed?.currentDebtMaturitiesKrw, 4_900_000_000);
  assert.ok(parsed?.lineItems.some((item) => item.lineKey === 'cashKrw'));
});

test('financial statement parser merges AI-enriched fields when heuristic coverage is partial', async () => {
  const parsed = await parseFinancialStatement(
    {
      assetName: 'Maple Logistics Hub',
      title: 'Maple Sponsor FY2024 Accounts',
      extractedText:
        'Sponsor: Maple Sponsor. Revenue KRW 42000000000. EBITDA KRW 11800000000. Cash KRW 6400000000.'
    },
    {
      aiExtractor: async () => ({
        counterpartyRole: 'SPONSOR',
        totalDebtKrw: 26_000_000_000,
        currentAssetsKrw: 13_500_000_000,
        currentLiabilitiesKrw: 8_400_000_000,
        currentDebtMaturitiesKrw: 4_900_000_000,
        totalAssetsKrw: 72_000_000_000,
        totalEquityKrw: 29_000_000_000,
        operatingCashFlowKrw: 7_200_000_000,
        interestExpenseKrw: 2_400_000_000,
        lineItems: [
          {
            lineKey: 'totalDebtKrw',
            lineLabel: 'Total Debt',
            valueKrw: 26_000_000_000
          }
        ]
      })
    }
  );

  assert.ok(parsed);
  assert.equal(parsed?.totalDebtKrw, 26_000_000_000);
  assert.equal(parsed?.interestExpenseKrw, 2_400_000_000);
  assert.equal(parsed?.currentLiabilitiesKrw, 8_400_000_000);
  assert.ok(parsed?.lineItems.some((item) => item.lineKey === 'totalDebtKrw'));
});

test('credit assessment builder uses liquidity and maturity coverage metrics', () => {
  const assessment = buildCreditAssessmentFromStatement({
    counterpartyName: 'Maple Sponsor',
    counterpartyRole: 'SPONSOR',
    statementType: 'ANNUAL',
    fiscalYear: 2024,
    fiscalPeriod: 'FY',
    currency: 'KRW',
    revenueKrw: 42_000_000_000,
    ebitdaKrw: 11_800_000_000,
    cashKrw: 6_400_000_000,
    operatingCashFlowKrw: 7_200_000_000,
    capexKrw: -1_600_000_000,
    totalDebtKrw: 26_000_000_000,
    currentAssetsKrw: 13_500_000_000,
    currentLiabilitiesKrw: 8_400_000_000,
    currentDebtMaturitiesKrw: 4_900_000_000,
    totalAssetsKrw: 72_000_000_000,
    totalEquityKrw: 29_000_000_000,
    interestExpenseKrw: 2_400_000_000,
    lineItems: []
  });

  assert.ok((assessment.metrics.currentRatio ?? 0) > 1.5);
  assert.ok((assessment.metrics.operatingCashFlowToDebtRatio ?? 0) > 0.2);
  assert.ok((assessment.metrics.currentMaturityCoverage ?? 0) > 2.5);
  assert.ok((assessment.metrics.workingCapitalKrw ?? 0) > 0);
});

test('financial statement ingestion persists statement, line items, and credit assessment', async () => {
  const calls: Record<string, any[]> = {
    counterpartyCreate: [],
    statementCreate: [],
    lineItemCreate: [],
    assessmentCreate: []
  };

  const result = await ingestFinancialStatement(
    {
      assetId: 'asset_1',
      documentVersionId: 'version_1',
      assetName: 'Seoul Hyperscale Campus I',
      title: 'Han River Infrastructure Partners FY2024 Financial Statements',
      extractedText:
        'Sponsor: Han River Infrastructure Partners. Revenue KRW 42000000000. EBITDA KRW 11800000000. Cash KRW 6400000000. Total debt KRW 26000000000. Total assets KRW 72000000000. Total equity KRW 29000000000. Interest expense KRW 2400000000.'
    },
    {
      aiExtractor: async () => null,
      db: {
        counterparty: {
          async findFirst() {
            return null;
          },
          async create(args: any) {
            calls.counterpartyCreate.push(args.data);
            return { id: 'counterparty_1', ...args.data };
          },
          async update(args: any) {
            return { id: args.where.id, ...args.data };
          }
        },
        financialStatement: {
          async create(args: any) {
            calls.statementCreate.push(args.data);
            return { id: 'statement_1', ...args.data };
          }
        },
        financialLineItem: {
          async create(args: any) {
            calls.lineItemCreate.push(args.data);
            return args.data;
          }
        },
        creditAssessment: {
          async create(args: any) {
            calls.assessmentCreate.push(args.data);
            return { id: 'assessment_1', ...args.data };
          }
        }
      } as any
    }
  );

  assert.equal(result?.counterpartyId, 'counterparty_1');
  assert.equal(result?.financialStatementId, 'statement_1');
  assert.ok(calls.lineItemCreate.some((item) => item.lineKey === 'ebitdaKrw'));
  assert.ok(calls.assessmentCreate[0].score >= 25);
});
