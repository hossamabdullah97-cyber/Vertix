import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(path) {
  if (!existsSync(path)) return;

  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (!key || process.env[key] !== undefined) continue;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

loadEnvFile(resolve(rootDir, '.env'));
loadEnvFile(resolve(process.cwd(), '.env'));

// The package's own Prisma CLI, run by this node: no pnpm in between (the one
// on the PATH may be another major version than the workspace's, and refuse
// to run, as on Hostinger).
const prismaCli = createRequire(resolve(process.cwd(), 'package.json')).resolve(
  'prisma/build/index.js',
);
const result = spawnSync(process.execPath, [prismaCli, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
