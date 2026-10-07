import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { asyncSlotPool as workerPool } from '@dipanshuhandoo/async-slot-pool';

const jobs = [
  { id: 'invalid', ready: false },
  { id: 'already-started', ready: true },
  { id: 'not-started-1', ready: true },
  { id: 'not-started-2', ready: true },
];
const claimed = [];
const progress = [];

const { succeeded, failed, stats } = await workerPool(jobs, async (job) => {
  claimed.push(job.id);
  if (!job.ready) throw new Error(`Job ${job.id} is not ready`);
  await delay(10);
  return { id: job.id, status: 'complete' };
}, {
  concurrency: 2,
  bail: true,
  onProgress: (snapshot) => { progress.push(snapshot); },
});

assert.deepEqual(claimed, ['invalid', 'already-started']);
assert.equal(stats.aborted, true);
assert.equal(stats.total, 4);
assert.deepEqual(succeeded.map(({ item }) => item.id), ['already-started']);
assert.deepEqual(failed.map(({ item }) => item.id), ['invalid']);
assert.deepEqual(progress.map(({ done }) => done), [1, 2]);
console.table(succeeded.map(({ result }) => result));
console.table(failed.map(({ item, error }) => ({ job: item.id, error })));
console.log('Never claimed:', jobs.filter((job) => !claimed.includes(job.id)).map(({ id }) => id));
console.log('Summary:', stats);
console.log('Bail stops new claims, not already running work. It is not a rollback or dependency-ordering mechanism.');