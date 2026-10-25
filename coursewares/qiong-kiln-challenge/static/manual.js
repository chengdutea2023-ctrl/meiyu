/* Real-time manual teaching model; AI retains its discrete engine. */
(function (root) {
  'use strict';
  const VERSION='realtime-v1',MAX_SECONDS=60,HEAT_RATE=3.6,COOL_RATE=3.2,FIRING_SECONDS=6;
  const rounded=n=>Math.round(n*1000)/1000;
  function record(s) {
    const p={tick:s.trace.length,elapsedSeconds:rounded(s.elapsedSeconds),temp:rounded(s.temp),maturity:s.maturity,energy:rounded(s.energy),action:s.action},last=s.trace.at(-1);
    if(last&&p.elapsedSeconds===last.elapsedSeconds){p.tick=last.tick;s.trace[s.trace.length-1]=p;}else s.trace.push(p);
  }
  function create() {
    const s={manualControlVersion:VERSION,temp:20,maturity:0,tick:0,energy:0,done:false,success:false,damaged:false,reason:'',elapsedSeconds:0,
      inRangeSeconds:0,heatSeconds:0,coolSeconds:0,action:null,paused:true,pauseReason:'',controlChanges:[],trace:[]};
    record(s);return s;
  }
  function select(s,action) {
    if(s.done||![0,2].includes(action))return false;
    if(s.action!==action)s.controlChanges.push({elapsedSeconds:rounded(s.elapsedSeconds),action});
    s.action=action;s.paused=false;s.pauseReason='';return true;
  }
  function advance(s,seconds) {
    if(s.done||s.paused||s.action===null)return;
    if(!Number.isFinite(seconds)||seconds<0||seconds>0.25)throw new RangeError('Manual frame must be between zero and 250ms');
    let dt=Math.min(seconds,MAX_SECONDS-s.elapsedSeconds);
    const rate=s.action===0?HEAT_RATE:-COOL_RATE;
    if(rate>0)dt=Math.min(dt,(94-s.temp)/rate);
    if(rate<0&&s.maturity===3&&s.temp>35)dt=Math.min(dt,(s.temp-35)/-rate);
    const before=s.temp,next=Math.max(0,Math.min(100,before+rate*dt));
    const overlap=Math.max(0,Math.min(Math.max(before,next),80)-Math.max(Math.min(before,next),58))/Math.abs(rate);
    s.inRangeSeconds=Math.min(FIRING_SECONDS,s.inRangeSeconds+overlap);
    s.temp=next;s.elapsedSeconds+=dt;s.energy+=s.action===0?dt:0;
    if(s.action===0)s.heatSeconds+=dt;else s.coolSeconds+=dt;
    s.tick=Math.floor(s.elapsedSeconds+1e-7);s.maturity=Math.min(3,Math.floor((s.inRangeSeconds+1e-7)/2));
    s.damaged=s.temp>=94-1e-7;s.success=!s.damaged&&s.maturity===3&&s.temp<=35+1e-7;
    s.done=s.success||s.damaged||s.elapsedSeconds>=MAX_SECONDS-1e-7;
    s.reason=s.success?'烧成合格':s.damaged?'过热损坏':s.done?(s.maturity<3?'烧成不足':'尚未冷却'):'';
    if(Math.floor(s.elapsedSeconds+1e-7)>Math.floor(s.trace.at(-1).elapsedSeconds+1e-7)||s.done)record(s);
    if(s.done)s.paused=true;
  }
  function controller({getState,canRun,onUpdate,onComplete},clock={now:()=>root.performance.now(),setInterval:(fn,ms)=>root.setInterval(fn,ms),clearInterval:id=>root.clearInterval(id)}) {
    let timer=null,last=0,completed=null;
    function stop(){if(timer!==null)clock.clearInterval(timer);timer=null;last=0;}
    function pause(reason='已暂停，点击加热或降温继续') {
      stop();const s=getState();if(s.manualControlVersion===VERSION&&!s.done&&s.action!==null){s.paused=true;s.pauseReason=reason;onUpdate();}
    }
    function tick() {
      if(!canRun()){pause();return;}
      const now=clock.now(),dt=(now-last)/1000;last=now;
      if(dt>0.5){pause('页面停顿，已暂停；点击加热或降温继续');return;}
      const s=getState();advance(s,Math.min(0.25,Math.max(0,dt)));onUpdate();
      if(s.done){stop();if(completed!==s){completed=s;onComplete(s);}}
    }
    return {select(action){if(!canRun())return;if(timer!==null)tick();const s=getState();if(!select(s,action))return;onUpdate();if(timer===null){last=clock.now();timer=clock.setInterval(tick,100);}},pause,stop};
  }
  root.KilnManual={VERSION,MAX_SECONDS,HEAT_RATE,COOL_RATE,FIRING_SECONDS,create,select,advance,controller};
  if(typeof module!=='undefined')module.exports=root.KilnManual;
})(typeof window!=='undefined'?window:globalThis);
