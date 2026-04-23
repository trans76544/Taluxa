import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import { fileURLToPath, URL } from 'node:url';

const alias = {
  '@renderer': fileURLToPath(new URL('./src/renderer', import.meta.url)),
  '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
};

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'src/electron/main/index.ts',
        vite: {
          resolve: {
            alias,
          },
          build: {
            outDir: 'dist-electron/main',
          },
        },
      },
      preload: {
        input: 'src/electron/preload/index.ts',
        vite: {
          resolve: {
            alias,
          },
          build: {
            outDir: 'dist-electron/preload',
            rollupOptions: {
              output: {
                format: 'es',
                entryFileNames: '[name].mjs',
                chunkFileNames: '[name].mjs',
              },
            },
          },
        },
      },
    }),
  ],
  resolve: {
    alias,
  },
  build: {
    outDir: 'dist',
  },
});
