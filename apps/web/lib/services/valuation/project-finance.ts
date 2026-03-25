import type {
  BundleDebtFacility,
  DebtScheduleResult,
  DebtScheduleYear,
  PreparedUnderwritingInputs,
  ScenarioInput
} from '@/lib/services/valuation/types';
import { clamp, ensureNumber } from '@/lib/services/valuation/utils';

type FacilityYearMetrics = {
  drawAmountKrw: number;
  currentBalanceKrw: number;
  interestKrw: number;
  principalKrw: number;
  endingBalanceKrw: number;
};

function resolveDebtFacilities(prepared: PreparedUnderwritingInputs): BundleDebtFacility[] {
  if (prepared.debtFacilities.length > 0) {
    return prepared.debtFacilities;
  }

  const syntheticCommitmentKrw =
    prepared.capexBreakdown.totalCapexKrw * (ensureNumber(prepared.bundle.asset.financingLtvPct, 55) / 100);

  return [
    {
      id: 'synthetic-term',
      assetId: prepared.bundle.asset.id,
      facilityType: 'TERM',
      lenderName: 'Synthetic facility',
      commitmentKrw: syntheticCommitmentKrw,
      drawnAmountKrw: syntheticCommitmentKrw,
      interestRatePct: prepared.baseDebtCostPct,
      upfrontFeePct: 1,
      commitmentFeePct: 0.3,
      gracePeriodMonths: 12,
      amortizationTermMonths: 84,
      amortizationProfile: 'SCULPTED',
      sculptedTargetDscr: 1.25,
      balloonPct: 10,
      reserveMonths: prepared.spvProfile.reserveTargetMonths,
      notes: 'Synthetic underwriting debt facility',
      createdAt: new Date(0),
      updatedAt: new Date(0),
      draws: [
        {
          id: 'synthetic-draw-1',
          debtFacilityId: 'synthetic-term',
          drawYear: 1,
          drawMonth: 3,
          amountKrw: syntheticCommitmentKrw * 0.55,
          notes: null,
          createdAt: new Date(0)
        },
        {
          id: 'synthetic-draw-2',
          debtFacilityId: 'synthetic-term',
          drawYear: 2,
          drawMonth: 6,
          amountKrw: syntheticCommitmentKrw * 0.45,
          notes: null,
          createdAt: new Date(0)
        }
      ]
    }
  ];
}

function annualDrawAmount(facility: BundleDebtFacility, year: number) {
  const explicitDraws = facility.draws
    .filter((draw) => draw.drawYear === year)
    .reduce((sum, draw) => sum + draw.amountKrw, 0);

  if (explicitDraws > 0) return explicitDraws;

  const drawnAmountKrw = ensureNumber(facility.drawnAmountKrw, 0);
  if (drawnAmountKrw === 0) return 0;

  if (year === 1) return drawnAmountKrw * 0.6;
  if (year === 2) return drawnAmountKrw * 0.4;
  return 0;
}

function resolveInterestRatePct(
  facility: BundleDebtFacility,
  prepared: PreparedUnderwritingInputs,
  scenario: ScenarioInput
) {
  return ensureNumber(facility.interestRatePct, prepared.baseDebtCostPct) + scenario.debtSpreadBumpPct;
}

function resolveGraceYears(facility: BundleDebtFacility) {
  return Math.ceil(ensureNumber(facility.gracePeriodMonths, 0) / 12);
}

function resolveAmortizationYears(facility: BundleDebtFacility) {
  return Math.max(Math.ceil(ensureNumber(facility.amortizationTermMonths, 84) / 12), 1);
}

function resolveYearlyPrincipalKrw(args: {
  facility: BundleDebtFacility;
  year: number;
  horizonYears: number;
  currentBalanceKrw: number;
  yearlyInterestKrw: number;
  graceYears: number;
  amortizationYears: number;
  cfadsBeforeDebtKrw: number;
}) {
  if (args.year <= args.graceYears || args.currentBalanceKrw <= 0) return 0;

  if (args.facility.amortizationProfile === 'MORTGAGE') {
    return args.currentBalanceKrw / Math.max(args.amortizationYears - (args.year - args.graceYears) + 1, 1);
  }

  if (args.facility.amortizationProfile === 'SCULPTED') {
    const targetDscr = ensureNumber(args.facility.sculptedTargetDscr, 1.25);
    const permittedServiceKrw = Math.max(args.cfadsBeforeDebtKrw / targetDscr, 0);
    return Math.max(permittedServiceKrw - args.yearlyInterestKrw, 0);
  }

  if (args.facility.amortizationProfile === 'INTEREST_ONLY' || args.facility.amortizationProfile === 'BULLET') {
    const balloonPct = clamp(ensureNumber(args.facility.balloonPct, 0), 0, 95);
    return args.year === args.horizonYears ? args.currentBalanceKrw * (1 - balloonPct / 100) : 0;
  }

  return 0;
}

function calculateFacilityYearMetrics(args: {
  facility: BundleDebtFacility;
  openingBalanceKrw: number;
  prepared: PreparedUnderwritingInputs;
  scenario: ScenarioInput;
  year: number;
  horizonYears: number;
  cfadsBeforeDebtKrw: number;
}): FacilityYearMetrics {
  const drawAmountKrw = annualDrawAmount(args.facility, args.year);
  const currentBalanceKrw = args.openingBalanceKrw + drawAmountKrw;
  const avgBalanceKrw = args.openingBalanceKrw + drawAmountKrw * 0.5;
  const yearlyInterestKrw = avgBalanceKrw * (resolveInterestRatePct(args.facility, args.prepared, args.scenario) / 100);
  const graceYears = resolveGraceYears(args.facility);
  const amortizationYears = resolveAmortizationYears(args.facility);
  const yearlyPrincipalKrw = clamp(
    resolveYearlyPrincipalKrw({
      facility: args.facility,
      year: args.year,
      horizonYears: args.horizonYears,
      currentBalanceKrw,
      yearlyInterestKrw,
      graceYears,
      amortizationYears,
      cfadsBeforeDebtKrw: args.cfadsBeforeDebtKrw
    }),
    0,
    currentBalanceKrw
  );
  const balloonPct = clamp(ensureNumber(args.facility.balloonPct, 0), 0, 95);

  return {
    drawAmountKrw,
    currentBalanceKrw,
    interestKrw: yearlyInterestKrw,
    principalKrw: yearlyPrincipalKrw,
    endingBalanceKrw: Math.max(currentBalanceKrw - yearlyPrincipalKrw, currentBalanceKrw * (balloonPct / 100))
  };
}

function weightedInterestRatePct(
  facilities: BundleDebtFacility[],
  prepared: PreparedUnderwritingInputs,
  scenario: ScenarioInput
) {
  const totalCommitmentKrw = facilities.reduce((sum, facility) => sum + ensureNumber(facility.commitmentKrw, 0), 0);
  if (totalCommitmentKrw <= 0) return 0;

  return (
    facilities.reduce(
      (sum, facility) =>
        sum + ensureNumber(facility.commitmentKrw, 0) * resolveInterestRatePct(facility, prepared, scenario),
      0
    ) / totalCommitmentKrw
  );
}

function averageReserveMonths(facilities: BundleDebtFacility[]) {
  return (
    facilities.reduce((sum, facility) => sum + ensureNumber(facility.reserveMonths, 0), 0) /
    Math.max(facilities.length, 1)
  );
}

export function buildDebtSchedule(
  prepared: PreparedUnderwritingInputs,
  scenario: ScenarioInput,
  cfadsBeforeDebtKrw: number[]
): DebtScheduleResult {
  const facilities = resolveDebtFacilities(prepared);
  const horizonYears = Math.max(cfadsBeforeDebtKrw.length, 1);
  const facilityBalances = new Map<string, number>();
  const years: DebtScheduleYear[] = [];

  for (const facility of facilities) {
    facilityBalances.set(facility.id, 0);
  }

  for (let year = 1; year <= horizonYears; year += 1) {
    let drawAmountKrw = 0;
    let openingBalanceKrw = 0;
    let interestKrw = 0;
    let principalKrw = 0;

    for (const facility of facilities) {
      const openingBalance = facilityBalances.get(facility.id) ?? 0;
      const facilityYear = calculateFacilityYearMetrics({
        facility,
        openingBalanceKrw: openingBalance,
        prepared,
        scenario,
        year,
        horizonYears,
        cfadsBeforeDebtKrw: cfadsBeforeDebtKrw[year - 1] ?? 0
      });

      drawAmountKrw += facilityYear.drawAmountKrw;
      openingBalanceKrw += facilityYear.currentBalanceKrw;
      interestKrw += facilityYear.interestKrw;
      principalKrw += facilityYear.principalKrw;
      facilityBalances.set(facility.id, facilityYear.endingBalanceKrw);
    }

    const debtServiceKrw = interestKrw + principalKrw;
    years.push({
      year,
      drawAmountKrw,
      openingBalanceKrw,
      interestKrw,
      principalKrw,
      debtServiceKrw,
      endingBalanceKrw: Array.from(facilityBalances.values()).reduce((sum, value) => sum + value, 0),
      dscr: debtServiceKrw > 0 ? cfadsBeforeDebtKrw[year - 1] / debtServiceKrw : null
    });
  }

  const initialDebtFundingKrw = years.reduce((sum, year) => sum + year.drawAmountKrw, 0);
  const weightedRatePct = weightedInterestRatePct(facilities, prepared, scenario);
  const averageDebtServiceKrw =
    years.reduce((sum, year) => sum + year.debtServiceKrw, 0) / Math.max(years.length, 1);
  const reserveMonths = averageReserveMonths(facilities);

  return {
    years,
    initialDebtFundingKrw,
    weightedInterestRatePct: weightedRatePct,
    reserveRequirementKrw: averageDebtServiceKrw * (reserveMonths / 12),
    endingDebtBalanceKrw: years[years.length - 1]?.endingBalanceKrw ?? 0
  };
}
