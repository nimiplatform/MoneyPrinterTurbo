import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
await mkdir('.nimi/local/test', { recursive: true });
await build({ entryPoints: ['src-electron/integration.ts', 'src-electron/task-list.ts'], outdir: '.nimi/local/test/integration', bundle: true, platform: 'node', format: 'esm', outExtension: { '.js': '.mjs' } });
const { HostAutomation } = await import(pathToFileURL(path.resolve('.nimi/local/test/integration/integration.mjs')));
const { taskPage } = await import(pathToFileURL(path.resolve('.nimi/local/test/integration/task-list.mjs')));

test('large task histories are paginated without timelines and remain stable as new tasks arrive', () => {
  const tasks = Array.from({ length: 130 }, (_, n) => ({
    id: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`, createdAt: '2026-10-03T00:00:00Z',
    params: { topic: '雨'.repeat(2000), aspect: '9:16', stopAt: 'video' }, artifacts: [],
    words: Array(200).fill({ text: 'word', startSeconds: 0, endSeconds: 1 }),
  }));
  const first = taskPage(tasks, undefined, 50);
  assert.equal(first.tasks.length, 50);
  assert.ok(Buffer.byteLength(JSON.stringify(first)) < 1024 * 1024);
  assert.ok(first.tasks.every((t) => !('words' in t) && t.topic.length === 256));
  tasks.push({ ...tasks[0], id: '10000000-0000-0000-0000-000000000000', createdAt: '2026-10-04T00:00:00Z' });
  const second = taskPage(tasks, first.nextCursor, 50);
  const third = taskPage(tasks, second.nextCursor, 50);
  assert.equal(new Set([...first.tasks, ...second.tasks, ...third.tasks].map((t) => t.id)).size, 130);
  assert.equal(third.nextCursor, null);
  for (const limit of [0, 51, 1.5, '20']) assert.throws(() => taskPage(tasks, undefined, limit));
  assert.throws(() => taskPage(tasks, 'invalid'));
});

test('an oversized UTF-8 result and a rejected callback do not kill later calls or replay writes', async () => {
  // Fault-only callback transport test; these fixtures are not product or media success evidence.
  let writes = 0;
  let polled = false;
  const callbacks = [];
  const finished = Promise.withResolvers();
  let automation;
  const services = { integration: {
    registerProvider: async () => {},
    pollProvider: async () => {
      assert.equal(polled, false);
      polled = true;
      return { calls: [
        { callId: 'oversized', operation: 'task', inputJson: '{"id":"large"}' },
        { callId: 'write', operation: 'create', inputJson: '{"params":{}}' },
        { callId: 'next', operation: 'list', inputJson: '{}' },
      ] };
    },
    completeProvider: async (result) => {
      assert.ok(Buffer.byteLength(result.resultJson) <= 1024 * 1024);
      callbacks.push(result);
      if (result.callId === 'write') throw new Error('callback transport rejected');
      if (result.callId === 'next') { automation.close(); finished.resolve(); }
    },
  } };
  automation = new HostAutomation(services, {
    ready: Promise.resolve(), readTask: async () => ({ text: '雨'.repeat(400000) }),
    start: async () => { writes++; return { taskIds: ['created-once'] }; },
    listTasks: async () => ({ tasks: [], nextCursor: null }),
  });
  await finished.promise;
  assert.equal(callbacks[0].errorCode, 'MPT_RESULT_TOO_LARGE');
  assert.equal(callbacks[2].errorCode, '');
  assert.equal(writes, 1);
  assert.match(automation.error, /Callback write/);
});
