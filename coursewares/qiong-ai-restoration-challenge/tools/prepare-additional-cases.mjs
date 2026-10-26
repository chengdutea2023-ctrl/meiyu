// Deterministic teaching masks over existing credited photographs; no generative redraw.
import sharp from 'sharp';
import { readFile,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname,resolve,join } from 'node:path';
import { createHash } from 'node:crypto';
import { RESTORATION_CASES } from '../shared/restoration-cases.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const inputs=[
 {id:'brown-ewer',file:join(root,'server/private/teacher-holdout2.png'),privateFile:'case-ewer-original.png',points:[[.77,.36],[.93,.42],[.92,.49],[.80,.50],[.74,.44]]},
 {id:'song-bowl',file:join(root,'../qiong-ai-vision-challenge/public/assets/qiong-song-bowl.jpg'),privateFile:'case-bowl-original.png',points:[[.65,.55],[.78,.50],[.80,.60],[.74,.69],[.66,.67]]}
];
const provenance=JSON.parse(await readFile(join(root,'static/assets/provenance.json'),'utf8'));
const records=[];
for(const input of inputs){
 const item=RESTORATION_CASES.find(c=>c.id===input.id),source=await readFile(input.file);
 const original=await sharp(source).rotate().resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).png().toBuffer();
 await writeFile(join(root,'server/private',input.privateFile),original);
 const {data,info}=await sharp(original).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const points=input.points.map(([x,y])=>[x*info.width,y*info.height]),damaged=Buffer.from(data),mask=Buffer.alloc(info.width*info.height*4);
 const inside=(x,y)=>{let on=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])on=!on;}return on;};
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
  const p=(y*info.width+x)*4,on=inside(x,y);mask[p]=mask[p+1]=mask[p+2]=on?255:0;mask[p+3]=255;
  if(on){const sample=(y*info.width+Math.floor(info.width*.97))*4;damaged[p]=data[sample];damaged[p+1]=data[sample+1];damaged[p+2]=data[sample+2];}
 }
 await sharp(damaged,{raw:{width:info.width,height:info.height,channels:4}}).png().toFile(join(root,'static/assets',item.damagedFile));
 await sharp(mask,{raw:{width:info.width,height:info.height,channels:4}}).png().toFile(join(root,'static/assets',item.maskFile));
 records.push({...item,width:info.width,height:info.height,sourceSha256:createHash('sha256').update(source).digest('hex'),originalModified:true,modification:`等比例缩小、以背景像素遮去${item.damage.replace('缺失','')}区域，制作教学模拟；不表示实物实际损坏`,maskPolygon:input.points});
}
provenance.cases=[{...RESTORATION_CASES[0],width:1024,height:998,sourceSha256:provenance.target.sha256,originalModified:true,modification:provenance.target.modification},...records];
await writeFile(join(root,'static/assets/provenance.json'),JSON.stringify(provenance,null,2)+'\n');
console.log('Prepared additional teaching cases:',records.map(x=>x.id).join(', '));
