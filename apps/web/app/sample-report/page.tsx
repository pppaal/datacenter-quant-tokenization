import { notFound } from 'next/navigation';
import { AssetClass } from '@prisma/client';
import { resolveDisplayCurrency } from '@/lib/finance/currency';
import { ImPrintMode } from '@/components/marketing/im-print-mode';
import { ImExportButtons } from '@/components/marketing/im-export-buttons';
import { imDeckFromReport } from '@/lib/services/exports/im-deck-from-report';
import {
  capRateGapToMarket,
  hedonicResidual,
  summarizeScenarioSkew
} from '@/lib/services/valuation/insights';
import { ImToc } from '@/components/marketing/im-toc';
import { SiteNav } from '@/components/marketing/site-nav';
import { prisma } from '@/lib/db/prisma';
import { getAssetBySlug } from '@/lib/services/assets';
import { getSampleReport } from '@/lib/services/dashboard';
import { getFxRateMap } from '@/lib/services/fx';
import { getValuationRecommendation } from '@/lib/services/valuation/recommendation';
import {
  computeCapitalStructure,
  computeLeaseRollSummary,
  computeReturnsSnapshot,
  pickMacroBackdrop,
  rollupTenantCredit
} from '@/lib/services/im/sections';
import { getSponsorTrackByName } from '@/lib/services/im/sponsor';
import { readCapexBreakdown, readUnderwritingAssumptions } from '@/lib/services/im/assumptions';
import { buildConfidenceBreakdown } from '@/lib/services/im/confidence';
import { buildAuditTrail } from '@/lib/services/im/audit-trail';
import { buildCapitalCallSchedule } from '@/lib/services/im/capital-calls';
import { buildCounterpartyRollup } from '@/lib/services/im/counterparty-rollup';
import { buildEmissionsBreakdown, buildEsgSummary } from '@/lib/services/im/esg';
import { buildInsuranceSummary } from '@/lib/services/im/insurance';
import { buildFxExposure } from '@/lib/services/im/fx-exposure';
import { buildTaxWalk } from '@/lib/services/im/tax-walk';
import { readMacroGuidance } from '@/lib/services/im/macro-guidance';
import { buildScenarioDiff } from '@/lib/services/im/scenario-diff';
import { pickMatrixRuns } from '@/lib/services/im/sensitivity';
import { pickProvenanceForCard } from '@/lib/services/im/provenance-map';
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
import { pickBaseScenario, resolveBullBearValues } from '@/lib/services/valuation/scenario-utils';
import { AuditSection } from './_sections/audit';
import { CapexSection } from './_sections/capex';
import { CapitalCallsSection } from './_sections/capital-calls';
import { CompsSection } from './_sections/comps';
import { ConfidenceSection } from './_sections/confidence';
import { CounterpartySection } from './_sections/counterparty';
import { CoverSection } from './_sections/cover';
import { DocumentsSection } from './_sections/documents';
import { EsgSection } from './_sections/esg';
import { FeaturesSection } from './_sections/features';
import { FooterCtaSection } from './_sections/footer-cta';
import { FxSection } from './_sections/fx';
import { HazardSection } from './_sections/hazard';
import { HeadlineScenarioStrip } from './_sections/headline-scenario-strip';
import { IcPacketSection } from './_sections/ic-packet';
import { InsuranceSection } from './_sections/insurance';
import { MacroBackdropSection } from './_sections/macro-backdrop';
import { MacroGuidanceSection } from './_sections/macro-guidance';
import { MemoSection } from './_sections/memo';
import { PnlSection } from './_sections/pnl';
import { RealizedSection } from './_sections/realized';
import { ResearchSection } from './_sections/research';
import { ReturnsSection } from './_sections/returns';
import { RisksSection } from './_sections/risks';
import { ScenarioSection } from './_sections/scenario';
import { SensitivitySection } from './_sections/sensitivity';
import { SideLettersSection } from './_sections/side-letters';
import { SiteMediaSection } from './_sections/site-media';
import { SourcesUsesSection } from './_sections/sources-uses';
import { SponsorSection } from './_sections/sponsor';
import { SupplyDemandSection } from './_sections/supply-demand';
import { TaxWalkSection } from './_sections/tax-walk';
import { TitleSection } from './_sections/title';
import { TokenizationSection } from './_sections/tokenization';
import { UnderwritingSection } from './_sections/underwriting';
import type { ProvenanceEntry, SampleReportData } from './_sections/types';

export const dynamic = 'force-dynamic';

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
  const compareLeaseRoll = compareAsset ? computeLeaseRollSummary(compareAsset.leases ?? []) : null;

  const scenarios = latestRun.scenarios ?? [];
  const provenance = Array.isArray(latestRun.provenance)
    ? (latestRun.provenance as ProvenanceEntry[])
    : [];
  // Resolve by magnitude / name, never by array position: a reordered or
  // 1–2-scenario run otherwise swaps the bull/bear labels or shows base==index-1.
  const { bull: bullValue, bear: bearValue } = resolveBullBearValues(scenarios);
  const baseScenario = pickBaseScenario(scenarios) ?? null;
  const recommendation = getValuationRecommendation(latestRun.confidenceScore);
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
  const scenarioSkew = summarizeScenarioSkew({
    upsidePct: returnsSnapshot.upsideToBullPct,
    downsidePct: returnsSnapshot.downsideToBearPct
  });
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
            asset.assetClass === 'DATA_CENTER' ? 0.45 : asset.assetClass === 'OFFICE' ? 0.6 : 0.5,
          submarketSpreadPct: submarketSpread.spreadPct,
          growthExpectationPct:
            (macroByKey.rent_growth_pct ?? 0) +
            (macroByKey.inflation_pct ? macroByKey.inflation_pct * 0.5 : 0),
          transactionVolumeIndex: macroByKey.transaction_volume_index ?? 100,
          vintageYear: asset.buildingRecords?.[0]?.completionDate
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
        ? (proForma.summary.initialDebtFundingKrw ?? 0) + (proForma.summary.initialEquityKrw ?? 0)
        : (asset.capexAssumptionKrw ?? 0);
  const taxWalk = buildTaxWalk(asset.taxAssumption ?? null, {
    purchasePriceKrw: investmentBasisKrw,
    cumulativeNoiKrw: proForma ? proForma.years.reduce((sum, y) => sum + y.noiKrw, 0) : 0,
    exitValueKrw: proForma?.summary.grossExitValueKrw ?? 0,
    holdYears: proForma?.years.length ?? 10,
    basisSource: (asset.purchasePriceKrw ?? 0) > 0 ? 'purchase_price' : 'capex_total'
  });
  // Use the SAME live/env FX rate the rest of the page translates with, so the
  // FX-exposure card's spot + USD value can't diverge from the cover's KRW→base
  // figures (previously this fell back to a hardcoded 1380 inside buildFxExposure).
  const fxLpBaseCurrency = displayCurrency === 'KRW' ? 'USD' : displayCurrency;
  const fxLpBaseRateToKrw = (await getFxRateMap([fxLpBaseCurrency]))[fxLpBaseCurrency];
  const fxExposure = buildFxExposure(latestRun.baseCaseValueKrw, {
    assetCurrency: 'KRW',
    lpBaseCurrency: fxLpBaseCurrency,
    spotRate: fxLpBaseRateToKrw
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
  const hedonicTargetSize = asset.grossFloorAreaSqm ?? asset.rentableAreaSqm ?? null;
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

  // Valuation insights: cap-rate build-up vs the deal's going-in cap, and the
  // subject's price/sqm vs the size/vintage-adjusted hedonic fit.
  const capRateGap =
    capRateDecomp && returnsSnapshot.goingInYieldPct != null
      ? capRateGapToMarket(capRateDecomp.capRatePct, returnsSnapshot.goingInYieldPct)
      : null;
  const hedonicInsight =
    hedonicFit && hedonicTargetSize && hedonicTargetSize > 0 && investmentBasisKrw > 0
      ? hedonicResidual(
          {
            fittedLogPricePerSqm: hedonicFit.fittedLogPricePerSqm,
            residualStdErr: hedonicFit.residualStdErr,
            adjustedRSquared: hedonicFit.adjustedRSquared
          },
          investmentBasisKrw / hedonicTargetSize
        )
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
  const pipelineToShow = asset.pipelineProjects?.length ? asset.pipelineProjects : marketPipeline;

  // DC supply-demand 5y forecast: probability-weighted pipeline +
  // baseline demand growth (8% AI training default, override via
  // macro rent_growth_pct when present). Only DC assets render.
  const supplyDemandUnit: 'MW' | 'sqm' = asset.assetClass === 'DATA_CENTER' ? 'MW' : 'sqm';
  const startingSupply =
    supplyDemandUnit === 'MW' ? (asset.powerCapacityMw ?? 0) : (asset.grossFloorAreaSqm ?? 0);
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

  const data: SampleReportData = {
    asset,
    latestRun,
    compareAsset,
    compareLatestRun,
    compareProForma,
    compareReturnsSnapshot,
    compareLeaseRoll,
    scenarios,
    provenance,
    bullValue,
    bearValue,
    baseScenario,
    recommendation,
    isDataCenter,
    displayCurrency,
    fxRateToKrw,
    macroBackdrop,
    leaseRoll,
    capStack,
    returnsSnapshot,
    tenantCredit,
    macroByKey,
    submarketSpread,
    capRateDecomp,
    proForma,
    underwriting,
    capexBreakdown,
    sponsorTrack,
    provenanceByCard,
    scenarioDiff,
    sensitivityGrids,
    confidenceBreakdown,
    macroGuidance,
    sponsorCps,
    tenantCps,
    sponsorRollup,
    tenantRollup,
    esgSummary,
    investmentBasisKrw,
    taxWalk,
    fxExposure,
    emissionsBreakdown,
    insuranceSummary,
    auditTrail,
    initialEquityKrw,
    capitalCalls,
    marketTxComps,
    marketRentComps,
    txCompsToShow,
    rentCompsToShow,
    hedonicCompInputs,
    hedonicTargetSize,
    hedonicFit,
    marketPipeline,
    pipelineToShow,
    supplyDemandUnit,
    startingSupply,
    demandGrowthPct,
    supplyDemandModel
  };

  return (
    <main className="pb-24">
      <ImPrintMode footerLabel={`${asset.name} · Investment Memo`} />
      <div className="print-hidden" data-im-print-hidden>
        <SiteNav />
      </div>

      <ImToc items={visibleTocItems} />

      <CoverSection data={data} />

      <section className="app-shell pt-4 print:hidden">
        <div className="flex justify-end">
          <ImExportButtons
            deck={imDeckFromReport({
              assetName: asset.name,
              assetType: String(asset.assetClass),
              market: asset.market,
              recommendation,
              confidenceScore: latestRun.confidenceScore ?? null,
              baseValueKrw: returnsSnapshot.baseValueKrw,
              goingInYieldPct: returnsSnapshot.goingInYieldPct,
              exitCapPct: returnsSnapshot.exitCapPct,
              minDscr: returnsSnapshot.minDscr,
              upsideToBullPct: returnsSnapshot.upsideToBullPct,
              downsideToBearPct: returnsSnapshot.downsideToBearPct
            })}
          />
        </div>
      </section>

      {scenarioSkew.headline || capRateGap || (hedonicInsight && hedonicInsight.zScore !== null) ? (
        <section className="app-shell pt-2">
          <div className="space-y-1 text-sm text-[hsl(var(--foreground-muted))]">
            {scenarioSkew.headline ? (
              <p>
                <span className="font-semibold text-[hsl(var(--foreground))]">
                  시나리오 비대칭 ·{' '}
                </span>
                {scenarioSkew.headline}
              </p>
            ) : null}
            {capRateGap ? (
              <p>
                <span className="font-semibold text-[hsl(var(--foreground))]">캡레이트 · </span>
                {capRateGap.headline}
              </p>
            ) : null}
            {hedonicInsight && hedonicInsight.zScore !== null ? (
              <p>
                <span className="font-semibold text-[hsl(var(--foreground))]">헤도닉 · </span>
                {hedonicInsight.headline}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      <HeadlineScenarioStrip data={data} />

      {asset.media && asset.media.length > 0 ? <SiteMediaSection data={data} /> : null}

      {macroBackdrop.length > 0 ? <MacroBackdropSection data={data} /> : null}

      {macroGuidance ? <MacroGuidanceSection data={data} /> : null}

      <ReturnsSection data={data} />

      <UnderwritingSection data={data} />

      {asset.siteProfile ? <HazardSection data={data} /> : null}

      {esgSummary ? <EsgSection data={data} /> : null}

      {insuranceSummary ? <InsuranceSection data={data} /> : null}

      {taxWalk.rows.length > 0 ? <TaxWalkSection data={data} /> : null}

      {fxExposure ? <FxSection data={data} /> : null}

      {(asset.ownershipRecords && asset.ownershipRecords.length > 0) ||
      (asset.parcels && asset.parcels.length > 0) ||
      (asset.buildingRecords && asset.buildingRecords.length > 0) ||
      (asset.planningConstraints && asset.planningConstraints.length > 0) ||
      (asset.encumbranceRecords && asset.encumbranceRecords.length > 0) ? (
        <TitleSection data={data} />
      ) : null}

      {proForma ? <SourcesUsesSection data={data} /> : null}

      {capitalCalls && capitalCalls.rows.length > 0 ? <CapitalCallsSection data={data} /> : null}

      {asset.capexLineItems && asset.capexLineItems.length > 0 ? (
        <CapexSection data={data} />
      ) : null}

      {proForma && proForma.years.length > 0 ? <PnlSection data={data} /> : null}

      {scenarioDiff.length > 0 ? <ScenarioSection data={data} /> : null}

      {txCompsToShow.length > 0 || rentCompsToShow.length > 0 ? <CompsSection data={data} /> : null}

      {(asset.researchSnapshots && asset.researchSnapshots.length > 0) ||
      (asset.coverageTasks && asset.coverageTasks.length > 0) ||
      (asset.aiInsights && asset.aiInsights.length > 0) ? (
        <ResearchSection data={data} />
      ) : null}

      {(asset.realizedOutcomes && asset.realizedOutcomes.length > 0) ||
      pipelineToShow.length > 0 ? (
        <RealizedSection data={data} />
      ) : null}

      {supplyDemandModel ? <SupplyDemandSection data={data} /> : null}

      {sensitivityGrids.length > 0 ? <SensitivitySection data={data} /> : null}

      <ConfidenceSection data={data} />

      {sponsorTrack ? <SponsorSection data={data} /> : null}

      {latestRun.keyRisks.length > 0 || latestRun.ddChecklist.length > 0 ? (
        <RisksSection data={data} />
      ) : null}

      {asset.counterparties && asset.counterparties.length > 0 ? (
        <CounterpartySection data={data} />
      ) : null}

      {asset.documents && asset.documents.length > 0 ? <DocumentsSection data={data} /> : null}

      {asset.committeePackets && asset.committeePackets.length > 0 ? (
        <IcPacketSection data={data} />
      ) : null}

      {asset.sideLetters && asset.sideLetters.length > 0 ? (
        <SideLettersSection data={data} />
      ) : null}

      {asset.featureSnapshots && asset.featureSnapshots.length > 0 ? (
        <FeaturesSection data={data} />
      ) : null}

      {asset.tokenization ? <TokenizationSection data={data} /> : null}

      {auditTrail.events.length > 0 ? <AuditSection data={data} /> : null}

      <MemoSection data={data} />

      <FooterCtaSection />
    </main>
  );
}
