import pool = require('@dipanshuhandoo/async-slot-pool');
import minified = require('@dipanshuhandoo/async-slot-pool/min');

const result: Promise<pool.WorkerPoolResult<number, string>> = pool.workerPool([1], async (item) => String(item));
const options: pool.WorkerPoolOptions<number> = { onProgress: null, onTaskError: async () => {} };
void result;
void minified.workerPool([1], (item) => item, options);
// @ts-expect-error Handler item type must match the input.
void pool.workerPool([1], (item: string) => item);