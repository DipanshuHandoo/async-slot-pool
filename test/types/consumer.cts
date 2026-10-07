import pool = require('@dipanshuhandoo/async-slot-pool');
import minified = require('@dipanshuhandoo/async-slot-pool/min');

const result: Promise<pool.AsyncSlotPoolResult<number, string>> = pool.asyncSlotPool([1], async (item) => String(item));
const options: pool.AsyncSlotPoolOptions<number> = { onProgress: null, onTaskError: async () => {} };
const legacyOptions: pool.WorkerPoolOptions<number> = options;
const legacyResult: Promise<pool.WorkerPoolResult<number, number>> = pool.workerPool([1], (item) => item, legacyOptions);
void legacyResult;
void result;
void minified.asyncSlotPool([1], (item) => item, options);
void minified.workerPool([1], (item) => item, options);
// @ts-expect-error Handler item type must match the input.
void pool.workerPool([1], (item: string) => item);