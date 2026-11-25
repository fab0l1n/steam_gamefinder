import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Builds a standalone page that renders the UI with mock data (no Steam, no extension APIs).
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  plugins: [svelte()],
  build: { outDir: fileURLToPath(new URL('../harness-dist', import.meta.url)), emptyOutDir: true },
});
