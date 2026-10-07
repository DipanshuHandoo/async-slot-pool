import { workerPool, type WorkerPoolOptions, type WorkerPoolResult } from '@dipanshuhandoo/async-slot-pool';
import { workerPool as minified } from '@dipanshuhandoo/async-slot-pool/min';

const options: WorkerPoolOptions<number> = {
  concurrency: 2,
  onProgress: async (stats) => { const pending: number | null = stats.pending; void pending; },
  onTaskError: ({ item, error }) => { const value: number = item; const message: string = error; void value; void message; },
};
const result: WorkerPoolResult<number, string> = await workerPool(new Set([1, 2]), async (item) => String(item), options);
const value: string = result.succeeded[0].result;
void value;
await minified([1], (item) => item * 2, { onProgress: null, onTaskError: null });
const counters: number[] = [];
await minified([1], (item) => item, {
  onProgress: (stats) => counters.push(stats.done),
  onTaskError: (info) => counters.push(info.attempt),
});
// @ts-expect-error Async iterables are not supported.
await workerPool((async function* () { yield 1; })(), (item: number) => item);
// @ts-expect-error Handler item type must match the input.
await workerPool([1], (item: string) => item);
// @ts-expect-error Retry count must be numeric.
await workerPool([1], (item) => item, { retries: 'two' });