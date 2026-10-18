// Hostinger's entry file for the website (built by build.mjs web): the
// Next.js standalone server, as the Docker image runs it.

// Listen on every address. A host's own HOSTNAME (its machine name) would
// otherwise be taken as the address to listen on.
process.env.HOSTNAME = '0.0.0.0';
require('./env.cjs').loadRootEnv();
require('../../apps/web/.next/standalone/apps/web/server.js');
