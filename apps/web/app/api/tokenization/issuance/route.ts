import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AdminAccessScopeType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { assertActorScopeAccess } from '@/lib/security/admin-access';
import { getRequestIpAddress, resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';
import {
  burnTokens,
  forceTransfer,
  mintTokens,
  pauseToken,
  readTokenSupply,
  unpauseToken
} from '@/lib/services/onchain/token-issuance';
import {
  requireDeploymentByAssetId,
  toDeploymentRow
} from '@/lib/services/onchain/tokenization-repo';

const addressRe = /^0x[a-fA-F0-9]{40}$/;
const amountSchema = z.string().regex(/^\d+$/, 'amount must be a base-unit integer');

const IssuanceSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('mint'),
    assetId: z.string().min(1),
    to: z.string().regex(addressRe),
    amount: amountSchema
  }),
  z.object({
    action: z.literal('burn'),
    assetId: z.string().min(1),
    from: z.string().regex(addressRe),
    amount: amountSchema
  }),
  z.object({
    action: z.literal('forceTransfer'),
    assetId: z.string().min(1),
    from: z.string().regex(addressRe),
    to: z.string().regex(addressRe),
    amount: amountSchema
  }),
  z.object({ action: z.literal('pause'), assetId: z.string().min(1) }),
  z.object({ action: z.literal('unpause'), assetId: z.string().min(1) })
]);

export async function GET(request: Request) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  if (!actor) {
    return NextResponse.json({ error: 'Active operator session required.' }, { status: 401 });
  }
  const url = new URL(request.url);
  const assetId = url.searchParams.get('assetId');
  if (!assetId) {
    return NextResponse.json({ error: 'assetId is required' }, { status: 400 });
  }
  try {
    await assertActorScopeAccess(actor, AdminAccessScopeType.ASSET, assetId, prisma);
    const row = await requireDeploymentByAssetId(assetId);
    const supply = await readTokenSupply(toDeploymentRow(row));
    return NextResponse.json({
      deployment: row,
      supply: {
        totalSupply: supply.totalSupply.toString(),
        name: supply.name,
        symbol: supply.symbol,
        decimals: supply.decimals,
        paused: supply.paused
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'read failed' },
      { status: 400 }
    );
  }
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
    parsed = IssuanceSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid body' },
      { status: 400 }
    );
  }

  try {
    await assertActorScopeAccess(actor, AdminAccessScopeType.ASSET, parsed.assetId, prisma);
    const row = await requireDeploymentByAssetId(parsed.assetId);
    const deployment = toDeploymentRow(row);

    let txHash: string;
    const metadata: Record<string, string> = {};
    switch (parsed.action) {
      case 'mint':
        txHash = await mintTokens(deployment, { to: parsed.to, amount: parsed.amount });
        metadata.to = parsed.to;
        metadata.amount = parsed.amount;
        break;
      case 'burn':
        txHash = await burnTokens(deployment, { from: parsed.from, amount: parsed.amount });
        metadata.from = parsed.from;
        metadata.amount = parsed.amount;
        break;
      case 'forceTransfer':
        txHash = await forceTransfer(deployment, {
          from: parsed.from,
          to: parsed.to,
          amount: parsed.amount
        });
        metadata.from = parsed.from;
        metadata.to = parsed.to;
        metadata.amount = parsed.amount;
        break;
      case 'pause':
        txHash = await pauseToken(deployment);
        break;
      case 'unpause':
        txHash = await unpauseToken(deployment);
        break;
    }
    metadata.txHash = txHash;

    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: `tokenization.issuance.${parsed.action}`,
      entityType: 'TokenizedAsset',
      entityId: row.id,
      assetId: parsed.assetId,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      metadata
    });
    return NextResponse.json({ txHash });
  } catch (error) {
    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: `tokenization.issuance.${parsed.action}`,
      entityType: 'TokenizedAsset',
      entityId: parsed.assetId,
      assetId: parsed.assetId,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      statusLabel: 'FAILED',
      metadata: { error: error instanceof Error ? error.message : 'issuance failed' }
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'issuance failed' },
      { status: 400 }
    );
  }
}
