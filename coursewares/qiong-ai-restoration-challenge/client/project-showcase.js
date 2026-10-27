import {media,demo,submittedRecordForProjection} from './platform';
import {hydrateRestorationRecord,restorationProjectionModel} from '../shared/projection-record.mjs';
import {showcasePage,resultRegion} from '../shared/showcase.mjs';
import {proposalCase} from '../shared/restoration-cases.mjs';
import {planPictureCanvas} from './plan-picture';
export async function studentShowcaseModel(proposal){
    if(demo){
      const s=proposal.snapshot,result=proposal.results.find(r=>r.state==='succeeded'&&r.fileId);
      const clues=await Promise.all(s.evidence.map(async a=>({clueId:a.id,label:a.label,feature:a.feature,source:a.source,image:await media(a.id)})));
      return {proposalId:proposal.id,caseName:proposalCase(proposal).name,proposalText:s.proposalText,resultImage:result?await media(result.fileId):'',planImage:(await planPictureCanvas(proposal)).toDataURL('image/png'),resultRegion:resultRegion(s),featureSelections:s.featureSelections,featureCheck:proposal.featureCheck,creativeText:s.creativeText,clues,mocked:proposal.mocked,student:'本地预览'};
    }else{
      const record=await submittedRecordForProjection(proposal.id),base=new URLSearchParams(location.search).get('platformApiBase');
      const hydrated=await hydrateRestorationRecord(record,{baseUrl:base});return restorationProjectionModel(hydrated,base);
    }
}
export async function openStudentProjection(proposal){
  const popup=window.open('','_blank');if(!popup)throw Error('浏览器阻止了投屏窗口，请允许弹出窗口后重试。');
  popup.opener=null;popup.document.write('<!doctype html><meta charset="utf-8"><p>正在读取学习成果…</p>');
  try{
    const html=showcasePage(await studentShowcaseModel(proposal));
    if(popup.closed)return;popup.document.open();popup.document.write(html);popup.document.close();
  }catch(e){if(!popup.closed)popup.close();throw e;}
}
