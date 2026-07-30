// Local development PostgreSQL using embedded-postgres (no Docker / no admin).
// Credentials match DATABASE_URL in .env: vertex:vertex@localhost:5432/vertex_connect
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, '.pgdata');

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'vertex',
  password: 'vertex',
  port: 5432,
  persistent: true,
});

async function main() {
  if (!existsSync(join(dataDir, 'PG_VERSION'))) {
    console.log('Initialising data directory...');
    await pg.initialise();
  }
  await pg.start();
  try {
    await pg.createDatabase('vertex_connect');
    console.log('Database vertex_connect created.');
  } catch {
    console.log('Database vertex_connect already exists.');
  }
  console.log('READY: postgres listening on localhost:5432');

  const shutdown = async () => {
    console.log('Stopping postgres...');
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Keep the process alive so the server stays up.
  setInterval(() => {}, 1 << 30);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
