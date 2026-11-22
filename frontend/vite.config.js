import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Multi-page build. `base: './'` makes the output work from any folder or sub-path
// (GitHub Pages, IPFS, a plain static host, or just double-clicking dist/index.html over a server).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        assembly: resolve(__dirname, 'assembly.html'),
        charter: resolve(__dirname, 'charter.html'),
        motions: resolve(__dirname, 'motions.html'),
        docs: resolve(__dirname, 'docs.html'),
        about: resolve(__dirname, 'about.html'),
      },
    },
  },
  define: { global: 'globalThis' },
  server: { port: 5173, host: true },
});
