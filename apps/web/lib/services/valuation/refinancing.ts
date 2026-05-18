import type { ProFormaYear } from '@/lib/services/valuation/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RefinanceTrigger = {
  year: number;
  reason: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
};

export type RefinanceScenario = {
  refiYear: number;
  newRatePct: number;
  newTermMonths: number;
  prepaymentPenaltyPct: number;
  prepaymentCostKrw: number;
  newDebtBalanceKrw: number;
  annualDebtServiceSavingKrw: number;
  breakEvenYears: number | null;
};

export type RefinanceAnalysis = {
  triggers: RefinanceTrigger[];
  scenarios: RefinanceScenario[];
  recommendation: string;
};

// ---------------------------------------------------------------------------
// Trigger Detection
// ---------------------------------------------------------------------------

function detectRefinanceTriggers(
  years: ProFormaYear[],
  weightedInterestRatePct: number,
  maturityYear: number
): RefinanceTrigger[] {
  const triggers: RefinanceTrigger[] = [];

  for (const year of years) {
    // DSCR below covenant threshold
    if (year.dscr !== null && year.dscr < 1.15) {
      triggers.push({
        year: year.year,
        reason: `DSCR ${year.dscr.toFixed(2)}x below 1.15x covenant floor`,
        severity: year.dscr < 1.0 ? 'CRITICAL' : 'WARNING'
      });
    }

    // Negative after-tax distribution
    if (year.afterTaxDistributionKrw < 0) {
      triggers.push({
        year: year.year,
        reason: `Negative equity cash flow: distributions underwater`,
        severity: 'CRITICAL'
      });
    }

    // Debt service exceeds 50% of CFADS — stress signal
    if (year.cfadsBeforeDebtKrw > 0 && year.debtServiceKrw / year.cfadsBeforeDebtKrw > 0.5) {
      const ratio = ((year.debtServiceKrw / year.cfadsBeforeDebtKrw) * 100).toFixed(0);
      triggers.push({
        year: year.year,
        reason: `Debt service consumes ${ratio}% of CFADS`,
        severity: 'WARNING'
      });
    }
  }

  // Maturity wall — flag 2 years before maturity
  const maturityAlert = maturityYear - 2;
  if (maturityAlert > 0 && maturityAlert <= (years.at(-1)?.year ?? 0)) {
    triggers.push({
      year: maturityAlert,
      reason: `Loan maturity in ${maturityYear <= 10 ? maturityYear : maturityYear} years — refinancing window opens`,
      severity: 'INFO'
    });
  }

  // Rate environment — flag if weighted rate is high
  if (weightedInterestRatePct > 6.0) {
    triggers.push({
      year: 1,
      reason: `Weighted interest rate ${weightedInterestRatePct.toFixed(1)}% — monitor for rate decline refi opportunity`,
      severity: 'INFO'
    });
  }

  return triggers.sort((a, b) => a.year - b.year);
}

// ---------------------------------------------------------------------------
// Scenario Generation
// ---------------------------------------------------------------------------

function buildRefinanceScenario(
  years: ProFormaYear[],
  refiYear: number,
  currentRatePct: number,
  newRatePct: number,
  newTermMonths: number,
  prepaymentPenaltyPct: number
): RefinanceScenario | null {
  const refiYearData = years.find((y) => y.year === refiYear);
  if (!refiYearData) return null;

  const outstandingDebt = refiYearData.endingDebtBalanceKrw;
  if (outstandingDebt <= 0) return null;

  const prepaymentCostKrw = outstandingDebt * (prepaymentPenaltyPct / 100);
  const newDebtBalanceKrw = outstandingDebt + prepaymentCostKrw;

  // Simplified annual debt service under new terms
  const newTermYears = newTermMonths / 12;
  const newAnnualInterest = newDebtBalanceKrw * (newRatePct / 100);
  const newAnnualPrincipal = newTermYears > 0 ? newDebtBalanceKrw / newTermYears : 0;
  const newAnnualDebtService = newAnnualInterest + newAnnualPrincipal;

  // Current annual debt service (average of remaining years after refi)
  const remainingYears = years.filter((y) => y.year >= refiYear);
  const avgCurrentDebtService =
    remainingYears.length > 0
      ? remainingYears.reduce((sum, y) => sum + y.debtServiceKrw, 0) / remainingYears.length
      : 0;

  const annualSaving = avgCurrentDebtService - newAnnualDebtService;
  const breakEvenYears =
    annualSaving > 0 ? Number((prepaymentCostKrw / annualSaving).toFixed(1)) : null;

  return {
    refiYear,
    newRatePct,
    newTermMonths,
    prepaymentPenaltyPct,
    prepaymentCostKrw,
    newDebtBalanceKrw,
    annualDebtServiceSavingKrw: Number(annualSaving.toFixed(0)),
    breakEvenYears
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function analyzeRefinancing(
  years: ProFormaYear[],
  weightedInterestRatePct: number,
  amortizationTermMonths: number
): RefinanceAnalysis {
  const maturityYear = Math.ceil(amortizationTermMonths / 12);
  const triggers = detectRefinanceTriggers(years, weightedInterestRatePct, maturityYear);

  // Generate standard refi scenarios at year 3 and year 5 (common refi windows)
  const refiWindows = [3, 5].filter((y) => y <= years.length);
  const rateShifts = [-1.0, -0.5];

  const scenarios: RefinanceScenario[] = [];
  for (const refiYear of refiWindows) {
    for (const shift of rateShifts) {
      const newRate = Math.max(weightedInterestRatePct + shift, 1.0);
      const scenario = buildRefinanceScenario(
        years,
        refiYear,
        weightedInterestRatePct,
        newRate,
        Math.max(amortizationTermMonths - refiYear * 12, 36),
        2.0 // 2% prepayment penalty
      );
      if (scenario) scenarios.push(scenario);
    }
  }

  // Recommendation
  const criticalTriggers = triggers.filter((t) => t.severity === 'CRITICAL');
  const warningTriggers = triggers.filter((t) => t.severity === 'WARNING');
  const bestScenario = scenarios
    .filter((s) => s.annualDebtServiceSavingKrw > 0)
    .sort((a, b) => b.annualDebtServiceSavingKrw - a.annualDebtServiceSavingKrw)[0];

  let recommendation: string;
  if (criticalTriggers.length > 0) {
    recommendation = `Critical refinancing signals detected in year(s) ${criticalTriggers.map((t) => t.year).join(', ')}. Immediate refi analysis recommended.`;
  } else if (warningTriggers.length > 0 && bestScenario) {
    recommendation = `Warning triggers present. Best refi scenario at year ${bestScenario.refiYear} (${bestScenario.newRatePct.toFixed(1)}%) saves ${formatKrwShort(bestScenario.annualDebtServiceSavingKrw)}/yr with ${bestScenario.breakEvenYears ?? '∞'}-year breakeven.`;
  } else if (
    bestScenario &&
    bestScenario.breakEvenYears !== null &&
    bestScenario.breakEvenYears < 3
  ) {
    recommendation = `Favorable refi opportunity at year ${bestScenario.refiYear}: ${formatKrwShort(bestScenario.annualDebtServiceSavingKrw)}/yr saving, ${bestScenario.breakEvenYears}-year breakeven.`;
  } else {
    recommendation =
      'No immediate refinancing action required. Current debt structure is serviceable.';
  }

  return { triggers, scenarios, recommendation };
}

function formatKrwShort(krw: number): string {
  const abs = Math.abs(krw);
  if (abs >= 1e12) return `₩${(krw / 1e12).toFixed(1)}T`;
  if (abs >= 1e8) return `₩${(krw / 1e8).toFixed(1)}억`;
  if (abs >= 1e6) return `₩${(krw / 1e6).toFixed(1)}M`;
  return `₩${krw.toLocaleString()}`;
}
