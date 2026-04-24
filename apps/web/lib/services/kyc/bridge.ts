import type { KycRecord, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  getIdentity,
  registerIdentity,
  removeIdentity,
  updateCountry
} from '@/lib/services/onchain/identity-registry';
import {
  getDeploymentByAssetId,
  toDeploymentRow
} from '@/lib/services/onchain/tokenization-repo';
import type { KycEvent } from './types';

export async function persistKycEvent(
  event: KycEvent,
  db: PrismaClient = prisma
): Promise<KycRecord> {
  return db.kycRecord.upsert({
    where: {
      provider_providerApplicantId: {
        provider: event.provider,
        providerApplicantId: event.providerApplicantId
      }
    },
    create: {
      provider: event.provider,
      providerApplicantId: event.providerApplicantId,
      wallet: event.wallet,
      countryCode: event.countryCode,
      status: event.status,
      rawPayload: event.rawPayload as object
    },
    update: {
      wallet: event.wallet,
      countryCode: event.countryCode,
      status: event.status,
      rawPayload: event.rawPayload as object
    }
  });
}

/**
 * Bridge a persisted KYC record into the on-chain `IdentityRegistry` for a
 * specific tokenized asset. Returns the tx hash when a write is performed;
 * returns `null` if the on-chain state already matches (idempotent).
 *
 * - APPROVED & not registered → registerIdentity
 * - APPROVED & registered w/ different country → updateCountry
 * - APPROVED & registered w/ same country → no-op
 * - REJECTED | REVOKED & registered → removeIdentity
 * - REJECTED | REVOKED & not registered → no-op
 * - PENDING → no-op (wait for next webhook)
 */
export async function bridgeKycToChain(input: {
  kycRecordId: string;
  assetId: string;
  db?: PrismaClient;
}): Promise<{ txHash: string | null; action: string }> {
  const db = input.db ?? prisma;
  const record = await db.kycRecord.findUnique({ where: { id: input.kycRecordId } });
  if (!record) throw new Error(`KycRecord ${input.kycRecordId} not found`);

  const row = await getDeploymentByAssetId(input.assetId, db);
  if (!row) throw new Error(`No TokenizedAsset deployment for assetId=${input.assetId}`);
  const deployment = toDeploymentRow(row);

  if (record.status === 'PENDING') {
    return { txHash: null, action: 'noop:pending' };
  }

  const current = await getIdentity(deployment, record.wallet);

  let txHash: string | null = null;
  let action = 'noop';

  if (record.status === 'APPROVED') {
    if (!current.registered) {
      txHash = await registerIdentity(deployment, {
        wallet: record.wallet,
        countryCode: record.countryCode
      });
      action = 'register';
    } else if (current.countryCode !== record.countryCode) {
      txHash = await updateCountry(deployment, {
        wallet: record.wallet,
        countryCode: record.countryCode
      });
      action = 'updateCountry';
    } else {
      action = 'noop:already-registered';
    }
  } else {
    // REJECTED / REVOKED
    if (current.registered) {
      txHash = await removeIdentity(deployment, record.wallet);
      action = 'remove';
    } else {
      action = 'noop:already-unregistered';
    }
  }

  if (txHash) {
    await db.kycRecord.update({
      where: { id: record.id },
      data: {
        bridgedTokenizedAssetId: row.id,
        bridgedAt: new Date(),
        bridgedTxHash: txHash
      }
    });
  }

  return { txHash, action };
}
