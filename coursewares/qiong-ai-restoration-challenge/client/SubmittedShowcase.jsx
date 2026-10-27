import React,{useEffect,useRef,useState} from 'react';
import {studentShowcaseModel} from './project-showcase';
import {showcaseContent,showcaseCss,installShowcase} from '../shared/showcase.mjs';
export default function SubmittedShowcase({proposal}){
  const root=useRef(),[html,setHtml]=useState(''),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  useEffect(()=>{let alive=true;setHtml('');setError('');studentShowcaseModel(proposal).then(model=>{if(alive)setHtml(showcaseContent(model));}).catch(()=>{if(alive)setError('已保存的成果暂未读出，请重试；原提交仍保留。');});return()=>{alive=false;};},[proposal.id,attempt]);
  useEffect(()=>html?installShowcase(root.current?.querySelector('[data-restoration-showcase]')):undefined,[html]);
  return <><style>{showcaseCss}</style>{error?<div role="alert"><p>{error}</p><button onClick={()=>setAttempt(v=>v+1)}>重试读取成果</button></div>:!html?<p role="status">正在读取与教师投屏相同的已提交成果…</p>:<div ref={root} dangerouslySetInnerHTML={{__html:html}}/>}</>;
}
