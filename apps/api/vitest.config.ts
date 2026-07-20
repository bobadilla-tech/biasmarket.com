import { resolve } from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.(t|j)s'],
      reporter: ['text', 'lcov'],
    },
  },
  resolve: {
    alias: {
      // Real `@biasmarket/db` re-exports Prisma ORM v7's generated client,
      // which is ESM-only and needs a real DATABASE_URL to resolve config.
      // Unit tests never talk to a real database — they inject a fake
      // PrismaService via `useValue` — so this stub only needs *some* class
      // to `extend`. Not aliased in vitest.config.e2e.ts, which boots the
      // real AppModule.
      '@biasmarket/db': resolve(__dirname, './test/mocks/biasmarket-db.ts'),
    },
  },
  plugins: [
    // This is required to build the test files with SWC
    swc.vite({
      // Explicitly set the module type to avoid inheriting this value from
      // the project's .swcrc config file
      module: { type: 'es6' },
    }),
  ],
});
