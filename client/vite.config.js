import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/client",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https: http://localhost:5050",
  "media-src 'self' blob: data: http://localhost:5050 https:",
  "connect-src 'self' http://localhost:5050 ws://localhost:5050 ws://localhost:5173 https://*.onrender.com wss://*.onrender.com https://accounts.google.com",
  "frame-src 'self' https://accounts.google.com https://www.youtube.com https://youtube.com blob: data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Content-Security-Policy': CSP_DIRECTIVES,
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    headers: SECURITY_HEADERS,
    proxy: {
      '/api': {
        target: 'http://localhost:5050',
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
        target: 'http://localhost:5050',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:5050',
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
    port: 5173,
    headers: SECURITY_HEADERS,
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
});
