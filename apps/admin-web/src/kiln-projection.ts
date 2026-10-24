import type { LearningRecord, LearningRecordArtifact } from './api';

type ObjectValue = Record<string, unknown>;
type TracePoint = { tick: number; temperature: number };
type Comparison = {
  name: string; basis: string; result: string; rate: number | null;
  energy: number | null; steps: number | null; before: number | null;
  trace: TracePoint[]; color: string;
};
const COLORS = ['#2876ba', '#27836e', '#ae761c', '#c36353'];
const MAX_BYTES = 8 * 1024 * 1024;
const object = (value: unknown): ObjectValue => value && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : {};
const list = (value: unknown) => Array.isArray(value) ? value.slice(0, 100) : [];
const text = (value: unknown) => typeof value === 'string' ? value.slice(0, 12000) : '';
const number = (value: unknown, max = 1e9) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? value : null;
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]!));
const display = (value: number | null) => value === null ? '—' : String(Math.round(value * 10) / 10);

export function isKilnProjectionRecord(record: LearningRecord) {
  return record.courseware.slug === 'qiong-kiln-challenge' || record.courseware.title.replace(/\s/g, '') === '邛窑AI烧窑挑战';
}
export function isKilnExperimentArtifact(artifact: Pick<LearningRecordArtifact, 'kind' | 'mimeType' | 'originalFileName' | 'fileName'>) {
  return artifact.kind === 'experiment-data' && artifact.mimeType === 'application/json' &&
    (artifact.originalFileName || artifact.fileName) === 'qiong-kiln-experiments.json';
}
function safeUrl(value: string, base: string) {
  try {
    const url = new URL(value, base);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}
function validExperiment(value: unknown) {
  const data = object(value);
  return text(data.title).replace(/\s/g, '') === '邛窑AI烧窑挑战' && Array.isArray(data.records) && Array.isArray(data.trainingExperiments);
}

export async function loadKilnExperiment(artifact: LearningRecordArtifact, signal?: AbortSignal): Promise<ObjectValue> {
  if (!isKilnExperimentArtifact(artifact)) throw new Error('不是烧窑实验数据');
  const url = safeUrl(artifact.url, window.location.href);
  if (!url) throw new Error('实验数据地址无效');
  const controller = new AbortController(), cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = window.setTimeout(cancel, 10000);
  try {
    const response = await fetch(url, { credentials: 'omit', signal: controller.signal });
    if (!response.ok || Number(response.headers.get('content-length')) > MAX_BYTES || !response.body) throw new Error('实验数据无法读取');
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let bytes = 0, content = '';
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BYTES) { await reader.cancel(); throw new Error('实验数据过大'); }
      content += decoder.decode(chunk.value, {stream:true});
    }
    content += decoder.decode();
    const data: unknown = JSON.parse(content.replace(/^\uFEFF/, ''));
    if (!validExperiment(data)) throw new Error('实验数据格式不正确');
    return object(data);
  } finally { window.clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}

// Historical reports retain heat-index temp. This is the same presentation mapping as the lesson.
export function kilnProjectionCelsius(index: number) {
  if (!Number.isFinite(index)) throw new TypeError('Temperature must be finite');
  const points = [[0,0],[20,20],[35,60],[58,1000],[80,1200],[94,1350],[100,1400]];
  const x = Math.max(0, Math.min(100, index));
  for (let i = 1; i < points.length; i++) {
    const [x1,y1] = points[i], [x0,y0] = points[i-1];
    if (x <= x1) return Math.round(y0 + (x-x0)/(x1-x0)*(y1-y0));
  }
  return 1400;
}
function trace(value: unknown): TracePoint[] {
  let previous = -1;
  return list(value).flatMap(item => {
    const p = object(item), tick = number(p.tick,22), raw = number(p.temp,100), celsius = number(p.temperatureCelsius,1400);
    if (tick === null || !Number.isInteger(tick) || tick <= previous || (raw === null && celsius === null)) return [];
    previous = tick;
    return [{tick, temperature:celsius ?? kilnProjectionCelsius(raw!)}];
  });
}
function rewardName(rewards: ObjectValue) {
  if (rewards.success === 100 && rewards.damage === 80 && rewards.energy === 1 && rewards.time === 1) return '优先烧好';
  if (rewards.success === 100 && rewards.damage === 80 && rewards.energy === 5 && rewards.time === 1) return '优先节能';
  return '自定义奖励';
}
function rewardKey(rewards: ObjectValue) { return ['success','damage','energy','time'].map(k=>`${k}:${String(rewards[k])}`).join('|'); }
function summaryValue(summary: ObjectValue, label: string) {
  return text(object(list(summary.resultItems).find(item=>object(item).label === label)).value);
}
function summaryRows(summary: ObjectValue): Comparison[] {
  const source = summaryValue(summary,'实验数据（系统整理）') || text(summary.explanation);
  const rows: Comparison[] = [];
  for (const line of source.split('\n')) {
    const single = /^(我来烧|手动试烧|程序烧|固定程序)：([^，]+)，能耗([\d.]+)，([\d.]+)步/.exec(line);
    const ai = /^(优先烧好|优先节能|自定义奖励)：测试(\d+)窑，合格率([\d.]+)%，平均能耗([\d.]+)，平均([\d.]+)步/.exec(line);
    if (single) rows.push({name:/我来烧|手动/.test(single[1])?'我来烧':'程序烧',basis:'单窑记录',result:single[2],energy:number(Number(single[3])),steps:number(Number(single[4])),rate:null,before:null,trace:[],color:COLORS[rows.length%4]});
    if (ai) rows.push({name:`AI · ${ai[1]}`,basis:`${ai[2]}窑测试`,result:'',rate:number(Number(ai[3]),100),energy:number(Number(ai[4])),steps:number(Number(ai[5])),before:null,trace:[],color:COLORS[rows.length%4]});
  }
  return rows.slice(0,20);
}

export function kilnProjectionModel(record: LearningRecord) {
  const summary = object(record.summary);
  const candidate = (record.artifacts ?? []).map(a=>object(a.metadata).kilnExperiment).find(validExperiment);
  const data = object(candidate), detailed = validExperiment(candidate);
  const records = list(data.records).map(object), experiments = list(data.trainingExperiments).map(object);
  const rows: Comparison[] = [];
  for (const [mode,name] of [['manual','我来烧'],['fixed','程序烧']]) {
    const r = records.filter(r=>r.mode===mode).at(-1);
    if (r) rows.push({name,basis:'单窑记录',result:text(r.result)||'已记录',rate:null,energy:number(r.energy),steps:number(r.steps),before:null,trace:trace(r.trace),color:COLORS[rows.length%4]});
  }
  const latest = new Map<string,ObjectValue>();
  for (const e of experiments) latest.set(rewardKey(object(e.rewards)), e);
  for (const e of latest.values()) {
    const after=object(e.after),before=object(e.before),samples=number(after.samples,100000);
    rows.push({name:`AI · ${rewardName(object(e.rewards))}`,basis:samples===null?'测试样本数未记录':`${samples}窑测试`,result:'',rate:number(after.rate,100),energy:number(after.energy),steps:number(after.steps),before:number(before.rate,100),trace:trace(object(e.policyAfter).trace),color:COLORS[rows.length%4]});
  }
  return {rows:detailed?rows:summaryRows(summary), detailed,
    experiments, experimentsCount:detailed?experiments.length:null, rewardCount:detailed?latest.size:null,
    finding:summaryValue(summary,'我的发现')||text(data.finding),
    concept:summaryValue(summary,'概念理解'),
    brief:text(summary.brief),
    reportUnavailable:!detailed,
  };
}

function chart(rows: Comparison[]) {
  const curves=rows.filter(r=>r.trace.length>1);
  if (!curves.length) return '<p class="empty">这条记录暂未提供可读取的温度轨迹，未绘制推测数据。</p>';
  const x=(tick:number)=>56+tick/22*612, y=(temp:number)=>218-temp/1400*190;
  const axis=[0,700,1400].map(t=>`<line x1="56" x2="668" y1="${y(t)}" y2="${y(t)}" stroke="#dbe4e2"/><text x="45" y="${y(t)+5}" text-anchor="end">${t}</text>`).join('');
  const paths=curves.map(r=>`<polyline points="${r.trace.map(p=>`${x(p.tick).toFixed(1)},${y(p.temperature).toFixed(1)}`).join(' ')}" fill="none" stroke="${r.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  return `<svg viewBox="0 0 700 260" role="img" aria-label="已记录的模拟窑温轨迹，横轴操作步数0至22，纵轴摄氏温度0至1400"><rect x="56" y="${y(1200)}" width="612" height="${y(1000)-y(1200)}" fill="#e6f3ec"/>${axis}${paths}<text x="8" y="16">℃</text>${[0,5,10,15,22].map(t=>`<text x="${x(t)}" y="247" text-anchor="middle">${t}步</text>`).join('')}</svg><div class="legend">${curves.map(r=>`<span><i style="background:${r.color}"></i>${escape(r.name)}</span>`).join('')}</div><p class="caption">各方案最近一次实际试烧；浅绿色为模拟烧成区。温度为教学映射，非真实烧制曲线。</p>`;
}

export function buildKilnProjectionHtml(record: LearningRecord, options: {imageUrl:string; baseUrl:string}) {
  const model=kilnProjectionModel(record), score=number(record.score,100), image=safeUrl(options.imageUrl,options.baseUrl);
  const duration=number(record.durationSeconds), durationText=duration===null?'未记录':`${Math.floor(duration/60)}分${Math.floor(duration%60)}秒`;
  const attachments=(record.artifacts??[]).flatMap(a=>{const url=safeUrl(a.url,options.baseUrl);return url?[{...a,url}]:[];});
  const comparison=model.rows.map(r=>`<tr><th scope="row"><i class="row-dot" style="background:${r.color}"></i>${escape(r.name)}<small>${escape(r.basis)}</small></th><td>${r.rate===null?`<span class="outcome">${escape(r.result)}</span>`:`<strong class="rate">${display(r.rate)}<small>%</small></strong><span class="bar"><i style="width:${r.rate}%;background:${r.color}"></i></span>`}</td><td><strong>${display(r.energy)}</strong></td><td><strong>${display(r.steps)}</strong></td><td>${r.rate===null?'—':`${display(r.before)}% → ${display(r.rate)}%`}</td></tr>`).join('');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>邛窑AI烧窑挑战 · 学习成果</title><style>
  :root{color-scheme:light;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;color:#1a3435;background:#f3f7f7;font-synthesis:none}*{box-sizing:border-box;letter-spacing:0}body{margin:0}main{max-width:1400px;margin:auto;padding:30px 40px 48px}h1,h2,h3,p,figure{margin:0}h1{font-size:32px;line-height:1.4;font-weight:800}h2{font-size:23px;line-height:1.5}header{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;padding-bottom:24px;border-bottom:2px solid #214e48}.eyebrow{color:#347369;font-size:13px;font-weight:700;margin-bottom:5px}.identity{display:flex;flex-wrap:wrap;gap:8px 24px;font-size:15px;line-height:1.7;margin-top:12px;color:#566a6b}.identity b{color:#193e3d}.stamp{font-size:13px;color:#5e7370;white-space:nowrap}.overview{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:28px;padding:28px 0;border-bottom:1px solid #d5e1df}.scene{position:relative;min-width:0;aspect-ratio:16/9;overflow:hidden;border-radius:8px;background:#d7e4e0}.scene img{display:block;width:100%;height:100%;object-fit:cover;object-position:50% 54%}.scene figcaption{position:absolute;bottom:0;inset-inline:0;padding:9px 14px;font-size:12px;line-height:1.5;color:white;background:#173c35ed}.summary{display:flex;flex-direction:column;justify-content:center;min-width:0}.score-line{display:flex;align-items:center;gap:32px}.score{padding-right:28px;border-right:1px solid #d0ddda}.score>span{display:block;font-size:15px;font-weight:650;color:#506966}.score strong{display:block;font-size:78px;line-height:1.2;font-weight:800;color:#206a5e;font-variant-numeric:tabular-nums}.score strong small{font-size:24px;margin-left:5px}.score.pending strong{font-size:38px;margin-top:10px}.score-note{font-size:13px;color:#5c7170;line-height:1.8;margin-top:6px}.counts{display:grid;gap:20px}.counts strong{font-size:30px;line-height:1.2;font-variant-numeric:tabular-nums}.counts span{display:block;font-size:14px;color:#5c7170;margin-top:4px}.brief{font-size:15px;line-height:1.8;margin-top:18px;color:#3d5956}.section{padding:26px 0;border-bottom:1px solid #d5e1df}.section-head{display:flex;justify-content:space-between;gap:18px;align-items:baseline;margin-bottom:16px}.section-head p,.caption{font-size:13px;line-height:1.7;color:#5b7370}.table-scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:17px}thead th{font-size:13px;font-weight:650;text-align:left;color:#617671;background:#e7eeec;padding:12px 16px}thead th:first-child{width:29%}thead th:last-child{width:20%}tbody th,td{padding:16px;border-bottom:1px solid #e0e8e5;text-align:left;vertical-align:middle;overflow-wrap:anywhere}tbody th{font-size:17px;font-weight:700}tbody th small{display:block;font-size:12px;color:#607873;font-weight:400;margin:5px 0 0 16px}.row-dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:9px;vertical-align:middle}td strong{font-size:23px;font-weight:750;font-variant-numeric:tabular-nums}.rate small{font-size:14px;margin-left:3px}.outcome{font-size:16px;font-weight:650}.bar{display:block;background:#e5edeb;height:5px;width:105px;max-width:100%;margin-top:7px;border-radius:3px;overflow:hidden}.bar i{display:block;height:100%}.notice{font-size:13px;line-height:1.8;background:#fff4dc;border-left:3px solid #bf8a2d;padding:10px 14px;margin-bottom:16px}.lower{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:34px}.lower section{min-width:0}.chart svg{display:block;width:100%;height:auto;margin-top:12px}.chart svg text{font-family:inherit;font-size:12px;fill:#60756f}.legend{display:flex;gap:8px 20px;flex-wrap:wrap;margin:4px 0 10px;font-size:12px}.legend i{display:inline-block;width:18px;height:3px;vertical-align:middle;margin-right:6px}.finding{margin-top:18px;padding-left:18px;border-left:4px solid #30836e;font-size:23px;line-height:1.8;overflow-wrap:anywhere;font-weight:700}.concept{margin-top:22px;font-size:15px;line-height:1.9;color:#506965}.concept b{display:block;color:#1b423b;margin-bottom:4px}.empty{font-size:15px;line-height:1.8;color:#687c76;padding:22px 0}details{margin-top:22px}summary{font-size:15px;font-weight:650;cursor:pointer;min-height:36px;padding:8px 0}details table{font-size:14px}details td,details th{padding:12px}details td strong{font-size:17px}.files{display:flex;gap:12px;flex-wrap:wrap}.file{display:flex;align-items:center;gap:24px;justify-content:space-between;min-width:0;flex:1 1 360px;border:1px solid #cfdfd9;border-radius:6px;background:white;padding:14px 18px;color:#206a5e;text-decoration:none;font-size:14px}.file strong{overflow-wrap:anywhere}.file small{display:block;color:#73877f;font-size:12px;font-weight:400;margin-top:4px}.file>span:last-child{white-space:nowrap}.file:hover{background:#e8f1ec}.file:focus-visible,summary:focus-visible{outline:3px solid #2876ba;outline-offset:3px}footer{font-size:12px;color:#6c817c;line-height:1.8;padding-top:22px}.simulation{color:#8a6325} @media(min-width:1700px){main{max-width:1540px}h1{font-size:36px}h2{font-size:26px}table{font-size:19px}}@media(max-width:900px){main{padding:24px}header{align-items:flex-start}.stamp{display:none}h1{font-size:27px}.overview{gap:20px}.score-line{gap:20px}.score{padding-right:18px}.score strong{font-size:60px}.counts strong{font-size:24px}.counts span{font-size:12px}.lower{grid-template-columns:1fr}.section-head{display:block}.section-head p{margin-top:6px}.finding{font-size:21px}.scene{aspect-ratio:4/3}table{font-size:15px}thead th,tbody th,td{padding:12px}}
  @media(max-width:600px){main{padding:20px 16px}h1{font-size:24px}.identity{font-size:13px;gap:4px 16px}.overview{grid-template-columns:1fr}.scene{aspect-ratio:16/9}.score-line{justify-content:space-between}.score strong{font-size:64px}.counts{grid-template-columns:1fr 1fr;gap:20px}.counts strong{font-size:25px}.counts span{font-size:12px}.brief{font-size:14px}h2{font-size:21px}table{min-width:650px}details table{min-width:680px}.finding{font-size:21px}.file{padding:12px;gap:14px}.section{padding:22px 0}}
  @media(min-width:901px){main{padding-top:24px}header{padding-bottom:18px}.overview{grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);padding:22px 0}.scene{width:100%;height:240px;aspect-ratio:auto;max-height:none}.section{padding:22px 0}tbody th,td{padding-top:12px;padding-bottom:12px}}
  @media(max-width:600px){.score{flex:0 0 47%;min-width:0}.score strong{font-size:60px;white-space:nowrap}.counts{grid-template-columns:1fr;gap:14px;flex:1}.score-note{font-size:12px}}
  @media print{body{background:white}main{padding:0}.section,.overview{break-inside:avoid}.table-scroll{overflow:visible}details{display:none}.files{display:none}}
  </style></head><body><main>
  <header><div><p class="eyebrow">智课 · 学习成果</p><h1>邛窑AI烧窑挑战</h1><div class="identity"><span>学生 <b>${escape(record.student.displayName||record.student.email)}</b></span><span>课程 ${escape(record.course.title)}</span><span>用时 ${durationText}</span></div></div><span class="stamp">${record.status==='COMPLETED'?'已提交的实验记录':'进行中的实验记录'}</span></header>
  <section class="overview"><figure class="scene">${image?`<img src="${escape(image)}" alt="四川邛窑主题虚拟窑场与青釉瓷罐">`:''}<figcaption>邛窑虚拟窑场 · 教学示意图，并非学生作品</figcaption></figure><div class="summary"><div class="score-line"><div class="score${score===null?' pending':''}"><span>本次学习成绩</span><strong>${score===null?'未评分':`${display(score)}<small>分</small>`}</strong><p class="score-note">学习成绩不等于烧成合格率</p></div><div class="counts"><div><strong>${display(model.experimentsCount)}</strong><span>次AI训练实验</span></div><div><strong>${display(model.rewardCount)}</strong><span>组不同奖励方案</span></div></div></div><p class="brief">${escape(model.brief||'比较手动控制、固定程序与AI试错学习，观察奖励如何影响选择。')}</p></div></section>
  <section class="section"><div class="section-head"><h2>三种方式的真实表现</h2><p>单窑结果与批量测试分开标注；测试行显示平均能耗与步数。</p></div>${model.reportUnavailable?'<p class="notice">详细实验数据暂未读取，以下仅展示已提交摘要。可重新打开投屏页重试；缺失数据不按0处理。</p>':''}${model.rows.length?`<div class="table-scroll" role="region" aria-label="实验方式对比" tabindex="0"><table><thead><tr><th>控制方式 / 数据范围</th><th>烧成结果 / 合格率</th><th>能耗</th><th>操作步数</th><th>训练前 → 训练后</th></tr></thead><tbody>${comparison}</tbody></table></div>`:'<p class="empty">本条记录没有提供可读取的模式对比数据。</p>'}
  ${model.experiments.length?`<details><summary>全部训练记录 · ${model.experiments.length}次</summary><div class="table-scroll" role="region" aria-label="全部训练记录" tabindex="0"><table><thead><tr><th>实验 / 奖励方案</th><th>实际训练轮数</th><th>训练前 → 后</th><th>平均能耗</th><th>平均步数</th></tr></thead><tbody>${model.experiments.map((e,i)=>`<tr><th>第${i+1}次 · ${escape(rewardName(object(e.rewards)))}</th><td>${display(number(e.episodes))}${e.stopped===true?'（提前停止）':''}</td><td>${display(number(object(e.before).rate,100))}% → ${display(number(object(e.after).rate,100))}%</td><td>${display(number(object(e.after).energy))}</td><td>${display(number(object(e.after).steps))}</td></tr>`).join('')}</tbody></table></div></details>`:''}</section>
  <div class="lower"><section class="section chart"><h2>试烧温度轨迹</h2>${chart(model.rows)}</section><section class="section"><h2>这次实验，我发现</h2><p class="finding">${escape(model.finding||'本条记录未提供学生发现。')}</p><p class="concept"><b>概念理解</b>${escape(model.concept||'本条记录未提供概念题评价。')}</p><p class="concept">对比表按每组奖励的最近一次实验呈现；重复训练保留在全部记录中。失败结果同样是学习证据。</p></section></div>
  ${attachments.length?`<section class="section"><div class="section-head"><h2>原始报告与实验数据</h2><p>保留原始文件，供课后查阅。</p></div><div class="files">${attachments.map(a=>`<a class="file" href="${escape(a.url)}" target="_blank" rel="noopener noreferrer"><span><strong>${escape(a.originalFileName||a.fileName||'实验附件')}</strong><small>${escape(a.mimeType)}${number(a.sizeBytes)!==null?` · ${Math.round(a.sizeBytes/1024)} KB`:''}</small></span><span>打开原文件 ↗</span></a>`).join('')}</div></section>`:''}
  <footer><p>数据来自本次已提交的学习记录与附件；不补造缺失结果，不把单窑成功当作稳定合格率。</p><p class="simulation">窑场图片、摄氏温度与烧成规则均为教学模拟，不代表真实烧制配方。</p></footer>
  </main></body></html>`;
}
