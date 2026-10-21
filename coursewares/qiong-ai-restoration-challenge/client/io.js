import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
export function csvRows(text) {
  const rows = []; let row = [], field = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) { const c = text[i]; if (c === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; } else if (c === ',' && !quoted) { row.push(field); field = ''; } else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); if (row.some(Boolean)) rows.push(row); row = []; field = ''; } else field += c; }
  if (quoted) throw new Error('资料表中存在未闭合的引号');
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}
export const headers = ['文件名', '标题', '来源', '相关特征', '支持的判断', '筛选理由', '用途'];
export function csvString(rows) { return '\uFEFF' + rows.map(row => row.map(v => { let s = String(v ?? ''); if (/^[=+@-]/.test(s)) s = "'" + s; return '"' + s.replaceAll('"', '""') + '"'; }).join(',')).join('\r\n'); }
export function download(name, data, type = 'application/octet-stream') { const blob = data instanceof Blob ? data : new Blob([data], { type }); const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
export function packZip(files) { return zipSync(files, { level: 4 }); }
export const jsonBytes = value => strToU8(JSON.stringify(value, null, 2));
export function unpackZip(buffer) {
  if (buffer.byteLength > 35 * 1024 * 1024) throw new Error('证据包请控制在35MB以内');
  let total = 0, count = 0;
  const files = unzipSync(new Uint8Array(buffer), { filter: file => { count++; total += file.originalSize; if (count > 80 || total > 100 * 1024 * 1024 || file.originalSize > 12 * 1024 * 1024 || /(^|\/)\.\.(\/|$)/.test(file.name)) throw new Error('证据包包含过多或过大的文件，请重新整理'); return !file.name.endsWith('/'); } });
  return Object.fromEntries(Object.entries(files).filter(([name]) => !name.startsWith('__MACOSX/') && !name.endsWith('.DS_Store')));
}
export function validateProgress(value) {
  const invalid = () => { throw new Error('进度包格式无效，请使用本课件导出的进度包'); };
  if (!value || value.version !== 1 || !Number.isInteger(value.step) || value.step < 0 || value.step > 4 || !Array.isArray(value.constraints) || value.constraints.length !== 3 || !Array.isArray(value.annotations) || value.annotations.length > 40) invalid();
  const text = (v, max) => typeof v === 'string' && v.length <= max;
  if (!value.constraints.every(c => c && text(c.text, 300) && text(c.evidenceId, 80)) || !text(value.prediction, 800) || !text(value.conclusion, 800) || !text(value.maskDataUrl, 2e6) || (value.maskDataUrl && !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value.maskDataUrl)) || (value.taskId != null && !text(value.taskId, 80))) invalid();
  if (!value.annotations.every(a => a && ['none', 'mismatch', 'evidence'].includes(a.condition) && ['support', 'conflict', 'uncertain'].includes(a.kind) && text(a.evidenceId, 80) && text(a.reason, 800) && Number.isFinite(a.x) && a.x >= 0 && a.x <= 1 && Number.isFinite(a.y) && a.y >= 0 && a.y <= 1)) invalid();
  return { version: 1, step: value.step, constraints: value.constraints.map(c => ({ text: c.text, evidenceId: c.evidenceId })), prediction: value.prediction, conclusion: value.conclusion, maskDataUrl: value.maskDataUrl, taskId: value.taskId || null, annotations: value.annotations.map(a => ({ condition: a.condition, kind: a.kind, evidenceId: a.evidenceId, reason: a.reason, x: a.x, y: a.y })) };
}
export function readPack(files) {
  const tableName = Object.keys(files).find(name => name.toLowerCase().endsWith('.csv'));
  const rows = tableName ? csvRows(strFromU8(files[tableName])) : [];
  const fields = rows.shift() || headers;
  const metadata = new Map(rows.map(row => { const v = Object.fromEntries(fields.map((key, i) => [key.trim(), row[i] || ''])); return [v['文件名'], v]; }));
  const images = Object.entries(files).filter(([name]) => /\.(jpe?g|png|webp)$/i.test(name) && !name.startsWith('results/') && !/mask\.png$/.test(name));
  if (!images.length) throw new Error('证据包里没有PNG、JPEG或WebP图片');
  if (images.length > 25) throw new Error('每份证据包最多25张图片');
  return { images: images.map(([name, bytes]) => ({ name, bytes, metadata: metadata.get(name) || metadata.get(name.split('/').at(-1)) || {} })), progress: files['progress.json'] ? validateProgress(JSON.parse(strFromU8(files['progress.json']))) : null };
}
export function fileDataUrl(blob) { return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error('文件读取失败')); r.readAsDataURL(blob); }); }
export async function boundedImage(blob) {
  if (blob.size > 12 * 1024 * 1024) throw new Error('单张图片请控制在12MB以内');
  const img = await createImageBitmap(blob).catch(() => { throw new Error('图片无法读取，请转换为PNG、JPEG或WebP'); });
  if (img.width * img.height > 36e6) { img.close(); throw new Error('图片像素过大，请先缩小再导入'); }
  const ratio = Math.min(1, 1200 / Math.max(img.width, img.height)); const canvas = document.createElement('canvas'); canvas.width = Math.round(img.width * ratio); canvas.height = Math.round(img.height * ratio); canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height); img.close(); return canvas.toDataURL('image/png');
}
export function roleValue(value) { return ({ '生成参考': 'reference', '核验保留': 'holdout', '排除': 'excluded', reference: 'reference', holdout: 'holdout', excluded: 'excluded' })[value] || 'reference'; }

export function restoreProgress(progress, mapping, tasks) {
  const task = tasks.find(t => t.id === progress.taskId), remap = id => task?.snapshot.evidence.some(a => a.id === id) ? id : mapping[id] || id;
  return { ...progress, pendingRequestId: null, taskId: task?.id || null, step: task ? Math.min(progress.step, task.reviewed ? 4 : 2) : Math.min(progress.step, 1), constraints: task ? task.snapshot.constraints : progress.constraints.map(c => ({ ...c, evidenceId: remap(c.evidenceId) })), prediction: task ? task.snapshot.prediction : progress.prediction, annotations: progress.annotations.map(a => ({ ...a, evidenceId: remap(a.evidenceId) })) };
}
