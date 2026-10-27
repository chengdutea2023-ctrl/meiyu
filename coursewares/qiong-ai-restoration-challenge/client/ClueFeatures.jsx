import React,{useEffect,useRef,useState} from 'react';
import { Check, Sparkle } from '@phosphor-icons/react';
import { media } from './platform';
import { loadImage } from './report';
import { FEATURE_PARTS, CHECK_LABELS } from '../shared/clue-features.mjs';

export function ClueCrop({id,region=[0,0,1,1],alt}){
  const canvas=useRef(),[ready,setReady]=useState(false),[error,setError]=useState('');
  useEffect(()=>{let alive=true;setReady(false);media(id).then(loadImage).then(image=>{
    if(!alive)return;const c=canvas.current,w=Math.max(1,(region[2]-region[0])*image.width),h=Math.max(1,(region[3]-region[1])*image.height);
    const ratio=Math.min(600/w,600/h);c.width=Math.max(1,Math.round(w*ratio));c.height=Math.max(1,Math.round(h*ratio));c.getContext('2d').drawImage(image,region[0]*image.width,region[1]*image.height,w,h,0,0,c.width,c.height);setReady(true);
  }).catch(()=>{if(alive)setError('局部图片暂未读出');});return()=>{alive=false;};},[id,region.join(',')]);
  return <button className="feature-crop" aria-label={`查看${alt}大图`} disabled={!ready} onClick={()=>document.dispatchEvent(new CustomEvent('qiong-view-image',{detail:{image:canvas.current}}))}><canvas ref={canvas} role="img" aria-label={alt}/>{!ready&&<span>{error||'读取局部图片…'}</span>}</button>;
}

function FeatureCard({asset,label,candidate,analysisId,adopted,defaultPart,disabled,onAdopt,onRemove}){
  const [edit,setEdit]=useState(null);
  useEffect(()=>setEdit(null),[candidate?.feature,analysisId,adopted?.feature]);
  const value=edit||adopted||{clueId:asset.id,part:candidate?.part||defaultPart,feature:candidate?.feature||'',region:candidate?.region||[0,0,1,1],origin:candidate?'ai_confirmed':'student',analysisId:analysisId||null};
  const changed=candidate&&value.feature!==candidate.feature;
  function patch(next){setEdit({...value,...next,origin:'student'});}
  const unclear=candidate?.relevance==='unclear'&&!edit&&!adopted;
  return <article className={`feature-card ${adopted?'adopted':''}`}>
    <div className="feature-card-photo"><ClueCrop id={asset.id} region={value.region} alt={`${label}的${value.part}局部`}/><strong>{label} · {adopted?'采用的部位':candidate?'AI找到的部位':'我的观察'}</strong></div>
    <div className="feature-card-fields">
      {candidate&&<p className={`feature-relevance ${candidate.relevance}`}>{candidate.relevance==='direct'?'可以直接参考':candidate.relevance==='partial'?'可作局部参考':'这张图暂不能支持本次形状判断'}：{candidate.reason}</p>}
      {edit?<><label>参考什么部位？<select aria-label={`${label}参考部位`} disabled={disabled} value={value.part} onChange={e=>patch({part:e.target.value})}>{FEATURE_PARTS.map(p=><option key={p}>{p}</option>)}</select></label><label>采用什么特征？<input aria-label={`${label}采用的特征`} value={value.feature} maxLength={80} disabled={disabled} onChange={e=>patch({feature:e.target.value})}/></label></>:<p className="feature-visible-trait"><b>{value.part}</b>：{value.feature||'先识图，或自己填写看到的特征。'}</p>}
      <button className="text-button feature-edit" disabled={disabled} onClick={()=>setEdit({...value,origin:'student'})}>{edit?'正在修改特征':'修改这个特征'}</button>
      <div className="feature-adopt-row"><button className={adopted&&!edit?'feature-adopted':'feature-adopt'} disabled={disabled||value.feature.trim().length<2||unclear} onClick={()=>{onAdopt({...value,origin:changed?'student':value.origin});setEdit(null);}}>{adopted&&!edit?<><Check/>已采用这个特征</>:'采用这个特征'}</button>{adopted&&<button className="text-button" disabled={disabled} onClick={onRemove}>取消采用</button>}</div>
      {unclear&&<small>可换一张线索，或自己改写可见特征后采用。</small>}
    </div>
  </article>;
}

export default function ClueFeatures({selected,allAssets,selectedCase,jobs,features,disabled,configured,onAnalyze,onRetry,onChange}){
  const same=jobs.filter(j=>j.kind==='analysis'&&j.caseId===selectedCase.id&&selected.every(a=>j.clueIds.includes(a.id))).at(-1);
  const busy=same&&['pending','running'].includes(same.state);
  const label=a=>a.label||`线索${allAssets.filter(a=>!a.builtinId).findIndex(x=>x.id===a.id)+1}`;
  return <section className="feature-editor" aria-label="把线索用进修复">
    <div className="feature-editor-header"><div><h2>让线索决定怎样补</h2><p>确认图片中的特征，点“采用”，就会写进复原方案。</p></div><button className="feature-recognize" disabled={disabled||busy||!configured||same?.state==='succeeded'} onClick={onAnalyze}><Sparkle/>{busy?'AI正在找特征…':same?.state==='succeeded'?'已找到特征，请确认采用':'帮我找特征'}</button></div>
    {!configured&&<p className="feature-service-note">AI识图暂未配置，可以先自己填写并采用可见特征。</p>}
    {same?.error&&<div className="feature-service-note" role="status">{same.error}{same.state==='failed'&&same.attempts<2&&<button disabled={disabled} onClick={()=>onRetry(same.id)}>重试识图</button>}</div>}
    {same?.mocked&&same.state==='succeeded'&&<p className="feature-service-note">当前为模拟识图测试，以下特征不代表真实识别结果。</p>}
    {selected.map(a=><FeatureCard key={`${selectedCase.id}:${a.id}`} asset={a} label={label(a)} candidate={same?.state==='succeeded'?same.items.find(i=>i.clueId===a.id):null} analysisId={same?.state==='succeeded'?same.id:null} adopted={features.find(f=>f.clueId===a.id)} defaultPart={selectedCase.type==='壶'?'壶流':'口沿'} disabled={disabled||busy} onAdopt={f=>onChange([...features.filter(x=>x.clueId!==a.id),f])} onRemove={()=>onChange(features.filter(x=>x.clueId!==a.id))}/>)}
    <p className="feature-total">已采用 {features.length} 条特征。只把已采用特征的图片用于本次生成。</p>
  </section>;
}

export function FeatureCheck({proposal,job,configured,disabled,onCheck,onRetry}){
  const features=proposal?.snapshot.featureSelections||[];
  if(!features.length||!proposal?.results[0]?.fileId)return null;
  const s=proposal.snapshot,b=s.bounds,region=[b[0]/s.width,b[1]/s.height,(b[2]+1)/s.width,(b[3]+1)/s.height],busy=job&&['pending','running'].includes(job.state);
  return <section className="feature-check" aria-label="按采用的线索核对效果"><div className="feature-check-heading"><h3>找到的特征，补进去了吗？</h3>{job?.state!=='succeeded'&&<button disabled={disabled||busy||!configured||Boolean(job)&&(job.state!=='failed'||job.attempts>=2)} onClick={()=>job?onRetry(job.id):onCheck()}>{busy?'AI正在逐条核对…':'按线索检查效果'}</button>}</div>
    <p>左边是采用的线索局部，右边是这次补配的位置。你也看看，特征有没有体现？</p>
    {features.map((f,i)=>{const a=s.evidence.find(a=>a.id===f.clueId),check=job?.state==='succeeded'?job.items.find(c=>c.clueId===f.clueId):null;return <article className="feature-check-row" key={f.clueId}><strong>{a?.label||`线索${i+1}`}：{f.feature}</strong><div className="feature-compare-pair"><figure><ClueCrop id={f.clueId} region={f.region} alt="采用的线索局部"/><figcaption>我采用的线索</figcaption></figure><figure><ClueCrop id={proposal.results[0].fileId} region={region} alt="本次修复局部"/><figcaption>本次修复局部</figcaption></figure></div><p className={`feature-check-status ${check?.status||''}`}><b>{check?`AI提示：${CHECK_LABELS[check.status]}`:busy?'正在观察…':'尚未完成AI核对'}</b>{check&&<span>{check.reason}</span>}</p></article>;})}
    {job?.error&&<p role="status">{job.error}</p>}{job?.mocked&&<p>模拟核对，不能代替真实AI结果。</p>}<small>这里只核对可见特征，不鉴定年代、真伪，也不作为成绩。核对失败时仍可保留并提交已生成作品。</small>
  </section>;
}
