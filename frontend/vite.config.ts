import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    outDir: '../src/openjarvis/server/static',
    emptyOutDir: true,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }
          if (id.includes('react-markdown') || id.includes('remark-gfm')) {
            return 'markdown-core';
          }
          if (id.includes('rehype-') || id.includes('remark-math') || id.includes('/katex/')) {
            return 'markdown-rich';
          }
          if (id.includes('recharts')) {
            return 'charts';
          }
          if (id.includes('react-router')) {
            return 'router';
          }
          if (id.includes('lucide-react')) {
            return 'icons';
          }
          if (id.includes('@tauri-apps')) {
            return 'tauri';
          }
          if (
            id.includes('@base-ui') ||
            id.includes('zustand') ||
            id.includes('clsx') ||
            id.includes('class-variance-authority') ||
            id.includes('tailwind-merge') ||
            id.includes('sonner')
          ) {
            return 'ui-vendor';
          }
          if (id.includes('/react/') || id.includes('/react-dom/')) {
            return 'react';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/v1': process.env.VITE_API_URL || 'http://localhost:8000',
      '/health': process.env.VITE_API_URL || 'http://localhost:8000',
    },
  },
});
