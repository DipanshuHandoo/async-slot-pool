# Contributing

Report bugs and proposed changes through [GitHub Issues](https://github.com/DipanshuHandoo/worker_pool/issues). Include the package version, Node.js or browser version, operating system, a minimal reproducer, expected behavior, and actual behavior. Remove credentials and private data.

## Local Setup

```sh
npm ci
npx playwright install chromium
npm run verify
```

Node.js 22+ is required for development. CI checks supported Node.js majors on Windows and Linux. Linux browser testing may require `npx playwright install --with-deps chromium`.

## Changes

Keep changes focused and add regression tests in `test/workerPool.test.js` for scheduler behavior. Update `types/workerPool.d.ts` and the type fixtures if the public API changes. Update the README, API reference, and changelog when behavior or support changes.

Generated `dist/` files are not committed; rebuild them with `npm run build`. Commit development dependency changes together with `package-lock.json`. Do not add runtime dependencies without discussing the tradeoff.

Run `npm test` for focused scheduler changes, `npm run test:types` for declarations, and `npm run test:package` for consumer compatibility. Before submitting, run `npm run verify` and `npm run pack:check`. Package tests install a tarball into temporary projects and clean them up.

Publishing is maintainer-only and manual; see [docs/releasing.md](docs/releasing.md). Pull-request CI does not receive publishing credentials and cannot publish. This project offers community support without a guaranteed response time.