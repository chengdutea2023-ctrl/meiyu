export const FEATURE_WORKFLOW_VERSION = 1;
export const CHECK_LABELS = { reflected:'已体现', not_reflected:'未体现', unclear:'看不清' };
export const FEATURE_PARTS = ['口沿','壶流','器形','釉色','纹理','其他可见部位'];
export function validRegion(region) {
  return Array.isArray(region) && region.length === 4 && region.every(Number.isFinite) &&
    region.every(n=>n>=0&&n<=1) && region[2]-region[0]>=.02 && region[3]-region[1]>=.02;
}
export function normalizeFeatureSelections(value, clueIds) {
  if (!Array.isArray(value) || value.length > 3) throw Error('最多采用3条线索特征');
  const seen = new Set();
  return value.map(f=>{
    if(!f || !clueIds.includes(f.clueId) || seen.has(f.clueId) || !FEATURE_PARTS.includes(f.part) ||
      typeof f.feature!=='string' || f.feature.trim().length<2 || f.feature.trim().length>80 || !validRegion(f.region) ||
      !['ai_confirmed','student'].includes(f.origin) || f.origin==='ai_confirmed'&&!f.analysisId || (f.analysisId!=null && (typeof f.analysisId!=='string'||f.analysisId.length>80))) throw Error('请为采用的线索确认部位和一句可见特征');
    seen.add(f.clueId);
    return {clueId:f.clueId,part:f.part,feature:f.feature.trim(),region:[...f.region],origin:f.origin,analysisId:f.analysisId||null};
  });
}
export function featurePlan(features, evidence, selectedCase) {
  return features.map(f=>`参照${evidence.find(a=>a.id===f.clueId)?.label||'所选线索'}的${f.part}特征“${f.feature}”，补配${selectedCase.damage.replace('缺失','')}。`).join('\n');
}
export function featureDraft(value, clueIds) {
  if(value.featureWorkflow!==FEATURE_WORKFLOW_VERSION)return {};
  return {featureWorkflow:FEATURE_WORKFLOW_VERSION,featureSelections:normalizeFeatureSelections(value.featureSelections||[],clueIds),creativeText:typeof value.creativeText==='string'?value.creativeText.slice(0,120):''};
}
export function clueFeatureNote(proposal,clue) {
  const adopted=proposal.snapshot.featureSelections?.find(f=>f.clueId===clue.id);
  if(!adopted)return clue.feature||'';
  const check=proposal.featureCheck?.items?.find(c=>c.clueId===clue.id);
  return `课前发现：${clue.feature||'未填写'}\n本次采用：${adopted.part}—${adopted.feature}\n${check?`AI提示：${CHECK_LABELS[check.status]}。${check.reason}`:'AI核对尚未完成，未作为成绩。'}`;
}
