import { loadImage } from './report';
import { media } from './platform';
import { proposalCase, caseImage } from '../shared/restoration-cases.mjs';

export async function proposalReportPng(proposal) {
  await document.fonts.ready;
  const s = proposal.snapshot, result = proposal.results.find(r => r.state === 'succeeded');
  const images = await Promise.all([loadImage(caseImage(proposalCase(proposal))), loadImage(proposal.maskDataUrl), ...s.evidence.map(async a => loadImage(await media(a.id))), ...(result ? [loadImage(await media(result.fileId))] : [])]);
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d'); canvas.width = 1600;
  function lines(text, width, size) { ctx.font = `${size}px WenKai, sans-serif`; let line = ''; const rows = []; for (const ch of String(text)) { if (ch === '\n' || ctx.measureText(line + ch).width > width) { rows.push(line); line = ch === '\n' ? '' : ch; } else line += ch; } rows.push(line); return rows; }
  const planRows = lines(s.proposalText, 1440, 32), clueRows = s.evidence.map(a => lines(a.feature, 1120, 28));
  const imageWidth = 1030, imageHeight = imageWidth * s.height / s.width, previewWidth = 360, previewHeight = previewWidth * s.height / s.width, resultHeight = result ? imageHeight + 100 : 130;
  canvas.height = Math.ceil(430 + planRows.length * 48 + resultHeight + previewHeight + 110 + clueRows.reduce((sum, row) => sum + Math.max(230, row.length * 42 + 90), 0) + 180);
  ctx.fillStyle = '#faf5e9'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#302b23';
  function text(text, x, y, width = 1440, size = 28) { ctx.font = `${size}px WenKai, sans-serif`; for (const row of lines(text, width, size)) { ctx.fillText(row, x, y); y += size * 1.5; } return y; }
  text(result ? '我的修复成果 · 邛窑AI修复挑战' : '我的复原方案 · 未生成AI图', 80, 105, 1440, 52);
  text(`${proposalCase(proposal).name} · 复原设想，不代表历史原貌。`, 80, 165, 1440, 27);
  let y = text('我想这样复原', 80, 245, 1440, 35); y = text(s.proposalText, 80, y + 15, 1440, 32) + 35;
  if (result) {
    ctx.drawImage(images.at(-1), 285, y, imageWidth, imageHeight);
    text(proposal.mocked ? '模拟服务测试图，非真实AI修复结果' : `AI修复效果 · ${proposalCase(proposal).shortName}`, 285, y + imageHeight + 45, imageWidth, 27);
  } else {
    text('这份作品还没有AI修复图。下面的红色图只标计划位置，不是修复结果。', 80, y + 30, 1440, 30);
  }
  y += resultHeight;
  const x = 80;
  ctx.drawImage(images[0], x, y, previewWidth, previewHeight);
  const overlay = document.createElement('canvas'); overlay.width = s.width; overlay.height = s.height;
  const oc = overlay.getContext('2d'); oc.drawImage(images[1], 0, 0); const pixels = oc.getImageData(0, 0, s.width, s.height);
  for (let p = 0; p < s.width * s.height; p++) { const on = pixels.data[p * 4] > 127; pixels.data[p * 4] = 180; pixels.data[p * 4 + 1] = 48; pixels.data[p * 4 + 2] = 32; pixels.data[p * 4 + 3] = on ? 100 : 0; }
  oc.putImageData(pixels, 0, 0); ctx.drawImage(overlay, x, y, previewWidth, previewHeight);
  text('修复前与计划位置', 480, y + 50, 1040, 30);
  text('红色只标计划修复的位置，不是AI修复结果。', 480, y + 110, 1040, 27);
  y += previewHeight + 110; y = text('我用到的线索', 80, y, 1440, 35) + 20;
  for (let i = 0; i < s.evidence.length; i++) {
    const a = s.evidence[i], image = images[i + 2], ratio = Math.min(220 / image.width, 195 / image.height);
    ctx.drawImage(image, 80, y, image.width * ratio, image.height * ratio);
    text(a.label, 340, y + 30, 1120, 31); text(a.feature, 340, y + 85, 1120, 28);
    y += Math.max(230, clueRows[i].length * 42 + 90);
  }
  text(`线索来源与图片说明见资料包。\n成绩：未评分，等待教师评价。${result ? '' : '尚未生成AI效果，此卡为草稿。'}`, 80, canvas.height - 105, 1440, 25);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('成果卡生成失败，请重试')), 'image/png'));
}
