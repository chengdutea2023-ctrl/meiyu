import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import sharp from "sharp";
import { createLaunchGuard } from './launch-guard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticRoot = path.resolve(__dirname, "../static");
const app = express();
const port = Number(process.env.PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('平台必须分配有效 PORT');
const providerEndpoint = process.env.DONGNIAO_ENDPOINT || "https://ai.open.hhodata.com/api/v2/dongniao";
const maxUploadBytes = 1_900_000;
const providerAttempts = 8;
const providerPollDelayMs = 1_000;

app.disable("x-powered-by");
app.use(express.json({ limit: "12mb" }));
const publicPath = String(process.env.NEXT_PUBLIC_COURSE_BASE_PATH || '').replace(/\/$/, '');
app.use((request, _response, next) => {
  if (publicPath && (request.url === publicPath || request.url.startsWith(`${publicPath}/`) || request.url.startsWith(`${publicPath}?`))) {
    request.url = request.url.slice(publicPath.length) || '/';
  }
  next();
});
const authorize = createLaunchGuard();
const tasks = new Map(), quotas = new Map(), activeLearners = new Set();

function safeLog(stage, message, extra = {}) {
  console.info(JSON.stringify({ requestId: extra.requestId, stage, message, durationMs: extra.durationMs }));
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function providerKey() {
  const key = String(process.env.DONGNIAO_API_KEY || "").trim();
  if (!key) throw httpError(503, "懂鸟识别服务尚未配置，请联系教师或管理员。");
  return key;
}

function providerCode(payload) {
  if (Array.isArray(payload) && payload.length) return String(payload[0]);
  if (payload && typeof payload === "object") {
    if (payload.status !== undefined) return ["success", "ok"].includes(String(payload.status).toLowerCase()) ? "1000" : String(payload.status);
    if (Array.isArray(payload.data) && payload.data.length) return String(payload.data[0]);
  }
  return "";
}

function providerData(payload) {
  if (Array.isArray(payload) && /^\d+$/.test(String(payload[0] || ""))) return payload[1];
  if (!payload || typeof payload !== "object") return null;
  if (Array.isArray(payload.data) && /^\d+$/.test(String(payload.data[0] || ""))) return payload.data[1];
  return payload.data ?? null;
}

function parseDataUrl(value) {
  const source = String(value || "");
  const encoded = source.includes(",") ? source.slice(source.indexOf(",") + 1) : source;
  try {
    return Buffer.from(encoded, "base64");
  } catch {
    throw httpError(400, "图片无法读取，请上传 JPG、PNG 或 WebP 文件。");
  }
}

async function compressImage(buffer) {
  let pipeline = sharp(buffer, { limitInputPixels: 24000000 }).rotate();
  let metadata;
  try { metadata = await pipeline.metadata(); } catch { throw httpError(400, '图片无法解码'); }
  let width = metadata.width || 1600;
  let quality = 90;
  while (true) {
    const output = await pipeline.resize({ width, withoutEnlargement: true }).jpeg({ quality, mozjpeg: true }).toBuffer();
    if (output.length <= maxUploadBytes) {
      const outputMetadata = await sharp(output).metadata();
      return { buffer: output, width: outputMetadata.width || width, height: outputMetadata.height || 1 };
    }
    if (quality > 60) {
      quality -= 10;
    } else if (width > 320) {
      width = Math.floor(width * 0.8);
      quality = 85;
    } else {
      throw httpError(400, "图片压缩后仍超过识别服务限制，请换一张较小的图片。");
    }
  }
}

async function providerFetch(body, requestId, deadline) {
  const controller = new AbortController();
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw httpError(504, '识别任务超时，请稍后重试。');
  const timer = setTimeout(() => controller.abort(), Math.min(45_000, remaining));
  try {
    const response = await fetch(providerEndpoint, {
      method: "POST",
      headers: { api_key: providerKey() },
      body,
      signal: controller.signal,
    });
    const text = await response.text();
    let payload;
    try { payload = JSON.parse(text); } catch { throw httpError(502, "懂鸟识别服务返回了无法解析的数据。"); }
    if (!response.ok) throw httpError(502, `懂鸟识别服务暂时不可用（HTTP ${response.status}）。`);
    return payload;
  } catch (error) {
    if (error.name === "AbortError") throw httpError(504, "懂鸟识别服务响应超时，请稍后重试。");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function parseBirds(result, imageWidth, imageHeight) {
  if (!Array.isArray(result)) return [];
  return result.flatMap((record) => {
    if (!record || !Array.isArray(record.box) || record.box.length !== 4 || !Array.isArray(record.list)) return [];
    const [x1, y1, x2, y2] = record.box.map(Number);
    if (![x1, y1, x2, y2].every(Number.isFinite)) return [];
    const candidates = record.list.slice(0, 3).flatMap((item) => {
      const confidence = Number(item?.[0]) / 100;
      const name = String(item?.[1] || "暂时无法确定").split("|", 1)[0].trim();
      return Number.isFinite(confidence) ? [{ name, confidence: Math.max(0, Math.min(1, confidence)) }] : [];
    });
    const top = candidates[0] || { name: "暂时无法确定", confidence: 0 };
    return [{
      name: top.name,
      confidence: top.confidence,
      candidates,
      note: "懂鸟 AI 已定位鸟体，并返回该鸟框的物种候选结果。",
      box: {
        x: Number((Math.max(0, x1) / imageWidth * 100).toFixed(2)),
        y: Number((Math.max(0, y1) / imageHeight * 100).toFixed(2)),
        w: Number((Math.max(0, x2 - x1) / imageWidth * 100).toFixed(2)),
        h: Number((Math.max(0, y2 - y1) / imageHeight * 100).toFixed(2)),
      },
    }];
  });
}

app.get('/api/health', (_request, response) => response.json({ ok: true, configured: Boolean(process.env.DONGNIAO_API_KEY) }));
app.get("/api/birds/runtime", authorize, (_request, response) => {
  response.json({ status: process.env.DONGNIAO_API_KEY ? "ready" : "not_configured", provider: "dongniao", events: [] });
});

async function recognize(imageValue) {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const deadline = startedAt + 90000;
  const logs = [];
  const log = (stage, message) => logs.push({ stage, message, durationMs: Date.now() - startedAt });
  try {
    providerKey();
    log("prepare", "服务器正在读取并压缩图片。");
    const image = await compressImage(parseDataUrl(imageValue));
    log("upload", "图片已提交给懂鸟 AI，正在检测鸟的位置。");
    const form = new FormData();
    form.append("image", new Blob([image.buffer], { type: "image/jpeg" }), "bird.jpg");
    form.append("upload", "1");
    form.append("class", "B");
    form.append("did", process.env.DONGNIAO_DEVICE_ID || "ZhikeBirdAI");
    const submit = await providerFetch(form, requestId, deadline);
    if (providerCode(submit) !== "1000") throw httpError(502, '懂鸟 API 上传未完成，请稍后重试。');
    const submitted = providerData(submit);
    const resultId = typeof submitted === "string" ? submitted : String(submitted?.recognitionId || submitted?.resultid || "");
    if (!resultId) throw httpError(502, "懂鸟 API 未返回识别任务编号。");

    let result = null;
    for (let attempt = 1; attempt <= providerAttempts; attempt += 1) {
      if (attempt > 1) await sleep(providerPollDelayMs);
      const poll = new URLSearchParams({ resultid: resultId });
      const payload = await providerFetch(poll, requestId, deadline);
      const code = providerCode(payload);
      if (code === "1001") {
        log("polling", `懂鸟 AI 正在识别，已完成第 ${attempt} 次结果查询。`);
        continue;
      }
      if (code === "1008" || code === "1009") {
        result = [];
        break;
      }
      if (code !== "1000") throw httpError(502, '懂鸟 AI 识别未完成，请稍后重试。');
      result = providerData(payload);
      log("result", `懂鸟 AI 已完成检测和鸟种识别（第 ${attempt} 次查询）。`);
      break;
    }
    if (result === null) throw httpError(504, "懂鸟 AI 识别超时，请稍后重试。");
    const birds = parseBirds(result, image.width, image.height);
    safeLog("recognize", "completed", { requestId, durationMs: Date.now() - startedAt });
    return {
      title: "懂鸟 AI 检测 + 鸟种识别结果",
      summary: birds.length ? "懂鸟 AI 已完成鸟体定位和鸟种识别。" : "未检测到明确鸟类目标，请换一张鸟体更清晰的图片。",
      birds,
      logs,
    };
  } catch (error) {
    safeLog("recognize", "failed", { requestId, durationMs: Date.now() - startedAt });
    throw error;
  }
}

app.post('/api/birds/recognize', authorize, async (request, response, next) => {
  const image = String(request.body?.image || '');
  if (!image || image.length > 11000000 || !/^(?:data:image\/(?:jpeg|png|webp);base64,)?[A-Za-z0-9+/=\s]+$/.test(image)) {
    return response.status(400).json({ detail: '请选择有效且小于 8 MB 的 JPG、PNG 或 WebP 图片。' });
  }
  const now = Date.now();
  for (const [key, task] of tasks) if (task.expiresAt <= now) tasks.delete(key);
  for (const [key, quota] of quotas) if (quota.expiresAt <= now) quotas.delete(key);
  const taskKey = `${request.learnerKey}:${crypto.createHash('sha256').update(image).digest('hex')}`;
  const prior = tasks.get(taskKey);
  if (prior) {
    try { return response.json(await prior.promise); } catch (error) { return next(error); }
  }
  const quota = quotas.get(request.learnerKey) || { used: 0, expiresAt: now + 60000 };
  if (quota.used >= 6 || activeLearners.has(request.learnerKey) || activeLearners.size >= 2 || tasks.size >= 128 || quotas.size >= 1000) {
    return response.status(429).json({ detail: '识别服务繁忙，请稍后重试。' });
  }
  quota.used += 1; quotas.set(request.learnerKey, quota); activeLearners.add(request.learnerKey);
  const promise = recognize(image).finally(() => activeLearners.delete(request.learnerKey));
  tasks.set(taskKey, { promise, expiresAt: now + 10 * 60000 });
  try { response.json(await promise); }
  catch (error) { next(error); }
});

app.use(express.static(staticRoot, { index: "index.html", fallthrough: true }));
app.get("/{*splat}", (_request, response) => response.sendFile(path.join(staticRoot, "index.html")));
app.use((error, _request, response, _next) => {
  const status = Number(error.status) || 500;
  response.status(status).json({ detail: status >= 500 ? '识别服务暂时不可用，请稍后重试。同一启动会话的相同图片任务会短暂复用，避免连续重复请求。' : '图片或请求格式无效，请检查后重试。' });
});

app.listen(port, process.env.HOST || '127.0.0.1', () => safeLog('startup', 'server ready'));
