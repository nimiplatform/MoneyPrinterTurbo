import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { mkdir, mkdtemp, open, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const testRoot = path.resolve('.nimi/local/test');
await mkdir(testRoot, { recursive: true });
await build({ entryPoints: ['src/shell/remote-media.ts', 'src/shell/android-export.ts', 'src/shell/remote-production.ts'], outdir: path.join(testRoot, 'android-export'), bundle: true, platform: 'node', format: 'esm', outExtension: { '.js': '.mjs' } });
const { remoteMedia } = await import(pathToFileURL(path.join(testRoot, 'android-export/remote-media.mjs')));
const { saveAndroidMedia } = await import(pathToFileURL(path.join(testRoot, 'android-export/android-export.mjs')));
const { remoteProductionPlatform } = await import(pathToFileURL(path.join(testRoot, 'android-export/remote-production.mjs')));
const bytes = Buffer.from('原字幕与视频字节\0'.repeat(15000));
const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const asset = { relativePath: 'tasks/test/source.txt', name: '原始来源.txt', sizeBytes: bytes.length, mediaType: 'text/plain' };
const part = (offset, overrides = {}) => {
  const chunk = bytes.subarray(offset, offset + 131072);
  return { relativePath: asset.relativePath, mediaType: 'text/plain;charset=utf-8', offset, length: chunk.length, nextOffset: offset + chunk.length,
    totalSize: bytes.length, sha256: digest, eof: offset + chunk.length === bytes.length, dataBase64: chunk.toString('base64'), ...overrides };
};

// A real temporary file models the native sink's ordered I/O. It does not stand
// in for Android UI acceptance or claim that an actual SAF destination was used.
test('Save streams to bounded native writes with backpressure, original MIME/size and real staged bytes', async () => {
  const directory = await mkdtemp(path.join(testRoot, 'mpt-export-'));
  assert.ok(directory.startsWith(testRoot + path.sep));
  const file = await open(path.join(directory, 'staged.bin'), 'w');
  const controller = new AbortController(), entered = Promise.withResolvers(), release = Promise.withResolvers();
  const reads = [], reports = [], writes = []; let saved = 0, aborted = 0;
  try {
    const source = await remoteMedia(asset, async offset => { reads.push(offset); return part(offset); }, controller.signal);
    const work = saveAndroidMedia(source, controller.signal, {
      beginExport: async meta => { assert.equal(meta.mimeType, 'text/plain;charset=utf-8'); assert.equal(meta.size, bytes.length); assert.equal(meta.sha256, digest); return { id: 'one' }; },
      appendExport: async ({ id, offset, data }) => {
        assert.equal(id, 'one'); const chunk = Buffer.from(data, 'base64'); assert.ok(chunk.length <= 65536);
        if (!writes.length) { entered.resolve(); await release.promise; }
        assert.equal(offset, writes.reduce((total, length) => total + length, 0));
        await file.write(chunk, 0, chunk.length, offset); writes.push(chunk.length); return { received: offset + chunk.length };
      },
      saveExport: async () => {
        saved++; await file.close(); assert.deepEqual(await readFile(path.join(directory, 'staged.bin')), bytes);
        controller.abort(); // The completed local Save is independent of Runtime scope end.
        return { name: asset.name, bytesWritten: bytes.length };
      },
      abortExport: async () => { aborted++; },
    }, value => reports.push(value));
    await entered.promise; assert.deepEqual(reads, [0]); assert.equal(saved, 0);
    release.resolve(); const result = await work;
    assert.equal(result.canceled, false); assert.equal(result.bytesWritten, bytes.length); assert.equal(saved, 1); assert.equal(aborted, 1);
    assert.equal(reports.at(-1).state, 'choosing'); assert.ok(reads.length > 1);
  } finally { await file.close().catch(() => {}); await rm(directory, { recursive: true, force: true }); }
});

test('a canceled picker is not Saved, and wrong acknowledgments or native integrity failures do not become success', async () => {
  const makeSource = () => remoteMedia(asset, async offset => part(offset), new AbortController().signal);
  let aborts = 0, saves = 0;
  const sink = { beginExport: async () => ({ id: 'one' }), appendExport: async ({ offset, data }) => ({ received: offset + Buffer.from(data, 'base64').length }),
    saveExport: async () => { saves++; throw Object.assign(new Error('canceled'), { code: 'MPT_EXPORT_CANCELED' }); }, abortExport: async () => { aborts++; } };
  const canceled = await saveAndroidMedia(await makeSource(), new AbortController().signal, sink, () => {});
  assert.deepEqual(canceled, { canceled: true });
  await assert.rejects(saveAndroidMedia(await makeSource(), new AbortController().signal, { ...sink, appendExport: async () => ({ received: 1 }) }, () => {}), /传输/);
  assert.equal(saves, 1);
  await assert.rejects(saveAndroidMedia(await makeSource(), new AbortController().signal, { ...sink, saveExport: async () => { throw Object.assign(new Error('digest mismatch'), { code: 'MPT_EXPORT_SAVE_FAILED' }); } }, () => {}), /digest mismatch/);
  assert.equal(aborts, 3);
});

test('an ended Runtime scope stops media reading and releases staging before opening a picker', async () => {
  const controller = new AbortController(); let reads = 0, saves = 0, aborts = 0;
  const source = await remoteMedia(asset, async offset => { reads++; return part(offset); }, controller.signal);
  await assert.rejects(saveAndroidMedia(source, controller.signal, {
    beginExport: async () => ({ id: 'one' }),
    appendExport: async ({ offset, data }) => { controller.abort(new Error('original scope ended')); return { received: offset + Buffer.from(data, 'base64').length }; },
    saveExport: async () => { saves++; return { bytesWritten: bytes.length }; }, abortExport: async () => { aborts++; },
  }, () => {}), /original scope ended/);
  assert.equal(reads, 1); assert.equal(saves, 0); assert.equal(aborts, 1);
});

test('changed chunk metadata and an over-limit file are refused without partial delivery', async () => {
  await assert.rejects(remoteMedia(asset, async () => part(0, { totalSize: 256 * 1024 * 1024 + 1 }), new AbortController().signal), /256 MB/);
  for (const change of [{ nextOffset: 1 }, { sha256: 'sha256:' + '0'.repeat(64) }, { mediaType: 'video/mp4' }]) {
    const source = await remoteMedia(asset, async offset => part(offset, offset ? change : {}), new AbortController().signal);
    await assert.rejects(async () => { for await (const _chunk of source.chunks) { /* consume the original iterator */ } }, /媒体/);
  }
});

test('an empty text artifact has one terminal read and an exact zero-byte save', async () => {
  let reads = 0, writes = 0;
  const signal = new AbortController().signal;
  const sha256 = `sha256:${createHash('sha256').update('').digest('hex')}`;
  const source = await remoteMedia(asset, async () => { reads++; return part(0, { totalSize: 0, length: 0, nextOffset: 0, eof: true, dataBase64: '', sha256 }); }, signal);
  const result = await saveAndroidMedia(source, signal, {
    beginExport: async input => { assert.equal(input.size, 0); assert.equal(input.sha256, sha256); return { id: 'empty' }; },
    appendExport: async () => { writes++; throw new Error('No data chunk is expected'); },
    saveExport: async () => ({ name: asset.name, bytesWritten: 0 }), abortExport: async () => {},
  }, () => {});
  assert.deepEqual(result, { canceled: false, bytesWritten: 0 }); assert.equal(reads, 1); assert.equal(writes, 0);
});

test('a media gesture keeps its original permitted PC target even if the catalog selection changes later', async () => {
  const requests = []; let catalogs = 0;
  const controller = new AbortController();
  const platform = remoteProductionPlatform({ signal: controller.signal, client: { integration: {
    listCatalog: async () => { catalogs++; return [{ targetRef: catalogs === 1 ? 'original-pc' : 'different-pc', integrationId: 'moneyprinterturbo.production.v1', available: true, permittedOperations: ['media.read'] }]; },
    invoke: async input => { requests.push(input); assert.equal(input.operation, 'media.read'); return { status: 'completed', resultJson: JSON.stringify(part(JSON.parse(input.inputJson).offset)) }; },
  } } }, 'web');
  const result = await platform.openMedia(asset);
  try { assert.deepEqual(Buffer.from(await (await fetch(result.url)).arrayBuffer()), bytes); }
  finally { result.revoke(); }
  assert.equal(catalogs, 1); assert.ok(requests.length > 1); assert.ok(requests.every(request => request.targetRef === 'original-pc'));
  controller.abort(); await assert.rejects(platform.openMedia(asset)); assert.equal(catalogs, 1);
});
