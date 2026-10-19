import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function buildCsp(isDev) {
  const devConnect = isDev ? 'http://localhost:5050 ws://localhost:5050 ws://localhost:5173 ' : '';
  const devMedia = isDev ? 'http://localhost:5050 ' : '';

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/client",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    `img-src 'self' data: blob: https: ${devMedia}`.trim(),
    `media-src 'self' blob: data: https: ${devMedia}`.trim(),
    `connect-src 'self' ${devConnect}https: wss: https://accounts.google.com`.trim(),
    "frame-src 'self' https://accounts.google.com https://www.youtube.com https://youtube.com blob: data:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; ');
}

export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';
  const securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Content-Security-Policy': buildCsp(isDev),
  };

  return {
    plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Bind beyond loopback so host.docker.internal scanners can reach the dev server.
    host: '0.0.0.0',
    port: 5173,
    // Fail loudly if 5173 is occupied instead of silently moving the scan target.
    strictPort: true,
    headers: securityHeaders,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5050',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            if (res && !res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: false,
                error: 'SERVER_RECONNECTING',
                message: 'Backend server is initializing or reconnecting. Please retry in a few seconds.',
              }));
            }
          });
        },
      },
      '/uploads': {
        target: 'http://127.0.0.1:5050',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://127.0.0.1:5050',
        ws: true,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', () => {
            // Silently handle proxy connection drops during server reloads/scans
          });
          proxy.on('proxyReqWs', (proxyReq, req, socket) => {
            socket.on('error', () => {
              // Prevent unhandled ECONNRESET on socket stream from terminating Vite dev process
            });
          });
        },
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    headers: securityHeaders,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'icons-vendor': ['lucide-react'],
          'network-vendor': ['axios', 'socket.io-client'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
};
});
