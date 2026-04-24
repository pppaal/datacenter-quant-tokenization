import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AdminAccessScopeType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { assertActorScopeAccess } from '@/lib/security/admin-access';
import { getRequestIpAddress, resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';
import {
  getIdentity,
  registerIdentity,
  removeIdentity,
  updateCountry
} from '@/lib/services/onchain/identity-registry';
import {
  requireDeploymentByAssetId,
  toDeploymentRow
} from '@/lib/services/onchain/tokenization-repo';

const addressRe = /^0x[a-fA-F0-9]{40}$/;
const WalletQuerySchema = z.object({ assetId: z.string().min(1), wallet: z.string().regex(addressRe) });

const RegisterSchema = z.object({
  assetId: z.string().min(1),
  wallet: z.string().regex(addressRe),
  countryCode: z.number().int().min(1).max(65535),
  action: z.enum(['register', 'updateCountry', 'remove']).default('register')
});

export async function GET(request: Request) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  if (!actor) {
    return NextResponse.json({ error: 'Active operator session required.' }, { status: 401 });
  }
  const url = new URL(request.url);
  const parsed = WalletQuerySchema.safeParse({
    assetId: url.searchParams.get('assetId') ?? '',
    wallet: url.searchParams.get('wallet') ?? ''
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  try {
    await assertActorScopeAccess(actor, AdminAccessScopeType.ASSET, parsed.data.assetId, prisma);
    const row = await requireDeploymentByAssetId(parsed.data.assetId);
    const identity = await getIdentity(toDeploymentRow(row), parsed.data.wallet);
    return NextResponse.json({ wallet: parsed.data.wallet, identity });
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
    parsed = RegisterSchema.parse(await request.json());
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
    if (parsed.action === 'register') {
      txHash = await registerIdentity(deployment, {
        wallet: parsed.wallet,
        countryCode: parsed.countryCode
      });
    } else if (parsed.action === 'updateCountry') {
      txHash = await updateCountry(deployment, {
        wallet: parsed.wallet,
        countryCode: parsed.countryCode
      });
    } else {
      txHash = await removeIdentity(deployment, parsed.wallet);
    }

    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: `tokenization.identity.${parsed.action}`,
      entityType: 'TokenizedAsset',
      entityId: row.id,
      assetId: parsed.assetId,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      metadata: { wallet: parsed.wallet, countryCode: parsed.countryCode, txHash }
    });
    return NextResponse.json({ txHash });
  } catch (error) {
    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: `tokenization.identity.${parsed.action}`,
      entityType: 'TokenizedAsset',
      entityId: parsed.assetId,
      assetId: parsed.assetId,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      statusLabel: 'FAILED',
      metadata: { error: error instanceof Error ? error.message : 'identity write failed' }
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'identity write failed' },
      { status: 400 }
    );
  }
}
