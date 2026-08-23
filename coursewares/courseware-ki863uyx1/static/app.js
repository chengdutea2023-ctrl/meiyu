import { FilesetResolver, HandLandmarker } from './vendor/mediapipe/vision_bundle.mjs';

const HAND_MODEL_PATH = './models/hand-landmarker/hand_landmarker.task';
const CLASSIFIER_PATH = './models/rps-keypoint-classifier/rps-classifier.json';
const WASM_BASE = './vendor/mediapipe/wasm';
const CONFIDENCE_THRESHOLD = 0.75;
const MARGIN_THRESHOLD = 0.15;
const STABLE_WINDOW = 5;
const STABLE_VOTES = 3;
const MAX_SAMPLE_EDGE = 640;
const ROUND_SNAPSHOT_EDGE = 640;
const ROUND_SNAPSHOT_QUALITY = 0.78;
const TOTAL_ROUNDS = 5;
const COUNTDOWN_SECONDS = 5;
const AUTO_NEXT_ROUND_DELAY_MS = 2000;
const RPS_MOVES = ['rock', 'scissors', 'paper'];

const displayLabels = {
  rock: '石头',
  paper: '布',
  scissors: '剪刀',
  none: '无手势/未知',
};

const moveMarks = {
  rock: '石',
  paper: '布',
  scissors: '剪',
  none: '?',
};

const handConnections = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

const app = {
  params: new URLSearchParams(window.location.search),
  launchToken: '',
  platformApiBase: '',
  returnUrl: '',
  demoMode: false,
  launch: null,
  handLandmarker: null,
  classifier: null,
  video: null,
  overlay: null,
  stream: null,
  animationId: null,
  cameraStarting: false,
  cameraStartPromise: null,
  cameraStartId: 0,
  lastVideoTime: -1,
  runtimeReady: false,
  cameraReady: false,
  startedAt: Date.now(),
  currentPrediction: null,
  currentFrame: null,
  stableFrames: [],
  rounds: [],
  currentRound: null,
  roundPhase: 'idle',
  countdownRemaining: COUNTDOWN_SECONDS,
  countdownTimer: null,
  nextRoundTimer: null,
  winStreak: 0,
  bestStreak: 0,
  soundMuted: false,
  audioContext: null,
  teacherPanelOpen: false,
  lastUnstableNoticeAt: 0,
  sampleArtifacts: [],
  roundSnapshots: [],
  submitted: false,
};

const els = {};

document.addEventListener('DOMContentLoaded', () => {
  cacheElements();
  bindEvents();
  boot();
});

function cacheElements() {
  Object.assign(els, {
    launchPanel: document.querySelector('#launchPanel'),
    launchTitle: document.querySelector('#launchTitle'),
    launchMessage: document.querySelector('#launchMessage'),
    startButton: document.querySelector('#startButton'),
    workspace: document.querySelector('#workspace'),
    webcamMount: document.querySelector('#webcamMount'),
    modeBadge: document.querySelector('#modeBadge'),
    runtimeStatus: document.querySelector('#runtimeStatus'),
    cameraButton: document.querySelector('#cameraButton'),
    retryModelButton: document.querySelector('#retryModelButton'),
    playerStageTitle: document.querySelector('#playerStageTitle'),
    arenaTitle: document.querySelector('#arenaTitle'),
    aiMoodText: document.querySelector('#aiMoodText'),
    soundButton: document.querySelector('#soundButton'),
    studentScoreValue: document.querySelector('#studentScoreValue'),
    aiScoreValue: document.querySelector('#aiScoreValue'),
    drawScoreValue: document.querySelector('#drawScoreValue'),
    aiMoveText: document.querySelector('#aiMoveText'),
    aiMoveIcon: document.querySelector('#aiMoveIcon'),
    playerMoveText: document.querySelector('#playerMoveText'),
    playerMoveIcon: document.querySelector('#playerMoveIcon'),
    countdownValue: document.querySelector('#countdownValue'),
    roundPhaseText: document.querySelector('#roundPhaseText'),
    roundResultBanner: document.querySelector('#roundResultBanner'),
    startRoundButton: document.querySelector('#startRoundButton'),
    resetGameButton: document.querySelector('#resetGameButton'),
    roundLog: document.querySelector('#roundLog'),
    predictionLabel: document.querySelector('#predictionLabel'),
    confidenceValue: document.querySelector('#confidenceValue'),
    confidenceBars: document.querySelector('#confidenceBars'),
    landmarkQuality: document.querySelector('#landmarkQuality'),
    stabilityValue: document.querySelector('#stabilityValue'),
    handCountValue: document.querySelector('#handCountValue'),
    teachingNote: document.querySelector('#teachingNote'),
    teacherToggleButton: document.querySelector('#teacherToggleButton'),
    teacherPanel: document.querySelector('#teacherPanel'),
    sampleLabel: document.querySelector('#sampleLabel'),
    saveSampleButton: document.querySelector('#saveSampleButton'),
    sampleStatus: document.querySelector('#sampleStatus'),
    reportRecord: document.querySelector('#reportRecord'),
    reportBestStreak: document.querySelector('#reportBestStreak'),
    reportStableRounds: document.querySelector('#reportStableRounds'),
    reportInsight: document.querySelector('#reportInsight'),
    roundSnapshotGrid: document.querySelector('#roundSnapshotGrid'),
    finishBackButton: document.querySelector('#finishBackButton'),
    submitStatus: document.querySelector('#submitStatus'),
  });
}

function bindEvents() {
  document.querySelectorAll('[data-back]').forEach((button) => {
    button.addEventListener('click', backToStudentPortal);
  });

  bindClick(els.startButton, startLesson);
  bindClick(els.cameraButton, startCamera);
  bindClick(els.retryModelButton, loadRuntime);
  bindClick(els.startRoundButton, startRound);
  bindClick(els.resetGameButton, resetGame);
  bindClick(els.soundButton, toggleSound);
  bindClick(els.teacherToggleButton, toggleTeacherPanel);
  bindClick(els.finishBackButton, submitAndBackToPortal);
  bindClick(els.saveSampleButton, captureTrainingSample);

  document.querySelectorAll('[data-step-tab]').forEach((button) => {
    button.addEventListener('click', () => showStep(button.dataset.stepTab));
  });

  document.querySelectorAll('[data-step-go]').forEach((button) => {
    button.addEventListener('click', () => showStep(button.dataset.stepGo));
  });
}

function bindClick(element, handler) {
  if (!element) {
    return;
  }
  element.addEventListener('click', handler);
}

async function boot() {
  app.launchToken = app.params.get('launchToken') || '';
  app.platformApiBase = app.params.get('platformApiBase') || '';
  app.returnUrl = app.params.get('returnUrl') || '';
  app.demoMode = app.params.get('demo') === '1';

  if (!app.launchToken || !app.platformApiBase) {
    if (app.demoMode) {
      app.launch = {
        student: { name: '本地演示学生' },
        courseware: { title: 'AI 猜拳擂台' },
      };
      setLaunchReady('本地演示模式', '可以试玩完整流程。演示模式不会提交成绩或上传样本。');
      return;
    }

    els.launchTitle.textContent = '请从学生后台进入课件';
    els.launchMessage.textContent = '请从学生后台进入，这样老师才能看到你的战报。';
    els.startButton.disabled = true;
    return;
  }

  try {
    els.launchTitle.textContent = '正在校验学生身份';
    app.launch = await platformPost('/course-runtime/launch/verify', {
      launchToken: app.launchToken,
    });
    setLaunchReady('准备好了', '摄像头会识别你的石头、剪刀和布。');
  } catch (error) {
    els.launchTitle.textContent = '启动校验失败';
    els.launchMessage.textContent = getErrorMessage(error);
    els.startButton.disabled = true;
  }
}

function setLaunchReady(title, message) {
  els.launchTitle.textContent = title;
  els.launchMessage.textContent = message;
  els.startButton.disabled = false;
}

async function startLesson() {
  els.launchPanel.classList.add('is-hidden');
  els.workspace.classList.remove('is-hidden');
  app.startedAt = Date.now();
  resetGame({ silent: true });
  showStep('arena');
  setRuntimeStatus('AI 小队长正在热身。');
  await loadRuntime();
  if (app.runtimeReady && !app.cameraReady) {
    await startCamera({ automatic: true });
  }
}

async function loadRuntime() {
  stopPredictionLoop();
  app.runtimeReady = false;
  app.handLandmarker = null;
  app.classifier = null;
  app.stableFrames = [];

  try {
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
    app.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: HAND_MODEL_PATH,
      },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    const response = await fetch(CLASSIFIER_PATH);
    if (!response.ok) {
      throw new Error('RPS 分类器文件加载失败。');
    }
    app.classifier = await response.json();
    app.runtimeReady = true;
    els.modeBadge.textContent = '摄像头';
    setRuntimeStatus('AI 准备好了，正在打开摄像头。');
    renderPredictionBars(emptyPredictionRows());
    updateQualityUi({ quality: 0, handCount: 0, stableCount: 0 });

    if (app.cameraReady) {
      predictLoop();
    }
  } catch (error) {
    els.modeBadge.textContent = '需要重试';
    setRuntimeStatus(`AI 还没准备好：${getErrorMessage(error)}`, true);
  }
}

async function startCamera({ automatic = false } = {}) {
  if (app.cameraStarting && app.cameraStartPromise) {
    return app.cameraStartPromise;
  }

  app.cameraStartPromise = openCamera({ automatic })
    .finally(() => {
      app.cameraStarting = false;
      app.cameraStartPromise = null;
      els.cameraButton.disabled = false;
      updateGameUi();
    });
  return app.cameraStartPromise;
}

async function openCamera({ automatic = false } = {}) {
  if (!app.runtimeReady) {
    setRuntimeStatus('等 AI 准备好以后再打开摄像头。', true);
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    setRuntimeStatus('这个浏览器还不能打开摄像头，请老师检查权限。', true);
    return;
  }

  const cameraStartId = app.cameraStartId + 1;
  app.cameraStartId = cameraStartId;
  app.cameraStarting = true;

  try {
    els.cameraButton.disabled = true;
    setRuntimeStatus(automatic ? '正在打开摄像头。' : '正在重新打开摄像头。');
    stopPredictionLoop();
    stopCameraStream();
    renderCameraPlaceholder('正在打开摄像头');

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 960 },
        height: { ideal: 720 },
      },
    });

    const video = document.createElement('video');
    video.className = 'camera-video';
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.srcObject = stream;

    const overlay = document.createElement('canvas');
    overlay.className = 'skeleton-canvas';

    els.webcamMount.replaceChildren(video, overlay);
    await video.play();
    await waitForVideoFrame(video);

    if (cameraStartId !== app.cameraStartId) {
      stopMediaStream(stream);
      return;
    }

    app.stream = stream;
    app.video = video;
    app.overlay = overlay;
    els.cameraButton.textContent = '重新打开摄像头';
    app.cameraReady = true;
    app.lastVideoTime = -1;
    app.stableFrames = [];
    setRuntimeStatus('看到你啦！点“开始本轮”来出拳。');
    predictLoop();
  } catch (error) {
    app.cameraReady = false;
    const prefix = automatic ? '摄像头没有打开' : '摄像头还是没打开';
    renderCameraPlaceholder('摄像头没有打开');
    setRuntimeStatus(`${prefix}：${cameraErrorMessage(error)}`, true);
  }
}

function waitForVideoFrame(video) {
  if (video.videoWidth > 0 && video.videoHeight > 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      finish(new Error('没有拿到摄像头画面，请重新打开摄像头。'));
    }, 6000);
    const finish = (error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      video.removeEventListener('loadedmetadata', check);
      video.removeEventListener('canplay', check);
      video.removeEventListener('playing', check);
      video.removeEventListener('error', onError);
      if (error) {
        reject(error);
        return;
      }
      resolve();
    };
    const check = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        finish();
      }
    };
    const onError = () => finish(new Error('摄像头视频无法播放。'));
    video.addEventListener('loadedmetadata', check);
    video.addEventListener('canplay', check);
    video.addEventListener('playing', check);
    video.addEventListener('error', onError);
    check();
  });
}

function renderCameraPlaceholder(message = '请在摄像头前出拳') {
  const placeholder = document.createElement('div');
  placeholder.className = 'camera-placeholder';
  const image = document.createElement('img');
  image.src = './assets/hand-outline-paper.webp';
  image.alt = '';
  image.setAttribute('aria-hidden', 'true');
  const label = document.createElement('strong');
  label.textContent = message;
  placeholder.append(image, label);
  els.webcamMount.replaceChildren(placeholder);
}

function stopMediaStream(stream) {
  stream?.getTracks?.().forEach((track) => track.stop());
}

function stopCameraStream() {
  stopMediaStream(app.stream);
  app.stream = null;
  app.video = null;
  app.overlay = null;
  app.cameraReady = false;
}

function cameraErrorMessage(error) {
  const name = error?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return '请允许浏览器使用摄像头。';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return '没有找到可用摄像头。';
  }
  if (name === 'NotReadableError') {
    return '摄像头可能被其他软件占用了。';
  }
  return getErrorMessage(error) || '请老师检查摄像头权限。';
}

function isCameraUsable() {
  return Boolean(
    app.cameraReady
    && app.video
    && app.video.videoWidth > 0
    && app.video.videoHeight > 0
    && app.stream?.getVideoTracks?.().some((track) => track.readyState === 'live')
  );
}

function predictLoop() {
  if (!app.cameraReady || !app.video || !app.handLandmarker || !app.runtimeReady) {
    return;
  }

  if (app.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    if (app.video.currentTime !== app.lastVideoTime) {
      app.lastVideoTime = app.video.currentTime;
      const result = app.handLandmarker.detectForVideo(app.video, performance.now());
      handleHandResult(result);
    }
  }

  app.animationId = window.requestAnimationFrame(predictLoop);
}

function stopPredictionLoop() {
  if (app.animationId) {
    window.cancelAnimationFrame(app.animationId);
    app.animationId = null;
  }
}

function handleHandResult(result) {
  const handCount = result.landmarks?.length || 0;
  const selected = selectPrimaryHand(result.landmarks || []);

  if (!selected) {
    clearOverlay();
    handlePredictions({
      predictions: fixedPrediction('none', 0.9),
      frame: {
        handDetected: false,
        handCount,
        multipleHands: handCount > 1,
        quality: 0,
        landmarks: [],
        features: null,
      },
      source: 'mediapipe',
    });
    return;
  }

  const frame = buildFrameFeatures(selected.landmarks, handCount);
  drawLandmarks(selected.landmarks);

  if (frame.quality < (app.classifier?.quality?.minUsable || 0.35)) {
    handlePredictions({
      predictions: fixedPrediction('none', 0.82),
      frame,
      source: 'mediapipe',
    });
    return;
  }

  handlePredictions({
    predictions: classifyRps(frame),
    frame,
    source: 'mediapipe',
  });
}

function selectPrimaryHand(hands) {
  if (!hands.length) {
    return null;
  }

  const scored = hands.map((landmarks, index) => {
    const box = getBoundingBox(landmarks);
    const area = box.width * box.height;
    const centerPenalty = distance2d({ x: box.centerX, y: box.centerY }, { x: 0.5, y: 0.5 });
    return {
      index,
      landmarks,
      score: area - centerPenalty * 0.08,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}

function buildFrameFeatures(landmarks, handCount) {
  const box = getBoundingBox(landmarks);
  const palmWidth = distance3d(landmarks[5], landmarks[17]);
  const palmLength = distance3d(landmarks[0], landmarks[9]);
  const scale = Math.max(0.001, (palmWidth + palmLength) / 2);
  const normalized = landmarks.map((point) => ({
    x: (point.x - landmarks[0].x) / scale,
    y: (point.y - landmarks[0].y) / scale,
    z: (point.z - landmarks[0].z) / scale,
  }));
  const extension = {
    thumb: fingerExtensionScore(landmarks, [1, 2, 3, 4]),
    index: fingerExtensionScore(landmarks, [5, 6, 7, 8]),
    middle: fingerExtensionScore(landmarks, [9, 10, 11, 12]),
    ring: fingerExtensionScore(landmarks, [13, 14, 15, 16]),
    pinky: fingerExtensionScore(landmarks, [17, 18, 19, 20]),
  };
  const usableSize = clamp((Math.hypot(box.width, box.height) - 0.095) / 0.26, 0, 1);
  const centered = clamp(1 - distance2d({ x: box.centerX, y: box.centerY }, { x: 0.5, y: 0.5 }) / 0.62, 0, 1);
  const quality = clamp(0.6 * usableSize + 0.4 * centered, 0, 1);

  return {
    handDetected: true,
    handCount,
    multipleHands: handCount > 1,
    quality,
    landmarks: normalized,
    rawLandmarks: landmarks,
    features: {
      extension,
      palmWidth,
      palmLength,
      boundingBox: box,
    },
  };
}

function fingerExtensionScore(landmarks, ids) {
  const [mcpId, pipId, dipId, tipId] = ids;
  const wrist = landmarks[0];
  const mcp = landmarks[mcpId];
  const pip = landmarks[pipId];
  const dip = landmarks[dipId];
  const tip = landmarks[tipId];
  const baseDistance = Math.max(0.001, distance3d(wrist, mcp));
  const tipRatio = distance3d(wrist, tip) / baseDistance;
  const pipAngle = angleDegrees(mcp, pip, tip);
  const dipAngle = angleDegrees(pip, dip, tip);
  const ratioScore = clamp((tipRatio - 1.16) / 0.58, 0, 1);
  const pipScore = clamp((pipAngle - 108) / 58, 0, 1);
  const dipScore = clamp((dipAngle - 112) / 52, 0, 1);
  return clamp(ratioScore * 0.46 + pipScore * 0.34 + dipScore * 0.2, 0, 1);
}

function classifyRps(frame) {
  const extension = frame.features.extension;
  const fingers = ['index', 'middle', 'ring', 'pinky'];
  const curled = {
    index: 1 - extension.index,
    middle: 1 - extension.middle,
    ring: 1 - extension.ring,
    pinky: 1 - extension.pinky,
  };
  const strongExtendedCount = fingers.filter((finger) => extension[finger] >= 0.68).length;
  const softExtendedCount = fingers.filter((finger) => extension[finger] >= 0.52).length;
  const frontFingersCurled = average([curled.index, curled.middle]);
  const frontFingerCurlFloor = Math.min(curled.index, curled.middle);
  const backFingersCurled = average([curled.ring, curled.pinky]);
  const twoFrontFingersOpen = average([extension.index, extension.middle]);
  const twoFrontFingerAgreement = clamp((Math.min(extension.index, extension.middle) - 0.42) / 0.38, 0, 1);
  const backFingerCurlGate = clamp((backFingersCurled - 0.38) / 0.32, 0, 1);

  const baseRockRaw = average([curled.index, curled.middle, curled.ring, curled.pinky]);
  const rockRescueActive = backFingersCurled >= 0.55
    && frontFingersCurled >= 0.42
    && frontFingerCurlFloor >= 0.22
    && softExtendedCount <= 2
    && !(strongExtendedCount >= 2 && twoFrontFingersOpen > 0.64);
  const rockRaw = rockRescueActive
    ? clamp(average([baseRockRaw, frontFingersCurled, backFingersCurled]) + 0.16, 0, 1)
    : baseRockRaw;
  const paperRaw = average([extension.index, extension.middle, extension.ring, extension.pinky]);
  const scissorsRaw = average([twoFrontFingersOpen, backFingersCurled])
    * (0.35 + 0.65 * twoFrontFingerAgreement)
    * backFingerCurlGate;
  const knownBest = Math.max(rockRaw, paperRaw, scissorsRaw);
  const shapeLooksKnown = rockRaw >= 0.64 || paperRaw >= 0.66 || scissorsRaw >= 0.66;
  const oddFingerPenalty = strongExtendedCount === 1 || strongExtendedCount === 3
    ? (shapeLooksKnown ? 0.08 : 0.52)
    : 0.04;
  const qualityPenalty = frame.quality < 0.45
    ? (shapeLooksKnown ? 0.12 : 0.28)
    : frame.quality < 0.55
      ? (shapeLooksKnown ? 0.06 : 0.16)
      : 0.03;
  const noneRaw = Math.max(
    oddFingerPenalty,
    clamp((0.52 - knownBest) / 0.52, 0.03, 0.66),
    qualityPenalty,
  );

  const rockPower = rockRescueActive
    ? Math.pow(rockRaw, 1.55) * 1.22
    : Math.pow(rockRaw, 2.65);

  const powered = {
    rock: rockPower,
    paper: Math.pow(paperRaw, 2.75) * 1.08,
    scissors: Math.pow(scissorsRaw, 1.45) * 1.45,
    none: Math.pow(noneRaw, 1.35),
  };

  const total = Object.values(powered).reduce((sum, value) => sum + value, 0) || 1;
  return Object.entries(powered)
    .map(([className, value]) => ({
      className,
      originalClassName: className,
      probability: value / total,
    }))
    .sort((a, b) => b.probability - a.probability);
}

function fixedPrediction(label, confidence) {
  return ['rock', 'paper', 'scissors', 'none']
    .map((className) => ({
      className,
      originalClassName: className,
      probability: className === label ? confidence : (1 - confidence) / 3,
    }))
    .sort((a, b) => b.probability - a.probability);
}

function emptyPredictionRows() {
  return ['rock', 'paper', 'scissors', 'none'].map((className) => ({
    className,
    originalClassName: className,
    probability: 0,
  }));
}

function handlePredictions({ predictions, frame, source }) {
  const rows = predictions.slice().sort((a, b) => b.probability - a.probability);
  const top = rows[0] || { className: 'none', probability: 0 };
  const second = rows[1] || { probability: 0 };
  const instantStable = top.probability >= CONFIDENCE_THRESHOLD
    && top.probability - second.probability >= MARGIN_THRESHOLD;

  app.stableFrames.push(instantStable ? top.className : 'uncertain');
  app.stableFrames = app.stableFrames.slice(-STABLE_WINDOW);
  const stableCount = app.stableFrames.filter((label) => label === top.className).length;
  const stable = instantStable && stableCount >= STABLE_VOTES;

  const current = {
    label: top.className,
    displayLabel: displayLabels[top.className] || top.className,
    confidence: top.probability,
    margin: top.probability - second.probability,
    stable,
    stableCount,
    source,
    quality: frame.quality,
    handDetected: frame.handDetected,
    handCount: frame.handCount,
    multipleHands: frame.multipleHands,
    features: summarizeFeatures(frame.features),
    at: new Date().toISOString(),
  };

  app.currentPrediction = current;
  app.currentFrame = frame;
  updatePredictionUi(current, rows);
  observeRoundPrediction(current);
}

function updatePredictionUi(current, predictions) {
  const confidencePercent = Math.round(current.confidence * 100);
  els.predictionLabel.textContent = current.stable
    ? current.displayLabel
    : '无法可靠判断';
  els.confidenceValue.textContent = `${confidencePercent}%`;
  updateQualityUi(current);
  updatePlayerStage(current);

  if (current.multipleHands) {
    els.teachingNote.textContent = '画面里有多只手。课堂中建议一次只伸一只手，AI 更容易看清楚。';
  } else if (!current.handDetected) {
    els.teachingNote.textContent = '没有看到手，所以输出未知。这正好可以说明 AI 只会在有限类别里判断。';
  } else if (current.stable) {
    els.teachingNote.textContent = `AI 认为当前手势最像“${current.displayLabel}”。它是根据手部关键点做出的分类。`;
  } else {
    els.teachingNote.textContent = 'AI 还在犹豫，可能是手势不清楚、离镜头太远，或动作不像石头/剪刀/布。';
  }

  renderPredictionBars(predictions);
}

function updatePlayerStage(current) {
  if (!els.playerStageTitle) {
    return;
  }

  if (current.multipleHands) {
    els.playerStageTitle.textContent = '一次只伸一只手';
    return;
  }

  if (!current.handDetected) {
    els.playerStageTitle.textContent = '把手放到镜头前';
    return;
  }

  if (current.stable && RPS_MOVES.includes(current.label)) {
    els.playerStageTitle.textContent = `我看到你出了：${current.displayLabel}`;
    return;
  }

  els.playerStageTitle.textContent = '保持一下，AI 正在看清楚';
}

function updateQualityUi(current) {
  const quality = current.quality || 0;
  els.landmarkQuality.textContent = current.handDetected
    ? `${Math.round(quality * 100)}%`
    : '未检测';
  els.stabilityValue.textContent = `${current.stableCount || 0}/${STABLE_WINDOW}`;
  els.handCountValue.textContent = String(current.handCount || 0);
}

function renderPredictionBars(predictions) {
  els.confidenceBars.innerHTML = predictions
    .map((item) => {
      const label = displayLabels[item.className] || item.originalClassName || item.className;
      const percent = Math.round((item.probability || 0) * 100);
      return `
        <div class="bar-row">
          <strong>${escapeHtml(label)}</strong>
          <span class="bar-track"><span class="bar-fill" style="width: ${percent}%"></span></span>
          <span>${percent}%</span>
        </div>
      `;
    })
    .join('');
}

async function startRound() {
  if (app.rounds.length >= TOTAL_ROUNDS) {
    showStep('report');
    return;
  }

  if (app.roundPhase === 'countdown' || app.roundPhase === 'listening') {
    setRuntimeStatus('当前回合还在进行中，请先完成这次出拳。');
    return;
  }

  if (!await ensureCameraReadyForRound()) {
    updateGameUi();
    return;
  }

  clearCountdownTimer();
  clearNextRoundTimer();
  app.roundPhase = 'countdown';
  app.countdownRemaining = COUNTDOWN_SECONDS;
  app.currentRound = {
    round: app.rounds.length + 1,
    aiMove: chooseAiMove(),
    playerMove: null,
    result: null,
    confidence: 0,
    stable: false,
    quality: 0,
    startedAt: new Date().toISOString(),
    settledAt: null,
  };

  showStep('arena');
  playSound('start');
  updateGameUi();
  setRuntimeStatus(`第 ${app.currentRound.round} 回合开始。听到提示后出拳！`);

  app.countdownTimer = window.setInterval(() => {
    app.countdownRemaining -= 1;
    if (app.countdownRemaining > 0) {
      playSound('tick');
      updateGameUi();
      return;
    }

    clearCountdownTimer();
    app.roundPhase = 'listening';
    playSound('ready');
    updateGameUi();
    setRuntimeStatus('出拳！保持一下，AI 正在看清楚。');
  }, 1000);
}

async function ensureCameraReadyForRound() {
  if (app.runtimeReady && isCameraUsable()) {
    return true;
  }

  if (!app.runtimeReady) {
    setRuntimeStatus('AI 还在准备，稍等一下。');
    await loadRuntime();
  }

  if (!app.runtimeReady) {
    setRuntimeStatus('AI 还没准备好，请点“重新加载模型”。', true);
    return false;
  }

  if (!isCameraUsable()) {
    await startCamera({ automatic: false });
  }

  if (!isCameraUsable()) {
    setRuntimeStatus('请先允许摄像头权限，看到画面后再开始本轮。', true);
    return false;
  }

  return true;
}

function observeRoundPrediction(current) {
  if (app.roundPhase !== 'listening' || !app.currentRound) {
    return;
  }

  if (!current.stable || !RPS_MOVES.includes(current.label)) {
    const now = Date.now();
    if (now - app.lastUnstableNoticeAt > 1800) {
      app.lastUnstableNoticeAt = now;
      setRuntimeStatus('把手放到舞台里，做清楚石头、剪刀或布。', true);
      playSound('miss');
    }
    updateGameUi();
    return;
  }

  settleRound(current);
}

function settleRound(current) {
  if (!app.currentRound || app.roundPhase !== 'listening') {
    return;
  }

  const round = {
    ...app.currentRound,
    playerMove: current.label,
    result: judgeRound(current.label, app.currentRound.aiMove),
    confidence: current.confidence,
    stable: current.stable,
    quality: current.quality,
    margin: current.margin,
    source: current.source,
    settledAt: new Date().toISOString(),
  };
  const snapshot = createRoundSnapshot(round, current);
  if (snapshot) {
    app.roundSnapshots.push(snapshot);
    round.snapshotId = snapshot.id;
    round.snapshotCaptured = true;
  } else {
    round.snapshotCaptured = false;
  }

  app.rounds.push(round);
  app.currentRound = null;
  app.roundPhase = 'settled';

  if (round.result === 'win') {
    app.winStreak += 1;
    app.bestStreak = Math.max(app.bestStreak, app.winStreak);
  } else {
    app.winStreak = 0;
  }

  playSound('lock');
  window.setTimeout(() => playSound(round.result), 110);
  updateGameUi();

  if (app.rounds.length >= TOTAL_ROUNDS) {
    window.setTimeout(() => playSound('finish'), 420);
    setRuntimeStatus('五回合完成！去看看你的擂台战报吧。');
    window.setTimeout(() => showStep('report'), 900);
  } else {
    setRuntimeStatus(`AI 翻牌啦！第 ${round.round} 回合结束，下一轮马上开始。`);
    app.nextRoundTimer = window.setTimeout(() => {
      app.nextRoundTimer = null;
      if (app.roundPhase === 'settled' && app.rounds.length < TOTAL_ROUNDS) {
        startRound();
      }
    }, AUTO_NEXT_ROUND_DELAY_MS);
  }
}

function resetGame({ silent = false } = {}) {
  clearCountdownTimer();
  clearNextRoundTimer();
  app.rounds = [];
  app.currentRound = null;
  app.roundPhase = 'idle';
  app.countdownRemaining = COUNTDOWN_SECONDS;
  app.winStreak = 0;
  app.bestStreak = 0;
  app.lastUnstableNoticeAt = 0;
  app.roundSnapshots = [];
  app.sampleArtifacts = [];
  app.submitted = false;
  if (els.submitStatus) {
    els.submitStatus.textContent = '';
    els.submitStatus.classList.remove('is-error');
  }
  updateGameUi();
  showStep('arena');
  if (!silent) {
    setRuntimeStatus('练习册擂台重新准备好了，从第一回合开始吧。');
  }
}

function clearCountdownTimer() {
  if (app.countdownTimer) {
    window.clearInterval(app.countdownTimer);
    app.countdownTimer = null;
  }
}

function clearNextRoundTimer() {
  if (app.nextRoundTimer) {
    window.clearTimeout(app.nextRoundTimer);
    app.nextRoundTimer = null;
  }
}

function chooseAiMove() {
  return RPS_MOVES[Math.floor(Math.random() * RPS_MOVES.length)];
}

function judgeRound(playerMove, aiMove) {
  if (playerMove === aiMove) return 'draw';
  if (
    (playerMove === 'rock' && aiMove === 'scissors')
    || (playerMove === 'scissors' && aiMove === 'paper')
    || (playerMove === 'paper' && aiMove === 'rock')
  ) {
    return 'win';
  }
  return 'loss';
}

function updateGameUi() {
  const stats = getGameStats();
  const nextRound = Math.min(app.rounds.length + 1, TOTAL_ROUNDS);
  const latestRound = app.rounds[app.rounds.length - 1] || null;
  const activeRound = app.currentRound;
  const displayRound = activeRound || latestRound;
  const isPlaying = app.roundPhase === 'countdown' || app.roundPhase === 'listening';
  const isComplete = app.rounds.length >= TOTAL_ROUNDS;
  const isAutoAdvancing = app.roundPhase === 'settled' && !isComplete;

  els.arenaTitle.textContent = isComplete
    ? '五回合完成'
    : `第 ${nextRound} / ${TOTAL_ROUNDS} 回合`;
  els.studentScoreValue.textContent = String(stats.studentWins);
  els.drawScoreValue.textContent = String(stats.draws);
  els.aiScoreValue.textContent = String(stats.aiWins);
  els.soundButton.textContent = app.soundMuted ? '音效关' : '音效开';

  updateMoveCards(displayRound);
  updateRoundPhaseText(isComplete);
  renderRoundLog();
  renderReport();
  updateTeacherPanel();

  els.startRoundButton.disabled = isPlaying || isAutoAdvancing;
  els.startRoundButton.textContent = isComplete
    ? '看战报'
    : isAutoAdvancing
      ? '下一轮马上开始'
      : !isCameraUsable()
        ? '打开摄像头'
        : app.rounds.length === 0
          ? '开始本轮'
          : '开始下一轮';
}

function updateMoveCards(round) {
  const current = app.currentPrediction;
  const latest = app.rounds[app.rounds.length - 1] || null;
  const canRevealAi = app.roundPhase === 'settled' || app.rounds.length >= TOTAL_ROUNDS || (latest && round === latest);
  const aiMove = canRevealAi && round?.aiMove ? round.aiMove : null;
  const playerMove = round?.playerMove || (app.roundPhase === 'listening' && current?.stable ? current.label : null);

  els.aiMoveText.textContent = aiMove ? displayLabels[aiMove] : '藏好了';
  els.aiMoveIcon.textContent = aiMove ? moveMarks[aiMove] : '?';
  els.playerMoveText.textContent = playerMove && RPS_MOVES.includes(playerMove)
    ? displayLabels[playerMove]
    : app.roundPhase === 'listening'
      ? 'AI 在看'
      : '准备出拳';
  els.playerMoveIcon.textContent = playerMove && RPS_MOVES.includes(playerMove)
    ? moveMarks[playerMove]
    : '?';

  const result = round?.result || null;
  els.roundResultBanner.className = `result-cloud ${result ? `is-${result}` : ''}`.trim();
  els.roundResultBanner.textContent = getRoundBannerText(round);
  updateAiMood(result);
}

function updateAiMood(result) {
  if (!els.aiMoodText) {
    return;
  }

  if (result === 'win') {
    els.aiMoodText.textContent = '哇，你赢啦！';
    return;
  }

  if (result === 'loss') {
    els.aiMoodText.textContent = '这局我赢！';
    return;
  }

  if (result === 'draw') {
    els.aiMoodText.textContent = '我们平手！';
    return;
  }

  if (app.roundPhase === 'countdown') {
    els.aiMoodText.textContent = '我已经藏好牌啦';
    return;
  }

  if (app.roundPhase === 'listening') {
    els.aiMoodText.textContent = '让我看清楚';
    return;
  }

  if (app.rounds.length >= TOTAL_ROUNDS) {
    els.aiMoodText.textContent = '去看战报吧';
    return;
  }

  els.aiMoodText.textContent = '准备好了吗？';
}

function updateRoundPhaseText(isComplete) {
  if (isComplete) {
    els.countdownValue.textContent = '完成';
    els.roundPhaseText.textContent = '看战报';
    return;
  }

  if (app.roundPhase === 'countdown') {
    els.countdownValue.textContent = String(app.countdownRemaining);
    els.roundPhaseText.textContent = '准备出拳';
    return;
  }

  if (app.roundPhase === 'listening') {
    els.countdownValue.textContent = '出拳';
    els.roundPhaseText.textContent = '保持一下';
    return;
  }

  if (app.roundPhase === 'settled') {
    els.countdownValue.textContent = '翻牌';
    els.roundPhaseText.textContent = '马上开始';
    return;
  }

  els.countdownValue.textContent = '准备';
  els.roundPhaseText.textContent = '点击开始本轮';
}

function getRoundBannerText(round) {
  if (!round) {
    return '点“开始本轮”，AI 会先藏好一张牌。';
  }
  if (!round.result) {
    return app.roundPhase === 'countdown'
      ? 'AI 已经藏好牌，倒计时结束就出拳。'
      : '保持石头、剪刀或布，AI 看清楚后自动翻牌。';
  }

  const matchup = `你出${displayLabels[round.playerMove]}，AI 出${displayLabels[round.aiMove]}`;
  if (round.result === 'win') return `${matchup}，你赢啦！`;
  if (round.result === 'loss') return `${matchup}，AI 赢了这一轮。`;
  return `${matchup}，平手！`;
}

function renderRoundLog() {
  if (!app.rounds.length) {
    els.roundLog.innerHTML = '<li class="empty-log">还没有回合记录。</li>';
    return;
  }

  els.roundLog.innerHTML = app.rounds
    .map((round) => `
      <li class="round-log-item is-${round.result}">
        <span>第 ${round.round} 回合</span>
        <strong>${getResultLabel(round.result)}</strong>
        <small>我 ${displayLabels[round.playerMove]} · AI ${displayLabels[round.aiMove]}</small>
      </li>
    `)
    .join('');
}

function renderReport() {
  const stats = getGameStats();
  const stableRounds = app.rounds.filter((round) => round.stable && RPS_MOVES.includes(round.playerMove)).length;
  els.reportRecord.textContent = `${app.rounds.length} / ${TOTAL_ROUNDS}`;
  els.reportBestStreak.textContent = String(app.bestStreak);
  els.reportStableRounds.textContent = String(stableRounds);
  renderRoundSnapshots();

  if (app.rounds.length < TOTAL_ROUNDS) {
    els.reportInsight.textContent = '完成五回合后，这里会出现你的擂台战报。';
    return;
  }

  els.reportInsight.textContent = `你赢了 ${stats.studentWins} 局，AI 赢了 ${stats.aiWins} 局，平局 ${stats.draws} 局。AI 是按石头、剪刀、布来分类；看不清或没见过的动作，它就会犹豫。`;
}

function renderRoundSnapshots() {
  if (!els.roundSnapshotGrid) {
    return;
  }

  if (!app.rounds.length) {
    els.roundSnapshotGrid.innerHTML = '<article class="round-snapshot-card"><div class="snapshot-preview"><span>完成回合后会出现照片</span></div><div class="snapshot-caption"><strong>还没有出拳照片</strong><small>AI 看清楚后自动保存一瞬间</small></div></article>';
    return;
  }

  els.roundSnapshotGrid.innerHTML = app.rounds
    .map((round) => {
      const snapshot = getRoundSnapshot(round);
      const preview = snapshot?.dataUrl
        ? `<img src="${snapshot.dataUrl}" alt="第 ${round.round} 回合出拳照片" />`
        : `<span>${escapeHtml(moveMarks[round.playerMove] || '?')}</span>`;
      const uploadText = getSnapshotUploadText(snapshot);
      return `
        <article class="round-snapshot-card">
          <div class="snapshot-preview">${preview}</div>
          <div class="snapshot-caption">
            <strong>第 ${round.round} 回合：${escapeHtml(displayLabels[round.playerMove])}</strong>
            <small>AI ${escapeHtml(displayLabels[round.aiMove])} · ${escapeHtml(getResultLabel(round.result))}</small>
            <small class="snapshot-upload-note">${escapeHtml(uploadText)}</small>
          </div>
        </article>
      `;
    })
    .join('');
}

function getRoundSnapshot(round) {
  if (!round) {
    return null;
  }
  return app.roundSnapshots.find((snapshot) => snapshot.id === round.snapshotId)
    || app.roundSnapshots.find((snapshot) => snapshot.round === round.round)
    || null;
}

function getSnapshotUploadText(snapshot) {
  if (!snapshot) {
    return '没有抓到照片';
  }
  if (app.demoMode) {
    return '演示中本地展示';
  }
  if (snapshot.uploaded) {
    return '已给老师展示';
  }
  if (snapshot.uploadError) {
    return '图片上传失败';
  }
  return '提交时上传';
}

function getGameStats() {
  return app.rounds.reduce((stats, round) => {
    if (round.result === 'win') stats.studentWins += 1;
    if (round.result === 'loss') stats.aiWins += 1;
    if (round.result === 'draw') stats.draws += 1;
    return stats;
  }, { studentWins: 0, aiWins: 0, draws: 0 });
}

function getResultLabel(result) {
  if (result === 'win') return '我赢';
  if (result === 'loss') return 'AI 胜';
  return '平局';
}

function toggleTeacherPanel() {
  app.teacherPanelOpen = !app.teacherPanelOpen;
  updateTeacherPanel();
}

function updateTeacherPanel() {
  if (!els.teacherPanel || !els.teacherToggleButton) {
    return;
  }

  els.teacherPanel.classList.toggle('is-collapsed', !app.teacherPanelOpen);
  els.teacherToggleButton.textContent = app.teacherPanelOpen ? '收起老师查看' : '老师查看';
  els.teacherToggleButton.setAttribute('aria-expanded', String(app.teacherPanelOpen));
}

function toggleSound() {
  app.soundMuted = !app.soundMuted;
  if (app.soundMuted && app.audioContext?.state === 'running') {
    app.audioContext.suspend().catch(() => {});
  }
  updateGameUi();
}

function playSound(type) {
  if (app.soundMuted || (!window.AudioContext && !window.webkitAudioContext)) {
    return;
  }

  const context = getAudioContext();
  if (!context) {
    return;
  }

  const patterns = {
    start: [
      { frequency: 360, duration: 0.06 },
      { frequency: 460, duration: 0.07 },
    ],
    tick: [
      { frequency: 540, duration: 0.055 },
    ],
    ready: [
      { frequency: 620, duration: 0.06 },
      { frequency: 760, duration: 0.08 },
    ],
    lock: [
      { frequency: 780, duration: 0.045 },
      { frequency: 980, duration: 0.06 },
    ],
    win: [
      { frequency: 520, duration: 0.07 },
      { frequency: 660, duration: 0.08 },
      { frequency: 820, duration: 0.1 },
    ],
    loss: [
      { frequency: 330, duration: 0.08 },
      { frequency: 260, duration: 0.1 },
    ],
    draw: [
      { frequency: 430, duration: 0.06 },
      { frequency: 430, duration: 0.06 },
    ],
    miss: [
      { frequency: 180, duration: 0.055 },
    ],
    finish: [
      { frequency: 520, duration: 0.06 },
      { frequency: 680, duration: 0.06 },
      { frequency: 840, duration: 0.08 },
      { frequency: 1040, duration: 0.11 },
    ],
  };
  const tones = patterns[type] || [420];
  tones.forEach((tone, index) => {
    const frequency = typeof tone === 'number' ? tone : tone.frequency;
    const duration = typeof tone === 'number' ? 0.075 : tone.duration;
    scheduleTone(context, frequency, index * 0.085, duration);
  });
}

function getAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return null;
  }
  if (!app.audioContext) {
    app.audioContext = new AudioContextClass();
  }
  if (app.audioContext.state === 'suspended') {
    app.audioContext.resume().catch(() => {});
  }
  return app.audioContext;
}

function scheduleTone(context, frequency, delay, duration) {
  const startAt = context.currentTime + delay;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.045, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.02);
}

async function captureTrainingSample() {
  if (!app.video || !app.cameraReady || app.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    setSampleStatus('请先开启摄像头并完成一次识别。', true);
    return;
  }

  const trueLabel = els.sampleLabel.value;
  const sample = createSampleImage();
  const current = app.currentPrediction || {};
  const metadata = {
    scene: 'rps-training-sample',
    trueLabel,
    trueLabelDisplay: displayLabels[trueLabel],
    predicted: current.label || null,
    predictedDisplay: current.displayLabel || null,
    confidence: round(current.confidence || 0, 4),
    stable: Boolean(current.stable),
    handDetected: Boolean(current.handDetected),
    handCount: current.handCount || 0,
    keypointQuality: round(current.quality || 0, 4),
    margin: round(current.margin || 0, 4),
    features: current.features || null,
    gamePhase: app.roundPhase,
    currentRound: app.currentRound?.round || null,
    completedRounds: app.rounds.length,
    modelVersion: app.classifier?.version || 'unknown',
    timestamp: new Date().toISOString(),
  };

  if (app.demoMode) {
    app.sampleArtifacts.push({
      kind: 'rps-training-sample',
      title: `训练样本：${displayLabels[trueLabel]}`,
      url: null,
      mimeType: sample.mimeType,
      metadata,
      demo: true,
    });
    setSampleStatus(`演示模式：已记录“${displayLabels[trueLabel]}”样本摘要，不会上传到底座。`);
    updateSummaryPreview();
    return;
  }

  try {
    setSampleStatus('正在上传训练样本。');
    const artifact = await platformPost('/course-runtime/launch/artifacts', {
      launchToken: app.launchToken,
      fileName: `rps-${trueLabel}-${Date.now()}.jpg`,
      mimeType: sample.mimeType,
      kind: 'rps-training-sample',
      contentBase64: sample.contentBase64,
      metadata,
    });
    app.sampleArtifacts.push({
      kind: artifact.kind || 'rps-training-sample',
      title: `训练样本：${displayLabels[trueLabel]}`,
      url: artifact.url,
      mimeType: artifact.mimeType || sample.mimeType,
      metadata,
    });
    setSampleStatus(`已上传“${displayLabels[trueLabel]}”训练样本。`);
    updateSummaryPreview();
  } catch (error) {
    setSampleStatus(`训练样本上传失败：${getErrorMessage(error)}`, true);
  }
}

function createRoundSnapshot(roundItem, current) {
  if (!app.video || !app.cameraReady || app.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    return null;
  }

  try {
    const image = createSampleImage({
      maxEdge: ROUND_SNAPSHOT_EDGE,
      quality: ROUND_SNAPSHOT_QUALITY,
      includeDataUrl: true,
    });
    return {
      id: `round-${roundItem.round}-${Date.now()}`,
      round: roundItem.round,
      playerMove: roundItem.playerMove,
      playerMoveDisplay: displayLabels[roundItem.playerMove],
      aiMove: roundItem.aiMove,
      aiMoveDisplay: displayLabels[roundItem.aiMove],
      result: roundItem.result,
      resultDisplay: getResultLabel(roundItem.result),
      confidence: round(current.confidence || 0, 4),
      stable: Boolean(current.stable),
      quality: round(current.quality || 0, 4),
      margin: round(current.margin || 0, 4),
      mimeType: image.mimeType,
      contentBase64: image.contentBase64,
      dataUrl: image.dataUrl,
      capturedAt: new Date().toISOString(),
      uploaded: false,
      url: null,
      artifactId: null,
      uploadError: null,
    };
  } catch {
    return null;
  }
}

function createSampleImage(options = {}) {
  const maxEdge = options.maxEdge || MAX_SAMPLE_EDGE;
  const quality = typeof options.quality === 'number' ? options.quality : 0.82;
  const sourceWidth = app.video.videoWidth || 640;
  const sourceHeight = app.video.videoHeight || 480;
  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.translate(width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(app.video, 0, 0, width, height);
  ctx.restore();
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return {
    mimeType: 'image/jpeg',
    contentBase64: dataUrl.split(',')[1],
    dataUrl: options.includeDataUrl ? dataUrl : undefined,
  };
}

function showStep(step) {
  document.querySelectorAll('[data-step-tab]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.stepTab === step);
  });

  document.querySelectorAll('[data-step-panel]').forEach((panel) => {
    panel.classList.toggle('is-hidden', step === 'arena' || panel.dataset.stepPanel !== step);
  });

  els.workspace?.classList.toggle('has-modal', step !== 'arena');

  if (step === 'report') {
    renderReport();
  }

  if (step === 'submit') {
    updateSummaryPreview();
  }
}

function updateSummaryPreview() {
  renderReport();
}

async function uploadRoundSnapshots() {
  if (app.demoMode) {
    return { uploaded: 0, failed: 0 };
  }

  const pending = app.roundSnapshots.filter((snapshot) => (
    snapshot.contentBase64
    && !snapshot.uploaded
  ));

  let uploaded = 0;
  let failed = 0;

  for (const snapshot of pending) {
    try {
      const artifact = await platformPost('/course-runtime/launch/artifacts', {
        launchToken: app.launchToken,
        fileName: `rps-round-${snapshot.round}-${snapshot.playerMove}.jpg`,
        mimeType: snapshot.mimeType,
        kind: 'rps-round-snapshot',
        contentBase64: snapshot.contentBase64,
        metadata: snapshotMetadata(snapshot),
      });
      snapshot.uploaded = true;
      snapshot.uploadError = null;
      snapshot.url = artifact.url || null;
      snapshot.artifactId = artifact.id || null;
      snapshot.kind = artifact.kind || 'rps-round-snapshot';
      snapshot.mimeType = artifact.mimeType || snapshot.mimeType;
      uploaded += 1;
    } catch (error) {
      snapshot.uploaded = false;
      snapshot.uploadError = getErrorMessage(error);
      failed += 1;
    }
  }

  renderReport();
  return { uploaded, failed };
}

function snapshotMetadata(snapshot) {
  return {
    scene: 'rps-round-snapshot',
    round: snapshot.round,
    playerMove: snapshot.playerMove,
    playerMoveDisplay: snapshot.playerMoveDisplay,
    aiMove: snapshot.aiMove,
    aiMoveDisplay: snapshot.aiMoveDisplay,
    result: snapshot.result,
    resultDisplay: snapshot.resultDisplay,
    confidence: snapshot.confidence,
    stable: snapshot.stable,
    keypointQuality: snapshot.quality,
    margin: snapshot.margin,
    modelVersion: app.classifier?.version || 'unknown',
    capturedAt: snapshot.capturedAt,
  };
}

function computeScore() {
  const completedScore = app.rounds.length >= TOTAL_ROUNDS ? 60 : app.rounds.length * 12;
  const stableRounds = app.rounds.filter((round) => round.stable && RPS_MOVES.includes(round.playerMove)).length;
  const stableScore = Math.min(30, stableRounds * 6);
  const sampleScore = app.sampleArtifacts.length > 0 ? 10 : 0;
  return Math.min(100, completedScore + stableScore + sampleScore);
}

function buildSummary() {
  const durationSeconds = Math.max(1, Math.round((Date.now() - app.startedAt) / 1000));
  const score = computeScore();
  const stats = getGameStats();
  const stableRounds = app.rounds.filter((round) => round.stable && RPS_MOVES.includes(round.playerMove)).length;
  const capturedSnapshots = app.roundSnapshots.length;
  const uploadedSnapshots = app.roundSnapshots.filter((snapshot) => snapshot.uploaded).length;
  return {
    displayTitle: 'AI 猜拳擂台',
    brief: '完成 AI 猜拳擂台，并理解判别式 AI 的分类边界',
    scoreText: `${score} 分`,
    resultItems: [
      { label: '打了几局', value: `${app.rounds.length}/${TOTAL_ROUNDS}` },
      { label: '我赢了几局', value: `${stats.studentWins}` },
      { label: 'AI 赢了几局', value: `${stats.aiWins}` },
      { label: '平局', value: `${stats.draws}` },
      { label: '最强连胜', value: `${app.bestStreak}` },
      { label: 'AI 看清楚', value: `${stableRounds}` },
      { label: '展示图片', value: `${capturedSnapshots} 张` },
      { label: '训练样本', value: `${app.sampleArtifacts.length} 个` },
      { label: '用时', value: `${durationSeconds} 秒` },
    ],
    rounds: app.rounds.map(serializeRound),
    gameStats: {
      totalRounds: TOTAL_ROUNDS,
      completedRounds: app.rounds.length,
      studentWins: stats.studentWins,
      aiWins: stats.aiWins,
      draws: stats.draws,
      bestStreak: app.bestStreak,
      stableRounds,
      capturedSnapshots,
      uploadedSnapshots,
    },
    answers: null,
    artifacts: [
      ...app.roundSnapshots.map(snapshotArtifactSummary),
      ...app.sampleArtifacts.map(sampleArtifactSummary),
    ],
    processSummary: `学生完成 ${app.rounds.length}/${TOTAL_ROUNDS} 回合 AI 猜拳擂台，战绩为学生 ${stats.studentWins} 胜、AI ${stats.aiWins} 胜、平局 ${stats.draws} 次，最佳连胜 ${app.bestStreak}，展示图片 ${capturedSnapshots} 张，确认上传训练样本 ${app.sampleArtifacts.length} 个。`,
    predictions: {
      latest: app.currentPrediction ? serializeResult(app.currentPrediction) : null,
      classifierVersion: app.classifier?.version || null,
    },
  };
}

function snapshotArtifactSummary(snapshot) {
  return {
    kind: snapshot.kind || 'rps-round-snapshot',
    title: `第 ${snapshot.round} 回合出拳照片：${snapshot.playerMoveDisplay}`,
    url: snapshot.url,
    mimeType: snapshot.mimeType,
    metadata: snapshotMetadata(snapshot),
    uploaded: Boolean(snapshot.uploaded),
    uploadError: snapshot.uploadError || null,
  };
}

function sampleArtifactSummary(artifact) {
  return {
    kind: artifact.kind,
    title: artifact.title,
    url: artifact.url,
    mimeType: artifact.mimeType,
    metadata: artifact.metadata,
  };
}

function serializeRound(item) {
  const snapshot = getRoundSnapshot(item);
  return {
    round: item.round,
    aiMove: item.aiMove,
    aiMoveDisplay: displayLabels[item.aiMove],
    playerMove: item.playerMove,
    playerMoveDisplay: displayLabels[item.playerMove],
    result: item.result,
    resultDisplay: getResultLabel(item.result),
    confidence: round(item.confidence || 0, 4),
    stable: Boolean(item.stable),
    quality: round(item.quality || 0, 4),
    margin: round(item.margin || 0, 4),
    source: item.source || 'mediapipe',
    startedAt: item.startedAt || null,
    settledAt: item.settledAt || null,
    snapshotCaptured: Boolean(snapshot),
    snapshotArtifactUrl: snapshot?.url || null,
    snapshotUploaded: Boolean(snapshot?.uploaded),
    snapshotUploadError: snapshot?.uploadError || null,
  };
}

function serializeResult(result) {
  return {
    predicted: result.predicted || result.label || null,
    confidence: round(result.confidence || 0, 4),
    stable: Boolean(result.stable),
    quality: round(result.quality || 0, 4),
    passed: typeof result.passed === 'boolean' ? result.passed : undefined,
    source: result.source || 'mediapipe',
    at: result.at || null,
  };
}

async function submitRecord() {
  if (app.submitted) {
    return true;
  }

  const score = computeScore();
  const durationSeconds = Math.max(1, Math.round((Date.now() - app.startedAt) / 1000));

  if (app.demoMode) {
    buildSummary();
    app.submitted = true;
    els.submitStatus.textContent = '本地演示模式：已生成提交数据，但未写入业务底座。';
    els.submitStatus.classList.remove('is-error');
    return true;
  }

  try {
    els.submitStatus.textContent = '正在上传本轮出拳照片。';
    els.submitStatus.classList.remove('is-error');
    const snapshotUpload = await uploadRoundSnapshots();
    els.submitStatus.textContent = snapshotUpload.failed > 0
      ? '部分展示图片上传失败，正在提交成绩。'
      : '展示图片已准备好，正在提交成绩。';
    const summary = buildSummary();
    await platformPost('/course-runtime/launch/records', {
      launchToken: app.launchToken,
      status: 'COMPLETED',
      score,
      durationSeconds,
      summary,
    });
    app.submitted = true;
    els.submitStatus.textContent = snapshotUpload.failed > 0
      ? '已提交成绩；部分展示图片上传失败，老师仍可看到战报。'
      : '已提交，老师可以在后台查看战报和出拳照片。';
    return true;
  } catch (error) {
    els.submitStatus.textContent = `提交失败：${getErrorMessage(error)}`;
    els.submitStatus.classList.add('is-error');
    return false;
  }
}

async function submitAndBackToPortal() {
  if (!els.finishBackButton) {
    return;
  }

  const originalText = els.finishBackButton.textContent;
  els.finishBackButton.disabled = true;
  els.finishBackButton.textContent = app.submitted ? '正在返回' : '正在记录';
  const submitted = await submitRecord();

  if (submitted) {
    els.finishBackButton.textContent = '正在返回';
    backToStudentPortal();
    return;
  }

  els.finishBackButton.disabled = false;
  els.finishBackButton.textContent = originalText || '回到学生后台';
}

function setRuntimeStatus(message, isError = false) {
  els.runtimeStatus.textContent = message;
  els.runtimeStatus.classList.toggle('is-error', isError);
}

function setSampleStatus(message, isError = false) {
  els.sampleStatus.textContent = message;
  els.sampleStatus.classList.toggle('is-error', isError);
}

function platformPost(path, body) {
  requireLaunchContext();
  return fetch(`${app.platformApiBase}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || '底座接口请求失败');
    }
    return data;
  });
}

function requireLaunchContext() {
  if (!app.launchToken || !app.platformApiBase) {
    throw new Error('请从学生后台进入课件');
  }
}

function backToStudentPortal() {
  stopPredictionLoop();
  stopCameraStream();
  if (app.returnUrl) {
    window.location.href = app.returnUrl;
    return;
  }
  window.history.back();
}

function drawLandmarks(landmarks) {
  if (!app.overlay || !app.video) {
    return;
  }
  const width = app.video.videoWidth || 640;
  const height = app.video.videoHeight || 480;
  if (app.overlay.width !== width || app.overlay.height !== height) {
    app.overlay.width = width;
    app.overlay.height = height;
  }
  const ctx = app.overlay.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = Math.max(3, width / 260);
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#f0b24f';
  ctx.fillStyle = '#ffffff';

  handConnections.forEach(([from, to]) => {
    const a = landmarks[from];
    const b = landmarks[to];
    ctx.beginPath();
    ctx.moveTo((1 - a.x) * width, a.y * height);
    ctx.lineTo((1 - b.x) * width, b.y * height);
    ctx.stroke();
  });

  landmarks.forEach((point) => {
    ctx.beginPath();
    ctx.arc((1 - point.x) * width, point.y * height, Math.max(4, width / 180), 0, Math.PI * 2);
    ctx.fill();
  });
}

function clearOverlay() {
  if (!app.overlay) {
    return;
  }
  const ctx = app.overlay.getContext('2d');
  ctx.clearRect(0, 0, app.overlay.width, app.overlay.height);
}

function getBoundingBox(landmarks) {
  const xs = landmarks.map((point) => point.x);
  const ys = landmarks.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

function summarizeFeatures(features) {
  if (!features) {
    return null;
  }
  return {
    extension: Object.fromEntries(Object.entries(features.extension).map(([key, value]) => [key, round(value, 3)])),
    palmWidth: round(features.palmWidth, 4),
    palmLength: round(features.palmLength, 4),
    boundingBox: {
      width: round(features.boundingBox.width, 4),
      height: round(features.boundingBox.height, 4),
    },
  };
}

function distance2d(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distance3d(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
}

function angleDegrees(a, b, c) {
  const ab = { x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) };
  const cb = { x: c.x - b.x, y: c.y - b.y, z: (c.z || 0) - (b.z || 0) };
  const dot = ab.x * cb.x + ab.y * cb.y + ab.z * cb.z;
  const abLength = Math.hypot(ab.x, ab.y, ab.z) || 1;
  const cbLength = Math.hypot(cb.x, cb.y, cb.z) || 1;
  return Math.acos(clamp(dot / (abLength * cbLength), -1, 1)) * 180 / Math.PI;
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function getErrorMessage(error) {
  return error?.message || String(error);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
