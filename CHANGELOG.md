# Changelog

## 1.0.1 (Unreleased)

- Add six runnable examples for batch transformations, local HTTP requests, file processing, retries and timeouts, lazy iterable progress, and bail mode.
- Add two service-upload examples showing same-line stdout progress, unknown totals, failure summaries, and redirected-output handling.
- Include the examples and their use-case guide in the npm package.
- Add `npm run examples` and check the examples during release verification, including from an installed tarball.

## 1.0.0 (Initial Release Work)

- Prepare `@dipanshuhandoo/async-slot-pool` for its first public release with no runtime dependencies.
- Add readable and minified ESM, CommonJS, and browser script builds with source maps.
- Add TypeScript declarations for ESM and CommonJS consumers.
- Add scheduler tests, installed-tarball consumer checks, and real-browser compatibility tests.
- Report progress for terminal bail failures and capture distinct progress snapshots per completion.
- Document scheduling, timeout, retry, callback, iterator, and memory guarantees.
- Add manual release commands and Windows/Linux validation-only CI.