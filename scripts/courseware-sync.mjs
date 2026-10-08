import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
if (!args.includes('--root')) throw new Error('Usage: --root <runtime-root> [--apply --backup <private-backup>]');
const root = path.resolve(option('--root'));
const apply = args.includes('--apply');
const backup = args.includes('--backup') ? path.resolve(option('--backup')) : null;
if (apply && (!backup || backup === root || backup.startsWith(`${root}${path.sep}`))) {
  throw new Error('Apply requires a separate private backup directory.');
}
const mapping = JSON.parse(await readFile(path.join(repo, 'ops/courseware-deployments.json'), 'utf8'));
const catalog = JSON.parse(await readFile(path.join(repo, 'coursewares/catalog.json'), 'utf8'));
if (mapping.coursewares.length !== catalog.coursewares.length) throw new Error('Incomplete deployment mapping');
const safeSlug = (slug) => /^[a-z0-9-]+$/.test(slug);
if (!safeSlug(mapping.courseSlug)) throw new Error('Invalid course slug');
const skipped = new Set(['node_modules', '.runtime', 'data', '.DS_Store']);
async function files(dir, relative = '') {
  const result = [];
  for (const entry of await readdir(path.join(dir, relative), { withFileTypes: true })) {
    if (skipped.has(entry.name) || entry.name.startsWith('.') || /\.(log|pid|zip)$/.test(entry.name)) continue;
    const name = path.join(relative, entry.name);
    if (entry.isDirectory()) result.push(...await files(dir, name));
    else if (entry.isFile()) result.push(name);
    else throw new Error(`Unsupported source entry: ${name}`);
  }
  return result;
}
const hash = (buffer) => createHash('sha256').update(buffer).digest('hex');
let different = 0;
let checked = 0;
for (const item of mapping.coursewares) {
  if (!safeSlug(item.sourceSlug) || !safeSlug(item.runtimeSlug)) throw new Error('Invalid courseware slug');
  if (!catalog.coursewares.some((row) => row.slug === item.sourceSlug)) throw new Error('Unknown source');
  const source = path.join(repo, 'coursewares', item.sourceSlug);
  const target = path.join(root, mapping.courseSlug, 'coursewares', item.runtimeSlug);
  let changed = 0;
  for (const name of await files(source)) {
    let content = await readFile(path.join(source, name));
    // Database runtime slugs are historical identities; do not rename them.
    if (name === 'manifest.json') {
      const manifest = JSON.parse(content.toString());
      manifest.slug = item.runtimeSlug;
      content = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
    }
    const destination = path.join(target, name);
    const existing = await readFile(destination).catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    checked += 1;
    if (existing && hash(existing) === hash(content)) continue;
    changed += 1;
    if (!apply) continue;
    if (existing) {
      const saved = path.join(backup, mapping.courseSlug, item.runtimeSlug, name);
      await mkdir(path.dirname(saved), { recursive: true, mode: 0o700 });
      await writeFile(saved, existing, { mode: 0o600, flag: 'wx' });
    }
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content);
  }
  different += changed;
  console.log(`${item.sourceSlug} -> ${item.runtimeSlug}: ${changed} ${apply ? 'updated' : 'different'} file(s)`);
}
console.log(`${checked} source files checked; ${different} differences${apply ? ' applied (no runtime data deleted)' : ''}.`);
if (!apply && different) process.exitCode = 1;
