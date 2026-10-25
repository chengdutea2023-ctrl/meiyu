(() => {
  'use strict';
  const E = window.KilnEngine, T = window.KilnTemperature, Q = window.KilnQuiz, M = window.KilnManual, P = window.ZhikeCourseware, $ = id => document.getElementById(id);
  Q.mount($('quizQuestions'));
  const modeNames = { manual: '手动试烧', fixed: '固定程序', ai: 'AI 试错学习' };
  const state = { mode: 'manual', view: 'lab', kiln: M.create(), q: {}, records: [], training: false, trained: false,
    locked: false, running: false, initialized: false, rewards: { ...E.DEFAULT_REWARDS }, modelRewards: null,
    snapshots: [], batches: [], trainPoints: [], trainTarget: 3000, iterations: 0, lastAction: null, qRows: [], timer: null, stopTraining: false, seed: 21 };
  const effects = window.KilnEffects.mount($('kilnScene'), $('kilnEffectStatus'));
  const sound = window.KilnSound.mount($('soundToggle'));
  const manual = M.controller({getState:()=>state.kiln,
    canRun:()=>state.mode==='manual'&&state.view==='lab'&&state.initialized&&!state.locked&&!state.training&&!document.hidden&&!document.querySelector('dialog[open]'),
    onUpdate:()=>{state.lastAction=state.kiln.action;render();},onComplete:finishManual});
  const pauseManual=()=>{if(state.mode==='manual')manual.pause();};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseManual();});
  document.addEventListener('toggle',()=>{if(document.querySelector('dialog[open]'))pauseManual();},true);
  window.addEventListener('pagehide',pauseManual);
  let toastTimer, guide;
  function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4200); }
  function syncPrediction(from, to) { $(to).value = $(from).value; P.markDirty(); }
  function showView(view) {
    if(view!=='lab')pauseManual();
    state.view = view;
    document.body.dataset.view = view;
    for (const name of ['lab', 'compare', 'report']) $(name + 'View').hidden = name !== view;
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    renderCompare(); renderReport(); guide?.render(state);
    effects.sync(state); sound.sync(state);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function setMode(mode) {
    if (!['manual', 'ai'].includes(mode)) return;
    if (state.training || state.locked) return;
    manual.stop();stopAuto(); state.mode = mode; document.body.dataset.mode = mode; newKiln();
    document.querySelectorAll('button[data-mode]').forEach(b => { b.classList.toggle('active', b.dataset.mode === mode); b.setAttribute('aria-selected', String(b.dataset.mode === mode)); });
    for (const name of ['manual', 'fixed', 'ai']) $(name + 'Panel').hidden = mode !== name;
    $('learningTitle').textContent = mode === 'manual' ? '观察火候，及时切换' : 'AI 学到的，是什么？';
    $('learningText').textContent = mode === 'manual' ? '加热和降温点击后持续生效；进入烧成区累计6秒，再冷却出窑。' : '它学的是不同状态下各动作的价值。奖励设置会影响学到的策略。';
    render();
  }
  function newKiln() { manual.stop();state.kiln = state.mode==='manual'?M.create():E.create(state.seed); state.lastAction = null; state.qRows = []; $('manualFeedback').textContent = '先点击“加热”，观察热度和能耗的变化。'; render(); }
  function finishManual(s) {
    state.records.push({mode:'manual',manualControlVersion:M.VERSION,result:s.reason,success:s.success,energy:+s.energy.toFixed(1),steps:Math.max(0,s.controlChanges.length-1),
      simulatedDurationSeconds:+s.elapsedSeconds.toFixed(3),inRangeSeconds:+s.inRangeSeconds.toFixed(3),heatSeconds:+s.heatSeconds.toFixed(3),coolSeconds:+s.coolSeconds.toFixed(3),
      hazardVersion:s.hazardVersion,exploded:s.exploded,events:structuredClone(s.events),
      controlChanges:structuredClone(s.controlChanges),trace:structuredClone(s.trace)});
    P.progress('手动实时试烧完成');updateRecordCount();toast(`${s.reason}，实时控火过程已加入记录。`);render();
  }
  function stopAuto() { clearTimeout(state.timer); state.running = false; }
  function controls() {
    const busy = state.training || state.locked || !state.initialized;
    document.querySelectorAll('button[data-mode], [data-preset], .sliders input, #episodeCount').forEach(b => { b.disabled = busy; });
    document.querySelectorAll('[data-action]').forEach(b => {
      const out=state.kiln.fireState==='out',cooldown=state.kiln.cooldownRemaining||0;
      b.disabled = busy || state.mode!=='manual' || state.kiln.done || (b.dataset.action==='0'&&out&&cooldown>1e-7);
      b.setAttribute('aria-pressed',String(state.kiln.action===Number(b.dataset.action)&&!state.kiln.paused&&!out));
      if(b.dataset.action==='0'){b.querySelector('b').textContent=out?cooldown>1e-7?`冷却 ${Math.ceil(cooldown)}秒`:'重新点火':'加热';b.title=out?'低温熄火后，等待5秒冷却才能重新点火':'持续加热';}
    });
    $('resetRun').disabled = busy;
    $('trainButton').disabled = busy;
    $('runFixed').disabled = busy;
    $('fixedBatch').disabled = busy || state.running;
    $('runAI').disabled = busy || !state.trained || modelStale();
    const buttonText = (id, icon, label) => {
      const path = `icons/${icon}.svg`, src = (window.KILN_ASSETS || {})[path] || `./${path}`;
      $(id).innerHTML = `<img class="icon" src="${src}" alt=""><span>${label}</span>`;
    };
    buttonText('runFixed', state.running ? 'pause' : 'play', state.running && state.mode === 'fixed' ? '暂停运行' : state.kiln.done ? '再烧一窑' : '自动烧一窑');
    buttonText('runAI', state.running ? 'pause' : 'play', state.running && state.mode === 'ai' ? '暂停观察' : '观察AI烧一窑');
    buttonText('trainButton', 'sparkle', state.training ? 'AI正在学习…' : state.trained ? '重新学习并演示' : '开始学习并演示');
  }
  function modelStale() { return state.trained && JSON.stringify(state.rewards) !== JSON.stringify(state.modelRewards); }
  function render() {
    const s = state.kiln;
    $('tempValue').textContent = T.celsius(s.temp);
    $('energyValue').textContent = Number(s.energy.toFixed(1));
    $('stepValue').innerHTML = s.manualControlVersion===M.VERSION?`${s.elapsedSeconds.toFixed(1)}<small>/60秒</small>`:`${s.tick}<small>/22</small>`;
    $('maturityValue').textContent = s.maturity;
    $('workshopWarm').style.opacity = Math.max(0, Math.min(1, (s.temp - 30) / 44));
    $('workshopWarm').style.filter = s.damaged ? 'saturate(.5)' : '';
    $('kilnScene').classList.toggle('running', state.running);
    $('kilnDot').className = 'status-dot' + (s.done && !s.success ? ' failed' : s.temp > 50 ? ' hot' : '');
    $('kilnLabel').textContent = state.training ? `AI 试错中 · 已尝试 ${state.iterations.toLocaleString()} 窑` : s.done ? s.reason + ' · 本轮已记录' : s.tick ? `${modeNames[state.mode]} · ${s.maturity < 3 ? '烧成中' : '等待冷却'}` : '等待你的第一条指令';
    [...$('maturityDots').children].forEach((el, i) => el.classList.toggle('filled', i < s.maturity));
    $('maturityLabel').textContent = s.done ? s.reason : s.maturity >= 3 ? '烧成进度已足，模拟冷却至60℃以下即可出窑' : `已完成 ${s.maturity}/3 步，模拟烧成区1000–1200℃`;
    $('statusHint').textContent = state.training ? 'AI正在多轮试错，观察下方训练曲线' : s.done ? `${s.reason}，本轮已记录` : s.maturity >= 3 ? '烧成已足，模拟冷却至60℃以下' : s.temp >= 58 && s.temp <= 80 ? '保持火候，完成烧成后再降温' : s.temp > 80 ? '窑温偏高，注意过热风险' : '先加热，让窑温进入烧成区';
    const suggested = s.maturity >= 3 || s.temp > 80 ? 2 : 0;
    document.body.dataset.heatZone=s.damaged?'damaged':s.temp>80?'warning':s.temp>=58?'firing':'cold';
    document.querySelectorAll('[data-action]').forEach(b => b.classList.toggle('recommended', !s.done && Number(b.dataset.action) === suggested));
    $('qValues').hidden = state.mode !== 'ai' || !state.qRows.length;
    if (state.qRows.length) {
      const min = Math.min(...state.qRows), max = Math.max(...state.qRows);
      $('qValues').innerHTML = state.qRows.map((v, i) => `<div class="q-row"><span>${E.ACTIONS[i]}</span><i class="${v === max ? 'best' : ''}" style="width:${20 + 80 * (v - min) / (max - min || 1)}%"></i><span>${v.toFixed(1)}</span></div>`).join('');
    }
    drawDial(); drawChart(); controls(); guide?.render(state);
    effects.sync(state); sound.sync(state);
  }
  function drawDial() {
    const canvas = $('heatDial'), ctx = canvas.getContext('2d'), s = state.kiln;
    const start = Math.PI * 0.75, span = Math.PI * 1.5;
    ctx.clearRect(0, 0, 480, 480); ctx.lineCap = 'round'; ctx.lineWidth = 26;
    ctx.beginPath(); ctx.arc(240, 240, 191, start, start + span); ctx.strokeStyle = '#e9e4d6'; ctx.stroke();
    ctx.beginPath(); ctx.arc(240, 240, 191, start, start + span * s.temp / 100); ctx.strokeStyle = s.damaged ? '#b45837' : '#f59538'; ctx.stroke();
    ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(240, 240, 158, 0, Math.PI * 2); ctx.strokeStyle = '#e9e3d5'; ctx.stroke();
    canvas.setAttribute('aria-label', `当前模拟窑温${T.format(s.temp)}`);
  }
  function drawChart() {
    const trainingChart = state.training || (state.mode === 'ai' && state.trainPoints.length > 0 && state.kiln.tick === 0);
    const svg = $('chart');
    $('chartTitle').textContent = trainingChart ? 'AI训练合格率' : '模拟窑温变化曲线';
    $('chartMeta').textContent = trainingChart ? '每50轮实际合格率，包含探索' : '只显示已记录的实际操作';
    $('chartCurrent').textContent = trainingChart ? `已训练 ${state.iterations.toLocaleString()} 轮` : `当前 ${T.format(state.kiln.temp)}`;
    svg.setAttribute('aria-label', trainingChart ? '训练期间每50轮合格率曲线，可能上升或下降' : state.mode==='manual'?'模拟窑温随实际模拟秒数变化，单位摄氏度':'模拟窑温随操作步数变化曲线，单位摄氏度');
    $('chartLegend').textContent = trainingChart ? '训练合格率（%）' : '模拟窑温（℃）';
    const left = 48, right = 409, top = 12, bottom = 126;
    const y = v => bottom - v / (trainingChart ? 100 : T.max) * (bottom - top);
    let markup = trainingChart ? '' : `<rect x="${left}" y="${y(T.celsius(80))}" width="${right - left}" height="${y(T.celsius(58)) - y(T.celsius(80))}" fill="#e9eede"/>`;
    for (const n of trainingChart ? [0, 50, 100] : [0, 700, 1400]) markup += `<line x1="${left}" x2="${right}" y1="${y(n)}" y2="${y(n)}" stroke="#e4ddcd" stroke-dasharray="3 4"/><text x="0" y="${y(n) + 4}" fill="#989481" font-size="11">${n}${trainingChart ? '%' : '℃'}</text>`;
    const realtime=state.kiln.manualControlVersion===M.VERSION;
    const pts = trainingChart ? state.trainPoints.map(p => ({ x: p.episode / state.trainTarget, y: p.rate })) : state.kiln.trace.map(p => ({ x: realtime?p.elapsedSeconds/60:p.tick/22, y: T.celsius(p.temp) }));
    const xy = pts.map(p => `${(left + p.x * (right - left)).toFixed(1)},${y(p.y).toFixed(1)}`);
    if (xy.length > 1) markup += `<path d="M${left},${bottom} L${xy.join(' L')} L${left + pts[pts.length - 1].x * (right - left)},${bottom}Z" fill="#aa593e" opacity=".045"/>`;
    markup += `<polyline points="${xy.join(' ')}" fill="none" stroke="#b77835" stroke-width="2.5" stroke-linejoin="round"/>`;
    if (!trainingChart) for (const p of pts) markup += `<circle cx="${left + p.x * (right - left)}" cy="${y(p.y)}" r="3.5" fill="#e9913b" stroke="#fffaf0" stroke-width="1.5"/>`;
    if (pts.length) { const last = pts.at(-1); markup += `<circle cx="${left + last.x * (right - left)}" cy="${y(last.y)}" r="3" fill="#aa6849"/>`; }
    for (const n of [0, 0.5, 1]) markup += `<text x="${left + n * (right - left)}" y="153" fill="#989481" font-size="10" text-anchor="${n === 0 ? 'start' : n === 1 ? 'end' : 'middle'}">${trainingChart ? Math.round(n * state.trainTarget).toLocaleString() + '轮' : Math.round(n * (realtime?60:22)) + (realtime?'秒':'步')}</text>`;
    svg.innerHTML = markup;
  }
  function takeAction(action) {
    if(state.mode==='manual'){P.markDirty();manual.select(action);return;}
    if (state.kiln.done || state.training || state.locked || !state.initialized) return;
    const rewards = state.mode === 'ai' ? state.modelRewards : E.DEFAULT_REWARDS;
    const observed = { temp: state.kiln.temp, maturity: state.kiln.maturity, tick: state.kiln.tick };
    if (state.mode === 'ai') state.qRows = [...E.values(state.q, state.kiln)];
    const { reward } = E.step(state.kiln, action, rewards || E.DEFAULT_REWARDS);
    state.lastAction = action; P.markDirty();
    if (state.mode !== 'manual') {
      $('learningText').textContent = `看到状态：模拟窑温 ${T.format(observed.temp)}、烧成 ${observed.maturity}/3、第 ${observed.tick} 步 → 选择${E.ACTIONS[action]} → 收到奖励 ${reward.toFixed(1)}。${state.mode === 'ai' ? '下方显示决策前该状态的 Q 值；测试时不再更新 Q 表。' : '动作来自既定规则，不积累学习经验。'}`;
    }
    $('manualFeedback').textContent = state.kiln.done ? `${state.kiln.reason}。本窑能耗 ${state.kiln.energy}，共 ${state.kiln.tick} 步。可重新尝试，也可以切换模式比较。` : `选择${E.ACTIONS[action]} → 模拟窑温 ${T.format(state.kiln.temp)}，烧成进度 ${state.kiln.maturity}/3。本步奖励 ${reward.toFixed(1)}。`;
    if (state.kiln.done) {
      const s = state.kiln;
      state.records.push({ mode: state.mode, result: s.reason, success: s.success, energy: s.energy, steps: s.tick, totalReward: +s.totalReward.toFixed(1), seed: state.seed,
        rewards: { ...(rewards || E.DEFAULT_REWARDS) }, trace: structuredClone(s.trace) });
      stopAuto(); P.progress(`${modeNames[state.mode]}试烧完成`); toast(`${s.reason}，这次尝试已加入对比记录。`); updateRecordCount();
    }
    render();
  }
  function autoRun() {
    if (state.training || state.locked || !state.initialized) return;
    if (state.running) { stopAuto(); render(); return; }
    if (state.mode === 'ai' && (!state.trained || modelStale())) return;
    if (state.kiln.done) newKiln();
    state.running = true; const rng = E.random(30);
    function tick() {
      if (!state.running) return;
      const action = state.mode === 'fixed' ? E.fixed(state.kiln) : E.choose(state.q, state.kiln, rng);
      takeAction(action);
      if (state.running) state.timer = setTimeout(tick, 430);
    }
    tick();
  }
  function changeRewards() {
    if (state.locked || state.training) return;
    stopAuto();
    for (const name of ['success', 'damage', 'energy', 'time']) {
      state.rewards[name] = Number($(name + 'Reward').value);
      $(name + 'Output').textContent = (name === 'success' ? '+' : '−') + state.rewards[name];
    }
    document.querySelectorAll('[data-preset]').forEach(b => b.classList.remove('selected'));
    $('modelStatus').textContent = modelStale() ? '奖励已改变，请重新训练；旧实验记录仍保留在对比页。' : '每次训练从零开始；会保留不同奖励下的对比记录。';
    P.markDirty(); controls(); effects.sync(state); sound.sync(state); guide?.render(state);
  }
  function preset(name) {
    const settings = name === 'energy' ? { success: 100, damage: 80, energy: 2, time: 1 } : name === 'speed' ? { success: 100, damage: 80, energy: 1, time: 5 } : E.DEFAULT_REWARDS;
    for (const n of Object.keys(settings)) $(n + 'Reward').value = settings[n];
    changeRewards(); document.querySelector(`[data-preset="${name}"]`).classList.add('selected');
  }
  async function train() {
    if (state.training || state.locked || !state.initialized) return;
    stopAuto(); state.training = true; state.stopTraining = false; state.trained = false; state.q = {}; state.trainPoints = []; state.iterations = 0; newKiln();
    state.modelRewards = { ...state.rewards };
    const rewards = { ...state.rewards }, count = Number($('episodeCount').value), before = E.evaluate({}, 'ai', rewards);
    state.trainTarget = count;
    let windowWins = 0;
    $('trainingProgress').hidden = false; $('trainBar').style.width = '0%';
    P.markDirty(); render();
    while (state.iterations < count && !state.stopTraining) {
      for (let k = 0; k < 50 && state.iterations < count; k++) {
        const run = E.episode(state.q, state.iterations, rewards, 815, 2, count);
        windowWins += Number(run.success); state.iterations++;
        if (state.iterations % 50 === 0) { state.trainPoints.push({ episode: state.iterations, rate: windowWins * 2 }); windowWins = 0; }
      }
      $('trainBar').style.width = `${state.iterations / count * 100}%`;
      $('trainStatus').textContent = `已实际尝试 ${state.iterations.toLocaleString()}/${count.toLocaleString()} 窑 · Q 表 ${Object.keys(state.q).length} 个状态`;
      render(); await new Promise(resolve => setTimeout(resolve, 16));
    }
    const after = E.evaluate(state.q, 'ai', rewards);
    const replay = q => {
      const s = E.create(state.seed), rng = E.random(30);
      while (!s.done) E.step(s, E.choose(q, s, rng), rewards);
      return { result: s.reason, trace: structuredClone(s.trace) };
    };
    state.snapshots.push({ id: state.snapshots.length + 1, episodes: state.iterations, requestedEpisodes: count, stopped: state.stopTraining, rewards, before, after,
      states: Object.keys(state.q).length, curve: structuredClone(state.trainPoints), learningRate: 0.24, discount: 0.97, disturbance: 2, evaluationSeeds: [...E.EVAL_SEEDS] });
    Object.assign(state.snapshots.at(-1), { policyBefore: replay({}), policyAfter: replay(state.q), qTable: structuredClone(state.q) });
    state.training = false; state.trained = true;
    $('trainingProgress').hidden = true;
    $('modelStatus').textContent = `已训练 ${state.iterations.toLocaleString()} 轮，30 窑测试合格率 ${after.rate}%。动作来自实际学得的 Q 表。`;
    $('learningTitle').textContent = after.rate > before.rate ? '试错之后，策略改变了。' : '没有变好，也值得追问。';
    $('learningText').textContent = `同一组 30 窑：训练前 ${before.rate}%，训练后 ${after.rate}%。平均能耗 ${after.energy}，平均 ${after.steps} 步。修改奖励再训练，看看 AI 会如何取舍。`;
    P.progress('Q-learning训练及独立测试完成'); updateRecordCount(); render();
    toast(`AI 训练${state.stopTraining ? '已停止' : '完成'}。测试合格率 ${after.rate}%，已保存到本次实验记录。`);
  }
  function updateRecordCount() { $('recordCount').textContent = state.records.length + state.batches.length + state.snapshots.length || ''; }
  function labelRewards(r) { return `合格 +${r.success} / 损坏 −${r.damage} / 能耗 −${r.energy} / 耗时 −${r.time}`; }
  function tdRow(title, subtitle, r, count) { return `<tr><td>${title}<small>${subtitle}</small></td><td>${count}</td><td><span class="${r.rate >= 70 ? 'result-good' : 'result-bad'}">${r.rate}%</span></td><td>${r.energy??'—'}</td><td>${r.steps??'—'}</td><td>${r.reward??'—'}</td></tr>`; }
  function renderCompare() {
    const any = state.records.length + state.batches.length + state.snapshots.length > 0;
    $('compareEmpty').hidden = any; $('compareContent').hidden = !any;
    let html = '';
    for (const mode of ['manual', 'fixed', 'ai']) {
      const records = state.records.filter(r => r.mode === mode);
      if (!records.length) continue;
      const avg = name => {const values=records.map(r=>r[name]).filter(Number.isFinite);return values.length?+(values.reduce((a,b)=>a+b,0)/values.length).toFixed(1):null;};
      html += tdRow(modeNames[mode] + ' · 单窑尝试', mode==='manual'?'实时模型；步骤列为控火切换次数，不与AI步数比较':'仅代表本次操作，不等于稳定合格率', { rate: Math.round(records.filter(r => r.success).length / records.length * 100), energy: avg('energy'), steps: avg('steps'), reward: avg('totalReward') }, records.length);
    }
    for (const batch of state.batches) html += tdRow('固定程序 · 统一测试', '规则不学习；测试种子与 AI 相同', batch.result, batch.result.samples);
    for (const s of state.snapshots) {
      html += tdRow(`AI 实验 ${s.id} · 训练前`, labelRewards(s.rewards), s.before, s.before.samples);
      html += tdRow(`AI 实验 ${s.id} · ${s.episodes.toLocaleString()} 轮后${s.stopped ? '（提前停止）' : ''}`, labelRewards(s.rewards), s.after, s.after.samples);
    }
    $('comparisonRows').innerHTML = html;
    const last = state.records.at(-1);
    $('traceDetail').innerHTML = last ? `<b>最近一窑的动作证据 · ${modeNames[last.mode]} · ${last.result}</b><div class="trace-actions">${last.trace.slice(1).map(p => `${last.manualControlVersion===M.VERSION?p.elapsedSeconds.toFixed(1)+'秒':p.tick+'.'} ${E.ACTIONS[p.action]}（模拟窑温 ${T.format(p.temp)}）`).join(' → ')}</div>` : '<b>还可以点击“观察 AI 实际烧一窑”，查看它每一步的动作。</b>';
  }
  function readiness() {
    return [
      { text: '手动试烧至少一窑', done: state.records.some(r => r.mode === 'manual') },
      { text: '完成优先烧好实验', done: window.KilnGuide.rewardProgress(state.snapshots).quality },
      { text: '完成优先节能实验', done: window.KilnGuide.rewardProgress(state.snapshots).energy },
      { text: '选择一句实验发现', done: !!$('guidedFinding')?.value },
      { text: `完成五道实验思考题（${Q.evaluate(Q.readAnswers(), false).answeredCount}/5）`, done: Q.evaluate(Q.readAnswers(), false).answeredCount === 5 }
    ];
  }
  function renderReport() {
    if (guide) {
      $('finding').value = $('guidedFinding').value;
      $('explanation').value = window.KilnGuide.summary(state);
      guide.render(state);
    }
    const checks = readiness();
    $('reportChecklist').innerHTML = checks.map(c => `<div class="check-item ${c.done ? 'done' : ''}"><span>${c.done ? '✓' : '○'}</span>${c.text}</div>`).join('');
    const missing = checks.filter(c => !c.done);
    $('reportReadiness').textContent = missing.length ? `还需要：${missing.map(c => c.text).join('；')}。烧成失败也算完成一次实验。` : '实验材料已齐，可以提交。烧成好坏不决定你的学习评价。';
    $('submitButton').disabled = !!missing.length || state.training || state.running || (state.locked && P.state.saveState !== 'failed') || !state.initialized;
  }
  function reportData() {
    const quiz = Q.evaluate(Q.readAnswers(), readiness().slice(0,4).every(check=>check.done));
    return { version: '1.7.2', quiz, rewardPresetVersion: 'balanced-energy-v1', lessonFlow: 'manual-ai', reportMode: 'guided', explanationSource: 'system-generated-from-experiment-data', title: '邛窑AI烧窑挑战', simulation: '教学模拟，摄氏温度为内部热度状态的教学映射，不代表真实升温曲线或烧制配方', temperatureScale: T.metadata,
      prediction: $('reportPrediction').value, finding: $('finding').value.trim(), explanation: $('explanation').value.trim(),
      conceptAnswer: document.querySelector('[name="concept"]:checked')?.value || '',
      conceptQuestionId: 'reward-effects-v1', conceptQuestion: Q.questions[0].title,
      conceptAnswerText: document.querySelector('[name="concept"]:checked')?.closest('label').textContent.trim() || '',
      manualModel: {version:M.VERSION,timeUnit:'simulated-seconds',heatRate:M.HEAT_RATE,coolRate:M.COOL_RATE,firingSeconds:M.FIRING_SECONDS,maxSeconds:M.MAX_SECONDS,disturbance:0,
        hazardVersion:M.HAZARD_VERSION,highThresholdCelsius:1350,highSeconds:M.HIGH_SECONDS,lowThresholdCelsius:300,lowSeconds:M.LOW_SECONDS,relightCooldownSeconds:M.RELIGHT_SECONDS},
      comparisonScope: '手动为连续控火体验，AI为独立离散教学模型；不能作为同条件胜负比较。',
      experimentSeed: state.seed, disturbance: 2, records: state.records.map(r => ({...structuredClone(r), trace: r.trace.map(p => ({...p, temperatureCelsius: T.celsius(p.temp)}))})), fixedTests: structuredClone(state.batches), trainingExperiments: structuredClone(state.snapshots),
      durationSeconds: Math.max(0, Math.floor((Date.now() - P.state.startedAt) / 1000)) };
  }
  function reportText(data, includeGrading = true) {
    const lines = [data.title, '版本 1.7.2 · 实时控火与教AI烧 · 模拟窑温（℃）', '', `学生选择的发现：${data.finding}`, '', `系统整理的实验数据（非学生解释）：${data.explanation}`, '', '手动与AI试烧记录：'];
    for (const r of data.records) {
      if(r.events?.length)lines.push(`窑火事件：${r.events.map(e=>`${e.elapsedSeconds.toFixed(1)}秒 ${({flameout:'低温熄火',relight:'冷却后重新点火',blast:'持续高温炸膛'})[e.type]||e.type}`).join(' → ')}`);
      if(r.manualControlVersion===M.VERSION)lines.push(`${modeNames[r.mode]}（实时控火）：${r.result}；能耗 ${r.energy}；模拟时长 ${r.simulatedDurationSeconds.toFixed(1)} 秒；切换 ${r.steps} 次`, `控火选择：${r.controlChanges.map(p=>`${p.elapsedSeconds.toFixed(1)}秒 ${E.ACTIONS[p.action]}`).join(' → ')}`,`温度轨迹：${r.trace.map(p=>`${p.elapsedSeconds.toFixed(1)}秒 ${T.format(p.temp)}`).join(' → ')}`);
      else lines.push(`${modeNames[r.mode]}：${r.result}；能耗 ${r.energy}；${r.steps} 步；累计奖励 ${r.totalReward}`, `动作轨迹：${r.trace.slice(1).map(p => `${E.ACTIONS[p.action]}(模拟窑温${T.format(p.temp)})`).join(' → ')}`);
    }
    for (const b of data.fixedTests) lines.push(`固定程序统一测试：${b.result.samples} 窑；合格率 ${b.result.rate}%；平均能耗 ${b.result.energy}；平均 ${b.result.steps} 步`);
    for (const s of data.trainingExperiments) lines.push('', `AI 实验 ${s.id}：实际训练 ${s.episodes}/${s.requestedEpisodes} 轮${s.stopped ? '（提前停止）' : ''}，${s.states} 个已访问状态`, labelRewards(s.rewards), `同组30窑测试：训练前 ${s.before.rate}%，训练后 ${s.after.rate}%；后测平均能耗 ${s.after.energy}；平均 ${s.after.steps} 步`);
    lines.push('', includeGrading ? `成绩：${data.quiz.total}/100；实验完成${data.quiz.processPoints}/50；答题${data.quiz.quizPoints}/50，答对${data.quiz.correctCount}/5题。` : '答题草稿，提交后显示评分与解析。');
    for (const [index,item] of data.quiz.items.entries()) {
      lines.push('',`${index+1}. ${item.question}`,`我的回答：${item.selectedAnswerText||'未回答'}`);
      if(includeGrading)lines.push(`正确答案：${item.correctAnswerText}`,`本题得分：${item.points}/10`,item.explanation);
    }
    lines.push('', data.simulation);
    return lines.join('\n');
  }
  function bytesBase64(text) { const bytes = new TextEncoder().encode(text); let result = ''; for (let i = 0; i < bytes.length; i += 8192) result += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(result); }
  function download(text, name, type) {
    const url = URL.createObjectURL(new Blob(['\uFEFF', text], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function submit() {
    if (readiness().some(c => !c.done) || P.state.saveState === 'saving' || P.state.saveState === 'saved' || state.training || state.running) return;
    // Freeze the UI on the first attempt. The platform client retries the identical report.
    state.locked = true; controls(); renderReport();
    document.querySelectorAll('.report-form input,.report-form textarea,.report-form select,#prediction,#exportButton').forEach(el => { el.disabled = true; });
    $('submitButton').disabled = true; $('saveStatus').textContent = P.state.demo ? '正在整理预览报告…' : '正在上传实验报告并保存成绩…';
    const data = reportData(), quiz = data.quiz;
    const result = { score: quiz.total, scoreText: `实验完成 ${quiz.processPoints} 分 + 答题 ${quiz.quizPoints} 分`, lessonFlow: 'manual-ai', brief: `完成手动试烧与 ${state.snapshots.length} 次 AI 奖励实验；五题答对 ${quiz.correctCount} 题。`,
      resultItems: [
        { label: '实验完成', value: '我来烧、教AI烧与两组奖励对照' },
        { label: '我的发现', value: data.finding },
        { label: '实验数据（系统整理）', value: data.explanation },
        { label: '实验思考', value: data.conceptQuestion },
        { label: '我的回答', value: data.conceptAnswerText },
        { label: '概念理解', value: `五题答对 ${quiz.correctCount}/5，答题 ${quiz.quizPoints}/50 分` },
        { label: '成绩构成', value: `实验完成 ${quiz.processPoints}/50 分；答题 ${quiz.quizPoints}/50 分；总分 ${quiz.total}/100 分` },
        ...quiz.items.map((item,index)=>({label:`实验思考 ${index+1}`,value:`${item.question}\n我的回答：${item.selectedAnswerText}；正确答案：${item.correctAnswerText}；得分 ${item.points}/10。${item.explanation}`})),
        ...state.snapshots.map(s => ({ label: `AI 实验 ${s.id}`, value: `${s.episodes}轮；${labelRewards(s.rewards)}；前测${s.before.rate}%→后测${s.after.rate}%` }))
      ], processSummary: '两个环节：我来烧、教AI烧；完成实验得50分，五道实验思考每题答对得10分，满分100分。',
      pendingArtifacts: [
        { localId: 'report-text', fileName: 'qiong-kiln-report.txt', mimeType: 'text/plain', kind: 'experiment-report', contentBase64: bytesBase64(reportText(data)), metadata: { title: '烧窑实验报告' } },
        { localId: 'experiment-data', fileName: 'qiong-kiln-experiments.json', mimeType: 'application/json', kind: 'experiment-data', contentBase64: bytesBase64(JSON.stringify(data)), metadata: { title: '完整实验数据与动作轨迹' } }
      ] };
    try {
      const saved = await P.complete(result);
      $('saveStatus').textContent = (saved.demo ? '预览报告已完成，未提交到平台。可以导出到本机。' : '成绩已保存，实验报告与数据附件已提交。') + `\n本次 ${quiz.total} 分：实验完成 ${quiz.processPoints} 分，五题答对 ${quiz.correctCount} 题，答题 ${quiz.quizPoints} 分。`;
      $('quizReview').replaceChildren(...quiz.items.map((item,index)=>{const row=document.createElement('p');row.textContent=`第${index+1}题：${item.isCorrect?'答对，10分':'答错，0分'}。正确答案：${item.correctAnswerText} ${item.explanation}`;return row;}));
      $('quizReview').hidden=false;
      $('submitButton').textContent = saved.demo ? '预览报告已完成 ✓' : '报告已提交 ✓';
      $('exportButton').disabled = false; $('returnButton').hidden = saved.demo;
    } catch {
      $('saveStatus').textContent = '保存未完成。实验报告已保留在当前页面，请检查网络后重试；已成功上传的附件不会重复上传。';
      $('submitButton').disabled = false; $('submitButton').textContent = '重试保存报告'; $('exportButton').disabled = false;
    }
  }
  document.querySelectorAll('button[data-view]').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
  document.querySelectorAll('button[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  document.querySelectorAll('[data-action]').forEach(b => b.addEventListener('click', () => takeAction(Number(b.dataset.action))));
  document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => preset(b.dataset.preset)));
  document.querySelectorAll('.sliders input').forEach(el => el.addEventListener('input', changeRewards));
  document.querySelectorAll('.report-form input,.report-form textarea').forEach(el => el.addEventListener('input', () => { P.markDirty(); renderReport(); }));
  $('prediction').addEventListener('change', () => syncPrediction('prediction', 'reportPrediction'));
  $('reportPrediction').addEventListener('change', () => { syncPrediction('reportPrediction', 'prediction'); renderReport(); });
  $('resetRun').addEventListener('click', () => { stopAuto(); if (state.kiln.tick && !state.kiln.done) toast('已重新开窑；未结束的上一窑不计入对比。'); newKiln(); });
  $('runFixed').addEventListener('click', autoRun); $('runAI').addEventListener('click', autoRun);
  $('fixedBatch').addEventListener('click', () => {
    if (state.locked || state.training || !state.initialized) return;
    if (state.batches.length) { toast('同条件 30 窑的固定程序记录已存在，可以到对比页查看。'); return; }
    state.batches.push({ rewards: { ...E.DEFAULT_REWARDS }, result: E.evaluate({}, 'fixed'), evaluationSeeds: [...E.EVAL_SEEDS] });
    P.progress('固定程序30窑测试完成'); updateRecordCount(); toast('固定程序已完成同条件 30 窑测试，记录已加入对比页。');
  });
  $('trainButton').addEventListener('click', async () => { if (state.training || state.locked || !state.initialized) return; await train(); if (state.trained && !state.stopTraining) autoRun(); });
  $('cancelTraining').addEventListener('click', () => { state.stopTraining = true; });
  $('goCompare').addEventListener('click', () => showView('compare'));
  $('helpButton').addEventListener('click', () => $('guideDialog').showModal());
  $('predictionButton').addEventListener('click', () => $('predictionDialog').showModal());
  for (const id of ['closePrediction', 'confirmPrediction']) $(id).addEventListener('click', () => $('predictionDialog').close());
  for (const id of ['closeGuide', 'startExperiment']) $(id).addEventListener('click', () => $('guideDialog').close());
  $('exportButton').addEventListener('click', () => { download(reportText(reportData(), P.state.saveState === 'saved'), '邛窑AI烧窑挑战-实验报告.txt', 'text/plain;charset=utf-8'); toast('实验报告已导出到本机。'); });
  $('submitButton').addEventListener('click', submit);
  $('returnButton').addEventListener('click', () => { if (P.state.saveState === 'saved') P.returnToPortal(); });
  // Avoid a classroom restart link that silently discards launch context.
  document.querySelector('.brand').removeAttribute('href');
  async function initialize() {
    $('launchError').hidden = true; $('platformNotice').textContent = '正在验证课堂入口…';
    try {
      await P.initialize(); state.initialized = true;
      $('platformNotice').textContent = P.state.demo ? '本地预览，成绩不会保存' : '课堂入口已验证 · 完成实验后请提交报告';
      render(); guide?.welcome();
    } catch {
      state.initialized = false; $('launchError').hidden = false;
      $('launchErrorMessage').textContent = '入口缺失、已过期或课堂暂未开放。请从学生后台重新进入，或检查网络后重新验证。';
      $('platformNotice').textContent = '课堂入口未验证'; controls();
    }
  }
  $('retryLaunch').addEventListener('click', initialize);
  $('recordCount').textContent = '';
  guide = window.KilnGuide.mount({ mode: setMode, view: showView, changed: () => { P.markDirty(); renderReport(); } });
  $('reportPrediction').append(new Option('未记录课前预测', '未记录课前预测')); $('reportPrediction').value = '未记录课前预测';
  render(); renderReport(); initialize();
})();
