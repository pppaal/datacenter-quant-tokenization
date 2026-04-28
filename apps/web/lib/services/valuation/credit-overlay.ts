import type { UnderwritingAnalysis, UnderwritingBundle } from '@/lib/services/valuation/types';

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

type CreditMetrics = {
  currentRatio?: number | null;
  currentMaturityCoverage?: number | null;
  operatingCashFlowToDebtRatio?: number | null;
  interestCoverage?: number | null;
  cashToDebtRatio?: number | null;
};

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function riskLevelFromSignal(score: number) {
  if (score >= 7) return 'HIGH';
  if (score >= 3.5) return 'MODERATE';
  return 'LOW';
}

export function applyCreditOverlay(
  analysis: UnderwritingAnalysis,
  bundle: UnderwritingBundle
): UnderwritingAnalysis {
  const assessments = bundle.creditAssessments ?? [];
  if (assessments.length === 0) return analysis;

  const averageScore =
    assessments.reduce((sum, assessment) => sum + assessment.score, 0) /
    Math.max(assessments.length, 1);
  const highRiskAssessments = assessments.filter((assessment) => assessment.riskLevel === 'HIGH');
  const moderateRiskAssessments = assessments.filter(
    (assessment) => assessment.riskLevel === 'MODERATE'
  );
  const lowRiskAssessments = assessments.filter((assessment) => assessment.riskLevel === 'LOW');
  const weakestAssessment =
    [...assessments].sort(
      (left, right) =>
        left.score - right.score || left.createdAt.getTime() - right.createdAt.getTime()
    )[0] ?? null;
  const currentRatios = assessments
    .map((assessment) => (assessment.metrics as CreditMetrics | null)?.currentRatio ?? null)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const maturityCoverageValues = assessments
    .map(
      (assessment) => (assessment.metrics as CreditMetrics | null)?.currentMaturityCoverage ?? null
    )
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const cashToDebtValues = assessments
    .map((assessment) => (assessment.metrics as CreditMetrics | null)?.cashToDebtRatio ?? null)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const operatingCashFlowToDebtValues = assessments
    .map(
      (assessment) =>
        (assessment.metrics as CreditMetrics | null)?.operatingCashFlowToDebtRatio ?? null
    )
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const weakestCurrentRatio = currentRatios.length ? Math.min(...currentRatios) : null;
  const weakestMaturityCoverage = maturityCoverageValues.length
    ? Math.min(...maturityCoverageValues)
    : null;
  const lowCurrentRatioCount = currentRatios.filter((value) => value < 1.1).length;
  const weakMaturityCoverageCount = maturityCoverageValues.filter((value) => value < 1.25).length;
  const lowCashToDebtCount = cashToDebtValues.filter((value) => value < 0.1).length;
  const weakOperatingCashFlowCount = operatingCashFlowToDebtValues.filter(
    (value) => value < 0.08
  ).length;
  const refinanceRiskScore =
    weakMaturityCoverageCount * 2.5 +
    lowCurrentRatioCount * 2 +
    lowCashToDebtCount * 1.5 +
    highRiskAssessments.length * 1.5;
  const covenantPressureScore =
    lowCurrentRatioCount * 2 +
    weakOperatingCashFlowCount * 2 +
    highRiskAssessments.length * 1.25 +
    moderateRiskAssessments.length * 0.5;
  const refinanceRiskLevel = riskLevelFromSignal(refinanceRiskScore);
  const covenantPressureLevel = riskLevelFromSignal(covenantPressureScore);
  const downsideDscrHaircutPct = Number(
    clamp(refinanceRiskScore * 1.2 + covenantPressureScore * 0.9, 0, 18).toFixed(1)
  );
  const downsideValueHaircutPct = Number(
    clamp(refinanceRiskScore * 0.65 + covenantPressureScore * 0.45, 0, 8).toFixed(1)
  );

  const confidenceDelta = clamp(
    (averageScore - 65) / 25 +
      lowRiskAssessments.length * 0.08 -
      highRiskAssessments.length * 0.22 -
      lowCurrentRatioCount * 0.08 -
      weakMaturityCoverageCount * 0.1,
    -0.9,
    0.65
  );
  const adjustedConfidence = Number(
    clamp(analysis.confidenceScore + confidenceDelta, 4.5, 9.9).toFixed(1)
  );

  const creditRiskNotes = [
    highRiskAssessments.length > 0
      ? `${highRiskAssessments[0].counterparty.name} screens high risk on current financials and weakens execution certainty.`
      : null,
    moderateRiskAssessments.length > 0 && highRiskAssessments.length === 0
      ? `${moderateRiskAssessments[0].counterparty.name} screens moderate risk, so sponsor and counterparty liquidity still need confirmation.`
      : null,
    refinanceRiskLevel !== 'LOW'
      ? 'Near-term debt maturities show refinance pressure and should be tested against downside lender availability.'
      : null,
    covenantPressureLevel !== 'LOW'
      ? 'Liquidity and covenant headroom look tight enough to pressure the bear-case debt service path.'
      : null
  ].filter((note): note is string => Boolean(note));

  const ddAdditions = [
    highRiskAssessments.length > 0
      ? 'Review sponsor and key counterparty liquidity, leverage, and refinance capacity against the current business plan.'
      : null,
    weakestAssessment && weakestAssessment.financialStatement
      ? `Reconcile ${weakestAssessment.counterparty.name} financial statements with the modeled downside case and covenant headroom.`
      : null,
    refinanceRiskLevel !== 'LOW'
      ? 'Map debt maturities, extension options, and refinance assumptions against available cash and operating cash flow.'
      : null,
    covenantPressureLevel !== 'LOW'
      ? 'Test covenant headroom under lower NOI, higher rates, and restricted revolver availability.'
      : null
  ].filter((item): item is string => Boolean(item));

  const scenarios = analysis.scenarios.map((scenario) => {
    if (scenario.name !== 'Bear' || (downsideDscrHaircutPct <= 0 && downsideValueHaircutPct <= 0)) {
      return scenario;
    }

    const valuationFactor = 1 - downsideValueHaircutPct / 100;
    const dscrFactor = 1 - downsideDscrHaircutPct / 100;

    return {
      ...scenario,
      valuationKrw: Math.max(1, Math.round(scenario.valuationKrw * valuationFactor)),
      impliedYieldPct: Number(
        (scenario.impliedYieldPct / Math.max(valuationFactor, 0.5)).toFixed(2)
      ),
      debtServiceCoverage: Number(
        (scenario.debtServiceCoverage * Math.max(dscrFactor, 0.5)).toFixed(2)
      ),
      notes: `${scenario.notes} Credit overlay adds ${downsideValueHaircutPct.toFixed(1)}% valuation stress and ${downsideDscrHaircutPct.toFixed(1)}% DSCR stress for refinance and covenant pressure.`
    };
  });

  const assumptions = {
    ...analysis.assumptions,
    credit: {
      assessmentCount: assessments.length,
      averageScore: Number(averageScore.toFixed(1)),
      adjustedConfidence,
      liquiditySignals: {
        averageCurrentRatio: average(currentRatios),
        weakestCurrentRatio,
        averageMaturityCoverage: average(maturityCoverageValues),
        weakestMaturityCoverage,
        refinanceRiskLevel,
        covenantPressureLevel,
        downsideDscrHaircutPct,
        downsideValueHaircutPct
      },
      weakestCounterparty: weakestAssessment
        ? {
            name: weakestAssessment.counterparty.name,
            role: weakestAssessment.counterparty.role,
            riskLevel: weakestAssessment.riskLevel,
            score: weakestAssessment.score
          }
        : null,
      riskMix: {
        low: lowRiskAssessments.length,
        moderate: moderateRiskAssessments.length,
        high: highRiskAssessments.length
      }
    }
  };

  return {
    ...analysis,
    confidenceScore: adjustedConfidence,
    scenarios,
    keyRisks: [...creditRiskNotes, ...analysis.keyRisks].slice(0, 6),
    ddChecklist: [...ddAdditions, ...analysis.ddChecklist].slice(0, 6),
    assumptions
  };
}
