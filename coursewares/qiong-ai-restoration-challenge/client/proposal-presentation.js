import { media } from './platform';

export async function proposalPresentationFiles(proposal) {
  const result=proposal.results.find(r=>r.state==='succeeded'&&r.fileId);
  if(!result)throw new Error('请先成功生成AI修复图');
  const files=[{id:result.fileId,fileName:'AI修复后的陶罐.png',title:'AI修复后的陶罐',kind:'restoration-result',projection:{role:'result'}},
    ...proposal.snapshot.evidence.map((a,i)=>({id:a.id,fileName:`线索${i+1}.png`,title:a.label||`线索${i+1}`,kind:'restoration-clue',projection:{role:'clue',clueId:a.id,label:a.label||`线索${i+1}`,feature:a.feature||'',source:a.source||''}}))];
  return Promise.all(files.map(async ({id,...file})=>({...file,mimeType:'image/png',blob:await (await fetch(await media(id))).blob()})));
}
