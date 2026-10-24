import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadPreparationImages, uploadSummary } from '../client/preparation-upload.js';
import { packZip, csvString } from '../client/io.js';
const jpg = name => ({ name });
test('uploads count actual new, moved, and existing outcomes, and retain successful files after a failure', async () => {
  const events=[], names=['new.jpg','move.jpg','same.jpg','fail.jpg'];
  const outcomes=['created','moved','existing'];let index=0;
  const result=await uploadPreparationImages(names.map(jpg),'holdout',{
    normalize:async()=>'data:image/png;base64,test',onAsset:a=>events.push(a.id),
    post:async()=>{if(index===3)throw Error('上传连接中断，请重试');const i=index++;return{asset:{id:`asset-${i}`,role:'holdout'},uploadOutcome:outcomes[i]};}
  });
  assert.deepEqual([result.created,result.moved,result.existing,result.failed.length],[1,1,1,1]);
  assert.equal(result.failed[0].name,'fail.jpg');assert.equal(events.length,3);
  assert.match(uploadSummary(result,'holdout'),/移入核对组/);assert.match(uploadSummary(result,'holdout'),/1张未完成/);
});
test('an old server response in the wrong group is not reported as a successful upload', async () => {
  const result=await uploadPreparationImages([jpg('existing-reference.jpg')],'holdout',{normalize:async()=>'',post:async()=>({asset:{id:'existing',role:'reference'}})});
  assert.equal(result.created+result.moved+result.existing,0);assert.equal(result.failed.length,1);assert.match(result.failed[0].message,/未放入本组/);
});
test('direct group uploads still accept the previously provided ZIP while preserving its notes', async () => {
  const text=new TextEncoder(),files={'images/a.jpg':new Uint8Array([1,2,3]),'资料表.csv':text.encode(csvString([['文件名','标题','来源','相关特征','用途'],['images/a.jpg','真实照片测试','图录来源','我观察到口沿','生成参考']]))};
  const bytes=packZip(files);let submitted;
  const result=await uploadPreparationImages([{name:'核对测试包.zip',arrayBuffer:async()=>bytes.buffer}],'holdout',{normalize:async()=>'',post:async value=>{submitted=value;return{asset:{id:'a',role:value.role},uploadOutcome:'created'};}});
  assert.equal(result.created,1);assert.equal(submitted.role,'holdout');assert.equal(submitted.source,'图录来源');assert.equal(submitted.feature,'我观察到口沿');
});
test('corrupt packs and unsupported pictures give per-file errors without hiding other successful pictures', async () => {
  const result=await uploadPreparationImages([{name:'broken.zip',arrayBuffer:async()=>new Uint8Array([0,1,2]).buffer},jpg('phone.heic'),jpg('good.jpg')],'reference',{normalize:async()=>'',post:async()=>({asset:{id:'good',role:'reference'},uploadOutcome:'created'})});
  assert.equal(result.created,1);assert.equal(result.failed.length,2);assert.match(result.failed[0].message,/压缩包已损坏/);assert.match(result.failed[1].message,/HEIC/);
});
