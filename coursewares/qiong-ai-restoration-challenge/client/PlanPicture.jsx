import React, {useRef,useEffect,useState} from 'react';
import {loadImage} from './report';
import {proposalCase,caseImage} from '../shared/restoration-cases.mjs';
export default function PlanPicture({proposal}) {
  const ref=useRef(),[error,setError]=useState('');
  useEffect(()=>{let alive=true;Promise.all([loadImage(caseImage(proposalCase(proposal))),loadImage(proposal.maskDataUrl)]).then(([image,mask])=>{if(!alive)return;const c=ref.current;c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(mask,0,0,c.width,c.height);const pixels=ctx.getImageData(0,0,c.width,c.height);for(let p=0;p<c.width*c.height;p++){const on=pixels.data[p*4]>127;pixels.data[p*4]=180;pixels.data[p*4+1]=48;pixels.data[p*4+2]=32;pixels.data[p*4+3]=on?110:0;}const overlay=document.createElement('canvas');overlay.width=c.width;overlay.height=c.height;overlay.getContext('2d').putImageData(pixels,0,0);ctx.drawImage(image,0,0);ctx.drawImage(overlay,0,0);}).catch(()=>{if(alive)setError('计划位置图片暂未读出，请重新进入');});return()=>{alive=false;};},[proposal.id]);
  return <>{error&&<p role="alert">{error}</p>}<canvas ref={ref} aria-label={`${proposalCase(proposal).shortName}与计划修复的位置，红色标记`}/></>;
}
