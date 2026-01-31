import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import pkg from './package.json';

export default defineConfig({
  plugins: [react()],

  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@holoengineruntime': path.resolve(__dirname, './src/HoloEngineRuntime'),
      '@holorp': path.resolve(__dirname, './src/HoloEngineRuntime/src/core'),
    },
  },

  server: {
    port: 5173,
    open: true,
  },

  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'ui-vendor': ['@tanstack/react-virtual'],
        }
      }
    }
  },

  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
});
