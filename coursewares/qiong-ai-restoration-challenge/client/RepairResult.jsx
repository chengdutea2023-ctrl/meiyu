import React, { useEffect, useRef, useState } from 'react';
import { media } from './platform';
import { loadImage } from './report';
import { repairFocus, comparisonViewport, originalPoint, viewportPoint, repairOverlay } from './repair-view';

export function useRepairRegion(task) {
  const [region, setRegion] = useState(null);
  useEffect(() => {
    let active = true; setRegion(null);
    if (!task) return;
    (async () => {
      const { width, height } = task.snapshot, encoded = task.maskDataUrl?.split(',')[1];
      if (!encoded || !width || !height) throw new Error('修复范围暂未读出');
      const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
      let mask = bytes;
      // Older sessions expose a raw one-channel mask under the data-URL field.
      if (bytes.length !== width * height) {
        const image = await loadImage(task.maskDataUrl), source = document.createElement('canvas');
        source.width = width; source.height = height;
        const context = source.getContext('2d'); context.drawImage(image, 0, 0, width, height);
        const rgba = context.getImageData(0, 0, width, height).data;
        mask = Uint8Array.from({ length: width * height }, (_, p) => rgba[p * 4] > 127 && rgba[p * 4 + 3] > 127 ? 255 : 0);
      }
      const focus = repairFocus(mask, width, height), overlay = document.createElement('canvas');
      overlay.width = width; overlay.height = height;
      const ctx = overlay.getContext('2d'), pixels = ctx.createImageData(width, height);
      pixels.data.set(repairOverlay(mask, width, height, task.workflowVersion !== 2));
      ctx.putImageData(pixels, 0, 0);
      if (active) setRegion({ width, height, focus, overlay });
    })().catch(() => { if (active) setRegion({ error: '修复范围暂未读出，当前显示完整图片，请重新进入后重试。' }); });
    return () => { active = false; };
  }, [task?.id, task?.maskDataUrl, task?.workflowVersion]);
  return region;
}

export default function RepairResult({ result, region, view, zoom, highlighted, review, onMark, annotations }) {
  const canvas = useRef(), [image, setImage] = useState(null), [error, setError] = useState('');
  const width = region?.width || image?.width || 1024, height = region?.height || image?.height || 998;
  const rect = region?.focus ? comparisonViewport(region.focus, width, height, view, zoom) : { x: 0, y: 0, width, height };
  useEffect(() => {
    let active = true; setImage(null); setError('');
    if (result.fileId) media(result.fileId).then(loadImage).then(next => { if (active) setImage(next); }).catch(() => { if (active) setError('图片未读出，请重新进入课件'); });
    return () => { active = false; };
  }, [result.fileId]);
  useEffect(() => {
    if (!canvas.current || !image) return;
    const ctx = canvas.current.getContext('2d'), size = 1000;
    canvas.current.width = size; canvas.current.height = Math.round(size * rect.height / rect.width);
    ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, size, canvas.current.height);
    if (highlighted && region?.overlay) ctx.drawImage(region.overlay, rect.x, rect.y, rect.width, rect.height, 0, 0, size, canvas.current.height);
  }, [image, region, view, zoom, highlighted]);
  function inspect(event) {
    if (!image) return;
    if (review) {
      const bounds = event.currentTarget.getBoundingClientRect();
      const x = event.detail === 0 ? .5 : (event.clientX - bounds.left) / bounds.width;
      const y = event.detail === 0 ? .5 : (event.clientY - bounds.top) / bounds.height;
      onMark(originalPoint(rect, width, height, x, y));
    } else document.dispatchEvent(new CustomEvent('qiong-view-image', { detail: { image: canvas.current } }));
  }
  return <button className="result-image repair-result-image" aria-label={review ? `为${result.title}添加审查标记` : `查看${result.title}修复大图`} disabled={!image} onClick={inspect} style={{ aspectRatio: `${rect.width}/${rect.height}` }}>
    <canvas ref={canvas} role="img" aria-label={`${result.title} · ${view === 'detail' && region?.focus ? '修复局部' : '完整图片'}${highlighted && region?.overlay ? ' · 红色修复范围' : ''}`}/>
    {!image && <span className="repair-loading">{error || '读取图片…'}</span>}
    {image && highlighted && region?.overlay && <span className="repair-region-tag" aria-hidden="true">红色：修复范围</span>}
    {annotations.map((mark, index) => {
      const p = viewportPoint(rect, width, height, mark);
      return p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1 && <span key={index} className={`annotation-dot ${mark.kind}`} style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}>{index + 1}</span>;
    })}
  </button>;
}
