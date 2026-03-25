import assert from 'node:assert/strict';
import test from 'node:test';
import { listGlobalMarketLaunchPlan } from '@/lib/services/sources';

test('global market launch plan is ordered by rollout phase', () => {
  const plan = listGlobalMarketLaunchPlan();

  assert.equal(plan[0]?.region, 'United States');
  assert.equal(plan[0]?.status, 'NOW');
  assert.equal(plan[1]?.status, 'NEXT');
  assert.ok(plan.every((entry, index) => index === 0 || entry.phase >= plan[index - 1]!.phase));
  assert.ok(plan.some((entry) => entry.region.includes('Europe')));
});
