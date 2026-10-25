import { quizResults, QUIZ_VERSION, SCORING_TEXT } from './quiz.js';
import { grade, canSubmitWork, reportText, comparison, recognitionTitle, recognitionDetail } from './engine.js';
const bytes64 = text => { const bytes = new TextEncoder().encode(text); let binary = ''; for (let i=0;i<bytes.length;i+=8192) binary+=String.fromCharCode(...bytes.subarray(i,i+8192)); return btoa(binary); };
export function createPlatform(search, fetcher = fetch) {
  const query = new URLSearchParams(search), launchToken = query.get('launchToken'), api = query.get('platformApiBase')?.replace(/\/$/,''), returnUrl = query.get('returnUrl');
  const demo = query.get('demo') === '1' && !launchToken;
  let initialized = false, inFlight, saved = false, snapshot, uploadCache = [], startedAt = Date.now();
  async function post(path, body) {
    if (!launchToken || !api) throw new Error('请从智课学生后台进入本课件。');
    const url = new URL(api, location.href);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('平台地址无效，请重新启动课件。');
    const controller = new AbortController(), timer = setTimeout(()=>controller.abort(), 25000);
    try { const r = await fetcher(api+path, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({launchToken,...body}),signal:controller.signal}); const data=await r.json().catch(()=>({})); if(!r.ok) throw new Error(r.status===403?'启动已失效或课堂已结束，请返回学生后台重新进入。':'平台保存未成功，请检查网络后重试。'); return data; }
    catch(error) { if(error.name==='AbortError') throw new Error('连接超时，请重试。已完成的上传会保留。'); throw error; }
    finally { clearTimeout(timer); }
  }
  return {
    demo,
    async initialize() {
      if(demo) {initialized=true;const host=new URL(location.href).hostname;return {key:'qiong-vision-demo-v1',message:/^(localhost|127\.0\.0\.1|\[::1\])$/.test(host)?'本地预览，成绩不会保存':'体验模式，成绩不会保存'};}
      const verified=await post('/course-runtime/launch/verify',{});
      await post('/course-runtime/launch/records',{status:'STARTED'}); initialized=true;
      return {key:'qiong-vision-v1:'+verified.context.launchSessionId,message:'已连接智课 · 完成实验后提交'};
    },
    async progress(count) {if(initialized && !demo && !saved) await post('/course-runtime/launch/records',{status:'PROGRESS',durationSeconds:Math.max(0,Math.floor((Date.now()-startedAt)/1000)),summary:{displayTitle:'邛窑 -AI看见了什么',brief:`已记录 ${count} 次真实识别实验`}});},
    complete(work, card) {
      if(inFlight) return inFlight;
      if(saved) return Promise.resolve({saved:true});
      if(!snapshot) snapshot={work:structuredClone(work),card};
      inFlight=(async()=>{
        if(!initialized) throw new Error('尚未完成平台启动验证。');
        const {work,card}=snapshot, result=grade(work);
        if(!canSubmitWork(work)) throw new Error('请完成对照实验、观察和五道概念题。');
        if(demo) {saved=true;return {saved:false,demo:true,score:result.score};}
        const artifacts=[{fileName:'邛窑 -AI看见了什么-实验卡.png',mimeType:'image/png',kind:'final-work',contentBase64:card.split(',')[1]},{fileName:'邛窑 -AI看见了什么-实验记录.txt',mimeType:'text/plain',kind:'report',contentBase64:bytes64(reportText(work))},{fileName:'邛窑 -AI看见了什么-实验数据.json',mimeType:'application/json',kind:'experiment-data',contentBase64:bytes64(JSON.stringify({...work,quizVersion:QUIZ_VERSION,projectionVersion:'qiong-vision-images-v1',quizResults:quizResults(work.answers),grade:result},null,2))}];
        for(let i=0;i<artifacts.length;i++) if(!uploadCache[i]) uploadCache[i]=await post('/course-runtime/launch/artifacts',artifacts[i]);
        await post('/course-runtime/launch/records',{status:'COMPLETED',score:result.score,durationSeconds:Math.max(0,Math.floor((Date.now()-startedAt)/1000)),summary:{displayTitle:'邛窑 -AI看见了什么 · 实验卡',scoreText:`${result.score} 分（实验过程）`,brief:`已记录 ${work.records.length} 次识别，完成原图与单变量变化对照。`,processSummary:work.observation,resultItems:[{label:'实验次数',value:String(work.records.length)},{label:'识别方式',value:'计算机视觉'},{label:'评分依据',value:SCORING_TEXT+'。预测选填、不计分；AI猜对与否不扣实验分。'},{label:'对照实验',value:result.evidence+' / 30'},{label:'观察与解释',value:result.explanation+' / 20（仅检查完成度）'},{label:'概念题',value:result.concepts+' / 50'},...comparison(work.records).map(r=>({label:r.phase,value:recognitionTitle(r)+'；'+recognitionDetail(r)}))],answers:quizResults(work.answers).map((r,i)=>({question:r.question,options:r.options,selected:r.selected,correctAnswer:r.correctAnswer,label:`第${i+1}题 · ${r.points}/10 · ${r.question}`,value:`我的选择：${r.selected}；正确答案：${r.correctAnswer}；${r.explanation}`})),artifacts:uploadCache.map(a=>({url:a.url,mimeType:a.mimeType,title:a.originalFileName||a.fileName,kind:a.kind}))}});
        saved=true;return {saved:true,score:result.score};
      })().finally(()=>{inFlight=null;});return inFlight;
    },
    returnToPortal() {if(!saved) throw new Error('请先完成提交。'); if(returnUrl){const url=new URL(returnUrl,location.href);if(['https:','http:'].includes(url.protocol))location.assign(url.href);}},
  };
}
