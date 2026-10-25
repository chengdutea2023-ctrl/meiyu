export function fitMaskCanvas(width, height, viewport) {
  if (!(width > 0 && height > 0 && viewport.width > 0 && viewport.height > 0)) return { width: 0, height: 0 };
  const ratio = Math.min(viewport.width / width, viewport.height / height);
  return { width: width * ratio, height: height * ratio };
}

export function clampMaskPan(pan, fitted, zoom, viewport) {
  const x = Math.max(0, (fitted.width * zoom - viewport.width) / 2);
  const y = Math.max(0, (fitted.height * zoom - viewport.height) / 2);
  return { x: Math.max(-x, Math.min(x, pan.x)), y: Math.max(-y, Math.min(y, pan.y)) };
}

export function maskPoint(clientX, clientY, rect, width, height) {
  return { x: Math.max(0, Math.min(width, (clientX - rect.left) * width / rect.width)),
    y: Math.max(0, Math.min(height, (clientY - rect.top) * height / rect.height)) };
}
