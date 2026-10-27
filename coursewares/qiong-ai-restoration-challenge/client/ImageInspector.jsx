import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// A separate preview leaves the original image and canvas coordinates unchanged.
export default function ImageInspector() {
  const [viewer, setViewer] = useState(null), [zoom, setZoom] = useState(1);
  const closeButton = useRef(null);
  useEffect(() => {
    const picture = target => {
      if (!(target instanceof Element) || target.closest('[data-image-inspector], [data-restoration-showcase], .repair-result-image, [data-mask-editor], [data-case-selection]')) return null;
      const image = target.closest('img, canvas') || target.closest('[data-image-zoom]')?.querySelector('img, canvas');
      if (!image || !image.closest('main, .modal') || image.closest('.sealed-envelope')) return null;
      if (image.tagName === 'IMG' && (!image.complete || !image.naturalWidth)) return null;
      return image;
    };
    const snapshot = image => {
      try { return { src: image.tagName === 'CANVAS' ? image.toDataURL('image/png') : image.currentSrc || image.src, title: image.alt || '器物与修复区域' }; }
      catch { return null; }
    };
    const enlarge = event => {
      const image = picture(event.target), content = image && snapshot(image);
      if (!content) return;
      event.preventDefault(); event.stopPropagation(); setViewer(content); setZoom(1);
    };
    const request = event => { const content = event.detail?.image && snapshot(event.detail.image); if (content) { setViewer(content); setZoom(1); } };
    document.addEventListener('click', enlarge, true);
    document.addEventListener('qiong-view-image', request);
    return () => {
      document.removeEventListener('click', enlarge, true);
      document.removeEventListener('qiong-view-image', request);
    };
  }, []);
  useEffect(() => {
    if (!viewer) return;
    const previous = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; closeButton.current?.focus();
    const trap = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); setViewer(null); return; }
      if (event.key !== 'Tab') return;
      const controls = [...document.querySelectorAll('.image-viewer button:not(:disabled)')], first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', trap, true);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', trap, true); if (previous?.isConnected) previous.focus(); };
  }, [viewer]);
  return createPortal(<div data-image-inspector>
    {viewer && <div className="image-viewer-shade" onClick={e => { if (e.target === e.currentTarget) setViewer(null); }}><section className="image-viewer" role="dialog" aria-modal="true" aria-label="查看图片大图"><header><strong>{viewer.title}</strong><div><button aria-label="大图缩小" disabled={zoom <= 1} onClick={() => setZoom(v => Math.max(1, v - .5))}>−</button><span>{Math.round(zoom * 100)}%</span><button aria-label="大图放大" disabled={zoom >= 3} onClick={() => setZoom(v => Math.min(3, v + .5))}>＋</button><button ref={closeButton} onClick={() => setViewer(null)}>关闭大图</button></div></header><div className="image-viewer-stage"><div style={{ width: `${zoom * 100}%` }}><img src={viewer.src} alt={viewer.title}/></div></div></section></div>}
  </div>, document.body);
}
