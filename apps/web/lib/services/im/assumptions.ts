/**
 * Read shaping helpers for the structured slices of the
 * ValuationRun.assumptions blob the engine writes at run time. The
 * shape mirrors what the engine emits in
 * lib/services/valuation/strategies/* — `metrics`, `taxes`, `spv`,
 * `capex`, `debt`. We surface them on the IM so an LP can answer
 * "WHY is the cap rate 6.58%? WHY is the equity IRR 10.9%?" without
 * re-running the model.
 *
 * Everything is null-tolerant: older runs (pre-stored-proforma) may
 * not carry the full blob, in which case the cards render an empty
 * state rather than throw.
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export type UnderwritingAssumptions = {
  capRatePct: number | null;
  discountRatePct: number | null;
  occupancyPct: number | null;
  monthlyRatePerKwKrw: number | null;
  powerPriceKrwPerKwh: number | null;
  pueTarget: number | null;
  // multipliers applied to the base value during scenario generation
  stageFactor: number | null;
  locationPremium: number | null;
  permitPenalty: number | null;
  floodPenalty: number | null;
  wildfirePenalty: number | null;
  // tax stack
  corporateTaxPct: number | null;
  propertyTaxPct: number | null;
  exitTaxPct: number | null;
  acquisitionTaxPct: number | null;
  vatRecoveryPct: number | null;
  // SPV & promote
  managementFeePct: number | null;
  performanceFeePct: number | null;
  promoteThresholdPct: number | null;
  promoteSharePct: number | null;
  reserveTargetMonths: number | null;
};

export function readUnderwritingAssumptions(assumptions: unknown): UnderwritingAssumptions {
  const root = asRecord(assumptions);
  const metrics = asRecord(root?.metrics);
  const taxes = asRecord(root?.taxes);
  const spv = asRecord(root?.spv);

  return {
    capRatePct: num(metrics?.capRatePct),
    discountRatePct: num(metrics?.discountRatePct),
    occupancyPct: num(metrics?.occupancyPct),
    monthlyRatePerKwKrw: num(metrics?.monthlyRatePerKwKrw),
    powerPriceKrwPerKwh: num(metrics?.powerPriceKrwPerKwh),
    pueTarget: num(metrics?.pueTarget),
    stageFactor: num(metrics?.stageFactor),
    locationPremium: num(metrics?.locationPremium),
    permitPenalty: num(metrics?.permitPenalty),
    floodPenalty: num(metrics?.floodPenalty),
    wildfirePenalty: num(metrics?.wildfirePenalty),
    corporateTaxPct: num(taxes?.corporateTaxPct),
    propertyTaxPct: num(taxes?.propertyTaxPct),
    exitTaxPct: num(taxes?.exitTaxPct),
    acquisitionTaxPct: num(taxes?.acquisitionTaxPct),
    vatRecoveryPct: num(taxes?.vatRecoveryPct),
    managementFeePct: num(spv?.managementFeePct),
    performanceFeePct: num(spv?.performanceFeePct),
    promoteThresholdPct: num(spv?.promoteThresholdPct),
    promoteSharePct: num(spv?.promoteSharePct),
    reserveTargetMonths: num(spv?.reserveTargetMonths)
  };
}

export type CapexBreakdown = {
  landValueKrw: number | null;
  shellCoreKrw: number | null;
  electricalKrw: number | null;
  mechanicalKrw: number | null;
  itFitOutKrw: number | null;
  softCostKrw: number | null;
  contingencyKrw: number | null;
  hardCostKrw: number | null;
  totalCapexKrw: number | null;
};

export function readCapexBreakdown(assumptions: unknown): CapexBreakdown {
  const capex = asRecord(asRecord(assumptions)?.capex);
  return {
    landValueKrw: num(capex?.landValueKrw),
    shellCoreKrw: num(capex?.shellCoreKrw),
    electricalKrw: num(capex?.electricalKrw),
    mechanicalKrw: num(capex?.mechanicalKrw),
    itFitOutKrw: num(capex?.itFitOutKrw),
    softCostKrw: num(capex?.softCostKrw),
    contingencyKrw: num(capex?.contingencyKrw),
    hardCostKrw: num(capex?.hardCostKrw),
    totalCapexKrw: num(capex?.totalCapexKrw)
  };
}
