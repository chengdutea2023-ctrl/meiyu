import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync, createReadStream } from 'node:fs';
import { readFile, writeFile, mkdir, rename, readdir, stat } from 'node:fs/promises';
import { resolve, dirname, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { generateImage } from './provider.mjs';
import { CONDITIONS, LessonError, requireValue, digest, cleanText, imageBuffer, normalizeImage, normalizedMask, compositeMasked, experimentPrompt, validateEvidence, validateReview } from './domain.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (process.env.COURSEWARE_ENV_FILE && existsSync(process.env.COURSEWARE_ENV_FILE)) {
  for (const line of readFileSync(process.env.COURSEWARE_ENV_FILE, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
const dataRoot = resolve(process.env.COURSEWARE_DATA_DIR || join(root, '..', '..', 'output', 'qiong-restoration-data'));
const slug = process.env.COURSEWARE_SLUG || 'qiong-ai-restoration-challenge';
const prefix = (process.env.NEXT_PUBLIC_COURSE_BASE_PATH || '').replace(/\/$/, '');
const model = process.env.ARK_IMAGE_MODEL || 'doubao-seedream-5-0-flash-260915';
const platformBase = (process.env.PLATFORM_API_BASE || '').replace(/\/$/, '');
const localDemo = process.env.ALLOW_LOCAL_DEMO === '1';
const mock = process.env.AI_TEST_MOCK === '1' && localDemo;
const maxRequests = Number(process.env.AI_MAX_REQUESTS || 0);
let requestCount = 0, reservation = Promise.resolve();
const owners = new Map(), tasks = new Map(), locks = new Map();
await mkdir(dataRoot, { recursive: true, mode: 0o700 });
const journal = join(dataRoot, 'request-count.json');
if (existsSync(journal)) requestCount = JSON.parse(await readFile(journal, 'utf8')).count || 0;
for (const name of await readdir(dataRoot)) if (/^[a-f0-9]{40}$/.test(name)) {
  const p = join(dataRoot, name, 'state.json');
  if (existsSync(p)) { const s = JSON.parse(await readFile(p, 'utf8')); owners.set(name, s); for (const t of s.tasks || []) { tasks.set(t.id, t); for (const r of t.results) { if (r.state === 'running') { r.state = 'unknown'; r.error = '上次请求中断，结果状态待确认；不会自动再次扣费。'; } else if (r.state === 'pending') { r.state = 'failed'; r.error = '服务重启前尚未发送，可手动重试此项。'; r.code = 'INTERRUPTED_BEFORE_SEND'; } } } }
}
async function atomicJson(path, value) { const tmp = `${path}.${randomUUID()}.tmp`; await writeFile(tmp, JSON.stringify(value), { mode: 0o600 }); await rename(tmp, path); }
async function persist(owner) { await mkdir(join(dataRoot, owner.id), { recursive: true, mode: 0o700 }); await atomicJson(join(dataRoot, owner.id, 'state.json'), owner); }
function json(res, status, value) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(value)); }
async function body(req) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > 20 * 1024 * 1024) throw new LessonError(413, 'BODY_TOO_LARGE', '文件过大，请分批导入或压缩后重试'); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new LessonError(400, 'INVALID_JSON', '数据无法读取，请重新操作'); }
}
async function identify(req) {
  let identity;
  const demoId = String(req.headers['x-demo-id'] || '');
  if (localDemo && !req.headers.authorization && /^[a-zA-Z0-9-]{16,80}$/.test(demoId)) identity = `demo:${demoId}`;
  else {
    const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
    requireValue(token && platformBase, '请从学生后台进入课件', 'LAUNCH_REQUIRED', 401);
    let r; try { r = await fetch(`${platformBase}/course-runtime/launch/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ launchToken: token }), signal: AbortSignal.timeout(12000) }); } catch { throw new LessonError(503, 'PLATFORM_UNAVAILABLE', '平台暂时无法连接，请稍后重试'); }
    requireValue(r.ok, '本次课件凭证已失效或老师已关闭课堂，请重新进入', 'LAUNCH_INVALID', 401);
    const { context: c } = await r.json();
    requireValue(c?.courseware?.slug === slug && c.student?.id && c.assignment?.id, '启动任务与本课件不匹配', 'LAUNCH_MISMATCH', 403);
    if (process.env.COURSE_SLUG) requireValue(c.course?.slug === process.env.COURSE_SLUG, '启动课程不匹配', 'COURSE_MISMATCH', 403);
    identity = `${c.student.id}:${c.assignment.id}:${c.courseware.id}`;
  }
  const id = digest(identity).slice(0, 40);
  if (!owners.has(id)) { owners.set(id, { id, assets: [], tasks: [], createdAt: Date.now(), holdoutFrozen: [] }); await persist(owners.get(id)); }
  return owners.get(id);
}
async function withOwnerLock(owner, fn) { const prior = locks.get(owner.id) || Promise.resolve(); const next = prior.catch(() => {}).then(fn); locks.set(owner.id, next); try { return await next; } finally { if (locks.get(owner.id) === next) locks.delete(owner.id); } }
const assetPath = (owner, id) => join(dataRoot, owner.id, `${id}.png`);
const fileIdValid = id => /^[a-zA-Z0-9-]{10,80}$/.test(id);
function publicTask(task) { return { id: task.id, state: task.results.every(r => r.state === 'succeeded') ? 'succeeded' : task.results.some(r => ['pending', 'running'].includes(r.state)) ? 'running' : 'partial', results: task.results, snapshot: task.snapshot, maskDataUrl: task.maskBase64 ? `data:image/png;base64,${task.maskBase64}` : null, reviewed: Boolean(task.review), review: task.review || null, createdAt: task.createdAt, model: task.model, mocked: task.mocked }; }
function ownedTask(owner, id) { const task = tasks.get(id); requireValue(task?.ownerId === owner.id, '找不到本次实验', 'NOT_FOUND', 404); return task; }
async function addAsset(owner, input, buffer) {
  const normalized = await normalizeImage(buffer, 1200), hash = digest(normalized);
  const prior = owner.assets.find(a => a.hash === hash); if (prior) return prior;
  requireValue(owner.assets.length < 25, '每份证据包最多25张图片，请先整理后再导入');
  const id = randomUUID();
  const a = { id, hash, title: cleanText(input.title || '未命名资料', 100), source: cleanText(input.source, 1200), feature: cleanText(input.feature, 300), claim: cleanText(input.claim, 500), reason: cleanText(input.reason, 500), role: ['reference', 'holdout', 'excluded'].includes(input.role) ? input.role : 'reference', usedInGeneration: false, builtinId: input.builtinId || null };
  await mkdir(join(dataRoot, owner.id), { recursive: true, mode: 0o700 }); await writeFile(assetPath(owner, id), normalized, { mode: 0o600 }); owner.assets.push(a); return a;
}
async function reserveRequest() {
  const next = reservation.catch(() => {}).then(async () => {
  if (maxRequests && requestCount >= maxRequests) throw new LessonError(429, 'TEST_BUDGET_REACHED', '本轮联调调用上限已到，已保留现有结果');
  requestCount++; await atomicJson(journal, { count: requestCount });
  }); reservation = next; return next;
}
async function provider(images, prompt) {
  requireValue(process.env.ARK_API_KEY || mock, '真实生成暂未配置，请联系老师；已有资料已保留', 'AI_NOT_CONFIGURED', 503);
  await reserveRequest();
  if (mock) { await new Promise(r => setTimeout(r, Number(process.env.MOCK_DELAY_MS || 100))); return imageBuffer(images[0]); }
  return generateImage({ images, prompt, model, apiKey: process.env.ARK_API_KEY, timeoutMs: Number(process.env.AI_TIMEOUT_MS || 240000) });
}
async function runChild(owner, task, result) {
  result.state = 'running'; for (const field of ['error', 'code', 'upstreamStatus', 'upstreamCode']) delete result[field]; await persist(owner);
  try {
    const target = await readFile(join(root, 'static/assets/case-damaged.png'));
    const refs = result.key === 'evidence' ? await Promise.all(task.snapshot.referenceIds.map(id => readFile(assetPath(owner, id)))) : result.key === 'mismatch' ? await Promise.all(task.snapshot.referenceIds.map((_, i) => readFile(join(root, `server/private/mismatch-${i + 1}.png`)))) : [];
    const inputs = [target, ...refs].map(b => `data:image/png;base64,${b.toString('base64')}`);
    result.inputHashes = [digest(target), ...refs.map(digest)]; result.promptHash = digest(task.snapshot.prompt); result.referenceCount = refs.length;
    if (mock && process.env.AI_TEST_FAIL_KEY === result.key && result.attempts === 1) throw new LessonError(502, 'MOCK_FAILURE', '模拟子任务失败，用于验证失败项重试');
    const output = await provider(inputs, task.snapshot.prompt);
    const mask = Buffer.from(task.maskBase64, 'base64');
    const composite = await compositeMasked(target, output, mask);
    const id = randomUUID(); await writeFile(assetPath(owner, id), composite, { mode: 0o600 }); result.fileId = id; result.state = 'succeeded'; result.finishedAt = Date.now();
  } catch (e) { result.state = e.code === 'AI_RESULT_UNKNOWN' ? 'unknown' : 'failed'; result.error = e instanceof LessonError ? e.message : '图片处理未完成，已保留其他结果，请重试失败项'; result.code = e.code || 'PROCESSING_FAILED'; if (Number.isInteger(e.upstreamStatus)) result.upstreamStatus = e.upstreamStatus; if (e.upstreamCode) result.upstreamCode = e.upstreamCode; }
  await persist(owner);
}
async function runTask(owner, task) { for (const result of task.results) if (result.state === 'pending') await runChild(owner, task, result); }
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8', '.zip': 'application/zip', '.csv': 'text/csv; charset=utf-8' };
export const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://courseware.invalid');
    let path = decodeURIComponent(url.pathname); if (prefix && path.startsWith(`${prefix}/`)) path = path.slice(prefix.length);
    if (path === '/api/health') return json(res, 200, { ok: true, configured: Boolean(process.env.ARK_API_KEY), mocked: mock, model, requestsUsed: requestCount, requestLimit: maxRequests || null });
    if (path.startsWith('/api/')) {
      const owner = await identify(req);
      if (req.method === 'GET' && path === '/api/session') return json(res, 200, { ownerId: owner.id, assets: owner.assets, tasks: owner.tasks.map(publicTask), configured: Boolean(process.env.ARK_API_KEY), mocked: mock, maxRounds: 2 });
      if (req.method === 'GET' && /^\/api\/files\/[a-zA-Z0-9-]+$/.test(path)) {
        const id = path.split('/').at(-1); requireValue(fileIdValid(id) && (owner.assets.some(a => a.id === id) || owner.tasks.some(t => t.results.some(r => r.fileId === id))), '图片不存在或不属于当前任务', 'NOT_FOUND', 404);
        const b = await readFile(assetPath(owner, id)); if (url.searchParams.get('format') === 'data') return json(res, 200, { dataUrl: `data:image/png;base64,${b.toString('base64')}` }); res.writeHead(200, { 'content-type': 'image/png', 'content-length': b.length, 'cache-control': 'private, no-store' }); return res.end(b);
      }
      if (req.method === 'GET' && path === '/api/case/original') { const task = ownedTask(owner, url.searchParams.get('experimentId')); requireValue(task.review, '完成三组证据审查后才能揭晓原图', 'REVIEW_REQUIRED', 403); const b = await readFile(join(root, 'server/private/case-original.png')); if (url.searchParams.get('format') === 'data') return json(res, 200, { dataUrl: `data:image/png;base64,${b.toString('base64')}` }); res.writeHead(200, { 'content-type': 'image/png', 'content-length': b.length, 'cache-control': 'private, no-store' }); return res.end(b); }
      if (req.method === 'POST' && path === '/api/assets') return await withOwnerLock(owner, async () => { const input = await body(req); const a = await addAsset(owner, input, imageBuffer(input.dataUrl)); await persist(owner); return json(res, 200, { asset: a }); });
      if (req.method === 'POST' && path === '/api/assets/teacher-pack') return await withOwnerLock(owner, async () => { const catalog = JSON.parse(await readFile(join(root, 'server/private/teacher-pack.json'), 'utf8')); for (const item of catalog) await addAsset(owner, item, await readFile(join(root, `server/private/${item.file}`))); await persist(owner); return json(res, 200, { assets: owner.assets }); });
      if (req.method === 'PATCH' && /^\/api\/assets\/[a-zA-Z0-9-]+$/.test(path)) return await withOwnerLock(owner, async () => { const a = owner.assets.find(a => a.id === path.split('/').at(-1)); requireValue(a, '资料不存在', 'NOT_FOUND', 404); const b = await body(req); requireValue(!(b.role === 'holdout' && (a.usedInGeneration || owner.holdoutFrozen.length && !owner.holdoutFrozen.includes(a.id))), '已参与生成的图片不能改为核验资料'); if (owner.holdoutFrozen.includes(a.id)) requireValue(!b.role || b.role === 'holdout', '本轮核验资料已经封存'); for (const k of ['title', 'source', 'feature', 'claim', 'reason']) if (b[k] !== undefined) a[k] = cleanText(b[k], k === 'source' ? 1200 : 800); if (['reference', 'holdout', 'excluded'].includes(b.role)) a.role = b.role; await persist(owner); return json(res, 200, { asset: a }); });
      if (req.method === 'POST' && path === '/api/experiments') return await withOwnerLock(owner, async () => {
        const b = await body(req); requireValue(/^[a-zA-Z0-9-]{16,80}$/.test(b.requestId || ''), '实验请求编号无效');
        const same = owner.tasks.find(t => t.requestId === b.requestId); if (same) return json(res, 200, { task: publicTask(same) });
        requireValue(owner.tasks.length < 2, '本次课堂最多进行两轮实验，请先分析已有结果', 'ROUND_LIMIT', 429);
        requireValue(process.env.ARK_API_KEY || mock, '真实生成暂未配置；资料与假设已保留', 'AI_NOT_CONFIGURED', 503);
        const referenceIds = b.referenceIds, holdoutIds = owner.assets.filter(a => a.role === 'holdout').map(a => a.id);
        validateEvidence(owner.assets, referenceIds, holdoutIds, b.constraints);
        requireValue(cleanText(b.prediction).length >= 8, '生成前请先写下你的预测（至少8个字）');
        const target = await readFile(join(root, 'static/assets/case-damaged.png')); const { width, height } = await sharp(target).metadata();
        const mask = await normalizedMask(imageBuffer(b.maskDataUrl), width, height);
        const constraints = b.constraints.map(c => ({ text: cleanText(c.text, 300), evidenceId: c.evidenceId }));
        const snapshot = { constraints, referenceIds, holdoutIds, prediction: cleanText(b.prediction), prompt: experimentPrompt(constraints, mask.bounds, width, height), maskHash: digest(mask.data), bounds: mask.bounds, targetHash: digest(target), width, height, size: '1K', evidence: owner.assets.map(a => ({ ...a })) };
        const task = { id: randomUUID(), requestId: b.requestId, ownerId: owner.id, createdAt: Date.now(), model, mocked: mock, snapshot, maskBase64: mask.data.toString('base64'), results: CONDITIONS.map(c => ({ ...c, state: 'pending', attempts: 1 })) };
        for (const a of owner.assets) if (referenceIds.includes(a.id)) a.usedInGeneration = true;
        owner.holdoutFrozen = holdoutIds; owner.tasks.push(task); tasks.set(task.id, task); await persist(owner); json(res, 202, { task: publicTask(task) }); void runTask(owner, task).catch(() => {});
      });
      const taskMatch = path.match(/^\/api\/experiments\/([a-zA-Z0-9-]+)(?:\/(retry|review))?$/);
      if (taskMatch) {
        const task = ownedTask(owner, taskMatch[1]);
        if (req.method === 'GET' && !taskMatch[2]) return json(res, 200, { task: publicTask(task) });
        if (req.method === 'POST' && taskMatch[2] === 'retry') return await withOwnerLock(owner, async () => { requireValue(!task.results.some(r => ['pending', 'running'].includes(r.state)), '生成仍在进行，请稍候'); const failed = task.results.filter(r => r.state === 'failed'); requireValue(failed.length, '没有可重试的失败项；状态待确认的请求不会自动重跑'); requireValue(failed.every(r => r.attempts < 2), '本轮重试次数已到，请保留结果联系老师'); for (const r of failed) { r.state = 'pending'; r.attempts++; } await persist(owner); json(res, 202, { task: publicTask(task) }); void runTask(owner, task).catch(() => {}); });
        if (req.method === 'POST' && taskMatch[2] === 'review') return await withOwnerLock(owner, async () => { const b = await body(req); validateReview(b.annotations, b.conclusion, task); task.review = { annotations: b.annotations.map(a => ({ condition: a.condition, kind: a.kind, evidenceId: a.evidenceId, reason: cleanText(a.reason), x: a.x, y: a.y })), conclusion: cleanText(b.conclusion), savedAt: Date.now() }; await persist(owner); return json(res, 200, { task: publicTask(task) }); });
      }
      throw new LessonError(404, 'NOT_FOUND', '没有找到这个操作');
    }
    requireValue(req.method === 'GET', '不支持的操作', 'NOT_FOUND', 404);
    const relative = path === '/' ? 'index.html' : path.replace(/^\//, '');
    const file = resolve(root, 'static', relative);
    requireValue(file.startsWith(resolve(root, 'static') + sep) && !relative.split('/').some(s => s.startsWith('.')), '文件不存在', 'NOT_FOUND', 404);
    const info = await stat(file).catch(() => null); requireValue(info?.isFile(), '页面不存在', 'NOT_FOUND', 404);
    res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'x-content-type-options': 'nosniff', 'cache-control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600' }); createReadStream(file).pipe(res);
  } catch (e) { if (!res.headersSent) json(res, e instanceof LessonError ? e.status : 500, { code: e.code || 'INTERNAL_ERROR', message: e instanceof LessonError ? e.message : '操作暂时未完成，请重试；已有资料已保留' }); else res.end(); }
});
server.listen(Number(process.env.PORT || 4198), process.env.HOST || '127.0.0.1', () => { console.log('邛窑AI修复挑战服务已启动'); });
