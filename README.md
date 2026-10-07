# Async Slot Pool

Dependency-free asynchronous task scheduling with bounded concurrency, automatic slot refilling, retries, timeouts, lazy iterable input, and progress callbacks.

## Install

```sh
npm install @dipanshuhandoo/async-slot-pool
```

Requires Node.js 22+ or a modern browser. TypeScript declarations are included. The package is being prepared for its first public release; registry availability must be confirmed before installation instructions can be used.

## ESM and Browser Bundlers

```js
import { asyncSlotPool } from '@dipanshuhandoo/async-slot-pool';

const { succeeded, failed, stats } = await asyncSlotPool(
  ['https://example.com/a', 'https://example.com/b'],
  async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  },
  { concurrency: 5, retries: 2, retryDelay: 500, retryJitter: 25 },
);
```

## CommonJS

```js
const { asyncSlotPool } = require('@dipanshuhandoo/async-slot-pool');
asyncSlotPool([1, 2, 3], (item) => item * 2).then(console.log);
```

## Minified Imports

```js
import { asyncSlotPool } from '@dipanshuhandoo/async-slot-pool/min';
```

CommonJS consumers can use `require('@dipanshuhandoo/async-slot-pool/min')`. Browser bundlers can use either entry; bundlers typically perform their own production minification.

## Naming Compatibility

`asyncSlotPool` is the canonical function. Existing applications may still import `workerPool`; it is an alias of the same function, not a second implementation. The handler signature, options, callbacks, and results are unchanged. `AsyncSlotPoolOptions` and `AsyncSlotPoolResult` are the canonical types; `WorkerPoolOptions` and `WorkerPoolResult` remain compatibility aliases.

Local names are your choice:

```js
import { asyncSlotPool as workerPool } from '@dipanshuhandoo/async-slot-pool';
```

Browser scripts expose `AsyncSlotPool.asyncSlotPool` and retain `AsyncSlotPool.workerPool`. Existing `dist/workerPool.*` filenames remain available for published CDN links; new examples and package entries use `dist/asyncSlotPool.*`. The old repository source path re-exports the canonical implementation.

Validation errors now start with `asyncSlotPool:` instead of `workerPool:`. Update any application checks that match the old message prefix. Error classes and validation rules are unchanged.

## Direct Browser Script

After publication, use a version-pinned CDN URL, substituting the actual released version:

```html
<script src="https://cdn.jsdelivr.net/npm/@dipanshuhandoo/async-slot-pool@1.0.1/dist/asyncSlotPool.global.min.js"></script>
<script>
  AsyncSlotPool.asyncSlotPool([1, 2, 3], (item) => item * 2).then(console.log);
</script>
```

The readable browser build is `dist/asyncSlotPool.global.js`. Browser script builds expose `AsyncSlotPool.asyncSlotPool`. No Node.js polyfills are required; your handler's APIs must still exist in its runtime.

## TypeScript

```ts
import { asyncSlotPool, type AsyncSlotPoolOptions } from '@dipanshuhandoo/async-slot-pool';

const options: AsyncSlotPoolOptions<number> = { concurrency: 2 };
const result = await asyncSlotPool([1, 2], async (item) => String(item), options);
// result.succeeded contains TaskSuccess<number, string> entries.
```

Declarations support modern NodeNext/Node16 and bundler module resolution, with separate CommonJS declarations. They infer input and awaited result types.

## Runnable Examples

See the [examples guide](examples/README.md) for eight complete use cases: batch calculations, HTTP requests, file processing, retries and timeouts, lazy records with progress, bail mode, and two service-upload examples with stdout progress. All examples run locally without credentials or external services and include result assertions.

From a repository checkout, run `npm run examples` to build and check them all. The examples are also included in the npm package; after installing it in a consumer project, run an individual example:

```sh
node node_modules/@dipanshuhandoo/async-slot-pool/examples/http-api.mjs
```

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `concurrency` | `5` | Positive integer number of active scheduling slots. |
| `timeout` | `0` | Per-attempt timeout in milliseconds; zero disables it. |
| `retries` | `0` | Additional attempts after a failure. |
| `retryDelay` | `500` | Base retry delay in milliseconds, doubled each retry. |
| `retryJitter` | `0` | Random extra delay as a percentage of the base delay, normalized to 0-100. |
| `bail` | `false` | Stop claiming new items after a task exhausts its attempts. |
| `onProgress` | `null` | Fire-and-forget callback receiving completion counters. |
| `onTaskError` | `null` | Fire-and-forget callback receiving each failed attempt. |

Results contain `succeeded`, `failed`, and `stats`. Both result arrays are compact and sorted by original input index; use each entry's `index`, not its array position, to identify the input. Failure errors are strings. Inputs may be arrays or synchronous iterables, not asynchronous iterables.

## Behavioral Limits

- This is asynchronous concurrency, not CPU parallelism or a worker-thread engine. A blocking synchronous handler blocks the event loop; timers cannot interrupt it.
- Timeouts do not cancel underlying handlers. Timed-out work can keep running, and retries can overlap it. Use handler-level cancellation where needed and make retried operations idempotent.
- Bail stops new claims after terminal failure; it waits for already claimed tasks and their retries to finish.
- Input iteration is lazy, but successes and failures retain items and results. Total result memory grows with completed work.
- Progress `pending` counts unfinished items, including in-flight work. Iterable progress totals are `null`; final iterable totals count completed claimed items, including when bail truncates input.
- Callback errors are swallowed and callback promises are not awaited. Flush logging or persistence yourself if completion matters.
- Iterator errors reject the pool promise. Other claimed tasks are not cancelled. Early termination does not call the iterator's `return()`; manage resource-owning iterators explicitly.
- Concurrency does not enforce a requests-per-second rate limit.

See the [API reference](docs/asyncSlotPool.md) for detailed examples and [release guide](docs/releasing.md) for publishing instructions. The reference is maintained in the repository, not included in the npm tarball.

## Development

```sh
npm ci
npx playwright install chromium
npm test
npm run examples
npm run test:types
npm run test:package
npm run verify
npm run pack:check
npm run publish:dry
```

`npm run build` produces readable and minified ESM, CommonJS, browser scripts, source maps, and declarations in `dist/`. Only development tooling has dependencies. `npm run verify` checks source behavior, the runnable examples, and the installed tarball, including real Chromium execution. Installed-tarball checks also run the packaged examples. Linux CI may need `npx playwright install --with-deps chromium`.

Public publishing is deliberately manual: `npm run publish:public`. It runs release verification first and requires npm authentication, scope permissions, and current registry security requirements. Do not publish until the release guide's checklist is complete.

## Support and License

Report reproducible bugs through [GitHub Issues](https://github.com/DipanshuHandoo/worker_pool/issues). See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md) for repository guidance. No guaranteed support response time is offered.

MIT; see [LICENSE](LICENSE).