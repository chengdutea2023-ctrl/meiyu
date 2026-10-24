export const LABELS = ['碗', '罐', '壶'];
export const ORIGINAL = Object.freeze({ angle: 0, blur: 0, mask: false, x: .25, y: .25, w: .25, h: .3 });
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const variables = p => ['mask', 'angle', 'blur'].filter(k => k === 'mask' ? p.mask : Number(p[k]) !== 0);
export function experimentFlow(records, specimenId, model = null) {
  let baseline = null, changed = null;
  for (const record of records) {
    if (record.specimenId !== specimenId || model && record.recognition?.model !== model) continue;
    const count = variables(record.params).length;
    if (!count && !baseline) baseline = record;
    else if (count === 1 && baseline) changed = record;
  }
  return { step: changed ? 'complete' : baseline ? 'change' : 'original', records: [baseline, changed] };
}
export function drawImage(canvas, image, p) {
  const ctx = canvas.getContext('2d'); const w = canvas.width, h = canvas.height;
  ctx.fillStyle = '#f7f3ec'; ctx.fillRect(0, 0, w, h);
  const scale = Math.min(w * .84 / image.naturalWidth, h * .84 / image.naturalHeight);
  ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(p.angle * Math.PI / 180);
  ctx.filter = `blur(${p.blur * w / 512}px)`;
  ctx.drawImage(image, -image.naturalWidth * scale / 2, -image.naturalHeight * scale / 2, image.naturalWidth * scale, image.naturalHeight * scale); ctx.restore();
  if (p.mask) { ctx.fillStyle = '#bb514e'; ctx.fillRect(p.x * w, p.y * h, p.w * w, p.h * h); }
}
export function comparison(records) {
  const baselines = new Map();
  let latest = null;
  for (const record of records) {
    const key = record.specimenId + ':' + (record.recognition?.model || 'legacy');
    const count = variables(record.params).length;
    if (!count && !baselines.has(key)) baselines.set(key, record);
    else if (count === 1 && baselines.has(key)) latest = [baselines.get(key), record];
  }
  return latest;
}
export function grade(work) {
  const evidence = comparison(work.records) ? 60 : 0;
  const explanation = work.observation.trim().length >= 12 ? 20 : 0;
  const concepts = (work.answers.confidence === 'relative' ? 10 : 0) + (work.answers.boundary === 'outside' ? 10 : 0);
  return { score: clamp(evidence + explanation + concepts, 0, 100), evidence, explanation, concepts };
}
export const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function validRecord(r) {
  return r && r.params && typeof r.specimenId === 'string' && (r.recognition && typeof r.recognition.name === 'string' && ['identified','uncertain','insufficient'].includes(r.recognition.status) && Array.isArray(r.recognition.evidence) && r.recognition.evidence.every(v=>typeof v==='string') && typeof r.recognition.uncertainty==='string' || Array.isArray(r.values) && r.values.length===3 && r.values.every(Number.isFinite));
}
export function recognitionTitle(r) {
  if (r?.recognition) return r.recognition.status==='insufficient'?'无法判断':r.recognition.name;
  if (Array.isArray(r?.values)) return '旧模型：'+LABELS[r.values.indexOf(Math.max(...r.values))];
  return '尚未识别';
}
export function recognitionDetail(r) {
  if(r?.recognition) return '可见依据：'+r.recognition.evidence.join('；')+'。不确定之处：'+r.recognition.uncertainty;
  return Array.isArray(r?.values)?'旧版本地三分类分数（未经概率校准）：'+r.values.map((v,j)=>`${LABELS[j]} ${(v*100).toFixed(1)}%`).join(' / '):'尚无模型结果';
}
export function reportText(work) {
  const result = grade(work);
  return ['邛窑 -AI看见了什么 · 我的实验卡', `过程分：${result.score} / 100`, '评分：同一器物原图与单变量变化对照60分（两次识别即可）；至少12字观察20分；概念题20分。预测选填，不计分。', '', ...work.records.map((r,i) => `${i+1}. ${r.name}｜${r.phase}｜我的预测（选填）：${r.prediction||'未填写'}｜模型${recognitionTitle(r)}｜${recognitionDetail(r)}｜实际模型 ${r.recognition?.model||'旧版本地三分类器'}｜推理请求 ${r.recognition?.providerRequestId||'不适用'}｜旋转${r.params.angle}°，模糊${r.params.blur}，遮挡${r.params.mask?'开':'关'}`), '', '我的观察：'+work.observation, '概念题：AI解释 '+(work.answers.confidence==='relative'?'仍需核对可见特征':'具体就是正确（需要复习）')+'；看不清时 '+(work.answers.boundary==='outside'?'说明信息不足':'仍应硬猜（需要复习）'), '', '当前模型：火山方舟豆包视觉理解。仅发送当时处理后的图片，不发送文物名称、标准答案或历史结果。回答是模型推断，不能用于文物鉴定。旧模型记录如有百分数，其分数未经概率校准；不同模型不混作对照。', '', '照片来源（合照经单件裁切、缩放，实验另含图像处理）：', ...(work.sources||[]).map(s=>`${s.name}｜${s.author}｜${s.license}｜${s.licenseUrl}｜${s.source}`)].join('\n');
}
