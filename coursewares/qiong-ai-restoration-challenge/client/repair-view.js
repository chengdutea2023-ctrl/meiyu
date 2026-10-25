const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function repairOverlay(mask, width, height, fill = true) {
  if (mask.length !== width * height) throw new Error('修复范围尺寸不一致');
  const rgba = new Uint8ClampedArray(mask.length * 4), radius = 3;
  for (let p = 0; p < mask.length; p++) if (mask[p] >= 128) {
    const x = p % width, y = Math.floor(p / width);
    const border = x < radius || y < radius || x >= width - radius || y >= height - radius ||
      [p-radius,p+radius,p-width*radius,p+width*radius].some(next => mask[next] < 128);
    rgba.set([218,29,29,border ? 255 : fill ? 42 : 0], p*4);
  }
  return rgba;
}

export function repairFocus(mask, width, height) {
  if (mask.length !== width * height) throw new Error('修复范围尺寸不一致');
  const seen = new Uint8Array(mask.length), queue = new Int32Array(mask.length), parts = [];
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] < 128 || seen[start]) continue;
    let head = 0, tail = 1, left = width, top = height, right = 0, bottom = 0;
    queue[0] = start; seen[start] = 1;
    while (head < tail) {
      const p = queue[head++], x = p % width, y = Math.floor(p / width);
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      for (const next of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1]) {
        if (next >= 0 && mask[next] >= 128 && !seen[next]) { seen[next] = 1; queue[tail++] = next; }
      }
    }
    parts.push({ count: tail, left, top, right, bottom });
  }
  if (!parts.length) throw new Error('修复范围为空');
  // Tiny isolated pen marks must not shrink the main repair to an unreadable full-image view.
  const largest = parts.reduce((n, p) => Math.max(n, p.count), 0), main = parts.filter(p => p.count >= largest * .1);
  const { left, top, right, bottom } = main.reduce((b, p) => ({ left: Math.min(b.left, p.left), top: Math.min(b.top, p.top), right: Math.max(b.right, p.right), bottom: Math.max(b.bottom, p.bottom) }), { left: width, top: height, right: 0, bottom: 0 });
  const side = Math.max(140, Math.max(right - left + 1, bottom - top + 1) * 1.65);
  const w = Math.min(width, side), h = Math.min(height, side);
  return { x: clamp((left + right + 1 - w) / 2, 0, width - w), y: clamp((top + bottom + 1 - h) / 2, 0, height - h), width: w, height: h };
}

export function comparisonViewport(focus, width, height, view, zoom = 1) {
  const base = view === 'detail' ? focus : { x: 0, y: 0, width, height };
  const w = base.width / zoom, h = base.height / zoom;
  const cx = view === 'full' && zoom === 1 ? width / 2 : focus.x + focus.width / 2;
  const cy = view === 'full' && zoom === 1 ? height / 2 : focus.y + focus.height / 2;
  return { x: clamp(cx - w / 2, 0, width - w), y: clamp(cy - h / 2, 0, height - h), width: w, height: h };
}

export function originalPoint(rect, width, height, x, y) {
  return { x: clamp((rect.x + clamp(x, 0, 1) * rect.width) / width, 0, 1), y: clamp((rect.y + clamp(y, 0, 1) * rect.height) / height, 0, 1) };
}

export function viewportPoint(rect, width, height, point) {
  return { x: (point.x * width - rect.x) / rect.width, y: (point.y * height - rect.y) / rect.height };
}
