import { NextResponse } from 'next/server';
import { validationOrGenericError } from '@/lib/security/error-response';
import { genericErrorResponse } from '@/lib/security/error-response';
import { z } from 'zod';
import { AdminAccessScopeType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { assertActorScopeAccess } from '@/lib/security/admin-access';
import {
  getRequestIpAddress,
  resolveVerifiedAdminActorFromHeaders
} from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';
import { anchorValuationOnchain } from '@/lib/services/onchain/valuation-anchor';

const BodySchema = z.object({
  assetId: z.string().min(1, 'assetId is required'),
  assetCode: z.string().trim().min(1, 'assetCode is required'),
  valuation: z.unknown(),
  label: z.string().trim().max(64).optional()
});

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
    return validationOrGenericError(error, { message: 'Invalid request body.' });
  }

  try {
    await assertActorScopeAccess(actor, AdminAccessScopeType.ASSET, parsed.assetId, prisma);
    const result = await anchorValuationOnchain({
      assetCode: parsed.assetCode,
      valuation: parsed.valuation,
      label: parsed.label
    });

    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'onchain.valuation_anchor',
      entityType: 'OnchainRecord',
      entityId: parsed.assetId,
      assetId: parsed.assetId,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      metadata: {
        registryAssetId: result.registryAssetId,
        documentHash: result.documentHash,
        txHash: result.txHash,
        alreadyAnchored: result.alreadyAnchored,
        ipfsCid: result.ipfs?.cid ?? null
      }
    });

    return NextResponse.json(result);
  } catch (error) {
    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'onchain.valuation_anchor',
      entityType: 'OnchainRecord',
      entityId: parsed.assetId,
      assetId: parsed.assetId,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      statusLabel: 'FAILED',
      metadata: { error: error instanceof Error ? error.message : 'valuation anchor failed' }
    });
    return genericErrorResponse(error, {
      status: 400,
      message: 'Valuation anchor failed',
      context: { route: 'onchain/valuation-anchor' }
    });
  }
}
