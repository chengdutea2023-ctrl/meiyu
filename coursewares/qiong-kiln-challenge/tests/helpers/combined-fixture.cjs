const E=require('../../static/engine.js'),D=require('../../static/demonstrations.js'),F=require('../../static/final-learning.js');
const SETS=[['steady','rush','low'],['rush','early','alternate'],['steady','low','early']];
function inputs(sets=SETS){
 const demonstrationLibrary={},practiceLibrary={};
 const snapshots=sets.map((selectedTypes,i)=>{
  const prepared=D.prepare(selectedTypes),practice=[];
  for(const id of selectedTypes)demonstrationLibrary[id]=prepared.demonstrations.filter(r=>r.strategyId===id);
  for(let n=0;n<300;n++)practice.push(F.practiceData(D.practice(prepared.q,n,true),n));
  const practiceExperienceKey=F.experienceKey(selectedTypes);practiceLibrary[practiceExperienceKey]=practice;
  return{id:i+1,demonstrationVersion:D.VERSION,combinationId:D.combinationId(selectedTypes),selectedTypes,demonstrationCount:60,episodes:300,rewards:{...E.DEFAULT_REWARDS},after:D.evaluate(prepared.q),qTable:prepared.q,practiceExperienceKey};
 });return {snapshots,demonstrationLibrary,practiceLibrary};
}
module.exports={inputs,SETS};
