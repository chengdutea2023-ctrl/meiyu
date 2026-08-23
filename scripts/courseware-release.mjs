import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const MAX_PACKAGE_BYTES = 80 * 1024 * 1024;
const VALID_RUNTIME_TYPES = new Set(['STATIC', 'NODE', 'BOTH']);
const FORBIDDEN_SEGMENTS = new Set([
  'node_modules',
  '.runtime',
  '.codex-backups',
  '.git',
  '.svn',
]);
const FORBIDDEN_FILE_NAMES = new Set([
  '.env',
  'deploy.log',
  'node.pid',
  'env.json',
]);

export function isForbiddenRelativePath(relativePath) {
  const normalized = relativePath.split(path.sep).join('/');
  const segments = normalized.split('/');

  if (segments.some((segment) => FORBIDDEN_SEGMENTS.has(segment))) {
    return true;
  }

  if (segments[0] === 'server' && segments[1] === 'data') {
    return true;
  }

  const fileName = segments.at(-1) ?? '';
  return (
    FORBIDDEN_FILE_NAMES.has(fileName) ||
    fileName.startsWith('.env.') ||
    fileName.endsWith('.log') ||
    fileName.endsWith('.pid') ||
    fileName === '.DS_Store'
  );
}

async function pathExists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(current, entry.name);
    const relativePath = path.relative(root, absolutePath);

    if (isForbiddenRelativePath(relativePath)) {
      throw new Error(`禁止打包的路径: ${relativePath}`);
    }

    if (entry.isSymbolicLink()) {
      throw new Error(`课件源码不允许符号链接: ${relativePath}`);
    }

    if (entry.isDirectory()) {
      files.push(...await collectFiles(root, absolutePath));
    } else if (entry.isFile()) {
      files.push(relativePath.split(path.sep).join('/'));
    }
  }

  return files.sort();
}

export function validateManifestShape(manifest, expected) {
  const errors = [];

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return ['manifest.json 必须是 JSON 对象'];
  }
  if (manifest.slug !== expected.slug) {
    errors.push(`manifest.slug 必须为 ${expected.slug}`);
  }
  if (typeof manifest.title !== 'string' || !manifest.title.trim()) {
    errors.push('manifest.title 不能为空');
  } else if (manifest.title.trim() !== expected.title) {
    errors.push(`manifest.title 必须与目录清单一致: ${expected.title}`);
  }
  if (!VALID_RUNTIME_TYPES.has(manifest.runtimeType)) {
    errors.push('manifest.runtimeType 必须是 STATIC、NODE 或 BOTH');
  }
  if (manifest.runtimeType !== expected.runtimeType) {
    errors.push(`manifest.runtimeType 必须与目录清单一致: ${expected.runtimeType}`);
  }
  if (typeof manifest.entry !== 'string' || !manifest.entry.startsWith('/')) {
    errors.push('manifest.entry 必须以 / 开头');
  }
  if (
    manifest.nodePort !== null &&
    manifest.nodePort !== undefined &&
    (!Number.isInteger(manifest.nodePort) || manifest.nodePort < 1024 || manifest.nodePort > 65535)
  ) {
    errors.push('manifest.nodePort 必须为 null 或 1024-65535 的整数');
  }

  return errors;
}

async function validateCourseware(repoRoot, entry) {
  const sourceDir = path.join(repoRoot, 'coursewares', entry.slug);
  const manifestPath = path.join(sourceDir, 'manifest.json');
  const errors = [];

  if (!await pathExists(sourceDir)) {
    throw new Error(`${entry.slug}: 源码目录不存在`);
  }
  if (!await pathExists(manifestPath)) {
    throw new Error(`${entry.slug}: 缺少 manifest.json`);
  }

  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`${entry.slug}: manifest.json 无法解析: ${error.message}`);
  }

  errors.push(...validateManifestShape(manifest, entry));

  if (entry.runtimeType === 'STATIC' || entry.runtimeType === 'BOTH') {
    const hasStaticEntry =
      await pathExists(path.join(sourceDir, 'static', 'index.html')) ||
      await pathExists(path.join(sourceDir, 'index.html'));
    if (!hasStaticEntry) {
      errors.push('STATIC/BOTH 课件必须包含 static/index.html 或根目录 index.html');
    }
  }

  if (entry.runtimeType === 'NODE' || entry.runtimeType === 'BOTH') {
    const hasServerPackage =
      await pathExists(path.join(sourceDir, 'server', 'package.json')) ||
      await pathExists(path.join(sourceDir, 'package.json'));
    if (!hasServerPackage) {
      errors.push('NODE/BOTH 课件必须包含 server/package.json 或根目录 package.json');
    }
  }

  const files = await collectFiles(sourceDir);
  if (files.length === 0) {
    errors.push('课件源码目录为空');
  }

  if (errors.length > 0) {
    throw new Error(`${entry.slug}:\n- ${errors.join('\n- ')}`);
  }

  return { ...entry, sourceDir, files, manifest };
}

export async function validateCatalog({ repoRoot = REPO_ROOT, selectedSlugs = [] } = {}) {
  const catalogPath = path.join(repoRoot, 'coursewares', 'catalog.json');
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));

  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.coursewares)) {
    throw new Error('coursewares/catalog.json 格式无效');
  }

  const entries = selectedSlugs.length > 0
    ? catalog.coursewares.filter((entry) => selectedSlugs.includes(entry.slug))
    : catalog.coursewares;
  const uniqueSlugs = new Set(entries.map((entry) => entry.slug));

  if (entries.length !== uniqueSlugs.size) {
    throw new Error('coursewares/catalog.json 存在重复 slug');
  }
  if (selectedSlugs.length > 0 && entries.length !== new Set(selectedSlugs).size) {
    throw new Error('请求打包的课件 slug 不在目录清单中');
  }

  const validated = [];
  for (const entry of entries) {
    validated.push(await validateCourseware(repoRoot, entry));
  }

  return { catalog, coursewares: validated };
}

async function sha256File(filePath) {
  const content = await readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
}

function sourceState(repoRoot) {
  const commit = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
  const dirty = execFileSync('git', ['status', '--porcelain', '--', 'coursewares'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim().length > 0;
  return { commit, dirty, revision: `${commit}${dirty ? '-dirty' : ''}` };
}

async function packageCourseware(courseware, outputDir, revision) {
  const fileName = `${courseware.slug}-${revision}.zip`;
  const outputPath = path.join(outputDir, fileName);
  await rm(outputPath, { force: true });

  const result = spawnSync('zip', ['-q', '-X', outputPath, ...courseware.files], {
    cwd: courseware.sourceDir,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`${courseware.slug}: ZIP 生成失败: ${result.stderr || result.stdout}`);
  }

  const details = await stat(outputPath);
  if (details.size > MAX_PACKAGE_BYTES) {
    await rm(outputPath, { force: true });
    throw new Error(`${courseware.slug}: ZIP 超过 80MB 上传限制`);
  }

  return {
    courseSlug: courseware.courseSlug,
    slug: courseware.slug,
    title: courseware.title,
    runtimeType: courseware.runtimeType,
    fileName,
    bytes: details.size,
    sha256: await sha256File(outputPath),
  };
}

function parseArgs(argv) {
  const selectedSlugs = [];
  let validateOnly = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--validate-only') {
      validateOnly = true;
    } else if (arg === '--slug') {
      const slug = argv[index + 1];
      if (!slug) throw new Error('--slug 后必须提供课件 slug');
      selectedSlugs.push(slug);
      index += 1;
    } else {
      throw new Error(`未知参数: ${arg}`);
    }
  }

  return { selectedSlugs, validateOnly };
}

export async function run(argv = process.argv.slice(2), repoRoot = REPO_ROOT) {
  const { selectedSlugs, validateOnly } = parseArgs(argv);
  const { catalog, coursewares } = await validateCatalog({ repoRoot, selectedSlugs });
  console.log(`Validated ${coursewares.length} courseware package(s).`);

  if (validateOnly) return;

  const source = sourceState(repoRoot);
  const outputDir = path.join(repoRoot, 'output', 'courseware-releases');
  await mkdir(outputDir, { recursive: true });
  const releases = [];

  for (const courseware of coursewares) {
    releases.push(await packageCourseware(
      { ...courseware, courseSlug: catalog.courseSlug },
      outputDir,
      source.revision,
    ));
  }

  const releaseManifest = {
    schemaVersion: 1,
    sourceCommit: source.commit,
    sourceDirty: source.dirty,
    sourceRevision: source.revision,
    generatedAt: new Date().toISOString(),
    coursewares: releases,
  };
  await writeFile(
    path.join(outputDir, 'release-manifest.json'),
    `${JSON.stringify(releaseManifest, null, 2)}\n`,
  );
  console.log(`Wrote ${releases.length} package(s) to ${outputDir}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
