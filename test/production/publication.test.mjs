import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

await mkdir('.nimi/local/test', { recursive: true });
await build({ entryPoints: ['src-electron/business-services.ts'], outfile: '.nimi/local/test/business.mjs', bundle: true, platform: 'node', format: 'esm' });
const { publicationOutcome } = await import(pathToFileURL(path.resolve('.nimi/local/test/business.mjs')));

test('a completed aggregate cannot hide missing or skipped selected platforms', () => {
  // Recorded protocol shapes validate status interpretation, not a real publication.
  assert.equal(publicationOutcome({ status: 'completed', results: [{ platform: 'youtube', success: true }] }, ['youtube', 'instagram']).state, 'failed');
  assert.equal(publicationOutcome({ status: 'completed', results: [{ platform: 'instagram', success: true, skipped: true }] }, ['instagram']).state, 'failed');
});

test('TikTok inbox delivery still requires the owner to publish', () => {
  assert.equal(publicationOutcome({ results: [{ platform: 'tiktok', success: true, fallback_to_inbox: true }] }, ['tiktok']).state, 'failed');
  assert.equal(publicationOutcome({ results: [{ platform: 'youtube', success: true, status: 'completed' }] }, ['youtube']).state, 'complete');
});
