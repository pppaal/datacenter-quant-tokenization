import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLpPortalView, type LpPortalFundInput } from '@/lib/services/investor-portal';
import type { LpStatement } from '@/lib/services/fund-nav';

function statement(investorId: string, over: Partial<LpStatement> = {}): LpStatement {
  return {
    investorId,
    investorCode: 'LP-1',
    investorName: 'LP One',
    investorType: 'PROFESSIONAL',
    committedKrw: 100,
    calledKrw: 60,
    distributedKrw: 20,
    unfundedKrw: 40,
    recallableKrw: 0,
    navShareKrw: 50,
    sharePct: 25,
    irrPct: 12,
    tvpiMultiple: 1.2,
    dpiMultiple: 0.33,
    rvpiMultiple: 0.83,
    cashflowsAllocatedProRata: false,
    ...over
  };
}

function fund(investorId: string, over: Partial<LpPortalFundInput> = {}): LpPortalFundInput {
  return {
    fundId: 'f1',
    fundName: 'Fund I',
    vehicleName: 'SPV-1',
    navKrw: 1000,
    navUsedCostBasisFallback: false,
    assetCount: 3,
    statement: statement(investorId),
    ...over
  };
}

test('assembles a scoped view and sums the summary across funds', () => {
  const view = buildLpPortalView({ id: 'inv_1', code: 'LP-1', name: 'LP One' }, [
    fund('inv_1', {
      fundId: 'f1',
      statement: statement('inv_1', { committedKrw: 100, navShareKrw: 50 })
    }),
    fund('inv_1', {
      fundId: 'f2',
      fundName: 'Fund II',
      statement: statement('inv_1', {
        committedKrw: 200,
        calledKrw: 150,
        distributedKrw: 30,
        unfundedKrw: 50,
        navShareKrw: 120
      })
    })
  ]);
  assert.equal(view.funds.length, 2);
  assert.equal(view.summary.fundCount, 2);
  assert.equal(view.summary.committedKrw, 300);
  assert.equal(view.summary.calledKrw, 210);
  assert.equal(view.summary.distributedKrw, 50);
  assert.equal(view.summary.navShareKrw, 170);
  assert.equal(view.funds[0]!.fundMetrics.assetCount, 3);
});

test('drops funds whose statement belongs to a different investor (no cross-LP leakage)', () => {
  const view = buildLpPortalView({ id: 'inv_1', code: 'LP-1', name: 'LP One' }, [
    fund('inv_1', { fundId: 'f1' }),
    fund('inv_OTHER', { fundId: 'f2', fundName: 'Other LP Fund' })
  ]);
  assert.equal(view.funds.length, 1);
  assert.equal(view.funds[0]!.fundId, 'f1');
  assert.equal(view.summary.fundCount, 1);
});

test('empty fund list yields a zeroed summary', () => {
  const view = buildLpPortalView({ id: 'inv_1' }, []);
  assert.deepEqual(view.summary, {
    fundCount: 0,
    committedKrw: 0,
    calledKrw: 0,
    distributedKrw: 0,
    unfundedKrw: 0,
    navShareKrw: 0
  });
  assert.equal(view.investorCode, null);
  assert.equal(view.investorName, null);
});

test('fund view exposes only the capital account + high-level metrics (no extra asset detail)', () => {
  const view = buildLpPortalView({ id: 'inv_1' }, [fund('inv_1')]);
  const fv = view.funds[0]!;
  assert.deepEqual(Object.keys(fv.fundMetrics).sort(), [
    'assetCount',
    'navKrw',
    'navUsedCostBasisFallback'
  ]);
  assert.equal(fv.capitalAccount.investorId, 'inv_1');
});
