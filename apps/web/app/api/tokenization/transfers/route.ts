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
  approveTicket,
  cancelTicket,
  expireTicket,
  openTicket,
  rejectTicket,
  settleTicket
} from '@/lib/services/onchain/transfer-agent';

const addressRe = /^0x[a-fA-F0-9]{40}$/;
const bytes32Re = /^0x[a-fA-F0-9]{64}$/;
const amountRe = /^\d+$/;

const OpenSchema = z.object({
  action: z.literal('open'),
  assetId: z.string().min(1),
  tokenizedAssetId: z.string().min(1),
  transferAgentAddress: z.string().regex(addressRe),
  tokenAddress: z.string().regex(addressRe),
  sellerAddress: z.string().regex(addressRe),
  buyerAddress: z.string().regex(addressRe),
  shareAmount: z.string().regex(amountRe),
  quotePrice: z.string().regex(amountRe),
  quoteAssetSymbol: z.string().min(1).max(32),
  expiresAt: z.string().datetime().nullable(),
  rfqRef: z.string().regex(bytes32Re),
  notes: z.string().max(2000).optional()
});
const DecideSchema = z.object({
  action: z.enum(['approve', 'reject']),
  assetId: z.string().min(1),
  ticketDbId: z.string().min(1),
  reason: z.string().regex(bytes32Re).optional() // required for reject
});
const SettleSchema = z.object({
  action: z.literal('settle'),
  assetId: z.string().min(1),
  ticketDbId: z.string().min(1)
});
const CancelSchema = z.object({
  action: z.literal('cancel'),
  assetId: z.string().min(1),
  ticketDbId: z.string().min(1),
  reason: z.string().regex(bytes32Re)
});
const ExpireSchema = z.object({
  action: z.literal('expire'),
  assetId: z.string().min(1),
  ticketDbId: z.string().min(1)
});

const BodySchema = z.discriminatedUnion('action', [
  OpenSchema,
  DecideSchema,
  SettleSchema,
  CancelSchema,
  ExpireSchema
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
  const tokenizedAssetId = url.searchParams.get('tokenizedAssetId') ?? undefined;
  const status = url.searchParams.get('status') ?? undefined;
  const tickets = await prisma.transferTicket.findMany({
    where: {
      ...(tokenizedAssetId ? { tokenizedAssetId } : {}),
      ...(status ? { status } : {})
    },
    orderBy: { createdAt: 'desc' },
    take: 200
  });
  return NextResponse.json({ tickets });
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

  const requestPath = new URL(request.url).pathname;
  try {
    await assertActorScopeAccess(actor, AdminAccessScopeType.ASSET, parsed.assetId, prisma);

    if (parsed.action === 'open') {
      const ticket = await openTicket({
        tokenizedAssetId: parsed.tokenizedAssetId,
        transferAgentAddress: parsed.transferAgentAddress,
        tokenAddress: parsed.tokenAddress,
        sellerAddress: parsed.sellerAddress,
        buyerAddress: parsed.buyerAddress,
        shareAmount: parsed.shareAmount,
        quotePrice: parsed.quotePrice,
        quoteAssetSymbol: parsed.quoteAssetSymbol,
        expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
        rfqRef: parsed.rfqRef,
        openedBy: actor.identifier,
        notes: parsed.notes ?? null
      });
      await recordAuditEvent({
        actorIdentifier: actor.identifier,
        actorRole: actor.role,
        action: 'tokenization.transfer.open',
        entityType: 'TransferTicket',
        entityId: ticket.id,
        assetId: parsed.assetId,
        requestPath,
        requestMethod: request.method,
        ipAddress,
        metadata: {
          chainTicketId: ticket.ticketId,
          seller: ticket.sellerAddress,
          buyer: ticket.buyerAddress,
          amount: ticket.shareAmount,
          rfqRef: ticket.rfqRef
        }
      });
      return NextResponse.json({ ticket });
    }

    if (parsed.action === 'approve') {
      const ticket = await approveTicket(parsed.ticketDbId, actor.identifier);
      await recordAuditEvent({
        actorIdentifier: actor.identifier,
        actorRole: actor.role,
        action: 'tokenization.transfer.approve',
        entityType: 'TransferTicket',
        entityId: ticket.id,
        assetId: parsed.assetId,
        requestPath,
        requestMethod: request.method,
        ipAddress,
        metadata: { txHash: ticket.decidedTxHash }
      });
      return NextResponse.json({ ticket });
    }

    if (parsed.action === 'reject') {
      if (!parsed.reason) {
        return NextResponse.json({ error: 'reason (bytes32 hex) required for reject' }, { status: 400 });
      }
      const ticket = await rejectTicket(parsed.ticketDbId, actor.identifier, parsed.reason);
      await recordAuditEvent({
        actorIdentifier: actor.identifier,
        actorRole: actor.role,
        action: 'tokenization.transfer.reject',
        entityType: 'TransferTicket',
        entityId: ticket.id,
        assetId: parsed.assetId,
        requestPath,
        requestMethod: request.method,
        ipAddress,
        metadata: { reason: parsed.reason, txHash: ticket.decidedTxHash }
      });
      return NextResponse.json({ ticket });
    }

    if (parsed.action === 'settle') {
      const ticket = await settleTicket(parsed.ticketDbId);
      await recordAuditEvent({
        actorIdentifier: actor.identifier,
        actorRole: actor.role,
        action: 'tokenization.transfer.settle',
        entityType: 'TransferTicket',
        entityId: ticket.id,
        assetId: parsed.assetId,
        requestPath,
        requestMethod: request.method,
        ipAddress,
        metadata: { txHash: ticket.settledTxHash }
      });
      return NextResponse.json({ ticket });
    }

    if (parsed.action === 'cancel') {
      const ticket = await cancelTicket(parsed.ticketDbId, parsed.reason);
      await recordAuditEvent({
        actorIdentifier: actor.identifier,
        actorRole: actor.role,
        action: 'tokenization.transfer.cancel',
        entityType: 'TransferTicket',
        entityId: ticket.id,
        assetId: parsed.assetId,
        requestPath,
        requestMethod: request.method,
        ipAddress,
        metadata: { reason: parsed.reason, txHash: ticket.decidedTxHash }
      });
      return NextResponse.json({ ticket });
    }

    const ticket = await expireTicket(parsed.ticketDbId);
    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'tokenization.transfer.expire',
      entityType: 'TransferTicket',
      entityId: ticket.id,
      assetId: parsed.assetId,
      requestPath,
      requestMethod: request.method,
      ipAddress,
      metadata: { txHash: ticket.decidedTxHash }
    });
    return NextResponse.json({ ticket });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'transfer ticket operation failed' },
      { status: 400 }
    );
  }
}
