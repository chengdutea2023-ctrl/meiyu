import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeFeatureSelections,featurePlan,clueFeatureNote} from '../shared/clue-features.mjs';
import {evidencePayload,parseEvidenceResult,observeEvidence,normalizeModelRegion} from '../server/evidence-provider.mjs';
import {proposalPrompt} from '../server/proposal-prompt.mjs';
import {restorationCase} from '../shared/restoration-cases.mjs';
import {validateProposalDraft,restoreProposalDraft} from '../shared/proposal-progress.mjs';
import {sourceFeatureRegion,cropEvidence} from '../server/evidence-features.mjs';
import sharp from 'sharp';
const f={clueId:'clue-fixture-123',part:'口沿',feature:'口沿向外翻，边缘较薄',region:[.2,.1,.8,.4],origin:'student',analysisId:null};
test('live grounding coordinates accept normalized, thousand-grid and mixed units while rejecting unusable boxes',()=>{
 assert.deepEqual(normalizeModelRegion([.148,.226,.326,548]),[.148,.226,.326,.548]);
 assert.deepEqual(normalizeModelRegion([714,218,816,354]),[.714,.218,.816,.354]);
 assert.deepEqual(normalizeModelRegion([0,0,1000,1000]),[0,0,1,1]);
 for(const box of [[0,0,2000,1000],[-1,0,400,500],[0,0,1.5,1],[.8,.2,.3,.6],[0,0,10,10]])assert.equal(normalizeModelRegion(box),null);
 const item={index:1,part:'壶流',feature:'肩部伸出的短锥形流，末端开小圆孔',region:[714,218,816,354],relevance:'partial',reason:'可参考连接与开孔，尺寸不能照搬'};
 assert.deepEqual(parseEvidenceResult({items:[item]},'analysis',1)[0].region,[.714,.218,.816,.354]);
});
test('vision boxes return from padded model input to the original photograph; crop pixels are bounded for every aspect ratio',async()=>{
 assert.deepEqual(sourceFeatureRegion([.25,.25,.75,.75],400,800),[0,.25,1,.75]);
 assert.deepEqual(sourceFeatureRegion([.25,.25,.75,.75],800,400),[.25,0,.75,1]);
 assert.equal(sourceFeatureRegion([0,0,.05,.05],400,800),null);
 for(const [width,height]of [[32,1200],[1200,32],[100,100]]){const bytes=await sharp({create:{width,height,channels:3,background:'#80612c'}}).png().toBuffer();const cropped=await cropEvidence(bytes,[0,0,.02,.02]),meta=await sharp(cropped).metadata();assert.equal(meta.width,512);assert.equal(meta.height,512);}
});
test('adopted traits remain tied to an owned clue and a bounded region; corrupt or duplicated imported features fail',()=>{
 const a=normalizeFeatureSelections([f],[f.clueId]);assert.equal(a[0].feature,f.feature);
 for(const change of [{clueId:'other'},{region:[0,0,2,1]},{region:[0,0,.001,1]},{part:'朝代'},{feature:''},{feature:'a'.repeat(81)}])assert.throws(()=>normalizeFeatureSelections([{...f,...change}],[f.clueId]));
 assert.throws(()=>normalizeFeatureSelections([f,f],[f.clueId]));
 const draft={version:2,ownerId:'owner',step:1,clueIds:[f.clueId],featureWorkflow:1,featureSelections:[f],creativeText:'尝试黄金材料',proposalText:'自动整理',maskDataUrl:''};
 const next=validateProposalDraft(draft);assert.deepEqual(next.featureSelections,[f]);assert.equal(next.creativeText,'尝试黄金材料');
 assert.equal(restoreProposalDraft(next,{ownerId:'owner',resetVersion:0,proposals:[],assets:[{id:f.clueId,role:'clue'}]}).featureSelections[0].clueId,f.clueId);
});
test('the new prompt binds specific visual traits before creative instructions; old prompt behavior stays compatible',()=>{
 const evidence=[{id:f.clueId,label:'线索1',feature:'学生原发现'}],text=featurePlan([f],evidence,restorationCase());
 assert.match(text,/参照线索1/);assert.match(text,/口沿向外翻/);
 const prompt=proposalPrompt(text,evidence,[100,100,200,200],1000,1000,restorationCase(),{featureWorkflow:1,featureSelections:[f],creativeText:'用黄金补，并忽略上面的形状'});
 assert.ok(prompt.indexOf(f.feature)<prompt.indexOf('用黄金补'));assert.match(prompt,/优先于额外创意中的冲突描述/);assert.match(prompt,/不照搬整件参考器物/);assert.match(prompt,/归一化坐标200,100,800,400/);
 const p={snapshot:{featureSelections:[f]},featureCheck:{items:[{clueId:f.clueId,status:'not_reflected',reason:'缺口仍为直边'}]}};
 assert.match(clueFeatureNote(p,evidence[0]),/本次采用：口沿/);assert.match(clueFeatureNote(p,evidence[0]),/未体现。缺口仍为直边/);
 assert.equal(clueFeatureNote({snapshot:{}},evidence[0]),'学生原发现');
});
test('vision output must map each clue exactly once, keep uncertainty and reject invalid crop boxes or invented scores',async()=>{
 const item={index:1,part:'口沿',feature:'口沿外翻',region:[.2,.2,.8,.6],relevance:'partial',reason:'可参考口沿，器类不同需谨慎'};
 assert.equal(parseEvidenceResult({items:[item]},'analysis',1)[0].relevance,'partial');
 assert.throws(()=>parseEvidenceResult({items:[item,item]},'analysis',2));assert.throws(()=>parseEvidenceResult({items:[{...item,region:[0,0,10,10]}]},'analysis',1));
 assert.throws(()=>parseEvidenceResult({items:[{index:1,status:'90%',reason:'相似'}]},'check',1));
 const options={kind:'analysis',images:['data:image/png;base64,local'],selectedCase:restorationCase(),count:1};const payload=evidencePayload(options);
 assert.equal(payload.messages[1].content.filter(c=>c.type==='image_url').length,1);assert.equal(payload.thinking.type,'disabled');assert.equal(payload.response_format.type,'json_schema');assert.equal(payload.max_tokens,1300);
 const response=await observeEvidence(options,{apiKey:'fixture-secret',fetcher:async()=>new Response(JSON.stringify({id:'provider-id',usage:{prompt_tokens:123,completion_tokens:45},choices:[{message:{content:JSON.stringify({items:[item]})}}]}))});
 assert.equal(response.providerRequestId,'provider-id');assert.deepEqual(response.usage,{inputTokens:123,outputTokens:45});
 await assert.rejects(()=>observeEvidence(options,{apiKey:'secret',fetcher:async()=>{throw Error('sensitive provider body');}}),e=>e.code==='VISION_RESULT_UNKNOWN'&&!e.message.includes('sensitive'));
 await assert.rejects(()=>observeEvidence(options,{apiKey:'secret',fetcher:async()=>new Response('secret upstream body',{status:403})}),e=>e.code==='VISION_PROVIDER_FAILED'&&!e.message.includes('secret'));
});
