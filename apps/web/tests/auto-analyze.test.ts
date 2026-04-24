import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetClass } from '@prisma/client';
import { autoAnalyzeProperty } from '@/lib/services/property-analyzer/auto-analyze';

test('autoAnalyzeProperty end-to-end: Apgujeong resolves to OFFICE primary', async () => {
  const result = await autoAnalyzeProperty({
    address: '서울특별시 강남구 압구정로 340'
  });
  assert.equal(result.resolvedAddress.districtName, '강남구');
  assert.equal(result.resolvedAddress.pnu, '1168010400104580007');
  assert.equal(result.classification.primary.assetClass, AssetClass.OFFICE);
  assert.equal(result.primaryAnalysis.asset.assetClass, AssetClass.OFFICE);
  assert.ok(result.primaryAnalysis.baseCaseValueKrw > 0);
  assert.ok(result.primaryAnalysis.scenarios.length >= 3);
  const dcAlt = result.classification.alternatives.find(
    (a) => a.assetClass === AssetClass.DATA_CENTER
  );
  assert.ok(dcAlt, 'DC should be listed as excluded alternative');
  assert.equal(dcAlt.feasibility, 'EXCLUDED');
});

test('autoAnalyzeProperty: Pyeongtaek (management-plan/industrial) → INDUSTRIAL primary with DC alternative', async () => {
  const result = await autoAnalyzeProperty({
    address: '경기도 평택시 고덕면 삼성로 114',
    includeAlternatives: 1
  });
  assert.equal(result.resolvedAddress.districtName, '평택시');
  assert.equal(result.primaryAnalysis.asset.assetClass, AssetClass.INDUSTRIAL);
  const dcAlt = result.alternativeAnalyses.find((a) => a.assetClass === AssetClass.DATA_CENTER);
  assert.ok(dcAlt, 'DC should be run as alternative');
  assert.ok(
    dcAlt.analysis.baseCaseValueKrw > result.primaryAnalysis.baseCaseValueKrw,
    'Pyeongtaek DC should outvalue industrial on a grid-rich site'
  );
});

test('autoAnalyzeProperty: overrideAssetClass forces a non-classifier class', async () => {
  const result = await autoAnalyzeProperty({
    address: '서울특별시 강남구 압구정로 340',
    overrideAssetClass: AssetClass.DATA_CENTER
  });
  assert.equal(result.primaryAnalysis.asset.assetClass, AssetClass.DATA_CENTER);
  assert.notEqual(result.classification.primary.assetClass, AssetClass.DATA_CENTER);
});

test('autoAnalyzeProperty: hydrates bundle with location, zoning, grid, comps', async () => {
  const result = await autoAnalyzeProperty({
    address: '서울특별시 성동구 성수이로 118'
  });
  const pd = result.publicData as {
    zone: { zoningCode: string };
    grid: { availableCapacityMw: number | null } | null;
  };
  assert.equal(pd.zone.zoningCode, 'INDUSTRIAL_QUASI');
  assert.ok(pd.grid);
  assert.ok(result.publicData.rentComps.length > 0);
  assert.ok((result.bundle.rentComps ?? []).length > 0);
});

test('autoAnalyzeProperty: unknown address throws', async () => {
  await assert.rejects(
    () => autoAnalyzeProperty({ address: '화성 크레이터 32번지' }),
    /Geocode failed/
  );
});
