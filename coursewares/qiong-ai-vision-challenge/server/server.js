import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, stat } from 'node:fs/promises';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { MODEL, PROMPT_VERSION, recognizeImage, VisionError } from './provider.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (process.env.COURSEWARE_ENV_FILE && existsSync(process.env.COURSEWARE_ENV_FILE)) for (const line of readFileSync(process.env.COURSEWARE_ENV_FILE, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
}
const prefix = (process.env.NEXT_PUBLIC_COURSE_BASE_PATH || '').replace(/\/$/, '');
const model = process.env.ARK_VISION_MODEL || MODEL;
const platform = (process.env.PLATFORM_API_BASE || process.env.PLATFORM_API_BASE_URL || '').replace(/\/$/, '');
const demo = process.env.ALLOW_LOCAL_DEMO === '1';
const publicDemoLimit = Math.max(0, Number(process.env.VISION_PUBLIC_DEMO_LIMIT || 0));
const maxRequests = Math.max(1, Number(process.env.VISION_MAX_REQUESTS || 1000));
const dataRoot = resolve(process.env.COURSEWARE_DATA_DIR || join(root, '../../output/qiong-vision-server-data'));
await mkdir(dataRoot, { recursive: true, mode: 0o700 });
const journal = join(dataRoot, 'requests.json');
let state = existsSync(journal) ? JSON.parse(await readFile(journal, 'utf8')) : { calls: 0, demoCalls: 0, requests: {} };
for (const task of Object.values(state.requests)) if (task.state === 'running') Object.assign(task, { state: 'failed', code: 'RESULT_UNKNOWN', message: '上次识别在服务重启时中断，本次未计数；不会自动重复付费调用。', status: 504 });
let queue = Promise.resolve(), active = 0;
const flights = new Map();
const hash = x => createHash('sha256').update(x).digest('hex');
const validId = x => typeof x === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(x);
const fail = (ok, code, message, status = 400) => { if (!ok) throw new VisionError(code, message, status); };
async function persist() { const tmp = journal + '.tmp'; await writeFile(tmp, JSON.stringify(state), { mode: 0o600 }); await rename(tmp, journal); }
async function locked(fn) { const next = queue.catch(() => {}).then(fn); queue = next; return next; }
function json(res, status, value) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(value)); }
async function body(req) { const chunks = []; let size = 0; for await (const c of req) { size += c.length; fail(size <= 2200000, 'BODY_TOO_LARGE', '图片过大，请刷新实验台后重试。', 413); chunks.push(c); } try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new VisionError('INVALID_JSON', '请求无法读取。', 400); } }
async function identify(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
  const demoId = String(req.headers['x-demo-id'] || '');
  if (!token && (demo || publicDemoLimit > 0) && validId(demoId)) return { id: hash('demo:' + demoId), demo: true };
  fail(token && platform, 'LAUNCH_REQUIRED', '请从智课学生后台的眼力挑战进入，体验入口暂未开放云端识别。', 401);
  let r; try { r = await fetch(platform + '/course-runtime/launch/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ launchToken: token }), signal: AbortSignal.timeout(12000) }); } catch { throw new VisionError('PLATFORM_UNAVAILABLE', '课堂连接暂时不可用，请稍后重试。', 503); }
  fail(r.ok, 'LAUNCH_INVALID', '课堂凭证已失效，请返回学生后台重新进入。', 401);
  const { context: c } = await r.json();
  fail(c?.courseware?.slug === (process.env.COURSEWARE_SLUG || 'qiong-ai-vision-challenge') && c.course?.slug === (process.env.COURSE_SLUG || 'qiong-ai-inquiry') && c.student?.id && c.assignment?.id, 'LAUNCH_MISMATCH', '启动信息不属于本课件。', 403);
  return { id: hash(`${c.student.id}:${c.assignment.id}:${c.courseware.id}`), demo: false };
}
async function cleanImage(image) {
  fail(typeof image === 'string' && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(image), 'INVALID_IMAGE', '请使用实验台当前图片。');
  const b = Buffer.from(image.split(',')[1], 'base64');
  fail(b.length <= 1600000, 'BODY_TOO_LARGE', '图片过大。', 413);
  try { const decoder = sharp(b, { limitInputPixels: 768 * 512 }); const m = await decoder.metadata(); fail(m.width === 768 && m.height === 512, 'INVALID_IMAGE', '实验图片尺寸不正确，请刷新页面。'); return await decoder.png().toBuffer(); } catch (e) { if (e instanceof VisionError) throw e; throw new VisionError('INVALID_IMAGE', '图片无法读取，请刷新页面。', 400); }
}
function reply(res, task) { return task.state === 'succeeded' ? json(res, 200, { recognition: task.result, requestId: task.requestId }) : json(res, task.status || 502, { code: task.code, message: task.message, requestId: task.requestId }); }
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.txt': 'text/plain', '.csv': 'text/csv', '.bin': 'application/octet-stream' };
export const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://vision.invalid');
    let path = decodeURIComponent(url.pathname); if (prefix && path.startsWith(prefix + '/')) path = path.slice(prefix.length); else if (path === prefix) path = '/';
    if (path === '/api/health' && req.method === 'GET') return json(res, 200, { ok: true, configured: Boolean(process.env.ARK_API_KEY), model, promptVersion: PROMPT_VERSION, requestsUsed: state.calls, requestLimit: maxRequests, demoRemaining: Math.max(0, publicDemoLimit - state.demoCalls) });
    if (path === '/api/recognize' && req.method === 'POST') {
      const owner = await identify(req), b = await body(req);
      fail(Object.keys(b).every(k => ['image', 'requestId', 'experimentId'].includes(k)), 'UNEXPECTED_METADATA', '识别只接受当前图片及请求编号，不接受器物名称或答案。');
      fail(validId(b.requestId) && validId(b.experimentId), 'INVALID_REQUEST_ID', '请求编号无效，请刷新页面。');
      fail(process.env.ARK_API_KEY, 'NOT_CONFIGURED', '计算机视觉模型尚未配置，请联系老师。', 503);
      const image = await cleanImage(b.image), imageHash = hash(image);
      const key = hash(owner.id + ':' + b.requestId), experiment = hash(owner.id + ':' + b.experimentId);
      const task = await locked(async () => {
        if (state.requests[key]) { const prior = state.requests[key]; fail(prior.imageHash === imageHash && prior.experiment === experiment, 'REQUEST_CONFLICT', '请求编号与图片不一致，请重新识别。', 409); return prior; }
        const rows = Object.values(state.requests).filter(t => t.experiment === experiment && ['running', 'succeeded'].includes(t.state));
        fail(rows.length < 5, 'EXPERIMENT_LIMIT', '本次实验已达5次识别上限。', 429);
        fail(active < 4, 'SERVER_BUSY', '同时识别人数较多，请稍后重试，本次未计数。', 429);
        fail(state.calls < maxRequests, 'BUDGET_LIMIT', '课堂调用额度已用完，请联系老师；已有记录已保留。', 429);
        fail(!owner.demo || demo || state.demoCalls < publicDemoLimit, 'DEMO_LIMIT', '共享体验额度已用完，请从学生后台进入正式课堂。', 429);
        const task = { requestId: b.requestId, experiment, imageHash, state: 'running' }; state.requests[key] = task; state.calls++; if (owner.demo) state.demoCalls++; active++;
        await persist();
        const flight = (async () => { try { task.result = await recognizeImage({ image: 'data:image/png;base64,' + image.toString('base64'), apiKey: process.env.ARK_API_KEY, model }); task.state = 'succeeded'; }
          catch (e) { Object.assign(task, { state: 'failed', code: e instanceof VisionError ? e.code : 'PROVIDER_FAILED', message: e instanceof VisionError ? e.message : '识别暂未完成，本次未计数，请重试。', status: e.status || 502 }); }
          finally { active--; await locked(persist); flights.delete(key); } return task; })(); flights.set(key, flight); return task;
      });
      if (task.state === 'running') await flights.get(key);
      return reply(res, task);
    }
    fail(!path.startsWith('/api/'), 'NOT_FOUND', '操作不存在。', 404);
    fail(req.method === 'GET', 'NOT_FOUND', '页面不存在。', 404);
    const relative = path === '/' ? 'index.html' : path.slice(1), file = resolve(root, 'static', relative);
    fail(file.startsWith(resolve(root, 'static') + sep) && !relative.split('/').some(s => s.startsWith('.')), 'NOT_FOUND', '页面不存在。', 404);
    const info = await stat(file).catch(() => null); fail(info?.isFile(), 'NOT_FOUND', '页面不存在。', 404);
    res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'x-content-type-options': 'nosniff', 'cache-control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600' }); createReadStream(file).pipe(res);
  } catch (e) { if (!res.headersSent) json(res, e.status || 500, { code: e instanceof VisionError ? e.code : 'INTERNAL_ERROR', message: e instanceof VisionError ? e.message : '识别服务暂时不可用，请稍后重试。' }); else res.end(); }
});
await persist();
server.listen(Number(process.env.PORT || 4198), process.env.HOST || '127.0.0.1', () => console.log('眼力挑战视觉服务已启动'));
