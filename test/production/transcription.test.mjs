import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
await mkdir('.nimi/local/test',{recursive:true});
await build({entryPoints:['src/production/transcription.ts'],outfile:'.nimi/local/test/transcription.mjs',bundle:true,platform:'node',format:'esm'});
const {assembleCues,validateCues,toSrt}=await import(pathToFileURL(process.cwd()+'/.nimi/local/test/transcription.mjs'));
test('real word timestamps retain pauses and punctuation in sentence and word modes',()=>{
  const words=[{text:'早',startSeconds:0.64,endSeconds:0.8},{text:'安。',startSeconds:0.83,endSeconds:1.2},{text:'城市',startSeconds:2.1,endSeconds:2.8}];
  assert.deepEqual(assembleCues(words,'sentence'),[{text:'早安。',start:0.64,end:1.2},{text:'城市',start:2.1,end:2.8}]);
  assert.deepEqual(assembleCues(words,'word_by_word').map(c=>[c.start,c.end]),[[0.64,0.8],[0.83,1.2],[2.1,2.8]]);
  assert.match(toSrt(assembleCues(words,'sentence')),/00:00:00,640 --> 00:00:01,200\n早安。/);
});
test('missing alignment never becomes evenly divided text',()=>{assert.throws(()=>assembleCues([{text:'hello',startSeconds:0,endSeconds:0}],'word_by_word'),/时间轴/);assert.equal(toSrt([]),'');});
test('business correction rejects reversed timing and preserves real editable timing',()=>{assert.throws(()=>validateCues([{text:'bad',start:3,end:2}]),/时间/);assert.deepEqual(validateCues([{text:'校对',start:0.64,end:1.2}]),[{text:'校对',start:0.64,end:1.2}]);});
