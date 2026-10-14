import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ExecutionMode, FinishReason, ScenarioType } from '@nimiplatform/sdk/runtime/generated';

await mkdir('.nimi/local/test', { recursive: true });
await build({ entryPoints: ['src/capabilities/studio-create/runtime.ts'],
  outfile: '.nimi/local/test/text-stream.mjs', bundle: true, platform: 'node', format: 'esm', packages: 'external' });
const { studioCreateRuntimeHandlers } = await import(pathToFileURL(path.resolve('.nimi/local/test/text-stream.mjs')));

test('reasoning summaries never finish a script stream or become narration', async () => {
  const events = [];
  let closes = 0;
  const subscription = {
    cancel: async () => { closes++; },
    async *[Symbol.asyncIterator]() {
      yield { type: 'reasoning-summary', sequence: '1', traceId: 'fixture', itemIndex: 0, text: 'not narration', itemCompleted: true };
      yield { type: 'delta', sequence: '2', traceId: 'fixture', text: 'fixture script' };
      yield { type: 'reasoning-summary', sequence: '3', traceId: 'fixture', itemIndex: 1, text: 'still not narration', itemCompleted: true };
      yield { type: 'completed', sequence: '4', traceId: 'fixture', finishReason: 'stop' };
    },
  };
  await studioCreateRuntimeHandlers['chat.stream']({
    capability: { id: 'chat.stream', label: 'Script' }, prompt: 'fixture prompt', input: {}, scenarioId: 'fixture',
    host: {
      appId: 'fixture', surfaceId: 'fixture', client: { ai: { text: { streamTurn: async () => subscription } } },
      runners: { aiConsume: async ({ runtime }) => {
        for await (const event of runtime.ai.streamScenario({ scenarioType: ScenarioType.TEXT_GENERATE,
          executionMode: ExecutionMode.STREAM, extensions: [], spec: { spec: { oneofKind: 'textGenerate',
            textGenerate: { systemPrompt: '', input: [{ role: 'user', content: 'fixture prompt' }], tools: [], toolChoiceName: '', stop: [] } } } })) {
          events.push(event);
        }
        return { ok: true, message: 'unit fixture', output: { kind: 'text', text: 'fixture script' } };
      } },
      nonSuccess: () => { throw new Error('Unexpected non-success'); },
    },
  });
  assert.deepEqual(events.map(event => event.payload.oneofKind), ['started', 'delta', 'delta', 'completed']);
  assert.equal(events[1].payload.delta.delta.textOutputItem.delta.text.text, 'fixture script');
  assert.equal(events[3].sequence, '4');
  assert.equal(events[3].payload.completed.finishReason, FinishReason.STOP);
  assert.equal(closes, 1);
});
