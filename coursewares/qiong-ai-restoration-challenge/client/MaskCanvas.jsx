import React, { useEffect, useRef, useState } from 'react';
import { PencilLine, Eraser, Hand, Minus, Plus, ArrowCounterClockwise, ArrowsOut, X } from '@phosphor-icons/react';
import { loadImage } from './report';
import { fitMaskCanvas, clampMaskPan, maskPoint } from './mask-viewport';

export default function MaskCanvas({ value, onChange, locked }) {
  const display = useRef(), viewport = useRef(), panel = useRef(), expandButton = useRef();
  const mask = useRef(document.createElement('canvas')), source = useRef(), undo = useRef([]), pointer = useRef(null);
  const [tool, setTool] = useState('pen'), [size, setSize] = useState(28), [zoom, setZoom] = useState(1), [pan, setPan] = useState({ x: 0, y: 0 });
  const [historyCount, setHistoryCount] = useState(0), [showMask, setShowMask] = useState(true), [ready, setReady] = useState(false), [expanded, setExpanded] = useState(false), [error, setError] = useState('');
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 }), [space, setSpace] = useState({ width: 0, height: 0 });
  const fitted = fitMaskCanvas(dimensions.width, dimensions.height, space), boundedPan = clampMaskPan(pan, fitted, zoom, space);
  function paint() {
    if (!source.current || !display.current) return;
    const canvas = display.current, ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(source.current, 0, 0);
    if (!showMask) return;
    const pixels = mask.current.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    for (let p = 0; p < canvas.width * canvas.height; p++) { const on = pixels.data[p * 4] > 127; pixels.data[p * 4] = 167; pixels.data[p * 4 + 1] = 64; pixels.data[p * 4 + 2] = 42; pixels.data[p * 4 + 3] = on ? 110 : 0; }
    const overlay = document.createElement('canvas'); overlay.width = canvas.width; overlay.height = canvas.height;
    overlay.getContext('2d').putImageData(pixels, 0, 0); ctx.drawImage(overlay, 0, 0);
  }
  useEffect(() => {
    let alive = true;
    Promise.all([loadImage('./assets/case-damaged.png'), loadImage(value || './assets/case-mask.png')]).then(([image, savedMask]) => {
      if (!alive) return;
      source.current = image; display.current.width = mask.current.width = image.width; display.current.height = mask.current.height = image.height;
      const ctx = mask.current.getContext('2d'); ctx.fillStyle = 'black'; ctx.fillRect(0, 0, image.width, image.height); ctx.drawImage(savedMask, 0, 0, image.width, image.height);
      setDimensions({ width: image.width, height: image.height }); setReady(true); paint(); if (!value) onChange(mask.current.toDataURL());
    }).catch(() => { if (alive) setError('图片暂时未读出，请重新进入课件。'); });
    return () => { alive = false; };
  }, []);
  useEffect(() => { const observer = new ResizeObserver(([entry]) => setSpace({ width: entry.contentRect.width, height: entry.contentRect.height })); observer.observe(viewport.current); return () => observer.disconnect(); }, []);
  useEffect(paint, [showMask]);
  useEffect(() => {
    if (!expanded) return;
    const overflow = document.body.style.overflow, previous = document.activeElement;
    document.body.style.overflow = 'hidden'; panel.current.focus();
    const keys = event => {
      if (event.key === 'Escape') { event.preventDefault(); setExpanded(false); }
      if (event.key !== 'Tab') return;
      const controls = [...panel.current.querySelectorAll('button:not(:disabled), input:not(:disabled), canvas')], first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keys);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keys); if (previous?.isConnected) previous.focus(); else expandButton.current?.focus(); };
  }, [expanded]);
  function point(event) { return maskPoint(event.clientX, event.clientY, display.current.getBoundingClientRect(), dimensions.width, dimensions.height); }
  function remember() { undo.current.push(mask.current.toDataURL()); if (undo.current.length > 15) undo.current.shift(); setHistoryCount(undo.current.length); }
  function down(event) {
    if (!ready || (locked && tool !== 'hand') || event.button !== 0 || event.isPrimary === false) return;
    display.current.setPointerCapture(event.pointerId);
    if (tool === 'hand') { pointer.current = { x: event.clientX, y: event.clientY, pan: boundedPan }; return; }
    remember(); pointer.current = point(event); draw(event);
  }
  function draw(event) {
    if (!pointer.current || (locked && tool !== 'hand')) return;
    if (tool === 'hand') { setPan(clampMaskPan({ x: pointer.current.pan.x + event.clientX - pointer.current.x, y: pointer.current.pan.y + event.clientY - pointer.current.y }, fitted, zoom, space)); return; }
    const p = point(event), ctx = mask.current.getContext('2d'); ctx.strokeStyle = tool === 'eraser' ? 'black' : 'white'; ctx.lineWidth = size; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(pointer.current.x, pointer.current.y); ctx.lineTo(p.x + .01, p.y + .01); ctx.stroke(); pointer.current = p; paint();
  }
  function up() { if (pointer.current && tool !== 'hand') onChange(mask.current.toDataURL()); pointer.current = null; }
  async function undoOne() { const previous = undo.current.pop(); setHistoryCount(undo.current.length); if (previous) { mask.current.getContext('2d').drawImage(await loadImage(previous), 0, 0); paint(); onChange(previous); } }
  function toggleExpanded() {
    if (!expanded) { const nextZoom = Math.max(1.5, zoom); setZoom(nextZoom); setPan(clampMaskPan({ x: 0, y: fitted.height * nextZoom / 2 }, fitted, nextZoom, space)); }
    setExpanded(v => !v);
  }
  function fit() { setZoom(1); setPan({ x: 0, y: 0 }); }
  async function reset() { remember(); mask.current.getContext('2d').drawImage(await loadImage('./assets/case-mask.png'), 0, 0); paint(); onChange(mask.current.toDataURL()); fit(); }
  return <div className={`specimen mask-editor${expanded ? ' mask-editor-expanded' : ''}`} data-mask-editor ref={panel} tabIndex={expanded ? -1 : undefined} role={expanded ? 'dialog' : undefined} aria-modal={expanded || undefined} aria-label={expanded ? '放大修复操作' : undefined}>
    <div className="mask-editor-heading"><div><strong>修复画布</strong><span>{locked ? '本轮区域已冻结，可放大查看' : '红色是修复范围，画笔添加，橡皮擦除'}</span></div><button ref={expandButton} className="mask-expand" onClick={toggleExpanded}>{expanded ? <X/> : <ArrowsOut/>}{expanded ? '完成放大操作' : '放大操作'}</button></div>
    <div className="mask-toolbar"><div className="mask-tool-group" role="group" aria-label="修复工具">
      <button aria-pressed={tool === 'pen'} disabled={locked || !ready} onClick={() => setTool('pen')}><PencilLine/>画笔</button>
      <button aria-pressed={tool === 'eraser'} disabled={locked || !ready} onClick={() => setTool('eraser')}><Eraser/>橡皮</button>
      <button aria-pressed={tool === 'hand'} onClick={() => setTool('hand')}><Hand/>移动</button>
      <button disabled={locked || !ready || historyCount === 0} onClick={undoOne}><ArrowCounterClockwise/>撤销</button>
    </div><div className="mask-zoom-group" role="group" aria-label="画布显示比例">
      <button aria-label="缩小修复画布" disabled={zoom <= 1} onClick={() => setZoom(v => Math.max(1, v - .5))}><Minus/></button><span>{Math.round(zoom * 100)}%</span>
      <button aria-label="放大修复画布" disabled={zoom >= 4} onClick={() => setZoom(v => Math.min(4, v + .5))}><Plus/></button><button onClick={fit}>适合画面</button>
    </div></div>
    <div className="photo-frame"><div className="canvas-viewport" ref={viewport}>
      <canvas tabIndex={0} aria-label="残损图与修复遮罩；使用上方画笔或橡皮标注" ref={display} style={{ width: fitted.width, height: fitted.height, transform: `translate(${boundedPan.x}px, ${boundedPan.y}px) scale(${zoom})`, cursor: tool === 'hand' ? 'grab' : 'crosshair' }} onPointerDown={down} onPointerMove={draw} onPointerUp={up} onPointerCancel={up}/>
      {!ready && <span className="mask-image-loading" role="status">{error || '正在读取修复图片…'}</span>}
    </div><span className="photo-caption">口沿缺失 · 教学模拟</span></div>
    <div className="mask-options"><label>笔宽 <input aria-label="画笔宽度" type="range" min="8" max="90" value={size} disabled={locked || !ready} onChange={e => setSize(+e.target.value)}/><output>{size}</output></label><label><input type="checkbox" checked={showMask} onChange={e => setShowMask(e.target.checked)}/>显示红色范围</label><button disabled={locked || !ready} onClick={reset}>恢复初始区域</button><button disabled={!ready} onClick={() => document.dispatchEvent(new CustomEvent('qiong-view-image', { detail: { image: display.current } }))}>查看大图</button></div>
    {expanded && <p className="mask-editor-hint">点“适合画面”可看全图；放大后选择“移动”拖动画面。完成后点右上角返回，画过的区域会保留。</p>}
  </div>;
}
