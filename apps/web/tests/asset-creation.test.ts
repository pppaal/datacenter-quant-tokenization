import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetClass, AssetStage, AssetStatus } from '@prisma/client';
import { createAsset } from '@/lib/services/assets';

test('asset creation builds nested underwriting intake data', async () => {
  let captured: any;

  const fakeDb = {
    asset: {
      async create(args: any) {
        captured = args;
        return {
          id: 'asset_1',
          ...args.data
        };
      }
    }
  };

  await createAsset(
    {
      assetClass: AssetClass.DATA_CENTER,
      assetCode: 'seoul-gangseo-01',
      name: 'Seoul Hyperscale Campus I',
      assetType: 'Data Center',
      status: AssetStatus.INTAKE,
      stage: AssetStage.POWER_REVIEW,
      description: 'Institutional review case for a west Seoul data center opportunity.',
      targetItLoadMw: 18,
      powerCapacityMw: 22,
      line1: '148 Gonghang-daero',
      city: 'Seoul',
      province: 'Seoul',
      country: 'KR'
    },
    fakeDb as any
  );

  assert.equal(captured.data.assetCode, 'SEOUL-GANGSEO-01');
  assert.equal(captured.data.slug, 'seoul-gangseo-01-seoul-hyperscale-campus-i');
  assert.equal(captured.data.address.create.city, 'Seoul');
  assert.equal(captured.data.siteProfile.create.gridAvailability, 'Pending enrichment');
  assert.equal(captured.data.readinessProject.create.reviewPhase, 'Committee review');
});

test('office asset creation builds office detail assumptions', async () => {
  let captured: any;

  const fakeDb = {
    asset: {
      async create(args: any) {
        captured = args;
        return {
          id: 'asset_2',
          ...args.data
        };
      }
    }
  };

  await createAsset(
    {
      assetClass: AssetClass.OFFICE,
      assetCode: 'seoul-yeouido-01',
      name: 'Yeouido Core Office Tower',
      assetType: 'Office',
      status: AssetStatus.INTAKE,
      stage: AssetStage.STABILIZED,
      description: 'Core office underwriting case.',
      rentableAreaSqm: 28500,
      purchasePriceKrw: 312000000000,
      stabilizedRentPerSqmMonthKrw: 38500,
      weightedAverageLeaseTermYears: 4.1,
      city: 'Seoul',
      province: 'Seoul',
      country: 'KR'
    },
    fakeDb as any
  );

  assert.equal(captured.data.assetClass, AssetClass.OFFICE);
  assert.equal(captured.data.officeDetail.create.stabilizedRentPerSqmMonthKrw, 38500);
  assert.equal(captured.data.officeDetail.create.weightedAverageLeaseTermYears, 4.1);
  assert.equal(captured.data.dataCenterDetail, undefined);
});

test('industrial asset creation uses generic asset shell without office or data-center detail', async () => {
  let captured: any;

  const fakeDb = {
    asset: {
      async create(args: any) {
        captured = args;
        return {
          id: 'asset_3',
          ...args.data
        };
      }
    }
  };

  await createAsset(
    {
      assetClass: AssetClass.INDUSTRIAL,
      assetCode: 'incheon-logistics-01',
      name: 'Incheon Logistics Hub',
      assetType: 'Industrial',
      status: AssetStatus.INTAKE,
      stage: AssetStage.STABILIZED,
      description: 'Industrial underwriting case.',
      rentableAreaSqm: 48600,
      purchasePriceKrw: 188000000000,
      city: 'Incheon',
      province: 'Incheon',
      country: 'KR'
    },
    fakeDb as any
  );

  assert.equal(captured.data.assetClass, AssetClass.INDUSTRIAL);
  assert.equal(captured.data.officeDetail, undefined);
  assert.equal(captured.data.dataCenterDetail, undefined);
  assert.equal(captured.data.siteProfile.create.latencyProfile, 'Standard site access review');
});

test('retail asset creation uses the generic income-property shell', async () => {
  let captured: any;

  const fakeDb = {
    asset: {
      async create(args: any) {
        captured = args;
        return {
          id: 'asset_4',
          ...args.data
        };
      }
    }
  };

  await createAsset(
    {
      assetClass: AssetClass.RETAIL,
      assetCode: 'seoul-retail-01',
      name: 'Seoul Neighborhood Retail Center',
      assetType: 'Retail',
      status: AssetStatus.INTAKE,
      stage: AssetStage.STABILIZED,
      description: 'Retail underwriting case.',
      rentableAreaSqm: 12400,
      purchasePriceKrw: 92000000000,
      city: 'Seoul',
      province: 'Seoul',
      country: 'KR'
    },
    fakeDb as any
  );

  assert.equal(captured.data.assetClass, AssetClass.RETAIL);
  assert.equal(captured.data.officeDetail, undefined);
  assert.equal(captured.data.dataCenterDetail, undefined);
  assert.equal(captured.data.siteProfile.create.latencyProfile, 'Standard site access review');
});

test('multifamily asset creation uses the generic income-property shell', async () => {
  let captured: any;

  const fakeDb = {
    asset: {
      async create(args: any) {
        captured = args;
        return {
          id: 'asset_5',
          ...args.data
        };
      }
    }
  };

  await createAsset(
    {
      assetClass: AssetClass.MULTIFAMILY,
      assetCode: 'seoul-mf-01',
      name: 'Seoul Riverfront Apartments',
      assetType: 'Multifamily',
      status: AssetStatus.INTAKE,
      stage: AssetStage.STABILIZED,
      description: 'Multifamily underwriting case.',
      rentableAreaSqm: 9600,
      purchasePriceKrw: 118000000000,
      city: 'Seoul',
      province: 'Seoul',
      country: 'KR'
    },
    fakeDb as any
  );

  assert.equal(captured.data.assetClass, AssetClass.MULTIFAMILY);
  assert.equal(captured.data.officeDetail, undefined);
  assert.equal(captured.data.dataCenterDetail, undefined);
  assert.equal(captured.data.siteProfile.create.latencyProfile, 'Standard site access review');
});

test('asset creation normalizes non-KRW money inputs into KRW storage', async () => {
  let captured: any;

  const fakeDb = {
    asset: {
      async create(args: any) {
        captured = args;
        return {
          id: 'asset_6',
          ...args.data
        };
      }
    },
    sourceOverride: {
      async findUnique() {
        return {
          payload: {
            fromCurrency: 'USD',
            toCurrency: 'KRW',
            rateToKrw: 1350,
            asOf: null,
            provider: 'test-override'
          }
        };
      }
    },
    sourceCache: {
      async findUnique() {
        return null;
      },
      async upsert() {
        return null;
      }
    }
  };

  await createAsset(
    {
      assetClass: AssetClass.OFFICE,
      assetCode: 'nyc-office-01',
      name: 'Manhattan Office Tower',
      assetType: 'Office',
      status: AssetStatus.INTAKE,
      stage: AssetStage.STABILIZED,
      description: 'US office underwriting case.',
      country: 'US',
      inputCurrency: 'USD',
      rentableAreaSqm: 22000,
      purchasePriceKrw: 100000000,
      capexAssumptionKrw: 2500000
    },
    fakeDb as any
  );

  assert.equal(captured.data.market, 'US');
  assert.equal(captured.data.purchasePriceKrw, 135000000000);
  assert.equal(captured.data.capexAssumptionKrw, 3375000000);
});
