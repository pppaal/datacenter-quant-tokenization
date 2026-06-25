import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LiveKepcoGridAccess } from '@/lib/services/public-data/live/kepco-grid';
import type { LatLng, ParcelIdentifier } from '@/lib/services/public-data/types';

/**
 * The KEPCO grid adapter picks the nearest substation by haversine distance from
 * a local CSV/JSON snapshot (no network). A malformed CSV row parses to NaN
 * lat/lng; because `d < NaN` is always false, such a row would otherwise stay
 * "best" forever and poison selection. The CSV path must drop non-finite-
 * coordinate rows (matching the JSON path).
 */

const PARCEL: ParcelIdentifier = { jibunAddress: 'x', roadAddress: null, pnu: '1'.repeat(19) };
const LOCATION: LatLng = { latitude: 37.5, longitude: 127.0 };

async function withCsv(body: string, fn: (path: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'kepco-grid-'));
  const file = join(dir, 'substations.csv');
  await writeFile(file, body, 'utf-8');
  try {
    await fn(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('CSV snapshot with a malformed first row still selects the valid nearest substation', async () => {
  const csv = [
    'name,lat,lng,availableCapacityMw,tariffKrwPerKwh,fiber,renewablePct',
    'BadRow,not-a-number,,,,,', // garbled coords -> NaN, must be dropped
    'GoodNear,37.50,127.00,50,120,true,30',
    'FarAway,35.10,129.00,80,110,false,10'
  ].join('\n');

  await withCsv(csv, async (path) => {
    const adapter = new LiveKepcoGridAccess(path, undefined);
    const result = await adapter.fetch(PARCEL, LOCATION);
    assert.ok(result, 'expected a grid-access record');
    assert.equal(result!.nearestSubstationName, 'GoodNear');
    assert.equal(result!.nearestSubstationDistanceKm, 0);
    assert.equal(result!.availableCapacityMw, 50);
  });
});

test('CSV snapshot with only malformed rows yields no record (filtered out)', async () => {
  const csv = [
    'name,lat,lng,availableCapacityMw,tariffKrwPerKwh,fiber,renewablePct',
    'BadRow,NaN,NaN,,,,'
  ].join('\n');

  await withCsv(csv, async (path) => {
    const adapter = new LiveKepcoGridAccess(path, undefined);
    const result = await adapter.fetch(PARCEL, LOCATION);
    assert.equal(result, null);
  });
});

test('valid CSV snapshot picks the closest of several real substations', async () => {
  const csv = [
    'name,lat,lng,availableCapacityMw,tariffKrwPerKwh,fiber,renewablePct',
    'Gangnam,37.50,127.03,40,120,true,25',
    'Yeouido,37.52,126.92,60,118,true,15'
  ].join('\n');

  await withCsv(csv, async (path) => {
    const adapter = new LiveKepcoGridAccess(path, undefined);
    // Query right at Gangnam — it must win over Yeouido.
    const result = await adapter.fetch(PARCEL, { latitude: 37.5, longitude: 127.03 });
    assert.equal(result!.nearestSubstationName, 'Gangnam');
  });
});
