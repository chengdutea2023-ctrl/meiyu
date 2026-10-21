import * as tf from '@tensorflow/tfjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import jpeg from 'jpeg-js';
const root=path.resolve(import.meta.dirname,'..'), models=path.join(root,'public/models'), data=path.join(root,'training/processed');
await tf.setBackend('cpu');await tf.ready();
const json=JSON.parse(await fs.readFile(path.join(models,'model.json'),'utf8'));
const weightData=Buffer.concat(await Promise.all(json.weightsManifest.flatMap(g=>g.paths).map(p=>fs.readFile(path.join(models,p)))));
const base=await tf.loadLayersModel({load:async()=>({modelTopology:json.modelTopology,weightSpecs:json.weightsManifest.flatMap(g=>g.weights),weightData:weightData.buffer.slice(weightData.byteOffset,weightData.byteOffset+weightData.byteLength)})});
const extractor=tf.model({inputs:base.inputs,outputs:base.getLayer('global_average_pooling2d_1').output});
const manifest=JSON.parse(await fs.readFile(path.join(data,'manifest.json'),'utf8')),labels=['碗','罐','壶'];
const groups={train:new Set(),test:new Set()};for(const r of manifest)groups[r.split].add(r.group);for(const g of groups.train)if(groups.test.has(g))throw Error('Leaked object '+g);
const cache=path.join(root,'training/features.json');let features;
try{features=JSON.parse(await fs.readFile(cache,'utf8'));if(features.length!==manifest.length)throw Error();}catch{
 features=[];
 for(const [i,r]of manifest.entries()){
  const im=jpeg.decode(await fs.readFile(path.join(data,r.file)),{useTArray:true});
  const f=tf.tidy(()=>{const rgba=tf.tensor3d(im.data,[im.height,im.width,4]);const input=rgba.slice([0,0,0],[-1,-1,3]).toFloat().div(127.5).sub(1).expandDims();const e=extractor.predict(input);return e.div(e.norm('euclidean',1,true).add(1e-8));});features.push(Array.from(await f.data()));f.dispose();
  if(i%20===0)console.log('Extracted',i+1,'/',manifest.length);
 }
 await fs.writeFile(cache,JSON.stringify(features));
}
const trainIndices=manifest.flatMap((r,i)=>r.split==='train'?[i]:[]);const xs=tf.tensor2d(trainIndices.map(i=>features[i])),ys=tf.oneHot(tf.tensor1d(trainIndices.map(i=>labels.indexOf(manifest[i].label)),'int32'),3);
const head=tf.sequential();head.add(tf.layers.dense({inputShape:[features[0].length],units:3,activation:'softmax',kernelInitializer:tf.initializers.glorotUniform({seed:21}),kernelRegularizer:tf.regularizers.l2({l2:.001})}));head.compile({optimizer:tf.train.adam(.025),loss:'categoricalCrossentropy',metrics:['accuracy']});
await head.fit(xs,ys,{epochs:180,batchSize:24,shuffle:false,verbose:0,callbacks:{onEpochEnd:(e,logs)=>{if(e%60===0)console.log('Epoch',e,'loss',logs.loss.toFixed(4));}}});
const [w,b]=head.getWeights(),weights=await w.array(),bias=Array.from(await b.data());const temperature=1.25;
const validation=[];let correct=0;
for(let i=0;i<manifest.length;i++){const r=manifest[i];if(r.split!=='test')continue;const logits=bias.map((b,j)=>features[i].reduce((sum,f,k)=>sum+f*weights[k][j],b)/temperature);const max=Math.max(...logits),exp=logits.map(v=>Math.exp(v-max)),sum=exp.reduce((a,b)=>a+b);const values=exp.map(v=>v/sum),prediction=labels[values.indexOf(Math.max(...values))];correct+=Number(prediction===r.label);validation.push({id:r.id,label:r.label,prediction,values});}
await fs.writeFile(path.join(models,'classifier.json'),JSON.stringify({version:'qiong-vision-1.0.0',labels,temperature,weights,bias}));
const curated=JSON.parse(await fs.readFile(path.join(root,'training/curated.json'),'utf8'));
await fs.writeFile(path.join(models,'model-card.json'),JSON.stringify({version:'qiong-vision-1.0.0',architecture:'MobileNet V1 0.50 224 frozen pooled features + learned softmax linear classifier',license:'Apache-2.0',trainingSeed:21,trainingAugmentationSeed:20261021,trainingDate:'2026-10-21',trainObjects:groups.train.size,testObjects:groups.test.size,correct,validation,temperature,probabilitiesCalibrated:false,limitations:['仅适合碗/罐/壶课堂观察，不能鉴定文物。','小样本且跨博物馆域；测试准确率只代表这批样本。','同一实物的增广不计独立样本，训练与测试按实物分组。','默认执壶为训练素材实验演示，不能据此推断泛化准确率。','类别外输入仍会被分配三类分数。'],sources:curated.items.map(({file,...r})=>r)},null,2));
console.log(JSON.stringify({trainObjects:groups.train.size,testObjects:groups.test.size,correct,validation}));
tf.dispose([xs,ys]);head.dispose();extractor.dispose();
