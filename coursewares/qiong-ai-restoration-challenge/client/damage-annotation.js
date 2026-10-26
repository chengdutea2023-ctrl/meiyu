// Presentation only: these marks never change the saved mask or the AI input image.
export function damageContours(mask, width, height) {
  if (mask.length !== width * height) throw new Error('修复范围尺寸不一致');
  const edges = new Map(), stride = width + 1;
  const add = (x, y, xx, yy) => {
    const key = y * stride + x, next = yy * stride + xx;
    if (!edges.has(key)) edges.set(key, []);
    edges.get(key).push(next);
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = y * width + x;
    if (mask[p] < 128) continue;
    if (!y || mask[p - width] < 128) add(x, y, x + 1, y);
    if (x === width - 1 || mask[p + 1] < 128) add(x + 1, y, x + 1, y + 1);
    if (y === height - 1 || mask[p + width] < 128) add(x + 1, y + 1, x, y + 1);
    if (!x || mask[p - 1] < 128) add(x, y + 1, x, y);
  }
  const contours = [];
  while (edges.size) {
    const start = edges.keys().next().value, points = [];
    let key = start;
    do {
      points.push([key % stride, Math.floor(key / stride)]);
      const options = edges.get(key);
      if (!options?.length) break;
      const next = options.pop();
      if (!options.length) edges.delete(key);
      key = next;
    } while (key !== start);
    points.push(points[0]); contours.push(points);
  }
  return contours;
}

export function readDamageMask(image, width, height) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, width, height);
  const rgba = ctx.getImageData(0, 0, width, height).data;
  return Uint8Array.from({ length: width * height }, (_, p) => rgba[p * 4] >= 128 ? 255 : 0);
}

export function drawDamageAnnotation(ctx, mask, width, height, visibleWidth = width, locate = false) {
  const scale = width / Math.max(1, visibleWidth), overlay = document.createElement('canvas');
  overlay.width = width; overlay.height = height;
  const layer = overlay.getContext('2d'), pixels = layer.createImageData(width, height);
  let left = width, top = height, right = -1, bottom = -1;
  for (let p = 0; p < mask.length; p++) if (mask[p] >= 128) {
    const x = p % width, y = Math.floor(p / width), stripe = (x + y) % Math.max(8, Math.round(12 * scale)) < 2 * scale;
    pixels.data.set(stripe ? [255, 250, 240, 230] : [210, 35, 30, 160], p * 4);
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  layer.putImageData(pixels, 0, 0); ctx.drawImage(overlay, 0, 0);
  if (right < 0) return;
  ctx.save(); ctx.lineJoin = 'round';
  ctx.beginPath();
  for (const points of damageContours(mask, width, height)) {
    ctx.moveTo(...points[0]); for (const point of points.slice(1)) ctx.lineTo(...point); ctx.closePath();
  }
  ctx.strokeStyle = '#fffdf7'; ctx.lineWidth = 7 * scale; ctx.stroke();
  ctx.strokeStyle = '#c92420'; ctx.lineWidth = 3 * scale; ctx.setLineDash([8 * scale, 5 * scale]); ctx.stroke();
  if (locate) {
    // A locating ring keeps even the smallest true missing part readable in a thumbnail.
    ctx.beginPath(); ctx.ellipse((left + right) / 2, (top + bottom) / 2,
      Math.max((right - left) / 2 + 9 * scale, 16 * scale), Math.max((bottom - top) / 2 + 9 * scale, 16 * scale), 0, 0, Math.PI * 2);
    ctx.setLineDash([]); ctx.strokeStyle = '#fffdf7'; ctx.lineWidth = 5 * scale; ctx.stroke();
    ctx.setLineDash([5 * scale, 3 * scale]); ctx.strokeStyle = '#b61918'; ctx.lineWidth = 2 * scale; ctx.stroke();
  }
  ctx.restore();
}
