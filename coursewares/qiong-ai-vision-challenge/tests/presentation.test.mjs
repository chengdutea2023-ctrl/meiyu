import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const require=createRequire(import.meta.url);
const source=await readFile(new URL('../src/ModelEvidence.jsx',import.meta.url),'utf8');
const module={exports:{}};
vm.runInNewContext(ts.transpileModule(source,{fileName:'ModelEvidence.jsx',compilerOptions:{allowJs:true,jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText,{module,exports:module.exports,require});
const render=Component=>renderToStaticMarkup(React.createElement(Component,{info:{model:'doubao-seed-2-1-pro-260915'},onDetails:()=>{}}));
test('model introduction uses computer vision rather than provider brand or technical model IDs',()=>{
 for(const Component of [module.exports.ModelEvidenceSummary,module.exports.ModelEvidenceDetails]){
  const html=render(Component);assert.match(html,/计算机视觉/);assert.doesNotMatch(html,/实际使用|火山|豆包|doubao|Seed-2|模型 ID|当前服务模型/i);
 }
});
test('student-facing labels and generated image captions have no provider-brand copy',async()=>{
 const app=await readFile(new URL('../src/App.jsx',import.meta.url),'utf8');
 assert.doesNotMatch(app,/火山|豆包|实际使用|Doubao-Seed/);
 assert.match(app,/计算机视觉 · 依据当前图片描述/);assert.match(app,/计算机视觉 · 真实识别/);
 assert.doesNotMatch(source,/validation\.model|info\?\.model/);
});
