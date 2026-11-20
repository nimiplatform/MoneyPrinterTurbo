import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
await mkdir('.nimi/local/test', { recursive: true });
await build({
  entryPoints: ['src-electron/business-services.ts'],
  outfile: '.nimi/local/test/business-services.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
});
const { searchStock } = await import(
  pathToFileURL(path.resolve('.nimi/local/test/business-services.mjs'))
);

const baseSettings = {
  pexelsKey: 'px-key',
  pixabayKey: 'pb-key',
  coverrKey: 'cv-key',
  uploadPostKey: '',
  uploadPostUser: '',
  uploadPlatforms: [],
};

test('Pixabay selects smallest rendition filling 1080x1920 instead of 4K and honors clipSpeed coverage', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          hits: [
            {
              id: 101,
              duration: 6,
              pageURL: 'https://pixabay.com/videos/id-101/',
              videos: {
                large: { url: 'https://cdn.pixabay.com/101-4k.mp4', width: 2160, height: 3840 },
                medium: { url: 'https://cdn.pixabay.com/101-1080p.mp4', width: 1080, height: 1920 },
                small: { url: 'https://cdn.pixabay.com/101-720p.mp4', width: 720, height: 1280 },
              },
            },
            {
              id: 102,
              duration: 6,
              videos: {
                medium: { url: 'https://cdn.pixabay.com/102-1080p.mp4', width: 1080, height: 1920 },
              },
            },
            {
              id: 103,
              duration: 6,
              videos: {
                medium: { url: 'https://cdn.pixabay.com/103-1080p.mp4', width: 1080, height: 1920 },
              },
            },
          ],
        }),
        { status: 200 },
      );

    // At 2x speed, each 6s video covers only 3s, so a 9s narration needs all 3 videos (not just 2).
    const results = await searchStock(
      'pixabay',
      ['river'],
      baseSettings,
      '9:16',
      new AbortController().signal,
      { requiredDuration: 9, clipDuration: 5, clipSpeed: 2 },
    );
    assert.equal(results.length, 3);
    assert.equal(results[0].url, 'https://cdn.pixabay.com/101-1080p.mp4');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Pexels omits orientation filter for square 1:1 output and reports 401 API key errors clearly', async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls = [];
  try {
    globalThis.fetch = async (input) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes('unauthorized')) return new Response('{}', { status: 401 });
      return new Response(
        JSON.stringify({
          videos: [
            {
              id: 201,
              duration: 8,
              url: 'https://www.pexels.com/video/201/',
              video_files: [
                { file_type: 'video/mp4', width: 3840, height: 2160, link: 'https://player.vimeo.com/201-4k.mp4' },
                { file_type: 'video/mp4', width: 1920, height: 1080, link: 'https://player.vimeo.com/201-hd.mp4' },
              ],
            },
          ],
        }),
        { status: 200 },
      );
    };
    const square = await searchStock('pexels', ['forest'], baseSettings, '1:1', new AbortController().signal);
    assert.equal(square.length, 1);
    assert.equal(square[0].url, 'https://player.vimeo.com/201-hd.mp4');
    assert.ok(!requestedUrls[0].includes('orientation='));

    await assert.rejects(
      () => searchStock('pexels', ['unauthorized'], baseSettings, '9:16', new AbortController().signal),
      /API key 无效或未获授权/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
