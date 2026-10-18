// Builds one part of Vertex Connect where Hostinger's Node.js web apps build
// it: in this repository's root, with pnpm. Hostinger's "build command" is
// `pnpm run hostinger:web` or `pnpm run hostinger:api`, and its "entry file"
// web.js or api.js next to this one (see README.md here).
import { cpSync, existsSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const part = process.argv[2];

const loaded = createRequire(import.meta.url)('./env.cjs').loadRootEnv();
if (loaded.length) console.log(`Environment variables from .env: ${loaded.join(', ')}`);

// The pnpm running this script (`pnpm run hostinger:…`), not whichever pnpm is
// first on the PATH: on Hostinger that is another major version, which
// refuses to stand in for the one package.json pins (packageManager).
const self = process.env.npm_execpath;
const pnpm = !self ? 'pnpm' : /\.[cm]?js$/.test(self) ? `"${process.execPath}" "${self}"` : `"${self}"`;
console.log(`Using ${process.env.npm_config_user_agent?.split(' ')[0] ?? 'pnpm from the PATH'}`);

const run = (cmd, env = {}) => {
  console.log(`\n> ${cmd}`);
  try {
    execSync(cmd, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
  } catch {
    // The command's own output, just above, says why.
    console.error(`\nBuild step failed: ${cmd}\nIts error is in the lines above.`);
    process.exit(1);
  }
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
// Never asks to confirm replacing node_modules: there is no one to answer.
run(`${pnpm} install --frozen-lockfile --prod=false --config.confirmModulesPurge=false`);

if (part === 'web') {
  // Written into the pages as they are built: without it they would call localhost.
  need(['NEXT_PUBLIC_API_URL']);
  run(`${pnpm} --filter @vertex/shared build`);
  run(`${pnpm} --filter @vertex/web build`, { BUILD_STANDALONE: '1' });
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
  run(`${pnpm} --filter @vertex/shared build`);
  run(`${pnpm} --filter @vertex/db build`);
  run(`${pnpm} --filter @vertex/api build`);
  console.log('\nAPI built. Entry file: scripts/hostinger/api.js');
} else {
  console.error('Usage: node scripts/hostinger/build.mjs <web|api>');
  process.exit(1);
}
