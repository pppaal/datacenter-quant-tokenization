import type { KycRecord, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  getIdentity,
  registerIdentity,
  removeIdentity,
  updateCountry
} from '@/lib/services/onchain/identity-registry';
import { getDeploymentByAssetId, toDeploymentRow } from '@/lib/services/onchain/tokenization-repo';
import { getWalletScreeningGate } from '@/lib/services/aml/screening';
import type { KycEvent } from './types';

export type PersistKycEventResult = {
  record: KycRecord;
  /**
   * `true` when the inbound event asserted the exact same status that the
   * existing `KycRecord` already reflected, so persistence was a no-op and the
   * caller should NOT re-bridge / re-assert on-chain. Always `false` for the
   * first event for an applicant (no prior record) and for any status change.
   */
  idempotentNoop: boolean;
};

/**
 * Persist a normalized KYC event as a `KycRecord` (one row per
 * provider + providerApplicantId).
 *
 * Replay/idempotency: a captured-and-replayed webhook (or a duplicate delivery)
 * that re-asserts a status the record already holds is treated as a no-op — we
 * do NOT rewrite the row or signal a status change, so the caller skips
 * re-bridging on-chain. This complements the per-provider signature/timestamp
 * freshness check: even a "fresh" duplicate within the skew window cannot
 * re-assert (e.g. re-APPROVE) a status the applicant already has.
 *
 * Limitation: idempotency is keyed on the CURRENT persisted status only (the
 * schema has no per-event nonce/event-id column). A replay that flips the
 * status back and forth (APPROVED → REVOKED → APPROVED) is still distinct from
 * the current row and will be applied; true once-only event dedup would need a
 * processed-event ledger / unique event-id column (out of scope: no migration).
 */
export async function persistKycEvent(
  event: KycEvent,
  db: PrismaClient = prisma
): Promise<PersistKycEventResult> {
  const existing = await db.kycRecord.findUnique({
    where: {
      provider_providerApplicantId: {
        provider: event.provider,
        providerApplicantId: event.providerApplicantId
      }
    }
  });

  // Idempotent no-op: the record already reflects the asserted status for the
  // same wallet + country. Skip the write and tell the caller not to re-bridge.
  if (
    existing &&
    existing.status === event.status &&
    existing.wallet === event.wallet &&
    existing.countryCode === event.countryCode
  ) {
    return { record: existing, idempotentNoop: true };
  }

  const record = await db.kycRecord.upsert({
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

  return { record, idempotentNoop: false };
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
 *
 * Sanctions gate: an APPROVED KYC alone is NOT sufficient to whitelist a wallet
 * on-chain. Any write that ADDS or KEEPS the wallet on the registry
 * (register / updateCountry) requires a CLEAR sanctions screening for that
 * wallet (`getWalletScreeningGate`, fail-closed — a missing screening blocks).
 * Removals are never gated: pulling a sanctioned wallet off-chain must always be
 * allowed.
 */
/**
 * Injectable on-chain + screening collaborators. Defaults to the real module
 * functions; tests override them to exercise the bridge's ORCHESTRATION (the
 * fail-closed sanctions gate, register/update/remove routing) without a chain
 * or a real screening store. The `db`-backed `getWalletScreeningGate` primitive
 * is covered separately in `kyc-bridge-screening-gate.test.ts`.
 */
export type BridgeKycChainDeps = {
  getDeploymentByAssetId: typeof getDeploymentByAssetId;
  toDeploymentRow: typeof toDeploymentRow;
  getIdentity: typeof getIdentity;
  registerIdentity: typeof registerIdentity;
  updateCountry: typeof updateCountry;
  removeIdentity: typeof removeIdentity;
  getWalletScreeningGate: typeof getWalletScreeningGate;
};

export async function bridgeKycToChain(
  input: {
    kycRecordId: string;
    assetId: string;
    db?: PrismaClient;
  },
  deps: Partial<BridgeKycChainDeps> = {}
): Promise<{ txHash: string | null; action: string }> {
  const db = input.db ?? prisma;
  const onchain = {
    getDeploymentByAssetId: deps.getDeploymentByAssetId ?? getDeploymentByAssetId,
    toDeploymentRow: deps.toDeploymentRow ?? toDeploymentRow,
    getIdentity: deps.getIdentity ?? getIdentity,
    registerIdentity: deps.registerIdentity ?? registerIdentity,
    updateCountry: deps.updateCountry ?? updateCountry,
    removeIdentity: deps.removeIdentity ?? removeIdentity,
    getWalletScreeningGate: deps.getWalletScreeningGate ?? getWalletScreeningGate
  };

  const record = await db.kycRecord.findUnique({ where: { id: input.kycRecordId } });
  if (!record) throw new Error(`KycRecord ${input.kycRecordId} not found`);

  const row = await onchain.getDeploymentByAssetId(input.assetId, db);
  if (!row) throw new Error(`No TokenizedAsset deployment for assetId=${input.assetId}`);
  const deployment = onchain.toDeploymentRow(row);

  if (record.status === 'PENDING') {
    return { txHash: null, action: 'noop:pending' };
  }

  const current = await onchain.getIdentity(deployment, record.wallet);

  let txHash: string | null = null;
  let action = 'noop';

  if (record.status === 'APPROVED') {
    const needsOnchainWrite = !current.registered || current.countryCode !== record.countryCode;
    if (needsOnchainWrite) {
      // Fail-closed sanctions gate before any whitelist/keep write. The AML
      // engine screens the wallet separately; an APPROVED KYC must never be
      // enough on its own to register a sanctioned holder on-chain.
      const gate = await onchain.getWalletScreeningGate(record.wallet, db);
      if (!gate.cleared) {
        throw new Error(
          `Sanctions screening required before on-chain identity registration (wallet=${record.wallet}, reason=${gate.reason}).`
        );
      }
    }

    if (!current.registered) {
      txHash = await onchain.registerIdentity(deployment, {
        wallet: record.wallet,
        countryCode: record.countryCode
      });
      action = 'register';
    } else if (current.countryCode !== record.countryCode) {
      txHash = await onchain.updateCountry(deployment, {
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
      txHash = await onchain.removeIdentity(deployment, record.wallet);
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
