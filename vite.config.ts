import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './',
  cacheDir: '.nimi/local/vite-desktop',
  plugins: [react(), tailwindcss()],
  server: {
    watch: { ignored: ['**/.nimi/local/**', '**/dist/**', '**/dist-web/**', '**/dist-mobile/**', '**/android/**', '**/dist-electron/**', '**/dist-electron-package/**'] },
  },
  resolve: {
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  },
});
