import { media } from './platform';
import { proposalCase } from '../shared/restoration-cases.mjs';
import { planPicturePng } from './plan-picture';

export async function proposalPresentationFiles(proposal) {
  const result=proposal.results.find(r=>r.state==='succeeded'&&r.fileId);
  if(!result)throw new Error('请先成功生成AI修复图');
  const files=[{id:result.fileId,fileName:`AI修复后的${proposalCase(proposal).shortName}.png`,title:`AI修复后的${proposalCase(proposal).shortName}`,kind:'restoration-result',projection:{role:'result'}},
    ...proposal.snapshot.evidence.map((a,i)=>({id:a.id,fileName:`线索${i+1}.png`,title:a.label||`线索${i+1}`,kind:'restoration-clue',projection:{role:'clue',clueId:a.id,label:a.label||`线索${i+1}`,feature:a.feature||'',source:a.source||''}}))];
  return [...await Promise.all(files.map(async ({id,...file})=>({...file,mimeType:'image/png',blob:await (await fetch(await media(id))).blob()}))),{fileName:'修复前与计划位置.png',title:'修复前与计划位置',kind:'restoration-plan',projection:{role:'plan'},mimeType:'image/png',blob:await planPicturePng(proposal)}];
}
