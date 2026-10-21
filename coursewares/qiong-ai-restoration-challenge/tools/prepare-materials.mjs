import sharp from 'sharp';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const input = process.env.QIONG_MATERIALS_ROOT;
if (!input) throw new Error('QIONG_MATERIALS_ROOT is required');
const catalog = JSON.parse(await readFile(join(input, 'catalog.json'), 'utf8'));
const publicDir = join(root, 'static/assets'), privateDir = join(root, 'server/private');
await mkdir(publicDir, { recursive: true }); await mkdir(privateDir, { recursive: true });
const targetItem = catalog.items.find(a => a.id === 'guan-02');
const original = await sharp(join(input, targetItem.localFile)).resize({ width: 1024 }).png().toBuffer();
await writeFile(join(privateDir, 'case-original.png'), original);
const { data, info } = await sharp(original).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const mask = Buffer.alloc(info.width * info.height * 4), damaged = Buffer.from(data);
const points = [[.57,.135],[.66,.145],[.655,.255],[.625,.28],[.59,.235]].map(([x,y])=>[x*info.width,y*info.height]);
function inside(x,y) { let on=false; for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])on=!on;}return on; }
for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const p=(y*info.width+x)*4,on=inside(x,y);mask[p]=mask[p+1]=mask[p+2]=on?255:0;mask[p+3]=255;if(on){const q=(y*info.width+Math.round(info.width*.82))*4;damaged[p]=data[q];damaged[p+1]=data[q+1];damaged[p+2]=data[q+2];}}
await sharp(damaged,{raw:{width:info.width,height:info.height,channels:4}}).png().toFile(join(publicDir,'case-damaged.png'));
await sharp(mask,{raw:{width:info.width,height:info.height,channels:4}}).png().toFile(join(publicDir,'case-mask.png'));
const teacher = [], provenance=[];
async function make(id, sourceId, title, crop, role, feature, claim, reason) {
 const item=catalog.items.find(a=>a.id===sourceId), file=`teacher-${id}.png`;let image=sharp(join(input,item.localFile));if(crop)image=image.extract(crop);await image.resize({width:1100,height:1100,fit:'inside',withoutEnlargement:true}).png().toFile(join(privateDir,file));
 const source=`${item.sourcePage} ｜ 摄影 ${item.photographer} ｜ ${item.license} ｜ ${item.licenseUrl} ｜ ${crop?'已裁切局部':'已缩小，未改器物形态'}；名称按照片来源，未与馆方编号逐件复核`;
 teacher.push({builtinId:id,file,title,source,role,feature,claim,reason});provenance.push({...item,derivedFile:file,modification:crop?'局部裁切与缩小':'缩小',crop:crop||null});
}
await make('jar','guan-01','同类罐 · 整体形制',{left:60,top:120,width:1600,height:2180},'reference','罐口、短颈、圆腹的连接关系','支持比较缺失口沿与颈部的衔接，不证明与目标相同','保留；仅使用合照左侧器物，避免右侧目标器物完整图泄漏');
await make('rim','guan-01','口沿形状 · 局部',{left:350,top:180,width:1000,height:600},'reference','参考器物口沿的形状与厚度','提出口沿轮廓假设，仍需核验','保留；与整体图来自同一照片，不作为独立实物证据');
await make('glaze','guan-01','釉色细节 · 局部',{left:300,top:750,width:850,height:850},'reference','釉色、反光与表面质感','提示修复时延续目标原有材质；照片光照不同，不能直接照搬颜色','保留；同一照片的局部，只提供不同观察线索');
await make('holdout1','hu-01','小口瓷壶 · 核验保留',null,'holdout','口沿与颈部形状，器类差异','用于质疑口沿假设，不把壶的形状直接等同于罐','保留核验；不参与生成，注意器型差异与证据局限');
await make('holdout2','hu-02','褐彩执壶 · 核验保留',null,'holdout','釉下彩与釉面质感，光照条件','用于检查是否擅自增加彩绘；不能证明目标原貌','保留核验；不同器型，只能提供有限比较线索');
await make('bowl','wan-01','瓷碗合照 · 排除',null,'excluded','敞口与浅腹，同罐的形制不同','不能直接支持罐口复原','排除生成参考；器型不匹配，作为干扰条件资料');
await make('cup','extra-01','花口瓷杯 · 排除',null,'excluded','花口与高足形态','不能直接支持目标罐的口沿','排除；形制差异明显，作为干扰资料');
await make('lamp','extra-02','省油灯 · 排除',null,'excluded','灯具结构与口沿','用途和结构不同，不能照搬','排除；用作干扰条件，避免把相似外观当成修复依据');
for(let i=0;i<3;i++)await copyFile(join(privateDir,teacher[5+i].file),join(privateDir,`mismatch-${i+1}.png`));
await writeFile(join(privateDir,'teacher-pack.json'),JSON.stringify(teacher,null,2));
await writeFile(join(publicDir,'provenance.json'),JSON.stringify({title:'邛窑AI修复挑战 · 素材来源与修改记录',license:'照片与照片衍生图遵循CC BY-SA 4.0；软件代码许可另见仓库。',notes:['教师包是用于练习筛选和质疑的资料，不代表已构建考古修复证据库。','同一照片裁切不是新的独立实物证据。','同类器物形制相似不等于目标器物历史原貌。','完整目标原图只在完成证据审查后揭晓，不参与生成。'],target:{...targetItem,originalModified:true,modification:'缩小到1024像素宽，人工遮去口沿区域，制作教学模拟残损；不表示实物实际损坏'},items:provenance},null,2));
console.log(JSON.stringify({width:info.width,height:info.height,teacherItems:teacher.length,holdouts:2}));
