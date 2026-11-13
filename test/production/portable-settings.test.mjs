import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
await mkdir('.nimi/local/test', { recursive: true });
await build({ entryPoints: ['src-electron/production-controller.ts', 'src/production/types.ts'], outdir: '.nimi/local/test/portable-settings', bundle: true, platform: 'node', format: 'esm', outExtension: { '.js': '.mjs' } });
const { ProductionController } = await import(pathToFileURL(path.resolve('.nimi/local/test/portable-settings/src-electron/production-controller.mjs')));
const { defaultParams, defaultBusiness } = await import(pathToFileURL(path.resolve('.nimi/local/test/portable-settings/src/production/types.mjs')));

test('portable settings return readiness without exposing stored or unknown credential fields', async () => {
  const settings = { params: { ...structuredClone(defaultParams), hiddenCredential: 'must-not-leave-PC' },
    business: { ...defaultBusiness, pexelsKey: 'private-pexels', uploadPostKey: 'private-upload', uploadPostUser: 'private-user' } };
  const services = { storage: { readJson: async name => ({ value: name === 'production/index.json' ? [] : settings }) } };
  const controller = new ProductionController(services, { availability: () => ({ available: true, missing: [] }) });
  const result = await controller.publicSettings();
  assert.deepEqual(result.businessStatus, { pexels: true, pixabay: false, coverr: false, uploadPost: true });
  assert.deepEqual(result.params, defaultParams);
  assert.ok(!JSON.stringify(result).includes('private-'));
  assert.ok(!JSON.stringify(result).includes('must-not-leave-PC'));
  result.params.topic = 'edited in the consumer';
  assert.notEqual(settings.params.topic, result.params.topic);
});
