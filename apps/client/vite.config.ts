import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));
export default defineConfig({
  base: process.env.MARLIVO_BASE ?? '/marlivo/',
  plugins: [react()],
  resolve: { alias: {
    '@marlivo/engine': r('../../packages/engine/src/index.ts'),
    '@marlivo/bots': r('../../packages/bots/src/index.ts'),
    '@marlivo/room': r('../../packages/room/src/index.ts'),
  } },
  worker: { format: 'es' },
  define: {
    __SERVER_URL__: JSON.stringify(process.env.MARLIVO_SERVER_URL ?? ''),
    __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16)),
  },
  build: { target: 'es2020', sourcemap: false },
});
