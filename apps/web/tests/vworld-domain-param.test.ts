import assert from 'node:assert/strict';
import test from 'node:test';
import { LiveVworldLandPricing } from '@/lib/services/public-data/live/vworld-land-price';
import { LiveVworldUseZone } from '@/lib/services/public-data/live/vworld-use-zone';

/**
 * V-World's NED data APIs reject keyed calls that omit the key's registered
 * domain with `INCORRECT_KEY` (confirmed empirically). These pin that both NED
 * adapters (a) send the `domain` query param when configured, and (b) fail
 * loud-but-soft (null, no network call) when it's missing.
 */

const PARCEL = { pnu: '1168010100107370000' } as never;

function captureFetcher(body: unknown) {
  const calls: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return {
      ok: true,
      json: async () => body
    } as Response;
  }) as typeof import('@/lib/services/public-data/fetch-with-timeout').fetchWithTimeout;
  return { calls, fetcher };
}

test('land-price adapter sends the registered domain param', async () => {
  const { calls, fetcher } = captureFetcher({
    indvdLandPrices: {
      field: [{ pnu: '1168010100107370000', stdrYear: '2024', pblntfPclnd: '10000000' }]
    }
  });
  const adapter = new LiveVworldLandPricing('test-key', undefined, 8000, 'example.com', fetcher);
  const result = await adapter.fetch(PARCEL);

  assert.equal(calls.length, 1);
  const url = new URL(calls[0]!);
  assert.equal(url.searchParams.get('domain'), 'example.com');
  assert.equal(url.searchParams.get('key'), 'test-key');
  assert.equal(result?.officialLandPriceKrwPerSqm, 10_000_000);
});

test('use-zone adapter sends the registered domain param', async () => {
  const { calls, fetcher } = captureFetcher({
    landUses: { field: [{ pnu: '1168010100107370000', prposAreaDstrcCodeNm: '일반상업지역' }] }
  });
  const adapter = new LiveVworldUseZone('test-key', undefined, 8000, 'example.com', fetcher);
  const result = await adapter.fetch(PARCEL);

  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0]!).searchParams.get('domain'), 'example.com');
  assert.equal(result?.zoningCode, 'COMMERCIAL_GENERAL');
});

test('adapters fail soft (null, NO network call) when the domain is missing', async () => {
  const land = captureFetcher({});
  const landAdapter = new LiveVworldLandPricing(
    'test-key',
    undefined,
    8000,
    undefined,
    land.fetcher
  );
  assert.equal(await landAdapter.fetch(PARCEL), null);
  assert.equal(land.calls.length, 0, 'must not call the API without a domain');

  const zone = captureFetcher({});
  const zoneAdapter = new LiveVworldUseZone('test-key', undefined, 8000, undefined, zone.fetcher);
  assert.equal(await zoneAdapter.fetch(PARCEL), null);
  assert.equal(zone.calls.length, 0, 'must not call the API without a domain');
});
