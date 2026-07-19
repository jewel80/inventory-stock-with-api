import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// When the dev server runs INSIDE Docker (docker-compose.override.yml), /api
// must proxy to the backend *container* (http://backend:8000 on the appnet
// bridge network). When running `npm run dev` directly on the host, the
// backend is published at localhost:8000. Override via API_PROXY_TARGET.
const apiTarget = process.env.API_PROXY_TARGET || 'http://localhost:8000';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // bind 0.0.0.0 so the dev server is reachable from the host
    port: 9000,
    strictPort: true, // fail loudly if 9000 is taken instead of silently using another port
    watch: {
      // inotify is unreliable across Docker bind mounts on Windows/macOS;
      // polling guarantees edits on the host trigger HMR inside the container.
      usePolling: true,
      interval: 100,
    },
    hmr: {
      // The browser opens the HMR websocket against the URL it loaded the page
      // from. Be explicit so Vite doesn't advertise the container's internal
      // hostname (which the browser cannot reach).
      host: 'localhost',
      clientPort: 9000,
    },
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
