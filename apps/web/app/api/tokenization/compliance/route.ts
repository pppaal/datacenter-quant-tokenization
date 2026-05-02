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
import {
  addModule,
  blockCountry,
  canTransferPreflight,
  getModules,
  isCountryBlocked,
  removeModule,
  unblockCountry
} from '@/lib/services/onchain/compliance';
import {
  requireDeploymentByAssetId,
  toDeploymentRow
} from '@/lib/services/onchain/tokenization-repo';

const addressRe = /^0x[a-fA-F0-9]{40}$/;

const ComplianceSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('addModule'),
    assetId: z.string().min(1),
    moduleAddress: z.string().regex(addressRe)
  }),
  z.object({
    action: z.literal('removeModule'),
    assetId: z.string().min(1),
    moduleAddress: z.string().regex(addressRe)
  }),
  z.object({
    action: z.literal('blockCountry'),
    assetId: z.string().min(1),
    countryCode: z.number().int().min(1).max(65535)
  }),
  z.object({
    action: z.literal('unblockCountry'),
    assetId: z.string().min(1),
    countryCode: z.number().int().min(1).max(65535)
  })
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
    const deployment = toDeploymentRow(row);
    const modules = await getModules(deployment);

    const previewFrom = url.searchParams.get('from');
    const previewTo = url.searchParams.get('to');
    const previewAmount = url.searchParams.get('amount');
    const countryQuery = url.searchParams.get('country');

    const result: Record<string, unknown> = { modules };

    if (previewFrom && previewTo && previewAmount) {
      result.canTransfer = await canTransferPreflight(deployment, {
        from: previewFrom,
        to: previewTo,
        amount: previewAmount
      });
    }
    if (countryQuery) {
      const code = Number(countryQuery);
      if (Number.isInteger(code) && code > 0) {
        result.countryBlocked = { code, blocked: await isCountryBlocked(deployment, code) };
      }
    }

    return NextResponse.json(result);
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
    parsed = ComplianceSchema.parse(await request.json());
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
    const metadata: Record<string, string | number> = {};
    switch (parsed.action) {
      case 'addModule':
        txHash = await addModule(deployment, parsed.moduleAddress);
        metadata.moduleAddress = parsed.moduleAddress;
        break;
      case 'removeModule':
        txHash = await removeModule(deployment, parsed.moduleAddress);
        metadata.moduleAddress = parsed.moduleAddress;
        break;
      case 'blockCountry':
        txHash = await blockCountry(deployment, parsed.countryCode);
        metadata.countryCode = parsed.countryCode;
        break;
      case 'unblockCountry':
        txHash = await unblockCountry(deployment, parsed.countryCode);
        metadata.countryCode = parsed.countryCode;
        break;
    }
    metadata.txHash = txHash;

    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: `tokenization.compliance.${parsed.action}`,
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
      action: `tokenization.compliance.${parsed.action}`,
      entityType: 'TokenizedAsset',
      entityId: parsed.assetId,
      assetId: parsed.assetId,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      statusLabel: 'FAILED',
      metadata: { error: error instanceof Error ? error.message : 'compliance write failed' }
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'compliance write failed' },
      { status: 400 }
    );
  }
}
