import { spawn } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = dotenv.parse(await readFile(path.join(repo, 'platform/api/.env')));
const database = new URL(config.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(database.hostname) || database.port !== '55432') throw new Error('Local database required');
const logs = path.join(repo, 'output/local-services');
await mkdir(logs, { recursive: true, mode: 0o700 });
const mapping = JSON.parse(await readFile(path.join(repo, 'ops/courseware-deployments.json')));
const common = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: process.env.LANG || 'en_US.UTF-8', HOST: '127.0.0.1' };
const services = [
  { name: 'api', port: 3000, cwd: path.join(repo, 'platform/api'), args: ['dist/main.js'], env: common, health: 'http://127.0.0.1:3000/api/health' },
  { name: 'admin', port: 5173, cwd: path.join(repo, 'apps/admin-web'), args: [path.join(repo, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5173', '--strictPort'], env: common, health: 'http://127.0.0.1:5173/' },
  ...mapping.coursewares.filter((item) => item.nodePort).map((item) => ({
    name: item.sourceSlug, port: item.nodePort, cwd: path.join(repo, 'coursewares', item.sourceSlug, 'server'), args: ['server.js'],
    env: { ...common, PORT: String(item.nodePort), COURSE_SLUG: mapping.courseSlug, COURSEWARE_SLUG: item.runtimeSlug,
      NEXT_PUBLIC_COURSE_BASE_PATH: `/${mapping.courseSlug}/${item.runtimeSlug}`,
      COURSEWARE_PUBLIC_URL: `http://localhost:3000/${mapping.courseSlug}/${item.runtimeSlug}`,
      COURSEWARE_DATA_DIR: path.join(config.COURSE_RUNTIME_ROOT, mapping.courseSlug, 'coursewares', item.runtimeSlug, item.sourceSlug === 'four-panel-story-studio' ? '.runtime/data' : 'server/data'),
    },
    health: `http://127.0.0.1:${item.nodePort}/${item.sourceSlug === 'four-panel-story-studio' ? 'api/health' : 'health'}`,
  })),
];
const reachable = (port) => new Promise((resolve) => {
  const socket = net.createConnection({ host: '127.0.0.1', port });
  const done = (ok) => { socket.destroy(); resolve(ok); };
  socket.setTimeout(500);
  socket.once('connect', () => done(true)); socket.once('error', () => done(false)); socket.once('timeout', () => done(false));
});
for (const service of services) {
  if (await reachable(service.port)) throw new Error(`Port ${service.port} occupied; inspect the existing process before starting.`);
}
const started = [];
try {
  for (const service of services) {
    const log = openSync(path.join(logs, `${service.name}.log`), 'a', 0o600);
    const child = spawn(process.execPath, service.args, { cwd: service.cwd, env: service.env, detached: true, stdio: ['ignore', log, log] });
    closeSync(log);
    child.unref();
    if (!child.pid) throw new Error(`Unable to start ${service.name}`);
    started.push({ name: service.name, pid: child.pid, port: service.port });
  }
  for (const service of services) {
    let ok = false;
    for (let i = 0; i < 60; i += 1) {
      ok = await fetch(service.health, { signal: AbortSignal.timeout(2000) }).then((response) => response.ok, () => false);
      if (ok) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!ok) throw new Error(`${service.name} did not become healthy; inspect output/local-services/${service.name}.log`);
  }
  await writeFile(path.join(logs, 'processes.json'), JSON.stringify({ startedAt: new Date().toISOString(), services: started }, null, 2), { mode: 0o600 });
  console.log('Local API, admin and two Node coursewares are healthy (loopback only).');
  console.log('http://localhost:5173/ | http://localhost:5173/?portal=teacher | http://localhost:5173/?portal=student');
} catch (error) {
  for (const child of started) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
  throw error;
}
