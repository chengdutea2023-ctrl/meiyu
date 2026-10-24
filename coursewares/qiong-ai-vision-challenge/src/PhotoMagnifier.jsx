import { useEffect, useRef, useState } from 'react';
import { clamp } from './engine.js';

// The lens reads a separate copy of the experiment canvas; it never changes model input.
export function PhotoMagnifier({ canvasRef, ready, revision, specimenId, children }) {
  const lensRef = useRef(null);
  const [lens, setLens] = useState(null);
  useEffect(() => setLens(null), [ready, revision, specimenId]);

  function magnify(event) {
    const source = canvasRef.current;
    if (!ready || event.pointerType !== 'mouse' || event.buttons || event.target !== source) {
      setLens(null);
      return;
    }
    const rect = source.getBoundingClientRect();
    const size = Math.min(210, rect.width * .48, rect.height * .7);
    const x = clamp(event.clientX - rect.left, 0, rect.width);
    const y = clamp(event.clientY - rect.top, 0, rect.height);
    const width = size / 2.5 * source.width / rect.width;
    const height = size / 2.5 * source.height / rect.height;
    const sx = clamp(x / rect.width * source.width - width / 2, 0, source.width - width);
    const sy = clamp(y / rect.height * source.height - height / 2, 0, source.height - height);
    const context = lensRef.current.getContext('2d');
    context.clearRect(0, 0, 480, 480);
    context.drawImage(source, sx, sy, width, height, 0, 0, 480, 480);
    setLens({ left: clamp(x + 18, 0, rect.width - size), top: clamp(y - size - 18, 0, rect.height - size), width: size, height: size });
  }

  return <div className="photo-frame" onPointerMove={magnify} onPointerLeave={() => setLens(null)} onPointerDown={() => setLens(null)}>
    {children}
    <div className="photo-lens" hidden={!lens} style={lens || {}} aria-hidden="true"><canvas ref={lensRef} width="480" height="480"/><span>局部放大 2.5×</span></div>
  </div>;
}
