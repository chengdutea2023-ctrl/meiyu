/* Guided presentation; all results still come from the simulation and Q table. */
(function (root) {
  'use strict';
  const D=root.KilnDemonstrations||(typeof require==='function'?require('./demonstrations.js'):null);
  const C=root.KilnFinalComparison||(typeof require==='function'?require('./final-comparison.js'):null);
  const HEAT_STAGES=[
    {key:'cold',label:'低温区',range:'＜1000℃',meaning:'升温准备，尚未烧熟'},
    {key:'firing',label:'烧成区',range:'1000–1200℃',meaning:'累计6秒，增加烧成进度'},
    {key:'warning',label:'过热警告',range:'1200–1350℃',meaning:'火候偏大，注意降温'},
    {key:'danger',label:'危险区',range:'≥1350℃',meaning:'持续2秒会炸膛'}
  ];
  function heatStage(s,mode='manual'){
    const index=s.temp>=94?3:s.temp>80?2:s.temp>=58?1:0,stage={...HEAT_STAGES[index]};
    if(mode!=='manual'){
      if(index===1)stage.meaning='累计3步，增加烧成进度';
      if(index===1&&s.profile?.id==='variable-kiln-v1')stage.meaning='火候与窑况影响烧成进度';
      if(index===3)stage.meaning='达到阈值，过热损坏';
    }
    if(index===0&&s.maturity>=3)stage.meaning=s.success?'冷却完成，可以出窑':'冷却阶段，准备出窑';
    return stage;
  }
  function hint(s) {
    if (s.done) return s.success ? '烧好了！可以进入下一步。' : s.exploded?'持续高温导致炸膛！本窑已结束，重新开窑或继续下一步。':'这一窑没有成功，也留下了经验。可以重试或继续。';
    if(s.manualControlVersion==='realtime-v1'){
      if(s.paused&&s.action!==null)return s.fireState==='out'&&s.cooldownRemaining>0?'冷却已暂停，点击“降温”继续倒计时。':s.pauseReason||'已暂停，点击加热或降温继续。';
      if(s.fireState==='out')return s.cooldownRemaining>1e-7?`低温熄火，重新点火冷却中：${Math.ceil(s.cooldownRemaining)}秒。`:'冷却结束，请点击“重新点火”继续烧窑。';
      if(s.highSeconds>0)return `高温危险！${s.highSeconds.toFixed(1)}/2秒，立即降温，持续过热会炸膛。`;
      if(s.maturity>=3)return '已经烧熟了，切换“降温”，冷却后出窑。';
      if(s.temp>80)return '接近过热！切换“降温”，1350℃以上持续2秒会炸膛。';
      if(s.lowSeconds>0)return `低温警告：低于300℃已${s.lowSeconds.toFixed(1)}/3秒，及时加热，避免熄火。`;
      if(s.temp>=58)return `进入烧成区，累计${Math.min(6,s.inRangeSeconds).toFixed(1)}/6秒；注意别超过1200℃。`;
      return s.action===2?'正在降温；火候不足时可切换“加热”。':s.action===0?'正在持续加热，观察温度和烧成进度。':'点击“加热”开始，随后及时切换“降温”。';
    }
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
    if(snapshots.some(s=>s.demonstrationVersion))return D.insight(snapshots);
    const latest = latestTrials(snapshots), quality = latest.find(s => rewardKind(s.rewards) === 'quality'), energy = latest.find(s => rewardKind(s.rewards) === 'energy');
    if (!quality || !energy) return '两种偏好各完成一次学习后，比较合格率和能耗。';
    const a = quality.after, b = energy.after;
    if(a.samples!==b.samples||a.environmentId!==b.environmentId||a.cohortId!==b.cohortId)return '两组测试条件不同，不能直接比较；请在同组窑况下重新测试。';
    if(b.rate===0)return '节能组未烧出合格品，不能把低耗能当作节能成功；请检查奖励并重新测试。';
    if(b.energy<a.energy&&a.energy>0&&b.rate<a.rate){
      const cost=Number.isFinite(a.energyPerQualified)&&Number.isFinite(b.energyPerQualified)?`计入失败耗能后，每件合格品能耗${a.energyPerQualified} → ${b.energyPerQualified}。`:'';
      return `每窑能耗下降${((a.energy-b.energy)/a.energy*100).toFixed(1)}%，合格率下降${a.rate-b.rate}个百分点；省能与稳定性存在取舍。${cost}`;
    }
    if (b.energy < a.energy && a.energy > 0) return `${a.rate === b.rate ? '两组合格率相同' : `合格率 ${a.rate}% → ${b.rate}%`}；优先节能的平均能耗降低 ${((a.energy - b.energy) / a.energy * 100).toFixed(1)}%。`;
    if (a.rate === b.rate && a.energy === b.energy) return '本次两组表现相同，改变奖励不保证每次都产生不同结果。';
    return '本次节能方案未减少平均能耗；保留实际结果，不代表节能目标已经实现。';
  }
  function decisionEvidence(state){
    if(state.training)return `已试错${state.iterations.toLocaleString()}次：AI根据奖励更新动作选择。`;
    const same=Array.isArray(state.selectedTypes)?D.modelMatches(state):state.trained&&['success','damage','energy','time'].every(k=>state.modelRewards?.[k]===state.rewards[k]),d=state.lastDecision;
    if(same&&d)return `看到${d.temperatureCelsius}℃、进度${d.maturity}/3 → 选择${d.action}；反馈：进度+${d.progressGain}，奖励${d.reward>=0?'+':''}${d.reward}。`;
    return Array.isArray(state.selectedTypes)?'先参考60次示范，再自主试错300轮，用同组100窑检验。':'你设奖励目标，AI通过试错学习动作，再用同组窑况检验。';
  }
  function rewardProgress(snapshots) {
    const quality = snapshots.some(s => rewardKind(s.rewards) === 'quality' && s.episodes > 0 && s.after.samples > 0);
    const energy = snapshots.some(s => rewardKind(s.rewards) === 'energy' && s.episodes > 0 && s.after.samples > 0);
    return {quality, energy, count: Number(quality) + Number(energy)};
  }
  function summary(state) {
    const manual = state.finalPolicyId!==undefined?state.records.find(r=>r.mode==='manual'):state.records.filter(r => r.mode === 'manual').at(-1);
    const trials = state.snapshots.some(s=>s.demonstrationVersion)?D.latestTrials(state.snapshots).map((s,i)=>`组合${i+1}（${D.names(s.selectedTypes).join('、')}）：同组${s.after.samples}窑，参考示范后${s.afterDemonstrations.rate}%，自主练习后${s.after.rate}%，平均能耗${s.after.energy}（含失败窑）。`):latestTrials(state.snapshots).map(s => `${rewardLabel(s.rewards)}：测试${s.after.samples}窑，合格率${s.after.rate}%，平均能耗${s.after.energy}，平均${s.after.steps}步。`);
    const comparison=state.finalRecord?C.current(state):null;
    return [manual && (manual.manualControlVersion==='realtime-v1'?`我来烧：${manual.result}，能耗${manual.energy}，实时${manual.simulatedDurationSeconds.toFixed(1)}秒，切换${manual.steps}次。`:`我来烧：${manual.result}，能耗${manual.energy}，${manual.steps}步。`), ...trials,comparison&&`最终对照：${comparison.observation}\n${comparison.scope}`].filter(Boolean).join('\n');
  }
  function mount(callbacks) {
    const $ = id => document.getElementById(id);
    let welcomed = false,currentState,draft=[],completedSelections=[];
    const nextRound=()=>completedSelections.length===1?'第二轮':'第三轮';
    document.body.classList.add('guided');
    const dialog = $('guideDialog'), close = $('closeGuide'), start = $('startExperiment');
    const intro = document.createElement('div');
    intro.innerHTML = '<h2 id="entryGuideTitle">先我来烧，再教AI自己烧</h2><p id="entryGuideNote">留下最初的手动记录，最后看AI独立试烧的结果。</p><ol class="entry-steps"><li><strong>我来烧</strong><span>点击加热持续升温，在烧成区累计6秒后切换降温。过热会损坏，低温熄火后需冷却5秒再点火。第一次完成的结果会保留作对照。</span></li><li><strong>教AI烧</strong><span>五类示范中选三类，共学三套不同组合。每套参考60次示范、自主练习300轮，再用同组100窑检验。</span></li><li><strong>AI自己烧</strong><span>选一组学好的AI，观察它独立烧一窑，再看和最初手动结果、动作有什么不同。根据这次真实对照答五道题。</span></li></ol><p class="entry-note">完成实验50分，每题答对10分；失败也算完成，不要求AI胜过你。温度与烧成规则均为教学模拟，不是真实配方。</p>';
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
    const bands=document.createElement('div');bands.id='heatBands';bands.setAttribute('role','img');bands.setAttribute('aria-label','蓝色低温，1000至1200摄氏度绿色烧成区，1200至1350黄色警告，1350以上红色过热');bands.title=bands.getAttribute('aria-label');
    for(const label of ['cold','firing','warning','danger']){const band=document.createElement('i');band.className=label;bands.append(band);}meter.after(bands);
    const legend=document.createElement('ul');legend.id='heatLegend';legend.setAttribute('aria-label','模拟窑温分区');
    for(const stage of HEAT_STAGES){const item=document.createElement('li');item.dataset.zone=stage.key;const swatch=document.createElement('i');swatch.className=stage.key;swatch.setAttribute('aria-hidden','true');const label=document.createElement('span');label.textContent=stage.label;item.append(swatch,label);legend.append(item);}
    const meaning=document.createElement('p');meaning.id='heatMeaning';meaning.setAttribute('role','status');bands.after(legend,meaning);meter.setAttribute('aria-describedby','heatMeaning');
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
    const finalTab=document.createElement('button');finalTab.id='finalTab';finalTab.className='mode-tab';finalTab.type='button';finalTab.setAttribute('role','tab');finalTab.setAttribute('aria-selected','false');finalTab.innerHTML='<span>3 AI自己烧</span>';finalTab.addEventListener('click',callbacks.final);$('aiTab').after(finalTab);
    const details = document.createElement('details'); details.id='learningData';details.open=true;details.className = 'teacher-details';
    details.innerHTML = '<summary>学习数据</summary><p class="tiny">三套组合共用反馈：合格加分、损坏扣分、耗能与耗时扣分。示范由教学脚本产生，AI从经验与反馈学习，不直接执行示范脚本。</p>';
    const ai = document.querySelector('.ai-sheet');
    details.append(ai.querySelector('#qValues'));
    const chart = document.createElement('details'); chart.id='temperatureCurve';chart.open=true;chart.className = 'teacher-details'; chart.innerHTML = '<summary>查看温度曲线</summary>';
    for (const id of ['chartTitle', 'chartCurrent']) $(id).parentElement.hidden = true;
    chart.append($('chart'), document.querySelector('.chart-caption'));
    document.querySelector('.status-panel').append(chart);
    ai.append(details);
    for(const type of D.TYPES){
      const label=document.createElement('label');label.className='demonstration-option';
      const input=document.createElement('input');input.type='checkbox';input.dataset.demo=type.id;input.value=type.id;
      const words=document.createElement('span'),name=document.createElement('strong'),description=document.createElement('small');name.textContent=type.name;description.textContent=type.description;words.append(name,description);
      const run=D.example(type.id,D.SEEDS[0]),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 88 32');svg.setAttribute('role','img');svg.setAttribute('aria-label',`${type.name}的一次模拟温度曲线`);
      const line=document.createElementNS(svg.namespaceURI,'polyline');line.setAttribute('points',run.trace.map(p=>`${2+p.tick/22*84},${30-root.KilnTemperature.celsius(p.temp)/1400*28}`).join(' '));svg.append(line);
      label.append(input,words,svg);$('demonstrationChoices').append(label);
      input.addEventListener('change',()=>callbacks.select([...$('demonstrationChoices').querySelectorAll('input:checked')].map(i=>i.value)));
    }
    const secondDialog=document.createElement('dialog');secondDialog.id='secondLearningDialog';
    secondDialog.setAttribute('aria-labelledby','secondLearningTitle');secondDialog.setAttribute('aria-describedby','secondLearningNote');
    const closeIcon=root.KILN_ASSETS?.['icons/x.svg']||'./icons/x.svg';
    secondDialog.innerHTML=`<button id="closeSecondLearning" class="dialog-close" type="button" aria-label="关闭第二轮策略选择"><img class="icon" src="${closeIcon}" alt=""></button><h2 id="secondLearningTitle">选择第二轮策略</h2><p id="secondLearningNote">从五类示范中选三类，至少更换一种。第一轮结果会保留。</p><p id="firstLearningSelection" class="first-learning-selection"></p><fieldset id="secondDemonstrationChoices"><legend class="sr-only">第二轮从五类示范中选择三类</legend></fieldset><p id="secondSelectionStatus" role="status"></p><div class="button-row"><button id="cancelSecondLearning" class="button secondary" type="button">取消</button><button id="startSecondLearning" class="button primary" type="button" disabled>开始第二轮学习</button></div>`;
    document.body.append(secondDialog);
    function updateSecondSelection(){
      for(const input of secondDialog.querySelectorAll('[data-second-demo]')){
        input.checked=draft.includes(input.value);input.disabled=!input.checked&&draft.length===3;
      }
      const valid=D.nextSelection(draft,completedSelections);
      $('secondSelectionStatus').textContent=draft.length!==3?`已选${draft.length}/3，还需选择${3-draft.length}类。`:valid?`已选3/3，可以开始${nextRound()}学习。`:'该组合已完成，请至少更换一种示范，组成新组合。';
      $('startSecondLearning').disabled=!valid;
    }
    for(const original of $('demonstrationChoices').children){
      if(original.tagName!=='LABEL')continue;
      const label=original.cloneNode(true),input=label.querySelector('input');input.removeAttribute('data-demo');input.dataset.secondDemo=input.value;
      input.addEventListener('change',()=>{draft=[...secondDialog.querySelectorAll('input:checked')].map(i=>i.value);updateSecondSelection();});
      $('secondDemonstrationChoices').append(label);
    }
    function openSecondSelection(){
      if(!currentState||currentState.training||currentState.running||currentState.locked||!currentState.initialized||currentState.mode!=='ai'||currentState.view!=='lab')return;
      const latest=D.latestTrials(currentState.snapshots);if(!latest.length||latest.length>=D.REQUIRED_COMBINATIONS)return;
      completedSelections=latest.map(s=>[...s.selectedTypes]);draft=D.selection(currentState.selectedTypes)||[...completedSelections.at(-1)];
      $('secondLearningTitle').textContent=`选择${nextRound()}策略`;
      $('closeSecondLearning').setAttribute('aria-label',`关闭${nextRound()}策略选择`);
      $('secondLearningNote').textContent='从五类示范中选三类，不与已完成的组合重复。之前的结果会保留。';
      $('secondDemonstrationChoices').querySelector('legend').textContent=`${nextRound()}从五类示范中选择三类`;
      $('startSecondLearning').textContent=`开始${nextRound()}学习`;
      $('firstLearningSelection').textContent=completedSelections.map((ids,i)=>`组合${i+1}：${D.names(ids).join('、')}`).join('；');
      updateSecondSelection();if(!secondDialog.open)secondDialog.showModal();
    }
    for(const id of ['closeSecondLearning','cancelSecondLearning'])$(id).addEventListener('click',()=>secondDialog.close());
    $('startSecondLearning').addEventListener('click',()=>{
      if(!secondDialog.open||$('startSecondLearning').disabled)return;
      const selected=D.nextSelection(draft,completedSelections);if(!selected)return;
      $('startSecondLearning').disabled=true;secondDialog.close();callbacks.startNext(selected);
    });
    const results = document.createElement('section'); results.id = 'guideResults'; results.className = 'guide-results';
    results.innerHTML = '<table><caption>同组100窑 · 每套自主练习300轮</caption><thead><tr><th scope="col">示范组合</th><th scope="col">示范后</th><th scope="col">练习后</th><th scope="col">平均能耗</th></tr></thead><tbody id="guideResultRows"></tbody></table><p id="comparisonInsight"></p><small class="comparison-note">平均能耗包含失败窑；一次演示不代表合格率。</small>';
    ai.insertBefore(results, details);
    const principle = document.createElement('p'); principle.className = 'ai-principle';
    principle.id='aiLearningEvidence';principle.textContent = '先参考60次示范，再自主试错300轮，用同组100窑检验。';
    $('demonstrationSelection').after(principle);
    const progress = document.createElement('p'); progress.id = 'rewardProgress'; progress.className = 'reward-progress'; progress.setAttribute('role','status');
    ai.querySelector('.sheet-heading').after(progress);
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
    choice.innerHTML = '看完手动与AI的实际对照，我发现了什么？<select id="guidedFinding"><option value="">请选择你的发现</option><option>我自己判断火候，AI根据学到的动作价值选择。</option><option>AI独立烧这一窑，不等于照搬我点击的顺序。</option><option>一次成功或失败，还不能代表稳定表现。</option><option>失败也能留下可观察的动作和结果。</option><option>我还不确定，需要再比较一次。</option></select>';
    document.querySelector('.report-form').prepend(choice);
    const auto = document.createElement('section'); auto.className = 'auto-report'; auto.innerHTML = '<h3>我的实验记录</h3><pre id="guidedSummary"></pre><small>系统根据实际操作整理，不代表学生的解释。</small>';
    choice.after(auto);
    const finalReport=document.createElement('section');finalReport.id='finalReportComparison';finalReport.className='final-comparison';finalReport.hidden=true;auto.before(finalReport);
    document.querySelector('#reportView .section-intro h2').textContent = '选一句发现，完成实验';
    document.querySelector('#reportView .section-intro p').textContent = '数据已经整理好了。再完成五道题，每题答对得10分。';
    document.querySelector('.report-summary>p').textContent = '完成最初手动、三套学习、最终AI试烧和发现选择，得50分；五道真实对照题每题答对10分，不按烧成是否成功评分。';
    document.querySelector('.report-summary>small').textContent = '报告包含示范来源与轨迹、自主试错、各阶段测试和你选择的发现。系统整理的数据不代表你的解释。';
    $('guidedFinding').addEventListener('change', callbacks.changed);
    $('guideNext').addEventListener('click', () => {
      if (document.body.dataset.view !== 'lab') callbacks.view('lab');
      else if (document.body.dataset.mode === 'manual') callbacks.mode('ai');
      else if(D.latestTrials(currentState.snapshots).length<D.REQUIRED_COMBINATIONS)openSecondSelection();
      else if(currentState.phase==='final')callbacks.view('report');
      else callbacks.final();
    });
    return {
      welcome() { if (!welcomed) { welcomed = true; if (!dialog.open) dialog.showModal(); } },
      render(state) {
        currentState=state;
        const report = document.body.dataset.view !== 'lab';
        const busy = state.training || state.running || state.locked || !state.initialized;
        const sameModel = D.modelMatches(state),latest=D.latestTrials(state.snapshots),count=latest.length,final=state.phase==='final';
        document.body.dataset.lessonPhase=final?'final':'learning';
        const observationReady=D.observationReady(state);
        finalTab.disabled=busy||count<D.REQUIRED_COMBINATIONS||(!final&&state.mode==='ai'&&!observationReady);finalTab.classList.toggle('active',final);finalTab.setAttribute('aria-selected',String(final));
        for(const id of ['manualTab','aiTab']){const active=!final&&state.mode===(id==='manualTab'?'manual':'ai');$(id).classList.toggle('active',active);$(id).setAttribute('aria-selected',String(active));}
        const done = state.mode === 'manual' ? state.records.some(r => r.mode === 'manual') : final?!!C.current(state):count>=D.REQUIRED_COMBINATIONS;
        const secondStep=!final&&!report&&state.mode==='ai'&&count>0&&count<D.REQUIRED_COMBINATIONS;
        const round=count===1?'第二轮':'第三轮';
        const showSecondPrompt=secondStep&&!state.training&&!state.running;
        document.body.dataset.secondLearning=String(showSecondPrompt);
        const nextParent=showSecondPrompt?band.querySelector('div'):band;
        if($('guideNext').parentElement!==nextParent)nextParent.append($('guideNext'));
        $('guideStage').textContent = report ? '观察对照，完成实验' : final?'第三步 · AI自己烧':state.mode === 'manual' ? `实时控火 · ${state.kiln.elapsedSeconds?.toFixed(1)||'0.0'}秒` : '第二步 · 教AI烧';
        $('guideTitle').textContent = report ? '根据这次实际对照作答' : final?'我来烧和AI自己烧，有什么不同？':state.mode === 'manual' ? '把这一窑烧好' : '换一组示范，看看AI如何学习';
        const pace=`${Math.floor((state.playback?.elapsedMs||0)/1000)}/30秒`;
        $('guideHint').textContent = report ? '选一句发现，完成五道题。' : state.mode === 'manual' ? hint(state.kiln) : state.training ? 'AI参考示范后，正在自主试错。' : state.running ? `AI正在烧窑 · ${pace}，可暂停观察。` : sameModel&&state.playback?.index&&!state.playback.finished?`AI演示已暂停 · ${pace}，点“继续观察”继续。`:done ? '已完成3/3，点击“看看我的发现”即可继续。' : count? `已完成${count}/3，点击下方按钮选择${round}策略。`: `选好三类示范，开始学习并观察。已选${state.selectedTypes.length}/3。`;
        if(!report&&final)$('guideHint').textContent=state.running?`AI独立试烧 · ${pace}，只观察，不再训练。`:state.finalAttemptActive?'试烧已暂停，点击“继续试烧”。':done?'这次结果已记录；查看与最初手动试烧的对照，再答题。':'选择一组已训练的AI，让它独立烧一窑。';
        else if(!report&&observationReady)$('guideHint').textContent='3次学习已完成。请点击“观察AI烧一窑”，再与最初手动结果对照。';
        $('guideNext').textContent = report ? '返回实验' : state.mode === 'manual' ? '下一步：教AI烧' : secondStep?`选择${round}策略`:final?'查看对照并答题':'观察AI烧一窑';
        $('guideNext').disabled = busy || (!report && !done&&!secondStep)||(!report&&!final&&state.mode==='ai'&&done&&!observationReady);
        $('statusHint').textContent = state.training ? '正在学习' : state.kiln.done ? state.kiln.reason : state.kiln.maturity >= 3 ? '准备出窑' : state.kiln.temp >= 58 && state.kiln.temp <= 80 ? '火候正好' : state.kiln.temp > 80 ? '火候偏大' : '火候不足';
        const text = summary(state); $('guidedSummary').textContent = text || '先完成两个环节，实际数据会出现在这里。';
        const evidence=decisionEvidence(state);if($('aiLearningEvidence').textContent!==evidence)$('aiLearningEvidence').textContent=evidence;
        $('rewardProgress').textContent = `AI学习：已完成 ${Math.min(count,D.REQUIRED_COMBINATIONS)}/${D.REQUIRED_COMBINATIONS} 次`;
        $('selectionSummary').textContent=`已选${state.selectedTypes.length}/3类示范${count?' · 更换示范':''}`;
        $('guideResults').hidden=!latest.length;
        const currentId=D.combinationId(state.selectedTypes);
        $('guideResultRows').replaceChildren(...latest.map((s,i) => {
          const row = document.createElement('tr');row.dataset.combination=s.combinationId;row.classList.toggle('current',s.combinationId===currentId);
          for (const [index, value] of [`组合${i+1}`,`${s.afterDemonstrations.rate}%`,`${s.after.rate}%`,String(s.after.energy)].entries()) {
            const cell = document.createElement(index === 0 ? 'th' : 'td'); if (index === 0) cell.scope = 'row'; cell.textContent = value;
            if(index===0){const names=document.createElement('small');names.className='combination-names';names.textContent=D.names(s.selectedTypes).join('、');cell.append(names);}
            if(index===2){const passes=document.createElement('small');passes.className='pass-count';passes.textContent=`${s.after.passed}/${s.after.samples}窑`;cell.append(passes);}row.append(cell);
          }
          return row;
        }));
        $('comparisonInsight').textContent = D.insight(state.snapshots);
        $('modelStatus').textContent = state.training ? `已参考60次示范 · 自主练习${state.iterations}/${state.trainTarget}轮`
          : !sameModel ? '当前组合待学习，已完成的记录保留。' : `已参考60次示范 · 自主练习${state.iterations}轮。`;
        const chartParent=state.mode==='ai'?details:document.querySelector('.status-panel');if(chart.parentElement!==chartParent)chartParent.append(chart);
        $('guidedFinding').disabled = state.locked;
        $('heatMeter').value = root.KilnTemperature.celsius(state.kiln.temp);
        $('heatMeter').setAttribute('aria-valuetext', `模拟窑温${root.KilnTemperature.format(state.kiln.temp)}`);
        const stage=heatStage(state.kiln,state.mode),meaning=`${stage.range} · ${stage.meaning}`;
        if($('heatMeaning').textContent!==meaning)$('heatMeaning').textContent=meaning;
        for(const item of $('heatLegend').children){
          item.setAttribute('aria-current',String(item.dataset.zone===stage.key));
          const reference=HEAT_STAGES.find(s=>s.key===item.dataset.zone),detail=heatStage({temp:{cold:20,firing:60,warning:85,danger:94}[reference.key],maturity:0,profile:state.kiln.profile},state.mode);
          item.title=`${detail.label}：${detail.range}，${detail.meaning}`;
        }
      }
    };
  }
  root.KilnGuide = { hint, summary, heatStage,decisionEvidence,rewardKind, rewardLabel, rewardProgress, latestTrials, comparisonInsight, mount };
  if (typeof module !== 'undefined') module.exports = root.KilnGuide;
})(typeof window !== 'undefined' ? window : globalThis);
