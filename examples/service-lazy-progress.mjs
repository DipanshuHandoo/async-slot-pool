import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { workerPool } from '@dipanshuhandoo/async-slot-pool';

class DemoUploadService {
  async uploadFile(relativePath) {
    await delay(5);
    if (relativePath === 'assets/missing.txt') throw new Error(`File unavailable: ${relativePath}`);
    return { relativePath, status: 'uploaded' };
  }

  async uploadFiles(relativePaths, workerPoolOptions = {}) {
    return workerPool(
      relativePaths,
      (relativePath) => this.uploadFile(relativePath),
      workerPoolOptions,
    );
  }
}

function* discoverFiles() {
  yield 'assets/banner.jpg';
  yield 'assets/logo.png';
  yield 'assets/missing.txt';
  yield 'pages/about.html';
  yield 'pages/contact.html';
}

const daService = new DemoUploadService();
const progress = [];
let previousWidth = 0;
let uploadOutcome;

try {
  uploadOutcome = await daService.uploadFiles(discoverFiles(), {
    concurrency: 2,
    timeout: 10000,
    onProgress: ({ done, total, succeeded, failed }) => {
      progress.push({ done, total });
      const count = total === null ? `${done} files completed` : `${done}/${total} files completed`;
      const message = `Uploading: ${count}; succeeded=${succeeded}, failed=${failed}`;
      if (process.stdout.isTTY) {
        process.stdout.write(`\r${message.padEnd(previousWidth, ' ')}`);
        previousWidth = message.length;
      } else {
        process.stdout.write(`${message}\n`);
      }
    },
  });
} finally {
  if (process.stdout.isTTY) process.stdout.write('\n');
}

assert.equal(uploadOutcome.stats.total, 5);
assert.equal(uploadOutcome.stats.succeeded, 4);
assert.equal(uploadOutcome.stats.failed, 1);
assert.deepEqual(progress.map(({ done }) => done), [1, 2, 3, 4, 5]);
assert.ok(progress.every(({ total }) => total === null));
console.log(`Finished ${uploadOutcome.stats.total} files; failed ${uploadOutcome.stats.failed}.`);
for (const { item, error } of uploadOutcome.failed) {
  console.error(`${item}: ${error}`);
}