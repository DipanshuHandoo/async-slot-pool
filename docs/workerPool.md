# Worker Pool

Controlled parallel execution for any async operation. Processes a collection of items with a fixed number of concurrent workers — as soon as one finishes, it picks the next item from the queue.

Solves the two extremes:
- **Sequential loop** → too slow
- **`Promise.all`** → overloads memory and downstream services with large datasets

---

## Import

```js
import { workerPool } from '@dipanshuhandoo/async-slot-pool';
```

---

## Signature

```js
const { succeeded, failed, stats } = await workerPool(items, handler, options);
```

| Parameter | Type | Description |
|---|---|---|
| `items` | `Array \| Iterable` | Items to process. Accepts Array, Set, generator, Map values, or any sync iterable. |
| `handler` | `(item, index) => any` | Function to run on each item. Sync or async — both work. |
| `options` | `object` | Configuration (see below). All fields optional. |

---

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `concurrency` | `number` | `5` | Max number of tasks running at the same time. Must be a positive integer. |
| `timeout` | `number` | `0` | Per-attempt timeout in milliseconds. `0` means no timeout. Does not cancel the handler. |
| `retries` | `number` | `0` | How many times to retry a failed task before marking it as failed. |
| `retryDelay` | `number` | `500` | Base delay in ms between retries. Doubles each attempt: 500ms → 1000ms → 2000ms. |
| `retryJitter` | `number` | `0` | Adds a random extra delay on top of the base retry delay, expressed as a percentage (0–100). `25` adds 0–25% extra. Prevents thundering herd when many workers retry simultaneously. Values below 0 are treated as 0, values above 100 are treated as 100, non-numbers are treated as 0. |
| `bail` | `boolean` | `false` | Stop claiming new items after a task exhausts its attempts. Already claimed tasks and retries finish. |
| `onProgress` | `function` | `null` | Called after every task completes. Receives a progress stats object. |
| `onTaskError` | `function` | `null` | Called on every individual failure or retry attempt in real time. |

Invalid option values reject the returned promise with a clear error message before any work starts. `retryJitter` is normalized instead of rejected.

---

## Return Value

```js
{
  succeeded: [
    { index: 0, item: <original item>, result: <handler return value> },
    { index: 2, item: <original item>, result: <handler return value> },
    // always in original item order
  ],
  failed: [
    { index: 1, item: <original item>, error: 'error message', attempts: 3 },
  ],
  stats: {
    total:      100,    // total items (see note below for iterables)
    succeeded:  97,
    failed:     3,
    aborted:    false,  // true if bail fired mid-run
    durationMs: 4823,
  }
}
```

> **Results are compact and sorted by original input index.** `succeeded[0]` is the first successful item, not necessarily input item zero. Use each entry's `index` to identify its original position.

> **`stats.total` for non-Array iterables** is computed after the pool finishes (not known upfront). `onProgress.total` and `onProgress.pending` will be `null` during the run for generator inputs.

> With bail, final iterable totals count completed claimed items, not the entire unconsumed iterable. Array totals remain the original array length.

---

## Examples

### Basic — process an array

```js
const { succeeded, failed, stats } = await workerPool(
  users,
  async (user, index) => generateUserReport(user),
  { concurrency: 20 }
);

console.log(`${stats.succeeded} done, ${stats.failed} failed in ${stats.durationMs}ms`);
```

---

### With retries and timeout

```js
const { succeeded, failed } = await workerPool(
  orderIds,
  async (id) => fetchOrderDetails(id),
  {
    concurrency: 10,
    timeout:     5000,   // reject the attempt after 5 seconds; work is not cancelled
    retries:     3,      // retry up to 3 times on failure
    retryDelay:  500,    // 500ms → 1000ms → 2000ms between retries
    bail:        false,  // continue collecting failures, don't stop
  }
);

for (const f of failed) {
  console.error(`Item ${f.index} failed after ${f.attempts} attempts: ${f.error}`);
}
```

---

### React to errors in real time (`onTaskError`)

`failed[]` gives you errors at the end. `onTaskError` fires on every failure or retry attempt as it happens — useful for logging, alerting, or updating a status record without waiting for the pool to finish.

```js
const { succeeded, failed } = await workerPool(
  records,
  async (record) => processRecord(record),
  {
    concurrency:  10,
    retries:      2,
    onTaskError: ({ item, index, error, attempt, willRetry }) => {
      logger.warn('task failed', {
        id:        item.id,
        error,
        attempt,
        willRetry,   // false on the last attempt
      });

      if (!willRetry) {
        // Final failure — update status in DB immediately, don't wait for pool end
        db.markFailed(item.id, error);
      }
    },
  }
);
```

`onTaskError` receives:

| Field | Description |
|---|---|
| `item` | The item that failed |
| `index` | Its position in the original input |
| `error` | Error message string |
| `attempt` | Which attempt this was (1-based) |
| `willRetry` | `true` if the task will be retried; `false` on the final failure |

---

### Retry with jitter

Without jitter, all workers that hit the same rate limit error will retry at exactly the same intervals — potentially hammering the service again in sync. `retryJitter` spreads the retries out randomly.

```js
const { succeeded, failed } = await workerPool(
  items,
  async (item) => callExternalApi(item),
  {
    concurrency: 20,
    retries:     4,
    retryDelay:  500,    // base: 500ms → 1000ms → 2000ms → 4000ms
    retryJitter: 30,     // each delay gets +0–30% added on top
                         // e.g. attempt 2: anywhere from 500ms to 650ms
                         //      attempt 3: anywhere from 1000ms to 1300ms
  }
);
```

`retryJitter` accepts values from `0` (no jitter, default) to `100` (adds up to 100% extra — doubles the max delay). Values like `20`–`30` are typically enough to desynchronise workers.

---

### Stop on first failure (bail mode)

```js
const { succeeded, failed, stats } = await workerPool(
  steps,
  async (step) => executeStep(step),
  {
    concurrency: 5,
    bail:        true,
  }
);

if (stats.aborted) {
  console.error('Pipeline aborted at step', failed[0].index, '—', failed[0].error);
}
```

---

### Progress tracking

```js
const { succeeded } = await workerPool(
  rows,
  async (row) => processRow(row),
  {
    concurrency: 50,
    onProgress: ({ done, total, succeeded, failed, pending }) => {
      // total and pending are numbers for Array input, null for iterables
      const pct = total ? Math.round((done / total) * 100) + '%' : `${done} done`;
      console.log(`[${pct}] ${failed} failed, ${pending ?? '?'} pending`);
    },
  }
);
```

`onProgress` receives:

| Field | Type | Description |
|---|---|---|
| `done` | `number` | Tasks finished so far (success + failure) |
| `total` | `number \| null` | Total task count. `null` when input is a non-Array iterable |
| `succeeded` | `number` | Successful tasks so far |
| `failed` | `number` | Failed tasks so far |
| `pending` | `number \| null` | Tasks not yet completed, including in-flight work. `null` when total is unknown |

---

### Memory-efficient large datasets (generator input)

Pass a generator to pull items lazily. The generator is never fully materialised into an array, but completed items and results remain in the returned result collections. Overall result memory grows with completed work; timeouts can also leave underlying handlers running beyond the scheduling-slot limit.

```js
function* idRange(from, to) {
  for (let i = from; i <= to; i++) yield i;
}

const { succeeded, stats } = await workerPool(
  idRange(1, 100_000),
  async (id) => db.findUser(id),
  { concurrency: 30 }
);

// stats.total = 100000 (computed after the pool finishes)
```

Any sync iterable works:

```js
// Set
await workerPool(new Set(ids), handler, { concurrency: 10 });

// Map values
await workerPool(recordMap.values(), handler, { concurrency: 10 });
```

> **Async generators** (`async function*`) are not supported directly. Collect them first with `for await`:
>
> ```js
> const items = [];
> for await (const item of asyncGenerator()) items.push(item);
> await workerPool(items, handler, { concurrency: 10 });
> ```

---

### Sync handler

The handler does not need to be `async`. Sync functions are wrapped transparently:

```js
const { succeeded } = await workerPool(
  rawRecords,
  (record) => ({ ...record, normalized: normalize(record.value) }), // sync — no async/await needed
  { concurrency: 100 }
);
```

---

### Generate Excel files in parallel

```js
const { succeeded, failed } = await workerPool(
  tenants,
  async (tenant) => generateReport(tenant.id),
  {
    concurrency:  5,
    timeout:      30_000,
    retries:      1,
    onTaskError: ({ item, error }) => logger.warn('report failed', { tenant: item.id, error }),
  }
);
```

---

### Transform a large array

```js
const { succeeded } = await workerPool(
  rawRecords,
  async (record) => transform(record),
  { concurrency: 100 }
);

const transformed = succeeded.map((s) => s.result);
```

---

## Choosing concurrency

| Use case | Recommended concurrency |
|---|---|
| External API calls (rate-limited) | 5–20 |
| Database queries | 10–30 |
| File I/O | 10–50 |
| In-memory transforms | 50–200 |
| Excel / PDF generation | 3–10 |

Start conservative and increase until you see diminishing returns or downstream errors.

---

## Error handling

Each task runs independently. A failure in one task does not affect others (unless `bail: true`).

```js
const { succeeded, failed } = await workerPool(items, handler, { retries: 2 });

const results = succeeded.map((s) => s.result);

failed.forEach(({ item, error, attempts }) => {
  logger.error('Task permanently failed', { item, error, attempts });
});
```

If the handler throws synchronously, it is caught and treated the same as an async rejection.

---

## Input validation

Bad options reject the returned promise before any work starts with a descriptive error. Use `await` with `try/catch` or attach a rejection handler:

```
RangeError: workerPool: 'concurrency' must be a positive integer, got 0
RangeError: workerPool: 'timeout' must be a non-negative number, got -1
TypeError:  workerPool: 'onProgress' must be a function or null
TypeError:  workerPool: 'items' must be an Array or a sync Iterable
```

`retryJitter` is the exception — invalid values are silently normalised rather than throwing:

| Value passed | Effective value |
|---|---|
| `25` | `25` |
| `-10` | `0` |
| `150` | `100` |
| `'fast'` / `null` / `undefined` | `0` |

---

## Notes

- **Order is preserved.** `succeeded` entries always appear in the same order as the original input, regardless of which worker finished first.
- **No runtime dependencies.** Works in Node.js 22+ and modern browsers; handlers must use APIs available in their environment.
- **Sync-safe queue.** The shared item cursor is claimed synchronously before each `await`, so no two workers ever receive the same item.
- **Callbacks never crash the pool.** Exceptions thrown inside `onProgress` or `onTaskError` are silently swallowed so a broken callback can't abort the entire run.
- **Workers are lightweight async tasks, not OS threads.** Ideal for I/O-bound work (fetch, DB, file generation). For CPU-intensive work at scale (image processing, cryptography), consider Node.js `worker_threads` instead.
- **Timeouts are not cancellation.** Underlying work may continue and overlap retries. Blocking synchronous handlers cannot be interrupted by a timer. Make retried side effects idempotent and implement cancellation in the handler where needed.
- **Callbacks are fire-and-forget.** Progress snapshots describe each completion, including a terminal bail failure, but callback promises are not awaited. Flush any required logging or persistence explicitly.
- **Iterator errors reject the pool.** Already claimed work is not cancelled, and early termination does not call iterator `return()`. Manage resource-owning iterators explicitly.
- **Concurrency is not a rate limit.** A slot count does not impose a requests-per-second budget.

See the [README](../README.md) for CommonJS, TypeScript, minified imports, and direct browser scripts.
