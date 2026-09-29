import { defineConfig } from 'vite';

export default defineConfig({
  build: { outDir: '../HistogramClassification.Api/wwwroot', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5080',
      '/hubs': { target: 'http://localhost:5080', ws: true },
    },
  },
});
