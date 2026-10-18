// Hostinger's entry file for the API (built by build.mjs api). As the Docker
// image does, pending database migrations go first: a failed one stops the
// API rather than starting it on a schema its code does not match, and the
// log says why.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

require('./env.cjs').loadRootEnv();

const root = path.join(__dirname, '../..');
const db = path.join(root, 'packages/db');
const prisma = require.resolve('prisma/build/index.js', { paths: [db] });
execFileSync(process.execPath, [prisma, 'migrate', 'deploy', '--schema', path.join(db, 'prisma/schema.prisma')], {
  cwd: db,
  stdio: 'inherit',
});
require(path.join(root, 'apps/api/dist/main.js'));
