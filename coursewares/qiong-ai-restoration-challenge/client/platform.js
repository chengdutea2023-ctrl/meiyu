const q = new URLSearchParams(location.search);
export const preparation = q.get('prepare') === '1';
const preparationToken = q.get('preparationToken') || '';
export const demo = q.get('demo') === '1';
const launchToken = q.get('launchToken') || '', platformApiBase = (q.get('platformApiBase') || '').replace(/\/$/, '');
const returnUrl = q.get('returnUrl') || '';
let demoId = localStorage.getItem('qiong-restoration-demo-id');
if (!demoId) { demoId = crypto.randomUUID(); localStorage.setItem('qiong-restoration-demo-id', demoId); }
let lessonVersion = null;
const headers = () => ({ 'content-type': 'application/json', ...(lessonVersion === null ? {} : { 'x-lesson-version': String(lessonVersion) }), ...(preparation ? { 'x-preparation-token': preparationToken } : demo ? { 'x-demo-id': demoId } : { Authorization: `Bearer ${launchToken}` }) });
export async function api(path, method = 'GET', value) {
  const r = await fetch(`./api/${path}`, { method, headers: headers(), body: value === undefined ? undefined : JSON.stringify(value), signal: AbortSignal.timeout(30000) });
  const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b.message || '操作未完成，请重试');
  const session = path === 'session' || path === 'preparation' ? b : path === 'reset' || path === 'reset/undo' ? b.session : null;
  if (Number.isInteger(session?.resetVersion)) lessonVersion = session.resetVersion;
  return b;
}
const images = new Map();
const displayDataUrl = blob => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('图片读取失败')); reader.readAsDataURL(blob); });
export async function media(id) {
  if (!images.has(id)) {
    const loading = (async () => {
      const path = `files/${encodeURIComponent(id)}`;
      const r = await fetch(`./api/${path}`, { headers: headers() });
      if (!r.ok) throw new Error('图片读取失败，请重新进入课件');
      const blob = await r.blob();
      // 个别内嵌浏览器会返回空的二进制响应，使用同一归属校验下的JSON传输补取。
      const url = blob.size ? await displayDataUrl(blob) : '';
      return url.length > 100 ? url : (await api(`${path}?format=data`)).dataUrl;
    })().catch(e => { images.delete(id); throw e; });
    images.set(id, loading);
  }
  return images.get(id);
}
export async function originalImage(taskId) {
  const path = `case/original?experimentId=${encodeURIComponent(taskId)}`;
  const r = await fetch(`./api/${path}`, { headers: headers() });
  if (!r.ok) throw new Error('请先完成证据审查');
  const blob = await r.blob(), url = blob.size ? await displayDataUrl(blob) : ''; return url.length > 100 ? url : (await api(`${path}&format=data`)).dataUrl;
}
async function platformPost(path, body) {
  if (!launchToken || !platformApiBase) throw new Error('请从学生后台进入课件');
  const url = new URL(platformApiBase); if (!['http:', 'https:'].includes(url.protocol)) throw new Error('平台地址无效');
  const r = await fetch(platformApiBase + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ launchToken, ...body }), signal: AbortSignal.timeout(60000) });
  const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(typeof b.message === 'string' ? b.message : '平台保存失败，请重试'); return b;
}
let initialized = false, launchRecord = null;
async function refreshRecord() { const verified = await platformPost('/course-runtime/launch/verify', {}); launchRecord = verified.record || null; return launchRecord; }
export async function initialize() { if (demo) return; await refreshRecord(); if (!initialized) { if (launchRecord?.status !== 'COMPLETED') await platformPost('/course-runtime/launch/records', { status: 'STARTED' }); initialized = true; } }
export function completionForExperiment(record, experimentId) {
  if (!record || record.status !== 'COMPLETED' || !experimentId) return null;
  const references = record.summary?.artifacts;
  if (!Array.isArray(references) || !Array.isArray(record.artifacts)) return null;
  const required = ['final-work', 'evidence-package'].map(kind => record.artifacts.find(artifact =>
    artifact && artifact.kind === kind && artifact.metadata?.experimentId === experimentId &&
    references.some(reference => reference && reference.kind === kind && reference.url === artifact.url)));
  return required.every(Boolean) ? { saved: true, recordId: record.id, artifacts: required } : null;
}
export function savedExperiment(tasks) { return tasks.find(task => !task.mocked && task.reviewed && task.review && Array.isArray(task.review.annotations) && completionForExperiment(launchRecord, task.id)) || null; }
export async function progress(text) { if (!demo && initialized) await platformPost('/course-runtime/launch/records', { status: 'PROGRESS', summary: { displayTitle: '邛窑AI修复挑战', brief: text } }).catch(() => {}); }
const saves = new Map();
export function complete(ownerId, result, files, startedAt) {
  if (demo) return Promise.resolve({ demo: true });
  const key = `qiong-uploaded:${ownerId}:${result.experimentId}`;
  if (saves.has(key)) return saves.get(key);
  const saving = saveComplete(key, { ...result }, [...files], startedAt).finally(() => { saves.delete(key); });
  saves.set(key, saving); return saving;
}
async function saveComplete(key, result, files, startedAt) {
  const record = await refreshRecord();
  const completed = completionForExperiment(record, result.experimentId);
  if (completed) return completed;
  let uploaded; try { uploaded = JSON.parse(sessionStorage.getItem(key) || '{}'); } catch { uploaded = {}; }
  const required = [];
  for (const file of files) {
    const bytes = await file.blob.arrayBuffer();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
    const fileKey = `${file.fileName}:${hash}`;
    const existing = record?.artifacts?.find(artifact => artifact.kind === file.kind && artifact.mimeType === file.mimeType &&
      artifact.originalFileName === file.fileName && artifact.metadata?.experimentId === result.experimentId && artifact.metadata?.contentSha256 === hash);
    if (existing) uploaded[fileKey] = existing;
    else if (uploaded[fileKey] && !record?.artifacts?.some(artifact => artifact.url === uploaded[fileKey].url && artifact.metadata?.experimentId === result.experimentId && artifact.kind === file.kind)) delete uploaded[fileKey];
    if (!uploaded[fileKey]) {
      const contentBase64 = (await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file.blob); })).split(',')[1];
      uploaded[fileKey] = await platformPost('/course-runtime/launch/artifacts', { fileName: file.fileName, mimeType: file.mimeType, kind: file.kind, contentBase64, metadata: { title: file.title, experimentId: result.experimentId, contentSha256: hash } });
      try { sessionStorage.setItem(key, JSON.stringify(uploaded)); } catch { /* 保存完成不依赖浏览器缓存容量。 */ }
    }
    required.push(uploaded[fileKey]);
  }
  launchRecord = await platformPost('/course-runtime/launch/records', { status: 'COMPLETED', score: null, durationSeconds: Math.max(0, Math.floor((Date.now() - startedAt) / 1000)), summary: { displayTitle: '邛窑AI修复挑战', preparation: result.preparation || null, experimentId: result.experimentId, brief: result.conclusion, scoreText: '未评分，等待教师评价', resultItems: [{ label: '对照实验', value: '三组均完成' }, { label: '修复约束', value: '3条，均绑定依据' }, { label: '核验资料', value: `${result.holdoutCount}张，未参与生成` }, { label: '审查标记', value: `${result.annotationCount}处` }], processSummary: `导入资料、提出假设、三组真实生成、证据审查与报告提交。模型：${result.model}。本次结果为教学模拟推测，不代表历史原貌。`, artifacts: required.map(a => ({ kind: a.kind, title: a.originalFileName || a.fileName || '学习作品', url: a.url, mimeType: a.mimeType })) } });
  const confirmed = completionForExperiment(launchRecord, result.experimentId);
  if (!confirmed) throw new Error('平台尚未确认本次报告与证据保存，请重试。');
  return confirmed;
}
export function returnToPortal(saved, saving) {
  if (saving) return false;
  if (!saved && !confirm('本次成果尚未提交成功。请先导出进度包；确定现在离开吗？')) return false;
  let url; try { url = new URL(returnUrl, location.href); } catch {}
  if (returnUrl && url && ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) location.assign(url.href);
  else if (history.length > 1) history.back(); else alert('请从学生后台重新进入；本地预览可以直接关闭此页。');
  return true;
}
