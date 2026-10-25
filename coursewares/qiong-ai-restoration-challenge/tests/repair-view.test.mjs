import test from 'node:test';
import assert from 'node:assert/strict';
import { repairFocus, comparisonViewport, originalPoint, viewportPoint } from '../client/repair-view.js';

test('a small remote pen mark does not obscure the principal repair, while a second substantial patch remains in view', () => {
  const width = 1000, height = 800, mask = new Uint8Array(width * height);
  for (let y = 100; y < 160; y++) for (let x = 600; x < 640; x++) mask[y * width + x] = 255;
  mask[700 * width + 950] = 255;
  const focus = repairFocus(mask, width, height);
  assert.ok(focus.width <= 150 && focus.x <= 600 && focus.x + focus.width >= 640);
  assert.ok(focus.y <= 100 && focus.y + focus.height >= 160);
  for (let y = 230; y < 250; y++) for (let x = 570; x < 590; x++) mask[y * width + x] = 255;
  const both = repairFocus(mask, width, height);
  assert.ok(both.y + both.height >= 250 && both.x <= 570);
});

test('review points stay at the same original pixels across detail, zoom, and complete-image views', () => {
  const width = 1024, height = 998, focus = { x: 500, y: 70, width: 260, height: 260 };
  const rect = comparisonViewport(focus, width, height, 'detail', 2);
  const original = originalPoint(rect, width, height, .25, .75);
  assert.equal(original.x * width, 597.5); assert.equal(original.y * height, 232.5);
  for (const [view, zoom] of [['detail', 1], ['detail', 3], ['full', 1], ['full', 2]]) {
    const viewport = comparisonViewport(focus, width, height, view, zoom), point = viewportPoint(viewport, width, height, original);
    const restored = originalPoint(viewport, width, height, point.x, point.y);
    assert.ok(Math.abs(restored.x - original.x) < 1e-10 && Math.abs(restored.y - original.y) < 1e-10);
    assert.ok(viewport.x >= 0 && viewport.y >= 0 && viewport.x + viewport.width <= width && viewport.y + viewport.height <= height);
  }
  assert.deepEqual(comparisonViewport(focus, width, height, 'full', 1), { x: 0, y: 0, width, height });
});

test('edge repairs remain inside a non-square photograph; invalid masks never invent a red region', () => {
  const width = 180, height = 90, mask = new Uint8Array(width * height);
  for (let y = 0; y < 20; y++) for (let x = 160; x < 180; x++) mask[y * width + x] = 255;
  const focus = repairFocus(mask, width, height);
  assert.ok(focus.x >= 0 && focus.y === 0 && focus.x + focus.width <= width && focus.height === height);
  assert.throws(() => repairFocus(new Uint8Array(2), width, height), /尺寸/);
  assert.throws(() => repairFocus(new Uint8Array(width * height), width, height), /为空/);
});
