/* Real-time manual teaching model; AI retains its discrete engine. */
(function (root) {
  'use strict';
  const VERSION='realtime-v1',MAX_SECONDS=60,HEAT_RATE=3.6,COOL_RATE=3.2,FIRING_SECONDS=6;
  const HAZARD_VERSION='hazards-v1',HIGH_SECONDS=2,LOW_SECONDS=3,RELIGHT_SECONDS=5;
  const LOW_HEAT=35+(300-60)*23/940,ARM_HEAT=35+(600-60)*23/940;
  const rounded=n=>Math.round(n*1000)/1000;
  function record(s) {
    const p={tick:s.trace.length,elapsedSeconds:rounded(s.elapsedSeconds),temp:rounded(s.temp),maturity:s.maturity,energy:rounded(s.energy),action:s.action,
      fireState:s.fireState,highSeconds:rounded(s.highSeconds),lowSeconds:rounded(s.lowSeconds),cooldownRemaining:rounded(s.cooldownRemaining)},last=s.trace.at(-1);
    if(last&&p.elapsedSeconds===last.elapsedSeconds){p.tick=last.tick;s.trace[s.trace.length-1]=p;}else s.trace.push(p);
  }
  function create() {
    const s={manualControlVersion:VERSION,temp:20,maturity:0,tick:0,energy:0,done:false,success:false,damaged:false,reason:'',elapsedSeconds:0,
      inRangeSeconds:0,heatSeconds:0,coolSeconds:0,action:null,paused:true,pauseReason:'',controlChanges:[],trace:[],
      hazardVersion:HAZARD_VERSION,fireState:'ready',highSeconds:0,lowSeconds:0,lowArmed:false,cooldownRemaining:0,exploded:false,events:[]};
    record(s);return s;
  }
  function select(s,action) {
    if(s.done||![0,2].includes(action))return false;
    if(action===0&&s.fireState==='out'){
      if(s.cooldownRemaining>1e-7)return false;
      s.events.push({type:'relight',elapsedSeconds:rounded(s.elapsedSeconds)});
      s.lowArmed=false;s.lowSeconds=0;
    }
    if(action===0)s.fireState='burning';
    if(s.action!==action)s.controlChanges.push({elapsedSeconds:rounded(s.elapsedSeconds),action});
    s.action=action;s.paused=false;s.pauseReason='';return true;
  }
  function advance(s,seconds) {
    if(s.done||s.paused||s.action===null)return;
    if(!Number.isFinite(seconds)||seconds<0||seconds>0.25)throw new RangeError('Manual frame must be between zero and 250ms');
    let dt=Math.min(seconds,MAX_SECONDS-s.elapsedSeconds);
    const wasOut=s.fireState==='out',rate=wasOut?-.7:s.action===0?HEAT_RATE:-COOL_RATE;
    if(rate<0&&s.maturity===3&&s.temp>35)dt=Math.min(dt,(s.temp-35)/-rate);
    const before=s.temp,raw=before+rate*dt,next=Math.max(0,Math.min(100,raw));
    const overlap=Math.max(0,Math.min(Math.max(before,next),80)-Math.max(Math.min(before,next),58))/Math.abs(rate);
    s.inRangeSeconds=Math.min(FIRING_SECONDS,s.inRangeSeconds+overlap);
    s.temp=next;s.elapsedSeconds+=dt;s.energy+=!wasOut&&s.action===0?dt:0;
    if(!wasOut&&s.action===0)s.heatSeconds+=dt;else s.coolSeconds+=dt;
    if(wasOut)s.cooldownRemaining=Math.max(0,s.cooldownRemaining-dt);
    s.tick=Math.floor(s.elapsedSeconds+1e-7);s.maturity=Math.min(3,Math.floor((s.inRangeSeconds+1e-7)/2));
    // Count continuous time above/below each limit, including threshold crossings.
    const above=rate>0?Math.max(0,dt-Math.max(0,(94-before)/rate)):Math.min(dt,Math.max(0,(before-94)/-rate));
    const high=s.highSeconds+above;
    s.highSeconds=next>=94?high:0;
    if(high>=HIGH_SECONDS-1e-7){s.exploded=true;s.events.push({type:'blast',elapsedSeconds:rounded(s.elapsedSeconds)});}
    if(next>=ARM_HEAT)s.lowArmed=true;
    if(s.lowArmed&&s.maturity<3&&!wasOut){
      const below=rate<0?Math.max(0,dt-Math.max(0,(before-LOW_HEAT)/-rate)):Math.min(dt,Math.max(0,(LOW_HEAT-before)/rate));
      const low=s.lowSeconds+below;s.lowSeconds=next<LOW_HEAT?low:0;
      if(low>=LOW_SECONDS-1e-7){
        s.fireState='out';s.action=2;s.cooldownRemaining=RELIGHT_SECONDS;s.lowArmed=false;s.lowSeconds=0;
        s.events.push({type:'flameout',elapsedSeconds:rounded(s.elapsedSeconds)});record(s);
      }
    }
    s.damaged=s.exploded;s.success=!s.damaged&&s.maturity===3&&s.temp<=35+1e-7;
    s.done=s.success||s.damaged||s.elapsedSeconds>=MAX_SECONDS-1e-7;
    s.reason=s.success?'烧成合格':s.damaged?'持续过热，炸膛':s.done?(s.maturity<3?'烧成不足':'尚未冷却'):'';
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
  root.KilnManual={VERSION,MAX_SECONDS,HEAT_RATE,COOL_RATE,FIRING_SECONDS,HAZARD_VERSION,HIGH_SECONDS,LOW_SECONDS,RELIGHT_SECONDS,LOW_HEAT,ARM_HEAT,create,select,advance,controller};
  if(typeof module!=='undefined')module.exports=root.KilnManual;
})(typeof window!=='undefined'?window:globalThis);
