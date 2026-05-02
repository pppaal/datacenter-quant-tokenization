import type { CapexCategory } from '@prisma/client';
import type {
  CapexBreakdown,
  ComparableCalibration,
  BundleFeatureSnapshot,
  PreparedUnderwritingInputs,
  SpvProfile,
  TaxProfile,
  UnderwritingBundle,
  ValuationStrategyContext
} from '@/lib/services/valuation/types';
import { buildMacroRegimeAnalysis } from '@/lib/services/macro/regime';
import { ensureNumber, stageMultiplier, weightedAverage } from '@/lib/services/valuation/utils';

function buildComparableCalibration(
  bundle: UnderwritingBundle,
  capacityMw: number
): ComparableCalibration {
  const entries = bundle.comparableSet?.entries ?? [];
  const weightedEntries = entries.map((entry) => ({
    entry,
    weight: ensureNumber(entry.weightPct, 1)
  }));

  const weightedCapRatePct = weightedAverage(
    weightedEntries.map(({ entry, weight }) => ({
      value: entry.capRatePct,
      weight
    }))
  );
  const weightedMonthlyRatePerKwKrw = weightedAverage(
    weightedEntries.map(({ entry, weight }) => ({
      value: entry.monthlyRatePerKwKrw,
      weight
    }))
  );
  const weightedDiscountRatePct = weightedAverage(
    weightedEntries.map(({ entry, weight }) => ({
      value: entry.discountRatePct,
      weight
    }))
  );
  const weightedValuePerMwKrw = weightedAverage(
    weightedEntries.map(({ entry, weight }) => ({
      value:
        entry.pricePerMwKrw ??
        (entry.valuationKrw && entry.powerCapacityMw
          ? entry.valuationKrw / entry.powerCapacityMw
          : null),
      weight
    }))
  );

  return {
    entryCount: entries.length,
    weightedCapRatePct,
    weightedMonthlyRatePerKwKrw,
    weightedDiscountRatePct,
    weightedValuePerMwKrw,
    directComparableValueKrw: weightedValuePerMwKrw ? weightedValuePerMwKrw * capacityMw : null
  };
}

function fallbackCapexBreakdown(totalCapexKrw: number): CapexBreakdown {
  return {
    totalCapexKrw,
    landValueKrw: totalCapexKrw * 0.16,
    shellCoreKrw: totalCapexKrw * 0.22,
    electricalKrw: totalCapexKrw * 0.24,
    mechanicalKrw: totalCapexKrw * 0.16,
    itFitOutKrw: totalCapexKrw * 0.08,
    softCostKrw: totalCapexKrw * 0.1,
    contingencyKrw: totalCapexKrw * 0.04,
    hardCostKrw: totalCapexKrw * 0.7,
    embeddedCostKrw: 0
  };
}

function buildCapexBreakdown(
  bundle: UnderwritingBundle,
  replacementCostPerMwKrw: number,
  capacityMw: number,
  documentCapexKrw: number | null
) {
  const lineItems = bundle.capexLineItems ?? [];
  if (lineItems.length === 0) {
    const fallbackCapexKrw = ensureNumber(
      documentCapexKrw ?? bundle.asset.capexAssumptionKrw,
      replacementCostPerMwKrw * capacityMw
    );

    return fallbackCapexBreakdown(fallbackCapexKrw);
  }

  const amountByCategory = new Map<CapexCategory, number>();
  let totalCapexKrw = 0;
  let embeddedCostKrw = 0;

  for (const item of lineItems) {
    totalCapexKrw += item.amountKrw;
    if (item.isEmbedded) embeddedCostKrw += item.amountKrw;
    amountByCategory.set(
      item.category,
      (amountByCategory.get(item.category) ?? 0) + item.amountKrw
    );
  }

  const landValueKrw = amountByCategory.get('LAND') ?? 0;
  const shellCoreKrw = amountByCategory.get('SHELL_CORE') ?? 0;
  const electricalKrw = amountByCategory.get('ELECTRICAL') ?? 0;
  const mechanicalKrw = amountByCategory.get('MECHANICAL') ?? 0;
  const itFitOutKrw = amountByCategory.get('IT_FIT_OUT') ?? 0;
  const softCostKrw = amountByCategory.get('SOFT_COST') ?? 0;
  const contingencyKrw = amountByCategory.get('CONTINGENCY') ?? 0;

  return {
    totalCapexKrw,
    landValueKrw,
    shellCoreKrw,
    electricalKrw,
    mechanicalKrw,
    itFitOutKrw,
    softCostKrw,
    contingencyKrw,
    hardCostKrw: shellCoreKrw + electricalKrw + mechanicalKrw + itFitOutKrw,
    embeddedCostKrw
  };
}

function buildTaxProfile(bundle: UnderwritingBundle): TaxProfile {
  return {
    acquisitionTaxPct: ensureNumber(bundle.taxAssumption?.acquisitionTaxPct, 4.6),
    vatRecoveryPct: ensureNumber(bundle.taxAssumption?.vatRecoveryPct, 90),
    propertyTaxPct: ensureNumber(bundle.taxAssumption?.propertyTaxPct, 0.35),
    insurancePct: ensureNumber(bundle.taxAssumption?.insurancePct, 0.12),
    corporateTaxPct: ensureNumber(bundle.taxAssumption?.corporateTaxPct, 24.2),
    withholdingTaxPct: ensureNumber(bundle.taxAssumption?.withholdingTaxPct, 15.4),
    exitTaxPct: ensureNumber(bundle.taxAssumption?.exitTaxPct, 1)
  };
}

function buildSpvProfile(bundle: UnderwritingBundle): SpvProfile {
  return {
    legalStructure: bundle.spvStructure?.legalStructure ?? 'SPC',
    managementFeePct: ensureNumber(bundle.spvStructure?.managementFeePct, 1.25),
    performanceFeePct: ensureNumber(bundle.spvStructure?.performanceFeePct, 8),
    promoteThresholdPct: ensureNumber(bundle.spvStructure?.promoteThresholdPct, 10),
    promoteSharePct: ensureNumber(bundle.spvStructure?.promoteSharePct, 15),
    reserveTargetMonths: ensureNumber(bundle.spvStructure?.reserveTargetMonths, 6)
  };
}

function getLatestDocumentFeatureSnapshot(bundle: UnderwritingBundle) {
  return (
    bundle.featureSnapshots?.find((snapshot) => snapshot.featureNamespace === 'document_facts') ??
    null
  );
}

function getLatestFeatureSnapshot(bundle: UnderwritingBundle, namespace: string) {
  return (
    bundle.featureSnapshots?.find((snapshot) => snapshot.featureNamespace === namespace) ?? null
  );
}

function getFeatureNumber(snapshot: BundleFeatureSnapshot | null, key: string) {
  const value = snapshot?.values.find((entry) => entry.key === key)?.numberValue;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getFeatureText(snapshot: BundleFeatureSnapshot | null, key: string) {
  const value = snapshot?.values.find((entry) => entry.key === key)?.textValue;
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function getFeatureTextAny(snapshot: BundleFeatureSnapshot | null, keys: string[]) {
  for (const key of keys) {
    const value = getFeatureText(snapshot, key);
    if (value) return value;
  }

  return null;
}

function buildDocumentFeatureOverrides(bundle: UnderwritingBundle) {
  const snapshot = getLatestDocumentFeatureSnapshot(bundle);

  return {
    occupancyPct: getFeatureNumber(snapshot, 'document.occupancy_pct'),
    monthlyRatePerKwKrw: getFeatureNumber(snapshot, 'document.monthly_rate_per_kw_krw'),
    capRatePct: getFeatureNumber(snapshot, 'document.cap_rate_pct'),
    discountRatePct: getFeatureNumber(snapshot, 'document.discount_rate_pct'),
    capexKrw:
      getFeatureNumber(snapshot, 'document.capex_krw') ??
      getFeatureNumber(snapshot, 'document.budget_krw'),
    contractedKw: getFeatureNumber(snapshot, 'document.contracted_kw'),
    permitStatusNote: getFeatureText(snapshot, 'document.permit_status_note'),
    sourceVersion: snapshot?.sourceVersion ?? null
  };
}

function buildCuratedFeatureOverrides(bundle: UnderwritingBundle) {
  const marketSnapshot = getLatestFeatureSnapshot(bundle, 'market_inputs');
  const satelliteSnapshot = getLatestFeatureSnapshot(bundle, 'satellite_risk');
  const permitSnapshot = getLatestFeatureSnapshot(bundle, 'permit_inputs');
  const powerSnapshot = getLatestFeatureSnapshot(bundle, 'power_micro');
  const revenueSnapshot = getLatestFeatureSnapshot(bundle, 'revenue_micro');
  const legalSnapshot = getLatestFeatureSnapshot(bundle, 'legal_micro');
  const readinessSnapshot =
    getLatestFeatureSnapshot(bundle, 'readiness_legal') ??
    getLatestFeatureSnapshot(bundle, 'registry_legal');

  return {
    marketInputs: {
      monthlyRatePerKwKrw: getFeatureNumber(marketSnapshot, 'market.monthly_rate_per_kw_krw'),
      capRatePct: getFeatureNumber(marketSnapshot, 'market.cap_rate_pct'),
      discountRatePct: getFeatureNumber(marketSnapshot, 'market.discount_rate_pct'),
      debtCostPct: getFeatureNumber(marketSnapshot, 'market.debt_cost_pct'),
      constructionCostPerMwKrw: getFeatureNumber(
        marketSnapshot,
        'market.construction_cost_per_mw_krw'
      ),
      note: getFeatureText(marketSnapshot, 'market.note'),
      sourceVersion: marketSnapshot?.sourceVersion ?? null
    },
    satelliteRisk: {
      floodRiskScore: getFeatureNumber(satelliteSnapshot, 'satellite.flood_risk_score'),
      wildfireRiskScore: getFeatureNumber(satelliteSnapshot, 'satellite.wildfire_risk_score'),
      climateNote: getFeatureText(satelliteSnapshot, 'satellite.climate_note'),
      sourceVersion: satelliteSnapshot?.sourceVersion ?? null
    },
    permitInputs: {
      permitStage: getFeatureText(permitSnapshot, 'permit.stage'),
      powerApprovalStatus: getFeatureText(permitSnapshot, 'permit.power_approval_status'),
      timelineNote: getFeatureText(permitSnapshot, 'permit.timeline_note'),
      sourceVersion: permitSnapshot?.sourceVersion ?? null
    },
    powerMicro: {
      utilityName: getFeatureText(powerSnapshot, 'power.utility_name'),
      substationDistanceKm: getFeatureNumber(powerSnapshot, 'power.substation_distance_km'),
      tariffKrwPerKwh: getFeatureNumber(powerSnapshot, 'power.tariff_krw_per_kwh'),
      renewableAvailabilityPct: getFeatureNumber(powerSnapshot, 'power.renewable_availability_pct'),
      pueTarget: getFeatureNumber(powerSnapshot, 'power.pue_target'),
      backupFuelHours: getFeatureNumber(powerSnapshot, 'power.backup_fuel_hours'),
      sourceVersion: powerSnapshot?.sourceVersion ?? null
    },
    revenueMicro: {
      primaryTenant: getFeatureText(revenueSnapshot, 'revenue.primary_tenant'),
      leasedKw: getFeatureNumber(revenueSnapshot, 'revenue.leased_kw'),
      baseRatePerKwKrw: getFeatureNumber(revenueSnapshot, 'revenue.base_rate_per_kw_krw'),
      termYears: getFeatureNumber(revenueSnapshot, 'revenue.term_years'),
      probabilityPct: getFeatureNumber(revenueSnapshot, 'revenue.probability_pct'),
      annualEscalationPct: getFeatureNumber(revenueSnapshot, 'revenue.annual_escalation_pct'),
      sourceVersion: revenueSnapshot?.sourceVersion ?? null
    },
    legalMicro: {
      ownerName: getFeatureText(legalSnapshot, 'legal.owner_name'),
      ownerEntityType: getFeatureText(legalSnapshot, 'legal.owner_entity_type'),
      ownershipPct: getFeatureNumber(legalSnapshot, 'legal.ownership_pct'),
      encumbranceType: getFeatureText(legalSnapshot, 'legal.encumbrance_type'),
      encumbranceHolder: getFeatureText(legalSnapshot, 'legal.encumbrance_holder'),
      securedAmountKrw: getFeatureNumber(legalSnapshot, 'legal.secured_amount_krw'),
      priorityRank: getFeatureNumber(legalSnapshot, 'legal.priority_rank'),
      constraintType: getFeatureText(legalSnapshot, 'legal.constraint_type'),
      constraintTitle: getFeatureText(legalSnapshot, 'legal.constraint_title'),
      constraintSeverity: getFeatureText(legalSnapshot, 'legal.constraint_severity'),
      sourceVersion: legalSnapshot?.sourceVersion ?? null
    },
    reviewReadiness: {
      readinessStatus: getFeatureTextAny(readinessSnapshot, [
        'readiness.status',
        'registry.status'
      ]),
      reviewPhase: getFeatureTextAny(readinessSnapshot, [
        'readiness.review_phase',
        'registry.tokenization_phase'
      ]),
      legalStructure: getFeatureTextAny(readinessSnapshot, [
        'readiness.legal_structure',
        'registry.legal_structure'
      ]),
      nextAction: getFeatureTextAny(readinessSnapshot, [
        'readiness.next_action',
        'registry.next_action'
      ]),
      sourceVersion: readinessSnapshot?.sourceVersion ?? null
    }
  };
}

export function prepareValuationInputs(
  bundle: UnderwritingBundle,
  context: ValuationStrategyContext = {}
): PreparedUnderwritingInputs {
  const { asset, address, siteProfile, permitSnapshot, energySnapshot, marketSnapshot } = bundle;

  const stage = asset.stage;
  const capacityMw = ensureNumber(asset.powerCapacityMw ?? asset.targetItLoadMw, 12);
  const capacityKw = capacityMw * 1000;
  const documentFeatureOverrides = buildDocumentFeatureOverrides(bundle);
  const curatedFeatureOverrides = buildCuratedFeatureOverrides(bundle);
  const comparableCalibration = buildComparableCalibration(bundle, capacityMw);
  const macroRegime = buildMacroRegimeAnalysis({
    assetClass: asset.assetClass,
    market: asset.market,
    country: address?.country,
    submarket: marketSnapshot?.metroRegion,
    marketSnapshot,
    series: bundle.macroSeries ?? [],
    profileRules: context.profileRules
  });
  const { guidance: macroGuidance } = macroRegime;

  const marketRate = ensureNumber(
    documentFeatureOverrides.monthlyRatePerKwKrw ??
      curatedFeatureOverrides.marketInputs.monthlyRatePerKwKrw ??
      marketSnapshot?.colocationRatePerKwKrw,
    195000
  );
  const comparableRate = comparableCalibration.weightedMonthlyRatePerKwKrw;
  const baseMonthlyRatePerKwKrw =
    comparableRate === null ? marketRate : marketRate * 0.4 + comparableRate * 0.6;

  const marketCapRatePct = ensureNumber(
    documentFeatureOverrides.capRatePct ??
      curatedFeatureOverrides.marketInputs.capRatePct ??
      marketSnapshot?.capRatePct,
    6.5
  );
  const baseCapRatePct =
    comparableCalibration.weightedCapRatePct === null
      ? marketCapRatePct
      : marketCapRatePct * 0.45 + comparableCalibration.weightedCapRatePct * 0.55;

  const marketDiscountRatePct = ensureNumber(
    documentFeatureOverrides.discountRatePct ??
      curatedFeatureOverrides.marketInputs.discountRatePct ??
      marketSnapshot?.discountRatePct,
    9.8
  );
  const baseDiscountRatePct =
    comparableCalibration.weightedDiscountRatePct === null
      ? marketDiscountRatePct
      : marketDiscountRatePct * 0.5 + comparableCalibration.weightedDiscountRatePct * 0.5;

  const baseDebtCostPct = ensureNumber(
    curatedFeatureOverrides.marketInputs.debtCostPct ?? marketSnapshot?.debtCostPct,
    asset.financingRatePct ?? 5.3
  );
  const baseReplacementCostPerMwKrw = ensureNumber(
    curatedFeatureOverrides.marketInputs.constructionCostPerMwKrw ??
      marketSnapshot?.constructionCostPerMwKrw,
    7200000000
  );
  const adjustedReplacementCostPerMwKrw =
    baseReplacementCostPerMwKrw * (1 + macroGuidance.replacementCostShiftPct / 100);
  const capexBreakdown = buildCapexBreakdown(
    bundle,
    adjustedReplacementCostPerMwKrw,
    capacityMw,
    documentFeatureOverrides.capexKrw
  );
  const occupancyPct = ensureNumber(
    documentFeatureOverrides.occupancyPct ?? asset.occupancyAssumptionPct,
    asset.stage === 'STABILIZED' ? 92 : 68
  );
  const powerPriceKrwPerKwh = ensureNumber(
    curatedFeatureOverrides.powerMicro.tariffKrwPerKwh ?? energySnapshot?.tariffKrwPerKwh,
    140
  );
  const pueTarget = ensureNumber(
    curatedFeatureOverrides.powerMicro.pueTarget ?? energySnapshot?.pueTarget,
    1.33
  );
  const annualGrowthPct = Math.max(0, ensureNumber(marketSnapshot?.inflationPct, 2.3));
  const baseOpexKrw = ensureNumber(asset.opexAssumptionKrw, capacityKw * 62000);
  const stageFactor = stageMultiplier[stage];
  const powerApprovalStatus =
    `${curatedFeatureOverrides.permitInputs.powerApprovalStatus ?? permitSnapshot?.powerApprovalStatus ?? ''} ${documentFeatureOverrides.permitStatusNote ?? curatedFeatureOverrides.permitInputs.timelineNote ?? ''}`.toLowerCase();
  const permitPenalty = powerApprovalStatus.includes('pending')
    ? 0.93
    : powerApprovalStatus.includes('denied')
      ? 0.88
      : 0.985;
  const effectiveFloodRiskScore =
    curatedFeatureOverrides.satelliteRisk.floodRiskScore ?? siteProfile?.floodRiskScore ?? null;
  const effectiveWildfireRiskScore =
    curatedFeatureOverrides.satelliteRisk.wildfireRiskScore ??
    siteProfile?.wildfireRiskScore ??
    null;
  const floodPenalty = effectiveFloodRiskScore
    ? Math.max(0.9, 1 - effectiveFloodRiskScore * 0.015)
    : 0.97;
  const wildfirePenalty = effectiveWildfireRiskScore
    ? Math.max(0.92, 1 - effectiveWildfireRiskScore * 0.01)
    : 0.985;
  const city = address?.city?.toLowerCase() ?? '';
  const locationPremium = city.includes('seoul') || city.includes('incheon') ? 1.04 : 1;
  const adjustedOccupancyPct = Math.min(
    98,
    Math.max(45, occupancyPct + macroGuidance.occupancyShiftPct)
  );
  const adjustedCapRatePct = Math.max(4, baseCapRatePct + macroGuidance.exitCapRateShiftPct);
  const adjustedDiscountRatePct = Math.max(
    6.5,
    baseDiscountRatePct + macroGuidance.discountRateShiftPct
  );
  const adjustedDebtCostPct = Math.max(3.75, baseDebtCostPct + macroGuidance.debtCostShiftPct);
  const adjustedAnnualGrowthPct = Math.max(0, annualGrowthPct + macroGuidance.growthShiftPct);

  return {
    bundle,
    stage,
    capacityMw,
    capacityKw,
    occupancyPct: adjustedOccupancyPct,
    baseMonthlyRatePerKwKrw,
    baseCapRatePct: adjustedCapRatePct,
    baseDiscountRatePct: adjustedDiscountRatePct,
    baseDebtCostPct: adjustedDebtCostPct,
    baseReplacementCostPerMwKrw: adjustedReplacementCostPerMwKrw,
    powerPriceKrwPerKwh,
    pueTarget,
    annualGrowthPct: adjustedAnnualGrowthPct,
    baseOpexKrw,
    stageFactor,
    permitPenalty,
    floodPenalty,
    wildfirePenalty,
    locationPremium,
    comparableCalibration,
    capexBreakdown,
    taxProfile: buildTaxProfile(bundle),
    spvProfile: buildSpvProfile(bundle),
    macroRegime,
    leases: bundle.leases ?? [],
    debtFacilities: bundle.debtFacilities ?? [],
    documentFeatureOverrides,
    curatedFeatureOverrides
  };
}
