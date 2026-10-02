import { build } from 'esbuild';
await build({
  entryPoints: ['src-electron/main.ts'],
  outfile: 'dist-electron/main.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  packages: 'external',
  external: ['electron'],
  define: { __NIMI_ELECTRON_PRODUCTION__: 'false' },
});
await import('./bundle-electron-preload.mjs');
