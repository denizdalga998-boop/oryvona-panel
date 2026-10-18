'use strict';
window.kozaReady=false;
window.KozaLoading=(()=>{
 const screen=$('loadingScreen'),progress=$('loadingProgress'),pictures=new Map(),diag=(...a)=>window.KozaDiag?.log('loading',...a),warn=(...a)=>window.KozaDiag?.warn('loading',...a);
 let serial=0,busy=false,prepared=null,retry=null,attemptTag=0,graceUntil=0,preloaded=null,startWatch=0,lastShown=['garden',1,false],watchTries=0;
 const stage=(name,info)=>window.KozaDiag?.stage?.(name,info);
 // v5.14 lifecycle budgets. Critical work (arena painting with its fallback, hero
 // atlas) gates the stage; optional 3D preparation gets a short budget after the
 // critical work and then continues in the background, swapping in safely later.
 const MODEL_BUDGET_MS=4500,WATCHDOG_MS=70000,GRACE_MS=1800;
 // A mission request is captured once when loading starts. It no longer changes
 // if the challenge flag or another UI path is touched while assets load.
 const regionOf=challenge=>challenge?'grove':Expedition.unlocked(profile,profile.region)?profile.region:'garden';
 const key=(challenge=false)=>{const region=regionOf(challenge);return [profile.active,region,challenge?1:profile.campaign.selected[region],challenge].join(':');};
 function bounded(promise,ms=20000,label='Yükleme'){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(label+' zaman aşımı')),ms);Promise.resolve(promise).then(v=>{clearTimeout(timer);resolve(v);},e=>{clearTimeout(timer);reject(e);});});}
 function imageReady(img,ms=15000){
  if(img.complete&&img.naturalWidth)return Promise.resolve();
  // An image that already failed never fires another load/error event.
  if(img.complete&&img.src&&!img.naturalWidth)return Promise.reject(Error('Görsel yüklenemedi'));
  return bounded(new Promise((resolve,reject)=>{const done=()=>{img.removeEventListener('load',ok);img.removeEventListener('error',bad);};const ok=()=>{done();resolve();},bad=()=>{done();reject(Error('Görsel yüklenemedi'));};img.addEventListener('load',ok,{once:true});img.addEventListener('error',bad,{once:true});}),ms,'Görsel');
 }
 // Failed pictures are forgotten, so the next attempt performs a real request.
 function picture(file,bust=0,ms=15000){
  const cached=pictures.get(file);if(cached&&!bust)return cached;
  const img=new Image();img.src=bust?file+(file.includes('?')?'&':'?')+'retry='+bust:file;
  const pending=imageReady(img,ms).catch(e=>{if(pictures.get(file)===pending)pictures.delete(file);throw e;});
  pictures.set(file,pending);return pending;
 }
 // Required pictures get one automatic, cache-busted second request.
 function required(file){return picture(file,attemptTag).catch(error=>{warn('retrying picture',file,error);return picture(file,Date.now());});}
 // Boss arenas use large new background paintings. The tester's mid-bar
 // "Sahne yüklenemedi" came from these: a fixed 15 s image deadline on a slow
 // connection. Now the arena gets a longer window; if it is still not ready the
 // stage starts on the region's normal arena (already cached) and the boss
 // painting swaps in as soon as it finishes. The download is never restarted.
 function arena(region,number){
  const file=KozaAssets.backgroundFor(region,number),normal=KozaAssets.backgroundFor(region,1);
  return picture(file,attemptTag,22000).then(()=>({file,fallback:false}),error=>{
   if(file===normal)return required(normal).then(()=>({file,fallback:false}));
   warn('arena fallback',file,error);
   // Keep loading the real painting in the background for a later swap.
   pictures.delete(file);const late=picture(file,0,120000);late.catch(()=>{});
   return required(normal).then(()=>({file,fallback:true,late}));
  });
 }
 function percentage(value){progress.value=value;$('loadingPercent').textContent='%'+Math.round(value);}
 function show(region,level,challenge,boot){const original=boot&&region==='garden'?{image:'loading-garden-boot-v56.png',lore:'Sonra koruların özü parçalanıp göğe savruldu…'}:KozaAssets.loadingFor(region,level,challenge);const spec={...original,image:KozaAssets.nextLoadingImage(),fallback:original.image};screen.style.setProperty('--loading-art',`url("${spec.image}")`);screen.dataset.art=spec.image;screen.dataset.artFallback='false';screen.dataset.region=region;screen.dataset.encounter=challenge?'challenge':level%5===0?'boss':'normal';$('loadingLore').textContent=spec.lore;$('loadingTitle').textContent=boot?'Dünya hazırlanıyor':challenge?'Meydan okuma hazırlanıyor':'Dünya hazırlanıyor';$('loadingText').textContent='Sahne hazırlanıyor…';$('loadingCancel').hidden=boot;$('loadingRetry').hidden=true;percentage(0);screen.hidden=false;screen.setAttribute('aria-busy','true');document.body.classList.add('loading-world');$('app').inert=true;return spec;}
 function loadingPicture(spec,id){return picture(spec.image).catch(()=>{
  if(id!==serial)return;
  screen.style.setProperty('--loading-art',`url("${spec.fallback}")`);screen.dataset.art=spec.fallback;screen.dataset.artFallback='true';
  return picture(spec.fallback).catch(()=>{});
 });}
 function hide(){screen.hidden=true;screen.setAttribute('aria-busy','false');document.body.classList.remove('loading-world');$('app').inert=false;}
 // The displayed bar never runs ahead of real work. Cached loads still get a
 // readable presentation; the game clock starts only after the ready hold.
 // Tasks: {weight,load,optional?,budget?}. Critical tasks must finish (each one is
 // bounded and has its own fallback); an optional task is counted as done once it
 // finishes OR its budget after the critical work has elapsed, so the bar can never
 // wait forever on it. A hard watchdog turns any unexpected stall into the Retry
 // screen instead of a frozen bar.
 async function run(tasks,id,minimumMs){
  const total=tasks.reduce((n,t)=>n+t.weight,0),began=performance.now();let failed=null,criticalAt=0;
  for(const task of tasks){task.done=false;const t0=performance.now();
   Promise.resolve().then(()=>task.load()).then(()=>{task.done=true;if(task.name)diag(task.name,Math.round(performance.now()-t0)+'ms');},error=>{if(task.optional){task.done=true;warn('optional task failed',task.name||'',error);}else failed=failed||error;});}
  while(id===serial){
   if(failed)throw failed;
   const now=performance.now(),elapsed=now-began;
   if(elapsed>WATCHDOG_MS)throw Error('Yükleme bekçisi: '+tasks.filter(t=>!t.done&&!t.optional).map(t=>t.name||'görsel').join(', '));
   const critical=tasks.every(t=>t.optional||t.done);if(critical&&!criticalAt)criticalAt=now;
   for(const t of tasks)if(t.optional&&!t.done&&!t.skipped&&criticalAt&&now-criticalAt>=(t.budget??MODEL_BUDGET_MS)){t.skipped=true;diag('optional budget reached',t.name||'');}
   const done=tasks.reduce((n,t)=>n+(t.done||t.skipped?t.weight:0),0),actual=done/total*100;
   percentage(Math.min(actual,elapsed/minimumMs*100));
   if(done===total&&elapsed>=minimumMs){percentage(100);$('loadingText').textContent='Hazır';await new Promise(resolve=>setTimeout(resolve,300));return;}
   $('loadingText').textContent=done===total?'Dünya hazır, yolculuk başlıyor…':critical?'Son dokunuşlar…':'Dostların ve dünya hazırlanıyor…';
   await new Promise(resolve=>setTimeout(resolve,32));
  }
 }
 // Optional 3D preparation. The foreground attempt (download, parse, shader warm)
 // is only waited on for a short budget by run(); whatever is not ready by then
 // continues here in the background. A boss that finishes later swaps in only
 // after its shaders are warm, and only while that same mission is running.
 const bossIndex=mission=>Math.floor(mission.number/5)-1;
 function modelAttempt(mission,region,{hold=false}={}){
  const low=preferences.quality==='low';
  if(!mission.boss)return Promise.resolve(window.KozaEnemies3D?.ensure(region)).then(Boolean);
  const index=bossIndex(mission);
  return Promise.resolve(window.KozaDeer3D?.ensure(index,region,{hold})).then(async ok=>ok&&window.KozaDeer3D.warm?await window.KozaDeer3D.warm(index,region,low):!!ok).then(ok=>{if(ok&&window.KOZA_PERF&&!window.KOZA_PERF.legacy)window.KozaDeer3D?.prime?.(index,region);return ok;});
 }
 function prepareModels(mission,region,id,state){
  const attempt=modelAttempt(mission,region).catch(error=>{warn('3D preparation',error);return false;});
  attempt.then(ok=>{if(id===serial)state.ready=!!ok;});
  return attempt;
 }
 // Called after the stage starts when the foreground budget ran out.
 function continueModels(mission,region,run){
  const boss=mission.boss,index=bossIndex(mission),live=()=>typeof runMission!=='undefined'&&runMission===run&&['play','paused','choice'].includes(mode);
  if(boss)window.KozaDeer3D?.defer?.(index,region);
  diag('3D background completion',region,mission.number);
  const second=()=>{window.KozaDeer3D?.forgetFailures?.();window.KozaEnemies3D?.forgetFailures?.();return modelAttempt(mission,region,{hold:true});};
  const settle=ok=>{
   if(!ok){if(live())window.KozaAdventure?.notice?.('3D model yüklenemedi',{detail:'Yedek görsellerle devam ediliyor',kind:'info',priority:1,duration:2.6});return;}
   if(!live())return;
   graceUntil=performance.now()+GRACE_MS;
   if(boss)window.KozaDeer3D.release?.(index,region);
   stage('LATE_ASSET_SWAP',{region,stage:mission.number});
  };
  bounded(modelAttempt(mission,region,{hold:true}),90000,'3D model').catch(()=>false)
   .then(ok=>ok||!live()||window.KozaDeer3D?.graphicsUnavailable?.()?ok:bounded(second(),90000,'3D model').catch(()=>false))
   .then(settle);
 }
 // NORMAL_STAGE_COMPLETE -> the next stage is a guardian: start its model and
 // arena while the result screen is open. Pinned so result-screen drawing of the
 // finished stage can never release it; unpinned when that stage is entered.
 function preloadNext(region,number){
  const mission=Expedition.level(region,number);if(!mission?.boss)return;
  const index=bossIndex(mission);preloaded={region,index};stage('BOSS_PRELOAD',{region,stage:number,from:'result'});
  picture(KozaAssets.backgroundFor(region,number),0,60000).catch(()=>{});
  window.KozaDeer3D?.pin?.(index,region);
  modelAttempt(mission,region,{hold:true}).catch(()=>false).then(ok=>diag('boss preload',region,number,ok));
 }
 function unpinPreload(){if(preloaded){window.KozaDeer3D?.pin?.(preloaded.index,preloaded.region,false);preloaded=null;}}
 // The stage must reach play without the menu: if start() bailed out early, reset
 // the stale hero flag and start once more; if that fails, offer Retry.
 function watchStart(start,request){
  clearTimeout(startWatch);
  startWatch=setTimeout(()=>{
   if(['play','paused','choice'].includes(mode)){watchTries=0;return;}if(busy||!screen.hidden)return;
   warn('start watchdog',request,mode,watchTries);window.heroPreparing=false;window.KozaTopdown?.reset?.();
   if(watchTries<1&&retry){watchTries++;prepared=null;retry();return;}watchTries=0;
   const [region,level,challenge]=lastShown;show(region,level,challenge,false);$('loadingText').textContent='Sahne başlatılamadı. Tekrar deneyebilir veya ana menüye dönebilirsin.';$('loadingRetry').hidden=false;$('loadingCancel').hidden=false;
  },8000);
 }
 async function boot(){if(busy)return;busy=true;const id=++serial;retry=boot;const spec=show(profile.region,1,false,true);try{
  const sources=[...Object.values(evolutionSprites),enemySheet,groveSheet,hazardSprite];
  const tasks=sources.map(img=>({weight:1,load:()=>imageReady(img)}));
  tasks.push({weight:1,load:()=>picture('menu-ui-v57.png').catch(()=>{})},{weight:1,load:()=>required('feature-icons-v16.png')},{weight:1,load:()=>loadingPicture(spec,id)},{weight:1,load:()=>required(KozaAssets.homeFor(profile.region))},{weight:2,load:()=>bounded(KozaTopdown.load(profile.active))});
  await run(tasks,id,2800);if(id!==serial)return;await new Promise(requestAnimationFrame);if(id!==serial)return;hide();resize();busy=false;window.kozaReady=true;diag('boot ready');
 }catch(error){if(id===serial){warn('boot failed',error);$('loadingText').textContent='Görseller yüklenemedi. Bağlantını kontrol edip tekrar dene.';$('loadingRetry').hidden=false;}}finally{if(id===serial)busy=false;}}
 async function enter(start){
  if(busy||!window.kozaReady||!['home','result'].includes(mode)){diag('enter ignored',busy?'busy':!window.kozaReady?'not ready':'mode '+mode);return;}
  busy=true;
  const challenge=!!window.kozaStartChallenge;window.kozaStartChallenge=false;
  const plan=typeof resolveRun==='function'?resolveRun(challenge):{region:regionOf(challenge),mission:challenge?KozaAdventure.challengeMission(1):Expedition.mission(profile)};
  const id=++serial,request=key(challenge),region=plan.region,mission=plan.mission,began=performance.now();retry=()=>{window.kozaStartChallenge=challenge;return enter(start);};
  diag('enter',request,mission.boss?'boss':'normal');
  if(mission.boss)stage('BOSS_PRELOAD',{region,stage:mission.number,from:'loading'});
  if(preloaded&&!(mission.boss&&preloaded.region===region&&preloaded.index===bossIndex(mission)))unpinPreload();
  // Keep native fullscreen attached to the original tap, before awaiting assets.
  window.KozaScreen?.enter();for(const dialog of [$('result'),$('sheet')])if(dialog.open)dialog.close();
  lastShown=[region,mission.number,challenge];const spec=show(region,mission.number,challenge,false);const modelState={ready:false};let background=null,visual=null;const visualId=window.KozaCamera?.arenaId?.(region,mission.number,challenge&&!window.KOZA_K01)||null;
  try{const tasks=[
    {weight:1,optional:true,budget:0,name:'loading art',load:()=>loadingPicture(spec,id)},
    {weight:2,name:'background',load:async()=>{background=await arena(region,mission.number);}},
    {weight:2,name:'hero',load:()=>bounded(KozaTopdown.load(profile.active)).catch(()=>{window.KozaTopdown?.reset?.(profile.active);return bounded(KozaTopdown.load(profile.active));})},
    {weight:1,optional:true,budget:0,name:'effects',load:()=>bounded(window.KozaCombatFX?.prepare(region),5000,'Efekt')},
    {weight:5,optional:true,name:'models',budget:mission.boss?(window.KOZA_PERF?.bossModelBudgetMs??4500):undefined,load:()=>window.KOZA_K01?Promise.resolve(false):prepareModels(mission,region,id,modelState)}];
   // v5.15 pilot arena (feature flag). If it cannot load, the stage keeps the v5.14 presentation.
   if(visualId)tasks.push({weight:2,name:'arena v515',load:async()=>{try{await bounded(window.KozaCamera.prepare(visualId),20000,'Arena');visual=visualId;}catch(error){warn('v5.15 arena fallback',visualId,error);}}});
   await run(tasks,id,2400);if(id!==serial)return;
   const models=modelState.ready;
   if(request!==key(challenge)){warn('profile changed while loading',request,key(challenge));throw Error('Profil yükleme sırasında değişti');}
   await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);if(id!==serial)return;
   prepared={key:request,challenge,models,background,mission,visual};busy=false;hide();graceUntil=performance.now()+GRACE_MS;
   window.KozaDiag?.metrics.missions.push({request,ms:Math.round(performance.now()-began),models});
   if(preloaded&&mission.boss)unpinPreload();
   if(mission.boss&&window.KOZA_PERF&&!window.KOZA_PERF.legacy){const bi=bossIndex(mission);if(models)window.KozaDeer3D?.release?.(bi,region);else{window.KozaDeer3D?.defer?.(bi,region);stage('BOSS_FALLBACK_WHOLE_ENCOUNTER',{region,stage:mission.number});}}
   watchStart(start,request);start();
   // Optional 3D still loading: finish it in the background for a safe late swap.
   if(!window.KOZA_K01&&!models&&(!mission.boss||window.KOZA_PERF?.lateSwap!==false)&&!(mission.boss?window.KozaDeer3D?.graphicsUnavailable?.():window.KozaEnemies3D?.graphicsUnavailable?.())&&typeof runMission!=='undefined')continueModels(mission,region,runMission);
  }catch(error){if(id===serial){warn('mission failed',error);$('loadingText').textContent='Sahne yüklenemedi. Tekrar deneyebilir veya ana menüye dönebilirsin.';$('loadingRetry').hidden=false;$('loadingCancel').hidden=false;}}
  finally{if(id===serial)busy=false;}
 }
 // v5.15.1 lifecycle: the start watchdog only guards the gap between "loading finished"
 // and "the run is running". Once the run is running it must disarm, otherwise a player
 // who leaves within 8 s is dragged back into the stage they just left.
 function started(){clearTimeout(startWatch);watchTries=0;}
 // The player deliberately left a run (home / map): drop every pending start so no late
 // callback, watchdog or ticket can reopen gameplay without a new Play action.
 function abandon(){serial++;busy=false;prepared=null;retry=null;clearTimeout(startWatch);watchTries=0;window.heroPreparing=false;unpinPreload();}
 function cancel(){if(!window.kozaReady)return;serial++;busy=false;prepared=null;clearTimeout(startWatch);unpinPreload();window.kozaStartChallenge=false;hide();if(mode==='result')home();else{refresh();resize();$('play').focus({preventScroll:true});}}
 // Retry performs a real reset: a new attempt id, no stale ticket, no stale hero
 // flag, cleared image/model failures and cleared pending model promises.
 function resetForRetry(){
  serial++;busy=false;prepared=null;clearTimeout(startWatch);watchTries=0;attemptTag=Date.now();window.heroPreparing=false;
  window.KozaTopdown?.reset?.();
 }
 $('loadingRetry').onclick=()=>{
  if(busy)return;resetForRetry();
  for(const img of [...Object.values(evolutionSprites),enemySheet,groveSheet,hazardSprite])if(!img.naturalWidth)img.src=img.src.split('?')[0]+'?retry='+attemptTag;
  window.KozaDeer3D?.forgetFailures?.();window.KozaEnemies3D?.forgetFailures?.();
  diag('retry');retry?.();
 };
 $('loadingCancel').onclick=cancel;
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!screen.hidden&&window.kozaReady){e.preventDefault();cancel();}});
 // Q3.1: while the stage BEFORE a guardian is played, fetch that guardian's files into the HTTP cache (network only, low priority;
 // no decode / GPU work). The boss loading screen then finds them locally.
 const prefetched=new Set();
 function prefetchBoss(region,number){try{const mission=Expedition.level(region,number);if(!mission?.boss)return;const index=bossIndex(mission);
  const go=u=>{if(!u||prefetched.has(u))return;prefetched.add(u);fetch(u,{priority:'low'}).then(r=>r.ok?r.arrayBuffer():null).catch(()=>prefetched.delete(u));};
  go(KozaAssets.bossFor(region,index)?.model);go(KozaAssets.backgroundFor(region,number));
  const vid=window.KozaCamera?.arenaId?.(region,number,false);if(vid)fetch(vid+'.json',{priority:'low'}).then(r=>r.ok?r.json():null).then(s=>{if(s)[s.base,s.foreground,s.water,s.fx?.glow?.mask,s.fx?.pulse?.mask,...(s.props||[]).map(p=>p.top?.file)].forEach(go);}).catch(()=>{});
  stage('BOSS_PREFETCH',{region,stage:number});}catch(error){warn('boss prefetch',error);}}
 return {boot,enter,cancel,preloadNext,prefetchBoss,started,abandon,dropPreload:unpinPreload,get busy(){return busy;},
  // A late asset swap or the first frames after loading may hitch; the game loop
  // discards (instead of auto-pausing on) one long frame inside this window.
  inGrace(){return performance.now()<graceUntil;},
  // Returns the one-use start ticket for the mission that was just prepared.
  consumePrepared(){const ticket=prepared;prepared=null;return ticket&&ticket.key===key(ticket.challenge)?ticket:null;},
  // Resolves when no mission or boot loading is running (used by cloud sync).
  idle(){return new Promise(resolve=>{const check=()=>busy||!window.kozaReady?setTimeout(check,200):resolve();check();});}};
})();
// Cloud reconciliation starts after the loader exists so it can wait for idle.
const cloudPreparation=KozaCloud.init();
KozaLoading.boot();
