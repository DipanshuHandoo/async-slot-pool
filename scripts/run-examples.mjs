import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './run.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, 'examples');
if (!process.argv.includes('--built')) run('npm', ['run', 'build'], { cwd: root });
const examples = (await readdir(directory))
  .filter((filename) => filename.endsWith('.mjs'))
  .sort()
  .map((filename) => path.join(directory, filename));
if (examples.length === 0) throw new Error('No runnable examples were found.');
run(process.execPath, ['--test', ...examples], { cwd: root });
console.log(`All ${examples.length} examples passed.`);