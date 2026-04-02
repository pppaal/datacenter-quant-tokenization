import { getAssetClassPlaybook } from '@/lib/asset-class/playbook';
import {
  buildAssetEvidenceReviewSummary,
  extractReviewPacketSummary,
  getLatestReviewPacketRecord
} from '@/lib/services/review';
import { buildDocumentResearchSummary } from '@/lib/services/research/document-research';
import { buildMacroResearchSummary } from '@/lib/services/research/macro-research';
import { buildMarketResearchSummary } from '@/lib/services/research/market-research';
import { buildMicroResearchSummary } from '@/lib/services/research/micro-research';
import { selectValuationVariableFamilies } from '@/lib/services/valuation/variable-selection';

export function buildAssetResearchDossier(asset: any) {
  const playbook = getAssetClassPlaybook(asset.assetClass);
  const reviewSummary = buildAssetEvidenceReviewSummary(asset);
  const macro = buildMacroResearchSummary(asset);
  const market = buildMarketResearchSummary(asset);
  const micro = buildMicroResearchSummary(asset, reviewSummary);
  const documents = buildDocumentResearchSummary(asset);
  const latestReviewPacket = extractReviewPacketSummary(getLatestReviewPacketRecord(asset.readinessProject?.onchainRecords));

  return {
    playbook: {
      ...playbook,
      valuationVariableFamilies: selectValuationVariableFamilies(asset.assetClass)
    },
    marketThesis: `${macro.thesis} ${market.thesis}`.trim(),
    macro,
    market,
    micro,
    documents,
    pendingBlockers: reviewSummary.pendingBlockers,
    latestValuationId: asset.valuations?.[0]?.id ?? null,
    reviewPacketFingerprint: latestReviewPacket?.fingerprint ?? null,
    chainAnchorReference:
      asset.readinessProject?.onchainRecords?.find((record: any) => record.txHash)?.txHash ?? null
  };
}
