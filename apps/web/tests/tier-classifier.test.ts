import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetClass } from '@prisma/client';
import { classifyAssetTier } from '@/lib/services/research/tier-classifier';

test('classifyAssetTier maps explicit Prime / Grade A / Grade B from comparableType', () => {
  assert.equal(classifyAssetTier({ comparableType: 'Office Prime' }), 'PRIME');
  assert.equal(classifyAssetTier({ comparableType: 'Grade A office' }), 'GRADE_A');
  assert.equal(classifyAssetTier({ comparableType: 'Class A office Yeouido' }), 'GRADE_A');
  assert.equal(classifyAssetTier({ comparableType: 'Grade B mid-cycle office' }), 'GRADE_B');
});

test('classifyAssetTier handles Korean tier names', () => {
  assert.equal(classifyAssetTier({ comparableType: '오피스 A급' }), 'GRADE_A');
  assert.equal(classifyAssetTier({ comparableType: '구분 오피스' }), 'STRATA');
  assert.equal(classifyAssetTier({ comparableType: '프라임 오피스 빌딩' }), 'PRIME');
});

test('classifyAssetTier maps Strata / Premium / Standard for industrial + condo', () => {
  assert.equal(classifyAssetTier({ comparableType: 'Strata office Gangnam' }), 'STRATA');
  assert.equal(classifyAssetTier({ comparableType: 'Premium logistics' }), 'PREMIUM');
  assert.equal(classifyAssetTier({ comparableType: 'Standard logistics' }), 'STANDARD');
});

test('classifyAssetTier maps DC tier from redundancyTier', () => {
  assert.equal(
    classifyAssetTier({ assetClass: AssetClass.DATA_CENTER, redundancyTier: 'Tier III+' }),
    'TIER_III'
  );
  assert.equal(
    classifyAssetTier({ assetClass: AssetClass.DATA_CENTER, redundancyTier: 'Tier II' }),
    'TIER_II'
  );
});

test('classifyAssetTier falls back to floor-area buckets for office without text signal', () => {
  assert.equal(
    classifyAssetTier({
      assetClass: AssetClass.OFFICE,
      grossFloorAreaSqm: 80_000,
      comparableType: 'Office tower'
    }),
    'PRIME'
  );
  assert.equal(
    classifyAssetTier({
      assetClass: AssetClass.OFFICE,
      grossFloorAreaSqm: 30_000,
      comparableType: 'Office tower'
    }),
    'GRADE_A'
  );
  assert.equal(
    classifyAssetTier({
      assetClass: AssetClass.OFFICE,
      grossFloorAreaSqm: 12_000,
      comparableType: 'Office building'
    }),
    'GRADE_B'
  );
  assert.equal(
    classifyAssetTier({
      assetClass: AssetClass.OFFICE,
      grossFloorAreaSqm: 5_000,
      comparableType: 'Office building'
    }),
    null
  );
});

test('classifyAssetTier text signal beats floor-area fallback', () => {
  // 80k sqm would be PRIME by floor area, but explicit Grade B text wins.
  assert.equal(
    classifyAssetTier({
      assetClass: AssetClass.OFFICE,
      grossFloorAreaSqm: 80_000,
      comparableType: 'Grade B office tower'
    }),
    'GRADE_B'
  );
});

test('classifyAssetTier returns null for ambiguous input', () => {
  assert.equal(classifyAssetTier({}), null);
  assert.equal(classifyAssetTier({ comparableType: 'Office building' }), null);
  assert.equal(
    classifyAssetTier({ assetClass: AssetClass.INDUSTRIAL, comparableType: 'Logistics center' }),
    null
  );
});

test('classifyAssetTier handles null / undefined comparableType cleanly', () => {
  assert.equal(classifyAssetTier({ comparableType: null }), null);
  assert.equal(classifyAssetTier({ comparableType: undefined }), null);
});
