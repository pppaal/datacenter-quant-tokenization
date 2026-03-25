import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@prisma/client';
import { AssetClass, SourceStatus } from '@prisma/client';
import {
  buildMacroProfileRuntimeRules,
  createMacroProfileOverride,
  listActiveMacroProfileRuntimeRules,
  updateMacroProfileOverride,
  type MacroProfileOverrideRecord
} from '@/lib/services/macro/profile-overrides';
import { buildMacroRegimeAnalysis } from '@/lib/services/macro/regime';

function createMockDb(seed: MacroProfileOverrideRecord[] = []) {
  let rows = [...seed];

  return {
    macroProfileOverride: {
      async findMany(args?: { where?: { isActive?: boolean } }) {
        const filtered =
          typeof args?.where?.isActive === 'boolean'
            ? rows.filter((row) => row.isActive === args.where?.isActive)
            : rows;
        return [...filtered];
      },
      async findUnique(args: { where: { id: string } }) {
        return rows.find((row) => row.id === args.where.id) ?? null;
      },
      async create(args: { data: Omit<MacroProfileOverrideRecord, 'id' | 'createdAt' | 'updatedAt'> }) {
        const now = new Date('2026-03-25T00:00:00.000Z');
        const record: MacroProfileOverrideRecord = {
          id: `override_${rows.length + 1}`,
          ...args.data,
          createdAt: now,
          updatedAt: now
        };
        rows.push(record);
        return record;
      },
      async update(args: {
        where: { id: string };
        data: Partial<Omit<MacroProfileOverrideRecord, 'id' | 'createdAt' | 'updatedAt'>>;
      }) {
        const index = rows.findIndex((row) => row.id === args.where.id);
        assert.notEqual(index, -1);
        const record: MacroProfileOverrideRecord = {
          ...rows[index],
          ...args.data,
          updatedAt: new Date('2026-03-26T00:00:00.000Z')
        };
        rows[index] = record;
        return record;
      }
    }
  } as unknown as PrismaClient;
}

test('macro profile override service creates, updates, and compiles runtime rules', async () => {
  const db = createMockDb();

  const created = await createMacroProfileOverride(
    {
      label: 'US office liquidity premium',
      assetClass: AssetClass.OFFICE,
      country: 'us',
      liquidityMultiplier: 1.18,
      capitalRateMultiplier: 1.08,
      priority: 20,
      isActive: true
    },
    db
  );

  assert.equal(created.country, 'US');
  assert.equal(created.assetClass, AssetClass.OFFICE);

  const updated = await updateMacroProfileOverride(
    created.id,
    {
      submarketPattern: 'manhattan|new york',
      label: 'Manhattan office premium',
      liquidityMultiplier: 1.22
    },
    db
  );

  assert.equal(updated.submarketPattern, 'manhattan|new york');
  assert.equal(updated.liquidityMultiplier, 1.22);

  const runtimeRules = await listActiveMacroProfileRuntimeRules(db);

  assert.ok(runtimeRules.submarketRules.some((rule) => rule.label === 'Manhattan office premium'));
});

test('macro profile runtime rules can override regime sensitivity for a targeted submarket', () => {
  const runtimeRules = buildMacroProfileRuntimeRules([
    {
      id: 'override_1',
      assetClass: AssetClass.OFFICE,
      country: 'US',
      submarketPattern: 'manhattan|new york',
      label: 'Manhattan office premium',
      capitalRateMultiplier: 1.12,
      liquidityMultiplier: 1.2,
      leasingMultiplier: 1.06,
      constructionMultiplier: null,
      priority: 10,
      isActive: true,
      notes: null,
      createdAt: new Date('2026-03-25T00:00:00.000Z'),
      updatedAt: new Date('2026-03-25T00:00:00.000Z')
    }
  ]);

  const regime = buildMacroRegimeAnalysis({
    assetClass: AssetClass.OFFICE,
    market: 'US',
    country: 'US',
    submarket: 'Manhattan',
    marketSnapshot: {
      id: 'market_1',
      assetId: 'asset_1',
      metroRegion: 'Manhattan',
      vacancyPct: 8.5,
      colocationRatePerKwKrw: null,
      capRatePct: 5.7,
      debtCostPct: 5.2,
      inflationPct: 2.6,
      constructionCostPerMwKrw: null,
      discountRatePct: 7.4,
      marketNotes: 'Office market',
      sourceStatus: SourceStatus.FRESH,
      sourceUpdatedAt: new Date('2026-03-20T00:00:00.000Z'),
      createdAt: new Date('2026-03-20T00:00:00.000Z'),
      updatedAt: new Date('2026-03-20T00:00:00.000Z')
    },
    profileRules: runtimeRules
  });

  assert.ok(regime.profile.adjustmentSummary.includes('Manhattan office premium'));
  assert.ok(regime.profile.capitalRateSensitivity > 1.15);
  assert.ok(regime.profile.liquiditySensitivity > 1.1);
});
