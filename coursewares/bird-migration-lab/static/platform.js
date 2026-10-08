(() => {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const launchToken = params.get('launchToken');
  const platformApiBase = (params.get('platformApiBase') || '').replace(/\/$/, '');
  const returnUrl = params.get('returnUrl');
  const demoMode = params.get('demo') === '1';
  const state = document.getElementById('platformState');
  const app = document.getElementById('courseware');
  const retry = document.getElementById('retrySave');
  const returnButton = document.getElementById('returnPortal');
  const startedAt = Date.now();
  let initialization = null;
  let saveState = 'idle';
  let uploadedArtifacts = [];
  let pendingResult = null;
  let storageKey = 'bird-migration-demo-v3';

  function message(text, kind = '') {
    state.hidden = false;
    state.className = 'platform-state ' + kind;
    state.textContent = text;
  }

  function lockCourseware(locked) {
    app.querySelectorAll('button,input,textarea,select').forEach((control) => {
      if (control.id !== 'downloadReport') control.disabled = locked;
    });
  }

  async function post(path, body, timeoutMs = 15000) {
    if (!launchToken || !platformApiBase) throw new Error('启动信息不完整，请从学生后台重新进入课件。');
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(platformApiBase + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.message === 'string' ? data.message : '平台暂时无法保存，请稍后重试。');
      return data;
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function initialize() {
    if (demoMode) {
      message('本地预览，成绩不会保存', 'demo');
      app.hidden = false;
      return true;
    }
    if (!launchToken || !platformApiBase) {
      message('请从智课学生后台打开本课件。');
      return false;
    }
    message('正在验证课件启动信息…');
    try {
      const { context } = await post('/course-runtime/launch/verify', { launchToken });
      storageKey = `bird-migration-v3:${context.student.id}:${context.assignment.id}:${context.courseware.id}`;
      await post('/course-runtime/launch/records', { launchToken, status: 'STARTED' });
      state.hidden = true;
      app.hidden = false;
      return true;
    } catch (error) {
      message(error.message || '启动验证失败，请返回学生后台重新进入。', 'error');
      retry.textContent = '重试启动验证';
      retry.hidden = false;
      return false;
    }
  }

  function ready() {
    if (!initialization) initialization = initialize();
    return initialization;
  }

  function scoreWork(result) {
    const points = result.points;
    const dataScore = points.length >= 2 ? 30 : 15;
    const profileScore = (result.species.trim() ? 10 : 0) + (result.season.trim() ? 10 : 0);
    const informative = points.filter((point) => point.kind.trim() && point.kind.trim() !== '观测点').length;
    const annotationScore = points.length ? Math.round(20 * informative / points.length) : 0;
    const words = result.reason.trim().length;
    const reasoningScore = words >= 120 ? 30 : words >= 60 ? 20 : words >= 20 ? 10 : 0;
    return Math.max(0, Math.min(100, dataScore + profileScore + annotationScore + reasoningScore));
  }

  function toBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
  }

  async function complete(result) {
    if (demoMode) {
      message('本地预览，成绩不会保存', 'demo');
      return true;
    }
    if (saveState === 'saving' || saveState === 'saved') return saveState === 'saved';
    if (!pendingResult) pendingResult = structuredClone(result);
    result = pendingResult;
    saveState = 'saving';
    lockCourseware(true);
    retry.hidden = true;
    message('正在保存科学报告和学习成绩…', 'saving');
    try {
      const reportId = 'migration-report';
      if (!uploadedArtifacts.some((artifact) => artifact.localId === reportId)) {
        const uploaded = await post('/course-runtime/launch/artifacts', {
          launchToken,
          fileName: '候鸟迁徙科学报告.txt',
          mimeType: 'text/plain',
          kind: 'final-work',
          contentBase64: toBase64(result.report),
          metadata: { scene: 'final-submit', title: '候鸟迁徙科学报告' },
        }, 60000);
        uploadedArtifacts.push({ localId: reportId, ...uploaded });
      }
      const score = scoreWork(result);
      await post('/course-runtime/launch/records', {
        launchToken,
        status: 'COMPLETED',
        score,
        durationSeconds: Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
        summary: {
          displayTitle: '候鸟迁徙科学报告',
          brief: `${result.points.length} 个 GPS 观测点，估算相邻点大圆距离 ${result.distanceKm} km。`,
          scoreText: `${score} 分`,
          resultItems: [
            { label: 'GPS 观测点', value: `${result.points.length} 个` },
            { label: '路线距离估算', value: `${result.distanceKm} km` },
            { label: '过程评分', value: `${score} / 100` },
          ],
          processSummary: '评分依据：路线数据 30 分；物种与季节信息 20 分；有意义的地点生态标注 20 分；证据推理 30 分。推理按文字长度分档，鼓励结合坐标与地点证据说明。',
          artifacts: uploadedArtifacts.map((artifact) => ({
            kind: artifact.kind || 'final-work',
            title: artifact.originalFileName || artifact.fileName || '候鸟迁徙科学报告',
            url: artifact.url,
            mimeType: artifact.mimeType || 'text/plain',
          })),
        },
      });
      saveState = 'saved';
      message(`成绩已保存：${score} 分`, 'success');
      retry.hidden = true;
      returnButton.hidden = false;
      return true;
    } catch (error) {
      saveState = 'failed';
      // Keep the submitted snapshot unchanged until its save succeeds.
      lockCourseware(true);
      retry.hidden = false;
      retry.textContent = '重试保存';
      message(error.message || '保存失败，请检查网络后重试。', 'error');
      return false;
    }
  }

  document.getElementById('retrySave').addEventListener('click', async () => {
    if (pendingResult) {
      complete(pendingResult);
      return;
    }
    retry.hidden = true;
    initialization = initialize();
    if (await initialization) window.dispatchEvent(new Event('zhike:ready'));
  });
  document.getElementById('returnPortal').addEventListener('click', () => {
    if (saveState !== 'saved') return;
    if (returnUrl) {
      try {
        const destination = new URL(returnUrl, window.location.href);
        if (destination.protocol === 'http:' || destination.protocol === 'https:') {
          window.location.assign(destination.href);
          return;
        }
      } catch { /* Use browser history when the platform return link is invalid. */ }
    }
    window.history.back();
  });

  window.ZhikeCourseware = { ready, complete, scoreWork, get storageKey() { return storageKey; } };
})();
