import { defineConfig, type Plugin } from 'vite';

// The web version (GitHub Pages) has no server to send a Content-Security-Policy header, so its
// pages carry one of their own: only the app's own scripts run (nothing written into a file the
// person opens can run as a script and read the AI key kept in this browser). The desktop app
// gets its policy from src-tauri/tauri.conf.json instead, so its build leaves this out.
// connect-src stays open to https: and this computer because an OpenAI-compatible AI model can be
// at any address the person types in.
const WEB_CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  "connect-src 'self' data: blob: https: http://localhost:* http://127.0.0.1:*",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function webCsp(): Plugin {
  return {
    name: 'web-csp',
    apply: 'build',
    transformIndexHtml(html) {
      if (process.env.TAURI_ENV_PLATFORM) return html;
      return html.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n  <meta http-equiv="Content-Security-Policy" content="${WEB_CSP}" />`);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [webCsp()],
  // The desktop app's development mode expects this exact port (src-tauri/tauri.conf.json).
  // docs/ holds the README pictures; the picture scripts write there while the page is open, so don't reload it
  server: { port: 5173, strictPort: true, watch: { ignored: ['**/docs/**'] } },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    rollupOptions: {
      // the app, and the audience's window for presenter view
      input: { app: 'index.html', audience: 'audience.html' },
      output: { entryFileNames: '[name].js', assetFileNames: '[name][extname]', chunkFileNames: '[name].js' },
    },
  },
  worker: { format: 'iife', rollupOptions: { output: { entryFileNames: '[name].js' } } },
});
