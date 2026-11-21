import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const testRoot = path.resolve('.nimi/local/test/remote-first-use');
await mkdir(testRoot, { recursive: true });
await build({
  entryPoints: [
    'src/production/actions.ts',
    'src/production/types.ts',
    'src/shell/remote-production.ts',
  ],
  outdir: testRoot,
  bundle: true,
  platform: 'node',
  format: 'esm',
  outExtension: { '.js': '.mjs' },
});
const { saveCreationDefaults, submitProductionBatch } = await import(
  pathToFileURL(path.join(testRoot, 'production/actions.mjs'))
);
const { defaultParams } = await import(
  pathToFileURL(path.join(testRoot, 'production/types.mjs'))
);
const { remoteProductionPlatform } = await import(
  pathToFileURL(path.join(testRoot, 'shell/remote-production.mjs'))
);

test('submitting a video batch does not invoke studio.settings.save or overwrite saved creation defaults', async () => {
  const permitted = new Set([
    'studio.settings',
    'studio.snapshot',
    'media.upload',
    'media.read',
    'create',
    'task',
  ]);
  const invoked = [];
  let savedDefaults = { ...structuredClone(defaultParams), topic: 'PC 默认主题' };
  const created = [];

  const controller = new AbortController();
  const scope = {
    signal: controller.signal,
    client: {
      ai: { scenario: { execute: async () => { throw new Error('unexpected AI call'); } } },
      integration: {
        listCatalog: async () => [
          {
            targetRef: 'iap_primary_pc',
            integrationId: 'moneyprinterturbo.production.v1',
            available: true,
            permittedOperations: [...permitted],
          },
        ],
        invoke: async ({ targetRef, operation, inputJson }) => {
          assert.equal(targetRef, 'iap_primary_pc');
          assert.ok(permitted.has(operation), `unexpected unpermitted operation: ${operation}`);
          invoked.push(operation);
          const input = JSON.parse(inputJson);
          if (operation === 'studio.settings') {
            return {
              callId: 'c1',
              status: 'completed',
              resultJson: JSON.stringify({
                params: structuredClone(savedDefaults),
                businessStatus: { pexels: false, pixabay: false, coverr: false, uploadPost: false },
              }),
            };
          }
          if (operation === 'studio.snapshot') {
            return {
              callId: 'c2',
              status: 'completed',
              resultJson: JSON.stringify({
                tasks: created.map((t) => ({ id: t.id, topic: t.params.topic, state: t.state })),
                nextCursor: null,
                taskCount: created.length,
                activeCount: 0,
                voiceRevision: 0,
                media: { available: true, missing: [] },
              }),
            };
          }
          if (operation === 'media.upload') {
            if (input.action === 'begin') {
              return { callId: 'u1', status: 'completed', resultJson: JSON.stringify({ id: 'up-1' }) };
            }
            if (input.action === 'append') {
              return { callId: 'u2', status: 'completed', resultJson: '{}' };
            }
            return {
              callId: 'u3',
              status: 'completed',
              resultJson: JSON.stringify({
                asset: {
                  relativePath: 'imports/harbor.png',
                  name: 'harbor.png',
                  mediaType: 'image/png',
                  sizeBytes: 4,
                },
              }),
            };
          }
          if (operation === 'create') {
            const task = {
              id: '09dbe9c3-23c7-4350-830a-59a5753ddb3e',
              state: 'complete',
              params: structuredClone(input.params),
            };
            created.push(task);
            return {
              callId: 'c3',
              status: 'completed',
              resultJson: JSON.stringify({ taskIds: [task.id] }),
            };
          }
          if (operation === 'task') {
            return {
              callId: 'c4',
              status: 'completed',
              resultJson: JSON.stringify(created.find((t) => t.id === input.id)),
            };
          }
          if (operation === 'studio.settings.save') {
            savedDefaults = structuredClone(input.params);
            return { callId: 'c5', status: 'completed', resultJson: '{}' };
          }
          throw new Error(`Unhandled operation ${operation}`);
        },
        getCall: async () => { throw new Error('unexpected poll'); },
      },
    },
  };

  const remote = remoteProductionPlatform(scope, 'web');
  const initialSettings = await remote.command('settings');
  assert.equal(initialSettings.params.topic, 'PC 默认主题');

  const uploaded = await remote.importMedia(
    new File([new Uint8Array([137, 80, 78, 71])], 'harbor.png', { type: 'image/png' }),
    'image/png',
  );
  const draft = {
    ...structuredClone(initialSettings.params),
    topic: '海港晨光 · Web 首用',
    script: '清晨海风轻拂码头。',
    materials: [uploaded],
  };

  const started = await submitProductionBatch(remote.command, draft);
  assert.deepEqual(started.taskIds, ['09dbe9c3-23c7-4350-830a-59a5753ddb3e']);
  assert.ok(!invoked.includes('studio.settings.save'));
  assert.equal(savedDefaults.topic, 'PC 默认主题');

  await assert.rejects(
    () => saveCreationDefaults(remote.command, draft),
    /studio\.settings\.save/,
  );
  assert.equal(savedDefaults.topic, 'PC 默认主题');

  permitted.add('studio.settings.save');
  await saveCreationDefaults(remote.command, draft);
  assert.equal(savedDefaults.topic, '海港晨光 · Web 首用');
});
