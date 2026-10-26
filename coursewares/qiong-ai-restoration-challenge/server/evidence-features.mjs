import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { digest, requireValue, LessonError } from './domain.mjs';
import { assertApproved } from './preparation.mjs';
import { preparationEvidence, clueLabel } from '../shared/preparation-evidence.mjs';
import { restorationCase, proposalCase } from '../shared/restoration-cases.mjs';
import { EVIDENCE_PROMPT_VERSION } from './evidence-provider.mjs';
import { validRegion } from '../shared/clue-features.mjs';

export const evidenceRunning=owner=>(owner.evidenceJobs||[]).some(j=>['pending','running'].includes(j.state));
export const publicEvidenceJob=job=>({id:job.id,kind:job.kind,state:job.state,caseId:job.caseId,clueIds:job.clueIds,proposalId:job.proposalId||null,createdAt:job.createdAt,items:job.items||[],mocked:job.mocked,error:job.error||'',code:job.code||'',attempts:job.attempts,model:job.model||null,usage:job.usage||null});
export function assertFeatureAnalysis(owner,features,caseId) {
  for(const f of features) if(f.analysisId){
    const job=owner.evidenceJobs?.find(j=>j.id===f.analysisId&&j.kind==='analysis'&&j.caseId===caseId&&j.state==='succeeded');
    requireValue(job&&job.items.some(i=>i.clueId===f.clueId)&&job.clueHashes[f.clueId]===owner.assets.find(a=>a.id===f.clueId)?.hash,'线索特征识别记录已变化，请重新确认','STALE_FEATURE',409);
    const observed=job.items.find(i=>i.clueId===f.clueId);
    if(f.origin==='ai_confirmed')requireValue(observed.relevance!=='unclear'&&observed.feature===f.feature&&observed.part===f.part&&JSON.stringify(observed.region)===JSON.stringify(f.region),'修改后的特征请作为自己的观察确认，不能冒充AI原始识别','INVALID_FEATURE');
    f.aiObservation={feature:observed.feature,relevance:observed.relevance,reason:observed.reason,region:observed.region};
  }
}
export async function cropEvidence(bytes,region,background='#e9dfca') {
  const {width,height}=await sharp(bytes).metadata();
  const left=Math.max(0,Math.floor(region[0]*width)),top=Math.max(0,Math.floor(region[1]*height));
  const w=Math.min(width-left,Math.max(1,Math.ceil(region[2]*width)-left)),h=Math.min(height-top,Math.max(1,Math.ceil(region[3]*height)-top));
  return sharp(bytes).extract({left,top,width:w,height:h}).resize({width:512,height:512,fit:'contain',background}).png().toBuffer();
}
const imageUrl=bytes=>'data:image/png;base64,'+bytes.toString('base64');
export function sourceFeatureRegion(region,width,height){
  const scale=Math.min(512/width,512/height),w=width*scale/512,h=height*scale/512,x=(1-w)/2,y=(1-h)/2;
  const rect=[(region[0]-x)/w,(region[1]-y)/h,(region[2]-x)/w,(region[3]-y)/h].map(n=>Math.max(0,Math.min(1,n)));
  return validRegion(rect)?rect:null;
}
export function createEvidenceFeatures({root,model,mock,configured,provider,persist,withOwnerLock,assertVersion,assetPath,body,json}) {
  const find=(owner,id)=>{const job=owner.evidenceJobs?.find(j=>j.id===id);requireValue(job,'找不到本任务的识图记录','NOT_FOUND',404);return job;};
  function assertAccess(req,owner){
    requireValue(!req.preparationOnly&&(req.lessonDemo||req.lessonContext?.student?.userType==='STUDENT'||req.lessonContext?.role==='STUDENT'),'请从学生课堂确认线索特征','FEATURE_FORBIDDEN',403);
    if(!req.lessonDemo)assertApproved(owner);
  }
  async function run(owner,job) {
    await withOwnerLock(owner,async()=>{job.state='running';await persist(owner);});
    let returned=false;
    try{
      const images=[],sourceSizes=[];
      if(job.kind==='analysis'){
        const item=restorationCase(job.caseId);images.push(await cropEvidence(await readFile(join(root,'static/assets',item.damagedFile)),[0,0,1,1]));
        for(const id of job.clueIds){const bytes=await readFile(assetPath(owner,id));sourceSizes.push(await sharp(bytes).metadata());images.push(await cropEvidence(bytes,[0,0,1,1]));}
      }else{
        const task=owner.tasks.find(t=>t.id===job.proposalId),s=task.snapshot;
        const rect=[s.bounds[0]/s.width,s.bounds[1]/s.height,(s.bounds[2]+1)/s.width,(s.bounds[3]+1)/s.height];
        images.push(await cropEvidence(await readFile(assetPath(owner,job.resultFileId)),rect));
        images.push(await cropEvidence(Buffer.from(task.maskPngBase64,'base64'),rect,'#000000'));
        for(const f of job.features)images.push(await cropEvidence(await readFile(assetPath(owner,f.clueId)),f.region));
      }
      const result=await provider({kind:job.kind,images:images.map(imageUrl),selectedCase:restorationCase(job.caseId),features:job.features||[],count:job.clueIds.length,model},owner,job);
      returned=true;
      await withOwnerLock(owner,async()=>{
        job.state='succeeded';job.items=result.items.map((item,i)=>{
          const region=job.kind==='analysis'?sourceFeatureRegion(item.region,sourceSizes[i].width,sourceSizes[i].height):null;
          return {...item,clueId:job.clueIds[i],...(job.kind==='analysis'?{region:region||[0,0,1,1],...(!region?{relevance:'unclear',reason:'AI未能定位有效部位，请看整张图片并自己确认。'}:{})}:{})};
        });job.model=result.model;job.usage=result.usage;job.providerRequestId=result.providerRequestId;job.finishedAt=Date.now();
        job.inputHashes=images.map(digest);await persist(owner);
      });
    }catch(error){await withOwnerLock(owner,async()=>{job.state=returned||error.code==='VISION_RESULT_UNKNOWN'?'unknown':'failed';job.code=returned?'VISION_RESULT_UNKNOWN':error.code||'VISION_PROCESSING_FAILED';job.error=returned?'模型已返回，但观察结果未确认保存。不会重新请求，请联系老师恢复。':error instanceof LessonError?error.message:'图片观察暂未完成，草稿已保留，请重试或联系老师';await persist(owner);});}
  }
  async function handle(req,res,path,owner){
    if(!path.startsWith('/api/evidence-jobs'))return false;
    assertAccess(req,owner);
    const match=path.match(/^\/api\/evidence-jobs(?:\/([a-zA-Z0-9-]+)(?:\/(retry))?)?$/);requireValue(match,'识图操作不存在','NOT_FOUND',404);
    const reply=(status,job)=>json(res,status,{job:publicEvidenceJob(job)});
    if(req.method==='GET'&&match[1]&&!match[2]){reply(200,find(owner,match[1]));return true;}
    requireValue(req.method==='POST','识图操作不存在','NOT_FOUND',404);
    await withOwnerLock(owner,async()=>{
      assertVersion(req,owner);
      if(match[2]){
        const job=find(owner,match[1]);requireValue(job.state==='failed'&&job.attempts<2,'只可手动重试一次明确失败项；状态待确认的请求不自动重发');
        requireValue(!evidenceRunning(owner),'识图正在进行，请稍候','VISION_RUNNING',409);
        requireValue(req.lessonDemo||job.approvalDigest===assertApproved(owner).evidenceDigest,'线索已更新，请重新确认','STALE_FEATURE',409);
        requireValue(job.clueIds.every(id=>owner.assets.some(a=>a.id===id&&a.hash===job.clueHashes[id])),'线索已变化，请重新识别','STALE_FEATURE',409);
        job.attempts++;job.state='pending';delete job.error;delete job.code;await persist(owner);reply(202,job);void run(owner,job).catch(()=>{});return;
      }
      requireValue(!match[1],'识图操作不存在','NOT_FOUND',404);
      const input=await body(req);requireValue(/^[a-zA-Z0-9-]{16,80}$/.test(input.requestId||''),'识图请求编号无效');
      requireValue(['analysis','check'].includes(input.kind),'请选择识别线索或核对结果');
      const selectedCase=input.kind==='check'?proposalCase(owner.tasks.find(t=>t.id===input.proposalId)):restorationCase(input.caseId);
      requireValue(selectedCase,'请选择有效的修复对象');
      const task=input.kind==='check'?owner.tasks.find(t=>t.id===input.proposalId&&t.workflowVersion===2):null;
      if(input.kind==='check')requireValue(task?.snapshot.featureWorkflow===1&&task.results[0]?.state==='succeeded'&&task.snapshot.featureSelections?.length,'请先使用线索特征生成修复结果');
      const clueIds=input.kind==='analysis'?input.clueIds:task.snapshot.featureSelections.map(f=>f.clueId);
      const available=preparationEvidence(owner.assets).clues;
      requireValue(Array.isArray(clueIds)&&clueIds.length>=1&&clueIds.length<=3&&new Set(clueIds).size===clueIds.length&&clueIds.every(id=>available.some(a=>a.id===id)),'请选择本任务的1—3张线索');
      if(task&&!req.lessonDemo)requireValue(task.snapshot.preparation.evidenceDigest===assertApproved(owner).evidenceDigest,'线索已更新，请保存新方案','STALE_FEATURE',409);
      const clueHashes=Object.fromEntries(clueIds.map(id=>[id,owner.assets.find(a=>a.id===id).hash]));
      const signature=digest(JSON.stringify({kind:input.kind,caseId:selectedCase.id,clueHashes,proposalId:task?.id||null,resultFileId:task?.results[0]?.fileId||null,promptVersion:EVIDENCE_PROMPT_VERSION}));
      const same=(owner.evidenceJobs||[]).find(j=>j.requestId===input.requestId);if(same){requireValue(same.signature===signature,'识图条件已改变，请发起新请求','STALE_FEATURE',409);reply(200,same);return;}
      const cached=(owner.evidenceJobs||[]).find(j=>j.signature===signature);if(cached){reply(200,cached);return;}
      requireValue(configured(),'视觉服务尚未配置。可先自己填写、确认线索特征，AI核对待老师配置后使用','VISION_NOT_CONFIGURED',503);
      requireValue(!evidenceRunning(owner),'已有识图正在进行，请稍候','VISION_RUNNING',409);
      requireValue((owner.evidenceJobs||[]).length<40,'本任务识图记录过多，请联系老师','VISION_TASK_LIMIT',429);
      const job={id:randomUUID(),requestId:input.requestId,kind:input.kind,state:'pending',signature,caseId:selectedCase.id,clueIds:[...clueIds],clueHashes,
        proposalId:task?.id||null,resultFileId:task?.results[0]?.fileId||null,features:task?.snapshot.featureSelections.map(f=>({...f,label:clueLabel(owner.assets.find(a=>a.id===f.clueId),owner.assets)}))||[],createdAt:Date.now(),attempts:1,mocked:mock,approvalDigest:req.lessonDemo?null:assertApproved(owner).evidenceDigest};
      const next={...owner,evidenceJobs:[...(owner.evidenceJobs||[]),job]};await persist(next);Object.assign(owner,next);reply(202,job);void run(owner,job).catch(()=>{});
    });return true;
  }
  return {handle};
}
