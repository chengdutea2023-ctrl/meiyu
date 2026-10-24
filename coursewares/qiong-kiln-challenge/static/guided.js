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
  function summary(state) {
    const manual = state.records.filter(r => r.mode === 'manual').at(-1);
    const fixed = state.records.filter(r => r.mode === 'fixed').at(-1);
    const trials = state.snapshots.map(s => `${s.rewards.energy === 5 ? '优先节能' : s.rewards.energy === 1 && s.rewards.time === 1 ? '优先烧好' : '自定义奖励'}：测试${s.after.samples}窑，合格率${s.after.rate}%，平均能耗${s.after.energy}，平均${s.after.steps}步。`);
    return [manual && `我来烧：${manual.result}，能耗${manual.energy}，${manual.steps}步。`, fixed && `程序烧：${fixed.result}，能耗${fixed.energy}，${fixed.steps}步。`, ...trials].filter(Boolean).join('\n');
  }
  function mount(callbacks) {
    const $ = id => document.getElementById(id);
    let welcomed = false;
    document.body.classList.add('guided');
    const dialog = $('guideDialog'), close = $('closeGuide'), start = $('startExperiment');
    const intro = document.createElement('div');
    intro.innerHTML = '<h2 id="entryGuideTitle">三步，学会让AI烧窑</h2><p id="entryGuideNote">先自己试，再看程序，最后让AI学习。</p><ol class="entry-steps"><li><strong>我来烧</strong><span>跟着火候提示，点加热、保持或降温。</span></li><li><strong>程序烧</strong><span>点一下，让固定规则自动烧一窑。</span></li><li><strong>AI学习</strong><span>分别试试“优先烧好”和“优先节能”，看看AI如何选择。</span></li></ol><p class="entry-note">最后选一句发现、答一道题，提交报告。这里是教学模拟，不是真实烧制配方。</p>';
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
    const stages = ['1 我来烧', '2 程序烧', '3 AI学习'];
    document.querySelectorAll('.mode-tab').forEach((b, i) => { b.querySelector('span').textContent = stages[i]; b.setAttribute('aria-label', stages[i]); });
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
    const results = document.createElement('p'); results.id = 'guideResults'; results.className = 'guide-results'; ai.append(results);
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
    choice.innerHTML = '这次实验，我发现了什么？<select id="guidedFinding"><option value="">请选择你的发现</option><option>改变奖励，会影响AI的选择。</option><option>AI不一定比固定程序更好。</option><option>只追求省能耗，也可能烧不出成品。</option><option>我还不确定，需要再比较一次。</option></select>';
    document.querySelector('.report-form').prepend(choice);
    const auto = document.createElement('section'); auto.className = 'auto-report'; auto.innerHTML = '<h3>我的实验记录</h3><pre id="guidedSummary"></pre><small>系统根据实际操作整理，不代表学生的解释。</small>';
    choice.after(auto);
    document.querySelector('#reportView .section-intro h2').textContent = '选一句发现，完成实验';
    document.querySelector('#reportView .section-intro p').textContent = '数据已经整理好了，再回答下面的问题即可提交。';
    $('guidedFinding').addEventListener('change', callbacks.changed);
    $('guideNext').addEventListener('click', () => {
      if (document.body.dataset.view !== 'lab') callbacks.view('lab');
      else if (document.body.dataset.mode === 'manual') callbacks.mode('fixed');
      else if (document.body.dataset.mode === 'fixed') callbacks.mode('ai');
      else callbacks.view('report');
    });
    return {
      welcome() { if (!welcomed) { welcomed = true; if (!dialog.open) dialog.showModal(); } },
      render(state) {
        const report = document.body.dataset.view !== 'lab';
        const busy = state.training || state.running || state.locked || !state.initialized;
        const done = state.mode === 'manual' ? state.records.some(r => r.mode === 'manual') : state.mode === 'fixed' ? state.records.some(r => r.mode === 'fixed') : new Set(state.snapshots.map(s => JSON.stringify(s.rewards))).size >= 2;
        $('guideStage').textContent = report ? '完成实验' : ['第一步 · 自己试试', '第二步 · 观察规则', '第三步 · 比较奖励'][['manual','fixed','ai'].indexOf(state.mode)];
        $('guideTitle').textContent = report ? '你的发现，比烧成结果更重要' : state.mode === 'manual' ? '把这一窑烧好' : state.mode === 'fixed' ? '让固定程序烧一窑' : '让AI试错，再换个偏好试试';
        $('guideHint').textContent = report ? '不用写长报告。选一句发现，回答一个问题。' : state.mode === 'manual' ? hint(state.kiln) : state.mode === 'fixed' ? state.running ? '观察它什么时候加热、保持和降温。' : done ? '程序执行了预设规则。接下来看看会学习的AI。' : '点“自动烧一窑”，不用自己操作。' : state.training ? 'AI正在通过试错学习，请稍候。' : state.running ? '现在演示它实际学到的动作，不保证每次成功。' : done ? '两种奖励的结果已记录，可以整理报告。' : '先选“优先烧好”并学习，再选“优先节能”重新学习。';
        $('guideNext').textContent = report ? '返回实验' : state.mode === 'manual' ? '下一步：程序烧' : state.mode === 'fixed' ? '下一步：AI学习' : '看看我的发现';
        $('guideNext').disabled = busy || (!report && !done);
        $('statusHint').textContent = state.training ? '正在学习' : state.kiln.done ? state.kiln.reason : state.kiln.maturity >= 3 ? '准备出窑' : state.kiln.temp >= 58 && state.kiln.temp <= 80 ? '火候正好' : state.kiln.temp > 80 ? '火候偏大' : '火候不足';
        const text = summary(state); $('guidedSummary').textContent = text || '先完成三个步骤，实际数据会出现在这里。';
        $('guideResults').textContent = state.snapshots.map(s => `${s.rewards.energy === 5 ? '优先节能' : '奖励实验'}：合格率 ${s.after.rate}% · 平均能耗 ${s.after.energy}`).join('\n');
        $('guidedFinding').disabled = state.locked;
        $('heatMeter').value = root.KilnTemperature.celsius(state.kiln.temp);
        $('heatMeter').setAttribute('aria-valuetext', `模拟窑温${root.KilnTemperature.format(state.kiln.temp)}`);
      }
    };
  }
  root.KilnGuide = { hint, summary, mount };
  if (typeof module !== 'undefined') module.exports = root.KilnGuide;
})(typeof window !== 'undefined' ? window : globalThis);
