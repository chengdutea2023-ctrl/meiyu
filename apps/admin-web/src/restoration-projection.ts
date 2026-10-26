import { unzipSync } from 'fflate';
import type { LearningRecord, LearningRecordArtifact } from './api';

type Obj = Record<string, unknown>;
type Clue = { label:string; feature:string; source:string; image:string };
type Projection = { proposalId:string; proposalText:string; resultImage:string; clues:Clue[]; mocked:boolean };
const VERSION = 'qiong-restoration-projection-v1';
const MAX_BYTES = 35 * 1024 * 1024, MAX_IMAGE = 8 * 1024 * 1024;
const object = (v:unknown):Obj => v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {};
const text = (v:unknown, max=1600) => typeof v === 'string' ? v.slice(0,max) : '';
const list = (v:unknown) => Array.isArray(v) ? v : [];
const escape = (v:unknown) => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function safeUrl(value:unknown, base:string) {
  try { const raw=text(value,5000), url=new URL(raw,base); return raw && ['http:','https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}
function platformUrl(value:unknown, base:string) {
  const safe=safeUrl(value,base);if(!safe)return '';
  const url=new URL(safe);
  return /^\/api\/v1\/course-runtime\/artifacts\/[a-zA-Z0-9_-]{16,200}\/file$/.test(url.pathname) && !url.search && !url.hash ? new URL(url.pathname,base).href : safe;
}
function canonicalArtifacts(record:LearningRecord) {
  const s=object(record.summary), id=text(s.proposalId,80);
  const refs=list(s.artifacts).map(object);
  // Only display artifacts referenced by this submitted proposal, never a later unfinished upload.
  return (record.artifacts || []).filter(a=>refs.some(r=>r.url===a.url && r.kind===a.kind) && (!id || object(a.metadata).proposalId===id));
}
export function isRestorationProjectionRecord(record:LearningRecord) {
  return record.courseware.slug==='qiong-ai-restoration-challenge' ||
    record.course?.slug==='qiong-ai-inquiry' && record.courseware.slug==='courseware-is9nlxd12' ||
    record.courseware.title.replace(/\s/g,'')==='邛窑AI修复挑战';
}
export function isRestorationPackageArtifact(a:LearningRecordArtifact, record:LearningRecord) {
  return isRestorationProjectionRecord(record) && a.kind==='evidence-package' &&
    ['application/zip','application/octet-stream'].includes(a.mimeType) &&
    (a.originalFileName || a.fileName)==='我的线索与复原方案.zip' && canonicalArtifacts(record).some(x=>x.url===a.url && object(x.metadata).proposalId===object(a.metadata).proposalId);
}
function png(bytes:Uint8Array | undefined) {
  if(!bytes || bytes.length>MAX_IMAGE || ![137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b))return '';
  let binary='';for(let n=0;n<bytes.length;n+=16384)binary+=String.fromCharCode(...bytes.subarray(n,n+16384));
  return 'data:image/png;base64,'+btoa(binary);
}
export function readRestorationPackage(bytes:Uint8Array, expectedId:string):Projection {
  if(bytes.byteLength>MAX_BYTES)throw Error('资料包过大');
  let count=0,total=0;
  const files=unzipSync(bytes,{filter:file=>{
    count++;total+=file.originalSize;
    if(count>80 || total>100*1024*1024 || file.originalSize>12*1024*1024 || /(^|\/)\.\.(\/|$)/.test(file.name))throw Error('资料包超出读取限制');
    return file.name==='复原方案.json' || /^images\/[a-zA-Z0-9-]{10,80}\.png$/.test(file.name) || file.name==='results/AI复原候选.png';
  }});
  const json=files['复原方案.json'];
  if(!json || json.length>1024*1024)throw Error('未找到三步版方案');
  const p=object(JSON.parse(new TextDecoder().decode(json))), snapshot=object(p.snapshot);
  if(p.workflowVersion!==2 || typeof p.id!=='string' || !expectedId || p.id!==expectedId ||
    !Array.isArray(snapshot.evidence) || snapshot.evidence.length<1 || snapshot.evidence.length>3)throw Error('方案与本次提交不匹配');
  const clues:Clue[]=snapshot.evidence.map((value:unknown,i:number)=>{
    const a=object(value), id=text(a.id,80);
    if(!/^[a-zA-Z0-9-]{10,80}$/.test(id))throw Error('线索编号无效');
    return {label:text(a.label,100)||'线索'+(i+1),feature:text(a.feature,500),source:text(a.source,1600),image:png(files['images/'+id+'.png'])};
  });
  const result=list(p.results).map(object).find(r=>r.state==='succeeded' && text(r.fileId));
  return {proposalId:p.id,proposalText:text(snapshot.proposalText,500),resultImage:result?png(files['results/AI复原候选.png']):'',clues,mocked:p.mocked===true};
}
export async function loadRestorationPackage(a:LearningRecordArtifact, record:LearningRecord):Promise<Projection> {
  if(!isRestorationPackageArtifact(a,record))throw Error('不是本次修复方案资料包');
  const url=platformUrl(a.url,window.location.href);
  if(!url)throw Error('资料地址无效');
  const controller=new AbortController(),timer=window.setTimeout(()=>controller.abort(),10000);
  try {
    const response=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal});
    if(!response.ok || Number(response.headers.get('content-length'))>MAX_BYTES || !response.body)throw Error('资料包无法读取');
    const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
    while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>MAX_BYTES){await reader.cancel();throw Error('资料包过大');}chunks.push(chunk.value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    return readRestorationPackage(bytes,text(object(a.metadata).proposalId,80));
  } finally {window.clearTimeout(timer);}
}
export function restorationProjectionModel(record:LearningRecord, baseUrl:string) {
  const s=object(record.summary), artifacts=canonicalArtifacts(record), id=text(s.proposalId,80);
  const saved=object(s.restorationProjection);
  const result=artifacts.find(a=>a.kind==='restoration-result' && a.mimeType==='image/png' && object(a.metadata).proposalId===id);
  const clueArtifacts=artifacts.filter(a=>a.kind==='restoration-clue' && a.mimeType==='image/png' && object(a.metadata).proposalId===id).slice(0,3);
  const fresh=saved.version===VERSION && saved.proposalId===id;
  const hydrated=artifacts.filter(a=>isRestorationPackageArtifact(a,record)).map(a=>object(object(a.metadata).restorationProjection)).find(p=>p.proposalId===id || !id && typeof p.proposalId==='string');
  const legacy=object(hydrated);
  const clues:Clue[]=fresh?list(saved.clues).slice(0,3).map((value,i)=>{
    const a=object(value), own=clueArtifacts.find(x=>x.url===a.imageUrl);
    return {label:text(a.label,100)||'线索'+(i+1),feature:text(a.feature,500),source:text(a.source,1600),image:own?platformUrl(own.url,baseUrl):''};
  }):list(legacy.clues).slice(0,3).map((value,i)=>{
    const a=object(value),image=text(a.image,MAX_IMAGE*1.4);
    return {label:text(a.label,100)||'线索'+(i+1),feature:text(a.feature,500),source:text(a.source,1600),image:/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(image)?image:''};
  });
  const legacyImage=text(legacy.resultImage,MAX_IMAGE*1.4);
  const resultImage=fresh?(result && saved.resultUrl===result.url?platformUrl(result.url,baseUrl):''):/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(legacyImage)?legacyImage:'';
  const links=artifacts.filter(a=>a.kind==='final-work'||a.kind==='evidence-package').map(a=>({title:a.originalFileName||a.fileName,url:safeUrl(a.url,baseUrl)})).filter(a=>a.url);
  const readFailed=artifacts.some(a=>object(a.metadata).restorationProjectionError);
  return {student:text(record.student.displayName||'学生作品',160),proposalText:text(fresh?saved.proposalText:legacy.proposalText,500)||text(s.brief,500),resultImage,clues,links,readFailed,mocked:fresh?saved.mocked===true:legacy.mocked===true};
}
export function buildRestorationProjectionHtml(record:LearningRecord,baseUrl:string) {
  const m=restorationProjectionModel(record,baseUrl);
  const hero=m.resultImage?`<figure class="restored"><img src="${escape(m.resultImage)}" alt="${m.mocked?'模拟测试图，非真实AI':'AI修复后的陶罐'}" referrerpolicy="no-referrer"><figcaption>${m.mocked?'模拟测试图，非真实AI':'AI修复效果 · 本次提交的方案'}</figcaption></figure>`:
    `<div class="missing-result"><h2>${m.readFailed?'修复资料暂时未读出':'这份提交没有AI修复图'}</h2><p>${m.readFailed?'请关闭此窗口后重新投屏，或查看下方原始附件。':'旧文字方案没有保存修复结果。请学生选用成功方案并提交后，再打开对应记录投屏。'}</p></div>`;
  const clues=m.clues.map(c=>`<article class="clue">${c.image?`<img src="${escape(c.image)}" alt="${escape(c.label)}" referrerpolicy="no-referrer">`:'<div class="missing-image">线索图未读出</div>'}<div><h3>${escape(c.label)}</h3><p class="finding"><strong>我的发现：</strong>${escape(c.feature||'原记录未填写')}</p><p class="source"><strong>图片来源：</strong>${escape(c.source||'原记录未填写')}</p></div></article>`).join('');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>邛窑AI修复挑战 · 成果投屏</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f8f4eb;color:#302b24;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}main{max-width:1800px;margin:auto;padding:32px 42px}header{display:flex;align-items:baseline;justify-content:space-between;gap:20px;border-bottom:1px solid #d7c9b2;padding-bottom:20px;margin-bottom:24px}h1{font-size:clamp(26px,2.5vw,42px);margin:0}header p{font-size:22px;margin:0;color:#75634d}.layout{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:32px;align-items:start}h2{font-size:26px;margin:0 0 18px}.restored{margin:0;background:#fffdf7;border:1px solid #d7c9b2;padding:12px}.restored img{display:block;width:100%;max-height:69vh;object-fit:contain}.restored figcaption{font-size:19px;text-align:center;margin-top:12px;color:#75513c}.clue{display:grid;grid-template-columns:135px minmax(0,1fr);gap:18px;padding:16px 0;border-bottom:1px solid #d7c9b2;break-inside:avoid}.clue:first-of-type{padding-top:0}.clue img{width:135px;height:145px;object-fit:contain;background:#e9dfca}.clue h3{font-size:23px;margin:0 0 10px}.clue p{white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0;line-height:1.65}.finding{font-size:21px}.source{font-size:16px;color:#786c59}.plan{padding-top:24px;margin-top:26px;border-top:1px solid #d7c9b2}.plan p{font-size:24px;line-height:1.8;white-space:pre-wrap;overflow-wrap:anywhere;margin:0}.boundary{font-size:16px;color:#786c59;margin-top:22px}.missing-result{min-height:320px;display:flex;flex-direction:column;justify-content:center;border:2px dashed #c3a985;padding:28px;background:#f1e6d3}.missing-result p,.empty{font-size:20px;line-height:1.8;overflow-wrap:anywhere}.missing-image{font-size:16px;color:#786c59}.originals{margin-top:26px;color:#786c59}.originals a{display:inline-block;color:#765039;margin:12px 20px 8px 0;overflow-wrap:anywhere}.originals summary{cursor:pointer;min-height:36px}
  @media(max-width:1050px){main{padding:25px 24px}.layout{gap:24px;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.clue{grid-template-columns:100px minmax(0,1fr);gap:12px}.clue img{width:100px;height:115px}.finding{font-size:18px}.source{font-size:14px}}
  @media(max-width:760px){main{padding:20px 16px}header{display:block}header p{margin-top:12px;font-size:18px}.layout{grid-template-columns:1fr}.restored img{max-height:65vh}.clue{grid-template-columns:100px minmax(0,1fr)}.plan p{font-size:20px}.missing-result{min-height:220px;padding:20px}}@media print{main{padding:12px}.restored img{max-height:600px}.originals{display:none}}
  </style></head><body><main><header><h1>邛窑AI修复挑战 · 我的成果</h1><p>${escape(m.student)}</p></header><div class="layout"><section aria-label="修复后的陶罐"><h2>修复后的陶罐</h2>${hero}</section><section aria-label="我的线索与介绍"><h2>我的线索与介绍</h2>${clues||'<p class="empty">原记录没有可读取的线索图片与介绍，请查看原始资料包。</p>'}</section></div><section class="plan"><h2>我的复原方案</h2><p>${escape(m.proposalText||'原记录未填写')}</p></section><p class="boundary">AI图片是根据线索和方案生成的复原设想，不代表历史原貌。</p>${m.links.length?`<details class="originals"><summary>原始成果卡与资料包</summary>${m.links.map(a=>`<a href="${escape(a.url)}" target="_blank" rel="noopener noreferrer">${escape(a.title)}</a>`).join('')}</details>`:''}</main></body></html>`;
}

