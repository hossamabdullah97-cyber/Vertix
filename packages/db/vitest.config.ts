import { defineConfig } from 'vitest/config';

// The sources only: the compiled copies in dist/ would run every test twice.
export default defineConfig({
  test: { include: ['src/**/*.{test,spec}.ts'] },
});
