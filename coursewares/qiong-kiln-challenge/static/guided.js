/* Guided presentation; all results still come from the simulation and Q table. */
(function (root) {
  'use strict';
  function hint(s) {
    if (s.done) return s.success ? '烧好了！可以进入下一步。' : '这一窑没有成功，也留下了经验。可以重试或继续。';
    if (s.maturity >= 3) return '已经烧熟了，点“降温”，准备出窑。';
    if (s.temp > 80) return '火太大了，点“降温”。';
    if (s.temp >= 58) return '火候正好，点“保持”，等烧成进度满格。';
    return '火候还不够，点“加热”。';
  }
  function rewardKind(rewards) {
    if (rewards.success !== 100 || rewards.damage !== 80 || rewards.time !== 1) return 'custom';
    return rewards.energy === 1 ? 'quality' : [2, 5].includes(rewards.energy) ? 'energy' : 'custom';
  }
  function rewardLabel(rewards) { return {quality:'优先烧好',energy:'优先节能',custom:'自定义奖励'}[rewardKind(rewards)]; }
  function latestTrials(snapshots) {
    const latest = new Map();
    for (const s of snapshots) if (s.episodes !== 0 && s.after.samples > 0) latest.set(rewardKind(s.rewards), s);
    return ['quality', 'energy', 'custom'].flatMap(kind => latest.has(kind) ? [latest.get(kind)] : []);
  }
  function comparisonInsight(snapshots) {
    const latest = latestTrials(snapshots), quality = latest.find(s => rewardKind(s.rewards) === 'quality'), energy = latest.find(s => rewardKind(s.rewards) === 'energy');
    if (!quality || !energy) return '两种偏好各完成一次学习后，比较合格率和能耗。';
    const a = quality.after, b = energy.after;
    if (b.energy < a.energy && a.energy > 0) return `${a.rate === b.rate ? '两组合格率相同' : `合格率 ${a.rate}% → ${b.rate}%`}；优先节能的平均能耗降低 ${((a.energy - b.energy) / a.energy * 100).toFixed(1)}%。`;
    if (a.rate === b.rate && a.energy === b.energy) return '本次两组表现相同，改变奖励不保证每次都产生不同结果。';
    return '本次节能方案未减少平均能耗；保留实际结果，不代表节能目标已经实现。';
  }
  function rewardProgress(snapshots) {
    const quality = snapshots.some(s => rewardKind(s.rewards) === 'quality' && s.episodes > 0 && s.after.samples > 0);
    const energy = snapshots.some(s => rewardKind(s.rewards) === 'energy' && s.episodes > 0 && s.after.samples > 0);
    return {quality, energy, count: Number(quality) + Number(energy)};
  }
  function summary(state) {
    const manual = state.records.filter(r => r.mode === 'manual').at(-1);
    const trials = latestTrials(state.snapshots).map(s => `${rewardLabel(s.rewards)}：测试${s.after.samples}窑，合格率${s.after.rate}%，平均能耗${s.after.energy}，平均${s.after.steps}步。`);
    return [manual && `我来烧：${manual.result}，能耗${manual.energy}，${manual.steps}步。`, ...trials].filter(Boolean).join('\n');
  }
  function mount(callbacks) {
    const $ = id => document.getElementById(id);
    let welcomed = false;
    document.body.classList.add('guided');
    const dialog = $('guideDialog'), close = $('closeGuide'), start = $('startExperiment');
    const intro = document.createElement('div');
    intro.innerHTML = '<h2 id="entryGuideTitle">两步，学会教AI烧窑</h2><p id="entryGuideNote">先自己试，再改变奖励，看AI怎么学。</p><ol class="entry-steps"><li><strong>我来烧</strong><span>跟着火候提示，点加热、保持或降温，完成一窑。</span></li><li><strong>教AI烧</strong><span>“优先烧好”和“优先节能”各学习一次，完成2/2即可继续。失败也算实验，不用反复看。</span></li></ol><p class="entry-note">最后选一句发现、答一道题，提交报告。这里的摄氏温度与烧成规则为教学模拟，不是真实烧制配方。</p>';
    start.textContent = '开始实验'; start.autofocus = true;
    dialog.replaceChildren(close, intro, start);
    dialog.setAttribute('aria-labelledby', 'entryGuideTitle'); dialog.setAttribute('aria-describedby', 'entryGuideNote');
    const band = document.createElement('section'); band.className = 'guide-band';
    band.innerHTML = '<div><span id="guideStage"></span><h2 id="guideTitle"></h2><p id="guideHint" aria-live="polite"></p></div><button id="guideNext" class="button primary"></button>';
    $('labView').append(band);
    const meter = document.createElement('progress');
    meter.id = 'heatMeter'; meter.max = root.KilnTemperature.max; meter.value = root.KilnTemperature.celsius(20);
    meter.setAttribute('aria-label', '模拟窑温，单位摄氏度');
    document.querySelector('.heat-reading').append(meter);
    document.querySelectorAll('.action-button').forEach(button => {
      const art = document.createElement('span'); art.className = 'lever-art';
      art.setAttribute('aria-hidden', 'true'); button.prepend(art);
    });
    const reportBack = document.createElement('button');
    reportBack.className = 'button secondary report-back';
    reportBack.textContent = '返回窑场';
    reportBack.addEventListener('click', () => callbacks.view('lab'));
    document.querySelector('#reportView .section-intro').prepend(reportBack);
    $('fixedTab').hidden = true;
    for (const [id, label] of [['manualTab','1 我来烧'],['aiTab','2 教AI烧']]) {
      $(id).querySelector('span').textContent = label; $(id).setAttribute('aria-label', label);
    }
    const details = document.createElement('details'); details.className = 'teacher-details';
    details.innerHTML = '<summary>进阶设置与数据</summary>';
    const ai = document.querySelector('.ai-sheet');
    for (const selector of ['.sliders', '.train-count', '#qValues']) details.append(ai.querySelector(selector));
    const chart = document.createElement('details'); chart.className = 'teacher-details'; chart.innerHTML = '<summary>查看温度曲线</summary>';
    for (const id of ['chartTitle', 'chartCurrent']) $(id).parentElement.hidden = true;
    chart.append($('chart'), document.querySelector('.chart-caption'));
    document.querySelector('.status-panel').append(chart);
    ai.append(details);
    ai.querySelector('.sheet-heading h2').textContent = '你想让AI更重视什么？';
    ai.querySelector('.sheet-heading span').textContent = '选偏好，再点开始学习';
    ai.querySelector('[data-preset="quality"]').textContent = '优先烧好';
    ai.querySelector('[data-preset="energy"]').textContent = '优先节能';
    ai.querySelector('[data-preset="speed"]').hidden = true;
    const results = document.createElement('section'); results.id = 'guideResults'; results.className = 'guide-results';
    results.innerHTML = '<table><caption>最近完成的对照测试</caption><thead><tr><th scope="col">方案</th><th scope="col">合格率</th><th scope="col">平均能耗</th></tr></thead><tbody id="guideResultRows"></tbody></table><p id="comparisonInsight"></p>';
    ai.insertBefore(results, details);
    const principle = document.createElement('p'); principle.className = 'ai-principle';
    principle.textContent = '普通程序按人写好的规则操作；AI通过反复试错，根据奖励学习如何选择。';
    ai.querySelector('.sheet-heading').after(principle);
    const progress = document.createElement('p'); progress.id = 'rewardProgress'; progress.className = 'reward-progress'; progress.setAttribute('role','status');
    ai.querySelector('.reward-presets').before(progress);
    $('fixedPanel').querySelector('.sheet-heading h2').textContent = '看看固定程序怎么烧';
    $('fixedPanel').querySelector('.muted').textContent = '它按人写好的规则操作，反复运行也不会自己学习。';
    $('fixedPanel').querySelector('.rules-list').hidden = true;
    $('fixedPanel').querySelector('.tiny').hidden = true;
    $('fixedBatch').hidden = true;
    $('predictionButton').hidden = true;
    $('goCompare').hidden = true;
    $('manualFeedback').parentElement.hidden = true;
    document.querySelector('.main-nav').hidden = true;
    document.querySelector('.status-heading h2').textContent = '这一窑';
    $('stepValue').closest('.small-reading').hidden = true;
    $('reportPrediction').closest('label').hidden = true;
    for (const id of ['finding', 'explanation']) $(id).closest('label').hidden = true;
    const choice = document.createElement('label'); choice.className = 'discovery-choice';
    choice.innerHTML = '这次实验，我发现了什么？<select id="guidedFinding"><option value="">请选择你的发现</option><option>改变奖励，会影响AI的选择。</option><option>AI学到的策略，取决于奖励标准。</option><option>只追求省能耗，也可能烧不出成品。</option><option>我还不确定，需要再比较一次。</option></select>';
    document.querySelector('.report-form').prepend(choice);
    const auto = document.createElement('section'); auto.className = 'auto-report'; auto.innerHTML = '<h3>我的实验记录</h3><pre id="guidedSummary"></pre><small>系统根据实际操作整理，不代表学生的解释。</small>';
    choice.after(auto);
    document.querySelector('#reportView .section-intro h2').textContent = '选一句发现，完成实验';
    document.querySelector('#reportView .section-intro p').textContent = '数据已经整理好了，再回答下面的问题即可提交。';
    document.querySelector('.report-summary>p').textContent = '完成手动试烧，比较优先烧好与优先节能两组实验，并理解AI如何根据奖励学习。';
    document.querySelector('.report-summary>small').textContent = '报告包含手动试烧、AI奖励实验、实际动作轨迹、训练前后测试和你选择的发现。';
    $('guidedFinding').addEventListener('change', callbacks.changed);
    $('guideNext').addEventListener('click', () => {
      if (document.body.dataset.view !== 'lab') callbacks.view('lab');
      else if (document.body.dataset.mode === 'manual') callbacks.mode('ai');
      else callbacks.view('report');
    });
    return {
      welcome() { if (!welcomed) { welcomed = true; if (!dialog.open) dialog.showModal(); } },
      render(state) {
        const report = document.body.dataset.view !== 'lab';
        const busy = state.training || state.running || state.locked || !state.initialized;
        const progress = rewardProgress(state.snapshots);
        const done = state.mode === 'manual' ? state.records.some(r => r.mode === 'manual') : progress.count === 2;
        const remaining = progress.quality ? '优先节能' : '优先烧好';
        $('guideStage').textContent = report ? '完成实验' : state.mode === 'manual' ? '第一步 · 自己试试' : '第二步 · 教AI烧';
        $('guideTitle').textContent = report ? '你的发现，比烧成结果更重要' : state.mode === 'manual' ? '把这一窑烧好' : '改变奖励，看看AI如何选择';
        $('guideHint').textContent = report ? '选一句发现，回答一个问题。' : state.mode === 'manual' ? hint(state.kiln) : state.training ? 'AI正在通过试错学习，请稍候。' : state.running ? '正在演示学到的动作；烧成失败也算完成。' : done ? '已完成2/2，点击“看看我的发现”即可继续。' : `已完成${progress.count}/2，还差“${remaining}”：选中后点学习并演示。`;
        $('guideNext').textContent = report ? '返回实验' : state.mode === 'manual' ? '下一步：教AI烧' : '看看我的发现';
        $('guideNext').disabled = busy || (!report && !done);
        $('statusHint').textContent = state.training ? '正在学习' : state.kiln.done ? state.kiln.reason : state.kiln.maturity >= 3 ? '准备出窑' : state.kiln.temp >= 58 && state.kiln.temp <= 80 ? '火候正好' : state.kiln.temp > 80 ? '火候偏大' : '火候不足';
        const text = summary(state); $('guidedSummary').textContent = text || '先完成两个环节，实际数据会出现在这里。';
        $('rewardProgress').textContent = `已完成 ${progress.count}/2 · 优先烧好${progress.quality ? '已完成' : '未完成'} · 优先节能${progress.energy ? '已完成' : '未完成'}`;
        const latest = latestTrials(state.snapshots), currentKind = rewardKind(state.rewards);
        $('guideResultRows').replaceChildren(...['quality','energy', ...(latest.some(s => rewardKind(s.rewards) === 'custom') ? ['custom'] : [])].map(kind => {
          const s = latest.find(s => rewardKind(s.rewards) === kind), row = document.createElement('tr');
          row.dataset.kind = kind; row.classList.toggle('current', kind === currentKind);
          for (const [index, value] of [{quality:'优先烧好',energy:'优先节能',custom:'自定义奖励'}[kind], s ? `${s.after.rate}%` : '未测试', s ? String(s.after.energy) : '—'].entries()) {
            const cell = document.createElement(index === 0 ? 'th' : 'td'); if (index === 0) cell.scope = 'row'; cell.textContent = value; row.append(cell);
          }
          return row;
        }));
        $('comparisonInsight').textContent = comparisonInsight(state.snapshots);
        const sameModel = state.trained && ['success','damage','energy','time'].every(key => state.modelRewards?.[key] === state.rewards[key]);
        const currentTrial = latest.find(s => ['success','damage','energy','time'].every(key => s.rewards[key] === state.rewards[key]));
        $('modelStatus').textContent = state.training ? `${rewardLabel(state.rewards)} · 正在学习 ${state.iterations.toLocaleString()}/${state.trainTarget.toLocaleString()} 轮`
          : !sameModel ? `${rewardLabel(state.rewards)} · 待学习${currentTrial ? '（下表保留最近完成的测试）' : ''}`
          : `${rewardLabel(state.rewards)} · 已训练 ${state.iterations.toLocaleString()} 轮。`;
        $('guidedFinding').disabled = state.locked;
        $('heatMeter').value = root.KilnTemperature.celsius(state.kiln.temp);
        $('heatMeter').setAttribute('aria-valuetext', `模拟窑温${root.KilnTemperature.format(state.kiln.temp)}`);
      }
    };
  }
  root.KilnGuide = { hint, summary, rewardKind, rewardLabel, rewardProgress, latestTrials, comparisonInsight, mount };
  if (typeof module !== 'undefined') module.exports = root.KilnGuide;
})(typeof window !== 'undefined' ? window : globalThis);
