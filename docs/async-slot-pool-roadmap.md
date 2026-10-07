# Async Slot Pool Stability and Feature Roadmap

## Purpose

Centralize the async slot pool used across existing applications in the npm package, then improve reliability and add useful capabilities without disrupting those applications.

This is a proposal for discussion, not authorization to implement the features below. No implementation, release date, or performance improvement is promised by this document.

## Compatibility Boundary

Preserve the existing public API:

```js
asyncSlotPool(items, handler, options)
```

Keep its function name, signature, defaults, two-argument handler contract, callback payloads, result structure, and documented behavior stable. Existing service wrappers must continue to work without changes beyond importing the npm package instead of a copied script.

Following the naming alignment, `asyncSlotPool` is canonical and `workerPool` remains a compatibility alias. Preserve both exports and the legacy type aliases for existing applications. Validation messages use the new `asyncSlotPool:` prefix, which requires auditing any application checks matching the old prefix.

New capabilities should be explicitly opt-in or exposed through separate exports. Proposed names below are illustrative, not committed APIs.

Preserving names alone is not sufficient. Callback timing, error handling, retry decisions, iterator behavior, ordering, and completion semantics can also affect applications. Every change must identify what stays unchanged and demonstrate compatibility with tests. An opt-in feature must not change existing execution paths when omitted.

## 1. Migration Safety

Before adding features, make replacing copied scripts with the npm package predictable:

- Compare the script versions used in existing applications with the package implementation; copies may already differ.
- Add compatibility tests based on representative application workflows, especially upload-service wrappers and stdout progress callbacks.
- Document an import-only migration where the implementations are equivalent, and call out any differences where they are not.
- Initially pin an exact package version and migrate one application at a time.
- Keep a rollback path to the previously verified dependency version or local script during each migration.

Centralizing code also centralizes the impact of regressions. This is the highest-priority next step. External repositories have not been audited as part of this proposal.

## 2. Reliability Improvements

Strengthen the current implementation without intentionally changing its public contract:

- Expand tests for simultaneous failures, bail during retries, empty generators, late timeout rejections, and callback failures.
- Test scheduling-slot limits under sustained workloads and repeated pool executions. Distinguish slot limits from underlying handlers that continue after timeouts.
- Verify timer cleanup and absence of unhandled rejections.
- Add benchmarks for throughput, scheduling overhead, and retained memory before making performance changes.
- Check packaged compatibility across supported Node.js versions and browser consumers.

Iterator cleanup deserves investigation, but changing when generators close or when errors settle can affect callers. Treat those changes as compatibility-sensitive rather than routine internal refactoring.

### Acceptance Criteria

- Existing contract tests and representative application compatibility tests pass.
- Any optimization has a measured benefit and no unexplained behavioral difference.
- Published ESM, CommonJS, minified, TypeScript, and browser consumer checks remain green.

## 3. Optional Cancellation

Consider a separate export such as `asyncSlotPoolWithSignal` for cooperative cancellation.

It could stop new claims and pass an `AbortSignal` to handlers that explicitly support it, without changing the existing handler's `(item, index)` contract. This would support cancelling upload batches and other I/O workflows.

Cancellation can request that a handler stop; it cannot forcibly terminate arbitrary JavaScript or undo side effects. Define how cancellation interacts with retries, timeouts, already claimed tasks, callback delivery, and final results before implementation. The existing pool's timeout and bail behavior must remain unchanged.

## 4. Selective Retries

Consider an opt-in retry policy that distinguishes transient failures from permanent ones:

- Retry network failures, HTTP 429, and selected server errors where appropriate.
- Avoid retrying invalid input or authorization failures.
- Respect server-provided `Retry-After` delays when the handler exposes that information.
- Cap exponential backoff through an explicit policy.

The generic pool does not inherently know HTTP status codes or headers; a policy needs access to the handler's original error or explicitly supplied retry metadata. Preserve today's retry-all-task-failures behavior unless a caller selects a new policy. Do not replace the existing string-error result contract with a different structure.

This is particularly useful for API and upload workloads. Retried side effects still require application-level idempotency.

## 5. Streaming Results

Consider a separate async-iterator export such as `asyncSlotPoolStream`.

Consumers could process each completion immediately instead of retaining every item and result until the pool finishes. A separate streaming API could also accept asynchronous iterable inputs.

Specify backpressure, completion order versus input order, bounded buffering, failure reporting, iterator cleanup, and consumer cancellation before implementation. Input-order delivery can require buffering behind a slow earlier task, so it should not imply an unconditional constant-memory guarantee.

Keep the existing pool's compact, input-sorted success and failure arrays unchanged.

## 6. Rate Limiting

Consider a separate limiter or opt-in scheduling capability for requests per second. Concurrency controls simultaneous scheduling slots, not request frequency.

Combining concurrency and rate limiting could help applications avoid API throttling. Define burst behavior, retry accounting, cancellation while waiting, and whether limits apply per pool or across multiple pools. Do not silently impose rate limiting on existing callers.

## Defer For Now

- Automatic concurrency tuning.
- Pause/resume queues.
- Persistent or distributed jobs.
- Worker-thread execution for CPU parallelism.

These introduce substantially different behavior and operational complexity. Revisit them only when a concrete application requirement justifies the added surface area.

## Recommended Order

1. Compatibility audit and migration tests.
2. Reliability tests and measured benchmarks.
3. Selective retries for API workloads.
4. Cooperative cancellation.
5. Streaming results and rate limiting when applications need them.

## Decision Gate For Each Change

Before implementation, agree on the use case, API shape, backward-compatibility risks, and verification criteria. Prefer the smallest change that addresses a demonstrated need. Do not publish a behavioral change merely because existing function names remain the same.

Use semantic versioning according to the actual compatibility impact. Internal optimizations and compatible fixes may be patch releases; backward-compatible new capabilities generally belong in minor releases. Breaking existing behavior requires a major release unless the behavior is demonstrably outside the supported contract.