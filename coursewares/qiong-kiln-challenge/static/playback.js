/* Presentation clock only; action decisions still come from the learned Q table. */
(function(root){
  'use strict';
  const DURATION_MS=30000,VERSION='paced-v1';
  function sequence(engine,q,seed,rewards,mode='ai',profile=null){
    const s=engine.create(seed,profile?.disturbance??2,profile),rng=engine.random(30),actions=[];
    while(!s.done){const action=mode==='fixed'?engine.fixed(s):engine.choose(q,s,rng);actions.push(action);engine.step(s,action,rewards);}
    return actions;
  }
  function player({onStep,onUpdate,canRun},clock={now:()=>root.performance.now(),setInterval:(fn,ms)=>root.setInterval(fn,ms),clearInterval:id=>root.clearInterval(id)}){
    let actions=[],index=0,elapsedMs=0,running=false,timer=null,last=0;
    const status=()=>({version:VERSION,targetMs:DURATION_MS,index,totalSteps:actions.length,elapsedMs,running,finished:actions.length>0&&index===actions.length});
    const emit=()=>onUpdate(status());
    function clear(){if(timer!==null)clock.clearInterval(timer);timer=null;}
    function pause(account=true){
      if(!running)return;
      const dt=clock.now()-last;if(account&&dt>=0&&dt<=500)elapsedMs=Math.min(DURATION_MS,elapsedMs+dt);
      running=false;clear();emit();
    }
    function perform(){const action=actions[index++];onStep(action);}
    function tick(){
      if(!canRun()){pause(false);return;}
      const now=clock.now(),dt=now-last;last=now;
      if(dt>500||dt<0){pause(false);return;}
      elapsedMs=Math.min(DURATION_MS,elapsedMs+dt);
      const due=actions.length===1?DURATION_MS:DURATION_MS*index/(actions.length-1);
      if(index<actions.length&&elapsedMs+1e-5>=due)perform();
      if(index===actions.length){running=false;clear();}
      emit();
    }
    return {status,pause,reset(next=[]){
      if(!Array.isArray(next)||next.length>22||next.some(a=>![0,1,2].includes(a)))throw new TypeError('Invalid replay actions');
      clear();actions=[...next];index=0;elapsedMs=0;running=false;
    },run(){
      if(running||!actions.length||index===actions.length||!canRun())return false;
      running=true;last=clock.now();
      if(index===0&&actions.length>1)perform();
      emit();if(running)timer=clock.setInterval(tick,100);return true;
    }};
  }
  root.KilnPlayback={DURATION_MS,VERSION,sequence,player};
  if(typeof module!=='undefined')module.exports=root.KilnPlayback;
})(typeof window!=='undefined'?window:globalThis);
