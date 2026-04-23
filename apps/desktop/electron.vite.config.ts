import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const sharedTypesSource = resolve(currentDirectory, '../../packages/shared-types/src/index.ts');

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@phone-to-pc-speaker/shared-types': sharedTypesSource
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@phone-to-pc-speaker/shared-types'] })],
    build: {
      lib: {
        entry: resolve(currentDirectory, 'src/preload/index.ts'),
        formats: ['cjs']
      }
    },
    resolve: {
      alias: {
        '@phone-to-pc-speaker/shared-types': sharedTypesSource
      }
    }
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        '@phone-to-pc-speaker/shared-types': sharedTypesSource,
        '@renderer': resolve(currentDirectory, 'src/renderer/src')
      }
    }
  }
});
