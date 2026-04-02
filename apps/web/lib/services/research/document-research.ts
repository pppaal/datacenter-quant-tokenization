import { formatDate } from '@/lib/utils';

type DocumentResearchAsset = {
  documents?: Array<{
    title: string;
    documentType: string;
    updatedAt: Date;
    documentHash?: string | null;
    aiSummary?: string | null;
  }>;
  readinessProject?: {
    onchainRecords?: Array<{
      txHash?: string | null;
      recordType?: string | null;
      anchoredAt?: Date | null;
    }>;
  } | null;
};

export type DocumentResearchSummary = {
  latestDocumentHash: string | null;
  latestDocumentLabel: string;
  anchoredDocumentCount: number;
  documentRoomSummary: string;
};

export function buildDocumentResearchSummary(asset: DocumentResearchAsset): DocumentResearchSummary {
  const latestDocument = asset.documents?.[0] ?? null;
  const anchoredDocumentCount =
    asset.readinessProject?.onchainRecords?.filter((record) => record.recordType === 'DOCUMENT_HASH' && record.txHash).length ?? 0;

  return {
    latestDocumentHash: latestDocument?.documentHash ?? null,
    latestDocumentLabel: latestDocument
      ? `${latestDocument.title} / ${formatDate(latestDocument.updatedAt)}`
      : 'No documents uploaded',
    anchoredDocumentCount,
    documentRoomSummary:
      latestDocument != null
        ? `${asset.documents?.length ?? 0} document(s) in room, latest file ${latestDocument.title}.`
        : 'Document room is still empty for this asset.'
  };
}
