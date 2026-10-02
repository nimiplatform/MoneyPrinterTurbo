import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
await mkdir('.nimi/local/test', { recursive: true });
await build({ entryPoints: ['src/production/script.ts'], outfile: '.nimi/local/test/script.mjs', bundle: true, platform: 'node', format: 'esm' });
const { parseVisualTerms } = await import(pathToFileURL(path.resolve('.nimi/local/test/script.mjs')));
test('visual terms preserve phrase order across explicit list formats', () => {
  const expected = ['rain stopped', 'walking along the river', 'sunlight on water'];
  assert.deepEqual(parseVisualTerms(expected.join(', ')), expected);
  assert.deepEqual(parseVisualTerms('```json\n'+JSON.stringify(expected)+'\n```'), expected);
  assert.deepEqual(parseVisualTerms(expected.map((s, i) => `${i+1}. ${s}`).join('\n')), expected);
});
test('malformed JSON, prose and excessive terms are not accepted as a keyword list', () => {
  for (const input of ['["river",', '{"terms":["river"]}', 'Here is a description of a walk.', JSON.stringify(Array(51).fill('river'))])
    assert.throws(() => parseVisualTerms(input));
});
