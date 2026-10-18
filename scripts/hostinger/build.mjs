// Builds one part of Vertex Connect where Hostinger's Node.js web apps build
// it: in this repository's root, with pnpm. Hostinger's "build command" is
// `pnpm run hostinger:web` or `pnpm run hostinger:api`, and its "entry file"
// web.js or api.js next to this one (see README.md here).
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const part = process.argv[2];
const run = (cmd, env = {}) => {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
};
const need = (names) => {
  const missing = names.filter((n) => !process.env[n]?.trim());
  if (missing.length) {
    console.error(`\nMissing environment variables: ${missing.join(', ')}\nAdd them in Hostinger: the web app's settings, Environment variables, then build again.`);
    process.exit(1);
  }
};

// The build needs the development tools (TypeScript, Nest's CLI), which an
// install made with NODE_ENV=production leaves out.
run('pnpm install --frozen-lockfile --prod=false');

if (part === 'web') {
  // Written into the pages as they are built: without it they would call localhost.
  need(['NEXT_PUBLIC_API_URL']);
  run('pnpm --filter @vertex/shared build');
  run('pnpm --filter @vertex/web build', { BUILD_STANDALONE: '1' });
  // As the Docker image does (apps/web/Dockerfile): the standalone server
  // serves its static files and public folder from beside it.
  const web = join(root, 'apps/web');
  const out = join(web, '.next/standalone/apps/web');
  for (const [from, to] of [
    [join(web, '.next/static'), join(out, '.next/static')],
    [join(web, 'public'), join(out, 'public')],
  ]) {
    rmSync(to, { recursive: true, force: true });
    cpSync(from, to, { recursive: true });
  }
  if (!existsSync(join(out, 'server.js'))) throw new Error('The standalone server was not built');
  console.log('\nWebsite built. Entry file: scripts/hostinger/web.js');
} else if (part === 'api') {
  run('pnpm --filter @vertex/shared build');
  run('pnpm --filter @vertex/db build');
  run('pnpm --filter @vertex/api build');
  console.log('\nAPI built. Entry file: scripts/hostinger/api.js');
} else {
  console.error('Usage: node scripts/hostinger/build.mjs <web|api>');
  process.exit(1);
}
