import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/collab-edge/',
  publicDir: '../public',
  plugins: [react(), tailwind()],
  build: { outDir: '../showcase-dist', emptyOutDir: true },
});
