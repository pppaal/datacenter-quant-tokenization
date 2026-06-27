import assert from 'node:assert/strict';
import test from 'node:test';
import { getFundById, listFunds, listInvestors, fundInclude } from '@/lib/services/capital';
import { makeReadFake } from './helpers/fake-prisma';

// DB-fake coverage for the capital-stack read wrappers. These stitch the deep
// fund/investor include graphs the LP-facing views depend on; the projection
// (include + orderBy + bounded relation takes) is the load-bearing contract.
// Network/DB-free.

test('listFunds stitches fundInclude and orders by updatedAt desc', async () => {
  const { db, call } = makeReadFake('fund', 'findMany', [
    { id: 'f2', name: 'Fund II' },
    { id: 'f1', name: 'Fund I' }
  ]);

  const result = await listFunds(db);
  const receivedArgs = call.args as any;

  assert.deepEqual(receivedArgs.include, fundInclude);
  assert.deepEqual(receivedArgs.orderBy, { updatedAt: 'desc' });
  assert.equal(result.length, 2);
  assert.equal((result[0] as any).id, 'f2');
});

test('getFundById fetches by id with the fundInclude graph', async () => {
  const { db, call } = makeReadFake('fund', 'findUnique', { id: 'f1', name: 'Fund I' });

  const result = await getFundById('f1', db);
  const receivedArgs = call.args as any;

  assert.deepEqual(receivedArgs.where, { id: 'f1' });
  assert.deepEqual(receivedArgs.include, fundInclude);
  assert.equal((result as any)?.id, 'f1');
});

test('getFundById returns null when the fund does not exist', async () => {
  const { db } = makeReadFake('fund', 'findUnique', null);
  const result = await getFundById('missing', db);
  assert.equal(result, null);
});

test('listInvestors stitches commitments/reports/ddq with bounded, ordered relations', async () => {
  const { db, call } = makeReadFake('investor', 'findMany', [{ id: 'inv_1', name: 'Hanwha Life' }]);

  const result = await listInvestors(db);
  const receivedArgs = call.args as any;

  // top-level ordering
  assert.deepEqual(receivedArgs.orderBy, { updatedAt: 'desc' });
  // commitments pull their fund relation
  assert.deepEqual(receivedArgs.include.commitments.include, { fund: true });
  // recent reports are bounded + ordered newest-first
  assert.deepEqual(receivedArgs.include.investorReports.orderBy, { periodEnd: 'desc' });
  assert.equal(receivedArgs.include.investorReports.take, 3);
  // recent DDQ responses are bounded + ordered newest-first
  assert.deepEqual(receivedArgs.include.ddqResponses.orderBy, { updatedAt: 'desc' });
  assert.equal(receivedArgs.include.ddqResponses.take, 3);

  assert.equal(result.length, 1);
  assert.equal((result[0] as any).name, 'Hanwha Life');
});
