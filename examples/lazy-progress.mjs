import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { workerPool } from '@dipanshuhandoo/async-slot-pool';

let pulled = 0;
let completed = 0;
let peakUnfinished = 0;
const progress = [];

function* records() {
  for (let recordId = 1; recordId <= 12; recordId++) {
    pulled++;
    peakUnfinished = Math.max(peakUnfinished, pulled - completed);
    yield { id: recordId, score: recordId * 10 };
  }
}

const { succeeded, failed, stats } = await workerPool(records(), async (record) => {
  await delay(2);
  completed++;
  return { id: record.id, normalizedScore: record.score / 100 };
}, {
  concurrency: 3,
  onProgress: (snapshot) => {
    progress.push(snapshot);
    console.log(`Completed ${snapshot.done}; total=${snapshot.total ?? 'unknown'}, unfinished=${snapshot.pending ?? 'unknown'}`);
  },
});

assert.equal(failed.length, 0);
assert.equal(succeeded.length, 12);
assert.equal(stats.total, 12);
assert.equal(progress.length, 12);
assert.ok(progress.every(({ total, pending }) => total === null && pending === null));
assert.ok(peakUnfinished <= 3);
assert.deepEqual(succeeded.map(({ result }) => result.id), Array.from({ length: 12 }, (_, index) => index + 1));
console.log('Summary:', stats);
console.log('Input was pulled lazily, but the pool still retains completed items and results.');