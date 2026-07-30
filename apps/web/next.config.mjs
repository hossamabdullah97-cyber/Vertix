import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Standalone output is only enabled for Docker builds (BUILD_STANDALONE=1).
// It relies on symlinks that Windows blocks without elevated permissions, so it
// stays off for local dev builds.
const standalone = process.env.BUILD_STANDALONE === '1';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@vertex/shared'],
  // Strip console.* (except error/warn) from production bundles.
  compiler: {
    removeConsole:
      process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
  // Tree-shake large barrel imports (framer-motion) for smaller vendor chunks.
  experimental: {
    optimizePackageImports: ['framer-motion'],
    ...(standalone ? { outputFileTracingRoot: path.join(dirname, '../../') } : {}),
  },
  ...(standalone ? { output: 'standalone' } : {}),
};

export default nextConfig;
