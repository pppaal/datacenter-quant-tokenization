import { formatNumber, toSentenceCase } from '@/lib/utils';
import { pickBaseDscr } from '@/lib/services/valuation/scenario-utils';

type AssumptionsLike = Record<string, number | string | null> | null | undefined;

type DebtDrawLike = {
  amountKrw: number;
};

type DebtFacilityLike = {
  facilityType: string;
  lenderName?: string | null;
  commitmentKrw: number;
  drawnAmountKrw?: number | null;
  interestRatePct: number;
  gracePeriodMonths?: number | null;
  amortizationTermMonths?: number | null;
  amortizationProfile: string;
  balloonPct?: number | null;
  reserveMonths?: number | null;
  draws: DebtDrawLike[];
};

type ScenarioLike = {
  name: string;
  debtServiceCoverage?: number | null;
};

export type DebtBreakdownFacilityRow = {
  label: string;
  facilityTypeLabel: string;
  commitmentKrw: number;
  drawnAmountKrw: number;
  commitmentSharePct: number;
  rateContributionPct: number;
  reserveContributionKrw: number | null;
  endingBalanceContributionKrw: number | null;
  drawCount: number;
  amortizationLabel: string;
  watchpoint: string | null;
};

export type DebtBreakdownSummary = {
  totalCommitmentKrw: number;
  totalDrawnAmountKrw: number;
  weightedInterestRatePct: number | null;
  reserveRequirementKrw: number | null;
  endingDebtBalanceKrw: number | null;
  baseDscr: number | null;
  facilities: DebtBreakdownFacilityRow[];
};

function pickNumber(assumptions: AssumptionsLike, key: string) {
  const value = assumptions?.[key];
  return typeof value === 'number' ? value : null;
}

function facilityWatchpoint(facility: DebtFacilityLike) {
  if ((facility.balloonPct ?? 0) >= 20) return 'Balloon-heavy';
  if (facility.interestRatePct >= 7) return 'High coupon';
  if ((facility.reserveMonths ?? 0) >= 9) return 'Reserve-heavy';
  if (facility.amortizationProfile === 'INTEREST_ONLY' && (facility.gracePeriodMonths ?? 0) >= 18) {
    return 'Long interest-only';
  }

  return null;
}

function facilityAmortizationLabel(facility: DebtFacilityLike) {
  const profile = toSentenceCase(facility.amortizationProfile);
  const termMonths = facility.amortizationTermMonths;
  const graceMonths = facility.gracePeriodMonths;
  const termLabel = termMonths ? `${formatNumber(termMonths, 0)}m term` : 'term not set';
  const graceLabel = graceMonths ? `${formatNumber(graceMonths, 0)}m grace` : 'no grace';
  return `${profile} / ${termLabel} / ${graceLabel}`;
}

export function buildDebtBreakdown(
  assumptions: AssumptionsLike,
  debtFacilities: DebtFacilityLike[],
  scenarios: ScenarioLike[]
): DebtBreakdownSummary {
  const totalCommitmentKrw = debtFacilities.reduce((sum, facility) => sum + facility.commitmentKrw, 0);
  const totalDrawnAmountKrw = debtFacilities.reduce(
    (sum, facility) =>
      sum + (facility.drawnAmountKrw ?? facility.draws.reduce((drawSum, draw) => drawSum + draw.amountKrw, 0)),
    0
  );
  const reserveRequirementKrw = pickNumber(assumptions, 'reserveRequirementKrw');
  const endingDebtBalanceKrw = pickNumber(assumptions, 'endingDebtBalanceKrw');
  const weightedInterestRatePct =
    pickNumber(assumptions, 'weightedInterestRatePct') ??
    (totalCommitmentKrw > 0
      ? debtFacilities.reduce((sum, facility) => sum + facility.commitmentKrw * facility.interestRatePct, 0) /
        totalCommitmentKrw
      : null);
  const baseDscr = pickBaseDscr(scenarios);

  const facilities = debtFacilities
    .map<DebtBreakdownFacilityRow>((facility) => {
      const share = totalCommitmentKrw > 0 ? facility.commitmentKrw / totalCommitmentKrw : 0;
      const drawnAmountKrw =
        facility.drawnAmountKrw ?? facility.draws.reduce((sum, draw) => sum + draw.amountKrw, 0);

      return {
        label: facility.lenderName || `${toSentenceCase(facility.facilityType)} facility`,
        facilityTypeLabel: toSentenceCase(facility.facilityType),
        commitmentKrw: facility.commitmentKrw,
        drawnAmountKrw,
        commitmentSharePct: Number((share * 100).toFixed(1)),
        rateContributionPct: Number((facility.interestRatePct * share).toFixed(2)),
        reserveContributionKrw:
          reserveRequirementKrw !== null ? Math.round(reserveRequirementKrw * share) : null,
        endingBalanceContributionKrw:
          endingDebtBalanceKrw !== null ? Math.round(endingDebtBalanceKrw * share) : null,
        drawCount: facility.draws.length,
        amortizationLabel: facilityAmortizationLabel(facility),
        watchpoint: facilityWatchpoint(facility)
      };
    })
    .sort((left, right) => right.commitmentKrw - left.commitmentKrw);

  return {
    totalCommitmentKrw,
    totalDrawnAmountKrw,
    weightedInterestRatePct: weightedInterestRatePct !== null ? Number(weightedInterestRatePct.toFixed(2)) : null,
    reserveRequirementKrw,
    endingDebtBalanceKrw,
    baseDscr: typeof baseDscr === 'number' ? Number(baseDscr.toFixed(2)) : null,
    facilities
  };
}
