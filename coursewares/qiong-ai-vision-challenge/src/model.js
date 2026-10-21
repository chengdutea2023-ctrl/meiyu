import * as tf from '@tensorflow/tfjs';
let pending;
export async function loadModel() {
  if (!pending) pending = (async () => {
    await tf.ready();
    const base = await tf.loadLayersModel('./models/model.json');
    const features = tf.model({ inputs: base.inputs, outputs: base.getLayer('global_average_pooling2d_1').output });
    const response = await fetch('./models/classifier.json');
    if (!response.ok) throw new Error('分类模型文件未能加载');
    const head = await response.json();
    const weights = tf.tensor2d(head.weights), bias = tf.tensor1d(head.bias);
    const warmup = tf.tidy(() => features.predict(tf.zeros([1,224,224,3])).matMul(weights).add(bias));
    await warmup.data(); warmup.dispose();
    return { features, weights, bias, head };
  })().catch(error => { pending = null; throw error; });
  return pending;
}
export async function infer(canvas) {
  const { features, weights, bias, head } = await loadModel();
  const probabilities = tf.tidy(() => {
    const pixels = tf.browser.fromPixels(canvas);
    const input = tf.image.resizeBilinear(pixels, [224, 224], true).toFloat().div(127.5).sub(1).expandDims();
    const embedding = features.predict(input);
    const normalized = embedding.div(embedding.norm('euclidean', 1, true).add(1e-8));
    return tf.softmax(normalized.matMul(weights).add(bias).div(head.temperature));
  });
  try { const values = Array.from(await probabilities.data()); if (values.length !== 3 || values.some(v=>!Number.isFinite(v))) throw new Error('识别结果异常'); return values; }
  finally { probabilities.dispose(); }
}
