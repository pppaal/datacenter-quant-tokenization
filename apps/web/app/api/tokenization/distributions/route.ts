import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AdminAccessScopeType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { assertActorScopeAccess } from '@/lib/security/admin-access';
import {
  getRequestIpAddress,
  resolveVerifiedAdminActorFromHeaders
} from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';
import { draftDistribution, fundDistribution } from '@/lib/services/onchain/dividend-distributor';

const addressRe = /^0x[a-fA-F0-9]{40}$/;
const amountRe = /^\d+$/;

const DraftSchema = z.object({
  action: z.literal('draft'),
  tokenizedAssetId: z.string().min(1),
  assetId: z.string().min(1),
  distributorAddress: z.string().regex(addressRe),
  quoteAssetAddress: z.string().regex(addressRe),
  recordDate: z.string().datetime(),
  reclaimAfter: z.string().datetime(),
  allocations: z
    .array(
      z.object({
        holder: z.string().regex(addressRe),
        amount: z.string().regex(amountRe)
      })
    )
    .min(1)
    .max(5000)
});
const FundSchema = z.object({
  action: z.literal('fund'),
  assetId: z.string().min(1),
  distributionId: z.string().min(1)
});
const BodySchema = z.discriminatedUnion('action', [DraftSchema, FundSchema]);

export async function GET(request: Request) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  if (!actor) {
    return NextResponse.json({ error: 'Active operator session required.' }, { status: 401 });
  }
  const url = new URL(request.url);
  const tokenizedAssetId = url.searchParams.get('tokenizedAssetId') ?? undefined;
  const distributions = await prisma.tokenDistribution.findMany({
    where: tokenizedAssetId ? { tokenizedAssetId } : undefined,
    include: {
      allocations: { select: { id: true, holderAddress: true, amount: true, claimedAt: true } }
    },
    orderBy: { createdAt: 'desc' }
  });
  return NextResponse.json({ distributions });
}

export async function POST(request: Request) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  const ipAddress = getRequestIpAddress(request.headers);
  if (!actor) {
    return NextResponse.json({ error: 'Active operator session required.' }, { status: 401 });
  }
  let parsed;
  try {
    parsed = BodySchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid body' },
      { status: 400 }
    );
  }

  try {
    await assertActorScopeAccess(actor, AdminAccessScopeType.ASSET, parsed.assetId, prisma);
    if (parsed.action === 'draft') {
      const dist = await draftDistribution({
        tokenizedAssetId: parsed.tokenizedAssetId,
        distributorAddress: parsed.distributorAddress,
        quoteAssetAddress: parsed.quoteAssetAddress,
        recordDate: new Date(parsed.recordDate),
        reclaimAfter: new Date(parsed.reclaimAfter),
        allocations: parsed.allocations
      });
      await recordAuditEvent({
        actorIdentifier: actor.identifier,
        actorRole: actor.role,
        action: 'tokenization.distribution.draft',
        entityType: 'TokenDistribution',
        entityId: dist.id,
        assetId: parsed.assetId,
        requestPath: new URL(request.url).pathname,
        requestMethod: request.method,
        ipAddress,
        metadata: {
          merkleRoot: dist.merkleRoot,
          totalAmount: dist.totalAmount,
          allocationCount: parsed.allocations.length
        }
      });
      return NextResponse.json({ distribution: dist });
    }
    const result = await fundDistribution(parsed.distributionId);
    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'tokenization.distribution.fund',
      entityType: 'TokenDistribution',
      entityId: parsed.distributionId,
      assetId: parsed.assetId,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      metadata: { txHash: result.txHash }
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'distribution failed' },
      { status: 400 }
    );
  }
}
