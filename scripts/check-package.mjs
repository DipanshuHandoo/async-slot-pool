import assert from 'node:assert/strict';
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { run } from './run.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const temporary = await mkdtemp(path.join(tmpdir(), 'async-slot-pool-'));
const canonicalFilenames = [
  'asyncSlotPool.js', 'asyncSlotPool.min.js', 'asyncSlotPool.cjs', 'asyncSlotPool.min.cjs',
  'asyncSlotPool.global.js', 'asyncSlotPool.global.min.js',
];
const filenames = [...canonicalFilenames, ...canonicalFilenames.map((name) => name.replace('asyncSlotPool', 'workerPool'))];
const exampleFilenames = [
  'basic.mjs', 'http-api.mjs', 'files.mjs', 'retries-timeouts.mjs', 'lazy-progress.mjs', 'bail.mjs',
  'service-upload-progress.mjs', 'service-lazy-progress.mjs',
];
const expectedFiles = [
  'package.json', 'README.md', 'LICENSE', 'dist/asyncSlotPool.d.ts', 'dist/asyncSlotPool.d.cts',
  'dist/workerPool.d.ts', 'dist/workerPool.d.cts',
  'examples/README.md', ...exampleFilenames.map((filename) => `examples/${filename}`),
  ...filenames.flatMap((name) => [`dist/${name}`, `dist/${name}.map`]),
].sort();

async function exercise(asyncSlotPool) {
  let attempts = 0;
  const progress = [];
  const result = await asyncSlotPool([3, 1, 2], async (item, index) => {
    await Promise.resolve();
    if (item === 1 && attempts++ === 0) throw new Error('retry');
    return item + index;
  }, { concurrency: 2, retries: 1, retryDelay: 0, onProgress: (stats) => { progress.push(stats.done); } });
  if (JSON.stringify(result.succeeded.map(({ result: value }) => value)) !== '[3,2,4]') {
    throw new Error('Results differ from the source contract.');
  }
  if (JSON.stringify(progress) !== '[1,2,3]') throw new Error('Progress snapshots differ.');
  const failed = await asyncSlotPool(new Set([1]), () => { throw new Error('failed'); });
  if (failed.failed[0].error !== 'failed' || failed.failed[0].attempts !== 1) throw new Error('Failure contract differs.');
  let rejected = false;
  try { await asyncSlotPool([1], (item) => item, { concurrency: 0 }); } catch (error) { rejected = /^asyncSlotPool:/.test(error.message); }
  if (!rejected) throw new Error('Validation is missing.');
  return { values: result.succeeded.map(({ result: value }) => value), progress, failed: failed.failed };
}

try {
  if (!process.argv.includes('--built')) run('npm', ['run', 'build'], { cwd: root });
  assert.equal(metadata.name, '@dipanshuhandoo/async-slot-pool');
  assert.equal(metadata.license, 'MIT');
  assert.equal(metadata.publishConfig.access, 'public');
  assert.equal(metadata.publishConfig.registry, 'https://registry.npmjs.org/');
  assert.equal(metadata.private, undefined);
  assert.equal(Object.keys(metadata.dependencies ?? {}).length, 0);
  const packing = ['pack', '--json', '--ignore-scripts', '--pack-destination', temporary];
  packing.push(process.argv.includes('--list') ? '--dry-run' : '--dry-run=false');
  const packingResult = JSON.parse(run('npm', packing, { cwd: root, capture: true }));
  const packed = Array.isArray(packingResult) ? packingResult[0] : packingResult[metadata.name];
  assert.ok(packed, 'npm pack must return metadata for this package.');
  assert.deepEqual(packed.files.map(({ path: filename }) => filename).sort(), expectedFiles);
  for (const filename of filenames) {
    const map = JSON.parse(await readFile(path.join(root, 'dist', `${filename}.map`), 'utf8'));
    assert.ok(map.sources.every((source) => !path.isAbsolute(source) && !/^[a-z]:/i.test(source)));
  }
  if (process.argv.includes('--list')) {
    console.log(`Tarball allowlist passed: ${packed.files.length} files, ${packed.size} bytes.`);
    console.log(expectedFiles.join('\n'));
  } else {
    const consumer = path.join(temporary, 'consumer');
    await mkdir(consumer);
    await writeFile(path.join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
    run('npm', ['install', path.join(temporary, packed.filename), '--dry-run=false', '--ignore-scripts', '--no-package-lock', '--no-audit', '--no-fund'], { cwd: consumer });
    run(process.execPath, [
      '--test', ...exampleFilenames.map((filename) => path.join(consumer, 'node_modules', metadata.name, 'examples', filename)),
    ], { cwd: consumer });
    const name = JSON.stringify(metadata.name);
    for (const subpath of ['', '/min']) {
      const specifier = JSON.stringify(metadata.name + subpath);
      const esm = `import { asyncSlotPool, workerPool } from ${specifier}; if (asyncSlotPool !== workerPool) throw new Error('Legacy alias differs'); console.log(JSON.stringify(await (${exercise.toString()})(asyncSlotPool)));`;
      const commonjs = `const { asyncSlotPool, workerPool } = require(${specifier}); if (asyncSlotPool !== workerPool) throw new Error('Legacy alias differs'); (${exercise.toString()})(asyncSlotPool).then((value) => console.log(JSON.stringify(value))).catch((error) => { console.error(error); process.exitCode = 1; });`;
      const esmResult = run(process.execPath, ['--input-type=module', '--eval', esm], { cwd: consumer, capture: true });
      const cjsResult = run(process.execPath, ['--input-type=commonjs', '--eval', commonjs], { cwd: consumer, capture: true });
      assert.deepEqual(JSON.parse(esmResult), JSON.parse(cjsResult));
    }
    for (const extension of ['mts', 'cts']) {
      await copyFile(path.join(root, 'test', 'types', `consumer.${extension}`), path.join(consumer, `consumer.${extension}`));
    }
    run(process.execPath, [
      path.join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--module', 'nodenext', '--target', 'es2022',
      'consumer.mts', 'consumer.cts',
    ], { cwd: consumer });
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
      const scripts = [];
      for (const filename of ['asyncSlotPool.global.js', 'asyncSlotPool.global.min.js', 'workerPool.global.js', 'workerPool.global.min.js']) {
        scripts.push(await readFile(path.join(consumer, 'node_modules', metadata.name, 'dist', filename), 'utf8'));
      }
      for (const subpath of ['', '/min']) {
        const bundled = await build({
          absWorkingDir: consumer,
          stdin: { contents: `export { asyncSlotPool, workerPool } from ${JSON.stringify(metadata.name + subpath)};`, resolveDir: consumer },
          bundle: true, platform: 'browser', format: 'iife', globalName: 'AsyncSlotPool', write: false, target: 'es2022',
        });
        scripts.push(bundled.outputFiles[0].text);
      }
      let reference;
      for (const script of scripts) {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        try {
          await page.addScriptTag({ content: script });
          assert.equal(await page.evaluate(() => AsyncSlotPool.asyncSlotPool === AsyncSlotPool.workerPool), true);
          const result = await page.evaluate(`(${exercise.toString()})(AsyncSlotPool.asyncSlotPool)`);
          assert.deepEqual(errors, []);
          if (reference) assert.deepEqual(result, reference);
          reference = result;
        } finally {
          await page.close();
        }
      }
    } finally {
      await browser?.close();
    }
    console.log(`Packed ${name}: ESM, CommonJS, TypeScript, browser bundlers, and browser globals passed (including minified builds).`);
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}