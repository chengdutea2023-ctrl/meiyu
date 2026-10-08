const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const dotenv = require('dotenv');
const destination = process.argv[2];
if (!destination || !path.isAbsolute(destination) || destination.startsWith(path.resolve(__dirname, '..') + path.sep)) {
  throw new Error('Provide a private absolute backup path outside the source repository.');
}
const settings = dotenv.parse(fs.readFileSync(process.env.API_ENV_FILE || '/opt/zhimei-education-platform/shared/api.env'));
const database = new URL(settings.DATABASE_URL);
const env = { ...process.env, PGHOST: database.hostname, PGPORT: database.port || '5432', PGUSER: decodeURIComponent(database.username), PGPASSWORD: decodeURIComponent(database.password), PGDATABASE: decodeURIComponent(database.pathname.slice(1)) };
fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
const fd = fs.openSync(destination, 'wx', 0o600);
fs.closeSync(fd);
try {
  execFileSync('pg_dump', ['--format=custom', '--file', destination], { env, stdio: 'pipe' });
  execFileSync('pg_restore', ['--list', destination], { stdio: 'pipe' });
  const checksum = crypto.createHash('sha256').update(fs.readFileSync(destination)).digest('hex');
  fs.writeFileSync(`${destination}.sha256`, `${checksum}  ${path.basename(destination)}\n`, { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ bytes: fs.statSync(destination).size, sha256: checksum, validated: true }));
} catch {
  throw new Error('Database backup failed or is invalid; inspect private server diagnostics. Existing backups were not overwritten.');
}
