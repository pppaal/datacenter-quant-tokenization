import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCounterpartyStatements } from '../prisma/seeds/financials';
import { buildCreditAssessmentFromStatement } from '@/lib/services/financial-statements';

const spec = {
  name: 'Demo Tenant Corp.',
  role: 'TENANT' as const,
  baseRevenueKrw: 900_000_000_000,
  revenueGrowthPct: 10,
  ebitdaMarginPct: 34,
  baseTotalDebtKrw: 600_000_000_000,
  debtDeleveragePctPerYear: 4,
  interestRatePct: 4.5,
  baseCashKrw: 280_000_000_000,
  baseTotalEquityKrw: 1_100_000_000_000,
  equityGrowthPctPerYear: 8
};

test('buildCounterpartyStatements produces 10 oldest-first fiscal years ending last year', () => {
  const endingFiscalYear = new Date().getFullYear() - 1;
  const statements = buildCounterpartyStatements(spec, { years: 10, endingFiscalYear });

  assert.equal(statements.length, 10);
  assert.equal(statements[0].fiscalYear, endingFiscalYear - 9);
  assert.equal(statements[9].fiscalYear, endingFiscalYear);

  for (let i = 1; i < statements.length; i += 1) {
    assert.equal(statements[i].fiscalYear! - statements[i - 1].fiscalYear!, 1);
  }

  // Revenue compounds, debt deleverages over the horizon.
  assert.ok(statements[9].revenueKrw! > statements[0].revenueKrw!);
  assert.ok(statements[9].totalDebtKrw! < statements[0].totalDebtKrw!);
});

test('each seeded statement carries a full line-item set and scores a valid credit screen', () => {
  const statements = buildCounterpartyStatements(spec, {
    years: 10,
    endingFiscalYear: new Date().getFullYear() - 1
  });

  for (const statement of statements) {
    assert.equal(statement.lineItems.length, 11);
    assert.ok(statement.lineItems.every((item) => Number.isFinite(item.valueKrw)));

    const assessment = buildCreditAssessmentFromStatement(statement);
    assert.ok(['LOW', 'MODERATE', 'HIGH'].includes(assessment.riskLevel));
    assert.ok(assessment.score >= 25 && assessment.score <= 92);
    assert.ok(assessment.metrics.leverageMultiple !== null);
    assert.ok(assessment.metrics.interestCoverage !== null);
  }
});
