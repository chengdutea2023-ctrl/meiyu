import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// A separate preview leaves the original image and canvas coordinates unchanged.
export default function ImageInspector() {
  const [hover, setHover] = useState(null), [selected, setSelected] = useState(null), [viewer, setViewer] = useState(null), [zoom, setZoom] = useState(1);
  const closeButton = useRef(null), origin = useRef(null);
  useEffect(() => {
    const picture = target => {
      if (!(target instanceof Element) || target.closest('[data-image-inspector], .repair-result-image, [data-mask-editor]')) return null;
      const image = target.closest('img, canvas') || (target.closest('button') === target ? target.querySelector('img') : null);
      if (!image || !image.closest('main, .modal') || image.closest('.sealed-envelope')) return null;
      if (image.tagName === 'IMG' && (!image.complete || !image.naturalWidth)) return null;
      return image;
    };
    const snapshot = image => {
      try { return { src: image.tagName === 'CANVAS' ? image.toDataURL('image/png') : image.currentSrc || image.src, title: image.alt || '器物与修复区域', canvas: image.tagName === 'CANVAS' }; }
      catch { return null; }
    };
    const preview = event => {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      if (event.buttons) { setHover(null); return; }
      const image = picture(event.target);
      if (!image) return;
      const content = snapshot(image); if (!content) return;
      origin.current = image;
      setHover(content);
    };
    const leave = event => { if (picture(event.target) && !event.target.contains(event.relatedTarget)) setHover(null); };
    const down = event => { setHover(null); if (!event.target.closest('[data-image-inspector]')) setSelected(null); };
    const touch = event => {
      if (event.pointerType !== 'touch') return;
      const image = picture(event.target), content = image && snapshot(image);
      if (content) { origin.current = image; setSelected(content); }
    };
    const enlarge = event => {
      const image = picture(event.target), content = image && snapshot(image);
      if (!content) return;
      if (event.type === 'dblclick' && image.tagName === 'CANVAS') return;
      event.preventDefault(); event.stopPropagation(); origin.current = image;
      setHover(null); setViewer(content); setZoom(1);
    };
    const request = event => { const content = event.detail?.image && snapshot(event.detail.image); if (content) { setHover(null); setViewer(content); setZoom(1); } };
    const keys = event => {
      if (event.key === 'Escape') { setHover(null); setSelected(null); setViewer(null); }
      if (event.key === 'Enter' && event.altKey) enlarge(event);
    };
    const scroll = () => setHover(null);
    document.addEventListener('pointerover', preview);
    document.addEventListener('focusin', preview);
    document.addEventListener('pointerout', leave);
    document.addEventListener('focusout', leave);
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointerup', touch, true);
    document.addEventListener('dblclick', enlarge, true);
    document.addEventListener('keydown', keys);
    document.addEventListener('qiong-view-image', request);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', scroll);
    return () => {
      document.removeEventListener('pointerover', preview); document.removeEventListener('focusin', preview);
      document.removeEventListener('pointerout', leave); document.removeEventListener('focusout', leave);
      document.removeEventListener('pointerdown', down, true); document.removeEventListener('pointerup', touch, true);
      document.removeEventListener('dblclick', enlarge, true); document.removeEventListener('keydown', keys);
      document.removeEventListener('qiong-view-image', request);
      window.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', scroll);
    };
  }, []);
  useEffect(() => {
    if (!viewer) return;
    const previous = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; closeButton.current?.focus();
    const trap = event => {
      if (event.key !== 'Tab') return;
      const controls = [...document.querySelectorAll('.image-viewer button')], first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', trap); if (previous?.isConnected) previous.focus(); };
  }, [viewer]);
  return createPortal(<div data-image-inspector>
    {hover && !viewer && <aside className="photo-hover-preview" role="tooltip" aria-label="图片放大预览"><img src={hover.src} alt={`${hover.title} · 放大预览`}/><p>{hover.title}<small>{hover.canvas ? '移开收起 · 点击“查看大图”固定查看' : '移开收起 · 双击固定大图'} · Alt＋Enter 键盘查看</small></p></aside>}
    {selected && !viewer && <button className="touch-image-enlarge" onClick={() => { setViewer(selected); setZoom(1); setSelected(null); }}>查看这张图片的大图</button>}
    {viewer && <div className="image-viewer-shade" onClick={e => { if (e.target === e.currentTarget) setViewer(null); }}><section className="image-viewer" role="dialog" aria-modal="true" aria-label="查看图片大图"><header><strong>{viewer.title}</strong><div><button aria-label="大图缩小" disabled={zoom <= 1} onClick={() => setZoom(v => Math.max(1, v - .5))}>−</button><span>{Math.round(zoom * 100)}%</span><button aria-label="大图放大" disabled={zoom >= 3} onClick={() => setZoom(v => Math.min(3, v + .5))}>＋</button><button ref={closeButton} onClick={() => setViewer(null)}>关闭大图</button></div></header><div className="image-viewer-stage"><div style={{ width: `${zoom * 100}%` }}><img src={viewer.src} alt={viewer.title}/></div></div></section></div>}
  </div>, document.body);
}
