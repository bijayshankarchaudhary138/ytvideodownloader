import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const root = path.resolve(__dirname);

export default defineConfig({
  root,
  base: '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@web': path.join(root, 'src'),
      '@server': path.resolve(root, '..', 'server', 'src'),
    },
  },
  esbuild: { legalComments: 'none' },
  build: {
    outDir: path.join(root, 'dist'),
    emptyOutDir: true,
    target: 'es2020',
    cssCodeSplit: false,
    sourcemap: false,
    assetsInlineLimit: 2048,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        manualChunks: { react: ['react', 'react-dom'] },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    // The preview environment proxies the app through a wildcard host, and the
    // API is served by our own Express process on port 8080.
    allowedHosts: true,
    cors: true,
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:8080',
        changeOrigin: true,
        ws: false,
      },
    },
  },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
});
