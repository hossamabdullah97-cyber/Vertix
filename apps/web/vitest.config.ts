import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Mirrors the "@/*" path in tsconfig.json, so specs import modules the way the app does.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./', import.meta.url)) } },
});
