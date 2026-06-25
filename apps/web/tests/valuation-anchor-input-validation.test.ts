import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ValuationAnchorBodySchema,
  NonEmptyValuationSchema
} from '@/app/api/onchain/valuation-anchor/schema';

/**
 * POST /api/onchain/valuation-anchor anchors keccak256(canonicalize(valuation))
 * to the on-chain registry — an irreversible write. The original schema used
 * `valuation: z.unknown()`, which accepted `null`, `{}`, `[]`, `""`, `0`, etc.,
 * so a typo or empty payload would permanently anchor the hash of a meaningless
 * value that can never be un-anchored. (Only `undefined` was caught — and only
 * incidentally, by `canonicalizeToJson` throwing downstream.)
 *
 * These assertions pin the tightened schema: a valuation MUST be a non-empty
 * object or array. Network- and DB-free (pure schema check).
 */

test('valuation anchor rejects empty / scalar / null valuations', () => {
  const base = { assetId: 'asset-1', assetCode: 'DC-001' };
  for (const valuation of [null, undefined, {}, [], '', 0, false, 'just-a-string', 42]) {
    const result = ValuationAnchorBodySchema.safeParse({ ...base, valuation });
    assert.equal(
      result.success,
      false,
      `valuation ${JSON.stringify(valuation)} must be rejected before anchoring`
    );
  }
});

test('valuation anchor accepts a non-empty structured valuation', () => {
  const base = { assetId: 'asset-1', assetCode: 'DC-001' };

  const objResult = ValuationAnchorBodySchema.safeParse({
    ...base,
    valuation: { fairValueKrw: '125000000000', method: 'income', asOf: '2026-06-30' }
  });
  assert.equal(objResult.success, true);

  const arrResult = ValuationAnchorBodySchema.safeParse({
    ...base,
    valuation: [{ scenario: 'base', value: 1 }]
  });
  assert.equal(arrResult.success, true);
});

test('NonEmptyValuationSchema distinguishes empty from non-empty containers', () => {
  assert.equal(NonEmptyValuationSchema.safeParse({}).success, false);
  assert.equal(NonEmptyValuationSchema.safeParse([]).success, false);
  assert.equal(NonEmptyValuationSchema.safeParse({ a: 1 }).success, true);
  assert.equal(NonEmptyValuationSchema.safeParse([1]).success, true);
});
