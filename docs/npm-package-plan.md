# Async Slot Pool: npm Packaging and Release Plan

## Goal

Publish the existing worker pool as `@dipanshuhandoo/async-slot-pool`, retaining the named `workerPool` API and zero runtime dependencies. The scope was selected during implementation; npm ownership and publish permission still require verification before publishing.

Support Node.js ESM and CommonJS, TypeScript, browser bundlers, and direct browser scripts. Provide readable and minified builds. Publishing will use local npm commands, not automated releases.

## Baseline Findings Before Implementation

- `package.json` points to a nonexistent entry file, has an empty description, and has no working tests or build command.
- `src/workerPool.js` implements asynchronous task scheduling, not CPU parallelism through worker threads.
- `docs/workerPool.md` needs installed-package import examples and corrected timeout, bail, progress, and memory descriptions.
- `LICENSE` already contains the MIT license.

## Phase 1: Establish the Release Contract

1. Verify ownership of your npm scope and registry availability of the chosen package name. Set public access explicitly.
2. Preserve `workerPool(items, handler, options)` and its compact, index-sorted success and failure arrays. Document all eight options and callback/result types.
3. Define Node.js 22+ support, with tests against supported Node majors at implementation time. Browser support means modern browsers with promises, iterables, and timers.
4. Correct the behavioral contract before advertising it:
   - Timeout rejects an attempt but does not cancel its underlying work; retries can overlap timed-out work.
   - Bail stops new task claims after a terminal failure; in-flight tasks and retries may continue.
   - Lazy input avoids eager materialization, but accumulated results still consume memory.
   - Callbacks are fire-and-forget; their errors are swallowed.
   - `pending` currently includes unfinished tasks, not just unstarted tasks.
5. Add regression coverage and fix the bail path skipping its terminal progress notification. Characterize iterator failures and cleanup; any needed correction must remain narrowly scoped.

## Phase 2: Package and Build

Depends on Phase 1.

6. Update metadata: name, description, author, MIT license, keywords, engines, repository, homepage, and issue URL. Suggested description: "Dependency-free async task pool with bounded concurrency, retries, timeouts, lazy iterable input, and progress callbacks."
7. Use esbuild as a development dependency to produce readable and minified ESM, CommonJS, and browser IIFE builds. Browser scripts expose `AsyncSlotPool.workerPool`.
8. Configure explicit `exports` for the main API and a minified subpath. Set compatible `main`, `module`, and declaration entries. Keep browser bundler imports on the ESM build.
9. Provide generic TypeScript declarations covering synchronous iterables, handlers, options, nullable progress totals, callbacks, failures, and results. Ensure CommonJS consumers receive correctly resolved declarations.
10. Allowlist only distributable builds, declarations, README, and license in the npm tarball. Exclude tests, tooling, caches, and repository configuration. Generate source maps without leaking machine-specific paths.

## Phase 3: Tests and Repository Support

Tests and documentation can proceed in parallel after Phase 1.

11. Replace the placeholder test command with Node's built-in test runner. Cover concurrency and slot refilling, empty inputs, ordering, synchronous and asynchronous handlers, lazy iteration, validation, retries, jitter, timeout, bail, callbacks, and statistics.
12. Test the packed package, not only source: install its tarball in temporary consumer projects and exercise ESM imports, CommonJS `require`, TypeScript resolution, bundling, and minified equivalents.
13. Smoke-test both browser script builds in a real browser, verifying the global API and representative pool behavior.
14. Add a README with installation and examples for each consumer format; retain the detailed reference documentation. Add contribution, security-reporting, changelog, and release guidance.
15. Commit the development lockfile, ignore generated artifacts, and add GitHub Actions for build/test checks on pull requests. Do not add automated publishing.

## Phase 4: Local Release Commands

Depends on successful package-consumer verification.

16. Provide `npm run build`, `npm test`, `npm run test:types`, `npm run test:package`, and `npm run verify`.
17. Provide `npm run pack:check`, `npm run publish:dry`, and `npm run publish:public`. Use public access explicitly; require verification through `prepublishOnly`, and build through `prepack`.
18. Avoid lifecycle recursion: tarball tests run after building and pack with lifecycle scripts disabled. Scripts must work on Windows without Unix-only shell commands.
19. Document authentication, account verification, scope permissions, current npm publishing and two-factor authentication requirements, and registry checks. No tokens belong in committed files.
20. Release sequence: verify, inspect the dry-run tarball, select a semantic version, publish, install from npm in a clean project, and tag the released commit. Explain that published name/version pairs cannot be overwritten.

## Relevant Files

Repository root: `d:\Github Personal\worker_pool`.

- `package.json`: metadata, exports, distribution allowlist, scripts, and development dependencies.
- `src/workerPool.js`: reuse `workerPool`, `validate`, `createSource`, and `withTimeout`; apply only covered contract corrections.
- `docs/workerPool.md`: installed-package examples and accurate behavioral guarantees.
- Planned additions: root README and support documents; `scripts/` build and package checks; `test/` coverage; `types/` declarations; `.github/workflows/` validation; generated `dist/`.

## Release Gates

- Behavioral, type-resolution, packed-consumer, browser, and minified-parity tests pass.
- Tarball contents match the distribution allowlist and contain no credentials or unwanted repository files.
- Public exports load in every supported consumer format.
- Documentation matches tested behavior.
- Scope ownership, package availability, and publishing authentication are verified.

## Scope Boundaries

No game component, worker-thread engine, cancellation API, streaming results, asynchronous iterable API, or automated publishing. These would be separate features.

Registry requirements can change and must be checked before the first release. The phases above describe the agreed plan; implementation progress is recorded below.

## Implementation Status: 2026-10-07

- Implemented the public scoped package manifest, explicit ESM/CommonJS exports, minified subpath, browser script exports, public registry configuration, and distribution allowlist.
- Implemented six esbuild outputs, source maps, ESM/CommonJS TypeScript declarations, and development-only dependencies with a generated lockfile ready for review and commit.
- Added 15 scheduler tests and fixed terminal bail progress delivery and per-completion progress snapshots.
- Implemented installed-tarball checks for readable/minified ESM and CommonJS, TypeScript declarations, browser bundlers, and browser globals using real Chromium.
- Added manual build, verification, tarball inspection, dry-run publication, and public publication commands. Publishing verification handles inherited npm dry-run settings without uploading anything.
- Added README, corrected API reference, contribution guidance, security policy, changelog, release guide, and validation-only Windows/Linux CI for Node.js 22, 24, and 26.
- Local checks passed on Windows with Node.js 24.16.0: behavior tests, builds, type checks, installed-package/browser checks, full release verification, tarball allowlist inspection, and npm publication dry run. The inspected tarball contains 17 files and is approximately 22 KB compressed.
- Registry lookup returned package-not-found for the chosen name. This does not establish scope ownership, publish permission, or guaranteed future name availability.
- The publication dry run reported that registry login is required. No package has been published and no git commit or tag has been created.

### Remaining Release Prerequisites

1. Authenticate to npm, verify the account's scope ownership and permissions, and satisfy current registry security requirements.
2. Run the configured GitHub Actions matrix; only the local Windows/Node.js 24 checks have been executed in this implementation session.
3. Enable private vulnerability reporting in the GitHub repository if not already enabled.
4. Review the initial version, public tarball contents, changelog, and documentation; commit the intended release state.
5. Publish manually, verify installation from the public registry and the version-pinned CDN, and tag the published commit.