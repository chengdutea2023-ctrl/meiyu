(() => {
  const $ = (id) => document.getElementById(id);
  const names = ['人','自行车','汽车','摩托车','飞机','公交车','火车','卡车','船','红绿灯','消防栓','停车标志','停车计时器','长椅','鸟','猫','狗','马','羊','牛','大象','熊','斑马','长颈鹿','背包','雨伞','手提包','领带','行李箱','飞盘','滑雪板','滑雪橇','运动球','风筝','棒球棒','棒球手套','滑板','冲浪板','网球拍','瓶子','酒杯','杯子','叉子','刀','勺子','碗','香蕉','苹果','三明治','橙子','西兰花','胡萝卜','热狗','披萨','甜甜圈','蛋糕','椅子','沙发','盆栽','床','餐桌','厕所','电视','笔记本电脑','鼠标','遥控器','键盘','手机','微波炉','烤箱','烤面包机','水槽','冰箱','书','时钟','花瓶','剪刀','泰迪熊','吹风机','牙刷'];
  const video = $('video'), canvas = $('overlay'), ctx = canvas.getContext('2d');
  const prep = document.createElement('canvas'); prep.width = prep.height = 640;
  const px = prep.getContext('2d', { willReadFrequently: true });
  const photoCanvas = document.createElement('canvas'), photoContext = photoCanvas.getContext('2d');
  const photos = [], requests = new Map();
  let worker, ready = false, stream, live = false, busy = false, frozen = false, boxes = [];
  let inferenceTail = Promise.resolve();
  let nextRequest = 0, cameraGeneration = 0, loopGeneration = 0, loopTimer;

  function stopCamera() {
    live = false; cameraGeneration++; loopGeneration++; clearTimeout(loopTimer);
    stream?.getTracks().forEach((track) => track.stop()); stream = null; video.srcObject = null;
    video.hidden = true; canvas.hidden = true;
    $('run').disabled = true; $('photo').disabled = true; $('run').textContent = '开始实时识别';
  }

  function setReady() {
    $('camera').disabled = !ready || frozen || busy;
    $('file').disabled = !ready || frozen || busy || photos.length >= 3;
    $('run').disabled = !ready || !stream || frozen || busy;
    $('photo').disabled = !ready || !stream || frozen || busy || photos.length >= 3;
  }

  function releaseWorker(message = '识别已停止') {
    ready = false; worker?.terminate(); worker = null;
    for (const request of requests.values()) { clearTimeout(request.timer); request.reject(new Error(message)); }
    requests.clear();
  }

  function askWorker(type, payload = {}, transfers = []) {
    return new Promise((resolve, reject) => {
      if (!worker) { reject(new Error('模型尚未就绪')); return; }
      const id = ++nextRequest;
      const timer = setTimeout(() => {
        releaseWorker('模型处理超时，请重试加载模型'); stopCamera();
        $('modelRetry').hidden = false; setReady();
      }, type === 'init' ? 90000 : 30000);
      requests.set(id, { resolve, reject, timer });
      try { worker.postMessage({ id, type, ...payload }, transfers); }
      catch (error) { clearTimeout(timer); requests.delete(id); reject(error); }
    });
  }

  async function loadModel() {
    $('modelRetry').hidden = true; releaseWorker(); setReady();
    $('status').textContent = '正在加载本地模型…';
    try {
      if (!window.Worker) throw new Error('当前浏览器不支持后台识别，请更新浏览器');
      worker = new Worker(new URL('./inference-worker.js', document.baseURI));
      worker.onmessage = ({ data }) => {
        const request = requests.get(data.id);
        if (!request) return;
        clearTimeout(request.timer); requests.delete(data.id);
        if (data.error) request.reject(new Error(data.error)); else request.resolve(data);
      };
      worker.onerror = (event) => {
        event.preventDefault(); releaseWorker('后台识别异常，请重试加载模型'); stopCamera();
        $('status').textContent = '后台识别异常，请重试加载模型'; $('modelRetry').hidden = false; setReady();
      };
      await askWorker('init'); ready = true;
      $('status').textContent = '模型已就绪'; $('hint').textContent = '选择摄像头或上传图片'; setReady();
    } catch (error) {
      releaseWorker(); $('status').textContent = error.message || '模型加载失败，请重试';
      $('hint').textContent = '模型未就绪'; $('modelRetry').hidden = false; setReady();
    }
  }

  function drawBoxes(context, detections, width, height) {
    const ratio = context.canvas.width / width;
    context.lineWidth = 3; context.font = 'bold 18px sans-serif';
    for (const box of detections) {
      context.strokeStyle = '#65efd1'; context.strokeRect(box.x * ratio, box.y * ratio, box.w * ratio, box.h * ratio);
      const label = `${box.name} ${Math.round(box.p * 100)}%`, textWidth = context.measureText(label).width;
      const x = Math.min(box.x * ratio, Math.max(0, context.canvas.width - textWidth - 12));
      const y = Math.min(height * ratio, Math.max(22, box.y * ratio));
      context.fillStyle = '#082033'; context.fillRect(x, y - 22, textWidth + 12, 24);
      context.fillStyle = '#65efd1'; context.fillText(label, x + 6, y - 4);
    }
  }

  function infer(source, generation = cameraGeneration) {
    // Serialize live frames and captured photos without locking the controls every frame.
    const result = inferenceTail.then(() => inferFrame(source, generation));
    inferenceTail = result.catch(() => {});
    return result;
  }

  async function inferFrame(source, generation) {
    if (source === video && (generation !== cameraGeneration || !stream)) return false;
    const width = source.videoWidth || source.naturalWidth, height = source.videoHeight || source.naturalHeight;
    if (!width || !height) throw new Error('图像尚未就绪');
    const scale = Math.min(640 / width, 640 / height), dx = (640 - width * scale) / 2, dy = (640 - height * scale) / 2;
    px.fillStyle = '#727272'; px.fillRect(0, 0, 640, 640); px.drawImage(source, dx, dy, width * scale, height * scale);
    const pixels = px.getImageData(0, 0, 640, 640).data;
    const result = await askWorker('infer', { pixels: pixels.buffer, width, height }, [pixels.buffer]);
    if (source === video && (generation !== cameraGeneration || !stream)) return false;
    boxes = result.boxes.map((box) => ({ ...box, name: names[box.label] }));
    const ratio = Math.min(1, 1280 / width, 960 / height);
    const outputWidth = Math.round(width * ratio), outputHeight = Math.round(height * ratio);
    if (canvas.width !== outputWidth || canvas.height !== outputHeight) { canvas.width = outputWidth; canvas.height = outputHeight; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBoxes(ctx, boxes, width, height);
    if (source !== video) {
      photoCanvas.width = outputWidth; photoCanvas.height = outputHeight;
      photoContext.drawImage(source, 0, 0, outputWidth, outputHeight); drawBoxes(photoContext, boxes, width, height);
    }
    $('hint').textContent = boxes.length ? `检测到 ${boxes.length} 个目标` : '未检测到明确目标';
    $('status').textContent = '识别完成'; return true;
  }

  async function loop(generation, runGeneration) {
    if (!live || frozen || !stream || generation !== cameraGeneration || runGeneration !== loopGeneration) return;
    if (!busy) {
      try { await infer(video, generation); }
      catch {
        if (generation === cameraGeneration && runGeneration === loopGeneration) {
          live = false; $('run').textContent = '开始实时识别'; $('status').textContent = '实时识别失败，请重试'; setReady();
        }
      }
    }
    if (live && generation === cameraGeneration && runGeneration === loopGeneration) loopTimer = setTimeout(() => loop(generation, runGeneration), 250);
  }

  function addPhoto() {
    if (frozen || photos.length >= 3) return;
    photos.push({ data: photoCanvas.toDataURL('image/jpeg', 0.85), detections: structuredClone(boxes) });
    renderPhotos(); window.ZhikeCourseware.progress('已添加识别作品');
  }

  function renderPhotos() {
    $('shots').replaceChildren();
    photos.forEach((photo, index) => {
      const figure = document.createElement('figure'); figure.className = 'shot';
      const img = document.createElement('img'); img.src = photo.data; img.alt = `识别作品 ${index + 1}`;
      const caption = document.createElement('figcaption'); caption.textContent = photo.detections.map((box) => box.name).join('、') || '未检测到明确目标';
      const remove = document.createElement('button'); remove.textContent = '移除'; remove.disabled = frozen;
      remove.onclick = () => { photos.splice(index, 1); renderPhotos(); };
      figure.append(img, caption, remove); $('shots').append(figure);
    });
    $('count').textContent = `作品图片 ${photos.length}/3`; setReady();
  }

  $('camera').onclick = async () => {
    if (!ready || frozen || busy) return;
    stopCamera(); busy = true; setReady(); const generation = cameraGeneration;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unavailable');
      const acquired = await navigator.mediaDevices.getUserMedia({ video: {
        facingMode: { ideal: 'environment' }, width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 30, max: 30 },
      }, audio: false });
      if (frozen || document.hidden || generation !== cameraGeneration) { acquired.getTracks().forEach((track) => track.stop()); return; }
      stream = acquired; video.srcObject = stream; video.hidden = false; $('preview').hidden = true; canvas.hidden = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height); await video.play();
      $('status').textContent = '摄像头已开启'; $('hint').textContent = '摄像头预览';
    } catch { stopCamera(); $('status').textContent = '摄像头无法开启，请允许权限或改用上传图片'; }
    finally { busy = false; setReady(); }
  };
  $('run').onclick = () => {
    if (!ready || !stream || frozen || busy) return;
    live = !live; loopGeneration++; clearTimeout(loopTimer); $('run').textContent = live ? '停止实时识别' : '开始实时识别';
    if (live) loop(cameraGeneration, loopGeneration);
  };
  $('photo').onclick = async () => {
    if (!ready || !stream || frozen || busy || photos.length >= 3) return;
    busy = true; setReady(); const generation = cameraGeneration;
    try {
      // Keep the exported photo and its detections on the exact same captured frame.
      const frame = new Image(); frame.src = (() => {
        photoCanvas.width = video.videoWidth; photoCanvas.height = video.videoHeight;
        photoContext.drawImage(video, 0, 0); return photoCanvas.toDataURL('image/jpeg', 0.9);
      })();
      await frame.decode(); await infer(frame);
      if (generation === cameraGeneration && stream) addPhoto();
    } catch { $('status').textContent = '拍照识别失败，请重试'; }
    finally { busy = false; setReady(); }
  };
  $('file').onchange = async (event) => {
    const file = event.target.files[0]; event.target.value = ''; if (!file || !ready || frozen || busy || photos.length >= 3) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
      $('status').textContent = '请选择小于 8 MB 的 JPG、PNG 或 WebP 图片'; return;
    }
    stopCamera(); busy = true; setReady(); const url = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = url; await image.decode(); await infer(image); addPhoto();
      $('preview').src = photos.at(-1).data; $('preview').hidden = false;
    } catch { $('status').textContent = '图片读取或识别失败，请换图重试'; }
    finally { URL.revokeObjectURL(url); busy = false; setReady(); }
  };
  $('survey').addEventListener('input', () => window.ZhikeCourseware.markDirty());
  $('submit').onclick = async () => {
    if (busy) { $('saveState').textContent = '识别处理中，请稍后提交'; return; }
    const answer = $('survey').value.trim();
    if (!photos.length || !answer) { $('saveState').textContent = '请至少添加一张作品图片，并填写本课问卷'; return; }
    frozen = true; stopCamera(); renderPhotos(); $('survey').disabled = true; $('submit').disabled = true;
    $('saveState').textContent = '正在上传作品和问卷…';
    const report = { title: '环境物体识别', answer, photos: photos.map((item, index) => ({ number: index + 1, detections: item.detections })), evaluation: '待评价' };
    const bytes = new TextEncoder().encode(JSON.stringify(report, null, 2));
    const base64 = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
    try {
      const result = await window.ZhikeCourseware.complete({ score: null, brief: '识别作品和本课问卷已提交，等待评价。',
        resultItems: [{ label: '作品图片', value: `${photos.length} 张` }, { label: '评价状态', value: '未评分，待评价' }],
        pendingArtifacts: [...photos.map((item, index) => ({ localId: `photo-${index}`, fileName: `识别作品-${index + 1}.jpg`, mimeType: 'image/jpeg', kind: 'image', contentBase64: item.data.split(',')[1] })),
          { localId: 'questionnaire', fileName: '环境识别问卷.json', mimeType: 'application/json', kind: 'report', contentBase64: base64 }] });
      $('saveState').textContent = result.demo ? '本地预览完成，作品和成绩不会保存' : '作品和问卷已保存 · 未评分，等待评价';
      $('submit').textContent = '已完成';
    } catch (error) {
      $('saveState').textContent = `保存失败：${error.message}。请重试保存，已上传的作品不会重复上传。`;
      $('submit').textContent = '重试保存'; $('submit').disabled = false;
    }
  };
  $('returnPortal').onclick = () => window.ZhikeCourseware.returnToPortal(); $('modelRetry').onclick = loadModel;
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopCamera(); });
  window.addEventListener('pagehide', () => { stopCamera(); releaseWorker(); });
  window.addEventListener('pageshow', (event) => { if (event.persisted && !frozen) loadModel(); });
  window.ZhikeCourseware.initialize().then(() => { $('gate').hidden = true; $('lesson').hidden = false; loadModel(); })
    .catch(() => { $('gate').textContent = '启动信息无效或已过期，请从学生后台重新进入'; });
})();
