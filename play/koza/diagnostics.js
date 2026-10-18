'use strict';
// Development diagnostics. Silent in production: enabled only by the Vite dev
// server (window.KOZA_DEV), ?debug in the URL or localStorage "koza-debug"="1".
window.KozaDiag=(()=>{
 let enabled=!!window.KOZA_DEV;
 try{enabled=enabled||/[?&]debug\b/.test(location.search)||localStorage.getItem('koza-debug')==='1';}catch{}
 const events=[],metrics={loads:{},missions:[],frames:{count:0,slow:0,worstMs:0,sumMs:0},actors:{enemies3d:0,boss3d:0,peakEnemies3d:0}};
 function log(tag,...args){
  events.push({t:Math.round(performance.now()),tag,args:args.map(a=>typeof a==='object'?JSON.stringify(a):String(a))});
  if(events.length>200)events.shift();
  if(enabled)console.info('[KOZA:'+tag+']',...args);
 }
 function warn(tag,...args){
  events.push({t:Math.round(performance.now()),tag,warn:true,args:args.map(a=>String(a?.message||a))});
  if(events.length>200)events.shift();
  if(enabled)console.warn('[KOZA:'+tag+']',...args);
 }
 // Stage lifecycle timeline (developer diagnostics). A stage that is not followed
 // by the next one within 15 s is reported as a stall with the last stage name.
 const stages=[];let stallTimer=0;
 const terminal=new Set(['READY_TO_PLAY','NORMAL_STAGE_COMPLETE','LATE_ASSET_SWAP']);
 function stage(name,info={}){
  const t=Math.round(performance.now()),prev=stages.at(-1);
  stages.push({name,t,sincePrevMs:prev?t-prev.t:0,...info});if(stages.length>40)stages.shift();
  log('stage',name,info,prev?'+'+(t-prev.t)+'ms after '+prev.name:'');
  clearTimeout(stallTimer);if(!terminal.has(name))stallTimer=setTimeout(()=>warn('stage','stalled 15 s after '+name),15000);
 }
 function load(file,info){metrics.loads[file]={...(metrics.loads[file]||{}),...info};log('load',file,info);}
 function frame(ms){const f=metrics.frames;f.count++;f.sumMs+=ms;if(ms>34)f.slow++;if(ms>f.worstMs)f.worstMs=ms;}
 function actors(kind,count){metrics.actors[kind]=count;if(kind==='enemies3d')metrics.actors.peakEnemies3d=Math.max(metrics.actors.peakEnemies3d,count);}
 function report(){
  const f=metrics.frames,models=window.KozaModelDiagnostics;
  return {enabled,stages:stages.slice(-12),frames:{count:f.count,avgMs:f.count?+(f.sumMs/f.count).toFixed(2):0,slowOver34ms:f.slow,worstMs:+f.worstMs.toFixed(1)},actors:{...metrics.actors},loads:metrics.loads,missions:metrics.missions.slice(-20),renderer:models?{contexts:models.contexts,loads:models.loads,drawCalls:models.drawCalls,triangles:models.triangles,renderMs:+(models.renderMs||0).toFixed(2),resolution:models.resolution,failures:models.failures?.slice(-10),costs:models.costs}:null,events:events.slice(-40)};
 }
 // Optional dev overlay (?debug=perf): frame time, 3D actors, renderer cost.
 let overlay=null,lastPaint=0;
 function paint(){
  try{if(!/[?&]debug=perf\b/.test(location.search))return;}catch{return;}
  const now=performance.now();if(now-lastPaint<500)return;lastPaint=now;
  if(!overlay){overlay=document.createElement('pre');overlay.style.cssText='position:fixed;left:4px;top:4px;z-index:200;margin:0;padding:4px 6px;font:10px/1.3 monospace;color:#dff;background:#0009;pointer-events:none;border-radius:4px';document.body.append(overlay);}
  const r=report(),m=window.KozaModelDiagnostics;
  overlay.textContent='frame avg '+r.frames.avgMs+'ms worst '+r.frames.worstMs+'ms slow '+r.frames.slowOver34ms+'\n3D enemies '+r.actors.enemies3d+' (peak '+r.actors.peakEnemies3d+')\n3D render '+(m?(+m.renderMs||0).toFixed(1)+'ms '+m.triangles+' tris '+m.drawCalls+' calls':'n/a')+(window.KOZA_Q3?'\nQ3 hitches '+KOZA_Q3.hitches.length+(KOZA_Q3.hitches.length?' last '+KOZA_Q3.hitches[KOZA_Q3.hitches.length-1].rawMs+'ms->'+KOZA_Q3.hitches[KOZA_Q3.hitches.length-1].simMs+'ms':'')+' dropped '+(KOZA_Q3.dropped*1000|0)+'ms':'');
 }
 const frameBase=frame;function frameAndPaint(ms){frameBase(ms);paint();}
 return {get enabled(){return enabled;},set enabled(v){enabled=!!v;},log,warn,stage,stages,load,frame:frameAndPaint,actors,report,metrics};
})();

/* ===== KOZA 516.6-q31 — phone performance diagnostics + A/B perfcase modes =====
   Diagnostic ONLY: every switch below changes what is DRAWN (or how the boss image is rendered), never the simulation,
   collision, timing or input. ?perfcase=normal|q3|noBossVfx|noBoss3d|noLateSwap|minimalFx   (+ optional ?r3d=pp:high,aa:0,res:384,hz:20,hzidle:30,direct:0)
   Overlay: shown when ?perfcase=… or ?debug=perf is present. Traces: POSTed to /q3-trace (the local test server writes them to
   logs\phone-traces.jsonl on the PC) every 10 s during a guardian encounter and at its end. */
window.KOZA_PERF=(()=>{
 let q;try{q=new URLSearchParams(location.search);}catch{q=new URLSearchParams('');}
 const pc=(q.get('perfcase')||'normal').trim(),known=['normal','q3','noBossVfx','noBoss3d','noLateSwap','minimalFx'],cs=known.includes(pc)?pc:'normal';
 const legacy=cs==='q3'||cs==='noLateSwap';
 const r3={};for(const kv of (q.get('r3d')||'').split(',').filter(Boolean)){const [k,v]=kv.split(':');r3[k]=v;}
 const num=(v,d)=>{const n=Number(v);return Number.isFinite(n)&&n>0?n:d;};
 const cfg={
  case:cs,legacy,
  lateSwap:cs==='q3',                        // Q3 behaviour: a boss model / boss arena that finishes late swaps in during combat
  bossModelBudgetMs:legacy?4500:25000,       // Q3.1: the loading screen waits for the boss model (download + decode + shaders + textures)
  noBoss3d:cs==='noBoss3d',noBossVfx:cs==='noBossVfx',minimalFx:cs==='minimalFx',
  power:r3.pp==='low'?'low-power':r3.pp==='high'?'high-performance':(legacy?'low-power':'high-performance'),
  antialias:r3.aa!=null?r3.aa==='1':true,       // kept ON: headless A/B showed visible jaggies on the dragon wings without MSAA; phone A/B: ?r3d=aa:0
  res:num(r3.res,0),
  hzAttack:legacy&&r3.hz==null?0:num(r3.hz,20),
  hzIdle:legacy&&r3.hzidle==null?0:num(r3.hzidle,30),
  direct:r3.direct==='1',
  fxBudget:cs==='minimalFx'?0:legacy?Infinity:24,
  gradCache:!legacy,
  hudStable:!legacy,
  diag:cs!=='normal'||q.has('perfcase')||/[?&]debug=perf\b/.test(location.search)||q.has('perf')
 };
 const S={frames:0,gapSum:0,gapMax:0,long50:0,long100:0,long250:0,hist:[0,0,0,0,0,0],comp:{},compMax:{},stalls:[],resAfter:[],lateModel:0,lateArena:0,
  heap:[],started:0,bossIndex:null,region:'',stage:0,uploadAt:0,session:Math.random().toString(36).slice(2,8),seq:0};
 let cur=null,prev=null,prevNow=0,combatStart=0,inCombat=false;
 const now=()=>performance.now();
 const add=(k,ms)=>{if(cur){cur[k]=(cur[k]||0)+ms;}};
 function wrap(obj,key,label,off){if(!obj||typeof obj[key]!=='function'||obj[key].__q31)return;const f=obj[key];const w=function(...a){if(off&&off())return undefined;const t=now();try{return f.apply(this,a);}finally{add(label,now()-t);}};w.__q31=true;obj[key]=w;}
 function resetSession(){Object.assign(S,{frames:0,gapSum:0,gapMax:0,long50:0,long100:0,long250:0,hist:[0,0,0,0,0,0],comp:{},compMax:{},stalls:[],resAfter:[],lateModel:0,lateArena:0,heap:[],seq:0});prevNow=0;}
 function ctxInfo(){const b=window.KozaAdventure?.state?.boss;const M=window.KozaModelDiagnostics||{};return {boss:typeof runMission!=='undefined'&&runMission?.boss?runMission.number:0,stage:b?.stage||'',skill:b?.skill||'',action:b?(b.charge>0?'windup':b.action>0?'active':(b.recovery||0)>0?'recovery':'ready'):'',phase:window.KozaAdventure?.state?.bossPhase??'',
  res:M.resolution||0,lights:typeof orbs!=='undefined'?orbs.filter(o=>o.bossMark).length:0,hazards:typeof hazards!=='undefined'?hazards.length:0,elapsed:typeof elapsed!=='undefined'?+elapsed.toFixed(2):0};}
 function onFrame(ts,run){
  const playing=typeof mode!=='undefined'&&mode==='play';
  const gap=prevNow?ts-prevNow:0;prevNow=ts;
  prev=cur;cur={};const t0=now();run();cur.total=now()-t0;
  const M=window.KozaModelDiagnostics;if(M&&M.__f!==M.frames){M.__f=M.frames;cur.b3dRender=M.renderOnlyMs||0;cur.b3dCopy=M.copyMs||0;cur.b3dPose=M.poseMs||0;cur.b3dRenders=1;}
  if(M&&M.blitMs!=null){cur.b3dBlit=M.blitMs;M.blitMs=null;}
  if(!playing||!gap)return;
  S.frames++;S.gapSum+=gap;S.gapMax=Math.max(S.gapMax,gap);if(gap>50)S.long50++;if(gap>100)S.long100++;if(gap>250)S.long250++;
  S.hist[gap<20?0:gap<34?1:gap<50?2:gap<100?3:gap<250?4:5]++;
  for(const k in cur){S.comp[k]=(S.comp[k]||0)+cur[k];S.compMax[k]=Math.max(S.compMax[k]||0,cur[k]);}
  if(gap>=100){const recent=performance.getEntriesByType?.('resource')?.filter(e=>e.responseEnd>ts-1000&&!/q3-trace/.test(e.name)).map(e=>e.name.split('/').pop().split('?')[0]).slice(-4)||[];
   S.stalls.push({at:+(ts/1000).toFixed(2),gap:Math.round(gap),...ctxInfo(),prevFrame:round(prev),thisFrame:round(cur),hitch:!!(window.KOZA_Q3?.hitches?.length&&now()-window.KOZA_Q3.hitches[window.KOZA_Q3.hitches.length-1].at<200),
    lateSwapModel:S.lateModel,lateSwapArena:S.lateArena,resourcesFinishedLast1s:recent,heapMB:heapMB()});if(S.stalls.length>30)S.stalls.shift();}
 }
 const round=o=>{const r={};for(const k in o||{})r[k]=+o[k].toFixed(1);return r;};
 const heapMB=()=>performance.memory?+(performance.memory.usedJSHeapSize/1048576).toFixed(1):null;
 function summary(){const n=Math.max(1,S.frames),avg={};for(const k in S.comp)avg[k]=+(S.comp[k]/n).toFixed(2);
  return {build:window.KOZA_Q3?.version||'',perfcase:cfg.case,cfg:{power:cfg.power,antialias:cfg.antialias,res:cfg.res,hzAttack:cfg.hzAttack,hzIdle:cfg.hzIdle,direct:cfg.direct,fxBudget:cfg.fxBudget},
   device:{ua:navigator.userAgent,dpr:devicePixelRatio,w:innerWidth,h:innerHeight,cores:navigator.hardwareConcurrency||0,mem:navigator.deviceMemory||0},
   session:S.session,seq:++S.seq,boss:S.bossIndex!=null?(S.bossIndex+1)*5:0,region:S.region,model3d:!!window.KozaDeer3D?.isReady?.(S.bossIndex??-1,S.region),resolution:window.KozaModelDiagnostics?.resolution||0,
   frames:S.frames,gapAvg:+(S.gapSum/n).toFixed(1),gapMax:Math.round(S.gapMax),long50:S.long50,long100:S.long100,long250:S.long250,hist:S.hist,avgMs:avg,maxMs:round(S.compMax),
   b3dRenderHz:+((S.comp.b3dRenders||0)/Math.max(.001,S.gapSum/1000)).toFixed(1),
   autoPauses:S.autoPauses||0,hitches:window.KOZA_Q3?.hitches?.length||0,requestsAfterCombatStart:S.resAfter.length,resAfter:S.resAfter.slice(-12),lateModelSwaps:S.lateModel,lateArenaSwaps:S.lateArena,
   heapTrend:S.heap.slice(-12),stalls:S.stalls};}
 function upload(final){if(!cfg.diag||!S.frames)return;const body=JSON.stringify({final:!!final,t:new Date().toISOString(),...summary()});
  try{fetch('/q3-trace',{method:'POST',headers:{'content-type':'application/json'},body,keepalive:body.length<60000}).catch(()=>{});}catch{}}
 let overlay=null,lastPaint=0;
 function paint(){if(!cfg.diag)return;const t=now();if(t-lastPaint<500)return;lastPaint=t;
  if(!overlay){overlay=document.createElement('pre');overlay.style.cssText='position:fixed;left:4px;top:4px;z-index:200;margin:0;padding:4px 6px;font:10px/1.25 monospace;color:#dff;background:#000b;pointer-events:none;border-radius:4px;max-width:62vw;white-space:pre-wrap';document.body.append(overlay);}
  const s=summary(),a=s.avgMs,last=S.stalls[S.stalls.length-1];
  overlay.textContent=`Q3.1 ${cfg.case}  ${s.boss?'boss '+s.boss:''} 3D ${s.model3d?s.resolution+'px '+s.b3dRenderHz+'Hz':'yok'}\n`+
   `kare ort ${s.gapAvg}ms  max ${s.gapMax}  >50:${s.long50} >100:${s.long100} >250:${s.long250}\n`+
   `3D render ${a.b3dRender??0} kopya ${a.b3dCopy??0} blit ${a.b3dBlit??0} poz ${a.b3dPose??0}\n`+
   `bossFX ${a.combatfx??0} powerFX ${a.powerfx??0} kameraFX ${a.cameraFx??0} adım ${a.step??0} çizim ${a.render??0}\n`+
   `ağ(savaş) ${s.requestsAfterCombatStart}  geç model ${s.lateModelSwaps} geç arena ${s.lateArenaSwaps}  heap ${heapMB()??'-'}MB`+
   (last?`\nSON TAKILMA ${last.gap}ms ${last.action||''}${last.skill?'/'+last.skill:''} 3D=${((last.prevFrame.b3dRender||0)+(last.prevFrame.b3dCopy||0)).toFixed(0)} fx=${(last.prevFrame.combatfx||0).toFixed(0)} kam=${(last.prevFrame.cameraFx||0).toFixed(0)}`:'');}
 function install(){
  const off=(flag)=>()=>!!flag;
  wrap(window,'step','step');wrap(window,'render','render');wrap(window,'updateHUD','hud');
  wrap(window.KozaCombatFX,'boss','combatfx',off(cfg.noBossVfx));
  wrap(window.KozaPowerFX,'over','powerfx',off(cfg.minimalFx));wrap(window.KozaPowerFX,'under','powerfx',off(cfg.minimalFx));
  wrap(window.KozaGameFeel,'draw','powerfx',off(cfg.minimalFx));
  wrap(window.KozaCamera,'drawFx','cameraFx',off(cfg.minimalFx));
  wrap(window.KozaDeer3D,'draw','boss3d');
  // late swaps during combat
  const D=window.KozaDeer3D;if(D&&D.release&&!D.release.__q31){const r=D.release;D.release=function(...a){if(inCombat)S.lateModel++;return r.apply(this,a);};D.release.__q31=1;}
  const A=window.KozaAssets;if(A&&A.applyBackground&&!A.applyBackground.__q31){const f=A.applyBackground;A.applyBackground=function(...a){if(inCombat)S.lateArena++;return f.apply(this,a);};A.applyBackground.__q31=1;}
  const P=window.pause;if(typeof P==='function'&&!P.__q31){window.pause=function(...a){if(inCombat)S.autoPauses=(S.autoPauses||0)+1;return P.apply(this,a);};window.pause.__q31=1;}
  const L=window.loop;if(typeof L==='function'&&!L.__q31){window.loop=function(ts){onFrame(ts,()=>L(ts));paint();};window.loop.__q31=1;}
  // encounter lifecycle
  const Ad=window.KozaAdventure;
  setInterval(()=>{const playing=typeof mode!=='undefined'&&['play','paused','choice'].includes(mode),boss=playing&&typeof runMission!=='undefined'&&!!runMission?.boss;
   if(boss&&!inCombat){inCombat=true;combatStart=now();resetSession();S.bossIndex=Math.floor(runMission.number/5)-1;S.region=typeof runRegion!=='undefined'?runRegion:'';}
   if(inCombat&&!boss){inCombat=false;upload(true);}
   if(inCombat){const h=heapMB();if(h!=null)S.heap.push(h);if(S.heap.length>60)S.heap.shift();if(now()-S.uploadAt>10000){S.uploadAt=now();upload(false);}}},1000);
  try{new PerformanceObserver(l=>{if(!inCombat)return;for(const e of l.getEntries()){if(/q3-trace/.test(e.name))continue;S.resAfter.push({name:e.name.split('/').pop().split('?')[0],start:+((e.startTime-combatStart)/1000).toFixed(2),end:+((e.responseEnd-combatStart)/1000).toFixed(2),kb:Math.round((e.transferSize||0)/1024)});if(S.resAfter.length>80)S.resAfter.shift();}}).observe({type:'resource',buffered:false});}catch{}
 }
 addEventListener('load',()=>setTimeout(install,0));
 return Object.assign(cfg,{summary,upload,stats:S});
})();
