import { NextResponse } from 'next/server';
import type { Abi, Address } from 'viem';
import { dataCenterAssetRegistryAbi } from '@/lib/blockchain/abi';
import { getRegistryChainClients } from '@/lib/blockchain/client';
import { isTokenizationMockMode } from '@/lib/blockchain/mock-mode';
import {
  assetTokenAbi,
  modularComplianceAbi,
  dividendDistributorAbi,
  transferAgentAbi
} from '@/lib/blockchain/tokenization-abi';
import { recordAuditEvent } from '@/lib/services/audit';
import {
  indexOnchainEvents,
  type IndexerTarget
} from '@/lib/services/onchain/event-indexer';
import { prisma } from '@/lib/db/prisma';

function isAuthorized(request: Request, expectedToken: string) {
  const bearer = request.headers
    .get('authorization')
    ?.replace(/^Bearer\s+/i, '')
    .trim();
  const headerToken = request.headers.get('x-ops-cron-token')?.trim();
  return bearer === expectedToken || headerToken === expectedToken;
}

async function buildTargets(): Promise<IndexerTarget[]> {
  if (isTokenizationMockMode()) return [];

  const targets: IndexerTarget[] = [];
  const { config } = getRegistryChainClients();

  targets.push({
    contractAddress: config.registryAddress,
    abi: dataCenterAssetRegistryAbi as unknown as Abi,
    label: 'registry'
  });

  const tokenized = await prisma.tokenizedAsset.findMany({
    where: { chainId: config.chainId },
    select: {
      tokenAddress: true,
      complianceAddress: true
    }
  });
  for (const row of tokenized) {
    targets.push({
      contractAddress: row.tokenAddress as Address,
      abi: assetTokenAbi as unknown as Abi,
      label: 'asset-token'
    });
    targets.push({
      contractAddress: row.complianceAddress as Address,
      abi: modularComplianceAbi as unknown as Abi,
      label: 'compliance'
    });
  }

  const distributions = await prisma.tokenDistribution.findMany({
    where: { chainId: config.chainId },
    distinct: ['distributorAddress'],
    select: { distributorAddress: true }
  });
  for (const row of distributions) {
    targets.push({
      contractAddress: row.distributorAddress as Address,
      abi: dividendDistributorAbi as unknown as Abi,
      label: 'distributor'
    });
  }

  const tickets = await prisma.transferTicket.findMany({
    where: { chainId: config.chainId },
    distinct: ['transferAgentAddress'],
    select: { transferAgentAddress: true }
  });
  for (const row of tickets) {
    targets.push({
      contractAddress: row.transferAgentAddress as Address,
      abi: transferAgentAbi as unknown as Abi,
      label: 'transfer-agent'
    });
  }

  return targets;
}

export async function POST(request: Request) {
  const expectedToken = process.env.OPS_CRON_TOKEN?.trim();
  if (!expectedToken) {
    return NextResponse.json({ error: 'OPS_CRON_TOKEN is not configured' }, { status: 503 });
  }
  if (!isAuthorized(request, expectedToken)) {
    return NextResponse.json({ error: 'Unauthorized cron trigger' }, { status: 401 });
  }

  try {
    const targets = await buildTargets();
    const results = await indexOnchainEvents({ targets });
    const totalInserted = results.reduce((sum, r) => sum + r.inserted, 0);
    const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);

    await recordAuditEvent({
      actorIdentifier: 'ops-cron',
      actorRole: 'SYSTEM',
      action: 'onchain.index.scheduled',
      entityType: 'OnchainEvent',
      requestPath: '/api/ops/index-onchain-events',
      requestMethod: 'POST',
      statusLabel: 'OK',
      metadata: {
        targetCount: targets.length,
        inserted: totalInserted,
        skipped: totalSkipped
      }
    });

    return NextResponse.json({
      ok: true,
      targetCount: targets.length,
      inserted: totalInserted,
      skipped: totalSkipped,
      results: results.map((r) => ({
        contract: r.contractAddress,
        label: r.label,
        fromBlock: r.fromBlock.toString(),
        toBlock: r.toBlock.toString(),
        inserted: r.inserted,
        skipped: r.skipped
      }))
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to run onchain indexer';
    await recordAuditEvent({
      actorIdentifier: 'ops-cron',
      actorRole: 'SYSTEM',
      action: 'onchain.index.scheduled',
      entityType: 'OnchainEvent',
      requestPath: '/api/ops/index-onchain-events',
      requestMethod: 'POST',
      statusLabel: 'FAILED',
      metadata: { error: message }
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
