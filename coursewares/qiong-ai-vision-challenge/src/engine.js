export const LABELS = ['碗', '罐', '壶'];
export const ORIGINAL = Object.freeze({ angle: 0, blur: 0, mask: false, x: .25, y: .25, w: .25, h: .3 });
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const variables = p => ['mask', 'angle', 'blur'].filter(k => k === 'mask' ? p.mask : Number(p[k]) !== 0);
export function experimentFlow(records, specimenId) {
  let baseline = null, changed = null;
  for (const record of records) {
    if (record.specimenId !== specimenId) continue;
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
    const count = variables(record.params).length;
    if (!count && !baselines.has(record.specimenId)) baselines.set(record.specimenId, record);
    else if (count === 1 && baselines.has(record.specimenId)) latest = [baselines.get(record.specimenId), record];
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
export function reportText(work) {
  const result = grade(work);
  return ['邛窑AI眼力挑战 · 我的实验卡', `过程分：${result.score} / 100`, '评分：同一器物原图与单变量变化对照60分（两次识别即可）；至少12字观察20分；概念题20分。预测选填，不计分。', '', ...work.records.map((r,i) => `${i+1}. ${r.name}｜${r.phase}｜我的预测（选填）：${r.prediction||'未填写'}｜模型${r.values.map((v,j)=>`${LABELS[j]} ${(v*100).toFixed(1)}%`).join('，')}｜旋转${r.params.angle}°，模糊${r.params.blur}，遮挡${r.params.mask?'开':'关'}`), '', '我的观察：'+work.observation, '概念题：高分代表 '+(work.answers.confidence==='relative'?'三类中的相对倾向':'一定正确')+'；遇到省油灯 '+(work.answers.boundary==='outside'?'可能超出类别范围':'最高类别就是文物定名'), '', '模型为有限样本的课堂三分类器，分数未经概率校准，不能用于文物鉴定。', '', '照片来源（合照经单件裁切、缩放，实验另含图像处理）：', ...(work.sources||[]).map(s=>`${s.name}｜${s.author}｜${s.license}｜${s.licenseUrl}｜${s.source}`)].join('\n');
}
