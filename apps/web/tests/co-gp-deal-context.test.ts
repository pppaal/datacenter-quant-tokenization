import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dealToIcMemoDraftInput, type DealForCoGp } from '@/lib/services/co-gp/deal-context';

test('maps deal scalars and prefers agreed price over bid over seller guidance', () => {
  const deal: DealForCoGp = {
    dealCode: 'DC-1',
    title: 'Yeouido Tower',
    market: 'Seoul',
    assetClass: 'OFFICE',
    stage: 'DILIGENCE',
    headline: '계약 임박',
    purchasePriceKrw: 250_000_000_000,
    bidGuidanceKrw: 240_000_000_000,
    sellerGuidanceKrw: 260_000_000_000,
    asset: { documents: [{ title: 'IM', aiSummary: '데이터센터 후보' }] }
  };
  const input = dealToIcMemoDraftInput(deal);
  assert.equal(input.dealCode, 'DC-1');
  assert.equal(input.assetName, 'Yeouido Tower');
  assert.equal(input.market, 'Seoul');
  assert.equal(input.stage, 'DILIGENCE');
  assert.equal(input.purchasePriceKrw, 250_000_000_000); // agreed price wins
  assert.equal(input.recentActivity, '계약 임박');
  assert.deepEqual(input.documents, [{ title: 'IM', summary: '데이터센터 후보' }]);
});

test('falls back through bid → seller guidance when price is absent', () => {
  assert.equal(
    dealToIcMemoDraftInput({
      dealCode: 'DC-2',
      title: 'A',
      bidGuidanceKrw: 100,
      sellerGuidanceKrw: 200
    }).purchasePriceKrw,
    100
  );
  assert.equal(
    dealToIcMemoDraftInput({ dealCode: 'DC-3', title: 'A', sellerGuidanceKrw: 200 })
      .purchasePriceKrw,
    200
  );
  assert.equal(dealToIcMemoDraftInput({ dealCode: 'DC-4', title: 'A' }).purchasePriceKrw, null);
});

test('caps context documents at six and tolerates a missing asset', () => {
  const docs = Array.from({ length: 9 }, (_, i) => ({ title: `D${i}`, aiSummary: null }));
  const withDocs = dealToIcMemoDraftInput({
    dealCode: 'DC-5',
    title: 'A',
    asset: { documents: docs }
  });
  assert.equal(withDocs.documents!.length, 6);

  const noAsset = dealToIcMemoDraftInput({ dealCode: 'DC-6', title: 'A' });
  assert.deepEqual(noAsset.documents, []);
});
