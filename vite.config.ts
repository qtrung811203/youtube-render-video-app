import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * @fontsource CSS lists a legacy .woff fallback after every .woff2. Electron's Chromium always uses
 * woff2, so dropping the fallback halves the bundled CJK font payload (and the installers).
 */
function woff2Only(): Plugin {
  return {
    name: 'fontsource-woff2-only',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('@fontsource') || !id.endsWith('.css')) return null;
      return { code: code.replace(/,\s*url\([^)]+\.woff\)\s*format\(['"]woff['"]\)/g, ''), map: null };
    }
  };
}

// Electron loads the renderer with file:// in the packaged app. Relative asset
// paths are therefore required; Vite's default absolute /assets paths render a
// blank window outside an HTTP server.
export default defineConfig({ base: './', plugins: [woff2Only(), react()] });
