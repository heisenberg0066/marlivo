import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));
export default defineConfig({
  resolve: {
    alias: {
      '@marlivo/engine': r('./packages/engine/src/index.ts'),
      '@marlivo/bots': r('./packages/bots/src/index.ts'),
      '@marlivo/room': r('./packages/room/src/index.ts'),
    },
  },
  test: { include: ['packages/*/test/**/*.test.ts', 'apps/server/test/**/*.test.ts', 'apps/client/test/**/*.test.ts'], testTimeout: 120000 },
});
