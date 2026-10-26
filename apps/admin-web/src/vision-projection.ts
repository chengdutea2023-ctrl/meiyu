import type { LearningRecord, LearningRecordArtifact } from './api';

type Obj = Record<string, unknown>;
type QuizRow = { points:number|null; maxPoints:number|null; question:string; selected:string; correctAnswer:string; options:{letter:string; label:string}[] };
type ImageRow = { title: string; name: string; condition: string; answer: string; evidence: string; image: string; crop?: 'original' | 'changed' };
const object = (v: unknown): Obj => v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {};
const text = (v: unknown, max = 1600) => typeof v === 'string' ? v.slice(0, max) : '';
const list = (v: unknown) => Array.isArray(v) ? v.slice(0, 50) : [];
const escape = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]!));
const TITLE = '邛窑 -AI看见了什么';
const MAX_BYTES = 20 * 1024 * 1024;
export function visionPresentationSummary(summary: unknown) {
  const value = object(summary);
  if (!Array.isArray(value.resultItems)) return summary;
  return { ...value, resultItems:value.resultItems.map(item => {
    const row = object(item);
    return ['模型','模型版本','识别模型','当前模型','实际模型'].includes(text(row.label))
      ? { ...row, label:'识别方式', value:'计算机视觉' } : item;
  }) };
}
function safeUrl(value: unknown, base: string) {
  try { const url = new URL(text(value, 4000), base); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && text(value) ? url.href : ''; } catch { return ''; }
}
function imageData(value: unknown) {
  const s = text(value, 2200001);
  return s.length <= 2200000 && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(s) ? s : '';
}
export function isVisionProjectionRecord(record: LearningRecord) {
  return record.courseware.slug === 'qiong-ai-vision-challenge' ||
    record.course?.slug === 'qiong-ai-inquiry' && record.courseware.slug === 'courseware' ||
    ['邛窑AI眼力挑战', '邛窑-AI看见了什么'].includes(record.courseware.title.replace(/\s/g, ''));
}
export function isVisionExperimentArtifact(a: Pick<LearningRecordArtifact, 'kind' | 'mimeType' | 'originalFileName' | 'fileName'>) {
  return a.kind === 'experiment-data' && a.mimeType === 'application/json' &&
    ['邛窑眼力实验数据.json', '邛窑 -AI看见了什么-实验数据.json'].includes(a.originalFileName || a.fileName);
}
function validData(value: unknown) {
  const d = object(value);
  return typeof d.modelVersion === 'string' && /^(qiong-vision-|doubao-)/.test(d.modelVersion) && Array.isArray(d.records) && d.records.length <= 50 &&
    d.records.every((v: unknown) => { const r = object(v), p = object(r.params); return typeof r.specimenId === 'string' && ['angle','blur','x','y','w','h'].every(k => typeof p[k] === 'number' && Number.isFinite(p[k])); });
}
export async function loadVisionExperiment(artifact: LearningRecordArtifact): Promise<Obj> {
  if (!isVisionExperimentArtifact(artifact)) throw new Error('不是本课件实验数据');
  let url = safeUrl(artifact.url, window.location.href);
  if (!url) throw new Error('实验数据地址无效');
  const parsed = new URL(url);
  // The three portals proxy this public platform route. Read through the current portal so a different portal hostname cannot block the JSON with CORS.
  if (/^\/api\/v1\/course-runtime\/artifacts\/[a-zA-Z0-9_-]{16,200}\/file$/.test(parsed.pathname) && !parsed.search && !parsed.hash) url = new URL(parsed.pathname, window.location.href).href;
  const controller = new AbortController(), timer = window.setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { credentials:'omit', referrerPolicy:'no-referrer', signal:controller.signal });
    if (!response.ok || Number(response.headers.get('content-length')) > MAX_BYTES || !response.body) throw new Error('实验数据无法读取');
    const reader = response.body.getReader(), decoder = new TextDecoder(); let size = 0, content = '';
    while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > MAX_BYTES) { await reader.cancel(); throw new Error('实验数据过大'); } content += decoder.decode(chunk.value, { stream:true }); }
    const value: unknown = JSON.parse((content + decoder.decode()).replace(/^\uFEFF/, ''));
    if (!validData(value)) throw new Error('实验数据格式不正确');
    return object(value);
  } finally { window.clearTimeout(timer); }
}
function condition(r: Obj) {
  const p = object(r.params), parts = [];
  if (p.mask) parts.push('遮挡');
  if (typeof p.angle === 'number' && p.angle !== 0) parts.push(`旋转 ${p.angle}°`);
  if (typeof p.blur === 'number' && p.blur !== 0) parts.push(`模糊 ${p.blur}`);
  return parts.join(' · ') || '原图';
}
function answer(r: Obj) {
  const ai = object(r.recognition);
  if (ai.status === 'insufficient') return '无法判断';
  if (text(ai.name)) return text(ai.name, 100);
  const values = list(r.values);
  if (values.length === 3 && values.every(v => typeof v === 'number' && Number.isFinite(v))) return '旧模型：' + ['碗','罐','壶'][values.indexOf(Math.max(...values as number[]))];
  return '';
}
function pair(rows: Obj[]) {
  const baselines = new Map<string, Obj>(); let result: Obj[] = [];
  for (const r of rows) { const p = object(r.params), key = text(r.specimenId) + ':' + text(object(r.recognition).model); const count = Number(!!p.mask) + Number(!!p.angle) + Number(!!p.blur);
    if (!count && !baselines.has(key)) baselines.set(key, r); else if (count === 1 && baselines.has(key)) result = [baselines.get(key)!, r]; }
  return result;
}
type ScorePart = { value:number; max:number };
type ProjectionScore = { total:number|null; concepts:ScorePart|null; process:ScorePart|null; evidence:ScorePart|null; explanation:ScorePart|null; note:string };
function numeric(value:unknown):value is number {return typeof value==='number' && Number.isFinite(value);}
function scorePart(value:unknown, max:number):ScorePart|null {
  return numeric(value) && value>=0 && value<=max ? {value,max} : null;
}
function summaryPart(summary:Obj, labels:string[]):ScorePart|null {
  for(const value of list(summary.resultItems)) {
    const r=object(value);if(!labels.includes(text(r.label)))continue;
    const match=/^(\d{1,3}(?:\.\d{1,2})?)\s*\/\s*(\d{1,3}(?:\.\d{1,2})?)(?:\D|$)/.exec(text(r.value));
    if(!match)continue;
    const max=Number(match[2]);if(max>0&&max<=100)return scorePart(Number(match[1]),max);
  }return null;
}
export function visionProjectionScore(record:LearningRecord, data:Obj={}, summary:Obj=object(record.summary)):ProjectionScore {
  const total=numeric(record.score)&&record.score>=0&&record.score<=100?record.score:null;
  const grade=object(data.grade), knownCurrent=['vision-observation-v3','vision-knowledge-v2'].includes(text(data.quizVersion));
  const mayUseGrade=record.status==='COMPLETED'&&knownCurrent;
  const evidence=summaryPart(summary,['对照实验']) || (mayUseGrade?scorePart(grade.evidence,30):null);
  const explanation=summaryPart(summary,['观察与解释','观察记录']) || (mayUseGrade?scorePart(grade.explanation,20):null);
  const concepts=summaryPart(summary,['概念题']) || (mayUseGrade?scorePart(grade.concepts,50):null);
  const process=evidence&&explanation&&evidence.max+explanation.max<=100?{value:evidence.value+explanation.value,max:evidence.max+explanation.max}:null;
  const current=concepts?.max===50&&process?.max===50;
  let note=current?'概念题占50%，实验与观察占50%（对照实验30分＋观察记录20分）。':
    concepts&&process?'历史记录沿用提交时的评分比例；当前课堂为概念题50%、实验与观察50%。':
    '当前课堂：概念题50分、对照实验30分、观察记录20分。历史未保存的分项不补算。';
  if(total!==null&&concepts&&process&&Math.abs(concepts.value+process.value-total)>.001)note+=' 分项与平台总分不一致，请老师核对；此处保留平台原分数。';
  return {total,concepts,process,evidence,explanation,note};
}
function scoreHtml(score:ProjectionScore) {
  const value=(p:ScorePart|null)=>p?String(p.value)+' <span>/ '+p.max+'</span>':'<span class="unrecorded">未保存分项</span>';
  const weight=(p:ScorePart|null)=>p?'（'+p.max+'%）':'';
  return `<section class="score-summary" aria-label="成绩与评分比例"><div class="total-score"><span>本次总分</span><strong>${score.total===null?'未评分':score.total+' <small>/ 100</small>'}</strong></div><div class="score-part"><h2>概念题${weight(score.concepts)}</h2><p>${value(score.concepts)}</p></div><div class="score-part"><h2>实验与观察${weight(score.process)}</h2><p>${value(score.process)}</p>${score.evidence&&score.explanation?`<small>对照实验 ${score.evidence.value}/${score.evidence.max} · 观察记录 ${score.explanation.value}/${score.explanation.max}</small>`:''}</div><p class="score-note">${escape(score.note)}</p></section>`;
}


function savedQuiz(data: Obj, summary: Obj): QuizRow[] {
  const normalized = (value: unknown): QuizRow => {
    const r=object(value);
    const options=list(r.options).slice(0,6).map((value,i)=>{const option=object(value);return {letter:/^[A-F]$/.test(text(option.letter))?text(option.letter):String.fromCharCode(65+i),label:text(option.label,500)};}).filter(o=>o.label);
    const saved=/^第\d+题\s*·\s*(\d+)\/(\d+)\s*·/.exec(text(r.label));
    const maxPoints=saved?Number(saved[2]):numeric(r.points)&&r.points>=0&&r.points<=10?10:null;
    const rawPoints=numeric(r.points)?r.points:saved?Number(saved[1]):null;
    const points=maxPoints!==null&&maxPoints>0&&maxPoints<=100&&rawPoints!==null&&rawPoints>=0&&rawPoints<=maxPoints?rawPoints:null;
    return {question:text(r.question,600),selected:text(r.selected,600),correctAnswer:text(r.correctAnswer,600),options,points,maxPoints:points===null?null:maxPoints};
  };
  const saved = list(data.quizResults).slice(0,5).map(normalized).filter(r=>r.question && (r.selected || r.correctAnswer));
  if (saved.length) return saved;
  // Preserve historical questions and answers; never grade old responses using the current question bank.
  return list(summary.answers).slice(0,5).map(value=>{
    const r=object(value);if(text(r.question))return normalized(r);
    const valueText=text(r.value), parsed=/^我的选择：([\s\S]*?)；正确答案：([\s\S]*?)(?:；|$)/.exec(valueText);
    return {...normalized(r),question:text(r.label,600).replace(/^第\d+题 · \d+\/\d+ · /,''),selected:parsed?parsed[1]:valueText,correctAnswer:parsed?parsed[2]:'',options:[]};
  }).filter(r=>r.question && (r.selected || r.correctAnswer));
}
export function visionProjectionModel(record: LearningRecord, baseUrl: string) {
  const summary = object(record.summary);
  const references=list(summary.artifacts).map(object);
  const artifacts = (record.artifacts || []).filter(a=>!references.length||references.some(r=>r.url===a.url&&r.kind===a.kind));
  const candidates = artifacts.filter(isVisionExperimentArtifact).map(a => object(object(a.metadata).visionExperiment)).filter(validData);
  const data = candidates.at(-1) || {};
  const rows = list(data.records).map(object);
  let images: ImageRow[] = rows.flatMap((r, i) => { const image = imageData(r.image); return image ? [{ image, title:`第 ${i+1} 次`, name:text(r.name,120), condition:condition(r), answer:answer(r), evidence:text(list(object(r.recognition).evidence)[0],200) }] : []; });
  let historical = false;
  const allArtifacts = [...artifacts, ...list(summary.artifacts).map(a => { const o = object(a); return { ...o, originalFileName:text(o.title), fileName:text(o.title), url:text(o.url), mimeType:text(o.mimeType), kind:text(o.kind) }; })];
  const card = allArtifacts.find(a => a.mimeType === 'image/png' && a.kind === 'final-work' && ['邛窑眼力实验卡.png','邛窑 -AI看见了什么-实验卡.png'].includes(a.originalFileName || a.fileName));
  const cardUrl = card ? safeUrl(card.url, baseUrl) : '';
  if (!images.length && cardUrl && text(data.modelVersion).startsWith('doubao-') && pair(rows).length === 2) {
    // Cloud cards keep the same 1440px width and two input-picture positions. Crop those saved pixels, never reconstruct an old input from a new image.
    images = pair(rows).map((r, i) => ({ image:cardUrl, crop:i ? 'changed' : 'original', title:i ? '变化后' : '原图', name:text(r.name,120), condition:condition(r), answer:answer(r), evidence:text(list(object(r.recognition).evidence)[0],200) })); historical = true;
  }
  return { images, cardUrl, historical, score:visionProjectionScore(record,data,summary), quiz:savedQuiz(data,summary), observation:text(data.observation) || text(summary.processSummary), student:text(record.student.displayName || "学生作品",160) };
}
export function buildVisionProjectionHtml(record: LearningRecord, baseUrl: string) {
  const model = visionProjectionModel(record, baseUrl);
  const pictures = model.images.map(r => `<figure><div class="photo${r.crop ? ' crop '+r.crop : ''}"><img src="${escape(r.image)}" alt="${escape(r.title+' · '+r.condition+' · '+r.name)}" referrerpolicy="no-referrer"></div><figcaption><div class="caption"><strong>${escape(r.title)}</strong><span>${escape(r.condition === r.title ? "" : r.condition)}</span></div>${r.name ? `<p class="object-name">${escape(r.name)}</p>` : ""}${r.answer ? `<p class="judgment">AI：${escape(r.answer)}</p>` : ''}${r.evidence ? `<p class="evidence">${escape(r.evidence)}</p>` : ''}</figcaption></figure>`).join('');
  const quiz = model.quiz.length ? `<section class="quiz-review" aria-label="概念题与答案"><h2>概念题：我的选择与正确答案</h2><div class="quiz-grid">${model.quiz.map((r,i)=>`<article><h3>${i+1}. ${escape(r.question)}</h3>${r.points!==null?`<p class="question-score">本题得分：${r.points} / ${r.maxPoints}</p>`:''}${r.options.length ? `<ul class="quiz-options">${r.options.map(o=>`<li><span>${escape(o.letter)}.</span> ${escape(o.label)}</li>`).join('')}</ul>` : ''}<p class="student-choice"><strong>我的选择：</strong>${escape(r.selected || '原记录未保存')}</p><p class="correct-choice"><strong>正确答案：</strong>${escape(r.correctAnswer || '原记录未保存')}</p></article>`).join('')}</div></section>` : '';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${TITLE} · 实验投屏</title><style>
  *{box-sizing:border-box}body{margin:0;background:#faf9f6;color:#23313c;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}main{max-width:1720px;margin:0 auto;padding:40px 48px}header{display:flex;align-items:baseline;justify-content:space-between;gap:24px;border-bottom:1px solid #d7dcd9;padding-bottom:22px;margin-bottom:30px}h1{font-size:clamp(26px,2.5vw,42px);font-weight:600;margin:0;letter-spacing:.02em}header p{margin:0;color:#60716f;font-size:20px}.pictures{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:24px}figure{margin:0;min-width:0}.photo{position:relative;aspect-ratio:768/512;overflow:hidden;background:#f1eee7;border-radius:6px}.photo img{width:100%;height:100%;object-fit:contain;display:block}.crop{aspect-ratio:620/414}.crop img{position:absolute;width:232.2580645%;height:auto;max-width:none;left:-10.483871%;top:-43.478261%;object-fit:initial}.crop.changed img{left:-121.7741935%}figcaption{padding:15px 0 0}.caption{display:flex;gap:12px;align-items:baseline;font-size:20px}.caption span{font-size:18px;color:#60716f}.object-name{font-size:16px;color:#60716f;margin:8px 0 0}.judgment{font-size:23px;line-height:1.5;margin:10px 0 0;font-weight:600;overflow-wrap:anywhere}.evidence{font-size:20px;line-height:1.65;color:#596b68;margin:8px 0 0;overflow-wrap:anywhere}.observation{margin-top:34px;padding-top:24px;border-top:1px solid #d7dcd9}.observation h2{font-size:20px;font-weight:600;margin:0 0 12px}.observation p{font-size:24px;line-height:1.8;margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.quiz-review{margin-top:34px;padding-top:24px;border-top:1px solid #d7dcd9}.quiz-review h2{font-size:24px;font-weight:600;margin:0 0 20px}.quiz-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.quiz-grid article{min-width:0;padding:20px;border:1px solid #d7dcd9;border-radius:6px;background:#fffdf9;break-inside:avoid}.quiz-grid h3{font-size:21px;line-height:1.65;font-weight:600;margin:0 0 14px;overflow-wrap:anywhere}.quiz-options{padding:0;margin:0 0 16px;list-style:none}.quiz-options li{font-size:18px;line-height:1.7;margin-top:6px;overflow-wrap:anywhere}.quiz-options span{font-weight:600}.quiz-grid p{font-size:19px;line-height:1.7;margin:8px 0 0;overflow-wrap:anywhere}.correct-choice{color:#286251}.legacy-card img{display:block;max-width:100%;max-height:78vh;margin:auto;object-fit:contain}.notice{color:#667570;font-size:16px;line-height:1.7}.empty{padding:60px 0;color:#667570;font-size:22px}.score-summary{display:grid;grid-template-columns:180px 1fr 1.3fr;gap:18px 24px;align-items:center;padding:18px 22px;margin-bottom:28px;border:1px solid #d7dcd9;border-radius:8px;background:#f2f5ef}.total-score>span{display:block;font-size:17px;color:#60716f}.total-score strong{display:block;font-size:44px;line-height:1.3;color:#234d42}.total-score small{font-size:20px;font-weight:500;color:#60716f}.score-part h2{font-size:20px;font-weight:600;margin:0 0 8px}.score-part p{font-size:30px;font-weight:600;margin:0}.score-part p span{font-size:20px;color:#60716f;font-weight:400}.score-part>small{display:block;font-size:16px;color:#60716f;line-height:1.7;margin-top:6px}.score-note{grid-column:1/-1;margin:0;color:#60716f;font-size:15px;line-height:1.7}.quiz-grid .question-score{font-size:17px;color:#286251;font-weight:600;margin:6px 0 12px}.score-part p .unrecorded{font-size:17px}@media(max-width:700px){.score-summary{grid-template-columns:1fr 1fr;padding:16px;gap:16px}.total-score{grid-column:1/-1;display:flex;align-items:baseline;gap:18px}.total-score strong{font-size:36px}.score-part h2{font-size:17px}.score-part p{font-size:26px}.score-part>small{font-size:14px}.score-note{font-size:14px}main{padding:24px 20px}header{display:block}header p{margin-top:12px;font-size:17px}.pictures{grid-template-columns:1fr;gap:30px}.quiz-grid{grid-template-columns:1fr}.quiz-grid article{padding:16px}.observation p{font-size:20px}}@media print{main{padding:12px}.pictures{grid-template-columns:repeat(2,minmax(0,1fr))}figure{break-inside:avoid}}
  </style></head><body><main><header><h1>${TITLE}</h1><p>${escape(model.student)}</p></header>${scoreHtml(model.score)}${pictures ? `<section class="pictures" aria-label="实验图片对照">${pictures}</section>` : model.cardUrl ? `<section class="legacy-card"><img src="${escape(model.cardUrl)}" alt="已保存的历史实验卡" referrerpolicy="no-referrer"></section>` : '<p class="empty">这份记录没有可显示的实验图片。</p>'}${model.historical ? '<p class="notice">历史记录仅保存了实验卡中的这组对照图。</p>' : ''}${model.observation ? `<section class="observation"><h2>我的观察</h2><p>${escape(model.observation)}</p></section>` : ''}${quiz}</main></body></html>`;
}
