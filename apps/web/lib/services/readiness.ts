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

async function upsertDocumentHashRecord(args: {
  db: PrismaClient;
  readinessProjectId: string;
  documentId: string;
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
      documentId: args.documentId,
      recordType: 'DOCUMENT_HASH'
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
      documentId: args.documentId,
      recordType: 'DOCUMENT_HASH',
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
  const latestDocument = asset.documents[0];

  if (!latestDocument) {
    return db.readinessProject.update({
      where: { id: asset.readinessProject.id },
      data: {
        readinessStatus: ReadinessStatus.NOT_STARTED,
        nextAction: 'Upload diligence documents before packaging the review set.'
      }
    });
  }

  await upsertDocumentHashRecord({
    db,
    readinessProjectId: asset.readinessProject.id,
    documentId: latestDocument.id,
    status: ReadinessStatus.READY,
    payload: {
      assetCode: asset.assetCode,
      documentHash: latestDocument.documentHash
    }
  });

  const project = await db.readinessProject.update({
    where: { id: asset.readinessProject.id },
    data: {
      readinessStatus: ReadinessStatus.READY,
      nextAction: 'Ready for committee evidence packaging.'
    },
    include: {
      onchainRecords: true
    }
  });

  try {
    await promoteAssetSnapshotsToFeatures(assetId, db);
  } catch {
    // Readiness staging should not fail if feature promotion sidecar work fails.
  }

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

  await upsertDocumentHashRecord({
    db,
    readinessProjectId: asset.readinessProject.id,
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
