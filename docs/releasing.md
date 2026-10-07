# Release Guide

Publishing is manual. No GitHub workflow publishes this package. These commands work in PowerShell and other npm-supported shells; run them separately from the repository root.

## Prerequisites

- Node.js 22+ and npm. Use the committed development lockfile with `npm ci`.
- Ownership or publish permission for the `dipanshuhandoo` npm scope, independently of the similarly named GitHub account.
- A verified npm account meeting the current registry authentication and two-factor authentication requirements. Consult [npm publishing documentation](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages) and [two-factor authentication guidance](https://docs.npmjs.com/about-two-factor-authentication).
- An installed Playwright Chromium browser for the release gate.
- A reviewed, intended release state. Do not discard another contributor's uncommitted changes to obtain it.

```sh
npm ci
npx playwright install chromium
```

On Linux CI, use `npx playwright install --with-deps chromium`. Browser binaries are development prerequisites, not package dependencies.

## Confirm Registry and Identity

```sh
npm login --registry https://registry.npmjs.org/
npm whoami --registry https://registry.npmjs.org/
npm view @dipanshuhandoo/async-slot-pool name versions --json --registry https://registry.npmjs.org/
```

Enter passwords, one-time codes, and tokens directly in npm's terminal or browser prompts. Never commit them, put them in package scripts, or send them through an AI chat. Prefer interactive login for local releases; if tokens are necessary, follow npm's current token permissions and lifetime requirements.

A genuine package-not-found response may be expected before the first release, but authentication or network errors do not establish availability. An existing package requires checking its ownership and published versions. Scope ownership and publish permissions must be confirmed before publishing. Public scoped packages need explicit public access, which this repository configures.

## Prepare the Version

The manifest targets the upcoming `1.0.1` release. Confirm that the intended version is not already published, review `CHANGELOG.md`, and commit the intended release changes yourself. No implementation command in this repository creates a git commit or tag automatically.

For later releases, update the changelog and select the next semantic version:

```sh
npm version patch --no-git-tag-version
```

Use `minor` for backward-compatible features and `major` for breaking API or runtime-support changes. Commit both manifest and lockfile version updates. A published name/version pair cannot be overwritten, even after unpublishing it.

## Validate and Inspect

```sh
npm run verify
npm run pack:check
npm run publish:dry
```

`verify` builds, runs source tests and examples, checks ESM and CommonJS declarations, creates a real tarball, installs it into a temporary consumer project, runs the packaged examples, checks public exports and TypeScript resolution, and runs browser-bundler and global-script checks in Chromium. Both readable and minified builds are exercised. Temporary artifacts are removed.

`pack:check` checks the exact published file allowlist and prints tarball contents and size. The package contains only its manifest, README, MIT license, six canonical JavaScript builds with maps, two canonical declaration files, compatibility copies under legacy `workerPool` filenames, and eight example scripts with their guide. Source maps embed source text; review it as public content. Development tooling and the development lockfile are not included.

The canonical export is `asyncSlotPool`; legacy `workerPool` imports, type aliases, and CDN paths remain supported. Release verification checks both names across Node.js and browser formats. Validation error prefixes have changed to `asyncSlotPool:`, so review any message-matching consumers before adopting this change. Naming changes do not authorize overwriting an already published version; select an unused version before release.

`publish:dry` invokes npm's publication dry run and release lifecycle checks, but uploads nothing. Verification still creates and installs a local temporary tarball: it overrides inherited dry-run settings for those local commands only. A successful dry run is not proof of authentication, name availability, or publish permission.

## Publish

Only after all checks and ownership verification pass:

```sh
npm run publish:public
```

This runs `npm publish --access public --registry https://registry.npmjs.org/`. `prepublishOnly` requires full verification; `prepack` regenerates the build. Do not bypass lifecycle scripts for an actual publication. No scripts run automatically when consumers install the package.

There is no recursive release lifecycle: internal verification packs with `--ignore-scripts` after building. Ordinary `npm pack` runs the build automatically. A normal clone should run `npm ci` and `npm run build` before being used as a local package.

## Verify the Published Release

Check the registry metadata:

```sh
npm view @dipanshuhandoo/async-slot-pool version dist.integrity --registry https://registry.npmjs.org/
```

In a separate temporary consumer project, install the exact released version and exercise both formats. Substitute the actual version if it is not `1.0.1`:

```sh
npm install @dipanshuhandoo/async-slot-pool@1.0.1 --registry https://registry.npmjs.org/
node --input-type=module -e "import { asyncSlotPool } from '@dipanshuhandoo/async-slot-pool'; console.log(await asyncSlotPool([1], value => value + 1))"
node -e "const { asyncSlotPool } = require('@dipanshuhandoo/async-slot-pool'); asyncSlotPool([1], value => value + 1).then(console.log)"
```

Verify the version-pinned CDN browser script after CDN propagation. Update the README's initial-release notice and example version, move changelog entries to the released version, and create a git tag/GitHub release identifying the published commit. Never publish from a different state than the one the tag describes.

## Failed or Defective Releases

If publication fails, inspect the registry before retrying: the version might already have been uploaded. Do not assume a network error means nothing was published. A defective published version normally requires a new patch release and, when appropriate, `npm deprecate` with a clear replacement message. Review npm's current unpublish policy before considering removal.