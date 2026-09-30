import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Electron loads the renderer with file:// in the packaged app. Relative asset
// paths are therefore required; Vite's default absolute /assets paths render a
// blank window outside an HTTP server.
export default defineConfig({ base: './', plugins: [react()] });
