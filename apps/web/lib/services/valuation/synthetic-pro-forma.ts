import { computeAnnualJongbuseKrw } from '@/lib/services/valuation/jongbuse';
import type { ProFormaBaseCase, ProFormaYear } from '@/lib/services/valuation/types';

export const HOLDING_YEARS = 10;

export type ProFormaInputs = {
  purchasePriceKrw: number;
  ltvPct: number;
  interestRatePct: number;
  amortTermMonths: number;
  capRatePct: number;
  exitCapRatePct: number;
  year1Noi: number;
  growthPct: number;
  opexRatio: number;
  propertyTaxPct: number;
  insurancePct: number;
  corpTaxPct: number;
  exitTaxPct: number;
  acquisitionTaxPct: number;
  landValuePct: number;
  depreciationYears: number;
  exitCostPct: number;
  propertyTaxGrowthPct: number;
  /** Asset class needed for 종부세 / capex reserve calibration. Defaults if omitted. */
  assetClass?: string;
  /** 공시가격현실화율 for 종부세 base. Default 0.65. */
  assessmentRatio?: number;
  /**
   * 공정시장가액비율 (fair-market-value ratio) used as the multiplier on top of
   * 시가표준액(공시가격) to derive the 재산세 과세표준. Land/building default 0.7.
   * Using totalBasis × assessmentRatio × this ratio approximates the actual
   * property-tax base under Korean 지방세법.
   */
  propertyTaxFairMarketRatio?: number;
  /**
   * 매입부가세 환급. Commercial acquisitions incur 10% VAT on the building
   * portion which is recoverable within ~6 months for a VAT-registered SPV.
   * Non-recoverable for residential (주택) by default.
   */
  vatRefundablePortionPct?: number;
  /**
   * Capex reserve as pct of revenue. Separate from opex, builds a fund for
   * major systems refresh (HVAC, elevators, exterior). Typical: 2-3% (office),
   * 1-2% (industrial), 4-5% (hotel), 1.5% (DC has its own capex cycle).
   */
  capexReservePct?: number;
};

export type ProFormaExtras = {
  totalBasisKrw: number;
  acquisitionTaxKrw: number;
  annualDepreciationKrw: number;
  accumulatedDepreciationKrw: number;
  depreciationTaxShieldKrw: number;
  exitTransactionCostKrw: number;
  adjustedBasisAtExitKrw: number;
  vatRefundKrw: number;
  jongbuseYear1Krw: number;
  jongbuseMethodNote: string;
  totalCapexReserveKrw: number;
  totalOperatingReserveKrw: number;
  releasedReservesAtExitKrw: number;
  inPlaceTerminalNoiKrw: number;
  forwardTerminalNoiKrw: number;
};

/** Per-asset-class capex reserve as pct of revenue (major systems refresh). */
const CAPEX_RESERVE_PCT: Record<string, number> = {
  OFFICE: 2.5,
  RETAIL: 2.0,
  INDUSTRIAL: 1.0,
  MULTIFAMILY: 2.5,
  HOTEL: 4.5,
  DATA_CENTER: 1.5,
  LAND: 0.0,
  MIXED_USE: 2.5
};

const DEFAULT_CAPEX_RESERVE_PCT = 2.0;

function zeroYear(y: number): ProFormaYear {
  return {
    year: y,
    occupiedKw: 0,
    contractedKw: 0,
    residualOccupiedKw: 0,
    grossPotentialRevenueKrw: 0,
    contractedRevenueKrw: 0,
    renewalRevenueKrw: 0,
    residualRevenueKrw: 0,
    downtimeLossKrw: 0,
    renewalDowntimeLossKrw: 0,
    rentFreeLossKrw: 0,
    renewalRentFreeLossKrw: 0,
    fixedRecoveriesKrw: 0,
    siteRecoveriesKrw: 0,
    utilityPassThroughRevenueKrw: 0,
    reimbursementRevenueKrw: 0,
    totalOperatingRevenueKrw: 0,
    revenueKrw: 0,
    powerCostKrw: 0,
    siteOperatingExpenseKrw: 0,
    nonRecoverableOperatingExpenseKrw: 0,
    maintenanceReserveKrw: 0,
    operatingExpenseKrw: 0,
    tenantImprovementKrw: 0,
    leasingCommissionKrw: 0,
    tenantCapitalCostKrw: 0,
    renewalTenantCapitalCostKrw: 0,
    fitOutCostKrw: 0,
    noiKrw: 0,
    cfadsBeforeDebtKrw: 0,
    activeRenewalLeaseCount: 0,
    weightedRenewalRatePerKwKrw: null,
    drawAmountKrw: 0,
    interestKrw: 0,
    principalKrw: 0,
    debtServiceKrw: 0,
    endingDebtBalanceKrw: 0,
    dscr: null,
    propertyTaxKrw: 0,
    jongbuseKrw: 0,
    insuranceKrw: 0,
    managementFeeKrw: 0,
    reserveContributionKrw: 0,
    capexReserveKrw: 0,
    corporateTaxKrw: 0,
    afterTaxDistributionKrw: 0
  };
}

export function amortizeYear(openingBalance: number, monthlyRate: number, monthlyPmt: number): {
  interest: number;
  principal: number;
  endingBalance: number;
} {
  let balance = openingBalance;
  let interestAccrued = 0;
  let principalPaid = 0;
  for (let m = 0; m < 12 && balance > 0; m++) {
    const interest = balance * monthlyRate;
    const principal = Math.min(balance, Math.max(0, monthlyPmt - interest));
    interestAccrued += interest;
    principalPaid += principal;
    balance = Math.max(0, balance - principal);
  }
  return {
    interest: Math.round(interestAccrued),
    principal: Math.round(principalPaid),
    endingBalance: Math.max(0, Math.round(balance))
  };
}

export function buildSyntheticProForma(
  inputs: ProFormaInputs
): { proForma: ProFormaBaseCase; extras: ProFormaExtras } {
  const {
    purchasePriceKrw,
    ltvPct,
    interestRatePct,
    amortTermMonths,
    exitCapRatePct,
    year1Noi,
    growthPct,
    opexRatio,
    propertyTaxPct,
    insurancePct,
    corpTaxPct,
    exitTaxPct,
    acquisitionTaxPct,
    landValuePct,
    depreciationYears,
    exitCostPct,
    propertyTaxGrowthPct,
    assetClass = 'OFFICE',
    assessmentRatio = 0.65,
    propertyTaxFairMarketRatio = 0.7,
    vatRefundablePortionPct,
    capexReservePct
  } = inputs;

  const acquisitionTax = Math.round(purchasePriceKrw * (acquisitionTaxPct / 100));
  const totalBasis = purchasePriceKrw + acquisitionTax;

  // ─ 종합부동산세 year 1 (공시가격 grows with property-tax-growth through the hold)
  const jongbuse = computeAnnualJongbuseKrw({
    assetClass,
    purchasePriceKrw,
    landValuePct,
    assessmentRatio
  });
  const year1JongbuseKrw = jongbuse.annualJongbuseKrw;

  // ─ 매입부가세. Commercial acquisitions: 10% VAT on the building portion is
  // recoverable by a VAT-registered SPV. Residential (주택) is exempt from VAT
  // entirely (면세). Default to asset-class-driven recoverability, allow override.
  const defaultRefundablePct =
    assetClass === 'MULTIFAMILY' || assetClass === 'LAND' ? 0 : 10;
  const effectiveVatPct = vatRefundablePortionPct ?? defaultRefundablePct;
  const buildingPortion = Math.max(0, 1 - landValuePct / 100);
  const vatRefundKrw = Math.round(
    purchasePriceKrw * buildingPortion * (effectiveVatPct / 100)
  );

  // ─ Capex reserve. Separate from opex, builds a fund for major systems
  // refresh (HVAC, elevators, exterior). Grows with revenue.
  const effectiveCapexReservePct =
    capexReservePct ?? CAPEX_RESERVE_PCT[assetClass] ?? DEFAULT_CAPEX_RESERVE_PCT;

  const initialDebt = Math.round(purchasePriceKrw * (ltvPct / 100));

  const monthlyRate = interestRatePct / 100 / 12;
  const n = amortTermMonths;
  const monthlyPmt =
    monthlyRate > 0
      ? (initialDebt * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -n))
      : initialDebt / n;
  const annualDebtService = Math.round(monthlyPmt * 12);

  const depreciableBasis = Math.max(0, Math.round(totalBasis * (1 - landValuePct / 100)));
  const annualDepreciation = depreciationYears > 0 ? Math.round(depreciableBasis / depreciationYears) : 0;

  const years: ProFormaYear[] = [];
  let openingBalance = initialDebt;
  let cumulativeAfterTax = 0;
  let cumulativeDepreciation = 0;
  let cumulativeTaxShield = 0;
  let cumulativeCapexReserve = 0;
  let cumulativeOperatingReserve = 0;

  for (let i = 0; i < HOLDING_YEARS; i++) {
    const yearNum = i + 1;
    const revenue = Math.round(year1Noi / (1 - opexRatio) * Math.pow(1 + growthPct / 100, i));
    const opex = Math.round(revenue * opexRatio);
    const noi = revenue - opex;
    const cfads = noi;

    const amort = amortizeYear(openingBalance, monthlyRate, monthlyPmt);
    const interestYear = amort.interest;
    const principalYear = amort.principal;
    const debtService = interestYear + principalYear;
    openingBalance = amort.endingBalance;

    // 재산세 과세표준 = 시가표준액(≈ totalBasis × assessmentRatio) × 공정시장가액비율.
    // Applying both haircuts so propertyTaxPct (e.g., 0.25%) is the statutory
    // rate and not a synthetic full-market rate.
    const propertyTaxBase = totalBasis * assessmentRatio * propertyTaxFairMarketRatio;
    const propertyTax = Math.round(propertyTaxBase * (propertyTaxPct / 100) * Math.pow(1 + propertyTaxGrowthPct / 100, i));
    // 종부세 grows with the same 공시가격 index as 재산세
    const jongbuseThisYear = Math.round(
      year1JongbuseKrw * Math.pow(1 + propertyTaxGrowthPct / 100, i)
    );
    const insurance = Math.round(totalBasis * (insurancePct / 100));
    const reserveContribution = Math.round(revenue * 0.02);
    const capexReserve = Math.round(revenue * (effectiveCapexReservePct / 100));

    const taxableIncome =
      noi - interestYear - propertyTax - jongbuseThisYear - insurance - annualDepreciation;
    const corporateTax = Math.max(0, Math.round(taxableIncome * (corpTaxPct / 100)));
    const shieldThisYear = Math.round(annualDepreciation * (corpTaxPct / 100));

    const pretaxCash =
      noi - debtService - propertyTax - jongbuseThisYear - insurance - reserveContribution - capexReserve;
    const afterTax = pretaxCash - corporateTax;

    cumulativeAfterTax += afterTax;
    cumulativeDepreciation += annualDepreciation;
    cumulativeTaxShield += shieldThisYear;
    cumulativeCapexReserve += capexReserve;
    cumulativeOperatingReserve += reserveContribution;

    const year = zeroYear(yearNum);
    year.totalOperatingRevenueKrw = revenue;
    year.revenueKrw = revenue;
    year.operatingExpenseKrw = opex;
    year.noiKrw = noi;
    year.cfadsBeforeDebtKrw = cfads;
    year.drawAmountKrw = 0;
    year.interestKrw = interestYear;
    year.principalKrw = principalYear;
    year.debtServiceKrw = debtService;
    year.endingDebtBalanceKrw = openingBalance;
    year.dscr = debtService > 0 ? Number((cfads / debtService).toFixed(3)) : null;
    year.propertyTaxKrw = propertyTax;
    year.jongbuseKrw = jongbuseThisYear;
    year.insuranceKrw = insurance;
    year.reserveContributionKrw = reserveContribution;
    year.capexReserveKrw = capexReserve;
    year.corporateTaxKrw = corporateTax;
    year.afterTaxDistributionKrw = afterTax;

    // Synthetic line-item decomposition (display transparency; aggregates unchanged).
    // Revenue split: 85% rental / 15% recoveries; rental further split 70/20/10
    // across contracted / renewal / residual. Recoveries split 50/35/15 across
    // fixed / site / utility pass-through.
    const reimbursement = Math.round(revenue * 0.15);
    const rentalRevenue = revenue - reimbursement;
    const fixedRec = Math.round(reimbursement * 0.5);
    const siteRec = Math.round(reimbursement * 0.35);
    year.fixedRecoveriesKrw = fixedRec;
    year.siteRecoveriesKrw = siteRec;
    year.utilityPassThroughRevenueKrw = reimbursement - fixedRec - siteRec;
    year.reimbursementRevenueKrw = reimbursement;

    const contractedRev = Math.round(rentalRevenue * 0.7);
    const renewalRev = Math.round(rentalRevenue * 0.2);
    year.contractedRevenueKrw = contractedRev;
    year.renewalRevenueKrw = renewalRev;
    year.residualRevenueKrw = rentalRevenue - contractedRev - renewalRev;

    // GPR reconciliation: assume 5% downtime + 2% rent-free friction on rental.
    const grossPotentialRental = Math.round(rentalRevenue / 0.93);
    const downtime = Math.round(grossPotentialRental * 0.05);
    const rentFree = grossPotentialRental - rentalRevenue - downtime;
    year.grossPotentialRevenueKrw = grossPotentialRental + reimbursement;
    year.downtimeLossKrw = downtime;
    year.rentFreeLossKrw = Math.max(0, rentFree);

    // Opex split: 15% power / 50% site-op / 25% non-recoverable / 10% maintenance.
    const powerCost = Math.round(opex * 0.15);
    const siteOpex = Math.round(opex * 0.5);
    const nonRecov = Math.round(opex * 0.25);
    year.powerCostKrw = powerCost;
    year.siteOperatingExpenseKrw = siteOpex;
    year.nonRecoverableOperatingExpenseKrw = nonRecov;
    year.maintenanceReserveKrw = opex - powerCost - siteOpex - nonRecov;

    years.push(year);
  }

  const terminalYearNum = HOLDING_YEARS;
  // Buyer underwrites at exit using forward (Y+1) NOI: grow Y10 NOI by one
  // period of `growthPct`. Industry-standard convention; using in-place Y10 NOI
  // under-states exit value by ~one growth period.
  const inPlaceTerminalNoi = years[HOLDING_YEARS - 1]!.noiKrw;
  const forwardTerminalNoi = Math.round(inPlaceTerminalNoi * (1 + growthPct / 100));
  const grossExit = exitCapRatePct > 0 ? Math.round(forwardTerminalNoi / (exitCapRatePct / 100)) : 0;

  const adjustedBasis = Math.max(0, totalBasis - cumulativeDepreciation);
  const realizedGain = Math.max(0, grossExit - adjustedBasis);
  const exitTax = Math.round(realizedGain * (exitTaxPct / 100));

  const exitTransactionCost = Math.round(grossExit * (exitCostPct / 100));

  // Release accumulated SPV cash buffers at exit. Capex/opex reserve contributions
  // were deducted from each year's distributable cash but the cash itself stayed
  // on the SPV balance sheet — at exit the unspent balance flows to equity. This
  // is a conservative simplification (treats reserves as fully unspent). For
  // assets with heavy mid-hold capex the build-out should be netted separately.
  const releasedReservesKrw = cumulativeCapexReserve + cumulativeOperatingReserve;

  const netExit =
    grossExit - openingBalance - exitTax - exitTransactionCost + releasedReservesKrw;

  const initialEquity = totalBasis - initialDebt;
  const averageCoC =
    years.reduce((s, y) => s + (y.afterTaxDistributionKrw / Math.max(1, initialEquity)) * 100, 0) /
    years.length;

  // annualDebtService is the target monthly × 12 — used by callers who want the loan-constant.
  void annualDebtService;

  return {
    proForma: {
      summary: {
        annualRevenueKrw: years[0]!.totalOperatingRevenueKrw,
        annualOpexKrw: years[0]!.operatingExpenseKrw,
        stabilizedNoiKrw: year1Noi,
        terminalValueKrw: grossExit,
        terminalYear: terminalYearNum,
        reserveRequirementKrw: Math.round(years[0]!.reserveContributionKrw * 6),
        endingDebtBalanceKrw: openingBalance,
        grossExitValueKrw: grossExit,
        netExitProceedsKrw: netExit,
        leveredEquityValueKrw: cumulativeAfterTax + netExit,
        equityIrr: null,
        unleveragedIrr: null,
        equityMultiple: 0,
        averageCashOnCash: Number(averageCoC.toFixed(2)),
        paybackYear: null,
        peakEquityExposureKrw: initialEquity,
        initialEquityKrw: initialEquity,
        initialDebtFundingKrw: initialDebt,
        vatRefundKrw,
        jongbuseYear1Krw: year1JongbuseKrw,
        jongbuseMethodNote: jongbuse.note,
        totalCapexReserveKrw: cumulativeCapexReserve
      },
      years
    },
    extras: {
      totalBasisKrw: totalBasis,
      acquisitionTaxKrw: acquisitionTax,
      annualDepreciationKrw: annualDepreciation,
      accumulatedDepreciationKrw: cumulativeDepreciation,
      depreciationTaxShieldKrw: cumulativeTaxShield,
      exitTransactionCostKrw: exitTransactionCost,
      adjustedBasisAtExitKrw: adjustedBasis,
      vatRefundKrw,
      jongbuseYear1Krw: year1JongbuseKrw,
      jongbuseMethodNote: jongbuse.note,
      totalCapexReserveKrw: cumulativeCapexReserve,
      totalOperatingReserveKrw: cumulativeOperatingReserve,
      releasedReservesAtExitKrw: releasedReservesKrw,
      inPlaceTerminalNoiKrw: inPlaceTerminalNoi,
      forwardTerminalNoiKrw: forwardTerminalNoi
    }
  };
}
