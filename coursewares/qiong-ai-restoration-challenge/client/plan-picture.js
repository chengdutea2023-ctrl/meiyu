import {loadImage} from './report';
import {proposalCase,caseImage} from '../shared/restoration-cases.mjs';
export async function planPictureCanvas(proposal){
  const [image,mask]=await Promise.all([loadImage(caseImage(proposalCase(proposal))),loadImage(proposal.maskDataUrl)]);
  const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(mask,0,0,c.width,c.height);
  const pixels=ctx.getImageData(0,0,c.width,c.height);
  for(let p=0;p<c.width*c.height;p++){const on=pixels.data[p*4]>127;pixels.data[p*4]=180;pixels.data[p*4+1]=48;pixels.data[p*4+2]=32;pixels.data[p*4+3]=on?110:0;}
  const overlay=document.createElement('canvas');overlay.width=c.width;overlay.height=c.height;overlay.getContext('2d').putImageData(pixels,0,0);ctx.drawImage(image,0,0);ctx.drawImage(overlay,0,0);return c;
}
export async function planPicturePng(proposal){const c=await planPictureCanvas(proposal);return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('计划位置图片未能生成，请重试')),'image/png'));}
