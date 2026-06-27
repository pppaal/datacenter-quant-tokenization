import crypto from 'node:crypto';
import { toSentenceCase } from '@/lib/utils';
import { type AssetBundle, type ReportDocumentTrace } from './types';

export function buildReportFingerprint(asset: AssetBundle) {
  const latestRun = asset.valuations[0];
  const fingerprintPayload = JSON.stringify({
    assetId: asset.id,
    updatedAt: asset.updatedAt.toISOString(),
    valuationId: latestRun?.id ?? null,
    valuationUpdatedAt: latestRun?.updatedAt.toISOString() ?? null,
    documents: asset.documents.map((document) => ({
      id: document.id,
      version: document.currentVersion,
      hash: document.documentHash
    })),
    review: {
      energy: asset.energySnapshot?.reviewStatus ?? null,
      permit: asset.permitSnapshot?.reviewStatus ?? null,
      ownership: asset.ownershipRecords.map((record) => ({
        id: record.id,
        status: (record as { reviewStatus?: string | null }).reviewStatus ?? null
      })),
      encumbrance: asset.encumbranceRecords.map((record) => ({
        id: record.id,
        status: (record as { reviewStatus?: string | null }).reviewStatus ?? null
      })),
      planning: asset.planningConstraints.map((record) => ({
        id: record.id,
        status: (record as { reviewStatus?: string | null }).reviewStatus ?? null
      })),
      leases: asset.leases.map((lease) => ({
        id: lease.id,
        status: (lease as { reviewStatus?: string | null }).reviewStatus ?? null
      }))
    },
    onchain: asset.readinessProject?.onchainRecords.map((record) => ({
      id: record.id,
      txHash: record.txHash,
      anchoredAt: record.anchoredAt?.toISOString() ?? null
    }))
  });
  return crypto
    .createHash('sha256')
    .update(fingerprintPayload)
    .digest('hex')
    .slice(0, 10)
    .toUpperCase();
}

export function buildDocumentTrace(asset: AssetBundle): ReportDocumentTrace[] {
  const anchors = asset.readinessProject?.onchainRecords ?? [];
  const latestAnchorByDocumentId = new Map(
    anchors
      .filter((record) => record.documentId)
      .map((record) => [record.documentId as string, record])
  );

  return asset.documents.slice(0, 12).map((document) => {
    const latestVersion = document.versions[0];
    const anchor = latestAnchorByDocumentId.get(document.id);

    return {
      id: document.id,
      title: document.title,
      documentType: toSentenceCase(document.documentType),
      currentVersion: document.currentVersion,
      updatedAt: document.updatedAt,
      hash: latestVersion?.documentHash ?? document.documentHash ?? null,
      summary: latestVersion?.aiSummary ?? document.aiSummary ?? null,
      sourceLink: latestVersion?.sourceLink ?? document.sourceLink ?? null,
      storagePath: latestVersion?.storagePath ?? document.latestStoragePath ?? null,
      anchoredTxHash: anchor?.txHash ?? null,
      chainId: anchor?.chainId ?? null,
      anchorStatus: anchor?.status ?? null
    };
  });
}
