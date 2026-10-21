import { createHash } from 'node:crypto';
import sharp from 'sharp';
export const CONDITIONS = [{ key: 'none', title: '无额外参考图' }, { key: 'mismatch', title: '干扰参考图' }, { key: 'evidence', title: '我的参考图' }];
export class LessonError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
export function requireValue(ok, message, code = 'INVALID_INPUT', status = 400) { if (!ok) throw new LessonError(status, code, message); }
export const digest = value => createHash('sha256').update(value).digest('hex');
export const cleanText = (value, max = 800) => String(value ?? '').trim().slice(0, max);
export function imageBuffer(value, max = 10 * 1024 * 1024) {
  requireValue(typeof value === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/.test(value), '请选择 PNG、JPEG 或 WebP 图片');
  const buffer = Buffer.from(value.split(',')[1], 'base64');
  requireValue(buffer.length > 30 && buffer.length <= max, '图片过大或内容无效，请压缩后重试');
  return buffer;
}
export async function normalizeImage(buffer, width = 1200) {
  const metadata = await sharp(buffer, { limitInputPixels: 36e6 }).metadata().catch(() => null);
  requireValue(metadata?.width >= 32 && metadata?.height >= 32, '图片无法读取，请重新导出为 PNG 或 JPEG');
  return sharp(buffer, { limitInputPixels: 36e6 }).rotate().resize({ width, height: width, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
}
export async function normalizedMask(buffer, width, height) {
  const metadata = await sharp(buffer).metadata();
  requireValue(metadata.width === width && metadata.height === height, '遮罩尺寸与目标图不一致');
  const { data } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const result = Buffer.alloc(width * height), points = [];
  let minX = width, minY = height, maxX = 0, maxY = 0;
  for (let p = 0; p < width * height; p++) {
    const on = data[p * 4] > 127 && data[p * 4 + 3] > 127;
    if (on) { result[p] = 255; const x = p % width, y = Math.floor(p / width); minX = Math.min(x, minX); maxX = Math.max(x, maxX); minY = Math.min(y, minY); maxY = Math.max(y, maxY); points.push(p); }
  }
  requireValue(points.length >= 40 && points.length < width * height * 0.5, '请标出适量的修复区域，范围应小于图片的一半');
  return { data: result, bounds: [minX, minY, maxX, maxY], width, height, pixels: points.length };
}
export async function compositeMasked(original, generated, maskData) {
  const { width, height } = await sharp(original).metadata();
  const base = await sharp(original).ensureAlpha().raw().toBuffer();
  const next = await sharp(generated).resize(width, height, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
  const result = Buffer.from(base);
  for (let p = 0; p < width * height; p++) if (maskData[p] === 255) next.copy(result, p * 4, p * 4, p * 4 + 4);
  return sharp(result, { raw: { width, height, channels: 4 } }).png().toBuffer();
}
export function experimentPrompt(constraints, bounds, width = 1000, height = 1000) {
  const coordinates = bounds.map((value, i) => Math.max(0, Math.min(999, Math.round(value / (i % 2 ? height : width) * 1000))));
  return `你正在进行教学模拟数字修复，而不是鉴定文物。图1是待修复的邛窑日用瓷罐照片，缺失是人工制作的教学模拟。仅补全图1 <bbox>${coordinates.join(' ')}</bbox> 内的口沿缺失（坐标为0—999归一化坐标），保持原视角、器型、背景、位置和尺寸，不改变已有部位。约束：${constraints.map(c => c.text).join('；')}。如果还提供了其他图片，仅将其作为形制、釉色和纹理的参考依据，不把参考器物替换进图1。请输出与图1相同构图的一张修复候选照片。不要添加文字、标签、支架或新装饰。结果属于推测性候选，不代表历史原貌。`;
}
export function validateEvidence(assets, referenceIds, holdoutIds, constraints) {
  requireValue(Array.isArray(referenceIds) && referenceIds.length >= 1 && referenceIds.length <= 3, '请选择1—3张生成参考图');
  requireValue(new Set(referenceIds).size === referenceIds.length, '生成参考图不能重复');
  requireValue(Array.isArray(holdoutIds) && holdoutIds.length >= 2 && holdoutIds.length <= 3 && new Set(holdoutIds).size === holdoutIds.length, '请保留2—3张核验资料');
  requireValue(!referenceIds.some(id => holdoutIds.includes(id)), '核验资料不能同时作为生成参考');
  for (const id of referenceIds) { const a = assets.find(a => a.id === id); requireValue(a?.role === 'reference' && a.source && a.feature && a.claim && a.reason, '请补全参考资料的来源、特征、判断和筛选理由'); }
  for (const id of holdoutIds) { const a = assets.find(a => a.id === id); requireValue(a?.role === 'holdout' && !a.usedInGeneration && a.source && a.feature && a.claim && a.reason, '核验资料必须补全来源、特征、判断与筛选理由，且从未参与生成'); }
  requireValue(Array.isArray(constraints) && constraints.length === 3 && constraints.every(c => cleanText(c.text).length >= 4 && referenceIds.includes(c.evidenceId)), '请填写三条修复约束，并分别绑定生成参考依据');
}
export function validateReview(annotations, conclusion, task) {
  requireValue(task.results.every(r => r.state === 'succeeded'), '请先完成全部三组实验');
  requireValue(Array.isArray(annotations) && annotations.length <= 40, '审查标记无效');
  requireValue(annotations.every(a => a && CONDITIONS.some(c => c.key === a.condition) && ['support', 'conflict', 'uncertain'].includes(a.kind) && cleanText(a.reason).length >= 4 && task.snapshot.holdoutIds.includes(a.evidenceId) && Number.isFinite(a.x) && a.x >= 0 && a.x <= 1 && Number.isFinite(a.y) && a.y >= 0 && a.y <= 1), '每组审查标记都需要有效位置、判断、理由和核验依据');
  for (const condition of CONDITIONS) requireValue(annotations.some(a => a.condition === condition.key && ['support', 'conflict', 'uncertain'].includes(a.kind) && cleanText(a.reason).length >= 4 && task.snapshot.holdoutIds.includes(a.evidenceId) && Number.isFinite(a.x) && a.x >= 0 && a.x <= 1 && Number.isFinite(a.y) && a.y >= 0 && a.y <= 1), '请为每组结果至少添加一条有位置、理由和核验依据的审查标记');
  requireValue(cleanText(conclusion).length >= 12, '请用至少12个字说明实验结论，也可以说明为什么仍无法确定');
}
