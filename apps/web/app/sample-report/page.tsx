import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AssetClass } from '@prisma/client';
import { formatCurrencyFromKrwAtRate, resolveDisplayCurrency } from '@/lib/finance/currency';
import { ImPrintMode } from '@/components/marketing/im-print-mode';
import { ImToc } from '@/components/marketing/im-toc';
import { PrintImButton } from '@/components/marketing/print-im-button';
import { SiteNav } from '@/components/marketing/site-nav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfidenceBreakdown } from '@/components/valuation/confidence-breakdown';
import { ValuationBreakdown } from '@/components/valuation/valuation-breakdown';
import { ValuationProvenance } from '@/components/valuation/valuation-provenance';
import { ValuationSignals } from '@/components/valuation/valuation-signals';
import { prisma } from '@/lib/db/prisma';
import { getAssetBySlug } from '@/lib/services/assets';
import { getSampleReport } from '@/lib/services/dashboard';
import { getFxRateMap } from '@/lib/services/fx';
import {
  computeCapitalStructure,
  computeLeaseRollSummary,
  computeReturnsSnapshot,
  formatMacroValue,
  pickMacroBackdrop,
  rollupTenantCredit
} from '@/lib/services/im/sections';
import { getSponsorTrackByName } from '@/lib/services/im/sponsor';
import { readCapexBreakdown, readUnderwritingAssumptions } from '@/lib/services/im/assumptions';
import { buildConfidenceBreakdown } from '@/lib/services/im/confidence';
import {
  buildBalanceSheet,
  buildCreditRatios,
  buildIncomeStatement,
  buildSensitivityMatrix,
  projectFinancials
} from '@/lib/services/im/credit-analysis';
import {
  buildCashFlowSlice,
  DEFAULT_CASH_FLOW_ASSUMPTIONS,
  projectCfadsDscr
} from '@/lib/services/im/cash-flow';
import { buildAuditTrail } from '@/lib/services/im/audit-trail';
import { buildCapitalCallSchedule } from '@/lib/services/im/capital-calls';
import { buildCounterpartyRollup } from '@/lib/services/im/counterparty-rollup';
import {
  buildCovenantAlerts,
  buildCovenantHeadroom
} from '@/lib/services/im/covenant';
import { buildEmissionsBreakdown, buildEsgSummary } from '@/lib/services/im/esg';
import { buildInsuranceSummary } from '@/lib/services/im/insurance';
import { buildFxExposure } from '@/lib/services/im/fx-exposure';
import { buildLiquidityLadder } from '@/lib/services/im/liquidity';
import { buildPeerComparison, pickSectorKey } from '@/lib/services/im/peer-benchmarks';
import {
  pickDebtAmortizationPct,
  pickInterestRatePct,
  pickRevenueGrowthPct
} from '@/lib/services/im/projection-inputs';
import { buildTaxWalk } from '@/lib/services/im/tax-walk';
import { buildWaterfall, readSpvFromAssumptions } from '@/lib/services/im/waterfall';
import { classifyFreshness } from '@/lib/services/im/freshness';
import { describeHazard } from '@/lib/services/im/hazard';
import { readMacroGuidance } from '@/lib/services/im/macro-guidance';
import { buildScenarioDiff } from '@/lib/services/im/scenario-diff';
import { pickMatrixRuns } from '@/lib/services/im/sensitivity';
import { pickProvenanceForCard, summarizeProvenance } from '@/lib/services/im/provenance-map';
import {
  decomposeCapRate,
  estimateSubmarketSpread
} from '@/lib/services/research/cap-rate-decomposition';
import { fitHedonic, type CompRow as HedonicCompRow } from '@/lib/services/research/hedonic';
import {
  buildSupplyDemand,
  type PipelineProjectInput
} from '@/lib/services/research/supply-demand';
import { readStoredBaseCaseProForma } from '@/lib/services/valuation/pro-forma';
import { formatDate, formatNumber, formatPercent } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type ProvenanceEntry = {
  field: string;
  sourceSystem: string;
  value: unknown;
  mode: string;
  freshnessLabel: string;
};

function getRecommendation(confidenceScore?: number | null) {
  if ((confidenceScore ?? 0) >= 75) return 'Proceed To Committee';
  if ((confidenceScore ?? 0) >= 55) return 'Proceed With Conditions';
  return 'Further Diligence Required';
}

const glossary = [
  {
    term: 'Base Case Value',
    ko: '기본 시나리오 가치',
    body: '평가 엔진이 산출한 기본(중립) 시나리오 추정 가치. 위원회 논의의 기준선으로 사용되며, Bull/Bear 시나리오의 폭이 함께 제시됩니다.'
  },
  {
    term: 'Bull / Bear Case',
    ko: '상방 / 하방 시나리오',
    body: '시장 · 임대 · 자본비용 가정의 낙관/비관 케이스에서 산출된 가치. 기본 시나리오 대비 스프레드가 IC 토론의 리스크 한계를 정의합니다.'
  },
  {
    term: 'Implied Yield',
    ko: '암시 수익률',
    body: '평가 가치와 운영 NOI를 기반으로 역산된 수익률. 매입 가격 대비 운영 단계에서 기대되는 현금 수익률을 나타냅니다.'
  },
  {
    term: 'Exit Cap Rate',
    ko: '엑시트 캡레이트',
    body: '보유 종료 시점의 매각 가정 캡레이트. 잔존 가치(terminal value) 산정의 핵심 입력이며, 시장 캡레이트 대비 보수적/공격적 정도를 보여줍니다.'
  },
  {
    term: 'DSCR',
    ko: '부채상환계수 (Debt Service Coverage Ratio)',
    body: '운영 NOI를 연간 원리금 상환액으로 나눈 값. 1.00 이하는 부채 상환 부족, 1.20–1.50이 일반적인 대출 커버넌트 기준.'
  },
  {
    term: 'Confidence Score',
    ko: '신뢰 점수',
    body: '데이터 커버리지 · 신선도 · 폴백 사용 여부를 종합한 평가 신뢰도(0–100). 75 이상은 위원회 진행, 55–75는 조건부, 55 미만은 추가 실사 권고.'
  },
  {
    term: 'Provenance',
    ko: '출처 추적',
    body: '평가 입력값마다 어떤 시스템 · 보고서에서 왔는지, 언제 수집되었는지, 폴백 값인지 여부를 기록한 메타데이터. 위원회가 보는 모든 숫자의 추적 단위입니다.'
  },
  {
    term: 'Model Version',
    ko: '모델 버전',
    body: '평가를 산출한 모델의 버전 식별자. 같은 자산이라도 모델 버전이 다르면 가정 트리 · 가중치가 달라질 수 있어 비교 시 항상 함께 표기합니다.'
  }
];

export default async function SampleReportPage({
  searchParams
}: {
  searchParams?: Promise<{ compare?: string }>;
}) {
  const asset = await getSampleReport();
  if (!asset) notFound();

  const latestRun = asset.valuations[0];
  if (!latestRun) notFound();

  // Optional compare asset: ?compare=<slug> renders a side-by-side
  // strip below the cover with the other asset's headline KPIs.
  const compareSlug = (await searchParams)?.compare?.trim();
  const compareAsset =
    compareSlug && compareSlug !== asset.slug ? await getAssetBySlug(compareSlug) : null;
  const compareLatestRun = compareAsset?.valuations[0] ?? null;
  const compareProForma = compareLatestRun
    ? readStoredBaseCaseProForma(compareLatestRun.assumptions)
    : null;
  const compareReturnsSnapshot = compareLatestRun
    ? computeReturnsSnapshot(compareLatestRun.scenarios ?? [])
    : null;
  const compareLeaseRoll = compareAsset
    ? computeLeaseRollSummary(compareAsset.leases ?? [])
    : null;

  const scenarios = latestRun.scenarios ?? [];
  const provenance = Array.isArray(latestRun.provenance)
    ? (latestRun.provenance as ProvenanceEntry[])
    : [];
  const bullValue = scenarios[0]?.valuationKrw ?? null;
  const bearValue = scenarios[2]?.valuationKrw ?? null;
  const recommendation = getRecommendation(latestRun.confidenceScore);
  const isDataCenter = asset.assetClass === AssetClass.DATA_CENTER;
  const displayCurrency = resolveDisplayCurrency(asset.address?.country ?? asset.market);
  const fxRateToKrw = (await getFxRateMap([displayCurrency]))[displayCurrency];

  // REPE-grade IM section data. All inputs come from the asset bundle
  // already loaded by getSampleReport (macroSeries / leases /
  // debtFacilities / spvStructure / creditAssessments) — this layer
  // just shapes them into the cards a Blackstone / Brookfield / KKR
  // IM expects to see.
  const macroBackdrop = pickMacroBackdrop(asset.macroSeries ?? []);
  const leaseRoll = computeLeaseRollSummary(asset.leases ?? []);
  const capStack = computeCapitalStructure(asset.debtFacilities ?? []);
  const returnsSnapshot = computeReturnsSnapshot(scenarios);
  const tenantCredit = rollupTenantCredit(asset.creditAssessments ?? []);

  // Cap rate decomposition — feeds Underwriting assumptions card.
  // Inputs derived from the asset's own macro series + comp spread.
  const macroByKey: Record<string, number> = {};
  for (const point of asset.macroSeries ?? []) {
    if (typeof point.value === 'number' && Number.isFinite(point.value)) {
      macroByKey[point.seriesKey] = point.value;
    }
  }
  const submarketSpread = estimateSubmarketSpread({
    comps: (asset.transactionComps && asset.transactionComps.length > 0
      ? asset.transactionComps
      : []
    ).map((c) => ({
      submarket: c.region ?? null,
      capRatePct: c.capRatePct ?? null
    })),
    targetSubmarket: asset.address?.district ?? asset.market ?? 'KR',
    minComps: 3
  });
  const capRateDecomp =
    typeof macroByKey.policy_rate_pct === 'number'
      ? decomposeCapRate({
          riskFreeRatePct: macroByKey.gov_yield_10y_pct ?? macroByKey.policy_rate_pct,
          equityRiskPremiumPct: 5.0,
          sectorBeta:
            asset.assetClass === 'DATA_CENTER'
              ? 0.45
              : asset.assetClass === 'OFFICE'
                ? 0.6
                : 0.5,
          submarketSpreadPct: submarketSpread.spreadPct,
          growthExpectationPct:
            (macroByKey.rent_growth_pct ?? 0) +
            (macroByKey.inflation_pct ? macroByKey.inflation_pct * 0.5 : 0),
          transactionVolumeIndex: macroByKey.transaction_volume_index ?? 100,
          vintageYear:
            asset.buildingRecords?.[0]?.completionDate
              ? new Date(asset.buildingRecords[0].completionDate).getFullYear()
              : new Date().getFullYear(),
          referenceYear: new Date().getFullYear()
        })
      : null;
  // Year-by-year proForma comes off the stored ValuationRun.assumptions
  // blob; the engine writes it via buildStoredBaseCaseProForma at run
  // time so the IM doesn't need to re-execute the model. Null here just
  // means the assumptions blob predates the stored-proforma update — the
  // S&U / P&L / IRR cards render an empty state when that happens.
  const proForma = readStoredBaseCaseProForma(latestRun.assumptions);
  // The base-case scenario inputs the engine fed into proForma.
  // Surfaced so an LP can answer "WHY this cap rate / discount rate /
  // promote structure" without re-running the model.
  const underwriting = readUnderwritingAssumptions(latestRun.assumptions);
  const capexBreakdown = readCapexBreakdown(latestRun.assumptions);
  // Sponsor track record auto-links by case-insensitive name match on
  // Asset.sponsorName so creating a Sponsor row immediately surfaces in
  // the IM without an FK migration on the asset.
  const sponsorTrack = await getSponsorTrackByName(asset.sponsorName ?? null);

  // Per-card provenance: filter the persisted provenance entries to
  // each card's relevant fields so the LP sees the source pill inline.
  const provenanceByCard = {
    valuationRates: pickProvenanceForCard(latestRun.provenance, 'valuationRates'),
    capitalStructure: pickProvenanceForCard(latestRun.provenance, 'capitalStructure'),
    tenancy: pickProvenanceForCard(latestRun.provenance, 'tenancy'),
    capex: pickProvenanceForCard(latestRun.provenance, 'capex'),
    macro: pickProvenanceForCard(latestRun.provenance, 'macro'),
    scenarioEngine: pickProvenanceForCard(latestRun.provenance, 'scenarioEngine')
  };

  // Scenario diff: Bull/Bear shifts vs base — implied yield bps,
  // exit cap bps, DSCR delta. Lets the LP see WHAT moved between
  // scenarios, not just the value spread.
  const scenarioDiff = buildScenarioDiff(scenarios);

  // Two-way sensitivity matrices the engine persisted with this run.
  // Typical: occupancy x exit cap (value), NOI x debt cost (DSCR).
  const sensitivityGrids = pickMatrixRuns(latestRun.sensitivityRuns ?? []);

  // Confidence-score breakdown — which signals the bundle has, which
  // it doesn't, so an LP can answer "what would push this to 9?"
  const confidenceBreakdown = buildConfidenceBreakdown(asset, latestRun.confidenceScore);

  // Macro-regime engine guidance — the per-dimension shifts the
  // engine applied (discount/exit cap/debt cost/occupancy/growth/
  // replacement cost) plus its narrative summary.
  const macroGuidance = readMacroGuidance(latestRun.provenance);

  // Tier 3 page-level derivations:
  // - Counterparty portfolio rollup
  // - ESG summary from EnergySnapshot
  // - Tax leakage walk over hold
  // - FX exposure for foreign LPs
  // Split rollup by role — sponsor and tenant credits are different
  // risk types (sponsor underwrites the deal, tenants pay rent), so an
  // aggregate that mixes both is misleading. The IM renders two strips.
  const sponsorCps = (asset.counterparties ?? []).filter((c) => c.role === 'SPONSOR');
  const tenantCps = (asset.counterparties ?? []).filter((c) => c.role === 'TENANT');
  const sponsorRollup = buildCounterpartyRollup(sponsorCps);
  const tenantRollup = buildCounterpartyRollup(tenantCps);
  const esgSummary = buildEsgSummary(asset.energySnapshot ?? null);
  // Use the underwriting all-in basis (purchase + capex) as the
  // investment basis when purchasePriceKrw is not set on the asset
  // — for development assets the engine carries the basis as the
  // capex assumption / proForma initial outflow.
  const investmentBasisKrw =
    (asset.purchasePriceKrw ?? 0) > 0
      ? asset.purchasePriceKrw!
      : proForma
        ? (proForma.summary.initialDebtFundingKrw ?? 0) +
          (proForma.summary.initialEquityKrw ?? 0)
        : (asset.capexAssumptionKrw ?? 0);
  const taxWalk = buildTaxWalk(asset.taxAssumption ?? null, {
    purchasePriceKrw: investmentBasisKrw,
    cumulativeNoiKrw: proForma
      ? proForma.years.reduce((sum, y) => sum + y.noiKrw, 0)
      : 0,
    exitValueKrw: proForma?.summary.grossExitValueKrw ?? 0,
    holdYears: proForma?.years.length ?? 10,
    basisSource:
      (asset.purchasePriceKrw ?? 0) > 0 ? 'purchase_price' : 'capex_total'
  });
  const fxExposure = buildFxExposure(latestRun.baseCaseValueKrw, {
    assetCurrency: 'KRW',
    lpBaseCurrency: displayCurrency === 'KRW' ? 'USD' : displayCurrency
  });

  // Tier 4 derivations:
  // - Scope 1/2/3 emissions estimate from existing power + capex
  // - Insurance summary from policy register
  // - Audit trail from AuditEvent table
  const emissionsBreakdown = buildEmissionsBreakdown({
    powerCapacityMw: asset.powerCapacityMw ?? null,
    pueTarget: asset.energySnapshot?.pueTarget ?? null,
    renewableSharePct: asset.energySnapshot?.renewableAvailabilityPct ?? null,
    backupFuelHours: asset.energySnapshot?.backupFuelHours ?? null,
    totalCapexKrw: investmentBasisKrw,
    holdYears: proForma?.years.length ?? 10
  });
  const insuranceSummary = buildInsuranceSummary(asset.insurancePolicies ?? []);
  const auditTrail = await buildAuditTrail(prisma, {
    assetId: asset.id,
    additionalEntityIds: [latestRun.id, ...asset.counterparties.map((c) => c.id)],
    limit: 12
  });

  // Tier 5 derivations:
  // - Capital call schedule from initial equity + reserve outflows
  // - Covenant alerts from existing covenant headroom (deal-specific)
  const initialEquityKrw = proForma?.summary.initialEquityKrw ?? 0;
  const capitalCalls = proForma
    ? buildCapitalCallSchedule(proForma.years, {
        initialEquityCommitmentKrw: initialEquityKrw,
        baseYear: new Date().getFullYear()
      })
    : null;

  // Submarket comps. Asset-attached comps live on the bundle; we
  // also pull market-wide comps (assetId NULL) for the same market
  // so the IM has CBRE-style submarket evidence even when the asset
  // itself has no direct comparables logged yet.
  const marketTxComps =
    asset.transactionComps && asset.transactionComps.length > 0
      ? []
      : await prisma.transactionComp.findMany({
          where: { assetId: null, market: asset.market },
          orderBy: { transactionDate: 'desc' },
          take: 8
        });
  const marketRentComps =
    asset.rentComps && asset.rentComps.length > 0
      ? []
      : await prisma.rentComp.findMany({
          where: { assetId: null, market: asset.market },
          orderBy: { observationDate: 'desc' },
          take: 8
        });
  const txCompsToShow = asset.transactionComps?.length ? asset.transactionComps : marketTxComps;
  const rentCompsToShow = asset.rentComps?.length ? asset.rentComps : marketRentComps;

  // Hedonic regression on the comp set — fitted price for the
  // target asset, controlling for size / vintage / submarket / tier.
  // Returns null when n < p+1; the IM card shows the gap message.
  const hedonicCompInputs: HedonicCompRow[] = (txCompsToShow ?? [])
    .filter(
      (c): c is typeof c & { pricePerSqmKrw: number } =>
        typeof c.pricePerSqmKrw === 'number' && c.pricePerSqmKrw > 0
    )
    .map((c) => ({
      pricePerSqmKrw: c.pricePerSqmKrw,
      sizeSqm:
        typeof c.priceKrw === 'number' && c.pricePerSqmKrw > 0
          ? c.priceKrw / c.pricePerSqmKrw
          : null,
      vintageYear: null,
      submarket: c.region ?? null,
      tier: c.assetTier ?? null,
      dealStructure: c.buyerType ?? null
    }));
  const hedonicTargetSize =
    asset.grossFloorAreaSqm ?? asset.rentableAreaSqm ?? null;
  const hedonicFit =
    hedonicTargetSize && hedonicTargetSize > 0
      ? fitHedonic(hedonicCompInputs, {
          sizeSqm: hedonicTargetSize,
          vintageYear: asset.buildingRecords?.[0]?.completionDate
            ? new Date(asset.buildingRecords[0].completionDate).getFullYear()
            : undefined,
          submarket: asset.address?.district ?? asset.market,
          tier: asset.assetSubtype ?? undefined
        })
      : null;

  // Pipeline projects — same fallback pattern as comps. Asset-direct
  // entries first, then submarket entries (assetId NULL, same market)
  // so the IM shows competitive supply even pre-stabilization.
  const marketPipeline =
    asset.pipelineProjects && asset.pipelineProjects.length > 0
      ? []
      : await prisma.pipelineProject.findMany({
          where: { assetId: null, market: asset.market },
          orderBy: { expectedDeliveryDate: 'asc' },
          take: 8
        });
  const pipelineToShow = asset.pipelineProjects?.length
    ? asset.pipelineProjects
    : marketPipeline;

  // DC supply-demand 5y forecast: probability-weighted pipeline +
  // baseline demand growth (8% AI training default, override via
  // macro rent_growth_pct when present). Only DC assets render.
  const supplyDemandUnit: 'MW' | 'sqm' =
    asset.assetClass === 'DATA_CENTER' ? 'MW' : 'sqm';
  const startingSupply =
    supplyDemandUnit === 'MW'
      ? asset.powerCapacityMw ?? 0
      : asset.grossFloorAreaSqm ?? 0;
  const demandGrowthPct =
    macroByKey.rent_growth_pct ?? (asset.assetClass === 'DATA_CENTER' ? 8 : 3);
  const supplyDemandModel =
    pipelineToShow.length > 0 && startingSupply > 0
      ? buildSupplyDemand(
          pipelineToShow.map<PipelineProjectInput>((p) => ({
            projectName: p.projectName,
            stageLabel: p.stageLabel,
            expectedPowerMw: p.expectedPowerMw,
            expectedAreaSqm: p.expectedAreaSqm,
            expectedDeliveryDate: p.expectedDeliveryDate,
            sponsorName: p.sponsorName
          })),
          {
            unit: supplyDemandUnit,
            baseYear: new Date().getFullYear(),
            horizonYears: 5,
            startingSupply,
            // Baseline demand assumed at 80% utilization of starting
            // supply — same submarket cluster, growing at the rate
            // above. Replace with KEPCO / sponsor-specific feed once
            // available.
            demand: { baselineDemand: startingSupply * 0.8, growthPct: demandGrowthPct }
          }
        )
      : null;

  // TOC items mirror the same conditional gates used to render each
  // section. Listed in render order so the active-section highlight
  // matches the user's scroll position.
  const tocItems: Array<{ id: string; label: string; show: boolean }> = [
    { id: 'im-cover', label: 'Cover', show: true },
    { id: 'im-macro', label: 'Macro backdrop', show: macroBackdrop.length > 0 },
    { id: 'im-macro-guidance', label: 'Macro regime overlay', show: !!macroGuidance },
    { id: 'im-returns', label: 'Returns / cap stack / tenancy', show: true },
    { id: 'im-underwriting', label: 'Underwriting assumptions', show: true },
    { id: 'im-hazard', label: 'Site hazard', show: !!asset.siteProfile },
    { id: 'im-esg', label: 'ESG & sustainability', show: !!esgSummary },
    { id: 'im-insurance', label: 'Insurance', show: !!insuranceSummary },
    { id: 'im-tax-walk', label: 'Tax leakage', show: taxWalk.rows.length > 0 },
    { id: 'im-fx', label: 'FX exposure', show: !!fxExposure },
    {
      id: 'im-title',
      label: 'Title & planning',
      show:
        (asset.ownershipRecords?.length ?? 0) +
          (asset.parcels?.length ?? 0) +
          (asset.buildingRecords?.length ?? 0) +
          (asset.planningConstraints?.length ?? 0) +
          (asset.encumbranceRecords?.length ?? 0) >
        0
    },
    { id: 'im-sources-uses', label: 'Sources & Uses', show: !!proForma },
    {
      id: 'im-capital-calls',
      label: 'Capital calls',
      show: !!capitalCalls && capitalCalls.rows.length > 0
    },
    { id: 'im-capex', label: 'Capex schedule', show: (asset.capexLineItems?.length ?? 0) > 0 },
    { id: 'im-pnl', label: 'Year-by-year P&L', show: !!proForma && proForma.years.length > 0 },
    { id: 'im-scenario', label: 'Scenario diff', show: scenarioDiff.length > 0 },
    {
      id: 'im-comps',
      label: 'Comparable transactions',
      show: txCompsToShow.length > 0 || rentCompsToShow.length > 0
    },
    {
      id: 'im-research',
      label: 'Research desk',
      show:
        (asset.researchSnapshots?.length ?? 0) +
          (asset.coverageTasks?.length ?? 0) +
          (asset.aiInsights?.length ?? 0) >
        0
    },
    {
      id: 'im-realized',
      label: 'Outcomes & pipeline',
      show: (asset.realizedOutcomes?.length ?? 0) > 0 || pipelineToShow.length > 0
    },
    {
      id: 'im-supply-demand',
      label: 'Supply-demand forecast',
      show: !!supplyDemandModel
    },
    { id: 'im-sensitivity', label: 'Sensitivity matrices', show: sensitivityGrids.length > 0 },
    { id: 'im-confidence', label: 'Confidence breakdown', show: true },
    { id: 'im-sponsor', label: 'Sponsor track record', show: !!sponsorTrack },
    {
      id: 'im-risks',
      label: 'Risks & DD checklist',
      show: latestRun.keyRisks.length + latestRun.ddChecklist.length > 0
    },
    {
      id: 'im-counterparty',
      label: 'Counterparty financials',
      show: (asset.counterparties?.length ?? 0) > 0
    },
    { id: 'im-documents', label: 'Document evidence', show: (asset.documents?.length ?? 0) > 0 },
    {
      id: 'im-ic-packet',
      label: 'IC packets',
      show: (asset.committeePackets?.length ?? 0) > 0
    },
    {
      id: 'im-side-letters',
      label: 'Side-letter terms',
      show: (asset.sideLetters?.length ?? 0) > 0
    },
    {
      id: 'im-features',
      label: 'Feature snapshots',
      show: (asset.featureSnapshots?.length ?? 0) > 0
    },
    { id: 'im-tokenization', label: 'Tokenization', show: !!asset.tokenization },
    { id: 'im-audit', label: 'Audit trail', show: auditTrail.events.length > 0 },
    { id: 'im-memo', label: 'Investment memo', show: true }
  ];
  const visibleTocItems = tocItems.filter((t) => t.show).map(({ id, label }) => ({ id, label }));

  return (
    <main className="pb-24">
      <ImPrintMode />
      <div className="print-hidden" data-im-print-hidden>
        <SiteNav />
      </div>

      <ImToc items={visibleTocItems} />

      <section id="im-cover" className="app-shell py-10">
        <div className="surface hero-mesh">
          <div className="flex flex-wrap items-center gap-3">
            <Badge>Investment Memo</Badge>
            <Badge>{asset.assetCode}</Badge>
            <Badge>{latestRun.runLabel}</Badge>
          </div>

          <div className="mt-6 grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-5">
              <div>
                <div className="fine-print">Committee Draft · {formatDate(latestRun.createdAt)}</div>
                <h1 className="mt-3 text-5xl font-semibold leading-[0.96] tracking-[-0.05em] text-white md:text-6xl">
                  {asset.name}
                </h1>
              </div>

              <p className="max-w-3xl text-lg leading-8 text-slate-300">{asset.description}</p>

              <div
                className="print-hidden flex flex-wrap gap-3"
                data-im-print-hidden
              >
                <PrintImButton />
                <Link href="/admin">
                  <Button variant="ghost">Operator console</Button>
                </Link>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="metric-card">
                  <div className="fine-print">Recommendation</div>
                  <div className="mt-3 text-2xl font-semibold text-white">{recommendation}</div>
                  <p className="mt-2 text-sm text-slate-400">
                    Confidence, scenario spread, and diligence posture aggregated.
                  </p>
                </div>
                <div className="metric-card">
                  <div className="fine-print">Base Case Value</div>
                  <div className="mt-3 text-2xl font-semibold text-white">
                    {formatCurrencyFromKrwAtRate(
                      latestRun.baseCaseValueKrw,
                      displayCurrency,
                      fxRateToKrw
                    )}
                  </div>
                  <p className="mt-2 text-sm text-slate-400">
                    Underwriting base case anchoring the committee view.
                  </p>
                </div>
                <div className="metric-card">
                  <div className="fine-print">Confidence Score</div>
                  <div className="mt-3 text-2xl font-semibold text-white">
                    {formatNumber(latestRun.confidenceScore, 1)}
                  </div>
                  <p className="mt-2 text-sm text-slate-400">
                    Composite of input coverage, freshness, and fallback usage.
                  </p>
                </div>
              </div>

              {/* Dense KPI strip — the "above-the-fold" numbers an LP
                  scans before reading the memo. Each cell links to the
                  card that explains it. */}
              <div className="grid gap-px overflow-hidden rounded-[18px] border border-white/10 bg-white/10 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  {
                    label: 'Equity IRR',
                    value:
                      proForma?.summary.equityIrr !== undefined &&
                      proForma?.summary.equityIrr !== null
                        ? formatPercent(proForma.summary.equityIrr)
                        : '—',
                    href: '#im-sources-uses'
                  },
                  {
                    label: 'Multiple',
                    value:
                      proForma?.summary.equityMultiple && proForma.summary.equityMultiple > 0
                        ? `${proForma.summary.equityMultiple.toFixed(2)}x`
                        : '—',
                    href: '#im-sources-uses'
                  },
                  {
                    label: 'Going-in yield',
                    value:
                      returnsSnapshot.goingInYieldPct !== null
                        ? formatPercent(returnsSnapshot.goingInYieldPct)
                        : '—',
                    href: '#im-returns'
                  },
                  {
                    label: 'Exit cap',
                    value:
                      returnsSnapshot.exitCapPct !== null
                        ? formatPercent(returnsSnapshot.exitCapPct)
                        : '—',
                    href: '#im-returns'
                  },
                  {
                    label: 'Min DSCR',
                    value:
                      returnsSnapshot.minDscr !== null
                        ? `${returnsSnapshot.minDscr.toFixed(2)}x`
                        : '—',
                    href: '#im-returns'
                  },
                  {
                    label: 'WALT',
                    value:
                      leaseRoll.weightedAvgTermYears > 0
                        ? `${leaseRoll.weightedAvgTermYears.toFixed(1)}y`
                        : '—',
                    href: '#im-returns'
                  }
                ].map((kpi) => (
                  <a
                    key={kpi.label}
                    href={kpi.href}
                    className="group bg-slate-950/80 px-3 py-2.5 transition hover:bg-slate-900"
                  >
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">
                      {kpi.label}
                    </div>
                    <div className="mt-1 font-mono text-sm font-semibold text-white">
                      {kpi.value}
                    </div>
                  </a>
                ))}
              </div>

              {compareAsset && compareLatestRun ? (
                <div className="mt-5 rounded-[18px] border border-white/15 bg-white/[0.02] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[11px] uppercase tracking-wide text-slate-400">
                      Compare vs.{' '}
                      <span className="font-mono text-slate-200">{compareAsset.assetCode}</span>
                      {' — '}
                      <span className="text-slate-300">{compareAsset.name}</span>
                    </div>
                    <a
                      href={`/sample-report`}
                      className="text-[10px] text-slate-500 hover:text-slate-300"
                    >
                      clear ✕
                    </a>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                    {[
                      {
                        label: 'Equity IRR',
                        thisVal: proForma?.summary.equityIrr ?? null,
                        otherVal: compareProForma?.summary.equityIrr ?? null,
                        fmt: (v: number) => formatPercent(v)
                      },
                      {
                        label: 'Multiple',
                        thisVal: proForma?.summary.equityMultiple ?? null,
                        otherVal: compareProForma?.summary.equityMultiple ?? null,
                        fmt: (v: number) => `${v.toFixed(2)}x`
                      },
                      {
                        label: 'Going-in yield',
                        thisVal: returnsSnapshot.goingInYieldPct,
                        otherVal: compareReturnsSnapshot?.goingInYieldPct ?? null,
                        fmt: (v: number) => formatPercent(v)
                      },
                      {
                        label: 'Exit cap',
                        thisVal: returnsSnapshot.exitCapPct,
                        otherVal: compareReturnsSnapshot?.exitCapPct ?? null,
                        fmt: (v: number) => formatPercent(v)
                      },
                      {
                        label: 'Min DSCR',
                        thisVal: returnsSnapshot.minDscr,
                        otherVal: compareReturnsSnapshot?.minDscr ?? null,
                        fmt: (v: number) => `${v.toFixed(2)}x`
                      },
                      {
                        label: 'WALT',
                        thisVal:
                          leaseRoll.weightedAvgTermYears > 0
                            ? leaseRoll.weightedAvgTermYears
                            : null,
                        otherVal:
                          (compareLeaseRoll?.weightedAvgTermYears ?? 0) > 0
                            ? compareLeaseRoll!.weightedAvgTermYears
                            : null,
                        fmt: (v: number) => `${v.toFixed(1)}y`
                      }
                    ].map((kpi) => {
                      const delta =
                        kpi.thisVal !== null && kpi.otherVal !== null
                          ? kpi.thisVal - kpi.otherVal
                          : null;
                      return (
                        <div
                          key={kpi.label}
                          className="rounded-[14px] border border-white/5 bg-white/[0.015] px-3 py-2"
                        >
                          <div className="text-[10px] uppercase tracking-wide text-slate-500">
                            {kpi.label}
                          </div>
                          <div className="mt-1 flex items-baseline justify-between gap-2 font-mono text-xs">
                            <span className="font-semibold text-white">
                              {kpi.thisVal !== null ? kpi.fmt(kpi.thisVal) : '—'}
                            </span>
                            <span className="text-slate-500">
                              {kpi.otherVal !== null ? kpi.fmt(kpi.otherVal) : '—'}
                            </span>
                          </div>
                          {delta !== null ? (
                            <div
                              className={`mt-1 text-[10px] font-mono ${
                                delta > 0
                                  ? 'text-emerald-300'
                                  : delta < 0
                                    ? 'text-rose-300'
                                    : 'text-slate-400'
                              }`}
                            >
                              Δ {delta > 0 ? '+' : ''}
                              {kpi.fmt(delta).replace(/[+\-]/g, (s) => s)}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <Card className="grid gap-4">
              <div>
                <div className="eyebrow">Memo Cover</div>
                <div className="mt-4 grid gap-3 text-sm text-slate-300">
                  <div className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3">
                    <span>Prepared On</span>
                    <span>{formatDate(latestRun.createdAt)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3">
                    <span>Location</span>
                    <span>{asset.address?.city ?? 'N/A'}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3">
                    <span>{isDataCenter ? 'Power Capacity' : 'Rentable Area'}</span>
                    <span>
                      {isDataCenter
                        ? `${formatNumber(asset.powerCapacityMw)} MW`
                        : `${formatNumber(asset.rentableAreaSqm ?? asset.grossFloorAreaSqm)} sqm`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3">
                    <span>Model Version</span>
                    <span>{latestRun.engineVersion}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-accent/20 bg-accent/10 p-5">
                <div className="fine-print text-accent">Recommendation</div>
                <p className="mt-3 text-sm leading-7 text-slate-200">
                  {recommendation}. Base case ranges{' '}
                  {bearValue !== null && bullValue !== null
                    ? `${formatCurrencyFromKrwAtRate(bearValue, displayCurrency, fxRateToKrw)} – ${formatCurrencyFromKrwAtRate(bullValue, displayCurrency, fxRateToKrw)}`
                    : 'within scenario bounds'}{' '}
                  across the bear and bull cases. Confidence{' '}
                  {formatNumber(latestRun.confidenceScore, 1)} reflects current source coverage and
                  diligence completion.
                </p>
              </div>
            </Card>
          </div>
        </div>
      </section>

      <section className="app-shell py-4">
        <div className="grid gap-4 md:grid-cols-4">
          {[
            [
              'Bull Case',
              formatCurrencyFromKrwAtRate(bullValue, displayCurrency, fxRateToKrw),
              'upside scenario'
            ],
            [
              'Bear Case',
              formatCurrencyFromKrwAtRate(bearValue, displayCurrency, fxRateToKrw),
              'downside scenario'
            ],
            ['Implied Yield', formatPercent(scenarios[1]?.impliedYieldPct), 'base scenario'],
            ['Exit Cap Rate', formatPercent(scenarios[1]?.exitCapRatePct), 'base scenario']
          ].map(([label, value, detail]) => (
            <div key={label} className="metric-card">
              <div className="fine-print">{label}</div>
              <div className="mt-3 text-2xl font-semibold text-white">{value}</div>
              <p className="mt-2 text-sm text-slate-400">{detail}</p>
            </div>
          ))}
        </div>
      </section>

      {asset.media && asset.media.length > 0 ? (
        <section className="app-shell py-4">
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="eyebrow">Site media</div>
                <p className="mt-2 text-sm text-slate-400">
                  Photos, site plans, and renders. Curated by the deal lead — same set the IM cover
                  and committee pack draw from.
                </p>
              </div>
              <span className="text-xs text-slate-500">{asset.media.length} item{asset.media.length === 1 ? '' : 's'}</span>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {asset.media.map((m) => (
                <figure
                  key={m.id}
                  className="overflow-hidden rounded-[18px] border border-white/10 bg-slate-950/60"
                >
                  <div className="aspect-video w-full bg-slate-900">
                    {m.mimeType.startsWith('image/') ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={`/api/public/asset-media/${m.id}`}
                        alt={m.caption ?? m.kind}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">
                        {m.mimeType}
                      </div>
                    )}
                  </div>
                  <figcaption className="space-y-1 p-3">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">{m.kind}</div>
                    {m.caption ? (
                      <div className="text-sm text-slate-200">{m.caption}</div>
                    ) : null}
                  </figcaption>
                </figure>
              ))}
            </div>
          </Card>
        </section>
      ) : null}

      {macroBackdrop.length > 0 ? (
        <section id="im-macro" className="app-shell py-4">
          <Card>
            <div className="eyebrow">Macro backdrop</div>
            <p className="mt-2 text-sm text-slate-400">
              Latest reading per series from the official-source feed (KOSIS / BOK ECOS). The
              cap-rate and discount-rate underwriting both anchor here.
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
              {macroBackdrop.map((point) => (
                <div
                  key={point.seriesKey}
                  className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="fine-print">{point.label}</div>
                  <div className="mt-2 text-xl font-semibold text-white">
                    {formatMacroValue(point)}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {formatDate(point.observationDate)}
                  </div>
                </div>
              ))}
            </div>
            <ProvenancePill entries={provenanceByCard.macro} />
          </Card>
        </section>
      ) : null}

      {macroGuidance ? (
        <section id="im-macro-guidance" className="app-shell py-4">
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="eyebrow">Macro regime overlay</div>
                <p className="mt-2 max-w-3xl text-sm text-slate-400">
                  Per-driver overlay applied to the base scenario before the proforma runs. Discount and exit cap widen in tight capital markets; occupancy and growth tighten when leasing is soft; replacement cost steps up with construction inflation.
                </p>
              </div>
              <Badge>macro-regime-engine</Badge>
            </div>
            {macroGuidance.weightLine ? (
              <p className="mt-4 rounded-[14px] border border-white/5 bg-white/[0.02] px-3 py-2 text-xs text-slate-300">
                {macroGuidance.weightLine}
              </p>
            ) : null}
            <div className="mt-5 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
              {(
                [
                  ['Discount rate', macroGuidance.shifts.discountRateShiftPct, 'pts', 'add'],
                  ['Exit cap rate', macroGuidance.shifts.exitCapRateShiftPct, 'pts', 'add'],
                  ['Debt cost', macroGuidance.shifts.debtCostShiftPct, 'pts', 'add'],
                  ['Occupancy', macroGuidance.shifts.occupancyShiftPct, 'pts', 'subtract'],
                  ['Growth', macroGuidance.shifts.growthShiftPct, 'pts', 'subtract'],
                  [
                    'Replacement cost',
                    macroGuidance.shifts.replacementCostShiftPct,
                    '%',
                    'add'
                  ]
                ] as const
              ).map(([label, value, unit, badShift]) => {
                if (value === null) return null;
                const isWiden =
                  (badShift === 'add' && value > 0) || (badShift === 'subtract' && value < 0);
                const tone = value === 0 ? 'text-white' : isWiden ? 'text-rose-300' : 'text-emerald-300';
                const sign = value > 0 ? '+' : '';
                return (
                  <div
                    key={label}
                    className="rounded-[16px] border border-white/10 bg-white/[0.02] p-3"
                  >
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
                    <div className={`mt-2 font-mono text-sm ${tone}`}>
                      {sign}
                      {value.toFixed(2)} {unit}
                    </div>
                  </div>
                );
              })}
            </div>
            {macroGuidance.summary.length > 0 ? (
              <ul className="mt-5 space-y-1 text-xs leading-5 text-slate-400">
                {macroGuidance.summary.map((line) => (
                  <li key={line} className="before:mr-2 before:text-slate-600 before:content-['→']">
                    {line}
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>
        </section>
      ) : null}

      <section id="im-returns" className="app-shell py-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <div className="eyebrow">Returns snapshot</div>
            <p className="mt-2 text-sm text-slate-400">
              Headline returns from the latest valuation run. Going-in yield and exit cap reflect the base case; minimum DSCR is the floor across all scenarios.
            </p>
            <dl className="mt-5 grid gap-3 text-sm">
              <Row label="Going-in yield">
                {returnsSnapshot.goingInYieldPct !== null
                  ? formatPercent(returnsSnapshot.goingInYieldPct)
                  : '—'}
              </Row>
              <Row label="Exit cap">
                {returnsSnapshot.exitCapPct !== null
                  ? formatPercent(returnsSnapshot.exitCapPct)
                  : '—'}
              </Row>
              <Row label="Upside (base → bull)">
                {returnsSnapshot.upsideToBullPct !== null
                  ? `+${returnsSnapshot.upsideToBullPct.toFixed(1)}%`
                  : '—'}
              </Row>
              <Row label="Downside (base → bear)">
                {returnsSnapshot.downsideToBearPct !== null
                  ? `${returnsSnapshot.downsideToBearPct.toFixed(1)}%`
                  : '—'}
              </Row>
              <Row label="Min DSCR">
                {returnsSnapshot.minDscr !== null
                  ? `${returnsSnapshot.minDscr.toFixed(2)}x`
                  : '—'}
              </Row>
            </dl>
            <ProvenancePill entries={provenanceByCard.valuationRates} />
          </Card>

          <Card>
            <div className="eyebrow">Capital structure</div>
            <p className="mt-2 text-sm text-slate-400">
              {capStack.facilityCount === 0
                ? 'No facilities recorded. Presented unlevered pending committed financing.'
                : `${capStack.facilityCount} facility${capStack.facilityCount === 1 ? '' : 'ies'} aggregated.`}
            </p>
            <dl className="mt-5 grid gap-3 text-sm">
              <Row label="Total commitment">
                {formatCurrencyFromKrwAtRate(
                  capStack.totalCommitmentKrw,
                  displayCurrency,
                  fxRateToKrw
                )}
              </Row>
              <Row label="Drawn">
                {formatCurrencyFromKrwAtRate(capStack.totalDrawnKrw, displayCurrency, fxRateToKrw)}
              </Row>
              <Row label="Drawn / commitment">
                {capStack.totalCommitmentKrw === 0
                  ? '—'
                  : `${capStack.drawnPctOfCommitment.toFixed(1)}%`}
              </Row>
              <Row label="Blended rate">
                {capStack.totalCommitmentKrw === 0
                  ? '—'
                  : `${capStack.blendedRatePct.toFixed(2)}%`}
              </Row>
            </dl>
            {asset.debtFacilities && asset.debtFacilities.length > 0 ? (
              <div className="mt-5 overflow-x-auto rounded-[14px] border border-white/10">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                      <th className="px-2 py-2 font-semibold">Facility</th>
                      <th className="px-2 py-2 text-right font-semibold">Commit</th>
                      <th className="px-2 py-2 text-right font-semibold">Drawn</th>
                      <th className="px-2 py-2 text-right font-semibold">Rate</th>
                      <th className="px-2 py-2 text-right font-semibold">Term</th>
                      <th className="px-2 py-2 text-right font-semibold">Amort</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-200">
                    {asset.debtFacilities.map((f) => (
                      <tr key={f.id}>
                        <td className="px-2 py-2">
                          <div className="text-white">{f.facilityType}</div>
                          {f.lenderName ? (
                            <div className="text-[10px] text-slate-500">{f.lenderName}</div>
                          ) : null}
                        </td>
                        <td className="px-2 py-2 text-right font-mono">
                          {formatCurrencyFromKrwAtRate(
                            f.commitmentKrw,
                            displayCurrency,
                            fxRateToKrw
                          )}
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-slate-400">
                          {f.drawnAmountKrw !== null
                            ? formatCurrencyFromKrwAtRate(
                                f.drawnAmountKrw,
                                displayCurrency,
                                fxRateToKrw
                              )
                            : '—'}
                        </td>
                        <td className="px-2 py-2 text-right font-mono">
                          {f.interestRatePct.toFixed(2)}%
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-slate-400">
                          {f.amortizationTermMonths
                            ? `${(f.amortizationTermMonths / 12).toFixed(0)} yr`
                            : '—'}
                        </td>
                        <td className="px-2 py-2 text-right text-[10px] text-slate-400">
                          {f.amortizationProfile.replace(/_/g, ' ').toLowerCase()}
                          {typeof f.balloonPct === 'number' && f.balloonPct > 0
                            ? ` · ${f.balloonPct.toFixed(0)}% balloon`
                            : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <ProvenancePill entries={provenanceByCard.capitalStructure} />
          </Card>

          <Card>
            <div className="eyebrow">Tenancy snapshot</div>
            <p className="mt-2 text-sm text-slate-400">
              {leaseRoll.leaseCount === 0
                ? 'No leases on file. Pre-stabilization; rent underwriting is projected.'
                : `${leaseRoll.leaseCount} lease${leaseRoll.leaseCount === 1 ? '' : 's'} aggregated; weighted by leasedKw.`}
            </p>
            <dl className="mt-5 grid gap-3 text-sm">
              <Row label="Total leased capacity">
                {leaseRoll.totalLeasedKw > 0
                  ? `${formatNumber(leaseRoll.totalLeasedKw, 1)} kW`
                  : '—'}
              </Row>
              <Row label="WALT">
                {leaseRoll.weightedAvgTermYears > 0
                  ? `${leaseRoll.weightedAvgTermYears.toFixed(1)} yrs`
                  : '—'}
              </Row>
              <Row label="Weighted in-place rent">
                {leaseRoll.weightedRentPerKwKrw > 0
                  ? `${formatNumber(leaseRoll.weightedRentPerKwKrw, 0)} KRW/kW/mo`
                  : '—'}
              </Row>
              <Row label="Mark-to-market gap">
                {leaseRoll.markToMarketGapPct !== null
                  ? `${leaseRoll.markToMarketGapPct >= 0 ? '+' : ''}${leaseRoll.markToMarketGapPct.toFixed(1)}%`
                  : '—'}
              </Row>
              <Row label="Tenant credit (avg)">
                {tenantCredit.count > 0 ? tenantCredit.averageScore.toFixed(0) : '—'}
              </Row>
            </dl>
            {asset.leases && asset.leases.length > 0 ? (
              <div className="mt-5 overflow-x-auto rounded-[14px] border border-white/10">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                      <th className="px-2 py-2 font-semibold">Tenant</th>
                      <th className="px-2 py-2 text-right font-semibold">kW</th>
                      <th className="px-2 py-2 text-right font-semibold">Term</th>
                      <th className="px-2 py-2 text-right font-semibold">In-place</th>
                      <th className="px-2 py-2 text-right font-semibold">Esc</th>
                      <th className="px-2 py-2 text-right font-semibold">MTM gap</th>
                      <th className="px-2 py-2 text-right font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-200">
                    {asset.leases.map((lease) => {
                      const mtmGap =
                        lease.markToMarketRatePerKwKrw && lease.baseRatePerKwKrw > 0
                          ? ((lease.markToMarketRatePerKwKrw - lease.baseRatePerKwKrw) /
                              lease.baseRatePerKwKrw) *
                            100
                          : null;
                      return (
                        <tr key={lease.id}>
                          <td className="px-2 py-2 text-white">{lease.tenantName}</td>
                          <td className="px-2 py-2 text-right font-mono">
                            {formatNumber(lease.leasedKw, 0)}
                          </td>
                          <td className="px-2 py-2 text-right font-mono text-slate-400">
                            Y{lease.startYear}–{lease.startYear + lease.termYears - 1}
                          </td>
                          <td className="px-2 py-2 text-right font-mono">
                            {formatNumber(lease.baseRatePerKwKrw, 0)}
                          </td>
                          <td className="px-2 py-2 text-right font-mono text-slate-400">
                            {lease.annualEscalationPct !== null
                              ? `${lease.annualEscalationPct.toFixed(1)}%`
                              : '—'}
                          </td>
                          <td className="px-2 py-2 text-right font-mono">
                            {mtmGap !== null
                              ? `${mtmGap >= 0 ? '+' : ''}${mtmGap.toFixed(1)}%`
                              : '—'}
                          </td>
                          <td className="px-2 py-2 text-right text-[10px] text-slate-400">
                            {lease.status}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="border-t border-white/5 bg-white/[0.02] px-2 py-2 text-[10px] text-slate-500">
                  WALT = Σ(term × kW) / Σ(kW); weighted in-place rent uses the same kW weighting on contract rate; MTM gap = blended market rate / blended in-place rate − 1.
                </p>
              </div>
            ) : null}
            <ProvenancePill entries={provenanceByCard.tenancy} />
          </Card>
        </div>
      </section>

      <section id="im-underwriting" className="app-shell py-4">
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="eyebrow">Underwriting assumptions (base case)</div>
              <p className="mt-2 max-w-3xl text-sm text-slate-400">
                Inputs anchoring the base scenario on this run. Cap rate and discount rate are the primary value drivers; tax leakage and SPV economics drive the gap between unlevered and equity returns.
              </p>
            </div>
            <Badge tone="good">{latestRun.engineVersion}</Badge>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="rounded-[18px] border border-white/10 bg-white/[0.02] p-4">
              <div className="fine-print">Valuation rates</div>
              <dl className="mt-3 space-y-2 text-sm">
                <Row label="Cap rate">
                  {underwriting.capRatePct !== null
                    ? `${underwriting.capRatePct.toFixed(2)}%`
                    : '—'}
                </Row>
                <Row label="Discount rate">
                  {underwriting.discountRatePct !== null
                    ? `${underwriting.discountRatePct.toFixed(2)}%`
                    : '—'}
                </Row>
                <Row label="Going-in occupancy">
                  {underwriting.occupancyPct !== null
                    ? `${underwriting.occupancyPct.toFixed(1)}%`
                    : '—'}
                </Row>
                <Row label="In-place rate">
                  {underwriting.monthlyRatePerKwKrw !== null
                    ? `${formatNumber(underwriting.monthlyRatePerKwKrw, 0)} KRW/kW/mo`
                    : '—'}
                </Row>
                <Row label="Power price">
                  {underwriting.powerPriceKrwPerKwh !== null
                    ? `${underwriting.powerPriceKrwPerKwh.toFixed(0)} KRW/kWh`
                    : '—'}
                </Row>
                <Row label="PUE target">
                  {underwriting.pueTarget !== null ? underwriting.pueTarget.toFixed(2) : '—'}
                </Row>
              </dl>
            </div>

            <div className="rounded-[18px] border border-white/10 bg-white/[0.02] p-4">
              <div className="fine-print">Tax stack</div>
              <dl className="mt-3 space-y-2 text-sm">
                <Row label="Corporate tax">
                  {underwriting.corporateTaxPct !== null
                    ? `${underwriting.corporateTaxPct.toFixed(1)}%`
                    : '—'}
                </Row>
                <Row label="Property tax">
                  {underwriting.propertyTaxPct !== null
                    ? `${underwriting.propertyTaxPct.toFixed(2)}%`
                    : '—'}
                </Row>
                <Row label="Acquisition tax">
                  {underwriting.acquisitionTaxPct !== null
                    ? `${underwriting.acquisitionTaxPct.toFixed(1)}%`
                    : '—'}
                </Row>
                <Row label="Exit tax">
                  {underwriting.exitTaxPct !== null
                    ? `${underwriting.exitTaxPct.toFixed(1)}%`
                    : '—'}
                </Row>
                <Row label="VAT recovery">
                  {underwriting.vatRecoveryPct !== null
                    ? `${underwriting.vatRecoveryPct.toFixed(0)}%`
                    : '—'}
                </Row>
              </dl>
            </div>

            <div className="rounded-[18px] border border-white/10 bg-white/[0.02] p-4">
              <div className="fine-print">SPV & promote</div>
              <dl className="mt-3 space-y-2 text-sm">
                <Row label="Mgmt fee">
                  {underwriting.managementFeePct !== null
                    ? `${underwriting.managementFeePct.toFixed(2)}%`
                    : '—'}
                </Row>
                <Row label="Performance fee">
                  {underwriting.performanceFeePct !== null
                    ? `${underwriting.performanceFeePct.toFixed(1)}%`
                    : '—'}
                </Row>
                <Row label="Promote hurdle">
                  {underwriting.promoteThresholdPct !== null
                    ? `${underwriting.promoteThresholdPct.toFixed(1)}%`
                    : '—'}
                </Row>
                <Row label="Promote share">
                  {underwriting.promoteSharePct !== null
                    ? `${underwriting.promoteSharePct.toFixed(1)}%`
                    : '—'}
                </Row>
                <Row label="Reserve target">
                  {underwriting.reserveTargetMonths !== null
                    ? `${underwriting.reserveTargetMonths.toFixed(0)} mo`
                    : '—'}
                </Row>
              </dl>
            </div>
          </div>
          <p className="mt-4 text-[11px] text-slate-500">
            Stage / location / permit / flood / wildfire multipliers applied during scenario
            generation:&nbsp;
            stage {underwriting.stageFactor !== null ? underwriting.stageFactor.toFixed(2) : '—'} ·
            location ×{underwriting.locationPremium !== null ? underwriting.locationPremium.toFixed(2) : '—'} ·
            permit ×{underwriting.permitPenalty !== null ? underwriting.permitPenalty.toFixed(2) : '—'} ·
            flood ×{underwriting.floodPenalty !== null ? underwriting.floodPenalty.toFixed(3) : '—'} ·
            wildfire ×{underwriting.wildfirePenalty !== null ? underwriting.wildfirePenalty.toFixed(3) : '—'}.
          </p>

          {capRateDecomp ? (
            <div className="mt-5 rounded-[16px] border border-white/10 bg-white/[0.02] p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="fine-print">Cap rate decomposition</div>
                  <p className="mt-1 max-w-3xl text-xs text-slate-400">
                    Bridges the headline cap rate into 6 transparent components so the LP can see
                    what is driving the price. RFR and growth from macro feed; submarket spread
                    from comp regression; obsolescence from vintage age.
                  </p>
                </div>
                <Badge>
                  {capRateDecomp.capRatePct.toFixed(2)}% implied
                </Badge>
              </div>
              <div className="mt-4 overflow-x-auto rounded-[12px] border border-white/10">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                      <th className="px-2 py-2 font-semibold">Component</th>
                      <th className="px-2 py-2 text-right font-semibold">Sign</th>
                      <th className="px-2 py-2 text-right font-semibold">pct</th>
                      <th className="px-2 py-2 font-semibold">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-200">
                    {capRateDecomp.components.map((c) => (
                      <tr key={c.key}>
                        <td className="px-2 py-2 text-slate-300">{c.label}</td>
                        <td
                          className={`px-2 py-2 text-right font-mono ${
                            c.sign === '+' ? 'text-amber-300' : 'text-emerald-300'
                          }`}
                        >
                          {c.sign}
                        </td>
                        <td className="px-2 py-2 text-right font-mono">
                          {c.pct.toFixed(2)}%
                        </td>
                        <td className="px-2 py-2 text-[10px] text-slate-400">{c.notes}</td>
                      </tr>
                    ))}
                    <tr className="bg-white/[0.03] font-semibold">
                      <td className="px-2 py-2 text-white">Implied cap rate</td>
                      <td className="px-2 py-2"></td>
                      <td className="px-2 py-2 text-right font-mono text-white">
                        {capRateDecomp.capRatePct.toFixed(2)}%
                      </td>
                      <td className="px-2 py-2"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <ProvenancePill entries={provenanceByCard.scenarioEngine} />
        </Card>
      </section>

      {asset.siteProfile ? (
        <section id="im-hazard" className="app-shell py-4">
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="eyebrow">Site hazard scores</div>
                <p className="mt-2 max-w-3xl text-sm text-slate-400">
                  Per-asset physical-risk readings. Flood and wildfire each carry a confidence-score penalty (×0.05 and ×0.04 respectively). Insurance pricing and reserve sizing track the same readings.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <FreshnessDot observedAt={asset.siteProfile.sourceUpdatedAt} />
                <Badge>{asset.siteProfile.sourceStatus}</Badge>
              </div>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {(
                [
                  ['Flood risk', asset.siteProfile.floodRiskScore],
                  ['Wildfire risk', asset.siteProfile.wildfireRiskScore],
                  ['Seismic risk', asset.siteProfile.seismicRiskScore]
                ] as const
              ).map(([label, score]) => {
                const desc = describeHazard(score);
                const tone =
                  desc.tone === 'good'
                    ? 'border-emerald-300/30 bg-emerald-300/[0.04]'
                    : desc.tone === 'warn'
                      ? 'border-amber-300/30 bg-amber-300/[0.04]'
                      : desc.tone === 'risk'
                        ? 'border-rose-300/30 bg-rose-300/[0.04]'
                        : 'border-white/10 bg-white/[0.02]';
                const dotTone =
                  desc.tone === 'good'
                    ? 'bg-emerald-300'
                    : desc.tone === 'warn'
                      ? 'bg-amber-300'
                      : desc.tone === 'risk'
                        ? 'bg-rose-300'
                        : 'bg-slate-600';
                return (
                  <div key={label} className={`rounded-[18px] border p-4 ${tone}`}>
                    <div className="flex items-center gap-2">
                      <span className={`inline-block h-2 w-2 rounded-full ${dotTone}`} />
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">
                        {label}
                      </div>
                    </div>
                    <div className="mt-3 text-2xl font-semibold text-white">
                      {score !== null && score !== undefined ? score.toFixed(1) : '—'}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">{desc.label} band</div>
                  </div>
                );
              })}
            </div>
            {asset.siteProfile.siteNotes ? (
              <p className="mt-4 rounded-[14px] border border-white/5 bg-white/[0.02] px-3 py-2 text-xs leading-5 text-slate-400">
                <span className="font-semibold text-slate-300">Notes: </span>
                {asset.siteProfile.siteNotes}
              </p>
            ) : null}
          </Card>
        </section>
      ) : null}

      {esgSummary ? (
        <section id="im-esg" className="app-shell py-4">
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="eyebrow">ESG &amp; sustainability</div>
                <p className="mt-2 max-w-3xl text-sm text-slate-400">
                  Operational sustainability metrics anchoring LP-side ESG disclosure. PUE
                  governs Scope-2 carbon intensity; renewable share governs Scope-2 reduction
                  path; backup autonomy governs Tier-rated uptime and outage exposure.
                </p>
              </div>
              {esgSummary.composite ? (
                <Badge tone={esgSummary.composite === 'good' ? 'good' : 'warn'}>
                  Composite:{' '}
                  {esgSummary.composite === 'good'
                    ? 'Strong'
                    : esgSummary.composite === 'warn'
                      ? 'Moderate'
                      : 'Weak'}
                </Badge>
              ) : null}
            </div>
            {esgSummary.utility ? (
              <div className="mt-3 text-[11px] text-slate-500">
                Utility: <span className="text-slate-300">{esgSummary.utility}</span>
              </div>
            ) : null}
            <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {esgSummary.rows.map((row) => {
                const tone =
                  row.tone === 'good'
                    ? 'border-emerald-300/30 bg-emerald-300/[0.03]'
                    : row.tone === 'warn'
                      ? 'border-amber-300/30 bg-amber-300/[0.03]'
                      : row.tone === 'risk'
                        ? 'border-rose-300/30 bg-rose-300/[0.03]'
                        : 'border-white/10 bg-white/[0.02]';
                const dot =
                  row.tone === 'good'
                    ? 'bg-emerald-300'
                    : row.tone === 'warn'
                      ? 'bg-amber-300'
                      : row.tone === 'risk'
                        ? 'bg-rose-300'
                        : 'bg-slate-600';
                return (
                  <div key={row.key} className={`rounded-[16px] border ${tone} p-3`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">
                        {row.label}
                      </div>
                      {row.band ? (
                        <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
                          <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                          {row.band}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 font-mono text-lg font-semibold text-white">
                      {row.value !== null
                        ? `${row.value.toFixed(row.unit === '%' ? 0 : 2)}${row.unit ? ` ${row.unit}` : ''}`
                        : '—'}
                    </div>
                    <p className="mt-1 text-[11px] leading-5 text-slate-400">
                      {row.interpretation}
                    </p>
                  </div>
                );
              })}
            </div>

            {asset.carbonRecords && asset.carbonRecords.length > 0
              ? (() => {
                  // Pick a single primary line per (scope, category, vintage)
                  // to avoid LBs and MBs being added together by readers.
                  // Market-based wins where present (matches GHG Protocol
                  // primary disclosure for purchased electricity).
                  type R = (typeof asset.carbonRecords)[number];
                  const buckets = new Map<string, R[]>();
                  for (const r of asset.carbonRecords) {
                    const k = `${r.scope}-${r.category}-${r.vintageYear}`;
                    if (!buckets.has(k)) buckets.set(k, []);
                    buckets.get(k)!.push(r);
                  }
                  const primary: R[] = [];
                  const alternates: R[] = [];
                  for (const arr of buckets.values()) {
                    if (arr.length === 1) {
                      primary.push(arr[0]!);
                      continue;
                    }
                    const mb = arr.find((r) => r.methodology === 'GHG_PROTOCOL_MB');
                    const lb = arr.find((r) => r.methodology === 'GHG_PROTOCOL_LB');
                    if (mb) {
                      primary.push(mb);
                      for (const a of arr) if (a !== mb) alternates.push(a);
                    } else if (lb) {
                      primary.push(lb);
                      for (const a of arr) if (a !== lb) alternates.push(a);
                    } else {
                      primary.push(arr[0]!);
                      for (const a of arr.slice(1)) alternates.push(a);
                    }
                  }
                  const totalPrimary = primary.reduce((s, r) => s + r.tco2e, 0);
                  return (
                    <div className="mt-5 rounded-[14px] border border-white/10 bg-white/[0.02] p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="fine-print">Carbon emissions register (verified)</div>
                        <div className="flex flex-wrap gap-2">
                          <Badge tone="good">{primary.length} primary</Badge>
                          <Badge>
                            Total {totalPrimary.toLocaleString(undefined, {
                              maximumFractionDigits: 0
                            })} tCO2e
                          </Badge>
                        </div>
                      </div>
                      <div className="mt-3 overflow-x-auto rounded-[12px] border border-white/10">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                              <th className="px-2 py-2 font-semibold">Scope</th>
                              <th className="px-2 py-2 font-semibold">Category</th>
                              <th className="px-2 py-2 text-right font-semibold">Vintage</th>
                              <th className="px-2 py-2 text-right font-semibold">tCO2e</th>
                              <th className="px-2 py-2 font-semibold">Methodology</th>
                              <th className="px-2 py-2 font-semibold">Verifier</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5 text-slate-200">
                            {primary.map((rec) => (
                              <tr key={rec.id}>
                                <td className="px-2 py-2 font-mono text-slate-300">
                                  Scope {rec.scope}
                                </td>
                                <td className="px-2 py-2 text-[11px] text-slate-300">
                                  {rec.category.replace(/_/g, ' ').toLowerCase()}
                                </td>
                                <td className="px-2 py-2 text-right font-mono text-slate-400">
                                  {rec.vintageYear}
                                </td>
                                <td className="px-2 py-2 text-right font-mono">
                                  {rec.tco2e.toLocaleString(undefined, {
                                    maximumFractionDigits: 0
                                  })}
                                </td>
                                <td className="px-2 py-2 text-[10px] text-slate-400">
                                  {rec.methodology ?? '—'}
                                </td>
                                <td className="px-2 py-2 text-[10px] text-slate-400">
                                  {rec.verifiedBy ?? '—'}
                                  {rec.notes ? (
                                    <div className="text-[9px] text-slate-500">{rec.notes}</div>
                                  ) : null}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {alternates.length > 0 ? (
                        <p className="mt-3 text-[10px] leading-5 text-slate-500">
                          <span className="font-semibold uppercase tracking-wide text-slate-400">
                            Alternate methodologies on file:{' '}
                          </span>
                          {alternates
                            .map(
                              (a) =>
                                `Scope ${a.scope} ${a.methodology ?? 'method n/a'} = ${a.tco2e.toLocaleString(
                                  undefined,
                                  { maximumFractionDigits: 0 }
                                )} tCO2e`
                            )
                            .join(' · ')}
                          . Per GHG Protocol Scope 2 dual-reporting, the market-based reading is
                          shown as primary (reflects executed PPAs / I-REC retirements);
                          location-based is the alternate. The figures should not be summed.
                        </p>
                      ) : null}
                    </div>
                  );
                })()
              : null}

            {emissionsBreakdown.totalAnnualtCO2e !== null ? (
              <div className="mt-5 rounded-[14px] border border-white/10 bg-white/[0.02] p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="fine-print">
                    Scope 1 / 2 / 3 emissions estimate
                    {(asset.carbonRecords?.length ?? 0) > 0 ? ' (derived — for comparison vs verified above)' : ''}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Total ≈{' '}
                    <span className="font-mono text-slate-300">
                      {emissionsBreakdown.totalAnnualtCO2e.toLocaleString(undefined, {
                        maximumFractionDigits: 0
                      })}{' '}
                      tCO2e/yr
                    </span>
                    {emissionsBreakdown.carbonIntensitykgPerKwh !== null
                      ? ` · grid intensity ${emissionsBreakdown.carbonIntensitykgPerKwh.toFixed(3)} kgCO2e/kWh`
                      : ''}
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  {[
                    {
                      label: 'Scope 1 — direct',
                      value: emissionsBreakdown.scope1tCO2e,
                      sub: 'Backup generator combustion'
                    },
                    {
                      label: 'Scope 2 — purchased power',
                      value: emissionsBreakdown.scope2tCO2e,
                      sub: 'Grid kWh × KR factor × (1 − renewable)'
                    },
                    {
                      label: 'Scope 3 — embodied (amortized)',
                      value: emissionsBreakdown.scope3tCO2e,
                      sub: 'Construction carbon over hold'
                    }
                  ].map((s) => (
                    <div
                      key={s.label}
                      className="rounded-[12px] border border-white/5 bg-white/[0.02] px-3 py-2"
                    >
                      <div className="text-[10px] uppercase tracking-wide text-slate-500">
                        {s.label}
                      </div>
                      <div className="mt-1 font-mono text-sm font-semibold text-white">
                        {s.value !== null
                          ? `${s.value.toLocaleString(undefined, { maximumFractionDigits: 0 })} tCO2e/yr`
                          : '—'}
                      </div>
                      <div className="mt-1 text-[10px] text-slate-500">{s.sub}</div>
                    </div>
                  ))}
                </div>
                <ul className="mt-3 space-y-1 text-[10px] text-slate-500">
                  {emissionsBreakdown.notes.map((n) => (
                    <li key={n}>· {n}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>
        </section>
      ) : null}

      {insuranceSummary ? (
        <section id="im-insurance" className="app-shell py-4">
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="eyebrow">Insurance register</div>
                <p className="mt-2 max-w-3xl text-sm text-slate-400">
                  Active policies covering property, business interruption, liability,
                  construction, and cyber. Renewals expiring within 90 days are flagged for
                  pre-IC review; coverage limits anchor the LP-side underwriting of catastrophic
                  loss exposure.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {insuranceSummary.expiringSoonCount > 0 ? (
                  <Badge tone="warn">
                    {insuranceSummary.expiringSoonCount} expiring &lt; 90d
                  </Badge>
                ) : null}
                <Badge>
                  {insuranceSummary.policies.length} polic
                  {insuranceSummary.policies.length === 1 ? 'y' : 'ies'}
                </Badge>
              </div>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {insuranceSummary.tilesByType.map((tile) => {
                const tone =
                  tile.status === 'EXPIRING'
                    ? 'border-amber-300/30 bg-amber-300/[0.04]'
                    : tile.status === 'EXPIRED'
                      ? 'border-rose-300/30 bg-rose-300/[0.04]'
                      : 'border-white/10 bg-white/[0.02]';
                const dot =
                  tile.status === 'EXPIRING'
                    ? 'bg-amber-300'
                    : tile.status === 'EXPIRED'
                      ? 'bg-rose-300'
                      : 'bg-emerald-300';
                return (
                  <div
                    key={`${tile.policyType}-${tile.insurer ?? ''}-${tile.expiresOn ?? ''}`}
                    className={`rounded-[16px] border ${tone} p-3`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">
                        {tile.label}
                      </div>
                      <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
                        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                        {tile.status}
                      </span>
                    </div>
                    <div className="mt-2 font-mono text-sm font-semibold text-white">
                      {tile.coverageKrw !== null
                        ? formatCurrencyFromKrwAtRate(
                            tile.coverageKrw,
                            displayCurrency,
                            fxRateToKrw
                          )
                        : '—'}
                    </div>
                    <div className="mt-1 text-[10px] text-slate-500">
                      {tile.insurer ?? '—'}
                      {tile.premiumKrw !== null
                        ? ` · premium ${formatCurrencyFromKrwAtRate(tile.premiumKrw, displayCurrency, fxRateToKrw)}`
                        : ''}
                    </div>
                    {tile.expiresOn ? (
                      <div className="mt-1 text-[10px] text-slate-500">
                        Expires {formatDate(tile.expiresOn)}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 grid gap-3 text-[11px] md:grid-cols-3">
              <div className="rounded-[12px] border border-white/5 bg-white/[0.015] px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">
                  Total coverage
                </div>
                <div className="mt-1 font-mono text-sm text-white">
                  {formatCurrencyFromKrwAtRate(
                    insuranceSummary.totalCoverageKrw,
                    displayCurrency,
                    fxRateToKrw
                  )}
                </div>
              </div>
              <div className="rounded-[12px] border border-white/5 bg-white/[0.015] px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">
                  Total annual premium
                </div>
                <div className="mt-1 font-mono text-sm text-white">
                  {formatCurrencyFromKrwAtRate(
                    insuranceSummary.totalPremiumKrw,
                    displayCurrency,
                    fxRateToKrw
                  )}
                </div>
              </div>
              <div className="rounded-[12px] border border-white/5 bg-white/[0.015] px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">
                  Avg deductible
                </div>
                <div className="mt-1 font-mono text-sm text-white">
                  {insuranceSummary.averageDeductibleKrw !== null
                    ? formatCurrencyFromKrwAtRate(
                        insuranceSummary.averageDeductibleKrw,
                        displayCurrency,
                        fxRateToKrw
                      )
                    : '—'}
                </div>
              </div>
            </div>
          </Card>
        </section>
      ) : null}

      {taxWalk.rows.length > 0 ? (
        <section id="im-tax-walk" className="app-shell py-4">
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="eyebrow">Tax leakage walk</div>
                <p className="mt-2 max-w-3xl text-sm text-slate-400">
                  Cash-tax outflow over the hold — acquisition transfer, annual property tax,
                  corporate income tax on operating earnings, exit transfer tax, and cross-
                  border withholding. Lets the LP size the gross-to-net tax drag separately
                  from the operating model.
                </p>
              </div>
              <Badge tone="warn">
                Total{' '}
                {formatCurrencyFromKrwAtRate(
                  taxWalk.totalCashOutflowKrw,
                  displayCurrency,
                  fxRateToKrw
                )}
              </Badge>
            </div>
            <div className="mt-5 overflow-x-auto rounded-[14px] border border-white/10">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2 font-semibold">Tax line</th>
                    <th className="px-2 py-2 text-right font-semibold">Rate</th>
                    <th className="px-2 py-2 text-right font-semibold">Base</th>
                    <th className="px-2 py-2 text-right font-semibold">Cash outflow</th>
                    <th className="px-2 py-2 font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-200">
                  {taxWalk.rows.map((row) => (
                    <tr key={row.category}>
                      <td className="px-2 py-2 text-white">{row.label}</td>
                      <td className="px-2 py-2 text-right font-mono">
                        {row.ratePct.toFixed(2)}%
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-slate-400">
                        {formatCurrencyFromKrwAtRate(row.baseKrw, displayCurrency, fxRateToKrw)}
                        <div className="text-[9px] text-slate-500">{row.baseLabel}</div>
                      </td>
                      <td className="px-2 py-2 text-right font-mono">
                        {formatCurrencyFromKrwAtRate(
                          row.totalCashOutflowKrw,
                          displayCurrency,
                          fxRateToKrw
                        )}
                      </td>
                      <td className="px-2 py-2 text-[10px] text-slate-400">{row.notes}</td>
                    </tr>
                  ))}
                  <tr className="bg-white/[0.03]">
                    <td className="px-2 py-2 font-semibold text-white" colSpan={3}>
                      Total
                    </td>
                    <td className="px-2 py-2 text-right font-mono font-semibold text-white">
                      {formatCurrencyFromKrwAtRate(
                        taxWalk.totalCashOutflowKrw,
                        displayCurrency,
                        fxRateToKrw
                      )}
                    </td>
                    <td className="px-2 py-2 text-[10px] text-slate-500">
                      {taxWalk.effectiveDragOnGrossPct !== null
                        ? `≈ ${taxWalk.effectiveDragOnGrossPct.toFixed(1)}% drag on pre-tax gross profit (cumulative NOI + exit gain)`
                        : ''}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {taxWalk.basisCaveat ? (
              <p className="mt-3 rounded-[12px] border border-amber-300/20 bg-amber-300/[0.04] px-3 py-2 text-[10px] leading-5 text-amber-200">
                <span className="font-semibold uppercase tracking-wide text-amber-300">Basis caveat ·{' '}</span>
                {taxWalk.basisCaveat}
              </p>
            ) : null}
          </Card>
        </section>
      ) : null}

      {fxExposure ? (
        <section id="im-fx" className="app-shell py-4">
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="eyebrow">FX exposure</div>
                <p className="mt-2 max-w-3xl text-sm text-slate-400">
                  {fxExposure.notes}
                </p>
              </div>
              <Badge
                tone={
                  fxExposure.exposureBand === 'high'
                    ? 'warn'
                    : fxExposure.exposureBand === 'low'
                      ? 'good'
                      : undefined
                }
              >
                {fxExposure.exposureBand.toUpperCase()} exposure
              </Badge>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-[16px] border border-white/10 bg-white/[0.02] p-3">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">
                  Asset currency
                </div>
                <div className="mt-2 font-mono text-lg font-semibold text-white">
                  {fxExposure.assetCurrency}
                </div>
              </div>
              <div className="rounded-[16px] border border-white/10 bg-white/[0.02] p-3">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">
                  LP base currency
                </div>
                <div className="mt-2 font-mono text-lg font-semibold text-white">
                  {fxExposure.lpBaseCurrency}
                </div>
              </div>
              <div className="rounded-[16px] border border-white/10 bg-white/[0.02] p-3">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">
                  Spot
                </div>
                <div className="mt-2 font-mono text-sm text-white">{fxExposure.spotRateLabel}</div>
              </div>
            </div>
            <div className="mt-5 overflow-x-auto rounded-[14px] border border-white/10">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2 font-semibold">FX shock</th>
                    {fxExposure.sensitivity.map((s) => (
                      <th key={s.shockPct} className="px-2 py-2 text-right font-semibold">
                        {s.shockPct >= 0 ? '+' : ''}{s.shockPct}%
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-2 py-2 text-slate-400">
                      Asset value in {fxExposure.lpBaseCurrency}
                    </td>
                    {fxExposure.sensitivity.map((s) => {
                      const tone =
                        s.shockPct < 0
                          ? 'text-emerald-300'
                          : s.shockPct > 0
                            ? 'text-rose-300'
                            : 'text-white';
                      return (
                        <td
                          key={s.shockPct}
                          className={`px-2 py-2 text-right font-mono ${tone}`}
                        >
                          {(s.baseCurrencyValue / 1_000_000).toLocaleString(undefined, {
                            maximumFractionDigits: 1
                          })}M {fxExposure.lpBaseCurrency}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[10px] leading-4 text-slate-500">
              Negative shock = KRW strengthens vs {fxExposure.lpBaseCurrency} (translation
              gain). Positive shock = KRW weakens (translation loss). No deal-level NDF /
              forward hedge is modeled.
            </p>
          </Card>
        </section>
      ) : null}

      {(asset.ownershipRecords && asset.ownershipRecords.length > 0) ||
      (asset.parcels && asset.parcels.length > 0) ||
      (asset.buildingRecords && asset.buildingRecords.length > 0) ||
      (asset.planningConstraints && asset.planningConstraints.length > 0) ||
      (asset.encumbranceRecords && asset.encumbranceRecords.length > 0) ? (
        <section id="im-title" className="app-shell py-4">
          <Card>
            <div className="eyebrow">Title, parcel &amp; planning diligence</div>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Legal diligence anchors. Ownership establishes title; parcels carry zoning and official land valuation; encumbrances list liens and pledges; planning constraints capture zoning overlays and use restrictions.
            </p>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {asset.ownershipRecords && asset.ownershipRecords.length > 0 ? (
                <div>
                  <div className="fine-print">Ownership chain</div>
                  <ul className="mt-3 space-y-2">
                    {asset.ownershipRecords.map((o) => (
                      <li
                        key={o.id}
                        className="rounded-[14px] border border-white/5 bg-white/[0.02] px-3 py-2 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-white">{o.ownerName}</span>
                          <span className="font-mono text-xs text-slate-400">
                            {typeof o.ownershipPct === 'number' ? `${o.ownershipPct.toFixed(0)}%` : '—'}
                          </span>
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          {o.entityType ?? 'entity'} ·
                          {o.effectiveDate ? ` from ${formatDate(o.effectiveDate)}` : ' open-ended'}
                          {' · '}
                          {o.sourceSystem}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {asset.encumbranceRecords && asset.encumbranceRecords.length > 0 ? (
                <div>
                  <div className="fine-print">Encumbrances</div>
                  <ul className="mt-3 space-y-2">
                    {asset.encumbranceRecords.map((e) => (
                      <li
                        key={e.id}
                        className="rounded-[14px] border border-rose-300/15 bg-rose-300/[0.04] px-3 py-2 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-white">
                            {e.encumbranceType}
                            {e.holderName ? ` · ${e.holderName}` : ''}
                          </span>
                          <span className="font-mono text-xs text-slate-300">
                            {typeof e.securedAmountKrw === 'number'
                              ? formatCurrencyFromKrwAtRate(
                                  e.securedAmountKrw,
                                  displayCurrency,
                                  fxRateToKrw
                                )
                              : '—'}
                          </span>
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          rank {e.priorityRank ?? '—'}
                          {e.statusLabel ? ` · ${e.statusLabel}` : ''}
                          {e.effectiveDate ? ` · from ${formatDate(e.effectiveDate)}` : ''}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {asset.parcels && asset.parcels.length > 0 ? (
                <div>
                  <div className="fine-print">Parcels</div>
                  <ul className="mt-3 space-y-2">
                    {asset.parcels.map((p) => (
                      <li
                        key={p.id}
                        className="rounded-[14px] border border-white/5 bg-white/[0.02] px-3 py-2 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-white">{p.parcelId}</span>
                          <span className="text-[11px] text-slate-400">
                            {typeof p.landAreaSqm === 'number'
                              ? `${formatNumber(p.landAreaSqm, 0)} sqm`
                              : '—'}
                          </span>
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          {p.zoningCode ?? p.landUseType ?? 'zoning n/a'} ·
                          {typeof p.officialLandValueKrw === 'number'
                            ? ` ${formatCurrencyFromKrwAtRate(p.officialLandValueKrw, displayCurrency, fxRateToKrw)} official`
                            : ' no land value'}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {asset.planningConstraints && asset.planningConstraints.length > 0 ? (
                <div>
                  <div className="fine-print">Planning constraints</div>
                  <ul className="mt-3 space-y-2">
                    {asset.planningConstraints.map((c) => (
                      <li
                        key={c.id}
                        className="rounded-[14px] border border-amber-300/15 bg-amber-300/[0.04] px-3 py-2 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-white">{c.title}</span>
                          {c.severity ? (
                            <span className="text-[10px] uppercase tracking-wide text-amber-300">
                              {c.severity}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-400">
                          {c.constraintType}
                          {c.description ? ` · ${c.description}` : ''}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {asset.buildingRecords && asset.buildingRecords.length > 0 ? (
                <div>
                  <div className="fine-print">Building records</div>
                  <ul className="mt-3 space-y-2">
                    {asset.buildingRecords.map((b) => (
                      <li
                        key={b.id}
                        className="rounded-[14px] border border-white/5 bg-white/[0.02] px-3 py-2 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-white">
                            {b.buildingName ?? b.buildingIdentifier ?? 'Unnamed building'}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {b.completionDate ? formatDate(b.completionDate) : '—'}
                          </span>
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          {b.useType ?? 'use n/a'} · {b.floorCount ?? '?'}F /
                          {b.basementCount ?? '?'}B ·
                          {typeof b.grossFloorAreaSqm === 'number'
                            ? ` ${formatNumber(b.grossFloorAreaSqm, 0)} sqm GFA`
                            : ' GFA n/a'}
                          {b.structureType ? ` · ${b.structureType}` : ''}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </Card>
        </section>
      ) : null}

      {proForma ? (
        <section id="im-sources-uses" className="app-shell py-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <div className="eyebrow">Sources & Uses</div>
              <p className="mt-2 text-sm text-slate-400">
                Initial capitalization at close. Equity equals total cost less drawn debt at funding; reserves accrue against the year-one equity outflow.
              </p>
              <dl className="mt-5 grid gap-3 text-sm">
                <Row label="Sources · senior debt">
                  {formatCurrencyFromKrwAtRate(
                    proForma.summary.initialDebtFundingKrw,
                    displayCurrency,
                    fxRateToKrw
                  )}
                </Row>
                <Row label="Sources · LP/GP equity">
                  {formatCurrencyFromKrwAtRate(
                    proForma.summary.initialEquityKrw,
                    displayCurrency,
                    fxRateToKrw
                  )}
                </Row>
                <Row label="Sources · total">
                  {formatCurrencyFromKrwAtRate(
                    proForma.summary.initialDebtFundingKrw + proForma.summary.initialEquityKrw,
                    displayCurrency,
                    fxRateToKrw
                  )}
                </Row>
                <Row label="Uses · purchase + capex">
                  {formatCurrencyFromKrwAtRate(
                    proForma.summary.initialDebtFundingKrw + proForma.summary.initialEquityKrw,
                    displayCurrency,
                    fxRateToKrw
                  )}
                </Row>
                <Row label="Reserves required">
                  {formatCurrencyFromKrwAtRate(
                    proForma.summary.reserveRequirementKrw,
                    displayCurrency,
                    fxRateToKrw
                  )}
                </Row>
                <Row label="Peak equity exposure">
                  {formatCurrencyFromKrwAtRate(
                    proForma.summary.peakEquityExposureKrw,
                    displayCurrency,
                    fxRateToKrw
                  )}
                </Row>
              </dl>

              {capexBreakdown.totalCapexKrw !== null ? (
                <div className="mt-5 overflow-x-auto rounded-[14px] border border-white/10">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                        <th className="px-2 py-2 font-semibold">Uses · line item</th>
                        <th className="px-2 py-2 text-right font-semibold">Amount</th>
                        <th className="px-2 py-2 text-right font-semibold">% of total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-slate-200">
                      {([
                        ['Land', capexBreakdown.landValueKrw],
                        ['Shell & core', capexBreakdown.shellCoreKrw],
                        ['Mechanical', capexBreakdown.mechanicalKrw],
                        ['Electrical', capexBreakdown.electricalKrw],
                        ['IT fit-out', capexBreakdown.itFitOutKrw],
                        ['Soft cost', capexBreakdown.softCostKrw],
                        ['Contingency', capexBreakdown.contingencyKrw]
                      ] as const)
                        .filter(([, v]) => typeof v === 'number' && v > 0)
                        .map(([label, value]) => (
                          <tr key={label}>
                            <td className="px-2 py-2 text-slate-300">{label}</td>
                            <td className="px-2 py-2 text-right font-mono">
                              {formatCurrencyFromKrwAtRate(
                                value as number,
                                displayCurrency,
                                fxRateToKrw
                              )}
                            </td>
                            <td className="px-2 py-2 text-right font-mono text-slate-400">
                              {(((value as number) / (capexBreakdown.totalCapexKrw ?? 1)) * 100).toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      <tr className="bg-white/[0.03] font-semibold">
                        <td className="px-2 py-2 text-white">Total</td>
                        <td className="px-2 py-2 text-right font-mono text-white">
                          {formatCurrencyFromKrwAtRate(
                            capexBreakdown.totalCapexKrw,
                            displayCurrency,
                            fxRateToKrw
                          )}
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-slate-400">100.0%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : null}
              <ProvenancePill entries={provenanceByCard.capex} />
            </Card>

            <Card>
              <div className="eyebrow">Equity returns</div>
              <p className="mt-2 text-sm text-slate-400">
                Levered returns computed from the year-by-year cash flow stream of the base case. Equity multiple = total distributions / initial equity.
              </p>
              <dl className="mt-5 grid gap-3 text-sm">
                <Row label="Equity IRR">
                  {proForma.summary.equityIrr !== null
                    ? formatPercent(proForma.summary.equityIrr)
                    : '—'}
                </Row>
                <Row label="Unlevered IRR">
                  {proForma.summary.unleveragedIrr !== null
                    ? formatPercent(proForma.summary.unleveragedIrr)
                    : '—'}
                </Row>
                <Row label="Equity multiple">
                  {proForma.summary.equityMultiple > 0
                    ? `${proForma.summary.equityMultiple.toFixed(2)}x`
                    : '—'}
                </Row>
                <Row label="Avg cash-on-cash">
                  {proForma.summary.averageCashOnCash > 0
                    ? formatPercent(proForma.summary.averageCashOnCash)
                    : '—'}
                </Row>
                <Row label="Payback year">
                  {proForma.summary.paybackYear !== null
                    ? `Year ${proForma.summary.paybackYear}`
                    : 'Beyond model horizon'}
                </Row>
                <Row label="Net exit proceeds">
                  {formatCurrencyFromKrwAtRate(
                    proForma.summary.netExitProceedsKrw,
                    displayCurrency,
                    fxRateToKrw
                  )}
                </Row>
              </dl>
            </Card>
          </div>
        </section>
      ) : null}

      {capitalCalls && capitalCalls.rows.length > 0 ? (
        <section id="im-capital-calls" className="app-shell py-4">
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <div className="eyebrow">Capital call schedule</div>
                  <span className="rounded-[6px] border border-amber-300/30 bg-amber-300/[0.04] px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide text-amber-200">
                    INDICATIVE
                  </span>
                </div>
                <p className="mt-2 max-w-3xl text-sm text-slate-400">
                  Default 60 / 30 / reserve top-up split applied as a placeholder. The actual
                  schedule is set by the LPA and varies materially by fund-vehicle structure
                  (closed-end vs evergreen), draw-down period, and per-LP commitment size.
                  Treat this as cash-staging guidance, not a covenant.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge>
                  Total commitment{' '}
                  {formatCurrencyFromKrwAtRate(
                    capitalCalls.totalCommitmentKrw,
                    displayCurrency,
                    fxRateToKrw
                  )}
                </Badge>
                <Badge tone="good">
                  Upfront {capitalCalls.upfrontPctOfCommitment.toFixed(0)}%
                </Badge>
              </div>
            </div>
            <div className="mt-5 overflow-x-auto rounded-[14px] border border-white/10">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2 font-semibold">Call #</th>
                    <th className="px-2 py-2 font-semibold">Period</th>
                    <th className="px-2 py-2 font-semibold">Purpose</th>
                    <th className="px-2 py-2 text-right font-semibold">Amount</th>
                    <th className="px-2 py-2 text-right font-semibold">Cumulative</th>
                    <th className="px-2 py-2 text-right font-semibold">% of commitment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-200">
                  {capitalCalls.rows.map((row) => (
                    <tr key={row.callNumber}>
                      <td className="px-2 py-2 font-mono text-slate-400">
                        #{row.callNumber}
                      </td>
                      <td className="px-2 py-2 text-slate-300">{row.yearLabel}</td>
                      <td className="px-2 py-2 text-[11px] text-slate-400">
                        {row.purpose}
                      </td>
                      <td className="px-2 py-2 text-right font-mono">
                        {formatCurrencyFromKrwAtRate(
                          row.amountKrw,
                          displayCurrency,
                          fxRateToKrw
                        )}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-slate-400">
                        {formatCurrencyFromKrwAtRate(
                          row.cumulativeKrw,
                          displayCurrency,
                          fxRateToKrw
                        )}
                      </td>
                      <td className="px-2 py-2 text-right font-mono">
                        {row.cumulativePctOfCommitment.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {capitalCalls.remainingUncalledKrw > 0 ? (
              <p className="mt-3 text-[10px] text-slate-500">
                Remaining uncalled commitment:{' '}
                <span className="font-mono text-slate-300">
                  {formatCurrencyFromKrwAtRate(
                    capitalCalls.remainingUncalledKrw,
                    displayCurrency,
                    fxRateToKrw
                  )}
                </span>{' '}
                · final indicative call: {capitalCalls.estimatedFinalCallYear ?? '—'}
              </p>
            ) : null}
          </Card>
        </section>
      ) : null}

      {asset.capexLineItems && asset.capexLineItems.length > 0 ? (
        <section id="im-capex" className="app-shell py-4">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="eyebrow">Capex schedule (line items)</div>
                <p className="mt-2 max-w-3xl text-sm text-slate-400">
                  Capex schedule by trade package and spend year. Sources &amp; Uses above carries the category aggregates; this view splits the underlying budget lines, with embedded-in-price vs incremental capex flagged on each row.
                </p>
              </div>
              <Badge>
                {asset.capexLineItems.length} line item{asset.capexLineItems.length === 1 ? '' : 's'}
              </Badge>
            </div>
            <div className="mt-5 overflow-x-auto rounded-[14px] border border-white/10">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2 font-semibold">Category</th>
                    <th className="px-2 py-2 font-semibold">Label</th>
                    <th className="px-2 py-2 text-right font-semibold">Year</th>
                    <th className="px-2 py-2 text-right font-semibold">Embedded</th>
                    <th className="px-2 py-2 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-200">
                  {asset.capexLineItems.map((item) => (
                    <tr key={item.id}>
                      <td className="px-2 py-2 text-[10px] uppercase tracking-wide text-slate-400">
                        {item.category.replace(/_/g, ' ').toLowerCase()}
                      </td>
                      <td className="px-2 py-2 text-slate-200">{item.label}</td>
                      <td className="px-2 py-2 text-right font-mono text-slate-400">
                        Y{item.spendYear}
                      </td>
                      <td className="px-2 py-2 text-right text-[10px]">
                        {item.isEmbedded ? (
                          <span className="text-amber-300">in price</span>
                        ) : (
                          <span className="text-slate-500">additional</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right font-mono">
                        {formatCurrencyFromKrwAtRate(
                          item.amountKrw,
                          displayCurrency,
                          fxRateToKrw
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-white/[0.03] font-semibold">
                    <td className="px-2 py-2 text-white" colSpan={4}>
                      Total
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-white">
                      {formatCurrencyFromKrwAtRate(
                        asset.capexLineItems.reduce((sum, i) => sum + i.amountKrw, 0),
                        displayCurrency,
                        fxRateToKrw
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      ) : null}

      {proForma && proForma.years.length > 0 ? (
        <section id="im-pnl" className="app-shell py-4">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="eyebrow">Year-by-year P&L (base case)</div>
                <p className="mt-2 text-sm text-slate-400">
                  Operating cash flow per year of the hold — revenue, NOI, debt service, DSCR. Numbers in KRW millions; toggle to {displayCurrency} via the cover currency selector.
                </p>
              </div>
              <Badge tone="good">{proForma.years.length} year hold</Badge>
            </div>
            <div className="mt-5 overflow-x-auto rounded-[18px] border border-white/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/[0.04] text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-semibold">Year</th>
                    <th className="px-3 py-2 text-right font-semibold">Revenue</th>
                    <th className="px-3 py-2 text-right font-semibold">Opex</th>
                    <th className="px-3 py-2 text-right font-semibold">NOI</th>
                    <th className="px-3 py-2 text-right font-semibold">Debt service</th>
                    <th className="px-3 py-2 text-right font-semibold">DSCR</th>
                    <th className="px-3 py-2 text-right font-semibold">Distributions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-200">
                  {proForma.years.map((year) => {
                    const toMillions = (n: number) => `₩${formatNumber(n / 1_000_000, 0)}`;
                    return (
                      <tr key={year.year}>
                        <td className="px-3 py-2 text-xs text-slate-400">Y{year.year}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {toMillions(year.revenueKrw)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-slate-400">
                          {toMillions(year.operatingExpenseKrw)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-white">
                          {toMillions(year.noiKrw)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-slate-400">
                          {toMillions(year.debtServiceKrw)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {year.dscr !== null ? `${year.dscr.toFixed(2)}x` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {toMillions(year.afterTaxDistributionKrw)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      ) : null}

      {scenarioDiff.length > 0 ? (
        <section id="im-scenario" className="app-shell py-4">
          <Card>
            <div className="eyebrow">Scenario diff (vs base case)</div>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Bull and bear cases reflect specific levers relative to base. Columns show the delta
              in implied yield, exit cap, and DSCR for each scenario versus the base case.
            </p>
            <div className="mt-5 overflow-x-auto rounded-[18px] border border-white/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/[0.04] text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-semibold">Case</th>
                    <th className="px-3 py-2 text-right font-semibold">Value</th>
                    <th className="px-3 py-2 text-right font-semibold">Δ value</th>
                    <th className="px-3 py-2 text-right font-semibold">Implied yield</th>
                    <th className="px-3 py-2 text-right font-semibold">Δ yield</th>
                    <th className="px-3 py-2 text-right font-semibold">Exit cap</th>
                    <th className="px-3 py-2 text-right font-semibold">Δ exit cap</th>
                    <th className="px-3 py-2 text-right font-semibold">DSCR</th>
                    <th className="px-3 py-2 text-right font-semibold">Δ DSCR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-200">
                  {scenarioDiff.map((row) => {
                    const isBase = row.name === 'Base';
                    const fmtBps = (v: number | null) =>
                      v === null ? '—' : `${v >= 0 ? '+' : ''}${v} bps`;
                    return (
                      <tr key={row.name} className={isBase ? 'bg-white/[0.03]' : ''}>
                        <td className="px-3 py-2 font-semibold text-white">{row.name}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {formatCurrencyFromKrwAtRate(
                            row.valuationKrw,
                            displayCurrency,
                            fxRateToKrw
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-slate-400">
                          {isBase
                            ? '—'
                            : `${row.valueDeltaPct >= 0 ? '+' : ''}${row.valueDeltaPct.toFixed(1)}%`}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {row.impliedYieldPct !== null
                            ? `${row.impliedYieldPct.toFixed(2)}%`
                            : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-slate-400">
                          {isBase ? '—' : fmtBps(row.impliedYieldDeltaBps)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {row.exitCapRatePct !== null
                            ? `${row.exitCapRatePct.toFixed(2)}%`
                            : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-slate-400">
                          {isBase ? '—' : fmtBps(row.exitCapDeltaBps)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {row.debtServiceCoverage !== null
                            ? `${row.debtServiceCoverage.toFixed(2)}x`
                            : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-slate-400">
                          {isBase
                            ? '—'
                            : row.dscrDelta !== null
                              ? `${row.dscrDelta >= 0 ? '+' : ''}${row.dscrDelta.toFixed(2)}x`
                              : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 grid gap-3 text-xs text-slate-400 md:grid-cols-3">
              {scenarioDiff.map((row) => (
                <div
                  key={`${row.name}-note`}
                  className="rounded-[14px] border border-white/5 bg-white/[0.02] px-3 py-2"
                >
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">
                    {row.name} narrative
                  </div>
                  <p className="mt-1 leading-5 text-slate-300">{row.notes || '—'}</p>
                </div>
              ))}
            </div>
          </Card>
        </section>
      ) : null}

      {txCompsToShow.length > 0 || rentCompsToShow.length > 0 ? (
        <section id="im-comps" className="app-shell py-4">
          <Card>
            <div className="eyebrow">Comparable transactions &amp; rent comps</div>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Submarket comparables anchoring cap-rate and rent underwriting. Transaction comps support the value approach; rent comps support WALT and mark-to-market. Each row references its source.
              {asset.transactionComps?.length === 0 && txCompsToShow.length > 0
                ? ' Submarket-wide comparables shown for pre-stabilization assets without direct comps.'
                : ''}
            </p>

            <div className="mt-5 rounded-[14px] border border-white/10 bg-white/[0.02] p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="fine-print">Hedonic-fitted comparable price</div>
                  <p className="mt-1 max-w-3xl text-xs text-slate-400">
                    OLS log-linear regression of comp price/sqm on size, vintage, submarket,
                    tier, and deal-structure dummies. Returns the fitted price/sqm for this
                    asset controlled for those features — independent of the raw comp average.
                  </p>
                </div>
                {hedonicFit ? (
                  <Badge tone="good">
                    {hedonicCompInputs.length} comps · R² {hedonicFit.rSquared.toFixed(2)}
                  </Badge>
                ) : (
                  <Badge tone="warn">Insufficient comp data</Badge>
                )}
              </div>
              {hedonicFit ? (
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-[12px] border border-white/5 bg-white/[0.015] px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">
                      Fitted price / sqm
                    </div>
                    <div className="mt-1 font-mono text-sm font-semibold text-white">
                      {formatNumber(hedonicFit.fittedPricePerSqmKrw, 0)} KRW
                    </div>
                  </div>
                  <div className="rounded-[12px] border border-white/5 bg-white/[0.015] px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">
                      Adjusted R²
                    </div>
                    <div className="mt-1 font-mono text-sm text-white">
                      {hedonicFit.adjustedRSquared.toFixed(3)}
                    </div>
                  </div>
                  <div className="rounded-[12px] border border-white/5 bg-white/[0.015] px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">
                      Residual SE (log)
                    </div>
                    <div className="mt-1 font-mono text-sm text-white">
                      {hedonicFit.residualStdErr.toFixed(3)}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-[11px] leading-5 text-slate-400">
                  Need at least {Math.max(4 - hedonicCompInputs.length, 1)} more comparable
                  transactions to identify the regression. Add MOLIT 실거래가 ingest for
                  faster fill.
                </p>
              )}
            </div>

            {txCompsToShow.length > 0 ? (
              <div className="mt-5 overflow-x-auto rounded-[14px] border border-white/10">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                      <th className="px-2 py-2 font-semibold">Date</th>
                      <th className="px-2 py-2 font-semibold">Submarket</th>
                      <th className="px-2 py-2 font-semibold">Type / tier</th>
                      <th className="px-2 py-2 text-right font-semibold">Price</th>
                      <th className="px-2 py-2 text-right font-semibold">Cap rate</th>
                      <th className="px-2 py-2 text-right font-semibold">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-200">
                    {txCompsToShow.slice(0, 8).map((c) => (
                      <tr key={c.id}>
                        <td className="px-2 py-2 text-slate-400">
                          {c.transactionDate ? formatDate(c.transactionDate) : '—'}
                        </td>
                        <td className="px-2 py-2">
                          <div className="text-white">{c.region}</div>
                          <div className="text-[10px] text-slate-500">{c.market}</div>
                        </td>
                        <td className="px-2 py-2 text-slate-300">
                          <div>{c.comparableType}</div>
                          {c.assetTier ? (
                            <div className="text-[10px] text-slate-500">{c.assetTier}</div>
                          ) : null}
                        </td>
                        <td className="px-2 py-2 text-right font-mono">
                          {typeof c.priceKrw === 'number' && c.priceKrw > 0
                            ? formatCurrencyFromKrwAtRate(
                                c.priceKrw,
                                displayCurrency,
                                fxRateToKrw
                              )
                            : '—'}
                        </td>
                        <td className="px-2 py-2 text-right font-mono">
                          {typeof c.capRatePct === 'number'
                            ? `${c.capRatePct.toFixed(2)}%`
                            : '—'}
                        </td>
                        <td className="px-2 py-2 text-right text-[10px] text-slate-400">
                          {c.sourceSystem}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {rentCompsToShow.length > 0 ? (
              <div className="mt-5 overflow-x-auto rounded-[14px] border border-white/10">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                      <th className="px-2 py-2 font-semibold">As of</th>
                      <th className="px-2 py-2 font-semibold">Submarket</th>
                      <th className="px-2 py-2 font-semibold">Type</th>
                      <th className="px-2 py-2 text-right font-semibold">Rent / kW</th>
                      <th className="px-2 py-2 text-right font-semibold">Rent / sqm</th>
                      <th className="px-2 py-2 text-right font-semibold">Occ</th>
                      <th className="px-2 py-2 text-right font-semibold">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-200">
                    {rentCompsToShow.slice(0, 8).map((r) => (
                      <tr key={r.id}>
                        <td className="px-2 py-2 text-slate-400">
                          {r.observationDate ? formatDate(r.observationDate) : '—'}
                        </td>
                        <td className="px-2 py-2">
                          <div className="text-white">{r.region}</div>
                          <div className="text-[10px] text-slate-500">{r.market}</div>
                        </td>
                        <td className="px-2 py-2 text-slate-300">{r.comparableType}</td>
                        <td className="px-2 py-2 text-right font-mono">
                          {typeof r.monthlyRatePerKwKrw === 'number'
                            ? `${formatNumber(r.monthlyRatePerKwKrw, 0)}`
                            : '—'}
                        </td>
                        <td className="px-2 py-2 text-right font-mono">
                          {typeof r.monthlyRentPerSqmKrw === 'number'
                            ? `${formatNumber(r.monthlyRentPerSqmKrw, 0)}`
                            : '—'}
                        </td>
                        <td className="px-2 py-2 text-right font-mono">
                          {typeof r.occupancyPct === 'number'
                            ? `${r.occupancyPct.toFixed(0)}%`
                            : '—'}
                        </td>
                        <td className="px-2 py-2 text-right text-[10px] text-slate-400">
                          {r.sourceSystem}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </Card>
        </section>
      ) : null}

      {(asset.researchSnapshots && asset.researchSnapshots.length > 0) ||
      (asset.coverageTasks && asset.coverageTasks.length > 0) ||
      (asset.aiInsights && asset.aiInsights.length > 0) ? (
        <section id="im-research" className="app-shell py-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {asset.researchSnapshots && asset.researchSnapshots.length > 0 ? (
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="eyebrow">Research desk publications</div>
                  <Badge>{asset.researchSnapshots.length}</Badge>
                </div>
                <p className="mt-2 text-sm text-slate-400">
                  Approved research snapshots anchoring the asset macro context. Each snapshot freshness status determines whether the underwriting may rely on it without a refresh.
                </p>
                <ul className="mt-5 space-y-2">
                  {asset.researchSnapshots.slice(0, 6).map((s) => (
                    <li
                      key={s.id}
                      className="rounded-[14px] border border-white/5 bg-white/[0.02] px-3 py-2 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-white">{s.title}</span>
                        <div className="flex items-center gap-2">
                          <FreshnessDot observedAt={s.snapshotDate} />
                          <span className="text-[10px] uppercase tracking-wide text-slate-500">
                            {s.freshnessStatus ?? 'n/a'}
                          </span>
                        </div>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        {formatDate(s.snapshotDate)} · {s.snapshotType}
                        {s.sourceSystem ? ` · ${s.sourceSystem}` : ''}
                      </div>
                      {s.summary ? (
                        <p className="mt-2 text-xs leading-5 text-slate-300">{s.summary}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {asset.coverageTasks && asset.coverageTasks.length > 0 ? (
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="eyebrow">Research coverage queue</div>
                  <Badge>
                    {asset.coverageTasks.filter((t) => t.status === 'OPEN').length} open
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-slate-400">
                  Outstanding research coverage items for the asset. HIGH-priority open items reduce confidence and require closure prior to investment committee.
                </p>
                <ul className="mt-5 space-y-2">
                  {asset.coverageTasks.slice(0, 8).map((t) => {
                    const priorityTone =
                      t.priority === 'HIGH'
                        ? 'border-rose-300/20 bg-rose-300/[0.04]'
                        : t.priority === 'LOW'
                          ? 'border-white/5 bg-white/[0.02]'
                          : 'border-amber-300/15 bg-amber-300/[0.03]';
                    return (
                      <li
                        key={t.id}
                        className={`rounded-[14px] border px-3 py-2 text-sm ${priorityTone}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-white">{t.title}</span>
                          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide">
                            <span className="text-slate-500">{t.taskType}</span>
                            <span className="text-slate-300">{t.priority}</span>
                            <span
                              className={
                                t.status === 'OPEN'
                                  ? 'text-rose-300'
                                  : 'text-emerald-300'
                              }
                            >
                              {t.status}
                            </span>
                          </div>
                        </div>
                        {t.notes ? (
                          <p className="mt-1 text-[11px] leading-5 text-slate-400">{t.notes}</p>
                        ) : null}
                        {t.dueDate ? (
                          <div className="mt-1 text-[10px] text-slate-500">
                            due {formatDate(t.dueDate)}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ) : null}

            {asset.aiInsights && asset.aiInsights.length > 0 ? (
              <Card className="lg:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="eyebrow">AI insights</div>
                  <Badge>{asset.aiInsights.length}</Badge>
                </div>
                <p className="mt-2 text-sm text-slate-400">
                  Model-generated commentary on the asset and its valuation runs. Each insight carries model attribution and an evidence reference.
                </p>
                <ul className="mt-5 space-y-2">
                  {asset.aiInsights.slice(0, 6).map((insight) => (
                    <li
                      key={insight.id}
                      className="rounded-[14px] border border-white/5 bg-white/[0.02] px-3 py-2 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-white">
                          {insight.title ?? insight.insightType}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide text-slate-500">
                          {insight.modelName} · {insight.status}
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-300">{insight.content}</p>
                      <div className="mt-1 text-[10px] text-slate-500">
                        {formatDate(insight.createdAt)} · {insight.insightType}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </div>
        </section>
      ) : null}

      {(asset.realizedOutcomes && asset.realizedOutcomes.length > 0) ||
      pipelineToShow.length > 0 ? (
        <section id="im-realized" className="app-shell py-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {asset.realizedOutcomes && asset.realizedOutcomes.length > 0 ? (
              <Card>
                <div className="eyebrow">Realized outcomes</div>
                <p className="mt-2 text-sm text-slate-400">
                  Realized occupancy, NOI, and DSCR observations on the asset. Used to calibrate underwriting against actual performance.
                </p>
                <div className="mt-5 overflow-x-auto rounded-[14px] border border-white/10">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                        <th className="px-2 py-2 font-semibold">Date</th>
                        <th className="px-2 py-2 text-right font-semibold">Occ</th>
                        <th className="px-2 py-2 text-right font-semibold">NOI</th>
                        <th className="px-2 py-2 text-right font-semibold">DSCR</th>
                        <th className="px-2 py-2 text-right font-semibold">Exit cap</th>
                        <th className="px-2 py-2 text-right font-semibold">Source</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-slate-200">
                      {asset.realizedOutcomes.map((o) => (
                        <tr key={o.id}>
                          <td className="px-2 py-2 text-slate-400">
                            {formatDate(o.observationDate)}
                          </td>
                          <td className="px-2 py-2 text-right font-mono">
                            {typeof o.occupancyPct === 'number'
                              ? `${o.occupancyPct.toFixed(1)}%`
                              : '—'}
                          </td>
                          <td className="px-2 py-2 text-right font-mono">
                            {typeof o.noiKrw === 'number'
                              ? formatCurrencyFromKrwAtRate(
                                  o.noiKrw,
                                  displayCurrency,
                                  fxRateToKrw
                                )
                              : '—'}
                          </td>
                          <td className="px-2 py-2 text-right font-mono">
                            {typeof o.debtServiceCoverage === 'number'
                              ? `${o.debtServiceCoverage.toFixed(2)}x`
                              : '—'}
                          </td>
                          <td className="px-2 py-2 text-right font-mono">
                            {typeof o.exitCapRatePct === 'number'
                              ? `${o.exitCapRatePct.toFixed(2)}%`
                              : '—'}
                          </td>
                          <td className="px-2 py-2 text-right text-[10px] text-slate-400">
                            {o.sourceSystem}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ) : null}

            {pipelineToShow.length > 0 ? (
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="eyebrow">Competitive supply pipeline</div>
                  <Badge>
                    {pipelineToShow.length} project{pipelineToShow.length === 1 ? '' : 's'}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-slate-400">
                  Announced supply competing for absorption during the hold period.
                  {asset.pipelineProjects?.length === 0 && pipelineToShow.length > 0
                    ? ' Submarket-wide entries shown where no asset-tied projects are recorded.'
                    : ''}
                </p>
                <div className="mt-5 overflow-x-auto rounded-[14px] border border-white/10">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                        <th className="px-2 py-2 font-semibold">Project</th>
                        <th className="px-2 py-2 font-semibold">Submarket</th>
                        <th className="px-2 py-2 font-semibold">Stage</th>
                        <th className="px-2 py-2 text-right font-semibold">MW / Sqm</th>
                        <th className="px-2 py-2 text-right font-semibold">Delivery</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-slate-200">
                      {pipelineToShow.map((p) => (
                        <tr key={p.id}>
                          <td className="px-2 py-2">
                            <div className="text-white">{p.projectName}</div>
                            {p.sponsorName ? (
                              <div className="text-[10px] text-slate-500">{p.sponsorName}</div>
                            ) : null}
                          </td>
                          <td className="px-2 py-2 text-slate-300">
                            {p.region ?? p.market}
                          </td>
                          <td className="px-2 py-2 text-slate-300">{p.stageLabel ?? '—'}</td>
                          <td className="px-2 py-2 text-right font-mono">
                            {typeof p.expectedPowerMw === 'number'
                              ? `${p.expectedPowerMw.toFixed(0)} MW`
                              : typeof p.expectedAreaSqm === 'number'
                                ? `${formatNumber(p.expectedAreaSqm, 0)} sqm`
                                : '—'}
                          </td>
                          <td className="px-2 py-2 text-right font-mono text-slate-400">
                            {p.expectedDeliveryDate
                              ? formatDate(p.expectedDeliveryDate)
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ) : null}
          </div>
        </section>
      ) : null}

      {supplyDemandModel ? (
        <section id="im-supply-demand" className="app-shell py-4">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="eyebrow">Supply-demand forecast</div>
                <p className="mt-2 max-w-3xl text-sm text-slate-400">
                  Probability-weighted pipeline supply (stage-conditional completion
                  rates) paired with a {supplyDemandModel.unit === 'MW' ? '8% AI-load' : '3% baseline'}
                  {' '}
                  demand growth assumption to project net absorption and implied vacancy
                  over a 5-year hold.
                </p>
              </div>
              <Badge>
                Year-1 pipeline = {formatNumber(supplyDemandModel.pipelineIntensityPct, 1)}% of supply
              </Badge>
            </div>
            <div className="mt-5 overflow-x-auto rounded-[14px] border border-white/10">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2 font-semibold">Year</th>
                    <th className="px-2 py-2 text-right font-semibold">
                      + Supply ({supplyDemandModel.unit})
                    </th>
                    <th className="px-2 py-2 text-right font-semibold">
                      Cumulative ({supplyDemandModel.unit})
                    </th>
                    <th className="px-2 py-2 text-right font-semibold">
                      Demand ({supplyDemandModel.unit})
                    </th>
                    <th className="px-2 py-2 text-right font-semibold">Net abs.</th>
                    <th className="px-2 py-2 text-right font-semibold">Vacancy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-200">
                  {supplyDemandModel.supplyDemand.map((row) => {
                    const tightening = row.netAbsorption > 0;
                    return (
                      <tr key={row.year}>
                        <td className="px-2 py-2 text-slate-400">{row.year}</td>
                        <td className="px-2 py-2 text-right font-mono">
                          {row.expectedSupplyDelta > 0
                            ? `+${formatNumber(row.expectedSupplyDelta, 1)}`
                            : '—'}
                        </td>
                        <td className="px-2 py-2 text-right font-mono">
                          {formatNumber(row.cumulativeSupply, 1)}
                        </td>
                        <td className="px-2 py-2 text-right font-mono">
                          {formatNumber(row.expectedDemand, 1)}
                        </td>
                        <td
                          className={`px-2 py-2 text-right font-mono ${
                            tightening ? 'text-emerald-300' : 'text-amber-300'
                          }`}
                        >
                          {tightening ? '+' : ''}
                          {formatNumber(row.netAbsorption, 1)}
                        </td>
                        <td className="px-2 py-2 text-right font-mono">
                          {formatNumber(row.impliedVacancyPct, 1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px] text-slate-500">
              Stage-weighted: ANNOUNCED 30% · PERMITTED 65% · UNDER_CONSTRUCTION 90% ·
              COMMISSIONING 98%. Override with sponsor-specific completion rates as
              new evidence arrives. Baseline demand seeded at 80% of starting supply
              (proxy for current take-up); replace with KEPCO load forecast when
              available.
            </p>
          </Card>
        </section>
      ) : null}

      {sensitivityGrids.length > 0 ? (
        <section id="im-sensitivity" className="app-shell py-4">
          <Card>
            <div className="eyebrow">Sensitivity matrices</div>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Two-way shock grids against the base case. Each cell shows the resulting metric and its delta versus base — sized for the committee underwriting band rather than a single point estimate.
            </p>
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              {sensitivityGrids.map((grid) => {
                const isCurrency = /value/i.test(grid.metricName);
                const isDscr = /dscr/i.test(grid.metricName);
                const fmt = (v: number) =>
                  isCurrency
                    ? formatCurrencyFromKrwAtRate(v, displayCurrency, fxRateToKrw)
                    : isDscr
                      ? `${v.toFixed(2)}x`
                      : v.toFixed(2);
                return (
                  <div
                    key={grid.runId}
                    className="rounded-[18px] border border-white/10 bg-white/[0.02] p-4"
                  >
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">{grid.title}</div>
                        <div className="text-xs text-slate-500">
                          Rows: {grid.rowAxisLabel} · Columns: {grid.columnAxisLabel}
                        </div>
                      </div>
                      <div className="text-right text-xs text-slate-400">
                        Base = <span className="font-mono">{fmt(grid.baselineValue)}</span>
                      </div>
                    </div>
                    <div className="mt-4 overflow-x-auto rounded-[14px] border border-white/10">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                            <th className="px-2 py-1.5 font-semibold">{grid.rowAxisLabel}</th>
                            {grid.columnLabels.map((c) => (
                              <th key={c} className="px-2 py-1.5 text-right font-semibold">
                                {c}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-slate-200">
                          {grid.rowLabels.map((rowLabel, r) => (
                            <tr key={rowLabel}>
                              <td className="px-2 py-1.5 text-slate-400">{rowLabel}</td>
                              {grid.columnLabels.map((colLabel, c) => {
                                const cell = grid.cells[r * grid.columnLabels.length + c];
                                if (!cell) {
                                  return (
                                    <td
                                      key={colLabel}
                                      className="px-2 py-1.5 text-right text-slate-600"
                                    >
                                      —
                                    </td>
                                  );
                                }
                                const sign = cell.deltaPct === 0 ? '' : cell.deltaPct > 0 ? '+' : '';
                                const tone =
                                  cell.deltaPct === 0
                                    ? 'text-white'
                                    : cell.deltaPct > 0
                                      ? 'text-emerald-300'
                                      : 'text-rose-300';
                                return (
                                  <td key={colLabel} className="px-2 py-1.5 text-right">
                                    <div className={`font-mono ${tone}`}>{fmt(cell.value)}</div>
                                    <div className="text-[10px] text-slate-500">
                                      {sign}
                                      {cell.deltaPct.toFixed(1)}%
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </section>
      ) : null}

      <section id="im-confidence" className="app-shell py-4">
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="eyebrow">Confidence score breakdown</div>
              <p className="mt-2 max-w-3xl text-sm text-slate-400">
                Coverage-driven composite. Each external section, structured section, and anchor signal contributes; physical-risk signals subtract. Present (green) and absent (slate) signals are listed below — closing the absent ones lifts the score.
              </p>
            </div>
            <div className="rounded-[16px] border border-white/10 bg-white/[0.03] px-4 py-3 text-right">
              <div className="fine-print">Final score</div>
              <div className="mt-1 text-2xl font-semibold text-white">
                {confidenceBreakdown.finalScore.toFixed(1)}
              </div>
              <div className="text-[10px] text-slate-500">
                {confidenceBreakdown.presentCount} / {confidenceBreakdown.totalCount} positive signals present
              </div>
            </div>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {(['External sections', 'Structured sections', 'Geo & price anchors', 'Risk penalties'] as const).map(
              (group) => {
                const rows = confidenceBreakdown.signals.filter((s) => s.group === group);
                if (rows.length === 0) return null;
                return (
                  <div
                    key={group}
                    className="rounded-[18px] border border-white/10 bg-white/[0.02] p-4"
                  >
                    <div className="fine-print">{group}</div>
                    <ul className="mt-3 space-y-2 text-sm">
                      {rows.map((row) => {
                        const isPenalty = row.direction === 'subtract';
                        const dot = row.present
                          ? isPenalty
                            ? 'bg-rose-400'
                            : 'bg-emerald-400'
                          : 'bg-slate-700';
                        const sign = isPenalty ? '−' : '+';
                        return (
                          <li
                            key={row.label}
                            className="flex items-center justify-between gap-3 rounded-[12px] border border-white/5 bg-white/[0.015] px-3 py-2"
                          >
                            <div className="flex items-center gap-2">
                              <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
                              <span className="text-slate-200">{row.label}</span>
                            </div>
                            <span className="font-mono text-xs text-slate-400">
                              {row.present
                                ? `${sign}${row.weight.toFixed(2)} pts`
                                : isPenalty
                                  ? '—'
                                  : `+${row.weight.toFixed(2)} pts (missing)`}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              }
            )}
          </div>
          <p className="mt-4 text-[11px] text-slate-500">
            Per-signal weights are the data-center underwriting framework’s nominal contributions. The final score is clamped between 4.5 and 9.9 and adjusted by a credit overlay; the listed contributions are illustrative and do not reconcile exactly to the printed value.
          </p>
        </Card>
      </section>

      {sponsorTrack ? (
        <section id="im-sponsor" className="app-shell py-4">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="eyebrow">Sponsor track record</div>
                <p className="mt-2 text-sm text-slate-400">
                  {sponsorTrack.name}
                  {sponsorTrack.hqMarket ? ` · ${sponsorTrack.hqMarket}` : ''}
                  {sponsorTrack.yearFounded ? ` · founded ${sponsorTrack.yearFounded}` : ''}
                  {sponsorTrack.aumKrw
                    ? ` · AUM ${formatNumber(sponsorTrack.aumKrw / 1_000_000_000_000, 2)}조 KRW`
                    : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {sponsorTrack.averageEquityMultiple !== null ? (
                  <Badge tone="good">avg {sponsorTrack.averageEquityMultiple.toFixed(2)}x</Badge>
                ) : null}
                {sponsorTrack.averageGrossIrrPct !== null ? (
                  <Badge tone="good">
                    avg IRR {sponsorTrack.averageGrossIrrPct.toFixed(1)}%
                  </Badge>
                ) : null}
                <Badge>{sponsorTrack.priorDealCount} prior</Badge>
                {sponsorTrack.oldestVintage ? (
                  <Badge>
                    {sponsorTrack.oldestVintage}–{sponsorTrack.newestVintage} vintage
                  </Badge>
                ) : null}
              </div>
            </div>
            {sponsorTrack.recentDeals.length === 0 ? (
              <div className="mt-5 rounded-[18px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
                Sponsor on file but no prior deals captured yet — populate the track record on{' '}
                <span className="font-mono text-xs">/admin/sponsors</span>.
              </div>
            ) : (
              <div className="mt-5 overflow-hidden rounded-[18px] border border-white/10">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white/[0.04] text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2 font-semibold">Deal</th>
                      <th className="px-3 py-2 font-semibold">Vintage</th>
                      <th className="px-3 py-2 font-semibold">Class / market</th>
                      <th className="px-3 py-2 text-right font-semibold">Multiple</th>
                      <th className="px-3 py-2 text-right font-semibold">IRR</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-200">
                    {sponsorTrack.recentDeals.map((d) => (
                      <tr key={d.id}>
                        <td className="px-3 py-2 text-sm">{d.dealName}</td>
                        <td className="px-3 py-2 text-xs">
                          {d.vintageYear}
                          {d.exitYear ? ` → ${d.exitYear}` : ''}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-400">
                          {d.assetClass ?? '—'} / {d.market ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {d.equityMultiple !== null ? `${d.equityMultiple.toFixed(2)}x` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {d.grossIrrPct !== null ? `${d.grossIrrPct.toFixed(1)}%` : '—'}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <Badge tone={d.status === 'EXITED' ? 'good' : 'warn'}>{d.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </section>
      ) : null}

      {(latestRun.keyRisks.length > 0 || latestRun.ddChecklist.length > 0) ? (
        <section id="im-risks" className="app-shell py-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {latestRun.keyRisks.length > 0 ? (
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="eyebrow">Key risks</div>
                  <Badge tone="warn">{latestRun.keyRisks.length}</Badge>
                </div>
                <p className="mt-2 text-sm text-slate-400">
                  Outstanding underwriting risks. Each item requires committee discussion; unresolved risks reduce confidence and may shift the recommendation.
                </p>
                <ul className="mt-5 space-y-2">
                  {latestRun.keyRisks.map((risk, idx) => (
                    <li
                      key={`risk-${idx}`}
                      className="flex gap-3 rounded-[14px] border border-amber-300/20 bg-amber-300/[0.04] px-3 py-2 text-sm"
                    >
                      <span
                        aria-hidden
                        className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-amber-300"
                      />
                      <span className="leading-6 text-slate-200">{risk}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {latestRun.ddChecklist.length > 0 ? (
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="eyebrow">Due diligence checklist</div>
                  <Badge>{latestRun.ddChecklist.length} open</Badge>
                </div>
                <p className="mt-2 text-sm text-slate-400">
                  Outstanding diligence items required to close. Items resolve as documents and
                  structured inputs replace placeholders, lifting confidence toward
                  investment-committee promotion.
                </p>
                <ul className="mt-5 space-y-2">
                  {latestRun.ddChecklist.map((item, idx) => (
                    <li
                      key={`dd-${idx}`}
                      className="flex gap-3 rounded-[14px] border border-white/5 bg-white/[0.02] px-3 py-2 text-sm"
                    >
                      <span
                        aria-hidden
                        className="mt-1.5 inline-block h-3 w-3 shrink-0 rounded-[3px] border border-slate-500"
                      />
                      <span className="leading-6 text-slate-200">{item}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </div>
        </section>
      ) : null}

      {asset.counterparties && asset.counterparties.length > 0 ? (
        <section id="im-counterparty" className="app-shell py-4">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="eyebrow">Counterparty financials</div>
              <Badge>
                {asset.counterparties.length} counterpart{asset.counterparties.length === 1 ? 'y' : 'ies'}
              </Badge>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Filed financials, derived credit ratios benchmarked against KR sponsor peer
              medians, 10-year projection, CFADS-based DSCR forward path, distribution
              waterfall, liquidity ladder, and 4×4 sensitivity grid.
            </p>

            {(() => {
              const strips: Array<{ label: string; rollup: typeof sponsorRollup }> = [];
              if (sponsorRollup && sponsorRollup.counterpartyCount > 0) {
                strips.push({
                  label: `Sponsor rollup · ${sponsorRollup.counterpartyCount} CP`,
                  rollup: sponsorRollup
                });
              }
              if (tenantRollup && tenantRollup.counterpartyCount > 0) {
                strips.push({
                  label: `Tenant rollup · ${tenantRollup.counterpartyCount} CP`,
                  rollup: tenantRollup
                });
              }
              if (strips.length < 2 && (sponsorRollup?.counterpartyCount ?? 0) <= 1) {
                return null;
              }
              return (
                <div className="mt-5 space-y-3">
                  {strips.map(({ label, rollup }) => (
                    <div
                      key={label}
                      className="rounded-[14px] border border-white/10 bg-white/[0.02] p-4"
                    >
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">
                        {label} · {rollup!.weightingBasis}-weighted
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-4">
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-slate-500">
                            Avg score
                          </div>
                          <div className="mt-1 font-mono text-sm font-semibold text-white">
                            {rollup!.averageScore !== null
                              ? rollup!.averageScore.toFixed(0)
                              : '—'}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-slate-500">
                            Wtd leverage
                          </div>
                          <div className="mt-1 font-mono text-sm font-semibold text-white">
                            {rollup!.weightedLeverage !== null
                              ? `${rollup!.weightedLeverage.toFixed(2)}x`
                              : '—'}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-slate-500">
                            Wtd interest coverage
                          </div>
                          <div className="mt-1 font-mono text-sm font-semibold text-white">
                            {rollup!.weightedInterestCoverage !== null
                              ? `${rollup!.weightedInterestCoverage.toFixed(2)}x`
                              : '—'}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-slate-500">
                            Risk mix
                          </div>
                          <div className="mt-1 font-mono text-[11px]">
                            <span className="text-emerald-300">
                              {rollup!.riskMix.LOW} LOW
                            </span>
                            {' · '}
                            <span className="text-amber-300">
                              {rollup!.riskMix.MODERATE} MOD
                            </span>
                            {' · '}
                            <span className="text-rose-300">
                              {rollup!.riskMix.HIGH} HIGH
                            </span>
                          </div>
                          {rollup!.weakestCounterpartyName ? (
                            <div className="mt-1 text-[10px] text-slate-500">
                              Weakest: {rollup!.weakestCounterpartyName}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            <div className="mt-5 space-y-8">
              {asset.counterparties.map((cp) => {
                const latestFs = cp.financialStatements?.[0] ?? null;
                const latestCa = latestFs?.creditAssessments?.[0] ?? null;
                if (!latestFs) {
                  return (
                    <div
                      key={cp.id}
                      className="rounded-[18px] border border-white/10 bg-white/[0.02] p-4"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="font-semibold text-white">{cp.name}</div>
                        <span className="text-[10px] uppercase tracking-wide text-slate-500">
                          {cp.role}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-400">No financial statement on file.</p>
                    </div>
                  );
                }
                const inc = buildIncomeStatement(latestFs);
                const bs = buildBalanceSheet(latestFs);
                const ratios = buildCreditRatios(latestFs);
                // Drive forward-projection inputs from the bundle's
                // own data: macro rent_growth_pct anchors revenue
                // growth; the asset's debt facility schedule anchors
                // amortization pace. Each pick carries a provenance
                // string the IM renders so the LP can challenge any
                // input.
                const growthInput = pickRevenueGrowthPct(asset.macroSeries ?? []);
                const amortInput = pickDebtAmortizationPct(asset.debtFacilities ?? []);
                const rateInput = pickInterestRatePct(
                  asset.debtFacilities ?? [],
                  asset.macroSeries ?? []
                );
                const projection = projectFinancials(latestFs, {
                  revenueGrowthPct: growthInput.value,
                  debtAmortizationPct: amortInput.value,
                  horizonYears: 10
                });
                const sensitivityMatrix = buildSensitivityMatrix(latestFs, {
                  ebitdaShocks: [0, -10, -20, -30],
                  rateShocks: [0, 100, 200, 300],
                  debtRepricedPct: 1.0
                });

                // Tier 1 derivatives — cash flow / FCF / CFADS / EBIT /
                // Net income. Tax rate sourced from the asset's
                // taxAssumption when present, falling back to the
                // default. Maintenance capex / D&A / WC are sector
                // proxies; the IM renders them under the FCF table.
                const taxRateDecimal =
                  typeof asset.taxAssumption?.corporateTaxPct === 'number'
                    ? asset.taxAssumption.corporateTaxPct / 100
                    : DEFAULT_CASH_FLOW_ASSUMPTIONS.taxRate;
                const principalRepayment =
                  bs.totalDebtKrw !== null
                    ? bs.totalDebtKrw * (amortInput.value / 100)
                    : 0;
                const cashFlow = buildCashFlowSlice({
                  ebitdaKrw: latestFs.ebitdaKrw,
                  revenueKrw: latestFs.revenueKrw,
                  interestExpenseKrw: latestFs.interestExpenseKrw,
                  taxRate: taxRateDecimal,
                  daRateOfRevenue: DEFAULT_CASH_FLOW_ASSUMPTIONS.daRateOfRevenue,
                  maintCapexRateOfRevenue:
                    DEFAULT_CASH_FLOW_ASSUMPTIONS.maintCapexRateOfRevenue,
                  wcChangeRate: DEFAULT_CASH_FLOW_ASSUMPTIONS.wcChangeRate,
                  principalRepaymentKrw: principalRepayment
                });
                // Tier 1 covenant headroom — current value distance from
                // benchmark + first-breach-year over the projection.
                const covenantHeadroom = buildCovenantHeadroom(projection);
                const covenantAlerts = buildCovenantAlerts(covenantHeadroom);
                // Tier 2 waterfall — tier table + LP/GP take at projected IRR.
                const spv = readSpvFromAssumptions(latestRun.assumptions);
                const projectedIrrPct =
                  proForma?.summary.equityIrr ?? returnsSnapshot.goingInYieldPct;
                const waterfall = buildWaterfall(spv, projectedIrrPct);
                // Tier 2 liquidity ladder — facility maturities × liquid
                // resources (cash + estimated annual operating CF).
                const liquidity = buildLiquidityLadder(
                  asset.debtFacilities ?? [],
                  {
                    cashKrw: bs.cashKrw,
                    estimatedAnnualCashFlowKrw: cashFlow.operatingCashFlowKrw
                  },
                  new Date().getFullYear()
                );
                // Tier 3 forward-path CFADS DSCR + peer benchmarks.
                const cfadsProjection =
                  inc.revenueKrw !== null &&
                  inc.ebitdaMarginPct !== null &&
                  bs.totalDebtKrw !== null
                    ? projectCfadsDscr(
                        {
                          revenueKrw: inc.revenueKrw,
                          ebitdaMarginPct: inc.ebitdaMarginPct,
                          interestRatePct: rateInput.value,
                          totalDebtKrw: bs.totalDebtKrw
                        },
                        {
                          revenueGrowthPct: growthInput.value,
                          debtAmortizationPct: amortInput.value,
                          horizonYears: 10,
                          taxRate: taxRateDecimal
                        }
                      )
                    : [];
                const peerComparison = buildPeerComparison(
                  Object.fromEntries(ratios.map((r) => [r.key, r.value])),
                  pickSectorKey(asset.assetClass, asset.market)
                );
                const riskTone =
                  latestCa?.riskLevel === 'LOW'
                    ? 'border-emerald-300/30 bg-emerald-300/[0.04] text-emerald-200'
                    : latestCa?.riskLevel === 'HIGH'
                      ? 'border-rose-300/30 bg-rose-300/[0.04] text-rose-200'
                      : 'border-amber-300/30 bg-amber-300/[0.04] text-amber-200';
                const fmt = (v: number | null) =>
                  v !== null
                    ? formatCurrencyFromKrwAtRate(v, displayCurrency, fxRateToKrw)
                    : '—';
                return (
                  <div
                    key={cp.id}
                    className="rounded-[20px] border border-white/10 bg-white/[0.015] p-5"
                  >
                    {/* Header */}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="text-base font-semibold text-white">{cp.name}</div>
                          {(() => {
                            const provSys = latestFs.provenanceSystem ?? '';
                            const sourceLabel =
                              provSys.toUpperCase().includes('DART')
                                ? { text: 'DART filing', tone: 'border-emerald-300/30 bg-emerald-300/[0.04] text-emerald-200' }
                                : provSys.toUpperCase().includes('AUDIT')
                                  ? { text: 'Audited', tone: 'border-emerald-300/30 bg-emerald-300/[0.04] text-emerald-200' }
                                  : provSys.toUpperCase().includes('UPLOAD')
                                    ? { text: 'Uploaded filing', tone: 'border-amber-300/30 bg-amber-300/[0.04] text-amber-200' }
                                    : { text: 'Management estimate', tone: 'border-slate-300/30 bg-slate-300/[0.04] text-slate-300' };
                            return (
                              <span
                                className={`rounded-[8px] border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide ${sourceLabel.tone}`}
                              >
                                {sourceLabel.text}
                              </span>
                            );
                          })()}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          <span className="uppercase tracking-wide">{cp.role}</span>
                          {' · '}
                          <span>{latestFs.fiscalPeriod ?? 'FY'}</span>
                          {latestFs.fiscalYear ? ` ${latestFs.fiscalYear}` : ''}
                          {' · '}
                          <span>{latestFs.currency ?? 'KRW'}</span>
                          {latestFs.provenanceSystem
                            ? ` · source: ${latestFs.provenanceSystem}`
                            : ' · source: operator-entered (no filing)'}
                          {' · '}
                          <span>
                            {(cp.financialStatements?.length ?? 0) === 1
                              ? 'No prior periods on file'
                              : `${cp.financialStatements?.length ?? 0} periods on file`}
                          </span>
                        </div>
                      </div>
                      {latestCa ? (
                        <span
                          className={`rounded-[10px] border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide ${riskTone}`}
                        >
                          {latestCa.riskLevel} · score {latestCa.score.toFixed(0)}
                        </span>
                      ) : null}
                    </div>

                    {/* Multi-year YoY trend (top three periods on file) */}
                    {(cp.financialStatements?.length ?? 0) >= 2 ? (
                      <div className="mt-5 rounded-[14px] border border-white/10 bg-white/[0.02] p-4">
                        <div className="fine-print">Multi-year trend</div>
                        <div className="mt-3 overflow-x-auto rounded-[12px] border border-white/10">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                                <th className="px-2 py-2 font-semibold">Period</th>
                                <th className="px-2 py-2 text-right font-semibold">Revenue</th>
                                <th className="px-2 py-2 text-right font-semibold">EBITDA</th>
                                <th className="px-2 py-2 text-right font-semibold">EBITDA margin</th>
                                <th className="px-2 py-2 text-right font-semibold">Total debt</th>
                                <th className="px-2 py-2 text-right font-semibold">Equity</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 text-slate-200">
                              {cp.financialStatements!.slice(0, 5).map((row, idx, arr) => {
                                const next = arr[idx + 1] ?? null;
                                const num = (
                                  d: { toNumber: () => number } | null | undefined
                                ) => (d ? d.toNumber() : null);
                                const rev = num(row.revenueKrw);
                                const ebd = num(row.ebitdaKrw);
                                const debt = num(row.totalDebtKrw);
                                const eq = num(row.totalEquityKrw);
                                const margin = rev && ebd ? (ebd / rev) * 100 : null;
                                const yoyRev =
                                  next && rev !== null && num(next.revenueKrw)
                                    ? ((rev - num(next.revenueKrw)!) /
                                        num(next.revenueKrw)!) *
                                      100
                                    : null;
                                const yoyEbd =
                                  next && ebd !== null && num(next.ebitdaKrw)
                                    ? ((ebd - num(next.ebitdaKrw)!) /
                                        num(next.ebitdaKrw)!) *
                                      100
                                    : null;
                                const arrow = (delta: number | null) => {
                                  if (delta === null) return null;
                                  const tone =
                                    delta > 0 ? 'text-emerald-300' : 'text-rose-300';
                                  const sign = delta > 0 ? '▲' : '▼';
                                  return (
                                    <div className={`text-[9px] ${tone}`}>
                                      {sign} {Math.abs(delta).toFixed(1)}% YoY
                                    </div>
                                  );
                                };
                                return (
                                  <tr key={`${row.fiscalYear ?? idx}`}>
                                    <td className="px-2 py-2 font-mono text-slate-400">
                                      {row.fiscalPeriod ?? 'FY'}{' '}
                                      {row.fiscalYear ?? ''}
                                    </td>
                                    <td className="px-2 py-2 text-right font-mono">
                                      {rev !== null
                                        ? formatCurrencyFromKrwAtRate(
                                            rev,
                                            displayCurrency,
                                            fxRateToKrw
                                          )
                                        : '—'}
                                      {arrow(yoyRev)}
                                    </td>
                                    <td className="px-2 py-2 text-right font-mono">
                                      {ebd !== null
                                        ? formatCurrencyFromKrwAtRate(
                                            ebd,
                                            displayCurrency,
                                            fxRateToKrw
                                          )
                                        : '—'}
                                      {arrow(yoyEbd)}
                                    </td>
                                    <td className="px-2 py-2 text-right font-mono text-slate-400">
                                      {margin !== null ? `${margin.toFixed(1)}%` : '—'}
                                    </td>
                                    <td className="px-2 py-2 text-right font-mono text-slate-400">
                                      {debt !== null
                                        ? formatCurrencyFromKrwAtRate(
                                            debt,
                                            displayCurrency,
                                            fxRateToKrw
                                          )
                                        : '—'}
                                    </td>
                                    <td className="px-2 py-2 text-right font-mono text-slate-400">
                                      {eq !== null
                                        ? formatCurrencyFromKrwAtRate(
                                            eq,
                                            displayCurrency,
                                            fxRateToKrw
                                          )
                                        : '—'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : null}

                    {/* Income statement + Balance sheet side-by-side */}
                    <div className="mt-5 grid gap-4 lg:grid-cols-2">
                      <div className="rounded-[14px] border border-white/10 bg-white/[0.02] p-4">
                        <div className="fine-print">Income statement</div>
                        <dl className="mt-3 space-y-1.5 text-xs">
                          <div className="flex justify-between">
                            <dt className="text-slate-400">Revenue</dt>
                            <dd className="font-mono text-white">{fmt(inc.revenueKrw)}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-slate-400">EBITDA</dt>
                            <dd className="font-mono text-white">{fmt(inc.ebitdaKrw)}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-slate-400">EBITDA margin</dt>
                            <dd className="font-mono text-white">
                              {inc.ebitdaMarginPct !== null
                                ? `${inc.ebitdaMarginPct.toFixed(1)}%`
                                : '—'}
                            </dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-slate-400">D&amp;A (assumed)</dt>
                            <dd className="font-mono text-white">{fmt(cashFlow.daKrw)}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-slate-400">EBIT</dt>
                            <dd className="font-mono text-white">{fmt(cashFlow.ebitKrw)}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-slate-400">Interest expense</dt>
                            <dd className="font-mono text-white">{fmt(inc.interestExpenseKrw)}</dd>
                          </div>
                          <div className="flex justify-between border-t border-white/5 pt-1.5">
                            <dt className="text-slate-300">Net income (post-tax)</dt>
                            <dd className="font-mono font-semibold text-white">
                              {fmt(cashFlow.netIncomeKrw)}
                            </dd>
                          </div>
                        </dl>
                        <p className="mt-3 text-[10px] leading-4 text-slate-500">
                          D&amp;A: {(DEFAULT_CASH_FLOW_ASSUMPTIONS.daRateOfRevenue * 100).toFixed(1)}% of revenue (sector proxy);
                          tax: {(taxRateDecimal * 100).toFixed(1)}%
                          {asset.taxAssumption?.corporateTaxPct !== undefined && asset.taxAssumption.corporateTaxPct !== null
                            ? ' (asset taxAssumption)'
                            : ' (default)'}.
                        </p>
                      </div>
                      <div className="rounded-[14px] border border-white/10 bg-white/[0.02] p-4">
                        <div className="fine-print">Balance sheet</div>
                        <dl className="mt-3 space-y-1.5 text-xs">
                          <div className="flex justify-between">
                            <dt className="text-slate-400">Total assets</dt>
                            <dd className="font-mono text-white">{fmt(bs.totalAssetsKrw)}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-slate-400">Cash</dt>
                            <dd className="font-mono text-white">{fmt(bs.cashKrw)}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-slate-400">Total debt</dt>
                            <dd className="font-mono text-white">{fmt(bs.totalDebtKrw)}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-slate-400">Net debt</dt>
                            <dd className="font-mono text-white">{fmt(bs.netDebtKrw)}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-slate-400">Other liabilities</dt>
                            <dd className="font-mono text-white">{fmt(bs.otherLiabilitiesKrw)}</dd>
                          </div>
                          <div className="flex justify-between border-t border-white/5 pt-1.5">
                            <dt className="text-slate-300">Total equity</dt>
                            <dd className="font-mono font-semibold text-white">
                              {fmt(bs.totalEquityKrw)}
                            </dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-slate-400">Equity ratio</dt>
                            <dd className="font-mono text-white">
                              {bs.equityRatio !== null
                                ? `${(bs.equityRatio * 100).toFixed(1)}%`
                                : '—'}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    </div>

                    {/* Cash flow + FCF + CFADS DSCR */}
                    <div className="mt-5 grid gap-4 lg:grid-cols-2">
                      <div className="rounded-[14px] border border-white/10 bg-white/[0.02] p-4">
                        <div className="fine-print">Cash flow</div>
                        <dl className="mt-3 space-y-1.5 text-xs">
                          <div className="flex justify-between">
                            <dt className="text-slate-400">Operating cash flow</dt>
                            <dd className="font-mono text-white">{fmt(cashFlow.operatingCashFlowKrw)}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-slate-400">Maintenance capex</dt>
                            <dd className="font-mono text-white">
                              ({fmt(cashFlow.maintenanceCapexKrw)})
                            </dd>
                          </div>
                          <div className="flex justify-between border-t border-white/5 pt-1.5">
                            <dt className="text-slate-300">Free cash flow</dt>
                            <dd className="font-mono font-semibold text-white">
                              {fmt(cashFlow.freeCashFlowKrw)}
                            </dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-slate-400">CFADS</dt>
                            <dd className="font-mono text-white">{fmt(cashFlow.cfadsKrw)}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-slate-400">Debt service (interest + principal)</dt>
                            <dd className="font-mono text-white">{fmt(cashFlow.debtServiceKrw)}</dd>
                          </div>
                        </dl>
                      </div>
                      <div className="rounded-[14px] border border-white/10 bg-white/[0.02] p-4">
                        <div className="fine-print">CFADS DSCR (lender-grade)</div>
                        <div className="mt-3 text-3xl font-semibold text-white">
                          {cashFlow.cfadsDscr !== null
                            ? `${cashFlow.cfadsDscr.toFixed(2)}x`
                            : '—'}
                        </div>
                        <p className="mt-2 text-[11px] leading-5 text-slate-400">
                          CFADS ÷ debt service (interest + scheduled principal). Tighter than the
                          headline EBITDA / interest coverage above because it nets out cash tax
                          and maintenance capex. The 2.0x lender minimum is the typical project-
                          finance covenant.
                        </p>
                        <div className="mt-3 grid gap-1.5 text-[10px] text-slate-500">
                          <div>D&amp;A proxy: {(DEFAULT_CASH_FLOW_ASSUMPTIONS.daRateOfRevenue * 100).toFixed(1)}% of revenue</div>
                          <div>Maint capex proxy: {(DEFAULT_CASH_FLOW_ASSUMPTIONS.maintCapexRateOfRevenue * 100).toFixed(1)}% of revenue</div>
                          <div>WC drag: {(DEFAULT_CASH_FLOW_ASSUMPTIONS.wcChangeRate * 100).toFixed(1)}% of revenue</div>
                          <div>Tax rate: {(taxRateDecimal * 100).toFixed(1)}%</div>
                        </div>
                      </div>
                    </div>

                    {/* Covenant alerts banner — surfaced above the headroom card */}
                    {covenantAlerts.length > 0 ? (
                      <div className="mt-5 space-y-2">
                        {covenantAlerts.map((a) => {
                          const tone =
                            a.severity === 'critical'
                              ? 'border-rose-300/40 bg-rose-300/[0.06]'
                              : a.severity === 'warning'
                                ? 'border-amber-300/40 bg-amber-300/[0.05]'
                                : 'border-amber-300/20 bg-amber-300/[0.03]';
                          const dot =
                            a.severity === 'critical'
                              ? 'bg-rose-300'
                              : 'bg-amber-300';
                          const label =
                            a.severity === 'critical'
                              ? 'Critical'
                              : a.severity === 'warning'
                                ? 'Projected breach'
                                : 'Watch';
                          return (
                            <div
                              key={`${a.ratioKey}-${a.severity}`}
                              className={`flex items-start gap-3 rounded-[14px] border ${tone} px-3 py-2 text-sm`}
                            >
                              <span className={`mt-1.5 inline-block h-2 w-2 rounded-full ${dot}`} />
                              <div>
                                <div className="text-[10px] uppercase tracking-wide text-slate-400">
                                  Covenant alert · {label}
                                </div>
                                <p className="mt-1 text-slate-100">{a.message}</p>
                                {a.firstBreachYear && a.firstBreachYear !== 'now' ? (
                                  <p className="mt-1 text-[11px] text-slate-400">
                                    First breach in{' '}
                                    <span className="font-mono text-slate-200">
                                      {a.firstBreachYear}
                                    </span>
                                    ; worst{' '}
                                    <span className="font-mono text-slate-200">
                                      {a.worstValue !== null
                                        ? `${a.worstValue.toFixed(2)}x`
                                        : '—'}
                                    </span>{' '}
                                    in {a.worstYear ?? '—'}.
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}

                    {/* Covenant headroom */}
                    {covenantHeadroom.length > 0 ? (
                      <div className="mt-5 rounded-[14px] border border-white/10 bg-white/[0.02] p-4">
                        <div className="fine-print">Covenant headroom &amp; first-breach year</div>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          {covenantHeadroom.map((c) => {
                            const breachTone =
                              c.firstBreachYear === null
                                ? 'border-emerald-300/30 bg-emerald-300/[0.03]'
                                : 'border-rose-300/30 bg-rose-300/[0.04]';
                            return (
                              <div
                                key={c.ratioKey}
                                className={`rounded-[12px] border ${breachTone} px-3 py-2`}
                              >
                                <div className="flex items-baseline justify-between gap-2">
                                  <div>
                                    <div className="text-sm font-semibold text-white">
                                      {c.ratioLabel}
                                    </div>
                                    <div className="text-[10px] text-slate-500">
                                      Covenant {c.preferred === 'lower' ? '≤' : '≥'}{' '}
                                      {c.benchmark.toFixed(2)}x
                                    </div>
                                  </div>
                                  <div className="text-right font-mono text-xs">
                                    <div className="text-white">
                                      {c.currentValue !== null
                                        ? `${c.currentValue.toFixed(2)}x`
                                        : '—'}
                                    </div>
                                    <div
                                      className={
                                        (c.headroomPct ?? 0) >= 0
                                          ? 'text-emerald-300'
                                          : 'text-rose-300'
                                      }
                                    >
                                      {c.headroomPct !== null
                                        ? `${c.headroomPct >= 0 ? '+' : ''}${c.headroomPct.toFixed(1)}% headroom`
                                        : '—'}
                                    </div>
                                  </div>
                                </div>
                                <div className="mt-2 text-[11px] text-slate-400">
                                  {c.firstBreachYear === null ? (
                                    <>
                                      No breach across the projection horizon. Worst observed:{' '}
                                      <span className="text-white">
                                        {c.worstValue !== null
                                          ? `${c.worstValue.toFixed(2)}x`
                                          : '—'}
                                      </span>{' '}
                                      in {c.worstYear ?? '—'}.
                                    </>
                                  ) : (
                                    <>
                                      First breach in{' '}
                                      <span className="font-semibold text-rose-200">
                                        {c.firstBreachYear}
                                      </span>
                                      ; worst{' '}
                                      <span className="text-white">
                                        {c.worstValue !== null
                                          ? `${c.worstValue.toFixed(2)}x`
                                          : '—'}
                                      </span>{' '}
                                      in {c.worstYear ?? '—'}.
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {/* Liquidity ladder */}
                    {liquidity.rows.length > 0 && cp.role === 'SPONSOR' ? (
                      <div className="mt-5 rounded-[14px] border border-white/10 bg-white/[0.02] p-4">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <div className="fine-print">Liquidity ladder — asset facility vs sponsor liquid resources</div>
                          <div className="text-[10px] text-slate-500">
                            12mo coverage:{' '}
                            <span
                              className={
                                (liquidity.liquidityCoverage ?? 0) >= 1
                                  ? 'text-emerald-300'
                                  : 'text-rose-300'
                              }
                            >
                              {liquidity.liquidityCoverage !== null
                                ? `${liquidity.liquidityCoverage.toFixed(2)}x`
                                : '—'}
                            </span>
                          </div>
                        </div>
                        <div className="mt-3 overflow-x-auto rounded-[12px] border border-white/10">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                                <th className="px-2 py-2 font-semibold">Facility</th>
                                <th className="px-2 py-2 text-right font-semibold">Drawn</th>
                                <th className="px-2 py-2 text-right font-semibold">Rate</th>
                                <th className="px-2 py-2 text-right font-semibold">Term</th>
                                <th className="px-2 py-2 text-right font-semibold">Yearly amort</th>
                                <th className="px-2 py-2 text-right font-semibold">Balloon</th>
                                <th className="px-2 py-2 text-right font-semibold">Balloon yr</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 text-slate-200">
                              {liquidity.rows.map((row) => (
                                <tr key={row.facilityKey}>
                                  <td className="px-2 py-2 text-slate-300">{row.label}</td>
                                  <td className="px-2 py-2 text-right font-mono">{fmt(row.drawnKrw)}</td>
                                  <td className="px-2 py-2 text-right font-mono">
                                    {row.interestRatePct !== null
                                      ? `${row.interestRatePct.toFixed(2)}%`
                                      : '—'}
                                  </td>
                                  <td className="px-2 py-2 text-right font-mono">
                                    {row.termYears !== null ? `${row.termYears.toFixed(0)} yr` : '—'}
                                  </td>
                                  <td className="px-2 py-2 text-right font-mono">
                                    {fmt(row.yearlyAmortizationKrw)}
                                  </td>
                                  <td className="px-2 py-2 text-right font-mono">
                                    {fmt(row.balloonKrw)}
                                  </td>
                                  <td className="px-2 py-2 text-right font-mono text-slate-400">
                                    {row.balloonYear ?? '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="mt-3 grid gap-1.5 text-[10px] text-slate-500">
                          <div>
                            12-month debt service (interest + scheduled principal):{' '}
                            <span className="font-mono text-slate-300">
                              {fmt(liquidity.twelveMonthDebtServiceKrw)}
                            </span>
                          </div>
                          <div>
                            Resources: cash{' '}
                            <span className="font-mono text-slate-300">
                              {fmt(liquidity.cashOnHandKrw)}
                            </span>{' '}
                            + estimated annual operating CF{' '}
                            <span className="font-mono text-slate-300">
                              {fmt(liquidity.estimatedAnnualCashFlowKrw)}
                            </span>
                          </div>
                          {liquidity.peakAnnualPrincipalKrw !== null ? (
                            <div>
                              Peak principal repayment year:{' '}
                              <span className="font-mono text-slate-300">
                                {liquidity.peakYear ?? '—'}
                              </span>{' '}
                              ({fmt(liquidity.peakAnnualPrincipalKrw)})
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    {/* Distribution waterfall */}
                    {waterfall.tiers.length > 0 ? (
                      <div className="mt-5 rounded-[14px] border border-white/10 bg-white/[0.02] p-4">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <div className="fine-print">Distribution waterfall</div>
                          <div className="text-[10px] text-slate-500">
                            Hurdle{' '}
                            {waterfall.hurdleRatePct !== null
                              ? `${waterfall.hurdleRatePct.toFixed(1)}%`
                              : '—'}
                            {' · '}
                            Promote{' '}
                            {waterfall.promoteSharePct !== null
                              ? `${waterfall.promoteSharePct.toFixed(0)}%`
                              : '—'}
                            {' · '}
                            Mgmt fee{' '}
                            {waterfall.managementFeePct !== null
                              ? `${waterfall.managementFeePct.toFixed(2)}%`
                              : '—'}
                          </div>
                        </div>
                        <div className="mt-3 overflow-x-auto rounded-[12px] border border-white/10">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                                <th className="px-2 py-2 font-semibold">Tier</th>
                                <th className="px-2 py-2 text-right font-semibold">IRR threshold</th>
                                <th className="px-2 py-2 text-right font-semibold">LP</th>
                                <th className="px-2 py-2 text-right font-semibold">GP</th>
                                <th className="px-2 py-2 font-semibold">Description</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 text-slate-200">
                              {waterfall.tiers.map((t) => (
                                <tr key={t.tier}>
                                  <td className="px-2 py-2 text-white">{t.tier}</td>
                                  <td className="px-2 py-2 text-right font-mono">
                                    {t.irrThresholdPct !== null
                                      ? `${t.irrThresholdPct.toFixed(1)}%`
                                      : '—'}
                                  </td>
                                  <td className="px-2 py-2 text-right font-mono">
                                    {t.lpSharePct.toFixed(0)}%
                                  </td>
                                  <td className="px-2 py-2 text-right font-mono">
                                    {t.gpSharePct.toFixed(0)}%
                                  </td>
                                  <td className="px-2 py-2 text-[11px] text-slate-400">
                                    {t.description}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {waterfall.lpTakePct !== null && waterfall.gpTakePct !== null ? (
                          <p className="mt-3 text-[11px] leading-5 text-slate-400">
                            At projected equity IRR{' '}
                            <span className="font-mono text-slate-200">
                              {waterfall.projectedEquityIrrPct !== null
                                ? `${waterfall.projectedEquityIrrPct.toFixed(1)}%`
                                : '—'}
                            </span>
                            : illustrative LP take{' '}
                            <span className="font-mono text-emerald-200">
                              ≈ {waterfall.lpTakePct.toFixed(0)}%
                            </span>{' '}
                            / GP take{' '}
                            <span className="font-mono text-amber-200">
                              ≈ {waterfall.gpTakePct.toFixed(0)}%
                            </span>
                            . Catch-up dollar amount and side-letter LP-specific terms not modeled.
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {/* Credit ratios table */}
                    <div className="mt-5">
                      <div className="fine-print">Credit ratios — vs typical PE-sponsor thresholds</div>
                      <div className="mt-3 overflow-x-auto rounded-[14px] border border-white/10">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                              <th className="px-2 py-2 font-semibold">Ratio</th>
                              <th className="px-2 py-2 text-right font-semibold">Value</th>
                              <th className="px-2 py-2 text-right font-semibold">Benchmark</th>
                              <th className="px-2 py-2 font-semibold">Interpretation</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5 text-slate-200">
                            {ratios.map((r) => {
                              const dotTone =
                                r.tone === 'good'
                                  ? 'bg-emerald-300'
                                  : r.tone === 'warn'
                                    ? 'bg-amber-300'
                                    : r.tone === 'risk'
                                      ? 'bg-rose-300'
                                      : 'bg-slate-600';
                              const fmtVal = (v: number | null) => {
                                if (v === null) return '—';
                                if (r.unit === 'x') return `${v.toFixed(2)}x`;
                                if (r.unit === 'pct') return `${v.toFixed(1)}%`;
                                return v.toFixed(2);
                              };
                              return (
                                <tr key={r.key}>
                                  <td className="px-2 py-2">
                                    <div className="flex items-center gap-2">
                                      <span className={`h-1.5 w-1.5 rounded-full ${dotTone}`} />
                                      <div>
                                        <div className="text-white">{r.label}</div>
                                        <div className="text-[10px] text-slate-500">
                                          {r.formula}
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-2 py-2 text-right font-mono text-white">
                                    {fmtVal(r.value)}
                                  </td>
                                  <td className="px-2 py-2 text-right font-mono text-slate-400">
                                    {r.benchmark !== null
                                      ? `${r.preferred === 'higher' ? '≥' : '≤'} ${fmtVal(r.benchmark)}`
                                      : '—'}
                                  </td>
                                  <td className="px-2 py-2 text-[11px] text-slate-300">
                                    {r.interpretation}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Peer benchmark comparison */}
                    <div className="mt-5 rounded-[14px] border border-white/10 bg-white/[0.02] p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="fine-print">
                          Peer benchmarks — {peerComparison.sectorLabel}
                        </div>
                        <div className="text-[9px] text-slate-500">
                          {peerComparison.sourceCaveat}
                        </div>
                      </div>
                      <div className="mt-3 overflow-x-auto rounded-[12px] border border-white/10">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                              <th className="px-2 py-2 font-semibold">Ratio</th>
                              <th className="px-2 py-2 text-right font-semibold">This sponsor</th>
                              <th className="px-2 py-2 text-right font-semibold">P25</th>
                              <th className="px-2 py-2 text-right font-semibold">Median</th>
                              <th className="px-2 py-2 text-right font-semibold">P75</th>
                              <th className="px-2 py-2 text-right font-semibold">Band</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5 text-slate-200">
                            {peerComparison.comparisons.map((c) => {
                              const ratioLabel =
                                ratios.find((r) => r.key === c.ratioKey)?.label ?? c.ratioKey;
                              const ratioUnit =
                                ratios.find((r) => r.key === c.ratioKey)?.unit ?? 'x';
                              const fmtVal = (v: number | null) => {
                                if (v === null) return '—';
                                if (ratioUnit === 'pct') return `${v.toFixed(1)}%`;
                                if (ratioUnit === 'x') return `${v.toFixed(2)}x`;
                                return v.toFixed(2);
                              };
                              const bandTone =
                                c.band === 'top'
                                  ? 'text-emerald-300'
                                  : c.band === 'mid'
                                    ? 'text-amber-300'
                                    : c.band === 'bottom'
                                      ? 'text-rose-300'
                                      : 'text-slate-500';
                              const bandLabel =
                                c.band === 'top'
                                  ? 'Top quartile'
                                  : c.band === 'mid'
                                    ? 'Median band'
                                    : c.band === 'bottom'
                                      ? 'Bottom quartile'
                                      : 'n/a';
                              return (
                                <tr key={c.ratioKey}>
                                  <td className="px-2 py-2 text-slate-300">{ratioLabel}</td>
                                  <td className="px-2 py-2 text-right font-mono text-white">
                                    {fmtVal(c.observedValue)}
                                  </td>
                                  <td className="px-2 py-2 text-right font-mono text-slate-400">
                                    {fmtVal(c.pct25)}
                                  </td>
                                  <td className="px-2 py-2 text-right font-mono text-slate-400">
                                    {fmtVal(c.median)}
                                  </td>
                                  <td className="px-2 py-2 text-right font-mono text-slate-400">
                                    {fmtVal(c.pct75)}
                                  </td>
                                  <td className={`px-2 py-2 text-right text-[10px] font-mono ${bandTone}`}>
                                    {bandLabel}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* 10-year projection — assumptions sourced from bundle data */}
                    {projection.length > 0 ? (
                      <div className="mt-5">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <div className="fine-print">10-year projection</div>
                          <div className="text-[10px] text-slate-500">
                            Revenue growth: {growthInput.value.toFixed(1)}%/yr ·
                            {' '}Debt amort: {amortInput.value.toFixed(1)}%/yr ·
                            {' '}Margin held constant
                          </div>
                        </div>
                        <div className="mt-3 overflow-x-auto rounded-[14px] border border-white/10">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                                <th className="px-2 py-2 font-semibold">Year</th>
                                <th className="px-2 py-2 text-right font-semibold">Revenue</th>
                                <th className="px-2 py-2 text-right font-semibold">EBITDA</th>
                                <th className="px-2 py-2 text-right font-semibold">Margin</th>
                                <th className="px-2 py-2 text-right font-semibold">Total debt</th>
                                <th className="px-2 py-2 text-right font-semibold">Leverage</th>
                                <th className="px-2 py-2 text-right font-semibold">EBITDA cov</th>
                                <th className="px-2 py-2 text-right font-semibold">CFADS DSCR</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 text-slate-200">
                              {projection.map((row, idx) => {
                                const cfadsRow = cfadsProjection[idx] ?? null;
                                return (
                                <tr key={row.year}>
                                  <td className="px-2 py-2 font-mono text-slate-400">{row.year}</td>
                                  <td className="px-2 py-2 text-right font-mono">{fmt(row.revenueKrw)}</td>
                                  <td className="px-2 py-2 text-right font-mono">{fmt(row.ebitdaKrw)}</td>
                                  <td className="px-2 py-2 text-right font-mono text-slate-400">
                                    {row.ebitdaMarginPct !== null
                                      ? `${row.ebitdaMarginPct.toFixed(1)}%`
                                      : '—'}
                                  </td>
                                  <td className="px-2 py-2 text-right font-mono">{fmt(row.totalDebtKrw)}</td>
                                  <td className="px-2 py-2 text-right font-mono">
                                    {row.leverage !== null ? `${row.leverage.toFixed(2)}x` : '—'}
                                  </td>
                                  <td className="px-2 py-2 text-right font-mono">
                                    {row.interestCoverage !== null
                                      ? `${row.interestCoverage.toFixed(2)}x`
                                      : '—'}
                                  </td>
                                  <td className="px-2 py-2 text-right font-mono">
                                    {cfadsRow?.cfadsDscr !== null && cfadsRow?.cfadsDscr !== undefined
                                      ? (
                                        <span className={cfadsRow.cfadsDscr >= 2.0 ? 'text-emerald-300' : 'text-rose-300'}>
                                          {cfadsRow.cfadsDscr.toFixed(2)}x
                                        </span>
                                      )
                                      : '—'}
                                  </td>
                                </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <ul className="mt-3 space-y-1 text-[10px] text-slate-500">
                          <li>
                            <span className="text-slate-400">Revenue growth source:</span>{' '}
                            {growthInput.provenance}
                          </li>
                          <li>
                            <span className="text-slate-400">Debt amortization source:</span>{' '}
                            {amortInput.provenance}
                          </li>
                          <li>
                            <span className="text-slate-400">Baseline rate:</span>{' '}
                            {rateInput.provenance}
                          </li>
                        </ul>
                      </div>
                    ) : null}

                    {/* 2D Sensitivity matrix — interest coverage at every shock combo */}
                    {sensitivityMatrix ? (
                      <div className="mt-5">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <div className="fine-print">
                            Sensitivity — interest coverage at every shock combo
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Covenant floor: leverage ≤ 4.0x · coverage ≥ 2.0x
                          </div>
                        </div>
                        <div className="mt-3 overflow-x-auto rounded-[14px] border border-white/10">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                                <th className="px-2 py-2 font-semibold">EBITDA shock ↓ / Rate shock →</th>
                                {sensitivityMatrix.rateShocks.map((rs) => (
                                  <th key={rs} className="px-2 py-2 text-right font-semibold">
                                    {rs >= 0 ? '+' : ''}{rs} bps
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 text-slate-200">
                              {sensitivityMatrix.cells.map((row, ri) => (
                                <tr key={sensitivityMatrix.ebitdaShocks[ri]}>
                                  <td className="px-2 py-2 text-slate-400">
                                    {sensitivityMatrix.ebitdaShocks[ri]! >= 0 ? '+' : ''}
                                    {sensitivityMatrix.ebitdaShocks[ri]}%
                                  </td>
                                  {row.map((cell, ci) => {
                                    const tone =
                                      cell.passesCovenant === true
                                        ? 'bg-emerald-300/[0.06] text-emerald-200'
                                        : cell.passesCovenant === false
                                          ? 'bg-rose-300/[0.06] text-rose-200'
                                          : '';
                                    return (
                                      <td
                                        key={ci}
                                        className={`px-2 py-2 text-right font-mono ${tone}`}
                                      >
                                        {cell.interestCoverage !== null
                                          ? `${cell.interestCoverage.toFixed(2)}x`
                                          : '—'}
                                        <div className="text-[9px] text-slate-500">
                                          lev{' '}
                                          {cell.leverage !== null
                                            ? `${cell.leverage.toFixed(2)}x`
                                            : '—'}
                                        </div>
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="mt-3 text-[10px] leading-4 text-slate-500">
                          Each cell shows interest coverage and leverage at the shock combo.
                          Green = covenant pass; rose = covenant breach. Rate shock conservatively
                          assumes 100% of the debt balance reprices on a parallel curve shift —
                          actual exposure depends on the fixed/floating split per facility, which
                          is not captured in the current schema. Treat the grid as the worst-case
                          mark; partial fixed-rate hedging would mute the rate-axis shocks.
                        </p>
                      </div>
                    ) : null}

                    {latestCa?.summary ? (
                      <p className="mt-5 rounded-[12px] border border-white/5 bg-white/[0.02] px-3 py-2 text-xs leading-5 text-slate-300">
                        <span className="text-[10px] uppercase tracking-wide text-slate-500">
                          Credit assessment ·{' '}
                        </span>
                        {latestCa.summary}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Card>
        </section>
      ) : null}

      {asset.documents && asset.documents.length > 0 ? (
        <section id="im-documents" className="app-shell py-4">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="eyebrow">Document evidence</div>
              <Badge>
                {asset.documents.length} doc{asset.documents.length === 1 ? '' : 's'}
              </Badge>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Source documents on file. Each version anchors specific evidence — lease schedule, power study, IC model, lender term sheet — and links through to the original filing.
            </p>
            <div className="mt-5 overflow-x-auto rounded-[14px] border border-white/10">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2 font-semibold">Title</th>
                    <th className="px-2 py-2 font-semibold">Type</th>
                    <th className="px-2 py-2 text-right font-semibold">Version</th>
                    <th className="px-2 py-2 text-right font-semibold">Updated</th>
                    <th className="px-2 py-2 text-right font-semibold">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-200">
                  {asset.documents.slice(0, 12).map((doc) => (
                    <tr key={doc.id}>
                      <td className="px-2 py-2">
                        <div className="text-white">{doc.title}</div>
                        {doc.aiSummary ? (
                          <div className="text-[10px] leading-4 text-slate-500">
                            {doc.aiSummary.length > 120
                              ? `${doc.aiSummary.slice(0, 120)}…`
                              : doc.aiSummary}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 text-slate-300">
                        {doc.documentType.replace(/_/g, ' ').toLowerCase()}
                      </td>
                      <td className="px-2 py-2 text-right font-mono">v{doc.currentVersion}</td>
                      <td className="px-2 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className="font-mono text-slate-400">
                            {formatDate(doc.updatedAt)}
                          </span>
                          <FreshnessDot observedAt={doc.updatedAt} />
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right text-[10px]">
                        {doc.sourceLink ? (
                          <a
                            href={doc.sourceLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-300 hover:text-white hover:underline"
                          >
                            link ↗
                          </a>
                        ) : (
                          <span className="text-slate-500">stored</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      ) : null}

      {asset.committeePackets && asset.committeePackets.length > 0 ? (
        <section id="im-ic-packet" className="app-shell py-4">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="eyebrow">Investment committee packets</div>
              <Badge>
                {asset.committeePackets.length} packet
                {asset.committeePackets.length === 1 ? '' : 's'}
              </Badge>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Investment committee packets prepared on the asset. Decision summary records the outcome (CONDITIONAL / APPROVED / DEFERRED / DECLINED); follow-up captures the resulting action items.
            </p>
            <ul className="mt-5 space-y-3">
              {asset.committeePackets.map((p) => {
                const statusTone =
                  p.status === 'APPROVED'
                    ? 'border-emerald-300/30 bg-emerald-300/[0.04] text-emerald-200'
                    : p.status === 'DECLINED'
                      ? 'border-rose-300/30 bg-rose-300/[0.04] text-rose-200'
                      : 'border-amber-300/30 bg-amber-300/[0.04] text-amber-200';
                return (
                  <li
                    key={p.id}
                    className="rounded-[16px] border border-white/10 bg-white/[0.02] p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white">{p.title}</span>
                          <FreshnessDot observedAt={p.scheduledFor ?? p.updatedAt} />
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          <span className="font-mono">{p.packetCode}</span>
                          {p.scheduledFor ? ` · scheduled ${formatDate(p.scheduledFor)}` : ''}
                          {p.preparedByLabel ? ` · prepared by ${p.preparedByLabel}` : ''}
                        </div>
                      </div>
                      <span
                        className={`rounded-[10px] border px-2 py-1 text-[10px] font-mono uppercase tracking-wide ${statusTone}`}
                      >
                        {p.status}
                      </span>
                    </div>
                    {p.decisionSummary ? (
                      <p className="mt-3 text-sm leading-6 text-slate-200">
                        <span className="text-[10px] uppercase tracking-wide text-slate-500">
                          Decision · </span>
                        {p.decisionSummary}
                      </p>
                    ) : null}
                    {p.followUpSummary ? (
                      <p className="mt-2 text-sm leading-6 text-slate-300">
                        <span className="text-[10px] uppercase tracking-wide text-slate-500">
                          Follow-up · </span>
                        {p.followUpSummary}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      ) : null}

      {asset.sideLetters && asset.sideLetters.length > 0 ? (
        <section id="im-side-letters" className="app-shell py-4">
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="eyebrow">Side-letter terms</div>
                <p className="mt-2 max-w-3xl text-sm text-slate-400">
                  LP-specific carve-outs from the LPA. Most-favored-nation entries propagate to
                  every LP at or below the threshold; co-investment, fee, ESG and reporting
                  terms apply per signing LP. The IM surfaces the register so the committee can
                  confirm fund-economics consistency before close.
                </p>
              </div>
              <Badge>
                {asset.sideLetters.length} term
                {asset.sideLetters.length === 1 ? '' : 's'}
              </Badge>
            </div>
            <div className="mt-5 overflow-x-auto rounded-[14px] border border-white/10">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2 font-semibold">LP</th>
                    <th className="px-2 py-2 font-semibold">Category</th>
                    <th className="px-2 py-2 font-semibold">Term</th>
                    <th className="px-2 py-2 text-right font-semibold">Effective</th>
                    <th className="px-2 py-2 text-right font-semibold">MFN</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-200">
                  {asset.sideLetters.map((sl) => (
                    <tr key={sl.id}>
                      <td className="px-2 py-2">
                        <div className="text-white">{sl.lpName}</div>
                        {sl.lpEntityType ? (
                          <div className="text-[9px] text-slate-500">
                            {sl.lpEntityType.replace(/_/g, ' ').toLowerCase()}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-2 py-2">
                        <span className="rounded-[6px] border border-white/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-slate-300">
                          {sl.termCategory.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-[11px] text-slate-300">
                        {sl.termSummary}
                        {sl.notes ? (
                          <div className="mt-0.5 text-[9px] text-slate-500">{sl.notes}</div>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-slate-400">
                        {sl.effectiveFrom ? formatDate(sl.effectiveFrom) : '—'}
                      </td>
                      <td className="px-2 py-2 text-right text-[10px]">
                        {sl.mfnEligible ? (
                          <span className="font-mono text-emerald-300">MFN-eligible</span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      ) : null}

      {asset.featureSnapshots && asset.featureSnapshots.length > 0 ? (
        <section id="im-features" className="app-shell py-4">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="eyebrow">Feature snapshots</div>
              <Badge>{asset.featureSnapshots.length}</Badge>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Underwriting input bundles by namespace (site, power, revenue, legal, permit, market, readiness, satellite). Each snapshot captures the inputs read at run time, supporting exact reproducibility on re-run.
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              {asset.featureSnapshots.map((s) => (
                <div
                  key={s.id}
                  className="rounded-[16px] border border-white/10 bg-white/[0.02] p-3"
                >
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">
                    {s.featureNamespace}
                  </div>
                  <div className="mt-2 font-mono text-xs text-slate-300">
                    {s.values?.length ?? 0} value{(s.values?.length ?? 0) === 1 ? '' : 's'}
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500">
                    {formatDate(s.snapshotDate)}
                  </div>
                  {s.sourceVersion ? (
                    <div className="mt-1 truncate text-[10px] text-slate-600" title={s.sourceVersion}>
                      v{s.sourceVersion}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </Card>
        </section>
      ) : null}

      {asset.tokenization ? (
        <section id="im-tokenization" className="app-shell py-4">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="eyebrow">Tokenization &amp; on-chain</div>
              <Badge tone={asset.tokenization.paused ? 'warn' : 'good'}>
                {asset.tokenization.paused ? 'PAUSED' : 'ACTIVE'}
              </Badge>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              On-chain registration. The identity registry gates KYC; the compliance contract enforces transfer rules; lockup, max-holders, and country-restriction modules deploy where configured.
            </p>
            <dl className="mt-5 grid gap-3 text-sm md:grid-cols-2">
              <Row label="Chain ID">{asset.tokenization.chainId}</Row>
              <Row label="Registry asset ID">
                <span className="break-all">{asset.tokenization.registryAssetId}</span>
              </Row>
              <Row label="Token address">
                <span className="break-all font-mono text-xs">{asset.tokenization.tokenAddress}</span>
              </Row>
              <Row label="Identity registry">
                <span className="break-all font-mono text-xs">
                  {asset.tokenization.identityRegistryAddress}
                </span>
              </Row>
              <Row label="Compliance">
                <span className="break-all font-mono text-xs">
                  {asset.tokenization.complianceAddress}
                </span>
              </Row>
              <Row label="Deployment block">
                <span className="font-mono">{asset.tokenization.deploymentBlock}</span>
              </Row>
            </dl>
          </Card>
        </section>
      ) : null}

      {auditTrail.events.length > 0 ? (
        <section id="im-audit" className="app-shell py-4">
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="eyebrow">Audit trail</div>
                <p className="mt-2 max-w-3xl text-sm text-slate-400">
                  Recent system events on the asset, valuation run, and counterparties.
                  Establishes who touched the underwriting most recently — required for
                  committee review of data lineage and for SOC-2 / fund-administrator review.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge>{auditTrail.totalCount} events total</Badge>
                {auditTrail.failureCount > 0 ? (
                  <Badge tone="warn">{auditTrail.failureCount} non-success</Badge>
                ) : null}
              </div>
            </div>
            <div className="mt-3 text-[11px] text-slate-500">
              Last event:{' '}
              {auditTrail.lastEventAt ? formatDate(auditTrail.lastEventAt) : '—'} ·
              Distinct actors:{' '}
              <span className="font-mono text-slate-300">
                {auditTrail.uniqueActors.join(', ')}
              </span>
            </div>
            <div className="mt-4 overflow-x-auto rounded-[14px] border border-white/10">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2 font-semibold">When</th>
                    <th className="px-2 py-2 font-semibold">Actor</th>
                    <th className="px-2 py-2 font-semibold">Action</th>
                    <th className="px-2 py-2 font-semibold">Entity</th>
                    <th className="px-2 py-2 text-right font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-200">
                  {auditTrail.events.map((e) => {
                    const ok = /SUCCESS|OK/i.test(e.statusLabel);
                    return (
                      <tr key={e.id}>
                        <td className="px-2 py-2 font-mono text-[10px] text-slate-400">
                          {formatDate(e.createdAt)}
                        </td>
                        <td className="px-2 py-2">
                          <div className="text-white">{e.actorIdentifier}</div>
                          <div className="text-[10px] text-slate-500">{e.actorRole}</div>
                        </td>
                        <td className="px-2 py-2 font-mono text-[11px] text-slate-300">
                          {e.action}
                        </td>
                        <td className="px-2 py-2 text-[11px] text-slate-400">
                          {e.entityType}
                        </td>
                        <td
                          className={`px-2 py-2 text-right font-mono text-[10px] ${
                            ok ? 'text-emerald-300' : 'text-rose-300'
                          }`}
                        >
                          {e.statusLabel}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      ) : null}

      <section id="im-memo" className="app-shell space-y-6 py-6">
        <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <Card>
            <div className="eyebrow">Investment Memo (IM)</div>
            <div className="mt-5 space-y-5">
              <p className="text-base leading-8 text-slate-200">{latestRun.underwritingMemo}</p>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="fine-print">Asset Thesis</div>
                  <p className="mt-3 text-sm leading-7 text-slate-300">
                    Asset quality, market positioning, and scenario resilience support the current
                    underwriting case.
                  </p>
                </div>
                <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="fine-print">Return Profile</div>
                  <p className="mt-3 text-sm leading-7 text-slate-300">
                    The base scenario anchors committee discussion, while the bull and bear cases
                    frame upside and downside.
                  </p>
                </div>
                <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="fine-print">Diligence Posture</div>
                  <p className="mt-3 text-sm leading-7 text-slate-300">
                    Remaining open items are tracked directly below in the risk list and diligence
                    checklist.
                  </p>
                </div>
              </div>
            </div>
          </Card>

          <div className="grid gap-6">
            <Card>
              <div className="eyebrow">Committee Snapshot</div>
              <div className="mt-4 grid gap-4 text-sm text-slate-300">
                <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="fine-print">Updated</div>
                  <div className="mt-2 text-lg font-semibold text-white">
                    {formatDate(latestRun.createdAt)}
                  </div>
                </div>
                <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="fine-print">Latest Base Case</div>
                  <div className="mt-2 text-lg font-semibold text-white">
                    {formatCurrencyFromKrwAtRate(
                      latestRun.baseCaseValueKrw,
                      displayCurrency,
                      fxRateToKrw
                    )}
                  </div>
                </div>
                <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="fine-print">Confidence</div>
                  <div className="mt-2 text-lg font-semibold text-white">
                    {formatNumber(latestRun.confidenceScore, 1)}
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <div className="eyebrow">Key Risks</div>
              <ul className="mt-4 space-y-3 text-sm text-slate-300">
                {latestRun.keyRisks.map((risk) => (
                  <li
                    key={risk}
                    className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3"
                  >
                    {risk}
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <div className="eyebrow">DD Checklist</div>
              <ul className="mt-4 space-y-3 text-sm text-slate-300">
                {latestRun.ddChecklist.map((item) => (
                  <li
                    key={item}
                    className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>

        <ValuationBreakdown
          assumptions={latestRun.assumptions as Record<string, number | string | null>}
          provenance={provenance}
          displayCurrency={displayCurrency}
          fxRateToKrw={fxRateToKrw}
        />

        <ConfidenceBreakdown
          engineVersion={latestRun.engineVersion}
          confidenceScore={latestRun.confidenceScore}
          address={asset.address}
          siteProfile={asset.siteProfile}
          buildingSnapshot={asset.buildingSnapshot}
          permitSnapshot={asset.permitSnapshot}
          energySnapshot={asset.energySnapshot}
          marketSnapshot={asset.marketSnapshot}
          provenance={provenance}
        />

        <ValuationSignals
          confidenceScore={latestRun.confidenceScore}
          assumptions={latestRun.assumptions as Record<string, number | string | null>}
          provenance={provenance}
        />

        <div className="print-break grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <Card className="space-y-4">
            <div className="eyebrow">Scenario Table</div>
            {scenarios.map((scenario) => (
              <div
                key={scenario.id}
                className="rounded-[22px] border border-white/10 bg-slate-950/45 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-white">{scenario.name}</h3>
                  <span className="text-sm text-slate-400">
                    {formatCurrencyFromKrwAtRate(
                      scenario.valuationKrw,
                      displayCurrency,
                      fxRateToKrw
                    )}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-3">
                  <div>
                    <div className="text-slate-500">Implied Yield</div>
                    <div>{formatPercent(scenario.impliedYieldPct)}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Exit Cap Rate</div>
                    <div>{formatPercent(scenario.exitCapRatePct)}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">DSCR</div>
                    <div>{formatNumber(scenario.debtServiceCoverage, 2)}x</div>
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-400">{scenario.notes}</p>
              </div>
            ))}
          </Card>

          <div className="grid gap-6">
            <ValuationProvenance entries={provenance} />

            <Card className="hero-mesh print-hidden">
              <div className="eyebrow">Next Step</div>
              <h2 className="mt-3 text-2xl font-semibold text-white">
                See how this IM is generated from a live workflow.
              </h2>
              <p className="mt-4 text-sm leading-7 text-slate-300">
                Open the admin console to create a new asset, run the analysis, and produce a new
                committee-ready memo from live data and assumptions.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/admin/assets/new">
                  <Button>Start New Analysis</Button>
                </Link>
                <Link href="/admin">
                  <Button variant="secondary">Open Console</Button>
                </Link>
              </div>
            </Card>
          </div>
        </div>
      </section>

      <section className="app-shell space-y-6 py-10">
        <div className="max-w-3xl">
          <div className="eyebrow">용어 해설</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white md:text-4xl">
            이 메모에서 쓰는 평가 용어.
          </h2>
          <p className="mt-3 text-sm leading-7 text-slate-400">
            샘플 IM은 영문 IC 양식을 그대로 보여줍니다. 표기된 평가 · 시나리오 · 신뢰도 용어는 아래
            정의를 참고해 주세요.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {glossary.map((entry) => (
            <Card key={entry.term} className="min-h-[170px]">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="text-lg font-semibold text-white">{entry.term}</h3>
                <span className="text-sm text-slate-400">{entry.ko}</span>
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-400">{entry.body}</p>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[14px] border border-white/5 bg-white/[0.02] px-3 py-2 text-sm">
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="font-mono text-sm text-white">{children}</dd>
    </div>
  );
}

function ProvenancePill({
  entries
}: {
  entries: Array<{ field: string; sourceSystem: string; mode: string; freshnessLabel: string }>;
}) {
  if (!entries || entries.length === 0) return null;
  const text = summarizeProvenance(entries);
  if (!text) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[12px] border border-white/5 bg-white/[0.015] px-3 py-1.5 text-[11px] text-slate-400">
      <span className="uppercase tracking-wide text-slate-500">Source</span>
      <span className="font-mono text-slate-300">{text}</span>
    </div>
  );
}

function FreshnessDot({
  observedAt,
  label
}: {
  observedAt: Date | string | null | undefined;
  label?: string;
}) {
  const f = classifyFreshness(observedAt);
  if (!f.band) return null;
  const dotTone =
    f.band === 'fresh'
      ? 'bg-emerald-300'
      : f.band === 'recent'
        ? 'bg-amber-300'
        : 'bg-rose-300';
  const textTone =
    f.band === 'fresh'
      ? 'text-emerald-300'
      : f.band === 'recent'
        ? 'text-amber-300'
        : 'text-rose-300';
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px]"
      title={`Observed ${f.label}`}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotTone}`} />
      <span className={textTone}>{label ?? f.label}</span>
    </span>
  );
}
