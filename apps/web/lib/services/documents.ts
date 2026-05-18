import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { generateDocumentSummary } from '@/lib/ai/openai';
import { ingestDocumentExtraction } from '@/lib/services/document-extraction';
import { autoMatchDealDocumentRequestsForAsset } from '@/lib/services/deals';
import { ingestFinancialStatement } from '@/lib/services/financial-statements';
import { promoteDocumentFactsToFeatures } from '@/lib/services/feature-promotion';
import {
  createDocumentStorageFromEnv,
  type DocumentStorageAdapter,
  type UploadableFile
} from '@/lib/storage/local';
import { documentUploadSchema } from '@/lib/validations/document';

export async function uploadDocumentVersion(
  input: unknown,
  file: UploadableFile,
  deps?: {
    db?: PrismaClient;
    storage?: DocumentStorageAdapter;
    summarizer?: typeof generateDocumentSummary;
    extractor?: typeof ingestDocumentExtraction;
    financialIngester?: typeof ingestFinancialStatement;
    promoter?: typeof promoteDocumentFactsToFeatures;
  }
) {
  const db = deps?.db ?? prisma;
  const storage = deps?.storage ?? createDocumentStorageFromEnv();
  const summarizer = deps?.summarizer ?? generateDocumentSummary;
  const extractor = deps?.extractor ?? ingestDocumentExtraction;
  const financialIngester = deps?.financialIngester ?? ingestFinancialStatement;
  const promoter = deps?.promoter ?? promoteDocumentFactsToFeatures;
  const parsed = documentUploadSchema.parse(input);

  const asset = await db.asset.findUnique({
    where: { id: parsed.assetId }
  });

  if (!asset) throw new Error('Asset not found');

  const existingDocument = parsed.documentId
    ? await db.document.findUnique({
        where: { id: parsed.documentId },
        include: {
          versions: {
            orderBy: {
              versionNumber: 'desc'
            },
            take: 1
          }
        }
      })
    : null;

  const versionNumber = existingDocument ? existingDocument.currentVersion + 1 : 1;
  const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const storageResult = await storage.save({
    assetId: parsed.assetId,
    title: parsed.title,
    versionNumber,
    file
  });

  const aiSummary = await summarizer({
    assetName: asset.name,
    title: parsed.title,
    extractedText: parsed.extractedText
  });

  const document = !existingDocument
    ? await db.document.create({
        data: {
          assetId: parsed.assetId,
          title: parsed.title,
          documentType: parsed.documentType,
          sourceLink: parsed.sourceLink,
          aiSummary,
          documentHash: hash,
          latestStoragePath: storageResult.storagePath,
          versions: {
            create: {
              versionNumber,
              fileName: file.name,
              fileType: file.type,
              fileSize: file.size,
              storagePath: storageResult.storagePath,
              sourceLink: parsed.sourceLink,
              extractedText: parsed.extractedText,
              aiSummary,
              documentHash: hash,
              uploadedById: parsed.uploadedById
            }
          }
        },
        include: {
          versions: {
            orderBy: {
              versionNumber: 'desc'
            }
          }
        }
      })
    : await db.document.update({
        where: { id: existingDocument.id },
        data: {
          title: parsed.title,
          documentType: parsed.documentType,
          currentVersion: versionNumber,
          sourceLink: parsed.sourceLink,
          aiSummary,
          documentHash: hash,
          latestStoragePath: storageResult.storagePath,
          versions: {
            create: {
              versionNumber,
              fileName: file.name,
              fileType: file.type,
              fileSize: file.size,
              storagePath: storageResult.storagePath,
              sourceLink: parsed.sourceLink,
              extractedText: parsed.extractedText,
              aiSummary,
              documentHash: hash,
              uploadedById: parsed.uploadedById
            }
          }
        },
        include: {
          versions: {
            orderBy: {
              versionNumber: 'desc'
            }
          }
        }
      });

  const latestVersion = document.versions[0];
  try {
    await autoMatchDealDocumentRequestsForAsset(
      parsed.assetId,
      {
        documentId: document.id,
        documentTitle: document.title,
        documentType: document.documentType
      },
      db,
      parsed.dealId ?? undefined
    );
  } catch {
    // Keep upload non-blocking even if deal request matching fails.
  }

  if (parsed.extractedText && latestVersion?.id) {
    try {
      await extractor({
        assetId: parsed.assetId,
        documentVersionId: latestVersion.id,
        assetName: asset.name,
        title: parsed.title,
        extractedText: parsed.extractedText
      });
      await financialIngester(
        {
          assetId: parsed.assetId,
          documentVersionId: latestVersion.id,
          assetName: asset.name,
          title: parsed.title,
          extractedText: parsed.extractedText
        },
        { db }
      );
      await promoter(latestVersion.id, db);
    } catch {
      // Keep upload non-blocking even if extraction sidecar work fails.
    }
  }

  return document;
}

export async function listDocuments(db: PrismaClient = prisma) {
  return db.document.findMany({
    include: {
      asset: {
        include: {
          featureSnapshots: {
            include: {
              values: {
                orderBy: {
                  key: 'asc'
                }
              }
            },
            orderBy: {
              snapshotDate: 'desc'
            },
            take: 12
          }
        }
      },
      versions: {
        take: 1,
        orderBy: {
          versionNumber: 'desc'
        },
        include: {
          extractionRuns: {
            orderBy: {
              createdAt: 'desc'
            },
            take: 1
          },
          facts: {
            orderBy: [{ confidenceScore: 'desc' }, { createdAt: 'asc' }],
            take: 5
          },
          financialStatements: {
            orderBy: {
              createdAt: 'desc'
            },
            take: 2,
            include: {
              counterparty: true,
              creditAssessments: {
                orderBy: {
                  createdAt: 'desc'
                },
                take: 1
              }
            }
          },
          aiInsights: {
            orderBy: {
              createdAt: 'desc'
            },
            take: 3
          }
        }
      }
    },
    orderBy: {
      updatedAt: 'desc'
    }
  });
}
