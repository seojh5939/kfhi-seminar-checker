import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  build: {
    target: 'node18',
    outDir: path.resolve(__dirname, 'dist/main'),
    emptyOutDir: true,
    lib: {
      entry: {
        index: path.resolve(__dirname, 'src/main/index.ts'),
        preload: path.resolve(__dirname, 'src/main/preload.ts'),
      },
      formats: ['cjs'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: [
        'electron',
        'fs',
        'path',
        'events',
        'stream',
        'util',
        'crypto',
        'buffer',
        'os',
        'child_process',
        'assert',
        'url',
        'http',
        'https',
        'zlib',
        'tls',
        'net',
      ],
    },
  },
  resolve: {
    mainFields: ['module', 'main'],
    alias: {
      shared: path.resolve(__dirname, '../shared/src'),
    },
  },
});
