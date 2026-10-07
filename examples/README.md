# Runnable Async Slot Pool Examples

These examples use the public `@dipanshuhandoo/async-slot-pool` import. They require Node.js 22+, run without credentials or external services, and check their expected results with assertions.

The exported function is `asyncSlotPool`. These scripts intentionally use `import { asyncSlotPool as workerPool }` so the existing local variable names stay familiar; that local alias does not change the service's canonical name. Old applications importing `workerPool` directly also remain supported.

## Run From the Repository

```sh
npm ci
npm run examples
```

The command builds the package and runs all eight examples. It exits with an error if an assertion fails. To run one example after building:

```sh
npm run build
node examples/http-api.mjs
```

## Choose a Use Case

| Example | Use case | Demonstrates |
| --- | --- | --- |
| [basic.mjs](basic.mjs) | Calculate totals for a batch of orders | Synchronous handlers, item indexes, compact ordered success results. |
| [http-api.mjs](http-api.mjs) | Fetch several product records | Two concurrent request slots, HTTP status checks, and ordered results despite different response times. |
| [files.mjs](files.mjs) | Read documents and write JSON summaries | Bounded asynchronous file I/O and per-file results. |
| [retries-timeouts.mjs](retries-timeouts.mjs) | Process healthy, transiently failing, invalid, and slow jobs | Retry recovery, exponential backoff with jitter, per-attempt errors, terminal failures, and timeouts. |
| [lazy-progress.mjs](lazy-progress.mjs) | Process generated records without materializing input | Lazy synchronous iterables, slot refilling, progress snapshots, and unknown progress totals. |
| [bail.mjs](bail.mjs) | Stop admitting jobs after a terminal failure | Unclaimed jobs, failure reporting, and completion of already started work. |
| [service-upload-progress.mjs](service-upload-progress.mjs) | Upload a known list through a service wrapper | Forwarded async slot pool options and same-line stdout progress with `done/total`. |
| [service-lazy-progress.mjs](service-lazy-progress.mjs) | Upload discovered files with no upfront count | Unknown-total progress, success/failure counters, and a redirected-output fallback. |

## Expected Results and Adaptation

### Batch Calculations

`basic.mjs` returns totals of `30`, `40`, and `25` for three orders. Replace the calculation with your own transformation. Synchronous CPU work still executes on one thread; increasing concurrency does not make it CPU-parallel.

### API Requests

`http-api.mjs` starts a loopback HTTP server on an available port, fetches products 1-4 with concurrency 2, and closes the server after verification. Replace its base URL and response mapping with your API. Check `response.ok`, protect credentials outside source files, and choose a concurrency level your service can tolerate. Concurrency is not a requests-per-second rate limit.

### File Processing

`files.mjs` creates three temporary input documents and writes JSON summaries with word counts of `5`, `6`, and `4`. It verifies the output files and removes its entire temporary directory. For real workloads, supply your input and output directories deliberately; the sample never reads or modifies your project files.

### Retries and Timeouts

`retries-timeouts.mjs` produces two successes: `healthy` and `transient`, with the latter succeeding on its second attempt. `invalid` and `slow` each fail after three attempts. `retries: 2` means one initial attempt plus two retries. Timing and callback interleaving may vary.

All failures are eligible for retries; this pool does not classify transient versus permanent errors. Choose retries appropriately for your workload. Timeout does not cancel the handler, so the sample explicitly waits for outstanding work before exiting. Production handlers should implement cancellation where possible and make retried side effects idempotent.

### Lazy Records and Progress

`lazy-progress.mjs` generates 12 records with concurrency 3. Each progress snapshot has `total` and `pending` equal to `null`, and the final total is 12. Progress callbacks are fire-and-forget; their promises are not awaited. Lazy input avoids eager input materialization, but completed items and results remain in memory.

### Bail Mode

`bail.mjs` starts the first two jobs. The invalid job fails, the already-started job finishes, and the last two jobs are never claimed. Final statistics show `aborted: true`, one success, and one failure. Both completions produce progress updates. Bail is not cancellation, rollback, or dependency ordering; do not use parallel jobs as ordered transaction steps.

### Service Wrapper With Console Progress

Both service examples define a `DemoUploadService` whose `uploadFiles(relativePaths, asyncSlotPoolOptions)` method forwards the options to `asyncSlotPool`. Its arrow handler calls `this.uploadFile(relativePath)` without losing the service instance. Uploads are simulated; no files are read and no network requests are made. Replace `uploadFile` with your own service implementation.

`service-upload-progress.mjs` processes four paths and finishes with `Step 2 uploading 4/4`, followed by a summary on a new line. It uses the same calling pattern as an application service:

```js
const uploadOutcome = await daService.uploadFiles(files, {
	concurrency: 15,
	timeout: 10000,
	onProgress: ({ done, total }) => process.stdout.write(`\rStep 2 uploading ${done}/${total}`),
});
process.stdout.write('\n');
```

The complete sample uses `try/finally` to finish the line even if the pool rejects. A carriage return (`\r`) moves to the beginning of the current line rather than adding a new line. Progress messages should fit the terminal width; longer messages may wrap. Completion counters include both successful and failed tasks, not uploaded bytes, and `done` does not necessarily equal the success count. An empty input emits no progress callbacks, so use the returned statistics for its summary.

`service-lazy-progress.mjs` consumes five generated paths, simulates one unavailable file, and returns four successes and one failure. It displays a completed-file count rather than a percentage because iterable totals are `null` during execution. It updates one line when `process.stdout.isTTY` is true, pads shorter messages to erase leftover text, and writes a separate line per update for redirected output or CI logs. Failure details are printed after progress finishes to avoid overwriting the live line.

```sh
npm run build
node examples/service-upload-progress.mjs
node examples/service-lazy-progress.mjs
```

Run the scripts directly in an interactive terminal to see same-line rendering. Automated example checks can capture stdout and display it differently. Keep progress callbacks synchronous and lightweight; the pool does not await them or report their errors. When cleanup, cancellation, or mandatory logging is needed, handle it explicitly in the service.

## Run From an Installed Package

After version `1.0.1` is available on the registry, run these commands from a separate consumer project:

```sh
npm install @dipanshuhandoo/async-slot-pool@1.0.1
node node_modules/@dipanshuhandoo/async-slot-pool/examples/basic.mjs
node node_modules/@dipanshuhandoo/async-slot-pool/examples/http-api.mjs
```

Substitute any of the other filenames to run that use case. The scripts and this guide are included in the package; the repository's development runner is not. Each script imports its installed package through the same public export a consumer would use.

See the [package README](../README.md) for CommonJS, TypeScript, browser scripts, minified imports, and full option descriptions.