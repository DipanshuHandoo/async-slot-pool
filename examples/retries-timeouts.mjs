import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { workerPool } from '@dipanshuhandoo/async-slot-pool';

const jobs = ['healthy', 'transient', 'invalid', 'slow'];
const attempts = new Map();
const outstanding = [];
const errors = [];

async function processJob(job) {
  const attempt = (attempts.get(job) ?? 0) + 1;
  attempts.set(job, attempt);
  if (job === 'transient' && attempt === 1) throw new Error('Temporary service error');
  if (job === 'invalid') throw new Error('Invalid job data');
  if (job === 'slow') await delay(80);
  return { job, attempt };
}

try {
  const { succeeded, failed, stats } = await workerPool(jobs, (job) => {
    const work = processJob(job);
    outstanding.push(work);
    return work;
  }, {
    concurrency: 2,
    retries: 2,
    retryDelay: 5,
    retryJitter: 25,
    timeout: 15,
    onTaskError: (info) => {
      errors.push(info);
      console.log(`${info.item}: attempt ${info.attempt}, retry=${info.willRetry}, ${info.error}`);
    },
  });

  assert.deepEqual(succeeded.map(({ item }) => item), ['healthy', 'transient']);
  assert.deepEqual(failed.map(({ item, attempts: count }) => [item, count]), [['invalid', 3], ['slow', 3]]);
  assert.equal(attempts.get('transient'), 2);
  assert.match(failed[1].error, /timed out/);
  assert.equal(errors.length, 7);
  console.table(succeeded.map(({ result }) => result));
  console.table(failed);
  console.log('Summary:', stats);
  console.log('Timeouts do not cancel work. Waiting for timed-out handlers before exiting.');
} finally {
  await Promise.allSettled(outstanding);
}