import { fileURLToPath } from 'node:url';
import { run } from './run.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
run('npm', ['run', 'build'], { cwd: root });
run('npm', ['test'], { cwd: root });
run(process.execPath, ['scripts/run-examples.mjs', '--built'], { cwd: root });
run(process.execPath, [
  'node_modules/typescript/bin/tsc', '--noEmit', '--strict', '--module', 'nodenext', '--target', 'es2022',
  'test/types/consumer.mts', 'test/types/consumer.cts',
], { cwd: root });
run(process.execPath, ['scripts/check-package.mjs', '--built'], { cwd: root });
console.log('Release verification passed.');