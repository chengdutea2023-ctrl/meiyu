import test from 'node:test';
import assert from 'node:assert/strict';
import { fitMaskCanvas, clampMaskPan, maskPoint } from '../client/mask-viewport.js';

test('pen coordinates stay on the same original pixel after resize, enlargement and dragging', () => {
  const width = 1024, height = 998, pixel = { x: 670, y: 115 };
  for (const viewport of [{ width: 800, height: 590 }, { width: 520, height: 458 }, { width: 320, height: 330 }, { width: 1300, height: 680 }]) {
    const fit = fitMaskCanvas(width, height, viewport);
    assert.ok(fit.width <= viewport.width && fit.height <= viewport.height);
    assert.ok(Math.abs(fit.width / fit.height - width / height) < 1e-10);
    for (const zoom of [1, 1.5, 4]) {
      const pan = clampMaskPan({ x: 80, y: -45 }, fit, zoom, viewport);
      const rect = { left: 20 + (viewport.width - fit.width * zoom) / 2 + pan.x, top: 100 + (viewport.height - fit.height * zoom) / 2 + pan.y, width: fit.width * zoom, height: fit.height * zoom };
      const point = maskPoint(rect.left + pixel.x / width * rect.width, rect.top + pixel.y / height * rect.height, rect, width, height);
      assert.ok(Math.abs(point.x - pixel.x) < 1e-8 && Math.abs(point.y - pixel.y) < 1e-8);
    }
  }
});
test('drag limits keep the enlarged image covering the viewport and fit mode centers it', () => {
  const viewport = { width: 800, height: 600 }, fit = fitMaskCanvas(1024, 998, viewport);
  assert.deepEqual(clampMaskPan({ x: 9999, y: -9999 }, fit, 1, viewport), { x: 0, y: -0 });
  const limit = clampMaskPan({ x: 9999, y: -9999 }, fit, 4, viewport);
  assert.equal(limit.x, (fit.width * 4 - viewport.width) / 2); assert.equal(limit.y, -(fit.height * 4 - viewport.height) / 2);
  assert.deepEqual(maskPoint(-10, 999, { left: 0, top: 0, width: 500, height: 500 }, 1024, 998), { x: 0, y: 998 });
  assert.deepEqual(fitMaskCanvas(0, 998, viewport), { width: 0, height: 0 });
});
