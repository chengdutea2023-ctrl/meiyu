import { media } from './platform';
export const loadImage = src => new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('报告图片加载失败')); image.src = src; });
export async function reportPng({ task, annotations, conclusion }) {
  await document.fonts.ready;
  const c = document.createElement('canvas'); c.width = 1600; c.height = 2400 + Math.ceil(annotations.slice(0, 6).reduce((sum, a) => sum + a.reason.length, 0) / 55) * 42 + Math.ceil(conclusion.length / 50) * 44; const ctx = c.getContext('2d'); ctx.fillStyle = '#faf6ed'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#282723'; ctx.font = 'bold 55px WenKai, sans-serif'; ctx.fillText('邛窑AI修复挑战 · 实验报告', 80, 100);
  ctx.font = '26px WenKai, sans-serif'; ctx.fillText(task.mocked ? '模拟服务测试，非真实AI结果。成绩未评分，等待教师评价。' : '教学模拟修复候选，不能当作历史原貌。成绩未评分，等待教师评价。', 80, 150);
  function text(value, x, y, width, size = 27) { ctx.font = `${size}px WenKai, sans-serif`; const lines = []; let line = ''; for (const ch of String(value)) { if (ctx.measureText(line + ch).width > width || ch === '\n') { lines.push(line); line = ch === '\n' ? '' : ch; } else line += ch; } lines.push(line); for (const item of lines) { ctx.fillText(item, x, y); y += size * 1.55; } return y; }
  let y = text(`生成前的预测：${task.snapshot.prediction}`, 80, 220, 1430);
  y = text('三条修复约束与依据', 80, y + 30, 1400, 34);
  for (let i = 0; i < 3; i++) { const item = task.snapshot.constraints[i], evidence = task.snapshot.evidence.find(a => a.id === item.evidenceId); y = text(`${i + 1}. ${item.text}（依据：${evidence?.title || '参考资料'}）`, 80, y + 8, 1400); }
  y += 35;
  const labels = { none: '无额外参考图', mismatch: '干扰参考图', evidence: '我的参考图' };
  for (let i = 0; i < 3; i++) { const result = task.results[i], image = await loadImage(await media(result.fileId)); ctx.drawImage(image, 80 + i * 490, y, 460, 449); for (const [n, a] of annotations.filter(a => a.condition === result.key).entries()) { const px = 80 + i * 490 + a.x * 460, py = y + a.y * 449; ctx.fillStyle = '#a64a33'; ctx.beginPath(); ctx.arc(px, py, 14, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fffaf0'; ctx.font = 'bold 17px sans-serif'; ctx.fillText(String(n + 1), px - 5, py + 6); } ctx.fillStyle = '#282723'; text(labels[result.key], 80 + i * 490, y + 490, 460, 30); }
  y += 550; y = text('保留证据审查（前6条，完整记录见证据包）', 80, y, 1400, 34);
  const kinds = { support: '有依据', conflict: '与依据冲突', uncertain: '证据不足' };
  for (const a of annotations.slice(0, 6)) { const evidence = task.snapshot.evidence.find(e => e.id === a.evidenceId); y = text(`${labels[a.condition]} · ${kinds[a.kind]}：${a.reason}（核验：${evidence?.title || '保留资料'}）`, 80, y + 8, 1420, 25); }
  y = text('实验结论', 80, Math.max(y + 35, 1650), 1400, 34); text(conclusion, 80, y + 10, 1420, 28);
  ctx.fillStyle = '#665e53'; text(`模型：${task.model} ｜ 对照条件已冻结 ｜ 保留核验资料 ${task.snapshot.holdoutIds.length} 张\n摄影资料的作者、来源、许可与修改说明见随附证据包。`, 80, c.height - 120, 1430, 23);
  return new Promise(resolve => c.toBlob(resolve, 'image/png'));
}
