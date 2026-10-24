import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const require=createRequire(import.meta.url);
const source=await readFile(new URL('../apps/admin-web/src/App.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('App.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const functions=['LearningRecordArtifacts','LearningRecordSummary','summaryMediaArtifacts','isPlainObject','isHttpUrl','guessMimeTypeFromUrl','stringFromSummary','isImageArtifact','isWorkPageArtifact','renderSummaryArtifactPreview','renderArtifactPreview','formatFileSize','isEmptySummary','renderSummaryValue','renderReadableSummaryData','summaryFieldLabel','isUrlSummaryField'];
const constants=['SUMMARY_FIELD_LABELS','SUMMARY_FIELD_KEYS'];
const nodes=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&functions.includes(n.name?.text)||ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>constants.includes(d.name.getText(ast))));
assert.equal(nodes.length,functions.length+constants.length);
const code=nodes.map(n=>n.getText(ast)).join('\n')+'\nmodule.exports={LearningRecordArtifacts,LearningRecordSummary,isImageArtifact};';
const module={exports:{}};
const box=tag=>({children})=>React.createElement(tag,null,children);
const Descriptions=box('dl');Descriptions.Item=box('div');
vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require,URL,Text:box('span'),Space:box('div'),Alert:()=>React.createElement('p',null,'empty alert'),FileDoneOutlined:()=>React.createElement('i'),Descriptions});
const {LearningRecordArtifacts:Gallery,LearningRecordSummary:Summary,isImageArtifact}=module.exports;
const file=(name,mimeType)=>({id:name,originalFileName:name,fileName:name,mimeType,kind:'fixture',url:'https://example.invalid/'+name,sizeBytes:300});
const images=[file('photo.png','image/png'),file('drawing.JPG',' IMAGE/JPEG ')];
const files=[file('report.txt','text/plain'),file('experiments.json','application/json'),file('data.zip','application/zip'),file('sound.mp3','audio/mpeg'),file('movie.mp4','video/mp4'),file('page.html','text/html'),file('unknown.png','application/octet-stream')];
const render=(Component,props)=>renderToStaticMarkup(React.createElement(Component,props));

test('submission gallery renders uploaded images only without altering original attachments',()=>{
 const artifacts=[...files,...images],before=JSON.stringify(artifacts),html=render(Gallery,{artifacts,summary:{}});
 assert.equal((html.match(/<img /g)||[]).length,2);
 for(const image of images)assert.ok(html.includes(image.originalFileName));
 for(const file of files)assert.ok(!html.includes(file.originalFileName));
 assert.doesNotMatch(html,/<audio|<video|<iframe/);assert.equal(JSON.stringify(artifacts),before);
});
test('non-image and empty submissions hide the whole gallery rather than showing placeholders',()=>{
 assert.equal(render(Gallery,{artifacts:files,summary:{audioUrl:'https://example.invalid/audio.mp3',artifactUrl:'https://example.invalid/page.html'}}),'');
 assert.equal(render(Gallery,{artifacts:[],summary:null}),'');
});
test('historical summary image fields remain visible while other media and work pages are hidden',()=>{
 const html=render(Gallery,{artifacts:[],summary:{imageUrl:'https://example.invalid/old.png',drawingUrl:'https://example.invalid/drawing.png',audioUrl:'https://example.invalid/audio.mp3',videoUrl:'https://example.invalid/video.mp4',artifactUrl:'https://example.invalid/api/work/1'}});
 assert.equal((html.match(/<img /g)||[]).length,2);assert.doesNotMatch(html,/audio\.mp3|video\.mp4|api\/work/);
});
test('detail summary omits duplicate file metadata but retains grades, results and explanation',()=>{
 const summary={displayTitle:'实验',scoreText:'80分',resultItems:[{label:'发现',value:'奖励影响选择'}],artifacts:files,savedArtifacts:files,audioUrl:'https://example.invalid/audio.mp3',recordingUrl:'https://example.invalid/recording.wav',artifactUrl:'https://example.invalid/report.txt',processSummary:'保留过程摘要'};
 const before=JSON.stringify(summary),html=render(Summary,{summary});
 assert.match(html,/80分/);assert.match(html,/奖励影响选择/);assert.match(html,/保留过程摘要/);
 assert.doesNotMatch(html,/report\.txt|audio\.mp3|recording\.wav|experiments\.json/);assert.equal(JSON.stringify(summary),before);
});
test('image recognition uses media type rather than a misleading filename',()=>{
 assert.equal(isImageArtifact({mimeType:'image/webp'}),true);assert.equal(isImageArtifact({mimeType:'image/png; charset=binary'}),true);
 for(const mimeType of [undefined,'','image/','text/plain','application/json'])assert.equal(isImageArtifact({mimeType}),false);
});
