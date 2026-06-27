import assert from 'node:assert/strict';
import test from 'node:test';
import { getDealById, listDeals, dealListInclude } from '@/lib/services/deals';
import { makeReadFake } from './helpers/fake-prisma';

// DB-fake coverage for the two read wrappers that own the deal-list and
// deal-detail include graphs. The stitched include / orderBy projection is the
// load-bearing contract: a regression there silently drops nested relations
// the operator console renders. Network/DB-free.

test('listDeals stitches dealListInclude and orders by updatedAt then createdAt desc', async () => {
  const { db, call } = makeReadFake('deal', 'findMany', [
    { id: 'deal_2', asset: { id: 'a2', assetCode: 'DC-002' } },
    { id: 'deal_1', asset: { id: 'a1', assetCode: 'DC-001' } }
  ]);

  const result = await listDeals(db);
  const receivedArgs = call.args as any;

  // exact include is the validator-built constant exported for reuse
  assert.deepEqual(receivedArgs.include, dealListInclude);
  // dual-key ordering is the contract (updatedAt primary, createdAt tiebreak)
  assert.deepEqual(receivedArgs.orderBy, [{ updatedAt: 'desc' }, { createdAt: 'desc' }]);

  // a couple of nested projection invariants surface drift in dealListInclude
  assert.equal((receivedArgs.include as any).asset.select.valuations.take, 1);
  assert.deepEqual((receivedArgs.include as any).asset.select.valuations.orderBy, {
    createdAt: 'desc'
  });
  // coverageTasks must exclude DONE and be bounded + priority-ordered
  assert.equal((receivedArgs.include as any).asset.select.coverageTasks.take, 5);
  assert.equal((receivedArgs.include as any).asset.select.coverageTasks.where.status.not, 'DONE');

  assert.equal(result.length, 2);
  assert.equal((result[0] as any).id, 'deal_2');
});

test('getDealById fetches by id with the deal-detail include graph', async () => {
  const { db, call } = makeReadFake('deal', 'findUnique', {
    id: 'deal_1',
    asset: { id: 'a1', assetCode: 'DC-001' }
  });

  const result = await getDealById('deal_1', db);
  const receivedArgs = call.args as any;

  assert.deepEqual(receivedArgs.where, { id: 'deal_1' });
  // detail view pulls a richer include than the list view
  assert.ok(receivedArgs.include, 'detail wrapper must request an include graph');
  assert.equal((result as any)?.id, 'deal_1');
});

test('getDealById returns null when the deal does not exist', async () => {
  const { db } = makeReadFake('deal', 'findUnique', null);
  const result = await getDealById('missing', db);
  assert.equal(result, null);
});
