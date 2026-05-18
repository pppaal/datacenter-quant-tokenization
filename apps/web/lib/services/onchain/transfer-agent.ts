/**
 * Web-side service for the `TransferAgent` contract (OTC pre-clearance / RFQ).
 *
 * Responsibilities:
 *   - open  → call `openTicket` on-chain and mirror the row in `TransferTicket`
 *   - decide → call `approveTicket` / `rejectTicket`
 *   - settle → call `settle` and mark the row SETTLED with the settlement tx
 *   - cancel → operator-side withdrawal before issuer decision
 *   - expire → anyone can persist the Expired terminal state after `expiresAt`
 *
 * The on-chain contract is authoritative; this service keeps the mirror in
 * step so admin UIs and RFQ workflows don't have to do log-scraping.
 */
import type { PrismaClient, TransferTicket } from '@prisma/client';
import type { Address, Hex } from 'viem';
import { stringToHex, encodeEventTopics, decodeEventLog } from 'viem';
import { transferAgentAbi } from '@/lib/blockchain/tokenization-abi';
import { getRegistryChainClients } from '@/lib/blockchain/client';
import { buildMockTxHash, isTokenizationMockMode } from '@/lib/blockchain/mock-mode';
import { awaitTxReceipt } from '@/lib/blockchain/tx';
import { prisma } from '@/lib/db/prisma';
import { ensureAddress, ensureBytes32 } from './tokenization-client';

export type OpenTicketInput = {
  tokenizedAssetId: string;
  transferAgentAddress: string;
  tokenAddress: string;
  sellerAddress: string;
  buyerAddress: string;
  shareAmount: string; // base units
  quotePrice: string; // informational
  quoteAssetSymbol: string; // e.g. "KRW" — encoded to bytes32 on-chain
  expiresAt: Date | null;
  rfqRef: string; // bytes32 hex, 0x-prefixed
  openedBy: string;
  notes?: string | null;
};

function coerceQuoteSymbol(symbol: string): Hex {
  const trimmed = symbol.trim();
  if (trimmed.length === 0 || trimmed.length > 32) {
    throw new Error('quoteAssetSymbol must be 1-32 characters');
  }
  return stringToHex(trimmed, { size: 32 });
}

function coerceExpiry(expiresAt: Date | null): bigint {
  if (expiresAt === null) return 0n;
  const seconds = Math.floor(expiresAt.getTime() / 1000);
  if (seconds <= 0) return 0n;
  return BigInt(seconds);
}

export async function openTicket(
  input: OpenTicketInput,
  db: PrismaClient = prisma
): Promise<TransferTicket> {
  const agent = ensureAddress(input.transferAgentAddress, 'transferAgentAddress');
  const token = ensureAddress(input.tokenAddress, 'tokenAddress');
  const seller = ensureAddress(input.sellerAddress, 'sellerAddress');
  const buyer = ensureAddress(input.buyerAddress, 'buyerAddress');
  const rfqRef = ensureBytes32(input.rfqRef, 'rfqRef');
  if (seller.toLowerCase() === buyer.toLowerCase()) {
    throw new Error('sellerAddress and buyerAddress must differ');
  }
  const shareAmount = BigInt(input.shareAmount);
  if (shareAmount <= 0n) throw new Error('shareAmount must be > 0');
  const quotePrice = BigInt(input.quotePrice);
  if (quotePrice < 0n) throw new Error('quotePrice must be >= 0');

  const tokenizedAsset = await db.tokenizedAsset.findUnique({
    where: { id: input.tokenizedAssetId }
  });
  if (!tokenizedAsset) throw new Error(`TokenizedAsset ${input.tokenizedAssetId} not found`);

  let txHash: Hex;
  let chainTicketId: number;
  if (isTokenizationMockMode()) {
    txHash = buildMockTxHash('openTicket', agent, token, seller, buyer, shareAmount.toString());
    const existingMax = await db.transferTicket.aggregate({
      where: { transferAgentAddress: agent },
      _max: { ticketId: true }
    });
    chainTicketId = (existingMax._max.ticketId ?? 0) + 1;
  } else {
    const clients = getRegistryChainClients();
    if (clients.config.chainId !== tokenizedAsset.chainId) {
      throw new Error(
        `Chain mismatch: BLOCKCHAIN_CHAIN_ID=${clients.config.chainId} but deployment is on ${tokenizedAsset.chainId}`
      );
    }

    txHash = await clients.walletClient.writeContract({
      address: agent,
      abi: transferAgentAbi,
      functionName: 'openTicket',
      args: [
        token,
        seller,
        buyer,
        shareAmount,
        quotePrice,
        coerceQuoteSymbol(input.quoteAssetSymbol),
        coerceExpiry(input.expiresAt),
        rfqRef as Hex
      ]
    });
    const receipt = await awaitTxReceipt(clients.publicClient, txHash, { label: 'openTicket' });

    const topic = encodeEventTopics({
      abi: transferAgentAbi,
      eventName: 'TicketOpened'
    })[0];
    let parsedChainTicketId: number | null = null;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== agent.toLowerCase()) continue;
      if (log.topics[0] !== topic) continue;
      const decoded = decodeEventLog({
        abi: transferAgentAbi,
        data: log.data,
        topics: log.topics,
        eventName: 'TicketOpened'
      });
      parsedChainTicketId = Number((decoded.args as { ticketId: bigint }).ticketId);
      break;
    }
    if (parsedChainTicketId === null) {
      throw new Error('openTicket tx succeeded but TicketOpened log was not found');
    }
    chainTicketId = parsedChainTicketId;
  }

  return db.transferTicket.create({
    data: {
      tokenizedAssetId: input.tokenizedAssetId,
      chainId: tokenizedAsset.chainId,
      transferAgentAddress: agent,
      ticketId: chainTicketId,
      tokenAddress: token,
      sellerAddress: seller.toLowerCase(),
      buyerAddress: buyer.toLowerCase(),
      shareAmount: shareAmount.toString(),
      quotePrice: quotePrice.toString(),
      quoteAssetSymbol: input.quoteAssetSymbol.trim(),
      rfqRef,
      status: 'PENDING',
      expiresAt: input.expiresAt,
      openedBy: input.openedBy,
      openedTxHash: txHash,
      notes: input.notes ?? null
    }
  });
}

async function mutateTicketStatus(params: {
  ticketDbId: string;
  targetStatus: 'APPROVED' | 'REJECTED' | 'SETTLED' | 'CANCELLED' | 'EXPIRED';
  functionName: 'approveTicket' | 'rejectTicket' | 'settle' | 'cancelTicket' | 'expireTicket';
  extraArgs?: unknown[];
  decidedBy?: string;
  allowFromStatuses: Array<TransferTicket['status']>;
  db: PrismaClient;
}) {
  const {
    ticketDbId,
    targetStatus,
    functionName,
    extraArgs = [],
    decidedBy,
    allowFromStatuses,
    db
  } = params;
  const ticket = await db.transferTicket.findUnique({ where: { id: ticketDbId } });
  if (!ticket) throw new Error(`TransferTicket ${ticketDbId} not found`);
  if (!allowFromStatuses.includes(ticket.status)) {
    throw new Error(
      `TransferTicket ${ticketDbId} is ${ticket.status}; expected one of ${allowFromStatuses.join('/')}`
    );
  }

  let txHash: Hex;
  if (isTokenizationMockMode()) {
    txHash = buildMockTxHash(functionName, ticket.transferAgentAddress, ticket.ticketId);
  } else {
    const clients = getRegistryChainClients();
    if (clients.config.chainId !== ticket.chainId) {
      throw new Error(
        `Chain mismatch: BLOCKCHAIN_CHAIN_ID=${clients.config.chainId} but ticket is on ${ticket.chainId}`
      );
    }
    txHash = await clients.walletClient.writeContract({
      address: ticket.transferAgentAddress as Address,
      abi: transferAgentAbi,
      functionName,
      args: [BigInt(ticket.ticketId), ...extraArgs] as readonly unknown[]
    });
    await awaitTxReceipt(clients.publicClient, txHash, { label: functionName });
  }

  const updates: Partial<TransferTicket> = { status: targetStatus };
  if (functionName === 'approveTicket' || functionName === 'rejectTicket') {
    updates.decidedBy = decidedBy ?? null;
    updates.decidedTxHash = txHash;
  } else if (functionName === 'settle') {
    updates.settledTxHash = txHash;
  } else if (functionName === 'cancelTicket' || functionName === 'expireTicket') {
    updates.decidedTxHash = txHash;
  }

  return db.transferTicket.update({ where: { id: ticketDbId }, data: updates });
}

export function approveTicket(ticketDbId: string, decidedBy: string, db: PrismaClient = prisma) {
  return mutateTicketStatus({
    ticketDbId,
    targetStatus: 'APPROVED',
    functionName: 'approveTicket',
    decidedBy,
    allowFromStatuses: ['PENDING'],
    db
  });
}

export function rejectTicket(
  ticketDbId: string,
  decidedBy: string,
  reason: string,
  db: PrismaClient = prisma
) {
  const reasonBytes = ensureBytes32(reason, 'reason');
  return mutateTicketStatus({
    ticketDbId,
    targetStatus: 'REJECTED',
    functionName: 'rejectTicket',
    extraArgs: [reasonBytes],
    decidedBy,
    allowFromStatuses: ['PENDING'],
    db
  });
}

export function cancelTicket(ticketDbId: string, reason: string, db: PrismaClient = prisma) {
  const reasonBytes = ensureBytes32(reason, 'reason');
  return mutateTicketStatus({
    ticketDbId,
    targetStatus: 'CANCELLED',
    functionName: 'cancelTicket',
    extraArgs: [reasonBytes],
    allowFromStatuses: ['PENDING'],
    db
  });
}

export function settleTicket(ticketDbId: string, db: PrismaClient = prisma) {
  return mutateTicketStatus({
    ticketDbId,
    targetStatus: 'SETTLED',
    functionName: 'settle',
    allowFromStatuses: ['APPROVED'],
    db
  });
}

export function expireTicket(ticketDbId: string, db: PrismaClient = prisma) {
  return mutateTicketStatus({
    ticketDbId,
    targetStatus: 'EXPIRED',
    functionName: 'expireTicket',
    allowFromStatuses: ['PENDING', 'APPROVED'],
    db
  });
}
