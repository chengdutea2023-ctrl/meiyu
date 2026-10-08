import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = path.join(os.homedir(), '.zhike-agent-secrets/local-development/docker');
await mkdir(config, { recursive: true, mode: 0o700 });
await writeFile(path.join(config, 'config.json'), '{}\n', { mode: 0o600 });
const colimaSocket = path.join(os.homedir(), '.colima/default/docker.sock');
const host = process.env.LOCAL_DOCKER_HOST || (existsSync(colimaSocket) ? `unix://${colimaSocket}` : 'unix:///var/run/docker.sock');
const standalone = spawnSync('which', ['docker-compose'], { encoding: 'utf8' }).status === 0;
const args = process.argv.slice(2);
const result = spawnSync(standalone ? 'docker-compose' : 'docker', [
  ...(standalone ? [] : ['compose']), ...(args.length ? args : ['up', '-d', 'postgres', 'redis']),
], { cwd: root, stdio: 'inherit', env: { ...process.env, DOCKER_HOST: host, DOCKER_CONTEXT: '', DOCKER_CONFIG: config } });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
