import { Prisma, ReadinessStatus, type PrismaClient } from '@prisma/client';
import { dataCenterAssetRegistryAbi } from '@/lib/blockchain/abi';
import { getRegistryChainClients } from '@/lib/blockchain/client';
import {
  buildRegistryAssetId,
  buildRegistryMetadataRef,
  normalizeDocumentHash
} from '@/lib/blockchain/registry';
import { prisma } from '@/lib/db/prisma';
import { promoteAssetSnapshotsToFeatures } from '@/lib/services/feature-promotion';
import { buildReviewPacketManifest } from '@/lib/services/review';

export async function listReadinessProjects(db: PrismaClient = prisma) {
  return db.readinessProject.findMany({
    include: {
      asset: true,
      onchainRecords: {
        include: {
          document: true
        },
        orderBy: {
          createdAt: 'desc'
        }
      }
    },
    orderBy: {
      updatedAt: 'desc'
    }
  });
}

async function getReadinessAssetContext(assetId: string, db: PrismaClient) {
  return db.asset.findUnique({
    where: { id: assetId },
    include: {
      energySnapshot: true,
      permitSnapshot: true,
      ownershipRecords: {
        orderBy: {
          updatedAt: 'desc'
        }
      },
      encumbranceRecords: {
        orderBy: {
          updatedAt: 'desc'
        }
      },
      planningConstraints: {
        orderBy: {
          updatedAt: 'desc'
        }
      },
      leases: {
        orderBy: {
          updatedAt: 'desc'
        }
      },
      featureSnapshots: {
        orderBy: {
          snapshotDate: 'desc'
        },
        take: 16
      },
      valuations: {
        orderBy: {
          createdAt: 'desc'
        },
        take: 1
      },
      documents: {
        orderBy: {
          updatedAt: 'desc'
        },
        take: 1
      },
      readinessProject: {
        include: {
          onchainRecords: {
            orderBy: {
              createdAt: 'desc'
            }
          }
        }
      }
    }
  });
}

async function upsertReadinessRecord(args: {
  db: PrismaClient;
  readinessProjectId: string;
  recordType: string;
  documentId?: string | null;
  status: ReadinessStatus;
  payload: Record<string, unknown>;
  txHash?: string | null;
  chainId?: string | null;
  anchoredAt?: Date | null;
}) {
  const payload = args.payload as Prisma.InputJsonValue;
  const existing = await args.db.onchainRecord.findFirst({
    where: {
      readinessProjectId: args.readinessProjectId,
      documentId: args.documentId ?? null,
      recordType: args.recordType
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  if (existing) {
    return args.db.onchainRecord.update({
      where: { id: existing.id },
      data: {
        status: args.status,
        payload,
        txHash: args.txHash ?? existing.txHash,
        chainId: args.chainId ?? existing.chainId,
        anchoredAt: args.anchoredAt ?? existing.anchoredAt
      }
    });
  }

  return args.db.onchainRecord.create({
    data: {
      readinessProjectId: args.readinessProjectId,
      documentId: args.documentId ?? null,
      recordType: args.recordType,
      status: args.status,
      payload,
      txHash: args.txHash,
      chainId: args.chainId,
      anchoredAt: args.anchoredAt
    }
  });
}

export async function stageReviewReadiness(assetId: string, db: PrismaClient = prisma) {
  const asset = await getReadinessAssetContext(assetId, db);

  if (!asset || !asset.readinessProject) throw new Error('Readiness project not found');
  try {
    await promoteAssetSnapshotsToFeatures(assetId, db);
  } catch {
    // Readiness staging should not fail if feature promotion sidecar work fails.
  }

  const refreshedAsset = await getReadinessAssetContext(assetId, db);
  if (!refreshedAsset || !refreshedAsset.readinessProject) throw new Error('Readiness project not found');
  const latestDocument = refreshedAsset.documents[0];
  const latestValuation = refreshedAsset.valuations[0];
  const latestFeatureSnapshot = refreshedAsset.featureSnapshots[0];
  const packet = buildReviewPacketManifest(refreshedAsset as Parameters<typeof buildReviewPacketManifest>[0]);
  const packetPayload = {
    assetCode: refreshedAsset.assetCode,
    packetFingerprint: packet.fingerprint,
    approvedEvidenceCount: packet.reviewSummary.totals.approved,
    pendingEvidenceCount: packet.reviewSummary.totals.pending,
    rejectedEvidenceCount: packet.reviewSummary.totals.rejected,
    latestValuationId: latestValuation?.id ?? null,
    latestValuationRunLabel: latestValuation?.runLabel ?? null,
    latestDocumentHash: latestDocument?.documentHash ?? null,
    latestFeatureSnapshotId: latestFeatureSnapshot?.id ?? null,
    manifest: packet.manifest
  };

  await upsertReadinessRecord({
    db,
    readinessProjectId: refreshedAsset.readinessProject.id,
    recordType: 'REVIEW_PACKET',
    status: latestDocument ? ReadinessStatus.READY : ReadinessStatus.NOT_STARTED,
    payload: packetPayload
  });

  if (!latestDocument) {
    return db.readinessProject.update({
      where: { id: refreshedAsset.readinessProject.id },
      data: {
        readinessStatus: ReadinessStatus.NOT_STARTED,
        nextAction: 'Upload diligence documents before packaging the review set.',
        reviewPhase: 'Evidence review'
      }
    });
  }

  await upsertReadinessRecord({
    db,
    readinessProjectId: refreshedAsset.readinessProject.id,
    recordType: 'DOCUMENT_HASH',
    documentId: latestDocument.id,
    status: ReadinessStatus.READY,
    payload: {
      assetCode: refreshedAsset.assetCode,
      documentHash: latestDocument.documentHash,
      packetFingerprint: packet.fingerprint
    }
  });

  const project = await db.readinessProject.update({
    where: { id: refreshedAsset.readinessProject.id },
    data: {
      readinessStatus: ReadinessStatus.READY,
      nextAction: 'Ready for committee evidence packaging.',
      reviewPhase: 'Evidence packaged'
    },
    include: {
      onchainRecords: true
    }
  });

  return project;
}

export async function registerAssetOnchain(assetId: string, db: PrismaClient = prisma) {
  const asset = await getReadinessAssetContext(assetId, db);
  if (!asset || !asset.readinessProject) throw new Error('Readiness project not found');

  const { config, account, publicClient, walletClient } = getRegistryChainClients();
  const registryAssetId = buildRegistryAssetId(asset.assetCode);
  const metadataRef = buildRegistryMetadataRef(asset.id, config.metadataBaseUrl);
  const onchainAsset = await publicClient.readContract({
    address: config.registryAddress,
    abi: dataCenterAssetRegistryAbi,
    functionName: 'assets',
    args: [registryAssetId]
  });
  const isActive = onchainAsset[2];
  let txHash: string | null = null;

  if (!isActive || onchainAsset[1] !== metadataRef) {
    const simulation = await publicClient.simulateContract({
      account,
      address: config.registryAddress,
      abi: dataCenterAssetRegistryAbi,
      functionName: isActive ? 'updateAssetMetadata' : 'registerAsset',
      args: [registryAssetId, metadataRef]
    });

    txHash = await walletClient.writeContract(simulation.request);
    await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
  }

  await db.readinessProject.update({
    where: { id: asset.readinessProject.id },
    data: {
      chainName: config.chainName,
      readinessStatus: asset.documents[0] ? ReadinessStatus.READY : ReadinessStatus.NOT_STARTED,
      nextAction: asset.documents[0]
        ? 'Asset registered onchain. Anchor the latest document hash when diligence is ready.'
        : 'Asset registered onchain. Upload a diligence document before anchoring.'
    }
  });

  if (txHash) {
    await db.onchainRecord.create({
      data: {
        readinessProjectId: asset.readinessProject.id,
        recordType: isActive ? 'ASSET_METADATA_UPDATED' : 'ASSET_REGISTERED',
        status: ReadinessStatus.ANCHORED,
        txHash,
        chainId: String(config.chainId),
        anchoredAt: new Date(),
        payload: {
          assetCode: asset.assetCode,
          registryAssetId,
          metadataRef,
          registryAddress: config.registryAddress,
          submittedBy: account.address
        }
      }
    });
  }

  return {
    assetId: asset.id,
    registryAssetId,
    metadataRef,
    txHash,
    chainName: config.chainName,
    registryAddress: config.registryAddress
  };
}

export async function anchorLatestDocumentOnchain(assetId: string, db: PrismaClient = prisma) {
  const asset = await getReadinessAssetContext(assetId, db);
  if (!asset || !asset.readinessProject) throw new Error('Readiness project not found');

  const latestDocument = asset.documents[0];
  if (!latestDocument) {
    throw new Error('Upload a diligence document before anchoring its hash onchain.');
  }

  await stageReviewReadiness(assetId, db);

  const { config, account, publicClient, walletClient } = getRegistryChainClients();
  const registryAssetId = buildRegistryAssetId(asset.assetCode);
  const normalizedDocumentHash = normalizeDocumentHash(latestDocument.documentHash);
  const onchainAsset = await publicClient.readContract({
    address: config.registryAddress,
    abi: dataCenterAssetRegistryAbi,
    functionName: 'assets',
    args: [registryAssetId]
  });

  if (!onchainAsset[2]) {
    throw new Error('Asset is not registered onchain yet. Register it before anchoring documents.');
  }

  const alreadyAnchored = await publicClient.readContract({
    address: config.registryAddress,
    abi: dataCenterAssetRegistryAbi,
    functionName: 'anchoredDocumentHashes',
    args: [registryAssetId, normalizedDocumentHash]
  });

  let txHash: string | null = null;

  if (!alreadyAnchored) {
    const simulation = await publicClient.simulateContract({
      account,
      address: config.registryAddress,
      abi: dataCenterAssetRegistryAbi,
      functionName: 'anchorDocumentHash',
      args: [registryAssetId, normalizedDocumentHash]
    });

    txHash = await walletClient.writeContract(simulation.request);
    await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
  }

  await upsertReadinessRecord({
    db,
    readinessProjectId: asset.readinessProject.id,
    recordType: 'DOCUMENT_HASH',
    documentId: latestDocument.id,
    status: ReadinessStatus.ANCHORED,
    payload: {
      assetCode: asset.assetCode,
      registryAssetId,
      documentHash: normalizedDocumentHash,
      documentTitle: latestDocument.title,
      registryAddress: config.registryAddress,
      alreadyAnchored
    },
    txHash,
    chainId: String(config.chainId),
    anchoredAt: new Date()
  });

  await db.readinessProject.update({
    where: { id: asset.readinessProject.id },
    data: {
      chainName: config.chainName,
      readinessStatus: ReadinessStatus.ANCHORED,
      nextAction: alreadyAnchored
        ? 'Latest document hash already anchored onchain.'
        : 'Latest document hash anchored onchain.'
    }
  });

  return {
    assetId: asset.id,
    documentId: latestDocument.id,
    documentHash: normalizedDocumentHash,
    registryAssetId,
    txHash,
    chainName: config.chainName,
    registryAddress: config.registryAddress,
    alreadyAnchored
  };
}
