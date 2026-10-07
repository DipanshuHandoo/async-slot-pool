/**
 * Worker Pool — Controlled Parallel Execution
 *
 * Processes a collection of items concurrently with a fixed number of workers.
 * Workers pick items from a shared queue — as soon as one finishes, it picks
 * the next. This prevents both sequential bottlenecks and memory-exhausting
 * Promise.all blasts.
 *
 * ── Features ─────────────────────────────────────────────────────────────────
 *  • Configurable concurrency            — N workers running at any time
 *  • Per-task timeout                    — hung tasks don't block a worker slot
 *  • Retry with exponential backoff      — transient failures auto-recover
 *  • Per-task error callback             — react to failures in real time
 *  • Bail mode                           — stop new claims after terminal failure
 *  • Order-preserving results            — compact arrays sorted by input index
 *  • True lazy iterable input            — generators pulled one-at-a-time
 *  • Sync or async handler               — both work transparently
 *  • Input validation                    — bad options throw immediately
 *  • Zero dependencies                   — pure Node.js, no external packages
 *
 * ── Basic usage ───────────────────────────────────────────────────────────────
 *
 *   import { workerPool } from '@dipanshuhandoo/async-slot-pool';
 *
 *   const { succeeded, failed, stats } = await workerPool(
 *     items,
 *     async (item, index) => processItem(item),
 *     { concurrency: 10 }
 *   );
 *
 * ── Options ──────────────────────────────────────────────────────────────────
 *
 *   {
 *     concurrency:  10,           // max parallel tasks                  (default: 5)
 *     timeout:      5000,         // ms per task, 0 = no limit           (default: 0)
 *     retries:      3,            // retry attempts on failure            (default: 0)
 *     retryDelay:   500,          // base ms between retries             (default: 500)
 *                                 // doubles each attempt: 500→1000→2000
 *     retryJitter:  25,           // % of base delay added randomly      (default: 0)
 *                                 // 25 → adds 0–25% on top of base delay
 *                                 // prevents thundering herd on retries
 *     bail:         false,        // stop new claims on terminal failure (default: false)
 *     onProgress:   (s) => {},    // called after every task completes   (default: null)
 *     onTaskError:  (e) => {},    // called on every failure/retry       (default: null)
 *   }
 *
 * ── Return value ─────────────────────────────────────────────────────────────
 *
 *   {
 *     succeeded: [{ index, item, result }, …],   // in original item order
 *     failed:    [{ index, item, error, attempts }, …],
 *     stats: { total, succeeded, failed, aborted, durationMs }
 *   }
 *
 *   Note: when input is a non-Array iterable, `stats.total` reflects the actual
 *   number of items pulled (computed after the pool finishes, not upfront).
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Task timed out after ${ms}ms`)),
      ms
    );
  });
  // Suppress the original promise's rejection after a timeout fires.
  // Without this, if the task times out and later rejects (e.g. a fetch that
  // times out and then the network also errors), Node.js emits an
  // UnhandledPromiseRejection warning for the original promise.
  promise.catch(() => {});
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ── Validation ────────────────────────────────────────────────────────────────

function validate(handler, opts) {
  if (typeof handler !== 'function') {
    throw new TypeError(`workerPool: 'handler' must be a function, got ${typeof handler}`);
  }
  if (!Number.isInteger(opts.concurrency) || opts.concurrency < 1) {
    throw new RangeError(`workerPool: 'concurrency' must be a positive integer, got ${opts.concurrency}`);
  }
  if (typeof opts.timeout !== 'number' || !Number.isFinite(opts.timeout) || opts.timeout < 0) {
    throw new RangeError(`workerPool: 'timeout' must be a non-negative number, got ${opts.timeout}`);
  }
  if (!Number.isInteger(opts.retries) || opts.retries < 0) {
    throw new RangeError(`workerPool: 'retries' must be a non-negative integer, got ${opts.retries}`);
  }
  if (typeof opts.retryDelay !== 'number' || !Number.isFinite(opts.retryDelay) || opts.retryDelay < 0) {
    throw new RangeError(`workerPool: 'retryDelay' must be a non-negative number, got ${opts.retryDelay}`);
  }
  if (typeof opts.bail !== 'boolean') {
    throw new TypeError(`workerPool: 'bail' must be a boolean, got ${typeof opts.bail}`);
  }
  if (opts.onProgress !== null && typeof opts.onProgress !== 'function') {
    throw new TypeError(`workerPool: 'onProgress' must be a function or null`);
  }
  if (opts.onTaskError !== null && typeof opts.onTaskError !== 'function') {
    throw new TypeError(`workerPool: 'onTaskError' must be a function or null`);
  }
}

// ── Source abstraction ────────────────────────────────────────────────────────
//
// Provides a unified `next()` interface over two input types:
//
//   Array      — O(1) index access, total known upfront
//   Iterable   — pulled lazily one item at a time (generator, Set, Map…)
//                Items are never all in memory at once. Total is null until done.
//
// `next()` is always called synchronously — safe with concurrent async workers
// in single-threaded Node.js because no other worker can run between a
// synchronous `next()` call and the following `await`.

function createSource(items) {
  if (Array.isArray(items)) {
    let cursor = 0;
    return {
      total: items.length,
      next() {
        if (cursor >= items.length) return { done: true };
        const index = cursor++;
        return { done: false, index, value: items[index] };
      },
    };
  }

  // Any sync iterable: generator function result, Set, Map.values(), etc.
  if (items != null && typeof items[Symbol.iterator] === 'function') {
    const iter = items[Symbol.iterator]();
    let cursor = 0;
    return {
      total: null,  // unknown upfront — filled in by stats at the end
      next() {
        const { value, done } = iter.next();
        if (done) return { done: true };
        return { done: false, index: cursor++, value };
      },
    };
  }

  throw new TypeError(
    `workerPool: 'items' must be an Array or a sync Iterable (got ${
      items == null ? items : typeof items
    }). For async generators, collect with 'for await' first.`
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

const DEFAULTS = {
  concurrency:  5,
  timeout:      0,
  retries:      0,
  retryDelay:   500,
  retryJitter:  0,
  bail:         false,
  onProgress:   null,
  onTaskError:  null,
};

/**
 * Run `handler` over every item in `items` with controlled parallelism.
 *
 * @template T  Item type
 * @template R  Result type
 *
 * @param   {T[] | Iterable<T>}                          items
 *          Items to process. Accepts Array, Set, generator, Map values, or any
 *          sync iterable. For async generators, collect with `for await` first.
 *
 * @param   {(item: T, index: number) => R | Promise<R>} handler
 *          Function to run on each item. Sync or async — both work transparently.
 *
 * @param   {{
 *   concurrency?:  number,
 *   timeout?:      number,
 *   retries?:      number,
 *   retryDelay?:   number,
 *   retryJitter?:  number,
 *   bail?:         boolean,
 *   onProgress?:   (stats: {
 *     done:      number,
 *     total:     number | null,
 *     succeeded: number,
 *     failed:    number,
 *     pending:   number | null,
 *   }) => void,
 *   onTaskError?:  (info: {
 *     item:      T,
 *     index:     number,
 *     error:     string,
 *     attempt:   number,
 *     willRetry: boolean,
 *   }) => void,
 * }} [options]
 *
 * @param {number} [options.concurrency=5]
 *   Max number of tasks running at the same time.
 *
 * @param {number} [options.timeout=0]
 *   Per-attempt timeout in milliseconds. 0 = no timeout. Does not cancel work.
 *
 * @param {number} [options.retries=0]
 *   How many times to retry a failed task before marking it as failed.
 *
 * @param {number} [options.retryDelay=500]
 *   Base delay in ms between retries. Doubles each attempt (exponential backoff).
 *
 * @param {number} [options.retryJitter=0]
 *   Percentage of the base retry delay added as a random extra (0–100).
 *   `25` adds 0–25% on top of the base delay. Prevents thundering herd when
 *   many workers retry simultaneously. Values below 0 → 0, above 100 → 100,
 *   non-numbers → 0. Silently normalised, never throws.
 *
 * @param {boolean} [options.bail=false]
 *   If true, stop new claims after a task exhausts its attempts. Drain claimed work.
 *
 * @param {function} [options.onProgress=null]
 *   Called after every task completes. Receives a progress snapshot.
 *   `total` and `pending` are null when input is a non-Array iterable.
 *   Async callbacks are safe — fire-and-forget, rejections are swallowed.
 *
 * @param {function} [options.onTaskError=null]
 *   Called on every individual failure or retry attempt in real time.
 *   Receives `{ item, index, error, attempt, willRetry }`.
 *   Async callbacks are safe — fire-and-forget, rejections are swallowed.
 *
 * @returns {Promise<{
 *   succeeded: Array<{ index: number, item: T, result: R }>,
 *   failed:    Array<{ index: number, item: T, error: string, attempts: number }>,
 *   stats: {
 *     total:      number,
 *     succeeded:  number,
 *     failed:     number,
 *     aborted:    boolean,
 *     durationMs: number,
 *   },
 * }>}
 *
 * Both `succeeded` and `failed` are sorted by original item index.
 * For non-Array iterables, `stats.total` is computed after the pool finishes.
 */
export async function workerPool(items, handler, options = {}) {
  const opts = { ...DEFAULTS, ...options };

  // Validate before touching anything
  validate(handler, opts);

  const { concurrency, timeout, retries, retryDelay, bail, onProgress, onTaskError } = opts;

  // Clamp retryJitter to [0, 100]. Non-numbers and out-of-range values are
  // silently normalised rather than throwing — jitter is best-effort.
  const retryJitter = Math.min(100, Math.max(0, Number(opts.retryJitter) || 0));

  // Build source — determines how items are pulled
  const source = createSource(items);

  // Short-circuit for empty arrays (iterables: unknown until drained)
  if (source.total === 0) {
    return {
      succeeded: [],
      failed:    [],
      stats: { total: 0, succeeded: 0, failed: 0, aborted: false, durationMs: 0 },
    };
  }

  // ── Shared state ────────────────────────────────────────────────────────────
  // Map preserves insertion order and handles unknown-total iterables cleanly.
  const succeededMap  = new Map();   // index → { index, item, result }
  const failed        = [];
  const startTime     = Date.now();
  let   doneCount     = 0;
  let   failCount     = 0;
  let   aborted       = false;

  // ── Per-task runner ─────────────────────────────────────────────────────────

  async function runTask(item, index) {
    const maxAttempts = retries + 1;
    let   lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Promise.resolve() transparently wraps sync return values
        let promise = Promise.resolve(handler(item, index));
        if (timeout > 0) promise = withTimeout(promise, timeout);
        const result = await promise;
        return { ok: true, result };
      } catch (err) {
        lastError = err;

        const willRetry = attempt < maxAttempts;

        if (onTaskError) {
          // Fire-and-forget: non-blocking so it doesn't delay retries.
          // .catch(() => {}) handles both sync throws (via Promise.resolve wrapping)
          // and async rejections — neither can crash or stall the pool.
          Promise.resolve()
            .then(() => onTaskError({
              item,
              index,
              error:     err?.message ?? String(err),
              attempt,
              willRetry,
            }))
            .catch(() => {});
        }

        if (willRetry) {
          const base  = retryDelay * Math.pow(2, attempt - 1);
          const extra = retryJitter > 0 ? base * Math.random() * (retryJitter / 100) : 0;
          await sleep(base + extra);
        }
      }
    }

    return { ok: false, error: lastError, attempts: maxAttempts };
  }

  // ── Worker loop ─────────────────────────────────────────────────────────────
  // `source.next()` is synchronous — safe to call from concurrent async workers
  // in Node.js because no other worker can run between the sync call and the
  // following await.

  async function worker() {
    while (true) {
      if (aborted) break;

      const next = source.next();   // synchronous claim — no race condition
      if (next.done) break;

      const { index, value: item } = next;
      const outcome = await runTask(item, index);

      doneCount++;

      if (outcome.ok) {
        succeededMap.set(index, { index, item, result: outcome.result });
      } else {
        failCount++;
        failed.push({
          index,
          item,
          error:    outcome.error?.message ?? String(outcome.error),
          attempts: outcome.attempts,
        });

        if (bail) {
          aborted = true;
        }
      }

      if (onProgress) {
        const progress = {
          done:      doneCount,
          total:     source.total,
          succeeded: doneCount - failCount,
          failed:    failCount,
          pending:   source.total != null ? source.total - doneCount : null,
        };
        // Same fire-and-forget pattern — async onProgress callbacks are safe.
        Promise.resolve()
          .then(() => onProgress(progress))
          .catch(() => {});
      }
    }
  }

  // ── Launch workers ──────────────────────────────────────────────────────────
  // For arrays: cap at item count. For iterables: start `concurrency` workers
  // (they'll self-terminate when the iterator is exhausted).

  const workerCount = source.total != null
    ? Math.min(concurrency, source.total)
    : concurrency;

  await Promise.all(Array.from({ length: workerCount }, worker));

  // ── Collect results in original item order ──────────────────────────────────
  // Both succeeded and failed are sorted by index so callers get a consistent,
  // predictable ordering regardless of which worker finished first.
  const succeeded = [...succeededMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, v]) => v);

  failed.sort((a, b) => a.index - b.index);

  const total = source.total ?? doneCount;

  return {
    succeeded,
    failed,
    stats: {
      total,
      succeeded:  succeeded.length,
      failed:     failed.length,
      aborted,
      durationMs: Date.now() - startTime,
    },
  };
}
