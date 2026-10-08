import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshot = process.argv[2] && path.resolve(process.argv[2]);
if (!snapshot) throw new Error('Pass the extracted private snapshot directory');
const envPath = path.join(repo, 'platform/api/.env');
const env = dotenv.parse(await readFile(envPath));
const database = new URL(env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(database.hostname) || database.port !== '55432') throw new Error('Local database required');
const runtime = path.join(repo, 'platform/api/course-runtime');
const artifacts = path.join(repo, 'platform/api/learning-artifacts');
for (const dir of [runtime, artifacts]) {
  const existing = await readdir(dir).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  if (existing.length) throw new Error(`Back up and move the existing local directory first: ${dir}`);
}
await mkdir(runtime, { recursive: true, mode: 0o700 });
const blocked = new Set(['node_modules', '.runtime', '.next', '.codex-backups', '.DS_Store']);
await cp(path.join(snapshot, 'courses'), runtime, {
  recursive: true, force: false, errorOnExist: true,
  filter: (source) => {
    const name = path.basename(source);
    return !blocked.has(name) && !name.startsWith('.env') && !name.startsWith('._') && !name.includes('.backup') && !/\.(log|pid)$/.test(name);
  },
});
await cp(path.join(snapshot, 'app/platform/api/learning-artifacts'), artifacts, { recursive: true, force: false, errorOnExist: true });
const comicPath = 'can-machines-learn/coursewares/four-panel-story-studio/.runtime/data';
await cp(path.join(snapshot, 'courses', comicPath), path.join(runtime, comicPath), { recursive: true, force: false, errorOnExist: true });
for (const file of ['.env', 'platform/api/.env']) {
  const filename = path.join(repo, file);
  const values = dotenv.parse(await readFile(filename));
  values.COURSE_RUNTIME_ROOT = runtime;
  values.LEARNING_ARTIFACT_ROOT = artifacts;
  await writeFile(filename, Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n', { mode: 0o600 });
}
console.log('Local runtime and artifacts copied without production environment files; original snapshot unchanged.');
