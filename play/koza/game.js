'use strict';
// KOZA 516.5 Q3: frame-step policy. A rendering hitch must never fast-forward the hero: each rendered frame simulates at most
// 5 x 1/60 s (83 ms). A longer frame drops the rest (the world is briefly slower instead of jumping). Only a very long stall
// (>1.5 s, e.g. the OS froze the tab) opens the pause menu. Hitches are counted for diagnostics (KOZA_Q3.hitches).
const KOZA_Q3=window.KOZA_Q3={version:'516.6-q31',maxSim:5/60,maxSteps:5,pauseAfter:1.5,hitches:[],dropped:0,noteHitch(raw,sim){this.dropped+=raw-sim;this.hitches.push({at:+performance.now().toFixed(0),rawMs:Math.round(raw*1000),simMs:Math.round(sim*1000)});if(this.hitches.length>40)this.hitches.shift();window.KozaDiag?.log?.('frame','hitch '+Math.round(raw*1000)+'ms -> simulated '+Math.round(sim*1000)+'ms');}};
let fieldTop=82;
const $=id=>document.getElementById(id), KEY='koza-v1';
const Progress=window.KozaProgress,preferences=window.KozaSettings.state,Expedition=window.KozaExpedition;
function load(){return KozaSaveStore.load(Progress.normalize);}
let profile=load(),saveOK=true,muted=!preferences.master;
function updateSaveNote(){const recovery=KozaSaveStore.recovery;$('saveNote').dataset.warning=String(!saveOK||recovery!=='none'||!KozaSaveStore.backupOK);$('saveNote').textContent=recovery==='unavailable'?'Kayıt okunamadı; eski veri korundu. Ayarlardan yedek yükleyebilir veya bulut kaydını kontrol edebilirsin.':!saveOK?'Bu tarayıcı ilerlemeni kaydedemiyor. Sayfayı kapatma; ayarlardan yedek indir.':recovery==='backup'?'Son sağlam cihaz yedeği yüklendi. Son değişikliklerin eksik olabilir.':!KozaSaveStore.backupOK?'İlerlemen kaydedildi; ek cihaz yedeği oluşturulamadı. Ayarlardan yedek indir.':'İlerlemen bu tarayıcıda saklanır · v5.13';}
function save(){saveOK=KozaSaveStore.write(profile);if(KozaSaveStore.canSync)window.KozaCloud?.queue(profile);updateSaveNote();}
function petState(){return Progress.stage(profile.pets[profile.active].points);}
const walletNumber=new Intl.NumberFormat('tr-TR',{notation:'compact',maximumFractionDigits:1});
function updateWallet(){for(const [node,chip,value,label] of [['balance','lightWallet',profile.coins,'ışık'],['essenceBalance','essenceWallet',profile.essence,'öz']]){const exact=value.toLocaleString('tr-TR');$(node).textContent=value>=10000?walletNumber.format(value):exact;$(chip).setAttribute('aria-label',exact+' '+label);$(chip).title=exact+' '+label;}}
function refresh(){const l=petState(),pet=profile.pets[profile.active],def=Progress.catalog[profile.active];updateWallet();$('rename').replaceChildren(document.createTextNode(pet.name+' '));const pen=document.createElement('span');pen.textContent='✎';$('rename').append(pen);$('level').textContent='Form '+(l.star+1);if($('formName'))$('formName').textContent=def.forms[l.star]+' · '+def.kind;if($('formStars')){$('formStars').textContent='★'.repeat(l.star)+'☆'.repeat(3-l.star);$('formStars').setAttribute('aria-label',l.star+' / 3 yıldız');}$('xpText').textContent=l.star===3?'Tamamlandı':l.progress+' / '+l.required+' öz';$('xpBar').style.width=(l.star===3?100:l.progress/l.required*100)+'%';$('growthText').textContent=l.star===3?'Son form · bütün biçimler açık':'Sonraki: Form '+(l.star+2)+' · '+def.forms[l.star+1];$('best').textContent=profile.best||'—';$('runs').textContent=profile.runs;$('nextGift').textContent=l.star===3?'3 yıldız tamamlandı':def.forms[l.star+1];$('stageNote').textContent=def.forms[l.star]+' · '+def.kind;refreshJourney();if($('challengeOpen')){$('challengeOpen').disabled=!KozaAdventure.challengeOpen();$('challengeLabel').textContent=KozaAdventure.challengeOpen()?'Meydan okuma · Rekor '+profile.challenge.best+' dalga':'Meydan okuma · 40 bölüm sonrası';}}
const canvas=$('canvas'),ctx=canvas.getContext('2d'),evolutionSprites={};for(const [id,def] of Object.entries(Progress.catalog)){const img=new Image();img.src=def.file;evolutionSprites[id]=img;}
const groveSheet=new Image();groveSheet.src='grove-bosses-v31.png';const enemySheet=new Image();enemySheet.src='enemy-species-v11.png';const hazardSprite=new Image();hazardSprite.src='thorn-soft-v10.png';
// Drawing sizes only. Movement bounds, hitboxes and boss framing remain independent.
const COMBAT_VISUAL_SIZE=Object.freeze({hero:KozaHitbox.VISUAL.hero,enemy:KozaHitbox.VISUAL.enemyScale});
let runRegion='garden',runMission=Expedition.level('garden',1),maxCombo=0,orbClock=0,missionAwarded=false,tutorialMoved=false,orbIndex=0,hazardSerial=0;
let W=400,H=400,dpr=1,mode='home',time=45,score=0,lives=3,combo=0,comboAge=0,hitCD=0,elapsed=0,spawnClock=0,player={x:200,y:250},target=null,keys={},particles=[],orbs=[],hazards=[],projectiles=[],last=0,clock=0,settled=false,toastUntil=0,impact=0,motion=KozaTopdownMotion.create();
const motionQuery=matchMedia('(prefers-reduced-motion: reduce)');let reduced=preferences.motion==='reduced'||(preferences.motion==='system'&&motionQuery.matches);motionQuery.addEventListener?.('change',()=>applyPreferences());
// v5.15 shared camera: when a pilot arena is active, gameplay space (W,H) is the
// camera's playable floor and the canvas keeps the full element; the base
// transform offsets gameplay to the floor. Otherwise unchanged (v5.14).
let camForce=false,camTop=-1;
const camOn=()=>!!window.KozaCamera?.active?.();
function hudFieldTop(height){const hud=$('missionHud'),bottom=(hud?.offsetTop||0)+(hud?.offsetHeight||0);return Math.min(Math.max(82,bottom+6),Math.max(60,height*.35));}
function camOffset(){const L=camOn()?KozaCamera.layout:null;return L?{x:L.ox,y:L.oy}:{x:0,y:0};}
// v5.16: ONE world transform for everything drawn in field px. With the wide camera on, layout.ox/oy pan each frame.
function applyWorldTransform(){const L=camOn()?KozaCamera.layout:null;ctx.setTransform(dpr,0,0,dpr,L?dpr*L.ox:0,L?dpr*L.oy:0);}
function screenSpace(){ctx.setTransform(dpr,0,0,dpr,0,0);}
const heroScreenY=()=>camOffset().y+player.y;
const wideOn=()=>camOn()&&!!KozaCamera.isWide?.();
function heroVisual(){return camOn()?KozaCamera.silhouette('hero'):COMBAT_VISUAL_SIZE.hero;}
function enemyVisual(kind){return camOn()?KozaCamera.silhouette(kind):KozaHitbox.enemySize(kind);}
function resize(){const width=$('arena').clientWidth,height=$('arena').clientHeight;if(width<=0||height<=0)return;const nextDpr=Math.min(devicePixelRatio||1,preferences.quality==='low'?1:1.5,Math.sqrt(1200000/(width*height)));
 let fieldW=width,fieldH=height,L=null;
 if(camOn()){placeMissionHud();camTop=hudFieldTop(height);const dock=$('abilityDock'),dockTop=dock&&dock.offsetHeight?dock.offsetTop:height;L=KozaCamera.place(width,height,camTop,Math.min(height-12,dockTop-6));fieldW=L.floorW;fieldH=L.floorH;}
 if(!camForce&&fieldW===W&&fieldH===H&&Math.abs(nextDpr-dpr)<.01&&canvas.width===Math.round(width*nextDpr)&&canvas.height===Math.round(height*nextDpr)){syncFieldBoundary();return;}camForce=false;
 const oldW=W,oldH=H;W=fieldW;H=fieldH;dpr=nextDpr;if(!window.KOZA_PERF||window.KOZA_PERF.legacy){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}else{const cw=Math.round(width*dpr),ch=Math.round(height*dpr);if(canvas.width!==cw)canvas.width=cw;if(canvas.height!==ch)canvas.height=ch;} /* Q3.1: same size -> no backing-store reallocation */ctx.setTransform(dpr,0,0,dpr,L?dpr*L.ox:0,L?dpr*L.oy:0);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='medium';const sx=W/oldW,sy=H/oldH;function move(o){if(!o)return;o.x*=sx;o.y*=sy;if(Number.isFinite(o.ex)){o.ex*=sx;o.ey*=sy;}if(Number.isFinite(o.w))o.w*=sx;}move(player);orbs.forEach(move);hazards.forEach(move);projectiles.forEach(move);const b=window.KozaAdventure?.state.boss;if(b){move(b);if(b.index===3)KozaDragonCombat.resize(b,sx,sy);else{move(b.origin);move(b.destination);b.zones.forEach(move);}b.echoes.forEach(move);b.previousY=b.y;KozaBossPatterns.resize(b,W,H,fieldTop);window.KozaDeer3D?.invalidate();}syncFieldBoundary();if(mode!=='home')constrainHero();if(wideOn()&&mode!=='home')KozaCamera.snap(player);applyWorldTransform();target=null;}
new ResizeObserver(()=>{if(window.KozaScreen?.fit)KozaScreen.fit();else resize();}).observe($('arena'));

function tone(freq=600,duration=.09){if(!muted)window.KozaAudio.effect(freq,duration);}
function sfx(name,opts){if(!muted)window.KozaAudio.cue?.(name,opts);} // QUALITY q1: named cues (audio.js)
function soundState(){$('sound').style.color=muted?'':'#9cf0cd';$('sound').setAttribute('aria-label',muted?'Müzik ve sesleri aç':'Müzik ve sesleri kapat');$('sound').setAttribute('aria-pressed',String(!muted));$('sound').title=muted?'Müzik ve sesleri aç':'Müzik ve sesleri kapat';}
$('sound').onclick=()=>{window.KozaSettings.update({master:!preferences.master});muted=!preferences.master;window.KozaAudio.setEnabled(!muted);if(mode==='paused')window.KozaAudio.stop();soundState();tone();};soundState();window.KozaAudio.setVolumes(preferences.music,preferences.effects);window.KozaAudio.setEnabled(preferences.master);
function randomOrb(){{const v2=window.KozaScaleV2?.orb?.();if(v2)return v2;} /* SCALE TEST V2: combat-bubble light spawn */const i=orbIndex++,m=runMission,margin=Math.min(heroMargin(),W*.25,H*.2),top=Math.min(fieldTop+margin,H-margin),bottom=Math.max(top,H-Math.max(margin,96)),height=bottom-top;let x,y;
 if(m.layout==='trail'){const columns=[.2,.4,.6,.8,.8,.6,.4,.2];x=W*columns[i%8];y=top+height*(.2+.55*(Math.floor(i/8)%2));}
 else if(m.layout==='ring'){const a=i*Math.PI/4;x=W/2+Math.cos(a)*(W*.3);y=top+height*.5+Math.sin(a)*height*.34;}
 else if(m.layout==='clusters'){const center=Math.floor(i/4)%3; x=W*[.25,.75,.5][center]+Math.cos(i*2)*24;y=top+height*[.24,.55,.8][center]+Math.sin(i*2)*24;}
 else{x=30+Math.random()*(W-60);y=top+Math.random()*height;}
 const o={x:Math.max(margin,Math.min(W-margin,x)),y:Math.max(top,Math.min(bottom,y)),r:6+Math.random()*2,phase:Math.random()*6,born:elapsed};
 // v5.15: collectible light always lies on the playable floor (authored patterns kept, then confined).
 if(camOn()){if(!['trail','ring','clusters'].includes(m.layout)){const p=(wideOn()?KozaCamera.randomInView:KozaCamera.randomInside)(Math.random,26);if(p){o.x=p.x;o.y=p.y;}}KozaCamera.confine(o,22);}
 return o;}
// One resolver for loading and play, so both always prepare the same encounter.
function resolveRun(challenge=false){if(challenge)return {region:'grove',mission:KozaAdventure.challengeMission(1)};const region=Expedition.unlocked(profile,profile.region)?profile.region:'garden';if(!Expedition.available(profile,region,profile.campaign.selected[region]))profile.campaign.selected[region]=Expedition.next(profile,region);return {region,mission:Expedition.level(region,profile.campaign.selected[region])};}
function begin(){if(window.kozaReady===false)return;const epoch=startEpoch,current=()=>epoch===startEpoch;let challenge=!!window.kozaStartChallenge,ticket=null;if(window.KozaLoading){ticket=KozaLoading.consumePrepared();if(!ticket){KozaLoading.enter(()=>{if(current())begin();});return;}challenge=ticket.challenge;}
window.KozaScreen?.enter();if(window.KozaTopdown?.has&&!KozaTopdown.has(profile.active)){if(window.heroPreparing)return;window.heroPreparing=true;const hero=profile.active;noticeHeroLoading();KozaTopdown.load(hero).then(()=>{window.heroPreparing=false;if(current()&&profile.active===hero)begin();}).catch(()=>{window.heroPreparing=false;$('playLabel').textContent='Tekrar dene';});return;}if(mode==='play'||mode==='paused'||mode==='choice')return;[$('result'),$('sheet')].forEach(d=>{if(d.open)d.close();});mode='play';window.KozaLoading?.started?.();window.KozaAudio.setMode('play');window.KozaAudio.start();release();window.KozaCamera?.use?.(ticket?.visual||null);runRegion=resolveRun(false).region;KozaAdventure.reset(challenge);window.kozaStartChallenge=false;runMission=KozaAdventure.state.challenge?KozaAdventure.challengeMission(1):Expedition.mission(profile);if(KozaAdventure.state.challenge)runRegion=window.KOZA_K01?'garden':'grove';if(runMission.boss)window.KozaDiag?.stage?.('BOSS_SCENE_INIT',{region:runRegion,stage:runMission.number,model3d:!!ticket?.models});if(!runMission.boss&&!KozaAdventure.state.challenge&&(runMission.number+1)%5===0&&window.KOZA_PERF&&!window.KOZA_PERF.legacy){const r=runRegion,n=runMission.number+1;setTimeout(()=>window.KozaLoading?.prefetchBoss?.(r,n),4000);}readyPending=true;window.KozaAssets?.applyBackground(runRegion,runMission.number);
 if(ticket?.background?.fallback){const run=runMission,region=runRegion;window.KozaAssets?.applyBackground(region,1);ticket.background.late?.then(()=>{if(runMission===run&&(!run.boss||window.KOZA_PERF?.lateSwap!==false)&&['play','paused','choice'].includes(mode))window.KozaAssets?.applyBackground(region,run.number);}).catch(()=>{});}if(!runMission.boss&&!window.KozaLoading)window.KozaEnemies3D?.ensure(runRegion).catch(()=>{});window.KozaCloud?.event('run_start',{hero:profile.active,region:runRegion,level:runMission.number,challenge:KozaAdventure.state.challenge});orbIndex=0;hazardSerial=0;maxCombo=0;orbClock=0;missionAwarded=false;toastUntil=0;$('toast').classList.remove('visible');$('missionHud').classList.remove('goal-pulse');delete $('missionHud').dataset.content;tutorialMoved=false;settled=false;time=runMission.duration;elapsed=0;score=0;lives=3;hudCache.lives=null;hudCache.heartsKey=null;combo=0;comboAge=0;hitCD=0;impact=0;motion=KozaTopdownMotion.create();spawnClock=0;hazards=[];projectiles=[];particles=[];target=null;keys={};$('app').classList.add('playing');document.body.classList.add('game-screen');$('hud').hidden=false;$('hint').hidden=!preferences.hints;$('habitatLabel').hidden=true;$('stageNote').hidden=true;$('missionHud').hidden=false;$('windHud').hidden=false;$('app').classList.toggle('grove',runRegion==='grove');document.body.classList.toggle('grove-scene',runRegion==='grove');resize();player={x:W/2,y:H*.6};{const st=camOn()?KozaCamera.arena?.spec?.start?.player:null;if(st){const f=KozaCamera.toField(st[0],st[1]);player.x=f.x;player.y=f.y;}}if(camOn())KozaCamera.confine(player,KozaCamera.heroRadius?KozaCamera.heroRadius(KozaHitbox.heroBody()*1.15):KozaHitbox.heroBody()*1.15);if(wideOn())KozaCamera.snap(player);window.KozaScaleV2?.tune?.(runMission); /* MAP 1 SCALE ROLLOUT: encounter density for the scaled arenas */orbs=runMission.boss?[]:Array.from({length:window.KozaScaleV2?.orbPace?.()?.cap||8},randomOrb);updateHUD();updateTutorial();canvas.focus({preventScroll:true});sfx('start');window.KozaEntrance?.start(runMission,reduced);}
const hudCache={};let hudKey='';
function updateHUD(){
 const boss=KozaAdventure.state.boss,nextKey=[Math.ceil(time),time>0&&time<=5,score,lives,combo,maxCombo,runMission.number,runRegion,KozaAdventure.state.bossPhase,!!KozaAdventure.state.bossEnding,KozaAdventure.state.bossDone,KozaRunFlow.bossCue(boss,orbs),KozaAdventure.state.bossIntro>0,KozaAdventure.state.shield>0,KozaAdventure.state.ward,KozaAdventure.state.wardRecharge>0].join('|');
 if(nextKey===hudKey&&$('missionHud').dataset.content!==undefined)return;hudKey=nextKey;
 updateMissionHUD();
 const seconds=Math.ceil(time),urgent=time>0&&time<=5,label=runMission.boss?'ALTIN IŞIK':'PARILTI',comboHidden=combo<2||!!runMission.boss;
 if(hudCache.seconds!==seconds){hudCache.seconds=seconds;$('timer').textContent=seconds;}
 if(hudCache.urgent!==urgent){hudCache.urgent=urgent;$('timer').dataset.urgent=String(urgent);}
 if(hudCache.score!==score){hudCache.score=score;$('score').textContent=score;}{const goal=runMission.boss||runMission.id==='chain'||!runMission.target?'':'/'+runMission.target,kind=runMission.boss?'boss':'normal';if(hudCache.goal!==goal){hudCache.goal=goal;if($('scoreGoal'))$('scoreGoal').textContent=goal;}if(hudCache.run!==kind){hudCache.run=kind;$('hud').dataset.run=kind;$('app').dataset.run=kind;}}
 if(hudCache.label!==label){hudCache.label=label;if($('scoreLabel'))$('scoreLabel').textContent=label;}
 { // Q2 hearts: real lives only. The heart that was just lost / refilled gets one short reaction; the last heart warns once.
  // A shield is its own mark after the hearts (never an extra heart): ready (ward) / active (Pera) / recharging.
  const A=KozaAdventure.state,shieldState=A.shield>0?'active':A.ward?'ready':KozaAdventure.hasPower('shield')&&A.wardRecharge>0?'recharge':'',key=lives+'|'+shieldState;
  if(hudCache.heartsKey!==key){const prev=hudCache.lives;hudCache.heartsKey=key;hudCache.lives=lives;
   const heart=i=>'<svg class="life-heart '+(i<lives?'full':'empty')+(prev!=null&&prev>lives&&i>=lives&&i<prev?' just-lost':'')+(prev!=null&&prev<lives&&i<lives&&i>=prev?' just-healed':'')+(lives===1&&i===0?' critical':'')+'" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5S3 15 3 8.8C3 5.4 5.4 3.5 8 3.5c1.8 0 3.2 1 4 2.4.8-1.4 2.2-2.4 4-2.4 2.6 0 5 1.9 5 5.3 0 6.2-9 11.7-9 11.7Z"/></svg>';
   $('hearts').innerHTML=Array.from({length:3},(_,i)=>heart(i)).join('')+(shieldState?'<svg class="heart-shield '+shieldState+'" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8 19.5 5.6v5.9c0 4.6-3.1 8.2-7.5 9.7-4.4-1.5-7.5-5.1-7.5-9.7V5.6Z"/></svg>':'');
   $('hearts').dataset.lives=lives;$('hearts').setAttribute('aria-label',lives+' can'+(shieldState==='active'?' · kalkan etkin':shieldState==='ready'?' · zırh hazır':shieldState==='recharge'?' · zırh yenileniyor':''));}}
 if(hudCache.comboHidden!==comboHidden){hudCache.comboHidden=comboHidden;$('combo').hidden=comboHidden;}
 if(hudCache.combo!==combo){hudCache.combo=combo;$('combo').innerHTML=combo>=2?'<span>'+combo+' seri</span><i class="combo-track"><i id="comboMeter"></i></i>':'';}
}
function finish(survived=false){if(settled||!['play','paused'].includes(mode))return;if(KozaAdventure.state.challenge&&survived&&KozaAdventure.endChallenge())return;window.KozaEntrance?.cancel();$('resumeCue').hidden=true;settled=true;mode='result';window.KozaAudio.setMode('home');window.KozaAudio.start();target=null;
 const wasUnlocked=Expedition.unlocked(profile,'grove'),earnings=KozaAdventure.state.challenge?{won:false,stars:0,first:false,base:Math.floor(score/3),bonus:0,total:Math.floor(score/3),essence:0}:Expedition.settle(profile,runRegion,runMission,{score,maxCombo,survived:survived&&(runMission.number%5!==0||KozaAdventure.state.bossDone),lives,bossDone:KozaAdventure.state.bossDone});if(earnings.won&&KozaAdventure.hasPower('bloom'))earnings.essence+=2;profile.coins+=earnings.total;profile.essence+=earnings.essence;if(KozaAdventure.state.challenge)profile.challenge.runs++;window.KozaCloud?.event('run_finish',{hero:profile.active,level:runMission.number,region:runRegion,challenge:KozaAdventure.state.challenge,won:earnings.won,score,lives,seconds:Math.round(KozaAdventure.state.realSeconds)});profile.xp+=score+(earnings.won?20:0);profile.runs++;profile.best=Math.max(profile.best,score);
 const personal=KozaAdventure.state.challenge?null:KozaDepth.record(profile,runRegion,runMission.number,{won:earnings.won,score,combo:maxCombo,hits:KozaAdventure.state.hits});
 if(earnings.won)profile.campaign.selected[runRegion]=Math.min(20,runMission.number+1);save();refresh();
 if(earnings.won&&!runMission.boss&&!KozaAdventure.state.challenge){window.KozaDiag?.stage?.('NORMAL_STAGE_COMPLETE',{region:runRegion,stage:runMission.number});if((runMission.number+1)%5===0)window.KozaLoading?.preloadNext?.(runRegion,runMission.number+1);}
 $('resultTag').textContent=Expedition.regions[runRegion].name+' · Bölüm '+runMission.number;$('resultTitle').textContent=KozaAdventure.state.challenge?'Meydan okuma tamamlandı · '+(KozaAdventure.state.wave-1)+' dalga':earnings.won?(runMission.number===20?'Bölge tamamlandı!':'Bölüm tamamlandı!'):'Bir daha deneyelim.';
 $('chapterMedals').hidden=KozaAdventure.state.challenge;$('chapterMedals').textContent=earnings.won?'★'.repeat(earnings.stars)+'☆'.repeat(3-earnings.stars):'☆☆☆';$('chapterMedals').setAttribute('aria-label',earnings.stars+' bölüm yıldızı');
 $('resultBreakdown').open=false;$('flawlessBadge').hidden=!personal?.flawless;$('essenceRewardCount').textContent=earnings.essence+(KozaAdventure.state.challenge?KozaAdventure.state.challengeEssence:0);$('resultSummary').textContent=KozaAdventure.state.challenge?'Dalga ödüllerin biriktikçe kaydedildi.':earnings.won?earnings.stars+' kalple tamamladın · '+earnings.stars+' yıldız':KozaRunFlow.resultTip(runMission,KozaAdventure.state,{score,maxCombo,lives});
 if(KozaAdventure.state.challenge)$('resultTag').textContent='Meydan okuma · Rekor '+profile.challenge.best+' dalga';$('rewardCount').textContent=earnings.total+(KozaAdventure.state.challenge?KozaAdventure.state.challengeLight:0);$('resultDetails').textContent=score+(runMission.boss?' altın ışık → ':' parıltı → ')+earnings.base+' ışık · '+(earnings.first?'İlk tamamlama':earnings.won?'Tekrar tamamlama':'Bölüm')+' ödülü: +'+earnings.bonus+' ışık · +'+earnings.essence+' öz. '+(earnings.won?'Yıldızlar: kalan can sayın kadar.':(runMission.number%5===0&&!KozaAdventure.state.bossDone&&!KozaAdventure.state.challenge?'Süre dolmadan koruyucuyu yenmelisin.':'Sonraki bölüm için hedefi karşılayıp süreyi tamamla.'));
 $('personalResult').hidden=!personal;if(personal){const r=personal.current,prev=personal.previous;$('personalResult').textContent=(personal.flawless?'♥ Hasarsız tamamlandı · ':'')+(personal.newScore?'Yeni puan rekoru! · ':'')+(personal.newCombo?'Yeni seri rekoru! · ':'')+'Bu tur: '+score+' puan / '+maxCombo+' seri. '+(prev.clears?'Önceki rekor: '+prev.bestScore+' puan / '+prev.bestCombo+' seri. ':'')+'En iyi: '+r.bestScore+' puan / '+r.bestCombo+' seri · '+r.flawless+' hasarsız bitiriş';}
 $('levelUp').hidden=wasUnlocked||!Expedition.unlocked(profile,'grove');$('levelUp').textContent='Yeni bölge açıldı: Rüzgâr Korusu · 20 yeni bölüm!';
 $('again').className=earnings.won?'text-button':'primary';if(KozaAdventure.state.challenge)$('resultDetails').textContent='Tamamladığın dalgaların ışık ve öz ödülleri kaydedildi. Son dalga: '+earnings.total+' ışık. Rekorun '+profile.challenge.best+' dalga.';$('nextChapter').hidden=!earnings.won||(runRegion==='grove'&&runMission.number===20);$('nextChapter').textContent=runMission.number===20?'Rüzgâr Korusu’na geç':'Sonraki bölüm →';
 if($('paused').open)$('paused').close();$('feedbackSend').disabled=false;$('feedbackStatus').textContent='';{const st=KozaAdventure.state,run=[];if(runMission.boss){const sp=KozaBossPatterns.spec(runMission.number,runRegion);run.push('✦ '+score+' altın ışık',st.bossDone?'Koruyucu sakinleşti':'Süre dolmadı');}else run.push('✦ '+score+' parıltı'+(runMission.target&&runMission.id!=='chain'?' / '+runMission.target:''),'Seri '+maxCombo);if(!st.challenge)run.push('♥ '+Math.max(0,lives)+' can');if(st.picks.length)run.push(st.picks.map(k=>KozaAdventure.powers[k].name).join(' + '));
 $('resultRun').innerHTML=run.map(t=>'<span>'+t+'</span>').join('');$('resultTotals').textContent='Kalıcı toplam: '+profile.coins.toLocaleString('tr-TR')+' ışık · '+profile.essence.toLocaleString('tr-TR')+' öz';}
 $('result').dataset.outcome=earnings.won?'win':'lose';$('result').showModal();sfx(earnings.won?'victory':'defeat');countUpRewards(earnings.won);
}
// Q2: the rewards are ALREADY committed above (profile + save). This only animates the two numbers (UI time, ~0.7 s);
// buttons work immediately, closing the dialog mid-count changes nothing, and the final text is the committed value.
let rewardAnim=0;function countUpRewards(won){const els=['rewardCount','essenceRewardCount'].map($).filter(Boolean),finals=els.map(e=>Number(e.textContent)||0);const token=++rewardAnim;if(!won||reduced||!finals.some(v=>v>0))return;const t0=performance.now(),dur=700;els.forEach(e=>{e.dataset.final=e.textContent;e.textContent='0';});const tick=now=>{if(token!==rewardAnim||!$('result').open){els.forEach((e,i)=>e.textContent=String(finals[i]));return;}const u=Math.min(1,(now-t0)/dur),k=1-Math.pow(1-u,3);els.forEach((e,i)=>e.textContent=String(Math.round(finals[i]*k)));if(u<1)setTimeout(()=>tick(performance.now()),16);};setTimeout(()=>tick(performance.now()),16);}
// v5.15.1: every start intent carries the epoch it was made in. Leaving a run bumps the
// epoch, so an async callback from the abandoned start can no longer open gameplay.
let startEpoch=0;
function home(){startEpoch++;window.KozaAdventure?.hideSnapshot?.();window.KozaLoading?.abandon?.();window.KozaCamera?.deactivate?.();for(const id of ['paused','powerChoice'])if($(id).open)$(id).close();$('resumeCue').hidden=true;document.body.classList.remove('game-screen');window.KozaEntrance?.cancel();if($('result').open)$('result').close();mode='home';window.KozaAudio.setMode('home');$('app').classList.remove('playing');$('hud').hidden=true;$('hint').hidden=true;$('habitatLabel').hidden=false;$('stageNote').hidden=false;$('missionHud').hidden=true;$('windHud').hidden=true;refresh();resize();}
function pause(){if(mode!=='play')return;mode='paused';window.KozaAudio.stop();release();keys={};$('paused').showModal();}
function resume(){if(mode!=='paused')return;$('paused').close();mode='play';if(!window.KozaEntrance?.active){KozaAdventure.state.ready=.8;$('resumeCue').hidden=false;KozaAdventure.paint();}window.KozaAudio.setMode('play');window.KozaAudio.start();last=performance.now();}
$('play').onclick=begin;$('again').onclick=()=>{if(KozaAdventure.state.challenge){window.kozaStartChallenge=true;begin();return;}profile.region=runRegion;profile.campaign.selected[runRegion]=runMission.number;save();begin();};$('backHome').onclick=home;$('pause').onclick=pause;$('resume').onclick=resume;$('endRun').onclick=()=>finish(false);
$('paused').addEventListener('cancel',e=>{e.preventDefault();resume();});$('result').addEventListener('cancel',e=>{e.preventDefault();home();});
let pauseOnReturn=false; // QUALITY q1: backgrounded while a run is still loading -> the run opens paused when the player returns
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(mode!=='play'&&mode!=='paused'&&mode!=='home')pauseOnReturn=true;else if(mode==='home'&&window.KozaLoading?.busy)pauseOnReturn=true;pause();window.KozaAudio.stop();}else{if(pauseOnReturn&&mode==='play')pause();pauseOnReturn=false;if(mode!=='paused'&&window.KozaAudio.started)window.KozaAudio.start();}});
window.addEventListener('blur',()=>{if(!window.KozaScreen?.transitioning)pause();});
let pointerId=null;
canvas.addEventListener('pointerdown',e=>{if(mode!=='play'||window.KozaEntrance?.active||pointerId!==null)return;pointerId=e.pointerId;canvas.setPointerCapture(e.pointerId);const r=canvas.getBoundingClientRect();target=KozaRunFlow.stickStart(e.clientX-r.left,e.clientY-r.top);});
canvas.addEventListener('pointermove',e=>{if(!target||e.pointerId!==pointerId)return;const r=canvas.getBoundingClientRect();KozaRunFlow.stickMove(target,e.clientX-r.left,e.clientY-r.top,preferences.sensitivity);});
function release(e){if(e&&e.pointerId!==pointerId)return;const id=pointerId;target=null;pointerId=null;if(id!==null&&canvas.hasPointerCapture?.(id))canvas.releasePointerCapture(id);}canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
document.addEventListener('keydown',e=>{if(mode!=='play')return;const key=e.key.length===1?e.key.toLowerCase():e.key;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(key)){e.preventDefault();keys[key]=true;}if(e.code==='Space'&&!KozaAdventure.auto){e.preventDefault();if(!e.repeat)KozaAdventure.ability();}if(e.key==='Escape')pause();});document.addEventListener('keyup',e=>{keys[e.key.length===1?e.key.toLowerCase():e.key]=false;});
function sheet(html){$('sheetContent').innerHTML=html;window.KozaSymbols?.hydrate?.($('sheetContent'));$('sheet').showModal();}
$('rename').onclick=()=>{sheet('<span class="eyebrow">SANA AİT BİR İSİM</span><h2>Dostunun adı</h2><label for="petName">En fazla 18 karakter</label><input id="petName" class="rename-input" maxlength="18" autocomplete="off"><button id="saveName" class="primary">İsmi kaydet <span>✓</span></button>');$('petName').value=profile.pets[profile.active].name;$('saveName').onclick=()=>{const n=$('petName').value.trim();if(!n){$('petName').focus();return;}profile.pets[profile.active].name=n.slice(0,18);save();refresh();$('sheet').close();};};
function portrait(id,star,extra=''){const atlas=window.KozaSpriteAtlas[id],r=atlas.rects[star],scale=88/Math.max(r[2],r[3]),w=r[2]*scale,h=r[3]*scale;return '<div class="portrait '+extra+'"><div class="portrait-crop" style="width:'+w+'%;height:'+h+'%;left:'+(100-w)/2+'%;top:'+(100-h)/2+'%"><img src="'+Progress.catalog[id].file+'" style="width:'+atlas.width/r[2]*100+'%;height:'+atlas.height/r[3]*100+'%;left:'+(-r[0]/r[2]*100)+'%;top:'+(-r[1]/r[3]*100)+'%" alt="'+Progress.catalog[id].forms[star]+'"></div></div>';}

function showCollection(){sheet('<span class="eyebrow">HER DOSTUN AYRI BİR YOLU VAR</span><h2>Dostlarım</h2><p>Yeni dostlar 0 yıldızla gelir. Gelişimleri ayrı saklanır.</p><div class="roster">'+Object.entries(Progress.catalog).map(([id,d])=>{const owned=!!profile.pets[id],star=owned?Progress.stage(profile.pets[id].points).star:0;return '<article class="creature-card '+(profile.active===id?'active':'')+'">'+portrait(id,star)+'<div><h3>'+d.name+'</h3><span class="creature-kind">'+d.kind+' · '+star+' ★</span><p>'+d.description+'</p><button class="roster-button" data-character="'+id+'" '+((!owned&&profile.coins<d.price)||profile.active===id?'disabled':'')+'>'+(profile.active===id?'Seçili':owned?'Birlikte keşfet':'◆ '+d.price+' ışık · Al')+'</button></div></article>';}).join('')+'</div><p class="collection-foot">Bakiye: ◆ '+profile.coins+' · Yalnızca oyun içi ışık kullanılır.</p>');document.querySelectorAll('[data-character]').forEach(b=>b.onclick=()=>{if(mode!=='home')return;const id=b.dataset.character;const purchased=!profile.pets[id],ok=purchased?Progress.buy(profile,id):Progress.select(profile,id);if(ok){save();refresh();$('sheet').close();showCollection();sfx(purchased?'buy':'ui',{f:700});if(purchased)celebrate('buy',id,0,0);}});}
$('appearance').onclick=showCollection;
function showUpgrade(){const id=profile.active,d=Progress.catalog[id],l=petState(),cost=Math.min(6,l.remaining,profile.essence);sheet('<div class="upgrade-heading"><span class="feature-icon i-essence" aria-hidden="true"></span><div><span class="eyebrow">ÖZ VER · YILDIZ KAZAN · DÖNÜŞ</span><h2>'+d.name+' gelişimi</h2></div></div><div class="evolution-strip">'+d.forms.map((name,i)=>'<div class="evolution-form '+(i===l.star?'current':'')+'">'+portrait(id,i)+'<b>'+i+' ★</b><span>'+name+'</span></div>').join('')+'</div><p>Her yıldız yeni bir biçim açar. Yıldız başına gereken öz: <b>12 → 30 → 60</b>.</p><div class="feeding-progress"><b>'+(l.star===3?'Son biçim':l.progress+' / '+l.required+' öz')+'</b><span>'+(l.star===3?'3 ★':(l.star+1)+' ★ için')+'</span></div><div class="track"><i style="width:'+(l.star===3?100:l.progress/l.required*100)+'%"></i></div><p>'+d.description+'<br><small>Öz: ✦ '+profile.essence+'</small></p><div class="levelup" id="evolutionNotice" hidden></div><button id="feed" class="primary" '+(!cost?'disabled':'')+'>'+(l.star===3?'Tüm biçimler açıldı':!cost?'Bölümlerden öz kazan':'Özle geliştir')+'<span>'+(cost?'✦ '+cost:l.star===3?'★★★':'0 öz')+'</span></button><p class="collection-foot">Bu sürümde her dost için 0–3 yıldız ve dört farklı biçim bulunur.</p>');addMasteryControls();$('feed').onclick=()=>{if(mode!=='home')return;const result=Progress.feed(profile);if(!result)return;save();refresh();$('sheet').close();showUpgrade();if(result.after>result.before){$('evolutionNotice').hidden=false;$('evolutionNotice').textContent='Yeni biçim açıldı: '+d.forms[result.after]+' · '+result.after+' ★';burst(W/2,H*.52,'#f5df9b',35);}else sfx('feed'); /* Q2: one owner per event - celebrate() owns the evolve cue */celebrate(result.after>result.before?'evolve':'feed',id,result.before,result.after,result.cost);};}
$('upgradeOpen').onclick=showUpgrade;
function burst(x,y,color,count=10){if(reduced)return;if(preferences.quality==='low')count=Math.min(count,4);count=Math.min(count,Math.max(0,(preferences.quality==='low'?60:180)-particles.length));for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,v=25+Math.random()*90;particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:.5+Math.random()*.4,color});}}
// Enemies enter from beyond an edge (or sprout, for sentries) at a safe distance
// from the hero; KozaSpawn plans the entrance, the existing AI takes over after.
let spawnRandom=Math.random;
function addHazard(){if(hazards.length>=runMission.maxHazards)return false;const m=runMission,serial=hazardSerial++,speed=m.speed,picked=KozaDepth.pattern(m,elapsed,serial,runRegion),top=fieldTop+24,bottom=Math.max(top,H-50);
 const kind=picked==='hunter'&&hazards.filter(h=>h.kind==='hunter').length>=3?'drift':picked;
 const spawnArgs={kind,serial,W,H,top,bottom,player,speed,size:KozaHitbox.enemySize(kind),random:spawnRandom,hazards,safe:KozaHitbox.safeSpawnDistance()},plan=camOn()?KozaCamera.planSpawn(spawnArgs):KozaSpawn.plan(spawnArgs);
 if(!plan)return false;
 hazards.push({x:plan.x,y:plan.y,vx:plan.vx,vy:plan.vy,age:0,kind,r:KozaHitbox.enemyBody(kind),attackClock:0,charge:0,dash:0,aim:0,ttl:kind==='sentry'?12:kind==='hunter'?15:18,entering:plan.entering,target:plan.target,after:plan.after,sprout:plan.sprout,emerge:plan.emerge,entrance:plan.entrance});
 return true;}
const hapticsSupported=typeof navigator!=='undefined'&&typeof navigator.vibrate==='function';
function hapticLabel(){const b=$('haptics');if(!b)return;b.disabled=!hapticsSupported;b.textContent=hapticsSupported?'Titreşim: '+(preferences.haptics?'Açık':'Kapalı'):'Bu tarayıcıda titreşim desteklenmiyor';b.setAttribute('aria-pressed',String(preferences.haptics&&hapticsSupported));}
$('haptics').onclick=()=>{window.KozaSettings.update({haptics:!preferences.haptics});hapticLabel();};hapticLabel();
function applyPreferences(){muted=!preferences.master;reduced=preferences.motion==='reduced'||(preferences.motion==='system'&&motionQuery.matches);window.KozaAudio.setVolumes(preferences.music,preferences.effects);window.KozaAudio.setEnabled(preferences.master);if(mode==='paused')window.KozaAudio.stop();soundState();hapticLabel();document.documentElement.classList.toggle('reduce-motion',reduced);if(reduced)particles=[];if(!preferences.flash)impact=0;if(!preferences.hints)$('hint').hidden=true;resize();}
function impactFeedback(){impact=preferences.flash?.28:0;if(preferences.haptics&&hapticsSupported&&!document.hidden){try{navigator.vibrate(55);}catch{}}}
let readyPending=false;
function step(dt){if(mode==='paused'||mode==='choice')return;if(readyPending&&mode==='play'&&!window.KozaEntrance?.active){readyPending=false;window.KozaDiag?.stage?.('READY_TO_PLAY',{region:runRegion,stage:runMission.number,boss:!!runMission.boss,model3d:runMission.boss?!!window.KozaDeer3D?.isReady?.(Math.floor(runMission.number/5)-1,runRegion):undefined});}if(window.KozaEntrance?.active){window.KozaEntrance.tick(dt);release();keys={};return;}if(mode==='play'&&KozaAdventure.state.ready>0){KozaAdventure.state.ready=Math.max(0,KozaAdventure.state.ready-dt);$('resumeCue').hidden=KozaAdventure.state.ready===0;KozaAdventure.paint();return;}clock+=dt;impact=Math.max(0,impact-dt);if(mode!=='play'){motion.pace*=Math.exp(-dt*9);return;}const oldX=player.x,oldY=player.y,previousTime=time;elapsed+=dt;time=Math.max(0,runMission.duration-elapsed);if(previousTime>5&&time<=5)KozaAdventure.notice('Son 5 saniye',{kind:'warning',detail:runMission.k01?'Dayan, dalga bitiyor!':runMission.boss?'Dayan, koruyucu yoruluyor!':Expedition.goal(runMission,{score,maxCombo,lives})?'Dayan, hedef tamamlandı!':'Hedefi tamamla!',priority:4,duration:1.9});hitCD=Math.max(0,hitCD-dt);comboAge+=dt;const comboLimit=KozaRunFlow.synergy(KozaAdventure.state.picks)?.id==='light-trail'?4:2.7;if(comboAge>comboLimit)combo=0;updateTutorial();spawnClock+=dt;orbClock+=dt;{const op=window.KozaScaleV2?.orbPace?.(),oe=op?.every||.85,oc=op?.cap||8; /* MAP 1 SCALE ROLLOUT: light presence */if(!runMission.boss&&orbClock>=oe){orbClock-=oe;if(orbs.length<oc)orbs.push(randomOrb());}}const rhythm=KozaRunFlow.rhythm(runMission,elapsed,KozaAdventure.state);if(!rhythm.spawn||KozaAdventure.state.bossEnding)spawnClock=0; /* Q3: no new creatures once the guardian encounter is over */if(rhythm.spawn&&!KozaAdventure.state.bossEnding&&spawnClock>runMission.interval*rhythm.factor){spawnClock=0;if(!addHazard()&&camOn()&&hazards.length<runMission.maxHazards)spawnClock=runMission.interval*rhythm.factor*.7;}
const {dx,dy}=KozaRunFlow.input(target,keys);const qs=KozaAdventure.state,flowAge=qs.flow>0?Math.max(0,(qs.effectDuration||2.2)-qs.flow):0,flowEase=qs.flow>0&&profile.active==='koru'?Math.min(1,flowAge/.18,qs.flow/.18):0;const speed=Progress.stats(profile).speed*Math.min(1.3,(KozaAdventure.hasPower('swift')?1.15:1)*(1+.18*flowEase))*dt;player.x+=dx*speed;player.y+=dy*speed;const windText=rhythm.label;if($('windHud').textContent!==windText)$('windHud').textContent=windText;constrainHero();
if(Math.hypot(player.x-oldX,player.y-oldY)>.2)tutorialMoved=true;
KozaAdventure.tick(dt);if(mode!=='play')return;if(camOn()){const b=KozaAdventure.state.boss;if(b&&!b.defeating)KozaCamera.confineBoss(b);for(const o of orbs)KozaCamera.confine(o,o.special?26:18);}
KozaTopdownMotion.advance(motion,{dt,dx,dy,moveX:player.x-oldX,moveY:player.y-oldY,kind:profile.active,reduced});constrainHero();
window.KozaScaleV2?.lights?.(dt); /* SCALE TEST V2: magnet band, wave-end vacuum, far-light / far-shadow retire */
for(let i=orbs.length-1;i>=0;i--){const o=orbs[i],d=Math.hypot(o.x-player.x,o.y-player.y);if(!o.vac&&d<Progress.stats(profile).radius+(KozaAdventure.hasPower('magnet')?30:0)+(KozaAdventure.state.magnet>0?65:0)&&d>1){o.x+=(player.x-o.x)*Math.min(1,dt*7);o.y+=(player.y-o.y)*Math.min(1,dt*7);}if(KozaRunFlow.contact({x:oldX,y:oldY},player,o,o,o.special?24:20)){if(o.special){orbs.splice(i,1);KozaAdventure.claimSpecial(o);break;}const gold=KozaAdventure.collect(o);combo++;maxCombo=Math.max(maxCombo,combo);comboAge=0;const gain=gold?(o.gain||1):1;score+=gain;burst(o.x,o.y,gold?'#ffe1a0':'#97f0d0',gold?(o.risky?12:8):10);sfx(gold?'goldLight':'pickup',{step:combo-1,risky:!!o.risky});window.KozaGameFeel?.pickup(o,combo);orbs.splice(i,1); /* Q3: one feedback path per pickup (no guardian seal / recoil layer) */}}
if(mode!=='play')return;
for(let i=hazards.length-1;i>=0;i--){const h=hazards[i],previous={x:h.x,y:h.y},enemyDt=dt*(KozaAdventure.state.slow>0?.8:1);if(h.entering){KozaSpawn.enter(h,enemyDt,player,KozaHitbox.safeSpawnDistance());continue;}
 // v5.15 world boundary: creatures never leave the playable polygon. Chasers slide
 // along it; crossing kinds fade out where they meet the scenery (never walk through it).
 if(h.exiting){h.exitT=(h.exitT||0)+dt;h.x+=h.vx*dt*.35;h.y+=h.vy*dt*.35;if(h.exitT>.45)hazards.splice(i,1);continue;}
 const shot=window.KozaEnemies.advance(h,player,enemyDt,runMission);if(shot&&projectiles.length<6)projectiles.push(shot);
 if(camOn()&&!KozaCamera.insideField(h.x,h.y,h.r*.9)){if(h.kind==='hunter'||h.kind==='sentry'||h.age<1.2)KozaCamera.confine(h,h.r*.9);else if(h.age<KozaCamera.EXIT_AGE){const ox=h.x,oy=h.y;KozaCamera.confine(h,h.r*.9);const nx=h.x-ox,ny=h.y-oy,nl=Math.hypot(nx,ny)||1,ux=nx/nl,uy=ny/nl,d=h.vx*ux+h.vy*uy;if(d<0){h.vx-=2*d*ux;h.vy-=2*d*uy;}}else{h.exiting=true;h.exitT=0;continue;}}
if(h.age>1&&!h.entering&&KozaRunFlow.contact({x:oldX,y:oldY},player,previous,h,h.r+KozaHitbox.heroBody()))damagePlayer();if(mode!=='play')break;
if(h.age>h.ttl||h.x<-50||h.x>W+50||h.y>H+40||h.y<fieldTop-45)hazards.splice(i,1);}
// QUALITY q1: soft separation - wandering creatures (drift / zigzag / a hunter that is not charging or dashing) no longer
// stack into one unreadable blob or walk over a planted sentry (the sentry itself never moves); a small positional push
// only, inside the playable polygon. Crossing/rain lines are unchanged.
if(mode==='play'){const S=hazards.filter(h=>!h.entering&&!h.exiting&&h.age>1&&(h.kind==='drift'||h.kind==='zigzag'||h.kind==='sentry'||(h.kind==='hunter'&&!(h.dash>0)&&!(h.charge>0))));for(let i=0;i<S.length;i++)for(let j=i+1;j<S.length;j++){const a=S[i],b=S[j],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||.001,min=((a.r||16)+(b.r||16))*.85;if(d<min&&!(a.kind==='sentry'&&b.kind==='sentry')){const wa=a.kind==='sentry'?0:b.kind==='sentry'?1:.5,push=(min-d)*Math.min(1,dt*6),ux=dx/d,uy=dy/d;a.x-=ux*push*wa;a.y-=uy*push*wa;b.x+=ux*push*(1-wa);b.y+=uy*push*(1-wa);if(camOn()){if(!KozaCamera.insideField(a.x,a.y,a.r*.9))KozaCamera.confine(a,a.r*.9);if(!KozaCamera.insideField(b.x,b.y,b.r*.9))KozaCamera.confine(b,b.r*.9);}}}}
if(mode==='play')for(let i=projectiles.length-1;i>=0;i--){const p=projectiles[i],previous={x:p.x,y:p.y};p.age+=dt;p.x+=p.vx*dt*(KozaAdventure.state.slow>0?.8:1);p.y+=p.vy*dt*(KozaAdventure.state.slow>0?.8:1);if(KozaRunFlow.contact({x:oldX,y:oldY},player,previous,p,p.r+KozaHitbox.heroBody())){projectiles.splice(i,1);damagePlayer();if(mode!=='play')break;}else if(p.age>p.ttl||p.x<-20||p.x>W+20||p.y<fieldTop-20||p.y>H+20||(camOn()&&!KozaCamera.insideField(p.x,p.y,-p.r)))projectiles.splice(i,1);}
updateHUD();if(combo>=2&&!runMission.boss){const meter=$('comboMeter'),ratio=Math.round(Math.max(0,1-comboAge/comboLimit)*20)/20;if(meter&&meter.dataset.ratio!==String(ratio)){meter.dataset.ratio=String(ratio);meter.style.transform='scaleX('+ratio+')';}}if(time<=0&&mode==='play'&&!runMission.boss)finish(true);} /* Q3: a guardian stage completes through its calm outro (KozaAdventure) */
// The special yellow light: a round sun-yellow core with a soft halo and a thin
// orbiting ring. Distinct from star-shaped lights and gold boss seals; no bloom.
function drawSpecialLight(o){
 const t=reduced?0:clock,pulse=reduced?1:1+Math.sin(t*3.2)*.08,y=o.y+(reduced?0:Math.sin(t*2.4)*2.5);
 ctx.save();
 if(window.KozaGradCache?.on())KozaGradCache.disc(ctx,'special',[[0,'#fff3a0aa'],[.45,'#ffd84a44'],[1,'#ffd84a00']],o.x,y,30*pulse);else{const halo=ctx.createRadialGradient(o.x,y,0,o.x,y,30*pulse);halo.addColorStop(0,'#fff3a0aa');halo.addColorStop(.45,'#ffd84a44');halo.addColorStop(1,'#ffd84a00');
 ctx.fillStyle=halo;ctx.beginPath();ctx.arc(o.x,y,30*pulse,0,Math.PI*2);ctx.fill();}
 ctx.strokeStyle='#ffe57acc';ctx.lineWidth=1.6;ctx.setLineDash?.([7,6]);ctx.lineDashOffset=-t*18;ctx.beginPath();ctx.arc(o.x,y,17*pulse,0,Math.PI*2);ctx.stroke();ctx.setLineDash?.([]);
 ctx.fillStyle='#ffe766';ctx.beginPath();ctx.arc(o.x,y,8.5*pulse,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#fffbe0';ctx.beginPath();ctx.arc(o.x-2.2,y-2.4,3,0,Math.PI*2);ctx.fill();
 ctx.restore();
}
function drawOrb(x,y,r,color,alpha=1){ctx.globalAlpha=alpha;ctx.shadowBlur=preferences.quality==='low'?0:16;ctx.shadowColor=color;ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(x,y-r);ctx.quadraticCurveTo(x+r*.35,y-r*.2,x+r,y);ctx.quadraticCurveTo(x+r*.2,y+r*.2,x,y+r);ctx.quadraticCurveTo(x-r*.2,y+r*.2,x-r,y);ctx.quadraticCurveTo(x-r*.2,y-r*.2,x,y-r);ctx.fill();ctx.shadowBlur=0;ctx.globalAlpha=1;}
let petAlpha=1;
function drawPet(x,y,size,idle){
 const stage=petState().star,img=evolutionSprites[profile.active],kind=profile.active;
 // HERO EVOLUTION: 3D hero/form (dedicated renderer); any failure or a model still loading -> the 2D sprite below.
 if(false&&!idle&&kind!=='lumi'&&window.KozaHeroes3D?.enabled?.()&&!window.__hero2d){ /* QUALITY q1: all heroes 2D (approved art); 3D hero path disabled */ /* LUMI 2D STABLE: Lumi always uses the approved 2D art below */if(KozaHeroes3D.draw(ctx,kind,stage+1,x,y,size,{angle:motion.heading-Math.PI/2,pace:motion.pace,time:clock,reduced,alpha:(hitCD&&mode==='play'?.65:1)*petAlpha,foot:size*.3}))return;}
 if(!idle&&window.KozaTopdown?.ready){ctx.save();ctx.translate(x,y);ctx.globalAlpha=(hitCD&&mode==='play'?.65:1)*petAlpha;KozaTopdown.draw(ctx,kind,stage,motion,size,reduced);ctx.restore();return;}
 const pace=idle?0:motion.pace,t=clock,phase=motion.phase;
 const breath=reduced?0:Math.sin(t*2.2)*.018;
 const bob=reduced?0:idle?Math.sin(t*2.1)*2:kind==='koru'?-Math.abs(Math.sin(phase))*size*.025*pace:Math.sin(phase)*(1+pace*2);
 const lean=reduced?0:idle?Math.sin(t*1.4)*.012:kind==='koru'?Math.sin(phase)*.025*pace:Math.max(-.12,Math.min(.12,motion.vx/1800));
 const squeeze=reduced?0:kind==='koru'?Math.sin(phase*2)*.012*pace:0;
 ctx.save();ctx.translate(x,y);
 ctx.fillStyle='#06252a44';ctx.beginPath();ctx.ellipse(0,size*.3,size*.22,size*.065,0,0,Math.PI*2);ctx.fill();const glow=ctx.createRadialGradient(0,15,0,0,15,size*.57);glow.addColorStop(0,'#94f3d022');glow.addColorStop(1,'#94f3d000');ctx.fillStyle=glow;ctx.fillRect(-size,-size,size*2,size*2);
 ctx.translate(0,bob);ctx.rotate(lean);ctx.scale((idle?1:motion.facing*motion.faceBlend)*(1-breath+squeeze),1+breath-squeeze);
 ctx.globalAlpha=hitCD&&mode==='play'?.65:1;
 if(img.complete&&img.naturalWidth){const r=window.KozaSpriteAtlas[kind].rects[stage],extent=size*(idle?.69+stage*.09:.66+stage*.06),scale=extent/Math.max(r[2],r[3]),w=r[2]*scale,h=r[3]*scale;
 // Wings and fins move in the hero's local direction, so they follow every turn.
 const strips=reduced?1:preferences.quality==='low'?8:20;
 // Menu portraits have no authored limb frames. Drawing narrow deforming
 // strips exposed seams through the face/body; retain the intact approved art.
 if(idle||reduced){ctx.drawImage(img,r[0],r[1],r[2],r[3],-w/2,-h/2,w,h);}
 else if(kind==='koru'){
  // A continuous mesh gives the lower limbs opposing steps without seams at the hips.
  const rows=preferences.quality==='low'?10:20,cols=8;
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
   const u=col/cols,v=row/rows,q=(col+.5)/cols;
   const leg=Math.max(0,(v-.62)/.38),stride=Math.sin(phase+(q<.60?0:Math.PI))*pace;
   const shift=stride*leg*leg*size*.045,lift=-Math.max(0,stride)*leg*size*.065;
   ctx.drawImage(img,r[0]+r[2]*u,r[1]+r[3]*v,r[2]/cols,r[3]/rows,-w/2+w*u+shift,-h/2+h*v+lift,w/cols+.45,h/rows+.45);
  }
 }else for(let i=0;i<strips;i++){
  const u=i/strips,v=(i+1)/strips,q=(u+v)/2,edge=Math.pow(Math.abs(q-.5)*2,2);
  const flap=idle?t*3:phase;
  // Keep the central face/body steady; fold the wing area around its roots.
  const fold=reduced?1:kind==='pera'?.68+.30*Math.sin(flap):kind==='lumi'?.91+.09*Math.sin(flap):1;
  const wingX=q=>q<.35?.35+(q-.35)*fold:q>.65?.65+(q-.65)*fold:q;
  const wave=reduced?0:kind==='lumi'?Math.sin((idle?t*2.5:phase)-q*4)*(idle?1.5:1+pace*2)*edge:kind==='pera'?Math.cos(flap)*(idle?2:3+pace*2)*edge:0;
  ctx.drawImage(img,r[0]+r[2]*u,r[1],r[2]/strips,r[3],-w/2+w*wingX(u),-h/2+wave,w*(wingX(v)-wingX(u))+.35,h);

 }}
 ctx.restore();
}
function render(dt){if(camOn()){if(mode!=='home')KozaCamera.follow?.(dt,player,KozaAdventure.state.boss);applyWorldTransform();ctx.save();screenSpace();KozaCamera.drawBase(ctx);if(!reduced){KozaCamera.drawWater(ctx,clock);KozaCamera.drawFx?.(ctx,clock);}ctx.restore();}else ctx.clearRect(0,0,W,H);const idle=mode==='home';window.KozaHomeAtmosphere?.draw({time:clock,active:idle,reduced,quality:preferences.quality,blocked:!!window.KozaLoading?.busy||!!document.querySelector('dialog[open]')});
if(idle){const cy=H*.56;drawPet(W/2,cy,Math.min(W*.76,H*.76,320),true);}else{if(!camOn())drawOrbs();const visibleHazards=wideOn()?hazards.filter(h=>KozaCamera.onScreen(h.x,h.y,enemyVisual(h.kind)*1.2+40)):hazards;window.KozaEnemies3D?.prepareFrame(visibleHazards,runRegion,clock,reduced,preferences.quality==='low',h=>enemyVisual(h.kind));if(camOn())drawWorldActors(visibleHazards);else{hazards.forEach(drawEnemy);projectiles.forEach(drawProjectile);KozaAdventure.draw();if(petState().star>=3&&mode==='play'&&Math.random()<.25&&!reduced)burst(player.x,player.y+12,'#e9d291',1);drawPet(player.x,player.y,COMBAT_VISUAL_SIZE.hero,false);}
  {const pulse=KozaAdventure.state.readyPulse||0;if(pulse>0&&mode==='play'){const u=1-pulse/.7;ctx.save();ctx.strokeStyle='#c4f5de';ctx.globalAlpha=.65*(1-u);ctx.lineWidth=1+2*(1-u);ctx.beginPath();ctx.arc(player.x,player.y,reduced?32:20+32*u,0,Math.PI*2);ctx.stroke();ctx.restore();}}window.KozaPowerFX?.over(ctx,KozaAdventure.state,motion,player,reduced,preferences.quality);window.KozaGameFeel?.draw(ctx,dt);window.KozaScaleV2?.cues?.(ctx);if(target){ctx.save();screenSpace();ctx.fillStyle='#082e3b66';ctx.strokeStyle='#b4f0d766';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(target.sx,target.sy,32,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#dbf9e6aa';ctx.beginPath();ctx.arc(target.sx+target.dx*target.amount*22,target.sy+target.dy*target.amount*22,10,0,Math.PI*2);ctx.fill();ctx.restore();}if(camOn()){ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);KozaCamera.drawForeground(ctx);ctx.restore();}}
for(let i=particles.length-1;i>=0;i--){const p=particles[i];if(mode!=='paused'){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;}if(p.life<=0){particles.splice(i,1);continue;}if(wideOn()&&!KozaCamera.onScreen(p.x,p.y,8))continue;ctx.globalAlpha=Math.min(1,p.life*2);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,2.2,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}}
function drawImpact(){if(!preferences.flash||impact<=0)return;const strength=(impact/.28)*(reduced?.08:.2);ctx.save();screenSpace();const SW=canvas.width/dpr,SH=canvas.height/dpr;ctx.globalAlpha=strength;const flash=ctx.createRadialGradient(SW/2,SH/2,Math.min(SW,SH)*.15,SW/2,SH/2,Math.max(SW,SH)*.65);flash.addColorStop(0,'rgba(255,215,228,.2)');flash.addColorStop(1,'#ff91b0');ctx.fillStyle=flash;ctx.fillRect(0,0,SW,SH);ctx.restore();}
let lastSceneDraw=0;function loop(now){if(mode==='play'&&last){window.KozaDiag?.frame(now-last);if(window.KozaCamera?.enabled)KozaCamera.noteFrame(now-last);}if(document.hidden||document.body.classList.contains('map-open')){last=now;requestAnimationFrame(loop);return;}const raw=Math.max(0,(now-last)/1000||0);last=now;if(mode!=='play'){step(Math.min(raw,.1));}else if(window.KozaScreen?.transitioning){/* Fullscreen compositor stalls do not advance combat or open pause. */}else if(window.KozaScreen?.takeResumeFrame?.()){/* Discard the first post-compositor delta without pausing or advancing combat. */}else if(raw>.5&&window.KozaLoading?.inGrace?.()){/* Late asset swap / first frames after loading: discard one long frame instead of auto-pausing. */}else if(raw>KOZA_Q3.pauseAfter){pause();KozaAdventure.notice('Oyun uzun bir takılma nedeniyle duraklatıldı.');}else{const sim=Math.min(raw,KOZA_Q3.maxSim);if(raw-sim>.001)KOZA_Q3.noteHitch(raw,sim);let remaining=sim,steps=0;while(remaining>1e-4&&steps<KOZA_Q3.maxSteps){const slice=Math.min(remaining,1/60);step(slice);remaining-=slice;steps++;}}const frozen=mode==='paused'||mode==='choice'||(mode==='play'&&KozaAdventure.state.ready>0);if(mode!=='choice'&&(!frozen||now-lastSceneDraw>250)){ /* Q2: while choosing, the frozen snapshot is shown; the scene is not redrawn */render(frozen?0:Math.min(raw,.1));drawImpact();lastSceneDraw=now;}KozaAdventure.pumpNotices?.();$('toast').classList.toggle('visible',clock<toastUntil);$('toast').dataset.edge=mode==='play'&&heroScreenY()<(camOn()?Math.max(camTop,0):fieldTop)+135?'lower':'upper';requestAnimationFrame(loop);}document.documentElement.classList.toggle('reduce-motion',reduced);refresh();save();requestAnimationFrame(loop);
if(document.modelContext?.registerTool){try{Promise.resolve(document.modelContext.registerTool({name:'read_koza_progress',description:'Read this browser’s saved creature level, appearance and exploration progress.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute(input){if(!input||Object.keys(input).length)throw Error('Expected empty input');return {...profile,star:petState().star,mode};}})).catch(()=>{});}catch{}}

function windForce(){return Math.sin(elapsed*(.38+runMission.number*.006)+runMission.number*.3)*runMission.wind;}
function refreshJourney(){const id=Expedition.unlocked(profile,profile.region)?profile.region:'garden',m=Expedition.mission(profile);$('regionName').textContent=Expedition.regions[id].name;$('habitatLabel').textContent=Expedition.regions[id].name.toLocaleUpperCase('tr-TR');$('missionLabel').textContent='Bölüm '+m.number+' / 20 · '+m.name;$('missionDescription').textContent=Expedition.description(m)+(m.boss?' '+m.duration+' sn dayan.':'');$('playLabel').textContent='OYNA';$('playDuration').innerHTML='<span class="play-stage">Bölüm '+m.number+'</span><span class="play-sep" aria-hidden="true"> · </span><span class="play-time">'+m.duration+' sn</span>';if(mode==='home'){window.KozaAssets?.applyHome(id);$('app').classList.toggle('grove',id==='grove');document.body.classList.toggle('grove-scene',id==='grove');}}
function updateMissionHUD(){
 const hud=$('missionHud');hud.classList.toggle('boss-health-hud',!!runMission.boss);
 if(runMission.boss){
  hud.classList.remove('goal-complete','goal-pulse');if($('hud').dataset.goal)$('hud').dataset.goal='';
  const A=KozaAdventure.state,b=A.boss,spec=KozaBossPatterns.spec(runMission.number,runRegion);
  // Q3: the guardian bar shows only REAL information - survival progress (encounter clock), the phase, and a cue only when
  // it asks for an action (wind-up / attack in flight / optional golden light). No guardian HP / seal count exists anymore.
  const ending=!!A.bossEnding,calmDone=ending&&A.bossDone,P=A.bossPhase|0,prog=Math.max(0,Math.min(100,Math.round(100*(runMission.duration-Math.max(0,time))/Math.max(1,runMission.duration)))),
   intro=A.bossIntro>0,cueKind=calmDone?'done':ending?'warning':b?.charge>0?'warning':b?.action>0?'danger':orbs.some(o=>o.bossMark)?'collect':intro?'intro':'idle',cue=cueKind==='idle'?'':cueKind==='done'?'Koruyucu sakinleşti':ending?'Süre doldu · son saldırı bitiyor':cueKind==='intro'?'Saldırılardan kaç · Süre dolana kadar dayan':KozaRunFlow.bossCue(b,orbs),
   phaseText=calmDone?'Tamamlandı':ending?'Süre doldu':['Evre 1 · Isınma','Evre 2 · Baskı','Evre 3 · Son evre'][P];
  if(!window.KOZA_PERF?.hudStable){
  const key=[phaseText,cue,cueKind,runRegion,runMission.number].join('|');
  if(hud.dataset.content!==key){hud.dataset.content=key;hud.classList.toggle('boss-intro',intro);hud.innerHTML='<div class="boss-health-heading"><strong>'+spec.name+'</strong><span class="boss-phase" data-phase="'+(calmDone?'done':P)+'">'+phaseText+'</span></div><div class="boss-health-track boss-survive" role="progressbar" aria-label="Dayanma süresi" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+prog+'"><i class="boss-survive-fill" style="width:'+prog+'%"></i><b class="phase-tick" style="left:34%"></b><b class="phase-tick" style="left:68%"></b></div>'+(cue?'<span class="boss-cue" data-kind="'+cueKind+'">'+cue+'</span>':'');}
  else{const fill=hud.querySelector('.boss-survive-fill');if(fill&&fill.style.width!==prog+'%'){fill.style.width=prog+'%';fill.parentNode.setAttribute('aria-valuenow',prog);}}
  }else{const key=[spec.name,runRegion,runMission.number].join('|');let built=false;
   if(hud.dataset.content!==key){hud.dataset.content=key;built=true;hud.innerHTML='<div class="boss-health-heading"><strong>'+spec.name+'</strong><span class="boss-phase"></span></div><div class="boss-health-track boss-survive" role="progressbar" aria-label="Dayanma süresi" aria-valuemin="0" aria-valuemax="100"><i class="boss-survive-fill"></i><b class="phase-tick" style="left:34%"></b><b class="phase-tick" style="left:68%"></b></div><span class="boss-cue" data-kind="idle">\u00a0</span>';}
   hud.classList.toggle('boss-intro',intro);const ph=hud.querySelector('.boss-phase'),cu=hud.querySelector('.boss-cue'),fill=hud.querySelector('.boss-survive-fill'),pk=String(calmDone?'done':P),ck=cue?cueKind:'idle',ct=cue||'\u00a0';
   if(ph.textContent!==phaseText)ph.textContent=phaseText;if(ph.dataset.phase!==pk)ph.dataset.phase=pk;if(cu.dataset.kind!==ck)cu.dataset.kind=ck;if(cu.textContent!==ct)cu.textContent=ct;
   if(fill.style.width!==prog+'%'){fill.style.width=prog+'%';fill.parentNode.setAttribute('aria-valuenow',prog);}
   if(built)syncFieldBoundary();return;}
  syncFieldBoundary();return;
 }
 const m=runMission,done=Expedition.goal(m,{score,maxCombo,lives});
 const value=m.id==='chain'?Math.min(maxCombo,m.target)+' / '+m.target+' seri':m.id==='mixed'?Math.min(score,m.target)+' / '+m.target+' ışık · '+Math.min(maxCombo,m.comboTarget)+' / '+m.comboTarget+' seri':Math.min(score,m.target)+' / '+m.target+' ışık'+(m.id==='survive'?' · 2 can':'');
 hud.classList.toggle('goal-complete',done);if($('hud').dataset.goal!==(done?'done':''))$('hud').dataset.goal=done?'done':''; // Q2: the pill itself shows the goal is met; time stays visible
 if(done&&!missionAwarded){missionAwarded=true;KozaAdventure.state.goalScore=score;sfx('goal');KozaAdventure.notice('Hedef tamamlandı',{kind:'success',detail:'Süre bitene kadar hayatta kal',priority:2,duration:2.3});if(!reduced&&preferences.flash)burst(player.x,player.y,'#fff0b8',preferences.quality==='low'?10:24);window.KozaGameFeel?.bump('score');}
 // QUALITY PASS: the light count and target live in the top HUD pill (✦ n / target); this slim line only carries what the
 // pill cannot: combo goals, the survive requirement and the 'goal done, finish the time' state.
 const extra=m.id==='chain'?'Seri '+Math.min(maxCombo,m.target)+' / '+m.target:m.id==='mixed'?'Seri '+Math.min(maxCombo,m.comboTarget)+' / '+m.comboTarget:m.id==='survive'?'En az '+m.minLives+' can koru':'';
 const text=done?'✓ Hedef tamam':extra;
 hud.classList.toggle('is-empty',!text);
 if(hud.dataset.content!==text){hud.dataset.content=text;hud.textContent=text;hud.setAttribute('aria-label',done?'Hedef tamamlandı. Süre bitene kadar hayatta kal.':value);}
 syncFieldBoundary();
}
function showRegions(){if(mode==='home')openChapterMap(profile.region);}
function celebrate(kind,id,before,after,cost=0){if(kind==='feed'){const notice=$('evolutionNotice');notice.hidden=false;notice.textContent='✦ +'+cost+' gelişim · Bir sonraki biçime yaklaşıyor';notice.classList.remove('feed-pulse');void notice.offsetWidth;notice.classList.add('feed-pulse');return;}const d=Progress.catalog[id],dialog=$('celebration');$('celebrationTag').textContent=kind==='buy'?'YENİ BİR DOST':kind==='evolve'?'YENİ BİR BİÇİM':'BİRLİKTE BÜYÜYORSUNUZ';$('celebrationTitle').textContent=kind==='buy'?d.name+' sana katıldı':kind==='evolve'?d.forms[after]:'Biraz daha güçlendi';$('celebrationArt').className='celebration-art '+kind;$('celebrationArt').innerHTML='<div class="celebration-ring"></div>'+Array.from({length:reduced?0:12},(_,i)=>'<i class="celebration-spark" style="--angle:'+i*30+'deg;--delay:'+i*.035+'s"></i>').join('')+(kind==='evolve'?portrait(id,before,'old-form'):'')+portrait(id,after,'new-form');$('celebrationStars').textContent=after?'★'.repeat(after):'Yolculuk şimdi başlıyor';const stage=Progress.stage(profile.pets[id].points);$('celebrationText').textContent=kind==='buy'?'0 yıldızla başladı. Özle geliştirdikçe dört farklı biçime dönüşecek.':kind==='evolve'?d.description+(after===1&&Expedition.unlocked(profile,'grove')?' Rüzgâr Korusu keşfe hazır.':''):'+'+cost+' gelişim · '+stage.progress+' / '+stage.required+' öz. Bir sonraki biçimine yaklaşıyor.';dialog.showModal();if(kind!=='feed'){sfx(kind==='buy'?'buy':kind==='evolve'?'evolve':'upgrade');if(kind==='evolve')window.KozaGameFeel?.haptic?.(40);}}
$('regionOpen').onclick=showRegions;$('celebrationDone').onclick=()=>{$('celebration').close();};

function updateTutorial(){const hint=$('hint');hint.hidden=!preferences.hints||profile.runs>0||tutorialMoved||elapsed>6;hint.textContent='Sürükle ve basılı tut · Hareket sürer';}

$('nextChapter').onclick=()=>{window.KozaDiag?.stage?.('NEXT_STAGE_REQUEST',{region:runRegion,from:runMission.number,to:runMission.number<20?runMission.number+1:1});if(runMission.number<20){profile.region=runRegion;profile.campaign.selected[runRegion]=runMission.number+1;}else{profile.region='grove';profile.campaign.selected.grove=1;}save();begin();};

function damagePlayer(){if(hitCD||mode!=='play')return;if(KozaAdventure.absorb())return;lives--;if(lives===1){KozaAdventure.notice('Son can!',{kind:'danger',detail:'Açık alana çık · Gölgelerden uzak dur',priority:5,duration:2.3});sfx('lowHp');}KozaAdventure.state.hits++;impactFeedback();combo=0;hitCD=Progress.stats(profile).protection;burst(player.x,player.y,'#ff8c91',18);sfx('damage');window.KozaGameFeel?.damage(player);if(lives<=0)finish(false);}
function drawEnemy(h){ctx.save();ctx.translate(h.x,h.y);
 // Soft contact shadow at the creature's feet grounds it on the painted arena.
 if(!camOn()){const size=KozaHitbox.enemySize(h.kind),foot=window.KozaEnemies3D?.foot?.(h,size),y=foot?foot.y:size*.34,w=foot?Math.min(foot.w,size*.46):size*.3,hh=foot?.h?Math.min(foot.h,w*.8):w*.26;softShadow(0,y,w,hh,foot?.alpha??.25);}const warning=!h.entering&&h.age<1,charging=h.charge>0,color=h.kind==='hunter'?'#ffd397':'#f2aac7';
if(charging||warning){KozaCombatFX.glow(ctx,0,0,h.r+16,color,charging?.65:.3);if(charging)KozaCombatFX.burst(ctx,0,0,reduced?0:h.age,h.kind==='hunter'?'fire':'moon',h.r,preferences.quality==='low');}
if(preferences.contrast){ctx.strokeStyle='#ffedb9';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,h.r+3,0,Math.PI*2);ctx.stroke();}
ctx.globalAlpha=warning&&!h.sprout&&!h.entered?.45+.55*Math.min(1,h.age):1;if(h.emerge&&h.entering)ctx.globalAlpha*=Math.min(1,(h.enterTime||0)/.45);if(h.exiting)ctx.globalAlpha*=Math.max(0,1-(h.exitT||0)/.45);
 // Sentries sprout from the ground during their warning instead of fading in.
 if(h.sprout&&h.age<1&&!reduced){const grow=Math.min(1,h.age/.6),e=grow*grow*(3-2*grow);ctx.translate(0,(1-e)*KozaHitbox.enemySize(h.kind)*.25);ctx.scale(.35+.65*e,.2+.8*e);}const angle=h.kind==='hunter'?h.aim-Math.PI*.75:h.kind==='sentry'?0:reduced?0:h.age*.35;if(!window.KozaEnemies3D?.hasFrame?.(h))ctx.rotate(angle);drawEnemySprite(h.kind,enemyVisual(h.kind),{enemy:h,time:h.age,charge:h.charge||0,recoil:h.recoil||0,dash:h.dash||0});ctx.restore();}
// v5.15 shared world pass: one ground pass (patterns, contact shadows + AO for
// every actor), then actors and tall prop tops depth-sorted by their floor contact.
function drawWorldActors(list=hazards){
 const boss=KozaAdventure.state.boss,hero=heroVisual(),sq=KozaCamera.sin,ground=[],actors=[];
 // Ground telegraphs stay on the playable floor (boss attacks respect the world).
 {const poly=KozaCamera.polygonField();ctx.save();if(poly.length){ctx.beginPath();poly.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.clip();}KozaAdventure.drawUnder();ctx.restore();}
 for(const h of list){const size=enemyVisual(h.kind),f=window.KozaEnemies3D?.foot?.(h,size),foot=f?f.y:size*.3;const rx=Math.max(f?f.w:0,size*.48);ground.push(()=>{KozaCamera.separation(ctx,h.x,h.y+foot*.6,size*.95,sq,'danger');KozaCamera.groundShadow(ctx,h.x,h.y+foot+size*.06,rx,rx*sq,Math.max(.46,f?.alpha??.46));});actors.push({foot:h.y+foot,draw:()=>drawEnemy(h)});}
 if(boss){const c=window.KozaDeer3D?.contact?.(boss),foot=c?c.y-boss.y:boss.r*.6;if(c){const rx=Math.max(c.rx,KozaCamera.silhouette('boss',boss.index)*.42);ground.push(()=>KozaCamera.groundShadow(ctx,c.x,c.y,rx,rx*sq,Math.max(.46,c.alpha),c.altitude));}else ground.push(()=>KozaCamera.groundShadow(ctx,boss.x,boss.y+foot,boss.r*1.1,boss.r*1.1*sq,.34));actors.push({foot:boss.y+foot,draw:()=>KozaAdventure.drawBoss()});}
 const heroFoot=hero*.3,heroShadow=hero*.46*(profile.active==='lumi'?(.78+petState().star*.04)/.84:1);ground.push(()=>KozaCamera.groundShadow(ctx,player.x,player.y+heroFoot,heroShadow,heroShadow*sq,.5)); /* LUMI 2D STABLE: shadow follows Form size */
 actors.push({foot:player.y+heroFoot,draw:()=>{if(petState().star>=3&&mode==='play'&&Math.random()<.25&&!reduced)burst(player.x,player.y+12,'#e9d291',1);drawPet(player.x,player.y,hero,false);}});if(window.KOZA_TEST_BUILD)(window.KozaQARoster||[]).forEach(r=>{ground.push(()=>KozaCamera.groundShadow(ctx,r.x,r.y+heroFoot,hero*.46,hero*.46*sq,.5));actors.push({foot:r.y+heroFoot,draw:()=>window.KozaHeroes3D?.draw(ctx,r.id,r.form,r.x,r.y,hero,{angle:r.angle??Math.PI/2,pace:0,time:clock,reduced,foot:heroFoot,noTransition:true,instance:'qa'+r.id+r.form})});});/* HERO EVOLUTION: QA-only lineup */
 const tops=KozaCamera.propTops();for(const p of tops)actors.push(p);
 ground.forEach(f=>f());actors.sort((a,b)=>a.foot-b.foot).forEach(a=>a.draw(ctx));
 // Occlusion aid: a hero hidden behind a tall prop keeps a faint silhouette.
 const hidden=tops.some(t=>t.box&&t.foot>player.y+heroFoot&&player.x>t.box.x&&player.x<t.box.x+t.box.w&&player.y>t.box.y&&player.y<t.box.y+t.box.h*.85)||(boss&&(()=>{const c=window.KozaDeer3D?.contact?.(boss),bf=c?c.y:boss.y+boss.r*.6,s=KozaCamera.silhouette('boss',boss.index);return bf>player.y+heroFoot&&Math.abs(player.x-boss.x)<s*.42&&player.y>bf-s*.9;})());
 if(hidden){petAlpha=.32;drawPet(player.x,player.y,hero,false);petAlpha=1;}
 // Collectible light is the visual priority: never hidden by scenery or actors.
 drawOrbs();
 projectiles.forEach(p=>{if(!wideOn()||KozaCamera.onScreen(p.x,p.y,60))drawProjectile(p);});
}
function drawOrbs(){orbs.forEach(o=>{if(wideOn()&&!KozaCamera.onScreen(o.x,o.y,60))return;o.special?drawSpecialLight(o):o.bossMark?drawSealLight(o):drawOrb(o.x,o.y+(reduced?0:Math.sin(clock*3+o.phase)*2),o.r,'#b0f2ce');});}
// Q2: the guardian's seal light has its own shape (a gold spark inside a notched seal ring that turns slowly) so it is
// never confused with the yellow power light (dashed halo) or an ordinary light (small mint spark).
function drawSealLight(o){ /* Q3 golden light: optional reward. Grows in (0.25 s), blinks softly in its last 1.5 s; a tempting light (worth 2) is larger with a slow amber orbit. */
 const age=o.age||0,left=(o.ttl||9)-age,inA=Math.min(1,age/.25),outA=left<1.5?(reduced?.6:.55+.45*Math.cos(age*10)):1,al=Math.max(0,inA*outA),y=o.y+(reduced?0:Math.sin(clock*3+o.phase)*2),r=o.r*(o.risky?1.18:1)*(.6+.4*inA),a=reduced?0:clock*(o.risky?1.4:.8),R=r+7;
 if(al<=0)return;drawOrb(o.x,y,r,o.risky?'#ffc864':'#ffdc7c',al);ctx.save();ctx.strokeStyle=o.risky?'#ffd08a':'#ffe3a0';ctx.lineWidth=1.4;ctx.globalAlpha=.75*al;ctx.beginPath();ctx.arc(o.x,y,R,0,Math.PI*2);ctx.stroke();
 if(o.risky){ctx.lineWidth=2;ctx.globalAlpha=.9*al;for(let i=0;i<2;i++){const t=a+i*Math.PI;ctx.beginPath();ctx.arc(o.x,y,R+4,t,t+.9);ctx.stroke();}}ctx.restore();}
// Soft ground contact shadow shared by 2D fallbacks and 3D enemies (KOZA presentation rule).
function softShadow(x,y,rx,ry,alpha){if(!(rx>0&&ry>0))return;ctx.save();ctx.translate(x,y);ctx.scale(1,ry/rx);const g=ctx.createRadialGradient(0,0,0,0,0,rx);g.addColorStop(0,'rgba(6,37,42,'+alpha+')');g.addColorStop(.65,'rgba(6,37,42,'+alpha*.82+')');g.addColorStop(1,'rgba(6,37,42,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,rx,0,Math.PI*2);ctx.fill();ctx.restore();}
function drawEnemySprite(kind,size,animation=null){
 if(animation?.enemy&&window.KozaEnemies3D?.draw(ctx,animation.enemy,size))return;
 const special=kind.startsWith('boss'),regional=special||runRegion==='grove',sheet=regional?groveSheet:enemySheet;
 if(sheet.complete&&sheet.naturalWidth){
  const r=regional?window.KozaGroveAtlas.rects[special?4+Number(kind.slice(4)):kind==='sentry'?2:kind==='hunter'?3:kind==='projectile'?1:0]:window.KozaEnemyAtlas.rects[kind==='sentry'?1:kind==='hunter'?2:0],scale=size/Math.max(r[2],r[3]),w=r[2]*scale,h=r[3]*scale;
  if(!animation||reduced){ctx.drawImage(sheet,r[0],r[1],r[2],r[3],-w/2,-h/2,w,h);return;}
  const winged=kind==='hunter'||kind==='boss2',t=animation.time,charge=animation.charge||0,recoil=Math.min(1,(animation.recoil||0)/.22),dash=animation.dash||0;
  const pulse=Math.sin(t*(charge?9:2.8)),breath=kind==='sentry'?.035:.025;
  ctx.save();
  // Collision position and warning rings stay fixed while only the artwork moves.
  ctx.translate(0,kind==='sentry'?recoil*size*.045:Math.sin(t*3.2)*size*.025);
  ctx.scale(1+pulse*breath+recoil*.07,1-pulse*breath-recoil*.08);
  if(winged)ctx.rotate(Math.sin(t*3)*.035);
  if(kind==='sentry'&&preferences.quality!=='low'){
   const glow=ctx.createRadialGradient(0,-h*.18,0,0,-h*.18,size*.45);glow.addColorStop(0,charge?'#ffd98b77':'#e8af5830');glow.addColorStop(1,'#ffb26000');ctx.fillStyle=glow;ctx.fillRect(-size,-size,size*2,size*2);
  }
  const strips=preferences.quality==='low'?8:16;
  const flap=winged?(dash?.62:.80+.20*Math.sin(t*(charge?13:9))):1;
  const fold=q=>winged&&q>.30?.30+(q-.30)*flap:q;
  for(let i=0;i<strips;i++){
   const u=i/strips,v=(i+1)/strips,q=(u+v)/2,edge=Math.pow(Math.abs(q-.5)*2,2);
   const offset=kind==='sentry'?Math.sin(t*(charge?8:2.3)+q*3)*edge*size*(charge?.035:.018):winged?Math.cos(t*9)*Math.max(0,q-.3)*size*.045:Math.sin(t*3-q*5)*edge*size*.02;
   ctx.drawImage(sheet,r[0]+u*r[2],r[1],r[2]/strips,r[3],-w/2+w*fold(u),-h/2+offset,w*(fold(v)-fold(u))+.35,h);
  }
  ctx.restore();
 }else if(hazardSprite.complete&&hazardSprite.naturalWidth)ctx.drawImage(hazardSprite,-size/2,-size/2,size,size);
}
function drawProjectile(p){KozaCombatFX.bolt(ctx,p.x,p.y,Math.atan2(p.vy,p.vx),reduced?0:clock,runRegion,.7,preferences.quality==='low');}

function noticeHeroLoading(){$('playLabel').textContent='Hazırlanıyor…';}

function heroMargin(){return window.KozaTopdown?.margin?.(profile.active,petState().star,heroVisual())||62;}
// The objective badge is placed from the measured HUD, not fixed offsets: phone
// fonts, text zoom and safe areas change the score/timer height. It moves down
// only when it would touch a HUD item that shares its horizontal span.
function placeMissionHud(){
 const hud=$('missionHud'),arena=$('arena');if(!hud||hud.hidden||mode==='home'||typeof arena?.getBoundingClientRect!=='function'||!hud.style)return;
 if(hud.style.top)hud.style.top='';
 const origin=arena.getBoundingClientRect().top,own=hud.getBoundingClientRect();if(!own||!own.width)return;
 let needed=0;
 for(const el of [document.querySelector?.('#hud .score'),$('timer'),$('hearts'),$('pause')]){
  const b=el?.getBoundingClientRect?.();if(!b||!b.height||!b.width)continue;
  if(b.right+6>own.left&&b.left-6<own.right)needed=Math.max(needed,b.bottom-origin+6);
 }
 if(needed>own.top-origin+.5)hud.style.top=Math.ceil(needed)+'px';
}
document.fonts?.ready?.then(()=>{if(mode!=='home')syncFieldBoundary();}).catch?.(()=>{});
function syncFieldBoundary(){placeMissionHud();if(camOn()){const top=hudFieldTop($('arena').clientHeight||H);fieldTop=0;$('arena').style.setProperty?.('--field-top',(KozaCamera.layout?.oy||top)+'px');if(camTop>=0&&Math.abs(top-camTop)>2){camForce=true;requestAnimationFrame(resize);}return;}const hud=$('missionHud'),bottom=(hud.offsetTop||0)+(hud.offsetHeight||0);fieldTop=Math.min(Math.max(82,bottom+6),Math.max(60,H*.35));$('arena').style.setProperty?.('--field-top',fieldTop+'px');}
function constrainHero(){const e=window.KozaTopdown?.edges?.(profile.active,petState().star,motion,heroVisual())||{left:40,right:40,top:40,bottom:40};const right=Math.max(W/2,W-e.right),left=Math.min(e.left,right),bottom=Math.max(H/2,H-e.bottom),top=Math.min(fieldTop+e.top,bottom);player.x=Math.max(left,Math.min(right,player.x));player.y=Math.max(top,Math.min(bottom,player.y));
 // v5.15: the arena JSON polygon is the authoritative boundary (plus blocked props).
 if(camOn())KozaCamera.confine(player,KozaCamera.heroRadius?KozaCamera.heroRadius(KozaHitbox.heroBody()*1.15):KozaHitbox.heroBody()*1.15);}

function addMasteryControls(){const id=profile.active,pet=profile.pets[id],m=KozaDepth.mastery(pet.mastery),ready=pet.points>=102;const section=document.createElement('section');section.className='mastery-panel';section.innerHTML='<h3>Uzmanlık</h3><p>'+(ready?'İki yolu da açabilirsin; aynı anda biri etkin. Açılan yollar arasında geçiş ücretsiz.':'Üç yıldızda açılır. Kahramanına yeni bir oyun tarzı seç.')+'</p>'+KozaDepth.options[id].map(o=>{const owned=m.unlocked.includes(o.id),selected=m.active===o.id;return '<button class="mastery-option '+(selected?'selected':'')+'" data-mastery="'+o.id+'" '+(!ready||selected||!owned&&profile.essence<40?'disabled':'')+'><span class="feature-icon i-'+o.icon+'" aria-hidden="true"></span><span><b>'+o.name+'</b><small>'+o.text+'</small><em>'+(selected?'Etkin':owned?'Seç':ready?'40 öz · Aç':'3 yıldız gerekli')+'</em></span></button>';}).join('');$('sheetContent').append(section);section.querySelectorAll('[data-mastery]').forEach(button=>button.onclick=()=>{if(mode!=='home'||!KozaDepth.unlock(profile,button.dataset.mastery))return;save();refresh();showUpgrade();sfx('upgrade');});}

if(window.KozaDeer3D)KozaDeer3D.onLost=()=>{KozaAdventure.notice('Yedek görsellerle devam ediliyor.');};
