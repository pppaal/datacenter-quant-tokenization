import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AdminAccessScopeType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { assertActorScopeAccess } from '@/lib/security/admin-access';
import { getRequestIpAddress, resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';
import {
  listTokenizedAssets,
  upsertTokenizedAsset
} from '@/lib/services/onchain/tokenization-repo';

const addressRe = /^0x[a-fA-F0-9]{40}$/;
const bytes32Re = /^0x[a-fA-F0-9]{64}$/;
const txHashRe = /^0x[a-fA-F0-9]{64}$/;

const UpsertSchema = z.object({
  assetId: z.string().min(1),
  chainId: z.number().int().positive(),
  registryAssetId: z.string().regex(bytes32Re, 'registryAssetId must be 32-byte hex'),
  tokenAddress: z.string().regex(addressRe),
  identityRegistryAddress: z.string().regex(addressRe),
  complianceAddress: z.string().regex(addressRe),
  maxHoldersModuleAddress: z.string().regex(addressRe).nullable().optional(),
  countryRestrictModuleAddress: z.string().regex(addressRe).nullable().optional(),
  lockupModuleAddress: z.string().regex(addressRe).nullable().optional(),
  deploymentBlock: z.number().int().nonnegative(),
  deploymentTxHash: z.string().regex(txHashRe).nullable().optional()
});

export async function GET(request: Request) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  if (!actor) {
    return NextResponse.json({ error: 'Active operator session required.' }, { status: 401 });
  }
  const rows = await listTokenizedAssets(prisma);
  return NextResponse.json({ deployments: rows });
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
    parsed = UpsertSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid body' },
      { status: 400 }
    );
  }

  try {
    await assertActorScopeAccess(actor, AdminAccessScopeType.ASSET, parsed.assetId, prisma);
    const row = await upsertTokenizedAsset(parsed);
    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'tokenization.deployment_upsert',
      entityType: 'TokenizedAsset',
      entityId: row.id,
      assetId: parsed.assetId,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      metadata: {
        chainId: parsed.chainId,
        tokenAddress: parsed.tokenAddress,
        deploymentBlock: parsed.deploymentBlock,
        deploymentTxHash: parsed.deploymentTxHash ?? null
      }
    });
    return NextResponse.json({ deployment: row });
  } catch (error) {
    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'tokenization.deployment_upsert',
      entityType: 'TokenizedAsset',
      entityId: parsed.assetId,
      assetId: parsed.assetId,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      statusLabel: 'FAILED',
      metadata: { error: error instanceof Error ? error.message : 'upsert failed' }
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'upsert failed' },
      { status: 400 }
    );
  }
}
