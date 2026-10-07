import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { asyncSlotPool as workerPool } from '@dipanshuhandoo/async-slot-pool';

class DemoUploadService {
  async uploadFile(relativePath) {
    await delay(5);
    return { relativePath, status: 'uploaded' };
  }

  async uploadFiles(relativePaths, asyncSlotPoolOptions = {}) {
    return workerPool(
      relativePaths,
      (relativePath) => this.uploadFile(relativePath),
      asyncSlotPoolOptions,
    );
  }
}

const daService = new DemoUploadService();
const files = ['assets/banner.jpg', 'assets/logo.png', 'pages/about.html', 'pages/contact.html'];
const progress = [];
let uploadOutcome;

try {
  uploadOutcome = await daService.uploadFiles(files, {
    concurrency: 15,
    timeout: 10000,
    onProgress: ({ done, total }) => {
      progress.push({ done, total });
      process.stdout.write(`\rStep 2 uploading ${done}/${total}`);
    },
  });
} finally {
  process.stdout.write('\n');
}

assert.equal(uploadOutcome.failed.length, 0);
assert.deepEqual(uploadOutcome.succeeded.map(({ result }) => result.relativePath), files);
assert.deepEqual(progress.map(({ done }) => done), [1, 2, 3, 4]);
assert.ok(progress.every(({ total }) => total === files.length));
console.log(`Uploaded ${uploadOutcome.stats.succeeded} files; failed ${uploadOutcome.stats.failed}.`);