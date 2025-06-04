import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { builtinModules } from 'module';
import electron from 'vite-plugin-electron';

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  if (mode === 'preload') {
    return {
      build: {
        outDir: 'dist',
        lib: {
          entry: path.resolve(__dirname, 'src/main/preload.ts'),
          formats: ['cjs'],
          fileName: () => 'preload.js',
        },
        rollupOptions: {
          external: [
            'electron',
            ...builtinModules,
          ],
          output: {
            entryFileNames: '[name].js',
          },
        },
        emptyOutDir: false,
      },
    };
  }

  return {
    server: {
      port: 5174,
    },
    plugins: [
      react(),
      electron({
        entry: [
          'src/main/main.ts',
          'src/main/preload.ts'
        ],
      }),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    base: process.env.VITE_DEV_SERVER_URL ? '/' : './',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      assetsDir: '.',  // 루트에 에셋 파일 생성
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
        },
      }
    },
    optimizeDeps: {
      exclude: ['electron']
    }
  };
});
