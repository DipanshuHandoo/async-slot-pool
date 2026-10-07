import assert from 'node:assert/strict';
import test from 'node:test';
import { asyncSlotPool, asyncSlotPool as workerPool, workerPool as legacyWorkerPool } from '../src/asyncSlotPool.js';
import { workerPool as sourceCompatibilityAlias } from '../src/workerPool.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('canonical asyncSlotPool retains identical legacy exports', () => {
  assert.equal(asyncSlotPool.name, 'asyncSlotPool');
  assert.equal(asyncSlotPool.length, 2);
  assert.equal(legacyWorkerPool, asyncSlotPool);
  assert.equal(sourceCompatibilityAlias, asyncSlotPool);
});

test('validation errors use the canonical asyncSlotPool prefix', async () => {
  await assert.rejects(asyncSlotPool([1], null), /^TypeError: asyncSlotPool:/);
  await assert.rejects(asyncSlotPool(null, () => 1), /^TypeError: asyncSlotPool:/);
});

test('bail reports progress for the terminal failure and stops new claims', async () => {
  const claimed = [];
  const progress = [];
  const result = await workerPool([1, 2, 3], (item) => {
    claimed.push(item);
    throw new Error('stop');
  }, { concurrency: 1, bail: true, onProgress: (stats) => progress.push(stats) });

  assert.deepEqual(claimed, [1]);
  assert.equal(result.stats.aborted, true);
  assert.equal(result.failed[0].attempts, 1);
  assert.deepEqual(progress, [{ done: 1, total: 3, succeeded: 0, failed: 1, pending: 2 }]);
});

test('progress is a distinct snapshot for each completed task', async () => {
  const progress = [];
  await workerPool([1, 2, 3], (item) => item, {
    concurrency: 3,
    onProgress: (stats) => progress.push(stats),
  });
  assert.deepEqual(progress.map((stats) => stats.done), [1, 2, 3]);
  assert.deepEqual(progress.map((stats) => stats.pending), [2, 1, 0]);
});

test('empty arrays and iterables return empty results', async () => {
  for (const items of [[], new Set()]) {
    const result = await workerPool(items, () => assert.fail('must not run'));
    assert.deepEqual(result.succeeded, []);
    assert.deepEqual(result.failed, []);
    assert.equal(result.stats.total, 0);
    assert.equal(result.stats.aborted, false);
  }
});

test('slots refill without waiting for slower tasks and results retain input order', async () => {
  let releaseFirst;
  let active = 0;
  let peak = 0;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const claimed = [];
  const result = await workerPool([0, 1, 2], async (item, index) => {
    active++;
    peak = Math.max(peak, active);
    claimed.push(index);
    if (item === 0) await firstGate;
    if (item === 2) releaseFirst();
    active--;
    return item * 2;
  }, { concurrency: 2 });
  assert.equal(peak, 2);
  assert.deepEqual(claimed, [0, 1, 2]);
  assert.deepEqual(result.succeeded.map(({ index, result: value }) => [index, value]), [[0, 0], [1, 2], [2, 4]]);
});

test('successes are compact and failures are sorted with string errors', async () => {
  const result = await workerPool([0, 1, 2, 3], async (item) => {
    if (item === 1) { await delay(10); throw new Error('first'); }
    if (item === 3) throw 'second';
    return item;
  });
  assert.deepEqual(result.succeeded.map(({ index }) => index), [0, 2]);
  assert.deepEqual(result.failed, [
    { index: 1, item: 1, error: 'first', attempts: 1 },
    { index: 3, item: 3, error: 'second', attempts: 1 },
  ]);
  assert.equal(result.stats.total, 4);
  assert.equal(result.stats.succeeded, 2);
  assert.equal(result.stats.failed, 2);
  assert.ok(result.stats.durationMs >= 0);
});

test('retries report every attempt and can recover', async () => {
  let attempts = 0;
  const errors = [];
  const result = await workerPool(['item'], () => {
    if (++attempts < 3) throw new Error('retry');
    return 'recovered';
  }, { retries: 2, retryDelay: 0, onTaskError: (info) => errors.push(info) });
  assert.equal(attempts, 3);
  assert.equal(result.succeeded[0].result, 'recovered');
  assert.deepEqual(errors.map(({ attempt, willRetry }) => [attempt, willRetry]), [[1, true], [2, true]]);
});

test('exhausted retries record the total attempts', async () => {
  const errors = [];
  const result = await workerPool([1], () => { throw new Error('failed'); }, {
    retries: 2, retryDelay: 0, onTaskError: (info) => errors.push(info),
  });
  assert.equal(result.failed[0].attempts, 3);
  assert.deepEqual(errors.map(({ willRetry }) => willRetry), [true, true, false]);
});

test('retry delay doubles and jitter is normalized', async (context) => {
  const delays = [];
  context.mock.method(globalThis, 'setTimeout', (callback, ms) => {
    delays.push(ms);
    queueMicrotask(callback);
    return 0;
  });
  context.mock.method(Math, 'random', () => 0.5);
  for (const retryJitter of [20, -1, 200, 'invalid']) {
    await workerPool([1], () => { throw new Error('retry'); }, {
      retries: 2, retryDelay: 100, retryJitter,
    });
  }
  assert.deepEqual(delays, [110, 220, 100, 200, 150, 300, 100, 200]);
});

test('timeouts release a slot but do not cancel underlying handlers', async () => {
  let finish;
  let completed = false;
  const work = new Promise((resolve) => { finish = resolve; });
  const result = await workerPool([1], async () => {
    await work;
    completed = true;
  }, { timeout: 5 });
  assert.match(result.failed[0].error, /timed out/);
  assert.equal(completed, false);
  finish();
  await delay(0);
  assert.equal(completed, true);
});

test('late task rejection after timeout is handled', async () => {
  let rejectWork;
  const work = new Promise((resolve, reject) => { rejectWork = reject; });
  const result = await workerPool([1], () => work, { timeout: 5 });
  assert.equal(result.stats.failed, 1);
  rejectWork(new Error('late'));
  await delay(0);
});

test('bail drains in-flight tasks without claiming more items', async () => {
  const claimed = [];
  const result = await workerPool([0, 1, 2, 3], async (item) => {
    claimed.push(item);
    if (item === 0) throw new Error('stop');
    await delay(10);
    return item;
  }, { concurrency: 2, bail: true });
  assert.deepEqual(claimed, [0, 1]);
  assert.equal(result.stats.aborted, true);
  assert.equal(result.stats.total, 4);
  assert.deepEqual(result.succeeded.map(({ item }) => item), [1]);
});

test('iterables are pulled lazily and progress totals remain unknown', async () => {
  let pulled = 0;
  let processed = 0;
  const progress = [];
  function* items() {
    for (let item = 0; item < 5; item++) {
      assert.equal(pulled, processed);
      pulled++;
      yield item;
    }
  }
  const result = await workerPool(items(), (item) => {
    processed++;
    return item;
  }, { concurrency: 1, onProgress: (stats) => progress.push(stats) });
  assert.equal(result.stats.total, 5);
  assert.equal(progress.length, 5);
  assert.ok(progress.every(({ total, pending }) => total === null && pending === null));
});

test('iterator errors reject the pool promise', async () => {
  function* items() {
    yield 1;
    throw new Error('iterator failed');
  }
  await assert.rejects(workerPool(items(), (item) => item, { concurrency: 1 }), /iterator failed/);
});

test('throwing and rejecting callbacks cannot fail the pool', async () => {
  for (const callback of [() => { throw new Error('callback'); }, async () => { throw new Error('callback'); }]) {
    const result = await workerPool([1, 2], (item) => {
      if (item === 1) throw new Error('task');
      return item;
    }, { onTaskError: callback, onProgress: callback });
    assert.equal(result.stats.failed, 1);
    assert.equal(result.stats.succeeded, 1);
    await delay(0);
  }
});

test('invalid inputs and options reject before handlers run', async () => {
  const invalidOptions = [
    { concurrency: 0 }, { concurrency: 1.5 }, { timeout: -1 }, { timeout: Infinity },
    { retries: -1 }, { retryDelay: NaN }, { bail: 'yes' }, { onProgress: 1 }, { onTaskError: 1 },
  ];
  for (const options of invalidOptions) {
    await assert.rejects(workerPool([1], () => assert.fail('must not run'), options));
  }
  await assert.rejects(workerPool([1], null), TypeError);
  await assert.rejects(workerPool(null, () => 1), TypeError);
  await assert.rejects(workerPool((async function* () { yield 1; })(), () => 1), /sync Iterable/);
});