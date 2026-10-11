import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('../coursewares/yolo-environment-recognition/static/app.js', import.meta.url), 'utf8');
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

async function fixture() {
  const elements = new Map(), timers = new Map(), events = new Map(), changes = [], pending = [], completed = [], progress = [];
  let timerId = 0, active = 0, maxActive = 0, denied = false;
  const context = (canvas) => ({ canvas, fillRect() {}, drawImage() {}, clearRect() {}, strokeRect() {}, fillText() {},
    measureText: () => ({ width: 30 }), getImageData: () => ({ data: new Uint8ClampedArray(4) }) });
  const element = (id = '') => {
    let disabled = false;
    return { id, hidden: false, textContent: '', value: '', width: 640, height: 360, children: [],
      videoWidth: 960, videoHeight: 540, handlers: {},
      get disabled() { return disabled; },
      set disabled(value) { if (disabled !== value) changes.push({ id, value }); disabled = value; },
      append(...children) { this.children.push(...children); }, replaceChildren() { this.children = []; },
      addEventListener(type, callback) { this.handlers[type] = callback; },
      getContext() { return context(this); }, toDataURL: () => 'data:image/jpeg;base64,eA==', play: async () => {},
    };
  };
  const $ = (id) => { if (!elements.has(id)) elements.set(id, element(id)); return elements.get(id); };
  const streams = [];
  class Worker {
    postMessage(message) {
      if (message.type === 'init') { queueMicrotask(() => this.onmessage({ data: { id: message.id, ready: true } })); return; }
      active++; maxActive = Math.max(maxActive, active); pending.push({ worker: this, message });
    }
    terminate() {}
  }
  class Image { naturalWidth = 960; naturalHeight = 540; decode = async () => {}; }
  class LocalURL extends URL {
    static createObjectURL() { return 'blob:local-test'; }
    static revokeObjectURL() {}
  }
  const sandbox = { URL: LocalURL, Promise, Image, Worker, TextEncoder, btoa, structuredClone, Uint8ClampedArray,
    setTimeout: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout: (id) => timers.delete(id),
    document: { baseURI: 'https://course.invalid/nested/lesson/', hidden: false, getElementById: $, createElement: () => element(),
      addEventListener: (type, callback) => events.set(type, callback) },
    navigator: { mediaDevices: { getUserMedia: async () => {
      if (denied) throw new Error('denied');
      const track = { stopped: false, stop() { this.stopped = true; } };
      const stream = { getTracks: () => [track] }; streams.push(stream); return stream;
    } } },
    window: { Worker, addEventListener() {}, ZhikeCourseware: { initialize: async () => {}, markDirty() {}, returnToPortal() {},
      progress: (value) => progress.push(value), complete: async (value) => { completed.push(value); return { demo: true }; } } },
  };
  vm.runInNewContext(source, sandbox); await settle(); assert.equal($('status').textContent, '模型已就绪');
  const finish = async (error, label = 0) => {
    const item = pending.shift(); assert.ok(item, 'an inference must be pending'); active--;
    item.worker.onmessage({ data: { id: item.message.id, ...(error ? { error } : { boxes: [{ x: 10, y: 10, w: 30, h: 30, p: .9, label }] }) } });
    await settle();
  };
  const tick = async () => {
    const entry = [...timers].find(([, value]) => value.delay === 250); assert.ok(entry, 'live loop must be scheduled');
    timers.delete(entry[0]); entry[1].callback(); await settle();
  };
  return { $, changes, pending, streams, completed, progress, finish, tick, events, sandbox,
    maxActive: () => maxActive, deny: (value) => { denied = value; },
    camera: async () => { await $('camera').onclick(); await settle(); },
    run: async () => { $('run').onclick(); await settle(); } };
}

test('YOLO live inference keeps all action controls stable and stop immediately available', async () => {
  const f = await fixture(); await f.camera(); f.changes.length = 0; await f.run();
  for (let i = 0; i < 5; i++) {
    for (const id of ['camera', 'run', 'file', 'photo']) assert.equal(f.$(id).disabled, false, id);
    await f.finish(); await f.tick();
  }
  assert.deepEqual(f.changes, []); assert.equal(f.maxActive(), 1);
  await f.run(); assert.equal(f.$('run').textContent, '开始实时识别'); await f.finish();
  assert.equal(f.$('photo').disabled, false);
});

test('YOLO photo during inference queues exactly once and preserves captured-frame detections', async () => {
  const f = await fixture(); await f.camera(); await f.run();
  const photo = f.$('photo').onclick(); await settle(); await f.$('photo').onclick();
  assert.equal(f.pending.length, 1); assert.equal(f.$('photo').disabled, true); assert.equal(f.$('run').disabled, true);
  await f.finish(); assert.equal(f.pending.length, 1); await f.finish(undefined, 14); await photo;
  assert.equal(f.$('count').textContent, '作品图片 1/3'); assert.equal(f.progress.length, 1);
  assert.equal(f.$('shots').children[0].children[1].textContent, '鸟'); assert.equal(f.maxActive(), 1);
  for (const id of ['camera', 'run', 'file', 'photo']) assert.equal(f.$(id).disabled, false, id);
  await f.tick(); await f.finish();
});

test('YOLO upload waits for a live frame, stops its camera and ignores its stale error', async () => {
  const f = await fixture(); await f.camera(); await f.run();
  const upload = f.$('file').onchange({ target: { files: [{ type: 'image/jpeg', size: 100 }], value: 'photo.jpg' } });
  await settle(); assert.equal(f.streams[0].getTracks()[0].stopped, true); assert.equal(f.pending.length, 1);
  await f.finish('old camera error'); assert.equal(f.pending.length, 1); await f.finish(undefined, 14); await upload;
  assert.equal(f.$('count').textContent, '作品图片 1/3'); assert.equal(f.$('preview').hidden, false);
  assert.equal(f.$('run').disabled, true); assert.equal(f.$('file').disabled, false); assert.equal(f.maxActive(), 1);
});

test('YOLO three-photo limit and removal still control photo and upload availability', async () => {
  const f = await fixture(); await f.camera();
  for (let i = 0; i < 3; i++) { const photo = f.$('photo').onclick(); await settle(); await f.finish(); await photo; }
  assert.equal(f.$('photo').disabled, true); assert.equal(f.$('file').disabled, true);
  await f.$('photo').onclick(); assert.equal(f.pending.length, 0);
  f.$('shots').children[0].children[2].onclick();
  assert.equal(f.$('count').textContent, '作品图片 2/3'); assert.equal(f.$('photo').disabled, false); assert.equal(f.$('file').disabled, false);
});

test('YOLO failed inference can restart and saving does not race a live frame', async () => {
  const f = await fixture(); await f.camera(); await f.run(); await f.finish('inference failed');
  assert.equal(f.$('run').textContent, '开始实时识别'); assert.equal(f.$('run').disabled, false);
  await f.run(); await f.finish(); await f.run();
  const photo = f.$('photo').onclick(); await settle(); await f.finish(); await photo;
  await f.run(); f.$('survey').value = '本地测试回答'; await f.$('submit').onclick();
  assert.equal(f.completed.length, 1); assert.equal(f.completed[0].score, null); assert.equal(f.completed[0].pendingArtifacts.length, 2);
  await f.finish();
  assert.equal(f.$('submit').textContent, '已完成'); assert.equal(f.$('photo').disabled, true);
  assert.equal(f.streams[0].getTracks()[0].stopped, true);
});

test('YOLO denied camera can retry, and hidden-page cleanup invalidates live work', async () => {
  const f = await fixture(); f.deny(true); await f.camera();
  assert.match(f.$('status').textContent, /请允许权限/); assert.equal(f.$('camera').disabled, false);
  f.deny(false); await f.camera(); await f.run();
  f.sandbox.document.hidden = true; f.events.get('visibilitychange')(); await f.finish();
  assert.equal(f.streams[0].getTracks()[0].stopped, true); assert.equal(f.$('run').disabled, true);
});
