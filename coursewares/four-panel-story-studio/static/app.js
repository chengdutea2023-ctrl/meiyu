const params = new URLSearchParams(window.location.search);
const localBaseUrl = new URL('./', document.currentScript?.src || window.location.href);

const app = {
  launchToken: params.get('launchToken') || '',
  platformApiBase: (params.get('platformApiBase') || '').replace(/\/+$/, ''),
  returnUrl: params.get('returnUrl') || '',
  demoMode: params.get('demo') === '1',
  sampleMode: false,
  platformVerified: false,
  startedAt: Date.now(),
  recorder: null,
  recordStream: null,
  recordChunks: [],
  recordStartedAt: 0,
  recordTimerHandle: null,
  audioId: '',
  audioUrl: '',
  audioMimeType: 'audio/mpeg',
  transcript: '',
  story: null,
  comics: [],
  selectedComic: null,
  video: null,
  projector: null,
  bgmMood: 'soft',
  submitted: false,
};

const els = {
  launchNotice: document.querySelector('#launchNotice'),
  topBackButton: document.querySelector('#topBackButton'),
  finishBackButton: document.querySelector('#finishBackButton'),
  recordPanel: document.querySelector('#recordPanel'),
  comicPanel: document.querySelector('#comicPanel'),
  videoPanel: document.querySelector('#videoPanel'),
  steps: Array.from(document.querySelectorAll('.step')),
  recordStage: document.querySelector('.record-stage'),
  recordButton: document.querySelector('#recordButton'),
  sampleButton: document.querySelector('#sampleButton'),
  recordTimer: document.querySelector('#recordTimer'),
  recordStatus: document.querySelector('#recordStatus'),
  recordProgress: document.querySelector('#recordProgress'),
  transcriptInput: document.querySelector('#transcriptInput'),
  storyButton: document.querySelector('#storyButton'),
  storyBrief: document.querySelector('#storyBrief'),
  keywordList: document.querySelector('#keywordList'),
  regenerateButton: document.querySelector('#regenerateButton'),
  candidateGrid: document.querySelector('#candidateGrid'),
  comicProgress: document.querySelector('#comicProgress'),
  chooseComicButton: document.querySelector('#chooseComicButton'),
  backToRecordButton: document.querySelector('#backToRecordButton'),
  comicStatus: document.querySelector('#comicStatus'),
  videoPlayer: document.querySelector('#videoPlayer'),
  videoPlaceholder: document.querySelector('#videoPlaceholder'),
  videoProgress: document.querySelector('#videoProgress'),
  renderButton: document.querySelector('#renderButton'),
  projectorButton: document.querySelector('#projectorButton'),
  submitButton: document.querySelector('#submitButton'),
  videoBackButton: document.querySelector('#videoBackButton'),
  bgmOptions: Array.from(document.querySelectorAll('input[name="bgmMood"]')),
  submitStatus: document.querySelector('#submitStatus'),
};

const progressStates = {};

const taskStages = {
  asr: [
    { label: '保存录音', target: 18, durationMs: 700 },
    { label: '上传声音', target: 38, durationMs: 1200 },
    { label: 'AI 听写', target: 78, durationMs: 9000 },
    { label: '整理文字', target: 92, durationMs: 5000 },
  ],
  comics: [
    { label: '整理故事', target: 14, durationMs: 1800 },
    { label: '准备画面', target: 28, durationMs: 1800 },
    { label: '同时绘制 4 套漫画', target: 92, durationMs: 90000 },
  ],
  video: [
    { label: '准备画面', target: 20, durationMs: 1200 },
    { label: '加入原声', target: 44, durationMs: 2400 },
    { label: '混入配乐', target: 68, durationMs: 2800 },
    { label: '合成视频', target: 92, durationMs: 8000 },
  ],
};

init();

function init() {
  bindEvents();
  const hasLaunchContext = Boolean(app.launchToken && app.platformApiBase);
  if (app.demoMode) {
    showLaunchNotice('本地演示模式', '当前作品只在本机预览，不会回传成绩或写入学生后台。', 'demo');
  } else if (!hasLaunchContext) {
    els.launchNotice.hidden = false;
    els.recordButton.disabled = true;
    els.storyButton.disabled = true;
    setStatus(els.recordStatus, '当前链接缺少 launchToken 或 platformApiBase，请从学生后台进入课件。', true);
  }
  if (hasLaunchContext && !app.demoMode) {
    verifyLaunch();
  }
  updateStep('record');
  updateTranscriptState();
}

function bindEvents() {
  els.topBackButton.addEventListener('click', backToStudentPortal);
  els.finishBackButton.addEventListener('click', submitAndBack);
  els.recordButton.addEventListener('click', toggleRecording);
  els.sampleButton?.addEventListener('click', useSampleStory);
  els.transcriptInput.addEventListener('input', updateTranscriptState);
  els.storyButton.addEventListener('click', generateStoryAndComics);
  els.regenerateButton.addEventListener('click', generateStoryAndComics);
  els.backToRecordButton.addEventListener('click', () => showScreen('record'));
  els.chooseComicButton.addEventListener('click', chooseComic);
  els.renderButton.addEventListener('click', renderVideo);
  els.projectorButton.addEventListener('click', openProjector);
  els.submitButton.addEventListener('click', submitRecord);
  els.videoBackButton.addEventListener('click', () => showScreen('comic'));
  els.bgmOptions.forEach((option) => {
    option.addEventListener('change', () => {
      app.bgmMood = selectedBgmMood();
      if (app.selectedComic && !app.video) {
        setStatus(els.submitStatus, `已选 ${bgmMoodLabel(app.bgmMood)}`);
      }
    });
  });
}

async function verifyLaunch() {
  try {
    await platformPost('/course-runtime/launch/verify', { launchToken: app.launchToken });
    app.platformVerified = true;
  } catch (error) {
    showLaunchNotice('请从学生后台进入课件', '启动校验失败，无法确认学生身份和任务。');
    setStatus(els.recordStatus, `启动校验失败：${getErrorMessage(error)}`, true);
  }
}

async function toggleRecording() {
  if (app.recorder && app.recorder.state === 'recording') {
    stopRecording();
    return;
  }
  await startRecording();
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    setStatus(els.recordStatus, '当前浏览器不支持录音，请换 Chrome 浏览器。', true);
    return;
  }

  try {
    app.sampleMode = false;
    app.recordStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = pickRecorderMimeType();
    app.recorder = new MediaRecorder(app.recordStream, mimeType ? { mimeType } : undefined);
    app.recordChunks = [];
    app.recorder.addEventListener('dataavailable', (event) => {
      if (event.data?.size) app.recordChunks.push(event.data);
    });
    app.recorder.addEventListener('stop', finishRecording);
    app.recordStartedAt = Date.now();
    app.recorder.start();
    els.recordStage.classList.add('is-recording');
    els.recordButton.textContent = '停止录音';
    setStatus(els.recordStatus, '录音中');
    app.recordTimerHandle = window.setInterval(updateRecordTimer, 250);
    window.setTimeout(() => {
      if (app.recorder?.state === 'recording') stopRecording();
    }, 30000);
  } catch (error) {
    setStatus(els.recordStatus, `无法开始录音：${getErrorMessage(error)}`, true);
  }
}

function stopRecording() {
  if (app.recorder?.state === 'recording') {
    app.recorder.stop();
  }
}

async function finishRecording() {
  clearInterval(app.recordTimerHandle);
  app.recordTimerHandle = null;
  els.recordStage.classList.remove('is-recording');
  els.recordButton.textContent = '重新录音';
  stopRecordStream();
  updateRecordTimer();

  try {
    const blob = new Blob(app.recordChunks, { type: app.recorder?.mimeType || 'audio/webm' });
    if (blob.size < 128) throw new Error('没有录到声音，请再试一次。');
    els.recordButton.disabled = true;
    if (els.sampleButton) els.sampleButton.disabled = true;
    startTaskProgress('asr');
    setStatus(els.recordStatus, '保存录音');
    updateTaskProgress('asr', 0);
    updateTaskProgress('asr', 1);
    const upload = await uploadAudioBlob(blob);
    app.audioId = upload.audioId;
    app.audioUrl = upload.audioUrl;
    app.audioMimeType = upload.mimeType || 'audio/mpeg';

    setStatus(els.recordStatus, '识别中');
    updateTaskProgress('asr', 2);
    const asr = await apiPost('/api/asr/transcribe', { audioId: app.audioId, demo: app.sampleMode });
    updateTaskProgress('asr', 3);
    app.transcript = asr.text || '';
    els.transcriptInput.value = app.transcript;
    finishTaskProgress('asr');
    setStatus(els.recordStatus, '已识别');
    updateTranscriptState();
  } catch (error) {
    failTaskProgress('asr', '处理失败');
    setStatus(els.recordStatus, `录音处理失败：${getErrorMessage(error)}`, true);
  } finally {
    els.recordButton.disabled = false;
    if (els.sampleButton) els.sampleButton.disabled = false;
  }
}

function stopRecordStream() {
  if (app.recordStream) {
    app.recordStream.getTracks().forEach((track) => track.stop());
    app.recordStream = null;
  }
}

function updateRecordTimer() {
  const elapsed = app.recordStartedAt ? Math.min(30, Math.floor((Date.now() - app.recordStartedAt) / 1000)) : 0;
  els.recordTimer.textContent = `00:${String(elapsed).padStart(2, '0')}`;
}

function pickRecorderMimeType() {
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return options.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

async function useSampleStory() {
  try {
    app.demoMode = true;
    app.sampleMode = true;
    showLaunchNotice('本地演示模式', '当前作品只在本机预览，不会回传成绩或写入学生后台。', 'demo');
    els.recordButton.disabled = false;
    if (els.sampleButton) els.sampleButton.disabled = true;
    startTaskProgress('asr');
    setStatus(els.recordStatus, '保存录音');
    updateTaskProgress('asr', 0);
    const sampleAudio = createSilentWavDataUrl(5);
    updateTaskProgress('asr', 1);
    const upload = await apiPost('/api/audio/upload', {
      dataUrl: sampleAudio,
      mimeType: 'audio/wav',
    });
    app.audioId = upload.audioId;
    app.audioUrl = upload.audioUrl;
    app.audioMimeType = upload.mimeType || 'audio/mpeg';
    setStatus(els.recordStatus, '识别中');
    updateTaskProgress('asr', 2);
    const asr = await apiPost('/api/asr/transcribe', { audioId: app.audioId, demo: true });
    updateTaskProgress('asr', 3);
    app.transcript = asr.text;
    els.transcriptInput.value = app.transcript;
    finishTaskProgress('asr');
    setStatus(els.recordStatus, '示例已准备');
    updateTranscriptState();
  } catch (error) {
    failTaskProgress('asr', '处理失败');
    setStatus(els.recordStatus, `示例故事准备失败：${getErrorMessage(error)}`, true);
  } finally {
    if (els.sampleButton) els.sampleButton.disabled = false;
  }
}

async function uploadAudioBlob(blob) {
  return apiPost('/api/audio/upload', {
    dataUrl: await blobToDataUrl(blob),
    mimeType: blob.type || 'audio/webm',
  });
}

function updateTranscriptState() {
  const ready = els.transcriptInput.value.trim().length >= 4;
  els.storyButton.disabled = !ready;
}

async function generateStoryAndComics() {
  const text = els.transcriptInput.value.trim();
  if (!text) return;
  app.transcript = text;
  app.selectedComic = null;
  els.chooseComicButton.disabled = true;
  els.regenerateButton.disabled = true;
  els.backToRecordButton.disabled = true;
  renderComicSkeletonCards();
  showScreen('comic');
  startTaskProgress('comics');
  setStatus(els.comicStatus, '整理中');
  updateTaskProgress('comics', 0);

  try {
    app.story = await apiPost('/api/story/generate', { text, demo: app.sampleMode });
    renderStoryBrief();
    setStatus(els.comicStatus, '同时绘制 4 套漫画');
    updateTaskProgress('comics', 1);
    const result = await apiPost('/api/comics/generate', {
      candidates: app.story.candidates,
      demo: app.sampleMode,
    });
    app.comics = result.comics || [];
    renderCandidates();
    finishTaskProgress('comics');
    setStatus(els.comicStatus, '选择一套');
  } catch (error) {
    els.candidateGrid.classList.remove('is-loading');
    els.candidateGrid.classList.add('has-error');
    failTaskProgress('comics', '生成失败');
    setStatus(els.comicStatus, `生成失败：${getErrorMessage(error)}`, true);
  } finally {
    els.regenerateButton.disabled = false;
    els.backToRecordButton.disabled = false;
  }
}

function renderStoryBrief() {
  els.storyBrief.innerHTML = '';
  els.keywordList.innerHTML = '';
}

function stripStructurePrefix(value) {
  return String(value || '').replace(/^\s*[起承转合]\s*[：:、.\-]\s*/, '').trim();
}

function selectedBgmMood() {
  return els.bgmOptions.find((option) => option.checked)?.value === 'fast' ? 'fast' : 'soft';
}

function bgmMoodLabel(value) {
  return value === 'fast' ? '轻快配乐' : '柔和配乐';
}

function renderCandidates() {
  els.candidateGrid.classList.remove('is-loading', 'has-error');
  els.candidateGrid.innerHTML = app.comics
    .map(
      (comic) => `
        <button class="candidate-card" type="button" data-comic-id="${comic.comicId}">
          <img src="${comic.imageUrl}" alt="${escapeHtml(comic.title)}" />
          <strong>${escapeHtml(comic.title)}</strong>
          ${comic.styleLabel ? `<span class="style-label">${escapeHtml(comic.styleLabel)}</span>` : ''}
        </button>
      `,
    )
    .join('');
  els.candidateGrid.querySelectorAll('.candidate-card').forEach((card) => {
    card.addEventListener('click', () => selectComic(card.dataset.comicId));
  });
}

function renderComicSkeletonCards() {
  els.candidateGrid.classList.remove('has-error');
  els.candidateGrid.classList.add('is-loading');
  els.candidateGrid.innerHTML = Array.from({ length: 4 }, (_, index) => `
    <div class="candidate-card skeleton-card" aria-hidden="true">
      <div class="skeleton-picture"></div>
      <strong>第${index + 1}套</strong>
      <span class="style-label">${escapeHtml(['新中式水墨风格', '新中式国潮风格', '新中式工笔淡彩风格', '新中式Q版可爱风格'][index])}</span>
    </div>
  `).join('');
}

function startTaskProgress(name) {
  const nodes = getProgressNodes(name);
  if (!nodes) return;
  clearTaskProgress(name);
  const stages = taskStages[name] || [];
  progressStates[name] = {
    stages,
    index: 0,
    value: 0,
    stageStartedAt: Date.now(),
    timer: null,
    hideTimer: null,
  };
  nodes.element.hidden = false;
  nodes.element.classList.remove('is-done', 'is-error');
  setTaskProgress(name, 0, stages[0]?.label || '处理中');
  progressStates[name].timer = window.setInterval(() => tickTaskProgress(name), 120);
}

function updateTaskProgress(name, stageIndex, label) {
  const state = progressStates[name];
  if (!state) return;
  const nextIndex = Math.max(state.index, Number(stageIndex || 0));
  if (nextIndex !== state.index) {
    state.index = Math.min(nextIndex, state.stages.length - 1);
    state.stageStartedAt = Date.now();
  }
  const stage = state.stages[state.index] || {};
  setTaskProgress(name, state.value, label || stage.label || '处理中');
}

function finishTaskProgress(name, label = '完成') {
  const state = progressStates[name];
  const nodes = getProgressNodes(name);
  if (!state || !nodes) return;
  window.clearInterval(state.timer);
  nodes.element.classList.add('is-done');
  nodes.element.classList.remove('is-error');
  setTaskProgress(name, 100, label);
  state.hideTimer = window.setTimeout(() => clearTaskProgress(name), 900);
}

function failTaskProgress(name, label = '处理失败') {
  const state = progressStates[name];
  const nodes = getProgressNodes(name);
  if (!state || !nodes) return;
  window.clearInterval(state.timer);
  window.clearTimeout(state.hideTimer);
  nodes.element.hidden = false;
  nodes.element.classList.add('is-error');
  nodes.element.classList.remove('is-done');
  setTaskProgress(name, Math.max(8, state.value), label);
}

function clearTaskProgress(name) {
  const state = progressStates[name];
  if (state) {
    window.clearInterval(state.timer);
    window.clearTimeout(state.hideTimer);
    delete progressStates[name];
  }
  const nodes = getProgressNodes(name);
  if (!nodes) return;
  nodes.element.hidden = true;
  nodes.element.classList.remove('is-done', 'is-error');
  setTaskProgress(name, 0, '准备中');
}

function tickTaskProgress(name) {
  const state = progressStates[name];
  if (!state) return;
  const stage = state.stages[state.index] || {};
  if (Date.now() - state.stageStartedAt > Number(stage.durationMs || 2500) && state.index < state.stages.length - 1) {
    updateTaskProgress(name, state.index + 1);
    return;
  }
  const target = Math.min(Number(stage.target || 92), 92);
  if (state.value >= target) return;
  const step = Math.max(0.08, (target - state.value) * 0.025);
  state.value = Math.min(target, state.value + step);
  setTaskProgress(name, state.value, stage.label || '处理中');
}

function setTaskProgress(name, value, label) {
  const nodes = getProgressNodes(name);
  if (!nodes) return;
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  nodes.fill.style.width = `${percent}%`;
  nodes.percent.textContent = `${percent}%`;
  nodes.label.textContent = label;
}

function getProgressNodes(name) {
  const element = {
    asr: els.recordProgress,
    comics: els.comicProgress,
    video: els.videoProgress,
  }[name];
  if (!element) return null;
  return {
    element,
    label: element.querySelector('.progress-label'),
    percent: element.querySelector('.progress-percent'),
    fill: element.querySelector('.progress-fill'),
  };
}

function selectComic(comicId) {
  app.selectedComic = app.comics.find((comic) => comic.comicId === comicId) || null;
  els.candidateGrid.querySelectorAll('.candidate-card').forEach((card) => {
    card.classList.toggle('is-selected', card.dataset.comicId === comicId);
  });
  els.chooseComicButton.disabled = !app.selectedComic;
}

function chooseComic() {
  if (!app.selectedComic) return;
  showScreen('video');
  app.bgmMood = selectedBgmMood();
  app.video = null;
  app.projector = null;
  clearVideoPlayer();
  clearTaskProgress('video');
  els.videoPlaceholder.classList.remove('is-hidden');
  els.videoPlaceholder.querySelector('.video-placeholder-text').hidden = false;
  els.submitButton.disabled = true;
  els.projectorButton.disabled = true;
  setStatus(els.submitStatus, `已选《${app.selectedComic.title}》`);
}

async function renderVideo() {
  if (!app.selectedComic || !app.audioId) {
    setStatus(els.submitStatus, '缺少录音或漫画，请回到前面步骤重试。', true);
    return;
  }
  try {
    els.renderButton.disabled = true;
    els.videoBackButton.disabled = true;
    els.finishBackButton.disabled = true;
    app.bgmMood = selectedBgmMood();
    els.videoPlaceholder.classList.remove('is-hidden');
    els.videoPlaceholder.querySelector('.video-placeholder-text').hidden = true;
    startTaskProgress('video');
    setStatus(els.submitStatus, '生成中');
    updateTaskProgress('video', 0);
    app.video = await apiPost('/api/video/render', {
      audioId: app.audioId,
      comicId: app.selectedComic.comicId,
      title: app.selectedComic.title,
      panels: app.selectedComic.panels,
      bgmMood: app.bgmMood,
    });
    app.projector = null;
    updateTaskProgress('video', 3);
    finishTaskProgress('video');
    setVideoPlayer(app.video.videoUrl, app.video.captionsUrl);
    els.videoPlaceholder.classList.add('is-hidden');
    els.projectorButton.disabled = false;
    els.submitButton.disabled = false;
    setStatus(els.submitStatus, '已生成');
  } catch (error) {
    els.videoPlaceholder.classList.remove('is-hidden');
    els.videoPlaceholder.querySelector('.video-placeholder-text').hidden = true;
    failTaskProgress('video', '合成失败');
    setStatus(els.submitStatus, `视频合成失败：${getErrorMessage(error)}`, true);
  } finally {
    els.renderButton.disabled = false;
    els.videoBackButton.disabled = false;
    els.finishBackButton.disabled = false;
  }
}

async function ensureProjectorWork() {
  if (app.projector?.projectorUrl) return app.projector;
  if (!app.video || !app.selectedComic || !app.audioId) {
    throw new Error('请先完成录音、选择漫画并合成视频。');
  }
  app.projector = await apiPost('/api/projector/save', {
    audioId: app.audioId,
    transcript: app.transcript,
    comics: app.comics,
    selectedComicId: app.selectedComic.comicId,
    selectedComic: app.selectedComic,
    videoId: app.video.videoId,
    video: app.video,
    title: app.selectedComic.title,
    bgmMood: app.video.bgmMood || app.bgmMood,
  });
  return app.projector;
}

async function openProjector() {
  const popup = window.open('', '_blank', 'noopener');
  try {
    els.projectorButton.disabled = true;
    setStatus(els.submitStatus, '准备投屏页');
    const projector = await ensureProjectorWork();
    if (popup) {
      popup.location.href = projector.projectorUrl;
    } else {
      window.location.href = projector.projectorUrl;
    }
    setStatus(els.submitStatus, '投屏页已打开');
  } catch (error) {
    if (popup) popup.close();
    setStatus(els.submitStatus, `投屏页生成失败：${getErrorMessage(error)}`, true);
  } finally {
    els.projectorButton.disabled = !app.video;
  }
}

async function submitRecord() {
  if (app.submitted) return true;
  if (!app.video) {
    setStatus(els.submitStatus, '请先合成视频。', true);
    return false;
  }
  let projector = null;
  try {
    projector = await ensureProjectorWork();
  } catch (error) {
    setStatus(els.submitStatus, `投屏页生成失败：${getErrorMessage(error)}`, true);
    return false;
  }
  if (app.demoMode || !app.launchToken || !app.platformApiBase) {
    app.submitted = true;
    setStatus(els.submitStatus, '本地预览完成');
    return true;
  }

  try {
    els.submitButton.disabled = true;
    setStatus(els.submitStatus, '提交中');
    const artifacts = await uploadArtifacts();
    const durationSeconds = Math.max(1, Math.round((Date.now() - app.startedAt) / 1000));
    const summary = buildSummary(artifacts, durationSeconds, projector);
    await platformPost('/course-runtime/launch/records', {
      launchToken: app.launchToken,
      status: 'COMPLETED',
      score: computeScore(),
      durationSeconds,
      summary,
    });
    app.submitted = true;
    setStatus(els.submitStatus, '已提交');
    return true;
  } catch (error) {
    els.submitButton.disabled = false;
    setStatus(els.submitStatus, `提交失败：${getErrorMessage(error)}`, true);
    return false;
  }
}

async function uploadArtifacts() {
  const items = [
    {
      kind: 'student-audio',
      title: '学生原声录音',
      url: app.audioUrl,
      mimeType: app.audioMimeType,
      fileName: 'student-voice.mp3',
      metadata: { transcript: app.transcript },
    },
    ...app.comics.map((comic, index) => ({
      kind: index === app.comics.indexOf(app.selectedComic) ? 'selected-comic-page' : 'comic-candidate-page',
      title: comic.title,
      url: comic.imageUrl,
      mimeType: comic.mimeType || 'image/jpeg',
      fileName: `comic-${index + 1}${extensionForMime(comic.mimeType || 'image/jpeg')}`,
      metadata: { panels: comic.panels, selected: comic.comicId === app.selectedComic.comicId },
    })),
    {
      kind: 'four-panel-story-video',
      title: `${app.selectedComic.title} 视频`,
      url: app.video.videoUrl,
      mimeType: app.video.mimeType || 'video/mp4',
      fileName: 'four-panel-story.mp4',
      metadata: { comicId: app.selectedComic.comicId, durationSeconds: app.video.durationSeconds, bgmMood: app.video.bgmMood || app.bgmMood },
    },
    ...(app.video.captionsUrl
      ? [
          {
            kind: 'four-panel-story-captions',
            title: `${app.selectedComic.title} 字幕`,
            url: app.video.captionsUrl,
            mimeType: 'text/vtt',
            fileName: 'four-panel-story.vtt',
            metadata: { comicId: app.selectedComic.comicId, bgmMood: app.video.bgmMood || app.bgmMood },
          },
        ]
      : []),
  ];

  const uploaded = [];
  for (const item of items) {
    const contentBase64 = await urlToBase64(item.url);
    const artifact = await platformPost('/course-runtime/launch/artifacts', {
      launchToken: app.launchToken,
      fileName: item.fileName,
      mimeType: item.mimeType,
      kind: item.kind,
      contentBase64,
      metadata: item.metadata,
    });
    uploaded.push({
      kind: artifact.kind || item.kind,
      title: item.title,
      url: artifact.url,
      mimeType: artifact.mimeType || item.mimeType,
      metadata: item.metadata,
    });
  }
  return uploaded;
}

function buildSummary(artifacts, durationSeconds, projector) {
  const selected = app.selectedComic || {};
  return {
    displayTitle: 'AI 四格故事工坊',
    brief: `学生把语音灵感整理成《${selected.title || '四格故事'}》，并生成四格漫画视频。`,
    scoreText: `${computeScore()} 分`,
    projectorUrl: projector?.projectorUrl || undefined,
    screenUrl: projector?.screenUrl || projector?.projectorUrl || undefined,
    workId: projector?.workId || undefined,
    resultItems: [
      { label: '录音文本', value: app.transcript.slice(0, 36) },
      { label: '候选漫画', value: `${app.comics.length} 套` },
      { label: '选中作品', value: selected.title || '未命名故事' },
      { label: '视频时长', value: `${Math.round(app.video?.durationSeconds || 0)} 秒` },
      { label: '用时', value: `${durationSeconds} 秒` },
    ],
    story: app.story,
    selectedComic: selected,
    video: app.video,
    artifacts,
    processSummary: `学生录音后确认文字，生成 ${app.comics.length} 套四格漫画候选，最终选择《${selected.title || '四格故事'}》并合成原声视频。`,
  };
}

function computeScore() {
  let score = 40;
  if (app.transcript.trim().length >= 8) score += 20;
  if (app.comics.length >= 4) score += 20;
  if (app.video) score += 20;
  return Math.min(100, score);
}

async function submitAndBack() {
  const ok = await submitRecord();
  if (ok) backToStudentPortal();
}

function showScreen(name) {
  els.recordPanel.classList.toggle('is-current', name === 'record');
  els.comicPanel.classList.toggle('is-current', name === 'comic');
  els.videoPanel.classList.toggle('is-current', name === 'video');
  updateStep(name === 'record' ? 'record' : name === 'comic' ? 'comic' : 'video');
}

function updateStep(active) {
  els.steps.forEach((step) => {
    step.classList.toggle('is-active', step.dataset.step === active || (active === 'comic' && step.dataset.step === 'story'));
  });
}

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle('is-error', isError);
}

function showLaunchNotice(title, message, tone = 'warning') {
  const titleElement = els.launchNotice.querySelector('strong');
  const messageElement = els.launchNotice.querySelector('span');
  titleElement.textContent = title;
  messageElement.textContent = message;
  els.launchNotice.classList.toggle('is-demo', tone === 'demo');
  els.launchNotice.hidden = false;
}

function backToStudentPortal() {
  stopRecordStream();
  if (app.returnUrl) {
    window.location.href = app.returnUrl;
    return;
  }
  window.history.back();
}

function apiPost(path, body) {
  return fetch(localUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  }).then(readJsonResponse);
}

function localUrl(path) {
  return new URL(String(path || '').replace(/^\/+/, ''), localBaseUrl).toString();
}

function platformPost(path, body) {
  if (!app.launchToken || !app.platformApiBase) {
    return Promise.reject(new Error('请从学生后台进入课件'));
  }
  return fetch(`${app.platformApiBase}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  }).then(readJsonResponse);
}

async function readJsonResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || '请求失败');
    error.code = data.code || '';
    error.details = data;
    throw error;
  }
  return data;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function urlToBase64(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`作品文件读取失败：${response.status}`);
  const blob = await response.blob();
  const dataUrl = await blobToDataUrl(blob);
  return String(dataUrl).split(',').pop();
}

function createSilentWavDataUrl(seconds) {
  const sampleRate = 16000;
  const sampleCount = sampleRate * seconds;
  const buffer = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + sampleCount * 2, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, sampleCount * 2, true);
  for (let index = 0; index < sampleCount; index += 1) {
    view.setInt16(44 + index * 2, 0, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return `data:audio/wav;base64,${window.btoa(binary)}`;
}

function writeAscii(view, offset, text) {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

function extensionForMime(mimeType) {
  if (mimeType.includes('svg')) return '.svg';
  if (mimeType.includes('png')) return '.png';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return '.jpg';
  if (mimeType.includes('mp4')) return '.mp4';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return '.mp3';
  if (mimeType.includes('vtt')) return '.vtt';
  return '.bin';
}

function clearVideoPlayer() {
  els.videoPlayer.removeAttribute('src');
  els.videoPlayer.querySelectorAll('track').forEach((track) => track.remove());
  els.videoPlayer.load();
}

function setVideoPlayer(videoUrl, captionsUrl) {
  clearVideoPlayer();
  els.videoPlayer.src = videoUrl;
  if (captionsUrl) {
    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.label = '故事字幕';
    track.srclang = 'zh';
    track.src = captionsUrl;
    track.default = true;
    els.videoPlayer.appendChild(track);
    track.addEventListener('load', () => {
      if (track.track) track.track.mode = 'showing';
    });
  }
  els.videoPlayer.load();
}

function getErrorMessage(error) {
  if (error?.code === 'ASR_CONFIG_MISSING') {
    return '语音识别还没配置好，录音已保存。请在 .env.local 填写豆包语音新版 VOLC_ASR_API_KEY 后重启服务。';
  }
  if (error?.code === 'ASR_PUBLIC_BASE_URL_LOCAL') {
    return '语音识别需要公网地址。请配置部署域名或临时隧道地址后再录音。';
  }
  if (error?.code === 'ASR_AUDIO_DOWNLOAD_FAILED') {
    return '语音识别访问不到录音文件。请检查公网地址或临时隧道是否还有效，然后重新录音。';
  }
  if (error?.code === 'ASR_RESOURCE_NOT_GRANTED') {
    return '当前豆包语音 API Key 没有开通可用的录音文件识别资源。请开通录音文件识别或录音文件识别2.0 后重试。';
  }
  if (error?.code === 'ASR_SUBMIT_FAILED') {
    return error.message || '火山 ASR 提交失败，请检查豆包语音 API Key 和开通资源。';
  }
  if (error?.code === 'ARK_CONFIG_MISSING') {
    return '还没有配置火山方舟 ARK_API_KEY。请填写 ark- 开头的方舟 API Key 后重启服务。';
  }
  if (error?.code === 'ARK_CONFIG_INVALID') {
    return '火山方舟 ARK_API_KEY 填错了。请复制方舟表格中间“API Key”列的隐藏密钥，不要复制名称 api-key-... 或资源 ID apikey-...。';
  }
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
