importScripts('./vendor/ort.wasm.min.js');

const SIZE = 640;
const input = new Float32Array(3 * SIZE * SIZE);
let session, tensor, running = false;

function overlap(a, b) {
  const width = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return width * height / (a.w * a.h + b.w * b.h - width * height || 1);
}

function detections(output, width, height) {
  const [a, b] = output.dims.slice(-2);
  const channels = Math.min(a, b), count = Math.max(a, b);
  if (channels !== 84) throw new Error('Unexpected model output');
  const scale = Math.min(SIZE / width, SIZE / height);
  const dx = (SIZE - width * scale) / 2, dy = (SIZE - height * scale) / 2;
  const at = (channel, index) => output.data[a === count ? index * channels + channel : channel * count + index];
  const candidates = [];
  for (let index = 0; index < count; index++) {
    let probability = 0, label = 0;
    for (let channel = 4; channel < channels; channel++) {
      const value = at(channel, index);
      if (value > probability) { probability = value; label = channel - 4; }
    }
    if (!Number.isFinite(probability) || probability < 0.25) continue;
    const left = (at(0, index) - at(2, index) / 2 - dx) / scale;
    const top = (at(1, index) - at(3, index) / 2 - dy) / scale;
    const right = (at(0, index) + at(2, index) / 2 - dx) / scale;
    const bottom = (at(1, index) + at(3, index) / 2 - dy) / scale;
    if (![left, top, right, bottom].every(Number.isFinite)) continue;
    const x = Math.max(0, left), y = Math.max(0, top);
    const w = Math.min(width, right) - x, h = Math.min(height, bottom) - y;
    if (w > 0 && h > 0) candidates.push({ x, y, w, h, p: Math.min(1, probability), label });
  }
  const selected = [];
  for (const box of candidates.sort((first, second) => second.p - first.p).slice(0, 300)) {
    if (!selected.some((other) => other.label === box.label && overlap(box, other) > 0.45)) selected.push(box);
    if (selected.length >= 50) break;
  }
  return selected;
}

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  if (running) { self.postMessage({ id, error: '识别处理中，请稍后重试' }); return; }
  running = true;
  let output;
  try {
    if (type === 'init') {
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      ort.env.wasm.wasmPaths = new URL('./vendor/', self.location.href).href;
      session = await ort.InferenceSession.create(new URL('./models/yolov8n-int8.onnx', self.location.href).href, {
        executionProviders: ['wasm'], graphOptimizationLevel: 'all',
      });
      tensor = new ort.Tensor('float32', input, [1, 3, SIZE, SIZE]);
      self.postMessage({ id, ready: true });
    } else if (type === 'infer') {
      if (!session || !tensor) throw new Error('Model not ready');
      if (!(data.pixels instanceof ArrayBuffer) || data.pixels.byteLength !== SIZE * SIZE * 4 ||
          !Number.isFinite(data.width) || !Number.isFinite(data.height) || data.width <= 0 || data.height <= 0) {
        throw new Error('Invalid frame');
      }
      const startedAt = performance.now(), pixels = new Uint8ClampedArray(data.pixels);
      for (let index = 0; index < SIZE * SIZE; index++) {
        input[index] = pixels[index * 4] / 255;
        input[SIZE * SIZE + index] = pixels[index * 4 + 1] / 255;
        input[2 * SIZE * SIZE + index] = pixels[index * 4 + 2] / 255;
      }
      output = await session.run({ [session.inputNames[0]]: tensor });
      self.postMessage({ id, boxes: detections(output[session.outputNames[0]], data.width, data.height), durationMs: performance.now() - startedAt });
    } else {
      throw new Error('Unknown request');
    }
  } catch {
    self.postMessage({ id, error: type === 'init' ? '模型加载失败，请检查网络后重试' : '图片识别失败，请重试' });
  } finally {
    if (output) Object.values(output).forEach((value) => value.dispose?.());
    running = false;
  }
};
