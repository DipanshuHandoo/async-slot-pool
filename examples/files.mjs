import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { workerPool } from '@dipanshuhandoo/async-slot-pool';

const temporary = await mkdtemp(path.join(tmpdir(), 'slot-pool-example-'));
const inputDirectory = path.join(temporary, 'input');
const outputDirectory = path.join(temporary, 'output');

try {
  await mkdir(inputDirectory);
  await mkdir(outputDirectory);
  const documents = {
    'first.txt': 'Small batches keep resources available.',
    'second.txt': 'Every finished slot picks another file.',
    'third.txt': 'Results retain input order.',
  };
  for (const [filename, contents] of Object.entries(documents)) {
    await writeFile(path.join(inputDirectory, filename), contents, 'utf8');
  }
  const filenames = (await readdir(inputDirectory)).filter((filename) => filename.endsWith('.txt')).sort();
  const { succeeded, failed } = await workerPool(filenames, async (filename) => {
    const contents = await readFile(path.join(inputDirectory, filename), 'utf8');
    const result = { filename, words: contents.trim().split(/\s+/).filter(Boolean).length };
    await writeFile(path.join(outputDirectory, `${filename}.json`), JSON.stringify(result, null, 2), 'utf8');
    return result;
  }, { concurrency: 2 });

  assert.equal(failed.length, 0);
  assert.deepEqual(succeeded.map(({ result }) => result.words), [5, 6, 4]);
  for (const { result } of succeeded) {
    const saved = JSON.parse(await readFile(path.join(outputDirectory, `${result.filename}.json`), 'utf8'));
    assert.deepEqual(saved, result);
  }
  console.table(succeeded.map(({ result }) => result));
  console.log('Created and verified JSON summaries; temporary files will be removed.');
} finally {
  await rm(temporary, { recursive: true, force: true });
}