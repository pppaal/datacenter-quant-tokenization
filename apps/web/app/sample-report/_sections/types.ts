// Shared prop/data types for the sample-report (Investment Memo) section
// components.
//
// `SampleReportData` is the single bundle the top-level page assembles and
// hands to each section component. Every field type is INFERRED from the
// canonical service function it comes from (via `ReturnType` / `Awaited`), so
// the section components stay strongly typed without restating any shapes —
// when a service return type changes these follow automatically.

import type { resolveDisplayCurrency } from '@/lib/finance/currency';
import type { getSampleReport } from '@/lib/services/dashboard';
import type { getAssetBySlug } from '@/lib/services/assets';
import type { getValuationRecommendation } from '@/lib/services/valuation/recommendation';
import type {
  computeReturnsSnapshot,
  computeLeaseRollSummary,
  computeCapitalStructure,
  pickMacroBackdrop,
  rollupTenantCredit
} from '@/lib/services/im/sections';
import type { readStoredBaseCaseProForma } from '@/lib/services/valuation/pro-forma';
import type {
  readUnderwritingAssumptions,
  readCapexBreakdown
} from '@/lib/services/im/assumptions';
import type { getSponsorTrackByName } from '@/lib/services/im/sponsor';
import type { buildConfidenceBreakdown } from '@/lib/services/im/confidence';
import type { buildScenarioDiff } from '@/lib/services/im/scenario-diff';
import type { pickMatrixRuns } from '@/lib/services/im/sensitivity';
import type { readMacroGuidance } from '@/lib/services/im/macro-guidance';
import type { buildCounterpartyRollup } from '@/lib/services/im/counterparty-rollup';
import type { buildEsgSummary, buildEmissionsBreakdown } from '@/lib/services/im/esg';
import type { buildTaxWalk } from '@/lib/services/im/tax-walk';
import type { buildFxExposure } from '@/lib/services/im/fx-exposure';
import type { buildInsuranceSummary } from '@/lib/services/im/insurance';
import type { buildAuditTrail } from '@/lib/services/im/audit-trail';
import type { buildCapitalCallSchedule } from '@/lib/services/im/capital-calls';
import type { buildSupplyDemand } from '@/lib/services/research/supply-demand';
import type { fitHedonic, CompRow as HedonicCompRow } from '@/lib/services/research/hedonic';
import type { pickProvenanceForCard } from '@/lib/services/im/provenance-map';
import type {
  decomposeCapRate,
  estimateSubmarketSpread
} from '@/lib/services/research/cap-rate-decomposition';

export type SampleReportAsset = NonNullable<Awaited<ReturnType<typeof getSampleReport>>>;
export type CompareAsset = NonNullable<Awaited<ReturnType<typeof getAssetBySlug>>>;
export type LatestRun = SampleReportAsset['valuations'][number];

export type ProvenanceEntry = {
  field: string;
  sourceSystem: string;
  value: unknown;
  mode: string;
  freshnessLabel: string;
};

type CardProvenance = ReturnType<typeof pickProvenanceForCard>;

/**
 * The complete data bundle assembled by the top-level page and threaded into
 * the co-located section components. Field order mirrors the data-prep block in
 * `page.tsx`.
 */
export type SampleReportData = {
  asset: SampleReportAsset;
  latestRun: LatestRun;

  compareAsset: CompareAsset | null;
  compareLatestRun: CompareAsset['valuations'][number] | null;
  compareProForma: ReturnType<typeof readStoredBaseCaseProForma> | null;
  compareReturnsSnapshot: ReturnType<typeof computeReturnsSnapshot> | null;
  compareLeaseRoll: ReturnType<typeof computeLeaseRollSummary> | null;

  scenarios: NonNullable<LatestRun['scenarios']>;
  provenance: ProvenanceEntry[];
  bullValue: number | null;
  bearValue: number | null;
  recommendation: ReturnType<typeof getValuationRecommendation>;
  isDataCenter: boolean;
  displayCurrency: ReturnType<typeof resolveDisplayCurrency>;
  fxRateToKrw: number | undefined;

  macroBackdrop: ReturnType<typeof pickMacroBackdrop>;
  leaseRoll: ReturnType<typeof computeLeaseRollSummary>;
  capStack: ReturnType<typeof computeCapitalStructure>;
  returnsSnapshot: ReturnType<typeof computeReturnsSnapshot>;
  tenantCredit: ReturnType<typeof rollupTenantCredit>;

  macroByKey: Record<string, number>;
  submarketSpread: ReturnType<typeof estimateSubmarketSpread>;
  capRateDecomp: ReturnType<typeof decomposeCapRate> | null;
  proForma: ReturnType<typeof readStoredBaseCaseProForma>;
  underwriting: ReturnType<typeof readUnderwritingAssumptions>;
  capexBreakdown: ReturnType<typeof readCapexBreakdown>;
  sponsorTrack: Awaited<ReturnType<typeof getSponsorTrackByName>>;

  provenanceByCard: {
    valuationRates: CardProvenance;
    capitalStructure: CardProvenance;
    tenancy: CardProvenance;
    capex: CardProvenance;
    macro: CardProvenance;
    scenarioEngine: CardProvenance;
  };

  scenarioDiff: ReturnType<typeof buildScenarioDiff>;
  sensitivityGrids: ReturnType<typeof pickMatrixRuns>;
  confidenceBreakdown: ReturnType<typeof buildConfidenceBreakdown>;
  macroGuidance: ReturnType<typeof readMacroGuidance>;

  sponsorCps: SampleReportAsset['counterparties'];
  tenantCps: SampleReportAsset['counterparties'];
  sponsorRollup: ReturnType<typeof buildCounterpartyRollup>;
  tenantRollup: ReturnType<typeof buildCounterpartyRollup>;
  esgSummary: ReturnType<typeof buildEsgSummary>;
  investmentBasisKrw: number;
  taxWalk: ReturnType<typeof buildTaxWalk>;
  fxExposure: ReturnType<typeof buildFxExposure>;
  emissionsBreakdown: ReturnType<typeof buildEmissionsBreakdown>;
  insuranceSummary: ReturnType<typeof buildInsuranceSummary>;
  auditTrail: Awaited<ReturnType<typeof buildAuditTrail>>;

  initialEquityKrw: number;
  capitalCalls: ReturnType<typeof buildCapitalCallSchedule> | null;

  marketTxComps: SampleReportAsset['transactionComps'];
  marketRentComps: SampleReportAsset['rentComps'];
  txCompsToShow: SampleReportAsset['transactionComps'];
  rentCompsToShow: SampleReportAsset['rentComps'];

  hedonicCompInputs: HedonicCompRow[];
  hedonicTargetSize: number | null;
  hedonicFit: ReturnType<typeof fitHedonic>;

  marketPipeline: SampleReportAsset['pipelineProjects'];
  pipelineToShow: SampleReportAsset['pipelineProjects'];

  supplyDemandUnit: 'MW' | 'sqm';
  startingSupply: number;
  demandGrowthPct: number;
  supplyDemandModel: ReturnType<typeof buildSupplyDemand> | null;
};
