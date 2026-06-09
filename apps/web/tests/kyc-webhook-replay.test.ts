import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { SumsubProvider } from '@/lib/services/kyc/sumsub-provider';
import { persistKycEvent } from '@/lib/services/kyc/bridge';
import type { KycEvent } from '@/lib/services/kyc/types';

/**
 * Replay-defense coverage for the Sumsub KYC webhook ingress:
 *
 *  1. A signed-but-STALE `ts` (outside the skew window) is rejected, so a
 *     captured valid webhook cannot be replayed indefinitely to re-assert a
 *     KYC status (e.g. re-APPROVE a since-revoked applicant).
 *  2. A replayed event that re-asserts the SAME status the record already
 *     holds is an idempotent no-op in `persistKycEvent` (no rewrite, no
 *     re-bridge signal).
 */

const SECRET = 'test-sumsub-secret';

function signedHeaders(ts: string, rawBody: string): Headers {
  const method = 'POST';
  const uri = '/api/kyc/webhook/sumsub';
  const digest = crypto
    .createHmac('sha256', SECRET)
    .update(`${ts}${method}${uri}${rawBody}`, 'utf-8')
    .digest('hex');
  return new Headers({
    'x-payload-digest-alg-ts': ts,
    'x-payload-digest': digest,
    'x-sumsub-method': method,
    'x-sumsub-uri': uri
  });
}

test('Sumsub verifySignature accepts a fresh signed timestamp', async () => {
  const provider = new SumsubProvider({ webhookSecret: SECRET, maxTimestampSkewSeconds: 300 });
  const rawBody = JSON.stringify({ hello: 'world' });
  const ts = String(Math.floor(Date.now() / 1000));
  await provider.verifySignature(rawBody, signedHeaders(ts, rawBody));
});

test('Sumsub verifySignature rejects a stale (replayed) signed timestamp', async () => {
  const provider = new SumsubProvider({ webhookSecret: SECRET, maxTimestampSkewSeconds: 300 });
  const rawBody = JSON.stringify({ hello: 'world' });
  // 10 minutes old — a correctly-signed but long-captured webhook.
  const staleTs = String(Math.floor(Date.now() / 1000) - 600);
  await assert.rejects(
    () => provider.verifySignature(rawBody, signedHeaders(staleTs, rawBody)),
    /stale or future-dated/
  );
});

test('Sumsub verifySignature rejects a future-dated signed timestamp', async () => {
  const provider = new SumsubProvider({ webhookSecret: SECRET, maxTimestampSkewSeconds: 300 });
  const rawBody = JSON.stringify({ hello: 'world' });
  const futureTs = String(Math.floor(Date.now() / 1000) + 600);
  await assert.rejects(
    () => provider.verifySignature(rawBody, signedHeaders(futureTs, rawBody)),
    /stale or future-dated/
  );
});

test('Sumsub timestamp freshness is skipped when skew is unset (local/dev escape hatch)', async () => {
  // No maxTimestampSkewSeconds → behaves like before (no freshness gate), so
  // fixtures with fixed timestamps in local/dev/e2e do not decay.
  const provider = new SumsubProvider({ webhookSecret: SECRET });
  const rawBody = JSON.stringify({ hello: 'world' });
  const staleTs = String(Math.floor(Date.now() / 1000) - 100_000);
  await provider.verifySignature(rawBody, signedHeaders(staleTs, rawBody));
});

// ---------------------------------------------------------------------------
// Idempotency: a replayed identical-status event is a no-op in persistKycEvent
// ---------------------------------------------------------------------------
type Row = {
  id: string;
  provider: string;
  providerApplicantId: string;
  wallet: string;
  countryCode: number;
  status: string;
  rawPayload: unknown;
};

function fakeKycDb(seed: Row[] = []) {
  const rows = [...seed];
  let upsertCalls = 0;
  return {
    upsertCalls: () => upsertCalls,
    kycRecord: {
      async findUnique(args: {
        where: { provider_providerApplicantId: { provider: string; providerApplicantId: string } };
      }) {
        const key = args.where.provider_providerApplicantId;
        return (
          rows.find(
            (r) => r.provider === key.provider && r.providerApplicantId === key.providerApplicantId
          ) ?? null
        );
      },
      async upsert(args: {
        where: { provider_providerApplicantId: { provider: string; providerApplicantId: string } };
        create: Omit<Row, 'id'>;
        update: Partial<Row>;
      }) {
        upsertCalls += 1;
        const key = args.where.provider_providerApplicantId;
        const existing = rows.find(
          (r) => r.provider === key.provider && r.providerApplicantId === key.providerApplicantId
        );
        if (existing) {
          Object.assign(existing, args.update);
          return existing;
        }
        const created: Row = { id: 'kyc_1', ...(args.create as Omit<Row, 'id'>) };
        rows.push(created);
        return created;
      }
    }
  };
}

const baseEvent: KycEvent = {
  provider: 'sumsub',
  providerApplicantId: 'app_1',
  wallet: '0xabcabcabcabcabcabcabcabcabcabcabcabcabca',
  countryCode: 410,
  status: 'APPROVED',
  rawPayload: { v: 1 }
};

test('persistKycEvent: a replayed identical-status event is an idempotent no-op', async () => {
  const db = fakeKycDb([
    {
      id: 'kyc_1',
      provider: baseEvent.provider,
      providerApplicantId: baseEvent.providerApplicantId,
      wallet: baseEvent.wallet,
      countryCode: baseEvent.countryCode,
      status: 'APPROVED',
      rawPayload: { v: 0 }
    }
  ]);

  const result = await persistKycEvent(baseEvent, db as never);
  assert.equal(result.idempotentNoop, true, 'replay of identical status must be a no-op');
  assert.equal(result.record.id, 'kyc_1');
  assert.equal(db.upsertCalls(), 0, 'no write should be issued on an idempotent replay');
});

test('persistKycEvent: a genuine status change is applied (not a no-op)', async () => {
  const db = fakeKycDb([
    {
      id: 'kyc_1',
      provider: baseEvent.provider,
      providerApplicantId: baseEvent.providerApplicantId,
      wallet: baseEvent.wallet,
      countryCode: baseEvent.countryCode,
      status: 'APPROVED',
      rawPayload: { v: 0 }
    }
  ]);

  const result = await persistKycEvent({ ...baseEvent, status: 'REVOKED' }, db as never);
  assert.equal(result.idempotentNoop, false);
  assert.equal(result.record.status, 'REVOKED');
  assert.equal(db.upsertCalls(), 1);
});

test('persistKycEvent: the first event for an applicant is created (not a no-op)', async () => {
  const db = fakeKycDb([]);
  const result = await persistKycEvent(baseEvent, db as never);
  assert.equal(result.idempotentNoop, false);
  assert.equal(result.record.status, 'APPROVED');
  assert.equal(db.upsertCalls(), 1);
});
