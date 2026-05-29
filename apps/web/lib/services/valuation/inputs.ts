import type { CapexCategory } from '@prisma/client';
import type {
  CapexBreakdown,
  ComparableCalibration,
  BundleFeatureSnapshot,
  KoreanEntityType,
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

// ───────────────────────────────────────────────────────────────────────────
// Korea-specific tax-rate resolution
//
// These helpers replace the previous flat-rate placeholders (취득세 4.6%, 양도/
// exit 1%, 법인세 24.2% applied to every vehicle) with rates derived from the
// owning-entity type, location (과밀억제권역) and asset class. Everything here is
// an *underwriting estimate*, NOT a tax opinion — heavy comments cite the rule
// each rate comes from. All inference is from existing free-text fields; there
// are no new Prisma columns (see TODOs).
// ───────────────────────────────────────────────────────────────────────────

/**
 * Infer the owning-entity tax class from the free-text `legalStructure`.
 *
 * Korea taxes 법인 / 개인 / 리츠 / 부동산펀드 / PFV very differently. We key off
 * common Korean + English tokens. Default is CORPORATION because the platform
 * underwrites SPV (법인) acquisitions by default.
 */
export function inferKoreanEntityType(legalStructure: string | null | undefined): KoreanEntityType {
  const s = (legalStructure ?? '').toLowerCase();
  // 위탁관리 / 자기관리 / 기업구조조정 리츠 — REIT (부동산투자회사)
  if (s.includes('reit') || s.includes('리츠') || s.includes('부동산투자회사')) return 'REIT';
  // 부동산집합투자기구 / 사모·공모 부동산펀드
  if (
    s.includes('fund') ||
    s.includes('펀드') ||
    s.includes('집합투자') ||
    s.includes('ref') /* real-estate fund */
  ) {
    return 'FUND';
  }
  // 프로젝트금융투자회사 (PFV) — flow-through with 90% distribution deduction.
  if (s.includes('pfv') || s.includes('프로젝트금융') || s.includes('project financing vehicle')) {
    return 'PFV';
  }
  // 개인 / individual / sole proprietor
  if (s.includes('개인') || s.includes('individual') || s.includes('sole')) return 'INDIVIDUAL';
  return 'CORPORATION';
}

/**
 * Infer 과밀억제권역 (Seoul metropolitan over-concentration zone) membership from
 * free-text market / metro-region strings. The statutory zone covers Seoul, most
 * of 경기 (excluding designated growth/natural zones) and parts of 인천. Without a
 * first-class region flag we use a conservative keyword heuristic: any Seoul /
 * 수도권 / 경기 / 인천 token trips the 중과 bracket. False positives only *raise*
 * the modeled 취득세, which is the conservative direction for a buyer.
 */
export function inferCongestedZone(...locationStrings: Array<string | null | undefined>): boolean {
  const joined = locationStrings
    .filter((v): v is string => typeof v === 'string')
    .join(' ')
    .toLowerCase();
  return (
    joined.includes('seoul') ||
    joined.includes('서울') ||
    joined.includes('수도권') ||
    joined.includes('경기') ||
    joined.includes('gyeonggi') ||
    joined.includes('인천') ||
    joined.includes('incheon')
  );
}

// 취득세 brackets (2024 지방세법 기준, underwriting simplification).
//
//  - Standard commercial/business real estate (일반 부동산):
//      취득세 4.0% + 농어촌특별세 0.2% + 지방교육세 0.4% ≈ 4.6%.
//  - 법인 본점/주사무소가 과밀억제권역 내인 경우 일반 부동산 취득세 중과:
//      취득세율이 표준세율 + 중과기준세율(2%)×2 = 8.0% 로 가산되고, 부가세 포함
//      유효세율 ≈ 9.4% (8.0% + 농특세 0.2% + 지방교육세 가산분). 산업통상·실무
//      통용 9.4% 사용.
//  - 법인의 주택 취득(조정대상지역 등) 중과: 12% + 농특세/교육세 ≈ 13.4%.
//      개인 다주택과 달리 법인은 사실상 일률 12% 중과.
//  - 개인 일반 부동산은 중과 없이 4.6% (주택 1주택 1~3% 별도이나 본 엔진은
//      상업용 데이터센터 위주라 4.6% 표준 사용).
const ACQ_TAX_STANDARD_PCT = 4.6;
const ACQ_TAX_CORP_CONGESTED_COMMERCIAL_PCT = 9.4;
const ACQ_TAX_CORP_RESIDENTIAL_HEAVY_PCT = 13.4;

/**
 * Resolve the effective 취득세율 (acquisition-tax rate, %).
 *
 * Bracket logic (see ACQ_TAX_* constants for rate sources):
 *   - explicit `overridePct` (real `taxAssumption` data) always wins.
 *   - 법인 주택(MULTIFAMILY) ⇒ ~13.4% (법인 주택 중과).
 *   - 법인 + 과밀억제권역 + 상업/업무용 ⇒ ~9.4% (대도시 법인 중과).
 *   - everything else ⇒ 4.6% 표준.
 *
 * 리츠/펀드/PFV are treated like 법인 for 취득세 (no general 취득세 exemption in this
 * model; some 리츠 enjoy 감면 but it is conditional — conservatively NOT applied).
 */
export function resolveAcquisitionTaxPct(args: {
  entityType: KoreanEntityType;
  inCongestedZone: boolean;
  assetClass: string;
  overridePct?: number | null;
}): { ratePct: number; isOverride: boolean } {
  const { entityType, inCongestedZone, assetClass, overridePct } = args;
  if (typeof overridePct === 'number' && Number.isFinite(overridePct)) {
    return { ratePct: overridePct, isOverride: true };
  }

  const isCorporateFamily =
    entityType === 'CORPORATION' ||
    entityType === 'REIT' ||
    entityType === 'FUND' ||
    entityType === 'PFV';

  // 법인 주택 중과 (residential held by a corporation).
  if (isCorporateFamily && assetClass === 'MULTIFAMILY') {
    return { ratePct: ACQ_TAX_CORP_RESIDENTIAL_HEAVY_PCT, isOverride: false };
  }

  // 대도시(과밀억제권역) 법인 일반 부동산 중과.
  if (isCorporateFamily && inCongestedZone && assetClass !== 'LAND') {
    return { ratePct: ACQ_TAX_CORP_CONGESTED_COMMERCIAL_PCT, isOverride: false };
  }

  return { ratePct: ACQ_TAX_STANDARD_PCT, isOverride: false };
}

/**
 * Resolve the disposition / exit tax rate (%).
 *
 * The previous flat 1% placeholder was wrong for a 법인: a corporation's
 * disposal gain is folded into 각 사업연도 소득 and taxed at the 법인세율
 * (~24.2% incl. 지방소득세). Non-business land (비사업용 토지) carries an
 * additional +10~20%p 토지 등 양도소득 추가과세 surtax. We apply the corporate
 * rate as the base, plus an optional +20%p surtax when the asset is flagged as
 * non-business land.
 *
 *   - explicit `overridePct` (real data) always wins.
 *   - 개인 ⇒ 양도소득세 progressive; we cannot model brackets here without basis
 *     detail, so we fall back to the supplied `corporateTaxPct` proxy as a
 *     conservative single rate (documented limitation).
 *   - 법인/리츠/펀드/PFV ⇒ corporate rate (+ land surtax if applicable).
 *
 * Note: REIT/펀드 dispositions are largely sheltered at vehicle level by the 90%
 * distribution deduction, but we keep the gross corp rate here so the exit-tax
 * line is conservative; the pass-through relief is reflected in
 * `effectiveCorporateTaxPct` for *operating* income.
 */
const NON_BUSINESS_LAND_SURTAX_PCT = 20;

export function resolveExitTaxPct(args: {
  entityType: KoreanEntityType;
  corporateTaxPct: number;
  isNonBusinessLand?: boolean;
  overridePct?: number | null;
}): { ratePct: number; isOverride: boolean } {
  const { corporateTaxPct, isNonBusinessLand = false, overridePct } = args;
  if (typeof overridePct === 'number' && Number.isFinite(overridePct)) {
    return { ratePct: overridePct, isOverride: true };
  }
  const surtax = isNonBusinessLand ? NON_BUSINESS_LAND_SURTAX_PCT : 0;
  return { ratePct: corporateTaxPct + surtax, isOverride: false };
}

/**
 * REIT / 부동산펀드 / PFV vehicle-level 법인세 treatment.
 *
 * Under 법인세법 §51-2 / 자본시장법, a 위탁관리리츠·기업구조조정리츠·부동산집합
 * 투자기구·PFV that distributes 90%+ of distributable profit deducts that
 * distribution from taxable income, leaving vehicle-level 법인세 ≈ 0 (income is
 * taxed once, in investors' hands). We model the simplifying assumption that the
 * vehicle meets the 90% distribution test, so its effective corporate rate is 0.
 * Self-managed REITs (자기관리리츠) do NOT get this — but we cannot distinguish
 * them from text, so 위탁관리 is assumed (the common institutional structure).
 */
export function resolveEffectiveCorporateTaxPct(args: {
  entityType: KoreanEntityType;
  corporateTaxPct: number;
}): { ratePct: number; isPassThrough: boolean } {
  const { entityType, corporateTaxPct } = args;
  const isPassThrough = entityType === 'REIT' || entityType === 'FUND' || entityType === 'PFV';
  return { ratePct: isPassThrough ? 0 : corporateTaxPct, isPassThrough };
}

export function buildTaxProfile(bundle: UnderwritingBundle): TaxProfile {
  const corporateTaxPct = ensureNumber(bundle.taxAssumption?.corporateTaxPct, 24.2);
  const assetClass = bundle.asset.assetClass;

  const entityType = inferKoreanEntityType(bundle.spvStructure?.legalStructure);
  const inCongestedZone = inferCongestedZone(
    bundle.asset.market,
    bundle.marketSnapshot?.metroRegion,
    bundle.address?.city
  );

  // 취득세: keep the explicit override when present (don't clobber real data).
  const acq = resolveAcquisitionTaxPct({
    entityType,
    inCongestedZone,
    assetClass,
    overridePct: bundle.taxAssumption?.acquisitionTaxPct
  });

  // exit tax: reuse the corporate rate for a 법인 instead of the 1% placeholder.
  // LAND held by a corporation is treated as non-business land ⇒ +20%p surtax.
  const isNonBusinessLand = assetClass === 'LAND';
  const exit = resolveExitTaxPct({
    entityType,
    corporateTaxPct,
    isNonBusinessLand,
    overridePct: bundle.taxAssumption?.exitTaxPct
  });

  // REIT/펀드/PFV pass-through: vehicle-level 법인세 ≈ 0.
  const eff = resolveEffectiveCorporateTaxPct({ entityType, corporateTaxPct });

  const rateRationale = [
    `entity=${entityType}`,
    `과밀억제권역=${inCongestedZone}`,
    `취득세=${acq.ratePct}%${acq.isOverride ? '(override)' : ''}`,
    `exit=${exit.ratePct}%${exit.isOverride ? '(override)' : isNonBusinessLand ? '(corp+land surtax)' : '(corp rate)'}`,
    `법인세(vehicle)=${eff.ratePct}%${eff.isPassThrough ? '(pass-through)' : ''}`
  ].join('; ');

  return {
    // Public-facing acquisition/exit rates now carry the resolved 중과/corp values
    // so downstream consumers (synthetic-pro-forma, equity-waterfall) pick them up
    // without any change on their side.
    acquisitionTaxPct: acq.ratePct,
    vatRecoveryPct: ensureNumber(bundle.taxAssumption?.vatRecoveryPct, 90),
    propertyTaxPct: ensureNumber(bundle.taxAssumption?.propertyTaxPct, 0.35),
    insurancePct: ensureNumber(bundle.taxAssumption?.insurancePct, 0.12),
    // corporateTaxPct now reflects pass-through relief for REIT/펀드/PFV so that
    // equity-waterfall's vehicle-level 법인세 ≈ 0 for those structures.
    corporateTaxPct: eff.ratePct,
    withholdingTaxPct: ensureNumber(bundle.taxAssumption?.withholdingTaxPct, 15.4),
    exitTaxPct: exit.ratePct,
    entityType,
    inCongestedZone,
    isPassThroughVehicle: eff.isPassThrough,
    effectiveCorporateTaxPct: eff.ratePct,
    resolvedAcquisitionTaxPct: acq.ratePct,
    acquisitionTaxIsOverride: acq.isOverride,
    resolvedExitTaxPct: exit.ratePct,
    exitTaxIsOverride: exit.isOverride,
    rateRationale
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
