import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
await mkdir('.nimi/local/test',{recursive:true});
await build({entryPoints:['src-electron/media-runtime.ts'],outfile:'.nimi/local/test/media-runtime.mjs',bundle:true,platform:'node',format:'esm',packages:'external'});
const {MediaRuntime}=await import(pathToFileURL(path.resolve('.nimi/local/test/media-runtime.mjs')));
test('a worker success envelope followed by an abnormal exit is rejected',async()=>{
  // Fault-only transport test. It supplies no media or product success evidence.
  const root=path.resolve('.nimi/local/test/worker-exit');await mkdir(path.join(root,'app'),{recursive:true});
  await writeFile(path.join(root,'app/__init__.py'),'');await writeFile(path.join(root,'app/media_worker.py'),'import sys\nprint(\'{"ok":true,"result":{"mustNotSucceed":true}}\')\nsys.exit(7)\n');
  const media=new MediaRuntime({appRoot:root,scratchRoot:path.join(root,'scratch'),python:path.resolve('.venv/Scripts/python.exe'),ffmpeg:'unused',ffprobe:'unused',resourceRoot:'unused'});
  media.availability=()=>({available:true,missing:[]});
  await assert.rejects(media.call('probe',{}),/异常退出 \(7\)/);
});
