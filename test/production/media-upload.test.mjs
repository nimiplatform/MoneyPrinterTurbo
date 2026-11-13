import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
await mkdir('.nimi/local/test', { recursive: true });
await build({ entryPoints: ['src-electron/media-upload.ts'], outfile: '.nimi/local/test/media-upload.mjs', bundle: true, platform: 'node', format: 'esm' });
const { MediaUploads } = await import(pathToFileURL(path.resolve('.nimi/local/test/media-upload.mjs')));

test('media transfer fences the consumer, range and completion; never exposes partial imports', async () => {
  const root = await mkdtemp(path.resolve('.nimi/local/test/upload-'));
  const imports = [];
  const controller = { importMediaStream: async (meta, body) => {
    const chunks=[]; for await (const chunk of body) chunks.push(chunk);
    imports.push(Buffer.concat(chunks)); return { name: meta.name, sizeBytes: meta.size, relativePath:'imports/test.png', mediaType: meta.mediaType };
  } };
  const uploads = new MediaUploads(controller, root);
  try {
    const { id } = await uploads.call('client-a', { action:'begin', name:'photo.png', mediaType:'image/png', size:5 });
    await assert.rejects(uploads.call('client-b', {action:'append', id, offset:0, dataBase64:'aGVsbG8='}));
    await assert.rejects(uploads.call('client-a', {action:'finish', id}));
    await assert.rejects(uploads.call('client-a', {action:'append', id, offset:1, dataBase64:'aGVsbG8='}));
    await assert.rejects(uploads.call('client-a', {action:'append', id, offset:0, dataBase64:'aGVsbG8=garbage'}));
    assert.equal(imports.length,0);
    await uploads.call('client-a', {action:'append', id, offset:0, dataBase64:'aGVsbG8='});
    const done=await uploads.call('client-a',{action:'finish',id});
    assert.deepEqual(await uploads.call('client-a',{action:'finish',id}),done);
    assert.equal(imports.length,1); assert.equal(imports[0].toString(),'hello');
    assert.deepEqual(await readdir(root),[]);
    await assert.rejects(uploads.call('client-a', {action:'begin',name:'settings.json',mediaType:'application/json',size:5}));
  } finally { await uploads.close(); await rm(root,{recursive:true}); }
});
