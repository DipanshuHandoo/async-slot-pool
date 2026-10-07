import { build } from 'esbuild';
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = new URL('../dist/', import.meta.url);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const format of ['esm', 'cjs', 'iife']) {
  for (const minify of [false, true]) {
    const suffix = format === 'iife' ? '.global' : '';
    const extension = format === 'cjs' ? 'cjs' : 'js';
    await build({
      absWorkingDir: root,
      entryPoints: ['src/asyncSlotPool.js'],
      outfile: `dist/asyncSlotPool${suffix}${minify ? '.min' : ''}.${extension}`,
      bundle: true,
      format,
      platform: format === 'cjs' ? 'node' : 'browser',
      target: 'es2022',
      globalName: format === 'iife' ? 'AsyncSlotPool' : undefined,
      minify,
      sourcemap: true,
      legalComments: 'none',
      logLevel: 'warning',
    });
    const filename = `asyncSlotPool${suffix}${minify ? '.min' : ''}.${extension}`;
    const legacyFilename = filename.replace('asyncSlotPool', 'workerPool');
    await copyFile(new URL(filename, dist), new URL(legacyFilename, dist));
    await copyFile(new URL(`${filename}.map`, dist), new URL(`${legacyFilename}.map`, dist));
  }
}

for (const extension of ['d.ts', 'd.cts']) {
  await copyFile(new URL('../types/asyncSlotPool.d.ts', import.meta.url), new URL(`asyncSlotPool.${extension}`, dist));
  await copyFile(new URL(`asyncSlotPool.${extension}`, dist), new URL(`workerPool.${extension}`, dist));
}
console.log('Built ESM, CommonJS, browser scripts, source maps, and declarations.');