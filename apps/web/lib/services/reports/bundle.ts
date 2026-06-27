import { AssetClass } from '@prisma/client';
import { getAssetClassPlaybook } from '@/lib/asset-class/playbook';
import { resolveDisplayCurrency } from '@/lib/finance/currency';
import { getAssetById } from '@/lib/services/assets';
import { getFxRateMap } from '@/lib/services/fx';
import { readStoredBaseCaseProForma } from '@/lib/services/valuation/pro-forma';
import {
  buildAssetEvidenceReviewSummary,
  extractReviewPacketSummary,
  getLatestReviewPacketRecord
} from '@/lib/services/review';
import { buildAssetResearchDossier } from '@/lib/services/research/dossier';
import { formatNumber, toSentenceCase } from '@/lib/utils';
import { buildValuationQualitySummary } from '@/lib/services/valuation/quality';
import { resolveBullBearValues } from '@/lib/services/valuation/scenario-utils';
import type { ProvenanceEntry } from '@/lib/sources/types';
import { buildDocumentTrace, buildReportFingerprint } from './fingerprint';
import { resolveBaseScenario } from './helpers';
import { type AssetBundle, type DealReportBundle } from './types';

export async function buildReportBundleFromAsset(
  asset: AssetBundle,
  options?: {
    fxRateToKrw?: number | null;
    generatedAt?: Date;
  }
): Promise<DealReportBundle> {
  const playbook = getAssetClassPlaybook(asset.assetClass);
  const latestValuation = asset.valuations[0];
  const displayCurrency = resolveDisplayCurrency(asset.address?.country ?? asset.market);
  const fxRateToKrw: number | null =
    options?.fxRateToKrw ??
    (await getFxRateMap([displayCurrency]).then((rates) => rates[displayCurrency] ?? null));
  const provenance = Array.isArray(latestValuation?.provenance)
    ? (latestValuation.provenance as ProvenanceEntry[])
    : [];
  const quality = latestValuation
    ? buildValuationQualitySummary(asset, latestValuation.assumptions, provenance)
    : null;
  const reviewSummary = buildAssetEvidenceReviewSummary(
    asset as unknown as Parameters<typeof buildAssetEvidenceReviewSummary>[0]
  );
  const researchDossier = buildAssetResearchDossier(asset as never);
  const baseScenario = resolveBaseScenario(latestValuation);
  const proForma = latestValuation ? readStoredBaseCaseProForma(latestValuation.assumptions) : null;
  const documents = buildDocumentTrace(asset);
  const latestReviewPacketRecord = getLatestReviewPacketRecord(
    asset.readinessProject?.onchainRecords
  );
  const latestAnchoredRecord =
    asset.readinessProject?.onchainRecords.find((record) => Boolean(record.txHash)) ?? null;
  const latestOnchainRecord = latestAnchoredRecord
    ? {
        txHash: latestAnchoredRecord.txHash,
        chainId: latestAnchoredRecord.chainId,
        anchoredAt: latestAnchoredRecord.anchoredAt,
        status: latestAnchoredRecord.status,
        recordType: latestAnchoredRecord.recordType
      }
    : null;
  const latestReviewPacket = extractReviewPacketSummary(latestReviewPacketRecord);
  const locationLabel =
    [asset.address?.city, asset.address?.province, asset.address?.country]
      .filter(Boolean)
      .join(', ') || asset.market;
  const sizeLabel = playbook.sizeLabel;
  const sizeValue =
    asset.assetClass === AssetClass.DATA_CENTER
      ? `${formatNumber(asset.powerCapacityMw)} MW`
      : `${formatNumber(asset.rentableAreaSqm ?? asset.grossFloorAreaSqm)} sqm`;

  return {
    assetId: asset.id,
    assetCode: asset.assetCode,
    assetSlug: asset.slug,
    assetName: asset.name,
    assetDescription: asset.description,
    assetClass: asset.assetClass,
    assetClassLabel: playbook.label,
    market: asset.market,
    stage: toSentenceCase(asset.stage),
    status: toSentenceCase(asset.status),
    ownerName: asset.ownerName,
    sponsorName: asset.sponsorName,
    developmentSummary: asset.developmentSummary,
    locationLabel,
    sizeLabel,
    sizeValue,
    displayCurrency,
    fxRateToKrw,
    counts: {
      documents: asset.documents.length,
      leases: asset.leases.length,
      comparables: asset.comparableSet?.entries.length ?? 0,
      capexLines: asset.capexLineItems.length,
      debtFacilities: asset.debtFacilities.length,
      ownershipRecords: asset.ownershipRecords.length,
      encumbrances: asset.encumbranceRecords.length,
      planningConstraints: asset.planningConstraints.length,
      anchoredDocuments:
        asset.readinessProject?.onchainRecords.filter((record) => Boolean(record.documentId))
          .length ?? 0
    },
    latestValuation: latestValuation
      ? {
          id: latestValuation.id,
          runLabel: latestValuation.runLabel,
          createdAt: latestValuation.createdAt,
          engineVersion: latestValuation.engineVersion,
          confidenceScore: latestValuation.confidenceScore,
          baseCaseValueKrw: latestValuation.baseCaseValueKrw,
          underwritingMemo: latestValuation.underwritingMemo,
          keyRisks: latestValuation.keyRisks,
          ddChecklist: latestValuation.ddChecklist,
          assumptions: latestValuation.assumptions,
          provenance,
          baseScenario: baseScenario
            ? {
                valuationKrw: baseScenario.valuationKrw,
                impliedYieldPct: baseScenario.impliedYieldPct,
                exitCapRatePct: baseScenario.exitCapRatePct,
                debtServiceCoverage: baseScenario.debtServiceCoverage
              }
            : null,
          bullScenarioValueKrw: resolveBullBearValues(latestValuation.scenarios).bull,
          bearScenarioValueKrw: resolveBullBearValues(latestValuation.scenarios).bear
        }
      : null,
    proForma,
    valuationQuality: quality,
    reviewSummary,
    documents,
    latestOnchainRecord,
    latestReviewPacket,
    researchDossier: {
      marketThesis: researchDossier.marketThesis,
      freshnessHeadline: researchDossier.freshness.headline,
      freshnessLabel: researchDossier.freshness.label,
      openCoverageTaskCount: researchDossier.coverage.openTaskCount,
      houseViewLabel: researchDossier.houseView.approvalLabel,
      thesisAgeDays: researchDossier.houseView.thesisAgeDays
    },
    reportFingerprint: buildReportFingerprint(asset),
    generatedAt: options?.generatedAt ?? new Date()
  };
}

export async function getAssetReportBundle(assetId: string) {
  const asset = await getAssetById(assetId);
  if (!asset) return null;
  return buildReportBundleFromAsset(asset);
}
