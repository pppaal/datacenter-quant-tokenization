import type {
  Address,
  AmortizationProfile,
  Asset,
  Counterparty,
  CreditAssessment,
  AssetFeatureSnapshot,
  AssetStage,
  BuildingSnapshot,
  CapexCategory,
  CapexLineItem,
  ComparableEntry,
  ComparableSet,
  DebtDraw,
  DebtFacility,
  DebtFacilityType,
  EnergySnapshot,
  FeatureValue,
  FinancialStatement,
  Lease,
  LeaseStatus,
  LeaseStep,
  MarketIndicatorSeries,
  MarketSnapshot,
  MacroSeries,
  OfficeDetail,
  PermitSnapshot,
  RentComp,
  SiteProfile,
  SpvStructure,
  TaxAssumption,
  TransactionComp
} from '@prisma/client';
import type { ProvenanceEntry } from '@/lib/sources/types';
import type { MacroProfileRuntimeRules } from '@/lib/services/macro/profile-registry';
import type { MacroInterpretation } from '@/lib/services/macro/regime';

export type BundleComparableSet =
  | (ComparableSet & {
      entries: ComparableEntry[];
    })
  | null;

export type BundleLeaseStep = LeaseStep & {
  rentFreeMonths: number | null;
  renewProbabilityPct: number | null;
  rolloverDowntimeMonths: number | null;
  renewalRentFreeMonths: number | null;
  renewalTermYears: number | null;
  renewalCount: number | null;
  markToMarketRatePerKwKrw: number | null;
  renewalTenantImprovementKrw: number | null;
  renewalLeasingCommissionKrw: number | null;
  tenantImprovementKrw: number | null;
  leasingCommissionKrw: number | null;
  recoverableOpexRatioPct: number | null;
  fixedRecoveriesKrw: number | null;
  expenseStopKrwPerKwMonth: number | null;
  utilityPassThroughPct: number | null;
};

export type BundleLease = Lease & {
  renewProbabilityPct: number | null;
  rolloverDowntimeMonths: number | null;
  renewalRentFreeMonths: number | null;
  renewalTermYears: number | null;
  renewalCount: number | null;
  markToMarketRatePerKwKrw: number | null;
  renewalTenantImprovementKrw: number | null;
  renewalLeasingCommissionKrw: number | null;
  steps: BundleLeaseStep[];
};

export type BundleDebtFacility = DebtFacility & {
  draws: DebtDraw[];
};

export type BundleFeatureSnapshot = AssetFeatureSnapshot & {
  values: FeatureValue[];
};

export type BundleCreditAssessment = CreditAssessment & {
  counterparty: Counterparty;
  financialStatement?: FinancialStatement | null;
};

export type UnderwritingBundle = {
  asset: Asset;
  address: Address | null;
  siteProfile: SiteProfile | null;
  buildingSnapshot: BuildingSnapshot | null;
  permitSnapshot: PermitSnapshot | null;
  energySnapshot: EnergySnapshot | null;
  marketSnapshot: MarketSnapshot | null;
  transactionComps?: TransactionComp[];
  rentComps?: RentComp[];
  marketIndicatorSeries?: MarketIndicatorSeries[];
  macroSeries?: MacroSeries[];
  officeDetail?: OfficeDetail | null;
  comparableSet?: BundleComparableSet;
  capexLineItems?: CapexLineItem[];
  leases?: BundleLease[];
  taxAssumption?: TaxAssumption | null;
  spvStructure?: SpvStructure | null;
  debtFacilities?: BundleDebtFacility[];
  featureSnapshots?: BundleFeatureSnapshot[];
  creditAssessments?: BundleCreditAssessment[];
};

export type UnderwritingScenario = {
  name: 'Bull' | 'Base' | 'Bear';
  valuationKrw: number;
  impliedYieldPct: number;
  exitCapRatePct: number;
  debtServiceCoverage: number;
  notes: string;
  scenarioOrder: number;
};

export type UnderwritingAnalysis = {
  asset: {
    name: string;
    assetCode: string;
    assetClass: string;
    stage: string;
    market: string;
  };
  baseCaseValueKrw: number;
  confidenceScore: number;
  underwritingMemo: string;
  keyRisks: string[];
  ddChecklist: string[];
  assumptions: Record<string, unknown>;
  provenance: ProvenanceEntry[];
  scenarios: UnderwritingScenario[];
};

export type ValuationStrategyContext = {
  profileRules?: MacroProfileRuntimeRules;
};

export type ComparableCalibration = {
  entryCount: number;
  weightedCapRatePct: number | null;
  weightedMonthlyRatePerKwKrw: number | null;
  weightedDiscountRatePct: number | null;
  weightedValuePerMwKrw: number | null;
  directComparableValueKrw: number | null;
};

export type CapexBreakdown = {
  totalCapexKrw: number;
  landValueKrw: number;
  shellCoreKrw: number;
  electricalKrw: number;
  mechanicalKrw: number;
  itFitOutKrw: number;
  softCostKrw: number;
  contingencyKrw: number;
  hardCostKrw: number;
  embeddedCostKrw: number;
};

export type TaxProfile = {
  acquisitionTaxPct: number;
  vatRecoveryPct: number;
  propertyTaxPct: number;
  insurancePct: number;
  corporateTaxPct: number;
  withholdingTaxPct: number;
  exitTaxPct: number;
};

export type SpvProfile = {
  legalStructure: string;
  managementFeePct: number;
  performanceFeePct: number;
  promoteThresholdPct: number;
  promoteSharePct: number;
  reserveTargetMonths: number;
};

export type PreparedUnderwritingInputs = {
  bundle: UnderwritingBundle;
  stage: AssetStage;
  capacityMw: number;
  capacityKw: number;
  occupancyPct: number;
  baseMonthlyRatePerKwKrw: number;
  baseCapRatePct: number;
  baseDiscountRatePct: number;
  baseDebtCostPct: number;
  baseReplacementCostPerMwKrw: number;
  powerPriceKrwPerKwh: number;
  pueTarget: number;
  annualGrowthPct: number;
  baseOpexKrw: number;
  stageFactor: number;
  permitPenalty: number;
  floodPenalty: number;
  wildfirePenalty: number;
  locationPremium: number;
  comparableCalibration: ComparableCalibration;
  capexBreakdown: CapexBreakdown;
  taxProfile: TaxProfile;
  spvProfile: SpvProfile;
  macroRegime: MacroInterpretation;
  leases: BundleLease[];
  debtFacilities: BundleDebtFacility[];
  documentFeatureOverrides: {
    occupancyPct: number | null;
    monthlyRatePerKwKrw: number | null;
    capRatePct: number | null;
    discountRatePct: number | null;
    capexKrw: number | null;
    contractedKw: number | null;
    permitStatusNote: string | null;
    sourceVersion: string | null;
  };
  curatedFeatureOverrides: {
    marketInputs: {
      monthlyRatePerKwKrw: number | null;
      capRatePct: number | null;
      discountRatePct: number | null;
      debtCostPct: number | null;
      constructionCostPerMwKrw: number | null;
      note: string | null;
      sourceVersion: string | null;
    };
    satelliteRisk: {
      floodRiskScore: number | null;
      wildfireRiskScore: number | null;
      climateNote: string | null;
      sourceVersion: string | null;
    };
    permitInputs: {
      permitStage: string | null;
      powerApprovalStatus: string | null;
      timelineNote: string | null;
      sourceVersion: string | null;
    };
    powerMicro: {
      utilityName: string | null;
      substationDistanceKm: number | null;
      tariffKrwPerKwh: number | null;
      renewableAvailabilityPct: number | null;
      pueTarget: number | null;
      backupFuelHours: number | null;
      sourceVersion: string | null;
    };
    revenueMicro: {
      primaryTenant: string | null;
      leasedKw: number | null;
      baseRatePerKwKrw: number | null;
      termYears: number | null;
      probabilityPct: number | null;
      annualEscalationPct: number | null;
      sourceVersion: string | null;
    };
    legalMicro: {
      ownerName: string | null;
      ownerEntityType: string | null;
      ownershipPct: number | null;
      encumbranceType: string | null;
      encumbranceHolder: string | null;
      securedAmountKrw: number | null;
      priorityRank: number | null;
      constraintType: string | null;
      constraintTitle: string | null;
      constraintSeverity: string | null;
      sourceVersion: string | null;
    };
    reviewReadiness: {
      readinessStatus: string | null;
      reviewPhase: string | null;
      legalStructure: string | null;
      nextAction: string | null;
      sourceVersion: string | null;
    };
  };
};

export type ScenarioInput = {
  name: UnderwritingScenario['name'];
  scenarioOrder: number;
  note: string;
  revenueFactor: number;
  capRateShiftPct: number;
  discountRateShiftPct: number;
  costFactor: number;
  floorFactor: number;
  leaseProbabilityBumpPct: number;
  debtSpreadBumpPct: number;
};

export type CostApproachResult = {
  replacementCostKrw: number;
  replacementCostFloorKrw: number;
  directComparableValueKrw: number | null;
};

export type LeaseCashFlowYear = {
  year: number;
  occupiedKw: number;
  contractedKw: number;
  residualOccupiedKw: number;
  grossPotentialRevenueKrw: number;
  contractedRevenueKrw: number;
  renewalRevenueKrw: number;
  residualRevenueKrw: number;
  downtimeLossKrw: number;
  renewalDowntimeLossKrw: number;
  rentFreeLossKrw: number;
  renewalRentFreeLossKrw: number;
  fixedRecoveriesKrw: number;
  siteRecoveriesKrw: number;
  utilityPassThroughRevenueKrw: number;
  reimbursementRevenueKrw: number;
  totalOperatingRevenueKrw: number;
  revenueKrw: number;
  powerCostKrw: number;
  siteOperatingExpenseKrw: number;
  nonRecoverableOperatingExpenseKrw: number;
  maintenanceReserveKrw: number;
  operatingExpenseKrw: number;
  tenantImprovementKrw: number;
  leasingCommissionKrw: number;
  tenantCapitalCostKrw: number;
  renewalTenantCapitalCostKrw: number;
  fitOutCostKrw: number;
  noiKrw: number;
  cfadsBeforeDebtKrw: number;
  activeRenewalLeaseCount: number;
  weightedRenewalRatePerKwKrw: number | null;
};

export type LeaseDcfResult = {
  years: LeaseCashFlowYear[];
  annualRevenueKrw: number;
  annualOpexKrw: number;
  stabilizedNoiKrw: number;
  incomeApproachValueKrw: number;
  leaseDrivenValueKrw: number;
  terminalValueKrw: number;
  terminalYear: number;
};

export type DebtScheduleYear = {
  year: number;
  drawAmountKrw: number;
  openingBalanceKrw: number;
  interestKrw: number;
  principalKrw: number;
  debtServiceKrw: number;
  endingBalanceKrw: number;
  dscr: number | null;
};

export type DebtScheduleResult = {
  years: DebtScheduleYear[];
  initialDebtFundingKrw: number;
  weightedInterestRatePct: number;
  reserveRequirementKrw: number;
  endingDebtBalanceKrw: number;
};

export type EquityWaterfallYear = {
  year: number;
  propertyTaxKrw: number;
  insuranceKrw: number;
  managementFeeKrw: number;
  reserveContributionKrw: number;
  debtServiceKrw: number;
  corporateTaxKrw: number;
  afterTaxDistributionKrw: number;
};

export type EquityWaterfallResult = {
  years: EquityWaterfallYear[];
  leveredEquityValueKrw: number;
  enterpriseEquivalentValueKrw: number;
  grossExitValueKrw: number;
  promoteFeeKrw: number;
  exitTaxKrw: number;
  netExitProceedsKrw: number;
};

export type ProFormaSummary = {
  annualRevenueKrw: number;
  annualOpexKrw: number;
  stabilizedNoiKrw: number;
  terminalValueKrw: number;
  terminalYear: number;
  reserveRequirementKrw: number;
  endingDebtBalanceKrw: number;
  grossExitValueKrw: number;
  netExitProceedsKrw: number;
  leveredEquityValueKrw: number;
};

export type ProFormaYear = {
  year: number;
  occupiedKw: number;
  contractedKw: number;
  residualOccupiedKw: number;
  grossPotentialRevenueKrw: number;
  contractedRevenueKrw: number;
  renewalRevenueKrw: number;
  residualRevenueKrw: number;
  downtimeLossKrw: number;
  renewalDowntimeLossKrw: number;
  rentFreeLossKrw: number;
  renewalRentFreeLossKrw: number;
  fixedRecoveriesKrw: number;
  siteRecoveriesKrw: number;
  utilityPassThroughRevenueKrw: number;
  reimbursementRevenueKrw: number;
  totalOperatingRevenueKrw: number;
  revenueKrw: number;
  powerCostKrw: number;
  siteOperatingExpenseKrw: number;
  nonRecoverableOperatingExpenseKrw: number;
  maintenanceReserveKrw: number;
  operatingExpenseKrw: number;
  tenantImprovementKrw: number;
  leasingCommissionKrw: number;
  tenantCapitalCostKrw: number;
  renewalTenantCapitalCostKrw: number;
  fitOutCostKrw: number;
  noiKrw: number;
  cfadsBeforeDebtKrw: number;
  activeRenewalLeaseCount: number;
  weightedRenewalRatePerKwKrw: number | null;
  drawAmountKrw: number;
  interestKrw: number;
  principalKrw: number;
  debtServiceKrw: number;
  endingDebtBalanceKrw: number;
  dscr: number | null;
  propertyTaxKrw: number;
  insuranceKrw: number;
  managementFeeKrw: number;
  reserveContributionKrw: number;
  corporateTaxKrw: number;
  afterTaxDistributionKrw: number;
};

export type ProFormaBaseCase = {
  summary: ProFormaSummary;
  years: ProFormaYear[];
};

export type LineItemCategory = CapexCategory;
export type FacilityType = DebtFacilityType;
export type FacilityAmortization = AmortizationProfile;
export type TenantLeaseStatus = LeaseStatus;
