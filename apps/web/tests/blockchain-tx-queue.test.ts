import assert from 'node:assert/strict';
import test from 'node:test';
import { runSerial } from '@/lib/blockchain/tx-queue';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('runSerial executes same-key tasks sequentially', async () => {
  const order: string[] = [];
  const a = deferred<void>();
  const b = deferred<void>();

  const taskA = runSerial('signer', async () => {
    order.push('a:start');
    await a.promise;
    order.push('a:end');
  });
  const taskB = runSerial('signer', async () => {
    order.push('b:start');
    await b.promise;
    order.push('b:end');
  });

  // Yield once so the first task gets to run its synchronous prefix.
  await Promise.resolve();
  assert.deepEqual(order, ['a:start']);

  a.resolve();
  await taskA;
  assert.deepEqual(order, ['a:start', 'a:end', 'b:start']);

  b.resolve();
  await taskB;
  assert.deepEqual(order, ['a:start', 'a:end', 'b:start', 'b:end']);
});

test('runSerial isolates different keys (run in parallel)', async () => {
  const order: string[] = [];
  const x = deferred<void>();

  const taskX = runSerial('signer-x', async () => {
    order.push('x:start');
    await x.promise;
    order.push('x:end');
  });
  const taskY = runSerial('signer-y', async () => {
    order.push('y:start');
    order.push('y:end');
  });

  await taskY;
  assert.deepEqual(order, ['x:start', 'y:start', 'y:end']);

  x.resolve();
  await taskX;
  assert.deepEqual(order, ['x:start', 'y:start', 'y:end', 'x:end']);
});

test('runSerial continues after a same-key task throws', async () => {
  const calls: string[] = [];

  await assert.rejects(
    () =>
      runSerial('signer-z', async () => {
        calls.push('first');
        throw new Error('boom');
      }),
    /boom/
  );

  const result = await runSerial('signer-z', async () => {
    calls.push('second');
    return 42;
  });
  assert.equal(result, 42);
  assert.deepEqual(calls, ['first', 'second']);
});
