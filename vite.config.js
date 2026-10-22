import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import pkg from './package.json';

const viewerBuild = `sv-${Date.now().toString(36)}`;

export default defineConfig({
  plugins: [react(), {
    name: 'viewer-build-info',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'build-info.json', source: JSON.stringify({ build: viewerBuild }) });
    },
  }],

  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __VIEWER_BUILD_ID__: JSON.stringify(viewerBuild),
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@holoengineruntime': path.resolve(__dirname, './src/HoloEngineRuntime'),
      '@holorp': path.resolve(__dirname, './src/HoloEngineRuntime/src/core'),
    },
  },

  server: {
    port: 8828,
    host: true, // 监听 0.0.0.0，便于通过本机 IP（如 117.50.223.121:8828）从主机浏览器访问
    open: false,
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
