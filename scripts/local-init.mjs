import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
const force = args.includes('--replace-backed-up-env');
const dbName = args.includes('--database') ? option('--database') : 'jiaoxue_platform';
if (!/^[a-z][a-z0-9_]+$/.test(dbName)) throw new Error('Invalid local database name');
const privateDir = path.join(os.homedir(), '.zhike-agent-secrets', 'local-development');
await mkdir(privateDir, { recursive: true, mode: 0o700 });
const password = randomBytes(24).toString('hex');
const values = {
  LOCAL_DB_USER: 'jiaoxue', LOCAL_DB_PASSWORD: password, LOCAL_DB_NAME: dbName, LOCAL_DB_PORT: '55432',
  DATABASE_URL: `postgresql://jiaoxue:${password}@127.0.0.1:55432/${dbName}?schema=public`,
  HOST: '127.0.0.1', PORT: '3000', REDIS_URL: 'redis://127.0.0.1:6379/0',
  PLATFORM_PUBLIC_URL: 'http://localhost:3000', AGENT_PUBLIC_URL: 'http://localhost:3000',
  CORS_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3001',
  JWT_ACCESS_SECRET: randomBytes(48).toString('hex'), JWT_REFRESH_SECRET: randomBytes(48).toString('hex'),
  JWT_ACCESS_TTL: '15m', JWT_REFRESH_TTL: '7d', PASSWORD_RESET_DEBUG_RESPONSE: 'false',
  REQUEST_BODY_LIMIT: '120mb', COURSE_UPLOAD_MAX_BYTES: '83886080',
  COURSE_RUNTIME_ROOT: path.join(root, 'platform/api/course-runtime'),
  LEARNING_ARTIFACT_ROOT: path.join(root, 'platform/api/learning-artifacts'),
};
if (args.includes('--runtime-root')) values.COURSE_RUNTIME_ROOT = path.resolve(option('--runtime-root'));
if (args.includes('--artifact-root')) values.LEARNING_ARTIFACT_ROOT = path.resolve(option('--artifact-root'));
for (const file of ['.env', 'platform/api/.env']) {
  const filename = path.join(root, file);
  const existing = await readFile(filename).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (existing && !force) throw new Error(`${file} already exists; back it up before replacing.`);
  if (existing) {
    await writeFile(path.join(privateDir, `${Date.now()}-${file.replaceAll('/', '-')}.backup`), existing, { mode: 0o600 });
  }
  await writeFile(filename, Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n', { mode: 0o600 });
}
console.log('Local-only configuration generated; credentials were not printed.');
console.log(`Database: 127.0.0.1:55432/${dbName}; API binds 127.0.0.1 only.`);
