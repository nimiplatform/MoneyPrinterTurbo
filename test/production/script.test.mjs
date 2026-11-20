import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
await mkdir('.nimi/local/test', { recursive: true });
await build({
  entryPoints: ['src/production/script.ts'],
  outfile: '.nimi/local/test/script.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
});
const { cleanGeneratedScript, parseVisualTerms, prepareNarrationText } = await import(
  pathToFileURL(path.resolve('.nimi/local/test/script.mjs'))
);

test('visual terms preserve phrase order across explicit list formats and prose-wrapped JSON arrays', () => {
  const expected = ['rain stopped', 'walking along the river', 'sunlight on water'];
  assert.deepEqual(parseVisualTerms(expected.join(', ')), expected);
  assert.deepEqual(parseVisualTerms(expected.join('，')), expected);
  assert.deepEqual(parseVisualTerms('```json\n' + JSON.stringify(expected) + '\n```'), expected);
  assert.deepEqual(
    parseVisualTerms('<think>plan</think>Here are the phrases:\n' + JSON.stringify(expected) + '\nNote: use portrait.'),
    expected,
  );
  assert.deepEqual(parseVisualTerms(expected.map((s, i) => `${i + 1}. ${s}`).join('\n')), expected);
});

test('malformed JSON, prose without array and excessive terms are not accepted as a keyword list', () => {
  for (const input of [
    '["river",',
    '{"terms":["river"]}',
    'Here is a description of a walk.',
    JSON.stringify(Array(51).fill('river')),
  ])
    assert.throws(() => parseVisualTerms(input));
});

test('generated script strips fences, unopened think blocks and markdown link URLs while keeping inline sharps', () => {
  const raw = 'internal reasoning</think>\n```markdown\n# Morning Notes\nLearn [C# basics](https://example.com/c(sharp)) in **#1** minute.\n* * *\n```';
  assert.equal(cleanGeneratedScript(raw), 'Morning Notes\nLearn C# basics in #1 minute.');
  assert.throws(() => cleanGeneratedScript('<think>only reasoning</think>'));
});

test('narration preparation removes emoji and half/fullwidth pause tags while preserving text symbols and keycap digits', () => {
  assert.equal(
    prepareNarrationText('Big news 🚀Launching（停顿：2秒）[停顿3秒] Ready to grow 📈?'),
    'Big news Launching Ready to grow?',
  );
  assert.equal(
    prepareNarrationText('倒计时 3️⃣2️⃣1️⃣ 太棒了🎉出发 ★ ©'),
    '倒计时 3 2 1 太棒了出发 ★ ©',
  );
  assert.equal(prepareNarrationText('[paused] [暂停一下]'), '[paused] [暂停一下]');
  assert.throws(() => prepareNarrationText('🚀🎉 [pause: 2s] （停顿1秒）'));
});
