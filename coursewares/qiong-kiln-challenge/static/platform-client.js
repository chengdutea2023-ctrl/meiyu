(() => {
  const params = new URLSearchParams(location.search);
  const title = document.documentElement.dataset.coursewareTitle || document.title;
  const state = {
    demo: params.get('demo') === '1', launchToken: params.get('launchToken') || '',
    platformApiBase: (params.get('platformApiBase') || '').replace(/\/$/, ''),
    returnUrl: params.get('returnUrl') || '', startedAt: Date.now(), initialized: false, saveState: 'idle', dirty: false,
  };
  const milestones = new Set(), progressRequests = new Set(), uploaded = new Map();
  let initializePromise, savePromise, frozenResult, leaving = false;
  function markDirty() { if (state.saveState !== 'saved') state.dirty = true; }

  async function post(path, body, timeoutMs = 15000) {
    if (!state.launchToken || !state.platformApiBase) throw new Error('请从学生后台进入课件');
    const endpoint = new URL(state.platformApiBase);
    if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error('平台地址无效，请重新进入课件');
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(state.platformApiBase + path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.message === 'string' ? data.message : `平台请求失败（${response.status}）`);
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('保存请求超时，请重试');
      throw error;
    } finally { clearTimeout(timer); }
  }

  function initialize() {
    if (initializePromise) return initializePromise;
    initializePromise = (async () => {
      if (state.demo) {
        const banner = document.createElement('div');
        banner.className = 'platform-banner'; banner.textContent = '本地预览，成绩不会保存';
        document.body.prepend(banner);
      } else {
        state.context = (await post('/course-runtime/launch/verify', { launchToken: state.launchToken })).context;
        await post('/course-runtime/launch/records', { launchToken: state.launchToken, status: 'STARTED' });
      }
      state.initialized = true;
      return { demo: state.demo };
    })().catch((error) => { initializePromise = null; throw error; });
    return initializePromise;
  }

  async function progress(milestone) {
    markDirty();
    if (!state.initialized || state.demo || state.saveState !== 'idle' || milestones.has(milestone)) return;
    milestones.add(milestone);
    const request = post('/course-runtime/launch/records', {
      launchToken: state.launchToken, status: 'PROGRESS', summary: { displayTitle: title, brief: milestone },
    });
    progressRequests.add(request);
    try { await request; } catch { milestones.delete(milestone); }
    finally { progressRequests.delete(request); }
  }

  function complete(result) {
    if (state.saveState === 'saved') return Promise.resolve({ saved: !state.demo, demo: state.demo });
    if (savePromise) return savePromise;
    // Retry exactly the submitted snapshot, including already uploaded work.
    if (!frozenResult) frozenResult = structuredClone(result);
    state.saveState = 'saving'; state.dirty = true;
    savePromise = (async () => {
      if (!state.initialized) throw new Error('启动验证尚未完成');
      if (state.demo) { state.saveState = 'saved'; state.dirty = false; return { demo: true }; }
      await Promise.allSettled([...progressRequests]);
      const work = frozenResult, score = work.score == null ? null : Number(work.score);
      if (score !== null && (!Number.isFinite(score) || score < 0 || score > 100)) throw new Error('成绩计算异常，请重试');
      for (const item of work.pendingArtifacts || []) {
        if (uploaded.has(item.localId)) continue;
        uploaded.set(item.localId, await post('/course-runtime/launch/artifacts', {
          launchToken: state.launchToken, fileName: item.fileName, mimeType: item.mimeType,
          kind: item.kind, contentBase64: item.contentBase64, metadata: item.metadata || {},
        }, 60000));
      }
      await post('/course-runtime/launch/records', {
        launchToken: state.launchToken, status: 'COMPLETED', score,
        durationSeconds: Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000)),
        summary: {
          displayTitle: title, brief: work.brief || '作品已提交，等待评价。',
          ...(['manual-ai','manual-demonstrations-ai'].includes(work.lessonFlow) ? {lessonFlow:work.lessonFlow} : {}),
          ...(work.demonstrationVersion==='demonstrations-v1'?{demonstrationVersion:work.demonstrationVersion,trainingExperimentCount:work.trainingExperimentCount,demonstrationComparisons:work.demonstrationComparisons}:{}),
          scoreText: score === null ? '未评分' : `${score} 分`,
          resultItems: work.resultItems || [{ label: '完成情况', value: '已提交，待评价' }],
          processSummary: work.processSummary || '',
          artifacts: [...uploaded.values()].map((item) => ({
            kind: item.kind, title: item.originalFileName || item.fileName || '学习作品', url: item.url, mimeType: item.mimeType,
          })),
        },
      });
      state.saveState = 'saved'; state.dirty = false; return { saved: true };
    })().catch((error) => { state.saveState = 'failed'; throw error; }).finally(() => { savePromise = null; });
    return savePromise;
  }

  function returnToPortal() {
    const status = document.getElementById('returnStatus');
    const message = (text) => { if (status) status.textContent = text; };
    if (state.saveState === 'saving') { message('正在保存作品，请等待保存完成后返回。'); return false; }
    let destination;
    try {
      const url = state.returnUrl && new URL(state.returnUrl, location.href);
      if (url && ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) destination = url.href;
    } catch { /* Missing return links fall back to browser history. */ }
    if (!destination && history.length <= 1) { message('缺少学生主页地址，请关闭此页，从学生后台重新进入。'); return false; }
    if (state.dirty && state.saveState !== 'saved' && !window.confirm('作品尚未提交成功。现在返回不会保存本次未提交内容，确定返回吗？')) return false;
    leaving = true;
    if (destination) { location.assign(destination); return true; }
    history.back(); return true;
  }
  window.addEventListener('beforeunload', (event) => {
    if (!state.demo && !leaving && state.dirty && state.saveState !== 'saved') { event.preventDefault(); event.returnValue = ''; }
  });
  window.ZhikeCourseware = { initialize, progress, complete, returnToPortal, markDirty,
    get state() { return { ...state, savedArtifactCount: uploaded.size }; } };
})();
