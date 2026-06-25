import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RISK_ENGINE_SOURCE,
  generateRiskRegisterFromEngine
} from '@/lib/services/asset-risk-register';

type GeneratedEntry = {
  category: string;
  title: string;
  likelihood: string;
  impact: string;
  sourceSystem: string;
};

/**
 * Build a Prisma fake whose `asset.findUnique` returns the supplied bundle and
 * captures the rows the engine writes via `createMany`. `getAssetById` (used
 * internally) only reads `asset.findUnique`, so this exercises the real
 * rent-roll → idiosyncratic-risk adapter without a database.
 */
function makeDb(leases: unknown[]) {
  const created: GeneratedEntry[][] = [];
  const bundle = {
    id: 'asset_risk_1',
    name: 'Risk Tower',
    market: 'KR',
    currentValuationKrw: null,
    siteProfile: null,
    leases,
    capexLineItems: [],
    planningConstraints: [],
    encumbranceRecords: [],
    address: { country: 'KR' }
  };

  const db = {
    asset: {
      async findUnique() {
        return bundle;
      }
    },
    async $transaction(fn: (tx: unknown) => Promise<unknown>) {
      return fn({
        assetRiskRegisterEntry: {
          async deleteMany() {
            return { count: 0 };
          },
          async createMany(args: { data: GeneratedEntry[] }) {
            created.push(args.data);
            return { count: args.data.length };
          }
        }
      });
    }
  } as any;

  return { db, created };
}

function lease(tenantName: string, leasedKw: number, baseRatePerKwKrw: number) {
  return {
    tenantName,
    leasedKw,
    baseRatePerKwKrw,
    startYear: 1,
    termYears: 8,
    steps: []
  };
}

test('risk engine collapses multiple leases held by one tenant into a single rent-roll row', async () => {
  // One tenant occupying two suites should read as a single, fully-concentrated
  // tenant (HHI = 1.0 → CRITICAL), not two independent tenants (HHI = 0.5).
  const { db, created } = makeDb([
    lease('HyperCloud', 4000, 200000),
    lease('HyperCloud', 4000, 200000)
  ]);

  await generateRiskRegisterFromEngine('asset_risk_1', db);

  const rows = created.flat();
  const concentration = rows.find((r) => r.category === 'Tenant Concentration');
  assert.ok(concentration, 'expected a tenant-concentration risk row');
  assert.equal(concentration!.sourceSystem, RISK_ENGINE_SOURCE);
  assert.equal(
    concentration!.likelihood,
    'CRITICAL',
    'a single tenant across two leases must register as critical concentration'
  );
});

test('risk engine still distinguishes genuinely separate tenants', async () => {
  // Five distinct tenants of equal size are well-diversified: concentration
  // must not be flagged at all (LOW factors are dropped from the register).
  const { db, created } = makeDb([
    lease('Alpha', 2000, 200000),
    lease('Bravo', 2000, 200000),
    lease('Charlie', 2000, 200000),
    lease('Delta', 2000, 200000),
    lease('Echo', 2000, 200000)
  ]);

  await generateRiskRegisterFromEngine('asset_risk_1', db);

  const rows = created.flat();
  const concentration = rows.find((r) => r.category === 'Tenant Concentration');
  assert.equal(
    concentration,
    undefined,
    'five equal tenants should not raise a concentration risk row'
  );
});
