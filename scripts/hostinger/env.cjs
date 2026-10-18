// Hostinger hands a web app its environment variables in a `.env` file at
// the repository's root ("variables loaded from .env"), which neither the
// build's tools nor the server read from there. This puts them in
// process.env (a variable already set wins), for the build and the start.
const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');

function loadRootEnv() {
  const file = path.join(__dirname, '../../.env');
  if (!existsSync(file)) return [];
  const loaded = [];
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).replace(/^export\s+/, '').trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) {
      process.env[key] = value;
      loaded.push(key);
    }
  }
  return loaded;
}

module.exports = { loadRootEnv };
