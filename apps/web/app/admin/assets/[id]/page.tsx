import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AssetClass } from '@prisma/client';
import { AssetEnrichmentButton } from '@/components/admin/asset-enrichment-button';
import { convertFromKrw, formatCurrencyFromKrwAtRate, resolveDisplayCurrency } from '@/lib/finance/currency';
import { AssetIntakeForm } from '@/components/admin/asset-intake-form';
import { CapexBookForm } from '@/components/admin/capex-book-form';
import { ComparableBookForm } from '@/components/admin/comparable-book-form';
import { ResearchDossierPanel } from '@/components/admin/research-dossier-panel';
import { DebtBookForm } from '@/components/admin/debt-book-form';
import { DocumentUploadForm } from '@/components/admin/document-upload-form';
import { FeatureSnapshotPanel } from '@/components/admin/feature-snapshot-panel';
import { LeaseBookForm } from '@/components/admin/lease-book-form';
import { MicroDataForm } from '@/components/admin/micro-data-form';
import { ReadinessActionPanel } from '@/components/admin/readiness-action-panel';
import { ReviewQueuePanel } from '@/components/admin/review-queue-panel';
import { QuickValuationRunButton } from '@/components/admin/quick-valuation-run-button';
import { RealizedOutcomeForm } from '@/components/admin/realized-outcome-form';
import { ValuationRunForm } from '@/components/admin/valuation-run-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfidenceBreakdown } from '@/components/valuation/confidence-breakdown';
import { FeatureAssumptionMapping } from '@/components/valuation/feature-assumption-mapping';
import { MarketEvidencePanel } from '@/components/valuation/market-evidence-panel';
import { LeaseExpiryLadder } from '@/components/valuation/lease-expiry-ladder';
import { LeaseRolloverDrilldown } from '@/components/valuation/lease-rollover-drilldown';
import { ProFormaPanel } from '@/components/valuation/pro-forma-panel';
import { SatelliteRiskSummary } from '@/components/valuation/satellite-risk-summary';
import { RealizedOutcomePanel } from '@/components/valuation/realized-outcome-panel';
import { ValuationBreakdown } from '@/components/valuation/valuation-breakdown';
import { ValuationHistoryTable } from '@/components/valuation/valuation-history-table';
import { ValuationProvenance } from '@/components/valuation/valuation-provenance';
import { ValuationQualityPanel } from '@/components/valuation/valuation-quality-panel';
import { ValuationRunBadges } from '@/components/valuation/valuation-run-badges';
import { ValuationSignals } from '@/components/valuation/valuation-signals';
import { shortenHash } from '@/lib/blockchain/registry';
import { getAssetClassPlaybook } from '@/lib/asset-class/playbook';
import { getAssetById } from '@/lib/services/assets';
import { getFxRateMap } from '@/lib/services/fx';
import { buildRealizedOutcomeComparison } from '@/lib/services/realized-outcomes';
import { buildAssetResearchDossier } from '@/lib/services/research/dossier';
import { buildAssetEvidenceReviewSummary, extractReviewPacketSummary, getLatestReviewPacketRecord } from '@/lib/services/review';
import { formatDate, formatNumber, formatPercent } from '@/lib/utils';
import { buildFeatureAssumptionMappings } from '@/lib/valuation/feature-assumption-mapping';
import { filterValuationFeatureSnapshots } from '@/lib/valuation/feature-snapshot-usage';
import { resolveSatelliteRiskSnapshot } from '@/lib/valuation/satellite-risk';

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

function toInputCurrencyValue(amountKrw: number | null | undefined, currency: ReturnType<typeof resolveDisplayCurrency>) {
  return convertFromKrw(amountKrw, currency) ?? undefined;
}

export default async function AssetDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ rolloverYear?: string | string[] }>;
}) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const rolloverYearParam = Array.isArray(resolvedSearchParams?.rolloverYear)
    ? resolvedSearchParams?.rolloverYear[0]
    : resolvedSearchParams?.rolloverYear;
  const selectedRolloverYear =
    rolloverYearParam && Number.isFinite(Number(rolloverYearParam)) ? Number(rolloverYearParam) : null;
  const asset = await getAssetById(id);
  if (!asset) notFound();

  const latestRun = asset.valuations[0];
  const provenance = Array.isArray(latestRun?.provenance) ? (latestRun.provenance as ProvenanceEntry[]) : [];
  const satelliteRisk = resolveSatelliteRiskSnapshot({
    assumptions: latestRun?.assumptions,
    siteProfile: asset.siteProfile
  });
  const recommendation = getRecommendation(latestRun?.confidenceScore);
  const latestFeatureSnapshots = asset.featureSnapshots.slice(0, 4);
  const usedFeatureSnapshots = latestRun
    ? filterValuationFeatureSnapshots(asset.featureSnapshots, latestRun.assumptions)
    : [];
  const featureAssumptionMappings = latestRun
    ? buildFeatureAssumptionMappings(usedFeatureSnapshots, latestRun.assumptions, provenance)
    : [];
  const isDataCenter = asset.assetClass === AssetClass.DATA_CENTER;
  const playbook = getAssetClassPlaybook(asset.assetClass);
  const latestDocument = asset.documents[0];
  const latestReviewPacketRecord = getLatestReviewPacketRecord(asset.readinessProject?.onchainRecords);
  const latestReviewPacket = extractReviewPacketSummary(latestReviewPacketRecord);
  const latestOnchainRecord = asset.readinessProject?.onchainRecords.find((record) => Boolean(record.txHash)) ?? null;
  const reviewSummary = buildAssetEvidenceReviewSummary(asset as Parameters<typeof buildAssetEvidenceReviewSummary>[0]);
  const researchDossier = buildAssetResearchDossier(asset);
  const displayCurrency = resolveDisplayCurrency(asset.address?.country ?? asset.market);
  const fxRateToKrw = (await getFxRateMap([displayCurrency]))[displayCurrency];
  const realizedOutcomeComparison = latestRun
    ? buildRealizedOutcomeComparison({
        run: {
          id: latestRun.id,
          assetId: latestRun.assetId,
          createdAt: latestRun.createdAt,
          baseCaseValueKrw: latestRun.baseCaseValueKrw,
          assumptions: latestRun.assumptions,
          asset: {
            id: asset.id,
            name: asset.name,
            assetCode: asset.assetCode,
            assetClass: asset.assetClass
          },
          scenarios: latestRun.scenarios.map((scenario) => ({
            name: scenario.name,
            debtServiceCoverage: scenario.debtServiceCoverage
          }))
        },
        outcomes: asset.realizedOutcomes
      })
    : {
        status: 'NO_MATCH' as const,
        match: null,
        commentary: 'Run an analysis first, then capture a later realized outcome to validate the macro view.'
      };

  return (
    <div className="space-y-8">
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="hero-mesh">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="eyebrow">Asset Dossier</div>
              <h2 className="mt-2 text-4xl font-semibold tracking-[-0.04em] text-white">{asset.name}</h2>
            </div>
            <div className="flex gap-2">
              <Badge>{asset.status}</Badge>
              <Badge tone="good">{asset.stage}</Badge>
            </div>
          </div>

          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">{asset.description}</p>

          <div className="mt-6 grid gap-4 md:grid-cols-4">
            {[
              ['Location', asset.address?.city ?? 'N/A'],
              [
                playbook.sizeLabel,
                isDataCenter
                  ? `${formatNumber(asset.powerCapacityMw)} MW`
                  : `${formatNumber(asset.rentableAreaSqm ?? asset.grossFloorAreaSqm)} sqm`
              ],
              ['Base Case', formatCurrencyFromKrwAtRate(asset.currentValuationKrw, displayCurrency, fxRateToKrw)],
              ['Updated', formatDate(asset.updatedAt)]
            ].map(([label, value]) => (
              <div key={label} className="metric-card">
                <div className="fine-print">{label}</div>
                <div className="mt-3 text-2xl font-semibold text-white">{value}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-5">
          <div>
            <div className="eyebrow">Analysis Control</div>
            <h3 className="mt-2 text-2xl font-semibold text-white">Run return analysis and update the IM</h3>
          </div>

          <ValuationRunForm assetId={asset.id} />

          <div className="grid gap-3">
            <QuickValuationRunButton assetId={asset.id} assetCode={asset.assetCode} fullWidth label="Quick Re-run" />
            <AssetEnrichmentButton assetId={asset.id} fullWidth />
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
            <div className="fine-print">Underwriting Position</div>
            <div className="mt-3 text-2xl font-semibold text-white">{recommendation}</div>
            <p className="mt-2 text-sm leading-7 text-slate-400">
              Based on the latest valuation confidence, approved evidence coverage, and current diligence blockers.
            </p>
          </div>

          {latestRun ? (
            <Link href={`/admin/valuations/${latestRun.id}`}>
              <Button className="w-full">Open Valuation And Committee View</Button>
            </Link>
          ) : null}

          <Link href={`/admin/assets/${asset.id}/reports`}>
            <Button className="w-full" variant="ghost">
              Open Report Library
            </Button>
          </Link>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="eyebrow">Latest Investment Memo</div>
              <h3 className="mt-2 text-2xl font-semibold text-white">
                <span data-testid="latest-run-label">{latestRun ? latestRun.runLabel : 'No IM generated yet'}</span>
              </h3>
            </div>
            {latestRun ? <Badge tone="good">{recommendation}</Badge> : null}
          </div>

          <div className="mt-5 space-y-5">
            <p className="text-sm leading-8 text-slate-300">
              {latestRun?.underwritingMemo ?? 'Run the analysis to generate a new investment memo for this asset.'}
            </p>

            {latestRun ? (
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="fine-print">Base Case</div>
                  <div className="mt-3 text-xl font-semibold text-white">
                    {formatCurrencyFromKrwAtRate(latestRun.baseCaseValueKrw, displayCurrency, fxRateToKrw)}
                  </div>
                </div>
                <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="fine-print">Confidence</div>
                  <div className="mt-3 text-xl font-semibold text-white">{formatNumber(latestRun.confidenceScore, 1)}</div>
                </div>
                <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="fine-print">Prepared</div>
                  <div className="mt-3 text-xl font-semibold text-white">{formatDate(latestRun.createdAt)}</div>
                </div>
              </div>
            ) : null}

            {latestRun ? (
              <ValuationRunBadges
                createdAt={latestRun.createdAt}
                confidenceScore={latestRun.confidenceScore}
                provenance={provenance}
                scenarios={latestRun.scenarios}
              />
            ) : null}
          </div>
        </Card>

        <div className="grid gap-6">
          <Card>
            <div className="eyebrow">Research Snapshot</div>
            <div className="mt-4 grid gap-4 text-sm text-slate-300">
              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <div className="text-slate-500">{isDataCenter ? 'Grid / Fiber' : 'Site / Access'}</div>
                <div className="mt-2">{asset.siteProfile?.gridAvailability}</div>
                <div className="mt-1 text-slate-400">{asset.siteProfile?.fiberAccess}</div>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <div className="text-slate-500">Permit</div>
                <div className="mt-2">{asset.permitSnapshot?.powerApprovalStatus}</div>
                <div className="mt-1 text-slate-400">{asset.permitSnapshot?.timelineNotes}</div>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <div className="text-slate-500">Market</div>
                <div className="mt-2">
                  {isDataCenter
                    ? `Cap rate ${formatPercent(asset.marketSnapshot?.capRatePct)} / Colocation ${formatCurrencyFromKrwAtRate(asset.marketSnapshot?.colocationRatePerKwKrw, displayCurrency, fxRateToKrw)}`
                    : asset.assetClass === AssetClass.OFFICE
                      ? `Cap rate ${formatPercent(asset.marketSnapshot?.capRatePct)} / Vacancy ${formatPercent(asset.marketSnapshot?.vacancyPct)} / Market rent ${formatNumber(asset.rentComps[0]?.monthlyRentPerSqmKrw)} KRW/sqm/mo`
                      : `Cap rate ${formatPercent(asset.marketSnapshot?.capRatePct)} / Vacancy ${formatPercent(asset.marketSnapshot?.vacancyPct)}`}
                </div>
                <div className="mt-1 text-slate-400">{asset.marketSnapshot?.marketNotes}</div>
              </div>
            </div>
          </Card>

          <SatelliteRiskSummary snapshot={satelliteRisk} />

          {latestRun?.keyRisks.length ? (
            <Card>
              <div className="eyebrow">Key Risks</div>
              <ul className="mt-4 space-y-3 text-sm text-slate-300">
                {latestRun.keyRisks.map((risk) => (
                  <li key={risk} className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3">
                    {risk}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>

      <FeatureSnapshotPanel
        title="Approved Feature Layer"
        snapshots={latestFeatureSnapshots}
        emptyMessage="No approved feature snapshots yet. Approve normalized evidence or run enrichment before relying on this asset in committee materials."
      />

      <ResearchDossierPanel dossier={researchDossier} />

      <ReviewQueuePanel
        summaries={[reviewSummary]}
        title="Asset Evidence Review"
        emptyMessage="All evidence rows for this asset are already reviewed."
      />

      <MarketEvidencePanel
        assetClass={asset.assetClass}
        displayCurrency={displayCurrency}
        fxRateToKrw={fxRateToKrw}
        transactionComps={asset.transactionComps}
        rentComps={asset.rentComps}
        marketIndicators={asset.marketIndicatorSeries}
      />

      <Card>
        <div>
          <div className="eyebrow">Micro Research Capture</div>
          <h3 className="mt-2 text-2xl font-semibold text-white">{playbook.intakeHeading}</h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
            Use this panel to capture normalized evidence that changes downside, execution certainty, and approved
            feature coverage for this asset class.
          </p>
        </div>
        <div className="mt-5">
          <MicroDataForm
            assetId={asset.id}
            inputCurrency={displayCurrency}
            reviewStatuses={[
              asset.energySnapshot
                ? {
                    label: 'Energy / Building Services',
                    status: asset.energySnapshot.reviewStatus
                  }
                : null,
              asset.permitSnapshot
                ? {
                    label: 'Permit / Entitlement',
                    status: asset.permitSnapshot.reviewStatus
                  }
                : null,
              asset.ownershipRecords[0]
                ? {
                    label: 'Ownership',
                    status: asset.ownershipRecords[0].reviewStatus
                  }
                : null,
              asset.encumbranceRecords[0]
                ? {
                    label: 'Encumbrance',
                    status: asset.encumbranceRecords[0].reviewStatus
                  }
                : null,
              asset.planningConstraints[0]
                ? {
                    label: 'Planning',
                    status: asset.planningConstraints[0].reviewStatus
                  }
                : null
            ].filter(Boolean) as Array<{ label: string; status: any }>}
            defaultValues={{
              utilityName: asset.energySnapshot?.utilityName ?? '',
              substationDistanceKm: asset.energySnapshot?.substationDistanceKm ?? undefined,
              tariffKrwPerKwh: toInputCurrencyValue(asset.energySnapshot?.tariffKrwPerKwh, displayCurrency),
              renewableAvailabilityPct: asset.energySnapshot?.renewableAvailabilityPct ?? undefined,
              pueTarget: asset.energySnapshot?.pueTarget ?? undefined,
              backupFuelHours: asset.energySnapshot?.backupFuelHours ?? undefined,
              permitStage: asset.permitSnapshot?.permitStage ?? '',
              zoningApprovalStatus: asset.permitSnapshot?.zoningApprovalStatus ?? '',
              environmentalReviewStatus: asset.permitSnapshot?.environmentalReviewStatus ?? '',
              powerApprovalStatus: asset.permitSnapshot?.powerApprovalStatus ?? '',
              timelineNotes: asset.permitSnapshot?.timelineNotes ?? '',
              legalOwnerName: asset.ownershipRecords[0]?.ownerName ?? '',
              legalOwnerEntityType: asset.ownershipRecords[0]?.entityType ?? '',
              ownershipPct: asset.ownershipRecords[0]?.ownershipPct ?? undefined,
              encumbranceType: asset.encumbranceRecords[0]?.encumbranceType ?? '',
              encumbranceHolderName: asset.encumbranceRecords[0]?.holderName ?? '',
                securedAmountKrw: toInputCurrencyValue(asset.encumbranceRecords[0]?.securedAmountKrw, displayCurrency),
              priorityRank: asset.encumbranceRecords[0]?.priorityRank ?? undefined,
              encumbranceStatus: asset.encumbranceRecords[0]?.statusLabel ?? '',
              planningConstraintType: asset.planningConstraints[0]?.constraintType ?? '',
              planningConstraintTitle: asset.planningConstraints[0]?.title ?? '',
              planningConstraintSeverity: asset.planningConstraints[0]?.severity ?? '',
              planningConstraintDescription: asset.planningConstraints[0]?.description ?? ''
            }}
          />
        </div>
      </Card>

      <Card>
        <div>
          <div className="eyebrow">Lease Book</div>
          <h3 className="mt-2 text-2xl font-semibold text-white">
            {asset.assetClass === AssetClass.OFFICE
              ? 'Occupancy, rollover, and rent schedule'
              : asset.assetClass === AssetClass.INDUSTRIAL
                ? 'Tenant durability and lease stack'
                : 'Contracted demand and lease stack'}
          </h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
            Capture signed, active, or pipeline lease evidence here. The valuation engine uses approved lease and
            revenue context first, then falls back to residual assumptions where coverage is still thin.
          </p>
        </div>
        <div className="mt-5">
          <LeaseBookForm
            assetId={asset.id}
            inputCurrency={displayCurrency}
            defaultLeases={asset.leases.map((lease) => ({
              id: lease.id,
              reviewStatus: lease.reviewStatus,
              reviewNotes: lease.reviewNotes ?? '',
              tenantName: lease.tenantName,
              leaseStatus: lease.status,
              leasedKw: lease.leasedKw ?? undefined,
              startYear: lease.startYear ?? undefined,
              termYears: lease.termYears ?? undefined,
              baseRatePerKwKrw: toInputCurrencyValue(lease.baseRatePerKwKrw, displayCurrency),
              annualEscalationPct: lease.annualEscalationPct ?? undefined,
              probabilityPct: lease.probabilityPct ?? undefined,
              renewProbabilityPct: lease.renewProbabilityPct ?? undefined,
              downtimeMonths: lease.downtimeMonths ?? undefined,
              rolloverDowntimeMonths: lease.rolloverDowntimeMonths ?? undefined,
              renewalRentFreeMonths: lease.renewalRentFreeMonths ?? undefined,
              renewalTermYears: lease.renewalTermYears ?? undefined,
              renewalCount: lease.renewalCount ?? undefined,
              rentFreeMonths: lease.rentFreeMonths ?? undefined,
              markToMarketRatePerKwKrw: toInputCurrencyValue(lease.markToMarketRatePerKwKrw, displayCurrency),
              renewalTenantImprovementKrw: toInputCurrencyValue(
                lease.renewalTenantImprovementKrw,
                displayCurrency
              ),
              renewalLeasingCommissionKrw: toInputCurrencyValue(
                lease.renewalLeasingCommissionKrw,
                displayCurrency
              ),
              tenantImprovementKrw: toInputCurrencyValue(lease.tenantImprovementKrw, displayCurrency),
              leasingCommissionKrw: toInputCurrencyValue(lease.leasingCommissionKrw, displayCurrency),
              recoverableOpexRatioPct: lease.recoverableOpexRatioPct ?? undefined,
              fixedRecoveriesKrw: toInputCurrencyValue(lease.fixedRecoveriesKrw, displayCurrency),
              expenseStopKrwPerKwMonth: toInputCurrencyValue(lease.expenseStopKrwPerKwMonth, displayCurrency),
              utilityPassThroughPct: lease.utilityPassThroughPct ?? undefined,
              fitOutCostKrw: toInputCurrencyValue(lease.fitOutCostKrw, displayCurrency),
              leaseNotes: lease.notes ?? '',
              steps: lease.steps.map((step) => {
                const underwritingStep = step as typeof step & {
                  rentFreeMonths?: number | null;
                  renewProbabilityPct?: number | null;
                  rolloverDowntimeMonths?: number | null;
                  renewalRentFreeMonths?: number | null;
                  renewalTermYears?: number | null;
                  renewalCount?: number | null;
                  markToMarketRatePerKwKrw?: number | null;
                  renewalTenantImprovementKrw?: number | null;
                  renewalLeasingCommissionKrw?: number | null;
                  tenantImprovementKrw?: number | null;
                  leasingCommissionKrw?: number | null;
                  recoverableOpexRatioPct?: number | null;
                  fixedRecoveriesKrw?: number | null;
                  expenseStopKrwPerKwMonth?: number | null;
                  utilityPassThroughPct?: number | null;
                };

                return {
                  startYear: step.startYear ?? undefined,
                  endYear: step.endYear ?? undefined,
                  ratePerKwKrw: toInputCurrencyValue(step.ratePerKwKrw, displayCurrency),
                  leasedKw: step.leasedKw ?? undefined,
                  annualEscalationPct: step.annualEscalationPct ?? undefined,
                  occupancyPct: step.occupancyPct ?? undefined,
                  rentFreeMonths: underwritingStep.rentFreeMonths ?? undefined,
                  renewProbabilityPct: underwritingStep.renewProbabilityPct ?? undefined,
                  rolloverDowntimeMonths: underwritingStep.rolloverDowntimeMonths ?? undefined,
                  renewalRentFreeMonths: underwritingStep.renewalRentFreeMonths ?? undefined,
                  renewalTermYears: underwritingStep.renewalTermYears ?? undefined,
                  renewalCount: underwritingStep.renewalCount ?? undefined,
                  markToMarketRatePerKwKrw: toInputCurrencyValue(
                    underwritingStep.markToMarketRatePerKwKrw,
                    displayCurrency
                  ),
                  renewalTenantImprovementKrw: toInputCurrencyValue(
                    underwritingStep.renewalTenantImprovementKrw,
                    displayCurrency
                  ),
                  renewalLeasingCommissionKrw: toInputCurrencyValue(
                    underwritingStep.renewalLeasingCommissionKrw,
                    displayCurrency
                  ),
                  tenantImprovementKrw: toInputCurrencyValue(
                    underwritingStep.tenantImprovementKrw,
                    displayCurrency
                  ),
                  leasingCommissionKrw: toInputCurrencyValue(
                    underwritingStep.leasingCommissionKrw,
                    displayCurrency
                  ),
                  recoverableOpexRatioPct: underwritingStep.recoverableOpexRatioPct ?? undefined,
                  fixedRecoveriesKrw: toInputCurrencyValue(underwritingStep.fixedRecoveriesKrw, displayCurrency),
                  expenseStopKrwPerKwMonth: toInputCurrencyValue(
                    underwritingStep.expenseStopKrwPerKwMonth,
                    displayCurrency
                  ),
                  utilityPassThroughPct: underwritingStep.utilityPassThroughPct ?? undefined,
                  notes: step.notes ?? ''
                };
              })
            }))}
          />
        </div>
      </Card>

      <Card>
        <div>
          <div className="eyebrow">Comparable Book</div>
          <h3 className="mt-2 text-2xl font-semibold text-white">Pricing calibration and market peers</h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
            Add peer assets with pricing signals and weights so the underwriting no longer leans only on generic market
            snapshots. This directly improves cap-rate, rate, and direct-value calibration.
          </p>
        </div>
        <div className="mt-5">
          <ComparableBookForm
            assetId={asset.id}
            inputCurrency={displayCurrency}
            defaultSetName={asset.comparableSet?.name}
            defaultSetNotes={asset.comparableSet?.notes}
            defaultEntries={
              asset.comparableSet?.entries.map((entry) => ({
                id: entry.id,
                label: entry.label,
                location: entry.location,
                assetType: entry.assetType,
                stage: entry.stage,
                sourceLink: entry.sourceLink ?? '',
                powerCapacityMw: entry.powerCapacityMw,
                grossFloorAreaSqm: entry.grossFloorAreaSqm,
                occupancyPct: entry.occupancyPct,
                valuationKrw: toInputCurrencyValue(entry.valuationKrw, displayCurrency),
                pricePerMwKrw: toInputCurrencyValue(entry.pricePerMwKrw, displayCurrency),
                monthlyRatePerKwKrw: toInputCurrencyValue(entry.monthlyRatePerKwKrw, displayCurrency),
                capRatePct: entry.capRatePct,
                discountRatePct: entry.discountRatePct,
                weightPct: entry.weightPct,
                notes: entry.notes ?? ''
              })) ?? []
            }
          />
        </div>
      </Card>

      <Card>
        <div>
          <div className="eyebrow">Capex Book</div>
          <h3 className="mt-2 text-2xl font-semibold text-white">Replacement-cost structure and downside floor</h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
            Split the development budget into land, shell/core, electrical, mechanical, IT fit-out, soft cost, and
            contingency so the replacement floor and retained hard-cost logic stop leaning on fallback allocation.
          </p>
        </div>
        <div className="mt-5">
          <CapexBookForm
            assetId={asset.id}
            inputCurrency={displayCurrency}
            defaultItems={asset.capexLineItems.map((item) => ({
              id: item.id,
              category: item.category,
              label: item.label,
              amountKrw: toInputCurrencyValue(item.amountKrw, displayCurrency),
              spendYear: item.spendYear,
              isEmbedded: item.isEmbedded,
              notes: item.notes ?? ''
            }))}
          />
        </div>
      </Card>

      <Card>
        <div>
          <div className="eyebrow">Debt Book</div>
          <h3 className="mt-2 text-2xl font-semibold text-white">Facility terms, draws, and debt-service realism</h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
            Enter actual lender terms and draw timing so DSCR, reserve sizing, and ending debt balance reflect the real
            capital stack instead of the synthetic underwriting facility.
          </p>
        </div>
        <div className="mt-5">
          <DebtBookForm
            assetId={asset.id}
            inputCurrency={displayCurrency}
            defaultFacilities={asset.debtFacilities.map((facility) => ({
              id: facility.id,
              facilityType: facility.facilityType,
              lenderName: facility.lenderName ?? '',
              commitmentKrw: toInputCurrencyValue(facility.commitmentKrw, displayCurrency),
              drawnAmountKrw: toInputCurrencyValue(facility.drawnAmountKrw, displayCurrency),
              interestRatePct: facility.interestRatePct,
              upfrontFeePct: facility.upfrontFeePct,
              commitmentFeePct: facility.commitmentFeePct,
              gracePeriodMonths: facility.gracePeriodMonths,
              amortizationTermMonths: facility.amortizationTermMonths,
              amortizationProfile: facility.amortizationProfile,
              sculptedTargetDscr: facility.sculptedTargetDscr,
              balloonPct: facility.balloonPct,
              reserveMonths: facility.reserveMonths,
              notes: facility.notes ?? '',
              draws: facility.draws.map((draw) => ({
                drawYear: draw.drawYear,
                drawMonth: draw.drawMonth,
                amountKrw: toInputCurrencyValue(draw.amountKrw, displayCurrency),
                notes: draw.notes ?? ''
              }))
            }))}
          />
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <div>
            <div className="eyebrow">Realized Outcome Capture</div>
            <h3 className="mt-2 text-2xl font-semibold text-white">Observed asset performance after the underwriting run</h3>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
              Capture actual occupancy, NOI, value, and DSCR after the run closes. This is the feedback loop the macro
              team needs to validate regime overlays against real asset outcomes.
            </p>
          </div>
          <div className="mt-5">
            <RealizedOutcomeForm assetId={asset.id} inputCurrency={displayCurrency} />
          </div>
        </Card>

        <RealizedOutcomePanel
          comparison={realizedOutcomeComparison}
          outcomes={asset.realizedOutcomes}
          displayCurrency={displayCurrency}
          fxRateToKrw={fxRateToKrw}
        />
      </div>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="eyebrow">Review Readiness</div>
            <h3 className="mt-2 text-2xl font-semibold text-white">Registry-ready evidence packaging</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={asset.readinessProject?.readinessStatus === 'ANCHORED' ? 'good' : 'warn'} data-testid="readiness-status">
              {asset.readinessProject?.readinessStatus ?? 'NOT_STARTED'}
            </Badge>
            <Badge>{asset.readinessProject?.reviewPhase ?? 'Committee review'}</Badge>
          </div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-300">
            <div>
              <div className="text-slate-500">Next action</div>
              <div className="mt-2 text-white">
                {asset.readinessProject?.nextAction ?? 'Prepare the institutional review packet.'}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Latest document hash</div>
              <div className="mt-2 font-mono text-white">
                {latestDocument ? shortenHash(latestDocument.documentHash, 12) : 'No document uploaded'}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Latest tx</div>
              <div className="mt-2 font-mono text-white" data-testid="readiness-latest-tx">
                {latestOnchainRecord?.txHash ? shortenHash(latestOnchainRecord.txHash, 12) : 'No onchain transaction yet'}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Review packet</div>
              <div className="mt-2 font-mono text-white" data-testid="readiness-packet">
                {latestReviewPacket?.fingerprint
                  ? shortenHash(latestReviewPacket.fingerprint, 12)
                  : 'Not staged'}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Chain</div>
              <div className="mt-2 text-white">{asset.readinessProject?.chainName ?? 'Registry not connected'}</div>
            </div>
          </div>

          <ReadinessActionPanel assetId={asset.id} />
        </div>
      </Card>

      {latestRun ? (
        <div className="space-y-6">
          <ValuationQualityPanel
            asset={{
              leases: asset.leases,
              capexLineItems: asset.capexLineItems,
              comparableSet: asset.comparableSet,
              energySnapshot: asset.energySnapshot,
              permitSnapshot: asset.permitSnapshot,
              ownershipRecords: asset.ownershipRecords,
              encumbranceRecords: asset.encumbranceRecords,
              planningConstraints: asset.planningConstraints
            }}
            assumptions={latestRun.assumptions}
            provenance={provenance}
          />
          <FeatureAssumptionMapping rows={featureAssumptionMappings} />
          <ValuationHistoryTable runs={asset.valuations} displayCurrency={displayCurrency} fxRateToKrw={fxRateToKrw} />
          <ValuationBreakdown
            assumptions={latestRun.assumptions as Record<string, number | string | null>}
            provenance={provenance}
            displayCurrency={displayCurrency}
            fxRateToKrw={fxRateToKrw}
            debtFacilities={asset.debtFacilities}
            scenarios={latestRun.scenarios}
          />
          <ProFormaPanel
            assumptions={latestRun.assumptions}
            rolloverBasePath={`/admin/assets/${asset.id}`}
            selectedRolloverYear={selectedRolloverYear}
            displayCurrency={displayCurrency}
            fxRateToKrw={fxRateToKrw}
          />
          <LeaseExpiryLadder
            leases={asset.leases}
            leaseBasePath={`/admin/assets/${asset.id}`}
            rolloverBasePath={`/admin/assets/${asset.id}`}
            selectedRolloverYear={selectedRolloverYear}
            displayCurrency={displayCurrency}
            fxRateToKrw={fxRateToKrw}
          />
          <LeaseRolloverDrilldown
            leases={asset.leases}
            focusYear={selectedRolloverYear}
            leaseBasePath={`/admin/assets/${asset.id}`}
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
          <ValuationProvenance entries={provenance} />
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <div className="eyebrow">Data Room Upload</div>
          <div className="mt-5">
            <DocumentUploadForm assetId={asset.id} />
          </div>
        </Card>

        <Card>
          <div className="eyebrow">Document History</div>
          <div className="mt-4 space-y-4" data-testid="document-history">
            {asset.documents.map((document) => (
              <div
                key={document.id}
                className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4"
                data-testid="document-history-item"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold text-white">{document.title}</div>
                    <div className="text-sm text-slate-400">{document.documentType}</div>
                  </div>
                  <div className="text-sm text-slate-500">v{document.currentVersion}</div>
                </div>
                <p className="mt-3 text-sm text-slate-400">{document.aiSummary}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <div className="eyebrow">Intake Record</div>
        <div className="mt-5">
          <AssetIntakeForm
            assetId={asset.id}
            defaultValues={{
              assetClass: asset.assetClass ?? AssetClass.DATA_CENTER,
              assetCode: asset.assetCode,
              name: asset.name,
              assetType: asset.assetType,
              assetSubtype: asset.assetSubtype ?? '',
              status: asset.status,
              stage: asset.stage,
              description: asset.description,
              ownerName: asset.ownerName ?? '',
              sponsorName: asset.sponsorName ?? '',
              developmentSummary: asset.developmentSummary ?? '',
              targetItLoadMw: asset.targetItLoadMw ?? undefined,
              powerCapacityMw: asset.powerCapacityMw ?? undefined,
              landAreaSqm: asset.landAreaSqm ?? undefined,
              grossFloorAreaSqm: asset.grossFloorAreaSqm ?? undefined,
              rentableAreaSqm: asset.rentableAreaSqm ?? undefined,
              vacancyAllowancePct: asset.officeDetail?.vacancyAllowancePct ?? undefined,
              creditLossPct: asset.officeDetail?.creditLossPct ?? undefined,
              weightedAverageLeaseTermYears: asset.officeDetail?.weightedAverageLeaseTermYears ?? undefined,
              occupancyAssumptionPct: asset.occupancyAssumptionPct ?? undefined,
              stabilizedOccupancyPct: asset.stabilizedOccupancyPct ?? undefined,
              tenantAssumption: asset.tenantAssumption ?? '',
              financingLtvPct: asset.financingLtvPct ?? undefined,
              financingRatePct: asset.financingRatePct ?? undefined,
              holdingPeriodYears: asset.holdingPeriodYears ?? undefined,
              exitCapRatePct: asset.exitCapRatePct ?? undefined,
              line1: asset.address?.line1 ?? '',
              line2: asset.address?.line2 ?? '',
              district: asset.address?.district ?? '',
              city: asset.address?.city ?? '',
              province: asset.address?.province ?? '',
              postalCode: asset.address?.postalCode ?? '',
              country: asset.address?.country ?? 'KR',
              inputCurrency: displayCurrency,
              parcelId: asset.address?.parcelId ?? '',
              siteNotes: asset.siteProfile?.siteNotes ?? '',
              purchasePriceKrw: toInputCurrencyValue(asset.purchasePriceKrw, displayCurrency),
              stabilizedRentPerSqmMonthKrw: toInputCurrencyValue(
                asset.officeDetail?.stabilizedRentPerSqmMonthKrw,
                displayCurrency
              ),
              otherIncomeKrw: toInputCurrencyValue(asset.officeDetail?.otherIncomeKrw, displayCurrency),
              tenantImprovementReserveKrw: toInputCurrencyValue(
                asset.officeDetail?.tenantImprovementReserveKrw,
                displayCurrency
              ),
              leasingCommissionReserveKrw: toInputCurrencyValue(
                asset.officeDetail?.leasingCommissionReserveKrw,
                displayCurrency
              ),
              annualCapexReserveKrw: toInputCurrencyValue(
                asset.officeDetail?.annualCapexReserveKrw,
                displayCurrency
              ),
              capexAssumptionKrw: toInputCurrencyValue(asset.capexAssumptionKrw, displayCurrency),
              opexAssumptionKrw: toInputCurrencyValue(asset.opexAssumptionKrw, displayCurrency)
            }}
          />
        </div>
      </Card>
    </div>
  );
}
