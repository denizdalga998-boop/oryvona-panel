'use strict';
// The run modifiers are transient; rewards and records live in the profile.
window.KozaAdventure=(()=>{
 const noticeQueue=[];let noticeCurrent=null,noticeShownAt=-1; // QUALITY PASS message queue state (declared before reset())
 const abilities={lumi:{name:'Işık çağrısı',hint:'5 sn boyunca parıltıları uzaktan çek',cooldown:12},koru:{name:'Rüzgâr Akışı',hint:'Hareket ederken 2,2 sn hızlanır; yön tamamen sende',cooldown:8},pera:{name:'Kanat kalkanı',hint:'5 sn içinde bir darbeyi engelle',cooldown:14}};
 // QUALITY PASS skill tuning (data, before -> after): shield.recharge  none (single use) -> 10 s.  All other numbers unchanged:
 // magnet +30 px pickup radius, swift +15 % speed, slow x0.8 enemies/projectiles/boss clock, heal +1 life, bloom +2 essence on success.
 const TUNING=Object.freeze({shield:Object.freeze({recharge:10}),magnet:Object.freeze({radius:30}),swift:Object.freeze({speed:.15}),slow:Object.freeze({scale:.8}),bloom:Object.freeze({essence:2})});
 const powers={
 shield:{name:'Işık zırhı',description:'Bir darbeyi engeller; kırılınca 10 sn sonra yeniden dolar.',icon:'shield',badge:'Zırh hazır',notice:'Bir darbeye karşı korundun'},
 magnet:{name:'Işık çekimi',description:'Bu tur parıltıları daha uzaktan toplarsın.',icon:'magnet',badge:'Çekim güçlendi',notice:'Bu tur ışık çekimin güçlendi'},
 slow:{name:'Sakin akış',description:'Bu tur düşmanlar, mermiler ve koruyucu saldırıları %20 yavaşlar (hazırlık süresi uzar).',icon:'slow',badge:'Düşmanlar −%20',notice:'Bu tur düşmanlar %20 yavaşladı'},
 swift:{name:'Çevik adımlar',description:'Bu tur hareket hızını %15 artırır.',icon:'dash',badge:'Hız +%15',notice:'Bu tur hareket hızın %15 arttı'},
 heal:{name:'Can filizi',description:'Kaybettiğin bir canı geri getirir.',icon:'sprout',badge:'+1 can',notice:'Bir canını geri kazandın'},
 bloom:{name:'Öz bereketi',description:'Bu bölümü veya dalgayı geçersen +2 öz kazanırsın.',icon:'essence',badge:'Başarıda +2 öz',notice:'Başarı ödülüne +2 öz eklenecek'}
 };
 function offerPowers(health,previous='',rng=Math.random,excluded=[]){const pool=Object.keys(powers).filter(k=>(k!=='heal'||health<3)&&!(window.KOZA_K01&&k==='bloom')&&!excluded.includes(k));for(let i=pool.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}const offer=pool.slice(0,3);if(pool.length>3&&[...offer].sort().join(',')===previous)offer[2]=pool.find(k=>!offer.includes(k));const partner=KozaRunFlow.complement(excluded);if(partner&&pool.includes(partner)&&!offer.includes(partner))offer[2]=partner;return offer;}
 let previousOffer='';try{previousOffer=localStorage.getItem('koza-last-power-offer')||'';}catch{}
 let state;
 function reset(challenge=false){noticeQueue.length=0;noticeCurrent=null;window.KozaGameFeel?.clear?.();state={wardRecharge:0,choiceOpenedAt:0,challenge,challengeLight:0,challengeEssence:0,wave:1,cooldown:0,cooldownDuration:0,effectDuration:0,goalScore:null,noticePriority:0,bossPhase:0,ready:0,choiceGrace:0,relief:0,magnet:0,shield:0,ward:false,dash:0,dashX:0,dashY:0,flow:0,flowX:0,flowY:0,slow:0,bossEnding:null,lightClock:0,lightSerial:0,choice:false,offered:[],chosen:'',picks:[],choiceCount:0,encounterPhase:0,hits:0,choiceAt:12,boss:null,bossDone:false,bossMarks:0,revives:0,realSeconds:0,shieldBreak:0,powerPulse:0,readyPulse:0,specialLight:null};return state;}
 reset();
 // Q2 ONE-HAND: the hero's own ability fires by itself from the gameplay update (tick) - never from render, DOM or a
 // timer. Power cards stay the player's choice. ?manualAbility=1 keeps the old button/Space path for A/B QA only.
 const AUTO=!(typeof location!=='undefined'&&/[?&]manualAbility=1\b/.test(location.search));
 function canCast(){return mode==='play'&&!window.KozaEntrance?.active&&state.ready<=0&&state.cooldown<=0&&lives>0&&!(typeof settled!=='undefined'&&settled)&&!document.hidden;}
 // Koru: a dash only along the player's CURRENT stick direction, and only when most of the path is walkable for the
 // hero footprint (existing polygon / field bounds). Otherwise the ability stays READY and no cooldown is spent.
 function dashLength(){return 620*(KozaDepth.active(profile)==='focus'?.28:.20);}
 function walkable(x,y){const C=window.KozaCamera;if(C?.active?.()){const r=C.heroRadius?C.heroRadius(KozaHitbox.heroBody()):KozaHitbox.heroBody();return C.insideField(x,y,r);}return x>=40&&x<=W-40&&y>=fieldTop+40&&y<=H-40;}
 function dashClear(ux,uy){const len=dashLength(),n=8;let free=0;for(let i=1;i<=n;i++){if(!walkable(player.x+ux*len*i/n,player.y+uy*len*i/n))break;free++;}return free/n>=.75;}
 function cast(o={}){const hero=profile.active,a=abilities[hero];const mastery=KozaDepth.active(profile);state.cooldown=a.cooldown-(mastery==='flow'?(hero==='koru'?2:3):0);
  if(hero==='lumi')state.magnet=mastery==='focus'?7:5;
  if(hero==='pera')state.shield=mastery==='focus'?8:5;
  if(hero==='koru'){let dx=o.dx,dy=o.dy;if(!(Math.hypot(dx||0,dy||0)>.01)){const direction=KozaRunFlow.input(target,keys);dx=direction.dx;dy=direction.dy;}const d=Math.hypot(dx||0,dy||0);if(d>.01){state.flowX=dx/d;state.flowY=dy/d;}state.flow=mastery==='focus'?2.6:2.2;} /* Q3 Rüzgâr Akışı: never moves the hero by itself, no automatic invulnerability */
  state.cooldownDuration=state.cooldown;state.effectDuration=hero==='lumi'?state.magnet:hero==='pera'?state.shield:state.flow;state.powerPulse=1;
  state.castSerial=(state.castSerial||0)+1;state.castFx={hero,t:0,serial:state.castSerial};(state.castLog||(state.castLog=[])).push({t:+elapsed.toFixed(3),hero,auto:!!o.auto,cd:state.cooldown});if(state.castLog.length>40)state.castLog.shift();
  // One small, hero-specific cue per real cast; no toast for automatic casts (they repeat every 8-14 s).
  if(!o.auto&&hero!=='koru')notice(hero==='pera'?'Kalkan etkin':'Işık çağrısı',{kind:hero==='pera'?'shield':'power',detail:Math.ceil(state.effectDuration)+' sn · '+(hero==='pera'?'Bir darbeyi engeller':'Işıkları uzaktan çeker'),priority:2,duration:1.6});
  if(o.auto&&!state.autoIntroAt)state.autoIntroAt=state.realSeconds;
  sfx(hero==='lumi'?'abilityLumi':hero==='koru'?'abilityKoru':'abilityPera');window.KozaGameFeel?.cast?.(hero,state);
  window.KozaCloud?.event('ability',{hero,auto:!!o.auto});paint();
 }
 function ability(){if(AUTO||!canCast())return;cast({auto:false});} // manual path exists only in the ?manualAbility=1 A/B build
 function autoAbility(){
  if(!AUTO||state.cooldown>0){state.autoHold='';return false;}
  if(!canCast())return false;
  if(profile.active==='koru'){const d=KozaRunFlow.input(target,keys),m=Math.hypot(d.dx,d.dy);
   if(m<.2){if(state.autoHold!=='input')(state.autoHolds||(state.autoHolds={input:0,blocked:0})).input++;state.autoHold='input';return false;}
   const ux=d.dx/m,uy=d.dy/m; /* Q3: flow only speeds up what the joystick already does - no path check needed */
   state.autoHold='';cast({dx:ux,dy:uy,auto:true});return true;}
  state.autoHold='';cast({auto:true});return true;
 }
 function absorb(){if(state.shield<=0&&!state.ward)return false;if(state.shield>0)state.shield=0;else{state.ward=false;state.wardRecharge=TUNING.shield.recharge;}state.shieldBreak=.65;hitCD=Math.max(hitCD,KozaRunFlow.synergy(state.picks)?.id==='safe-return'?1.5:.7);burst(player.x,player.y,'#c6edff',16);sfx('shield');window.KozaGameFeel?.shieldBlock(player);notice('Darbe engellendi',{kind:'shield',detail:KozaRunFlow.synergy(state.picks)?.id==='safe-return'?'1,5 saniye koruma':'Kalkan seni korudu',priority:4,duration:1.7});return true;}
 // QUALITY PASS - one controlled message queue: a more urgent message replaces the current one immediately; others wait
 // their turn (max 3, duplicates dropped, stale low-priority items expire), so banners never stack or flicker.
 function showNotice(n){
  state.noticePriority=n.priority;noticeCurrent=n;noticeShownAt=clock;const box=$('toast');box.dataset.kind=n.kind;box.dataset.motion=reduced||!preferences.flash?'off':'on';
  $('noticeTitle').textContent=n.t;$('noticeDetail').textContent=n.detail;$('noticeDetail').hidden=!n.detail;
  $('noticeIcon').className='feature-icon i-'+({danger:'shield',warning:'challenge',success:'light',power:'sprout',shield:'shield',info:'insights'}[n.kind]||'insights');
  box.classList.remove('notice-arrival');void box.offsetWidth;box.classList.add('notice-arrival');toastUntil=clock+n.duration;
 }
 function notice(t,{kind='info',detail='',priority=1,duration=2.2}={}){
  const n={t,kind,detail,priority,duration,at:clock};
  if(clock<toastUntil){
   if(noticeCurrent?.t===t||noticeQueue.some(q=>q.t===t))return false;
   if(priority>state.noticePriority&&(priority>=5||clock-noticeShownAt>.3)){showNotice(n);return true;}
   noticeQueue.push(n);noticeQueue.sort((x,y)=>y.priority-x.priority||x.at-y.at);if(noticeQueue.length>3)noticeQueue.length=3;return true;
  }
  showNotice(n);return true;
 }
 function pumpNotices(){if(clock<toastUntil||!noticeQueue.length)return;while(noticeQueue.length){const n=noticeQueue.shift();if(n.priority>=4||clock-n.at<4){showNotice(n);return;}}}
 // Live, concrete effect of each option (real values of this run / hero).
 function effectLine(k){const base=Progress.stats(profile).radius+(hasPower('magnet')?TUNING.magnet.radius:0);
  return k==='magnet'?'Toplama alanı '+base+' → '+(base+TUNING.magnet.radius)+' (+%'+Math.round(TUNING.magnet.radius/base*100)+')':k==='swift'?'Hız '+Math.round(Progress.stats(profile).speed*(hasPower('swift')?1.15:1))+' → '+Math.round(Progress.stats(profile).speed*1.15):k==='slow'?'Düşman hızı %100 → %80 · koruyucu hazırlığı ×1,25':k==='shield'?'1 darbeyi engeller · '+TUNING.shield.recharge+' sn’de yenilenir':k==='heal'?'Can '+lives+' → '+Math.min(3,lives+1):'Başarı ödülü +'+TUNING.bloom.essence+' öz';}
 function choose(){const plan=KozaRunFlow.choiceSchedule(runMission);if(mode!=='play'||state.choiceCount>=plan.limit)return;$('powerDescription').textContent=window.KOZA_K01?'Yalnız bu dalga için: dalga bitince kart etkisi sıfırlanır. Seçerken oyun durur.':plan.limit===1?'Bu tur bir güç seç. Seçerken oyun durur.':state.choiceCount?'İlk gücün: '+powers[state.picks[0]].name+(KozaRunFlow.complement(state.picks)?'. Uyumlu bir güç seçerek ek etki açabilirsin.':'. İkinci güç bu tur ona eklenir.'):'İki güç seçme fırsatın var. Seçerken oyun durur.';state.offered=offerPowers(lives,previousOffer,Math.random,state.picks);$('powerTitle').textContent=plan.limit===1?'Gücünü seç':state.choiceCount===0?'İlk gücünü seç':'İkinci gücünü seç';previousOffer=[...state.offered].sort().join(',');try{localStorage.setItem('koza-last-power-offer',previousOffer);}catch{}$('powerOptions').innerHTML=state.offered.map(k=>{const p=powers[k],link=KozaRunFlow.synergy([...state.picks,k]);return '<button data-power="'+k+'"'+(link?' class="power-match"':'')+'><span class="feature-icon i-'+p.icon+'" aria-hidden="true"></span><span class="power-copy"><small class="power-role">'+KozaRunFlow.roles[k]+'</small><b>'+p.name+'</b><span>'+p.description+'</span><i class="power-effect">'+effectLine(k)+'</i>'+(link?'<em class="power-synergy">'+link.name+' · '+link.description+'</em>':'')+'</span></button>';}).join('');$('powerOptions').querySelectorAll('[data-power]').forEach((b,i)=>{b.style.setProperty('--i',i);
  // Q2: a pick needs a NEW press on that same card after the modal opened (the joystick finger lifting over a card, or a
  // click synthesized from an old touch, never picks); keyboard activation (detail 0) is allowed; 320 ms guard kept.
  b.onpointerdown=()=>{if(mode==='choice')state.choiceDown=b.dataset.power;};
  b.onclick=e=>{if(mode!=='choice'||state.choicePending||performance.now()-state.choiceOpenedAt<320)return;if(e.detail!==0&&state.choiceDown!==b.dataset.power)return;pickCard(b);};});
 state.choiceDown=null;state.choicePending=null;$('powerOptions').classList.remove('committed');
 state.choice=true;mode='choice';state.choiceOpenedAt=performance.now();freezeSnapshot();if(state.picks.length&&$('powerDescription'))$('powerDescription').textContent='Bu turda seçtiğin: '+state.picks.map(k=>powers[k].name).join(' + ')+'. Yeni güç ona eklenir; oyun seçim bitene kadar durur.';release();keys={};window.KozaAudio.setMode('choice');window.KozaAudio.start();sfx('choiceOpen');$('powerChoice').showModal();{const t=$('powerTitle');if(t){t.tabIndex=-1;t.focus({preventScroll:true});}} /* no card looks pre-selected */window.KozaCloud?.event('power_offer',{offered:[...state.offered]});}
 function applyChoice(kind,o={}){if(mode!=='choice'||state.choicePending||!state.offered.includes(kind))return false;if(state.picks.includes(kind))return false;state.chosen=kind;state.picks.push(kind);state.choiceCount++;state.choiceAt=KozaRunFlow.choiceSchedule(runMission).at[state.choiceCount]??Infinity;state.powerPulse=1.2;if(kind==='shield')state.ward=true;if(kind==='slow')state.slow=999;if(kind==='heal'){lives=Math.min(3,lives+1);burst(player.x,player.y,'#c8efb0',14);updateHUD();}sfx(kind==='heal'?'heal':'pick');window.KozaGameFeel?.power(kind,player);if(kind==='heal')window.KozaGameFeel?.heal(player);state.choice=false;state.choiceCommitted=(state.choiceCommitted||0)+1;
  if(o.defer){const token=state.choicePending=kind+':'+state.choiceCount;setTimeout(()=>{if(mode==='choice'&&state.choicePending===token)closeChoice(kind);},200);return true;}
  closeChoice(kind);return true;}
 function closeChoice(kind){state.choicePending=null;$('powerChoice').close();mode='play';try{render(0);}catch{} /* draw the live scene before the frozen copy goes away (no blank frame) */hideSnapshot();hitCD=Math.max(hitCD,.85);state.choiceGrace=.85;state.relief=runMission.boss?0:2.2;spawnClock=0;last=performance.now();window.KozaAudio.setMode('play');window.KozaAudio.start();const link=KozaRunFlow.synergy(state.picks);notice(link?link.name+' açıldı':powers[kind].name,{kind:'power',detail:link?link.description:powers[kind].description,priority:2,duration:2.5});window.KozaCloud?.event('power_pick',{kind});paint();}
 function pickCard(b){const kind=b.dataset.power;if(!applyChoice(kind,{defer:true,fromCard:true}))return;b.classList.add('picked');$('powerOptions').classList.add('committed');}
 // Frozen scene behind the card panel: ONE copy of the last frame, blurred once by CSS; the live canvas is not redrawn
 // while choosing. Quality 'low' or no CSS filter support -> the same copy, only dimmed.
 function freezeSnapshot(){const snap=$('choiceSnap'),src=window.canvas||document.getElementById('canvas');if(!snap||!src?.getBoundingClientRect)return;try{const r=src.getBoundingClientRect(),k=preferences.quality==='low'?.5:.75;snap.width=Math.max(1,Math.round(src.width*k));snap.height=Math.max(1,Math.round(src.height*k));snap.getContext('2d').drawImage(src,0,0,snap.width,snap.height);Object.assign(snap.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});const blur=preferences.quality!=='low'&&!!window.CSS?.supports?.('filter','blur(2px)');snap.classList.toggle('no-blur',!blur);snap.hidden=false;state.snapshotAt=performance.now();}catch{snap.hidden=true;}}
 function hideSnapshot(){const snap=$('choiceSnap');if(snap)snap.hidden=true;}
 function startBoss(){state.boss=KozaBossPatterns.create(runMission.number,runRegion,W,H,fieldTop);{const st=window.KozaCamera?.active?.()?KozaCamera.arena?.spec?.start?.boss:null;if(st){const f=KozaCamera.toField(st[0],st[1]),b=state.boss;b.x=f.x;b.y=f.y;if(b.origin){b.origin.x=f.x;b.origin.y=f.y;}b.previousY=b.y;}}hazards=[];orbs=[];/* Q2: the guardian's name/intro lives in its own bar (no toast over the boss or its telegraphs) */state.bossIntro=2.6;state.bossEnding=null;state.lightClock=0;state.lightSerial=0;state.boss.phaseIdx=0;state.bossPhase=0;window.KozaCombatFX?.warm?.();window.KozaGameFeel?.bossIntro(state.boss);}
 // Q3 encounter clock: 0 EARLY (readable) / 1 MID (combined) / 2 LATE (strongest, fair)
 function encPhase(){const p=Math.min(1,elapsed/Math.max(1,runMission.duration));return p<.34?0:p<.68?1:2;}
 // Golden lights: optional risk/reward. Every third one tempts (close to the guardian, worth 2); the others are safe, a
 // few steps away from the hero. Each fades after its time so the arena never fills up. Nothing here touches the boss.
 function goldSpot(b,risky){const C=window.KozaCamera,on=!!C?.active?.(),k=on?C.px(1):50,s=on?C.sin:1;
  for(let i=0;i<18;i++){let x,y;if(risky){const a=Math.atan2(player.y-b.y,(player.x-b.x))+(Math.random()-.5)*2.2,r=b.r+k*(1.15+Math.random()*.9);x=b.x+Math.cos(a)*r;y=b.y+Math.sin(a)*r*s;}
   else{const a=Math.random()*Math.PI*2,r=k*(2+Math.random()*2.6);x=player.x+Math.cos(a)*r;y=player.y+Math.sin(a)*r*s;}
   const o={x,y};if(on){C.confine(o,26);if(!C.insideField(o.x,o.y,18))continue;}else{o.x=Math.max(40,Math.min(W-40,o.x));o.y=Math.max(fieldTop+40,Math.min(H-60,o.y));}
   const gap=Math.hypot(o.x-b.x,(o.y-b.y)/s)-b.r;if(gap<k*(risky?.9:2.1))continue;if(Math.hypot(o.x-player.x,(o.y-player.y)/s)<k*(risky?.6:1.2))continue;
   if(orbs.some(q=>q.bossMark&&Math.hypot(q.x-o.x,(q.y-o.y)/s)<k*1.4))continue;return o;}
  return null;}
 function bossLights(b,dt){for(let i=orbs.length-1;i>=0;i--){const o=orbs[i];if(!o.bossMark)continue;o.age=(o.age||0)+dt;if(o.age>(o.ttl||9))orbs.splice(i,1);}
  if(state.bossIntro>0)return;state.lightClock+=dt;const P=b.phaseIdx|0,every=[3.6,3.2,2.8][P];if(state.lightClock<every)return;state.lightClock=0;
  if(orbs.filter(o=>o.bossMark).length>=[2,3,3][P])return;state.lightSerial++;const risky=state.lightSerial%3===0,o=goldSpot(b,risky);
  if(o)orbs.push({x:o.x,y:o.y,r:11,phase:state.lightSerial,bossMark:true,risky,gain:risky?2:1,ttl:risky?7:9,age:0});}
 // Survival reached: no new attack starts; a wind-up that has not fired is cancelled (its telegraph fades); an attack already
 // in flight finishes but can no longer hurt. Then the guardian settles (calm) and the stage completes normally.
 function beginBossEnding(b){state.bossEnding={t:0,stage:'finish'};b.ending=true;if(b.charge>0){b.charge=0;b.zones=[];b.attack=0;if(b.index===3)b.skill='';}
  hitCD=Math.max(hitCD,1.5);for(const h of hazards){if(!h.exiting){h.exiting=true;h.exitT=0;}}projectiles=[];state.specialLight=null;for(let i=orbs.length-1;i>=0;i--)if(orbs[i].special)orbs.splice(i,1);}
 function bossOutro(b,dt){const E=state.bossEnding;E.t+=dt;hitCD=Math.max(hitCD,.5);
  if(E.stage==='finish'){KozaBossPatterns.tick(b,dt,player,W,H,fieldTop,orbs,1);bossEvents(b);
   if((!(b.action>0)&&!(b.charge>0))||E.t>4.5){E.stage='calm';E.t=0;b.action=0;b.charge=0;b.zones=[];if(b.bolts)b.bolts=[];state.bossDone=true;sfx('bossClear');window.KozaGameFeel?.victory?.(b);
    notice('Koruyucu sakinleşti',{kind:'success',detail:'Hayatta kaldın · Ödüllerin hazır',priority:5,duration:2.6});}}
  else{KozaBossPatterns.calm(b,dt,player,W,H,fieldTop);
   for(const o of orbs)if(o.bossMark){o.ttl=99;const d=Math.hypot(player.x-o.x,player.y-o.y);if(d>1){const v=Math.min(d,(160+E.t*260)*dt);o.x+=(player.x-o.x)/d*v;o.y+=(player.y-o.y)/d*v;}}
   if(E.t>=2.6&&mode==='play'){projectiles=[];finish(true);}}}
 function collect(o){if(!o.bossMark||o.claimed)return false;o.claimed=true;state.bossMarks++;state.goldGain=(state.goldGain||0)+(o.gain||1);return true;} // Q3: golden light = reward only
 // Reachable, fair placement: inside the hero's movement bounds, 110-240 px from
 // the hero, away from enemies, boss body and boss lights. Deterministic scoring.
 function specialSpot(){
  const m=Math.max(40,heroMargin()),left=m,right=Math.max(m,W-m),top=Math.min(fieldTop+m,H-m),bottom=Math.max(top,H-Math.max(m,96)),b=state.boss;
  let best=null,bestScore=-Infinity;
  for(let gx=0;gx<=6;gx++)for(let gy=0;gy<=6;gy++){
   const x=left+(right-left)*gx/6,y=top+(bottom-top)*gy/6,d=Math.hypot(x-player.x,y-player.y);
   const enemy=Math.min(999,...hazards.map(h=>Math.hypot(h.x-x,h.y-y))),bossGap=b?Math.hypot(b.x-x,b.y-y)-b.r:999,lights=Math.min(999,...orbs.filter(o=>o.bossMark).map(o=>Math.hypot(o.x-x,o.y-y)));
   if(bossGap<50||enemy<70)continue;
   const score=-Math.abs(d-170)+Math.min(enemy,200)*.4+Math.min(bossGap,200)*.3+Math.min(lights,120)*.1;
   if(score>bestScore){bestScore=score;best={x,y};}
  }
  return best||{x:W/2,y:(top+bottom)/2};
 }
 function spawnSpecialLight(){
  const spot=specialSpot(),o={x:spot.x,y:spot.y,r:12,phase:0,special:true,age:0};
  state.specialLight=o;orbs.push(o);
  notice('Sarı ışık belirdi',{kind:'power',detail:'Topla ve bir güç seç',priority:3,duration:1.8});
  sfx('special');window.KozaGameFeel?.special(o);
 }
 // After 9 s the light drifts gently toward the hero so it can never be missed
 // behind hazards or at the edge; it stays inside the field.
 function driftSpecialLight(dt){
  const o=state.specialLight;if(!orbs.includes(o)){state.specialLight=null;return;}
  o.age+=dt;if(o.age<9)return;
  const d=Math.hypot(player.x-o.x,player.y-o.y);if(d<1)return;
  const v=Math.min(d,45*dt);o.x+=(player.x-o.x)/d*v;o.y+=(player.y-o.y)/d*v;
 }
 // Called by the game loop when the hero touches the special light.
 function claimSpecial(o){
  if(!o?.special||state.specialLight!==o)return false;
  state.specialLight=null;burst(o.x,o.y,'#ffe98a',preferences.quality==='low'?8:18);sfx('specialTake');
  choose();return true;
 }
 // One short, restrained cue when the hero ability becomes available again:
 // a single pulse on the button, one expanding ring at the hero, a soft chime.
 function readyCue(){
  state.readyPulse=.7;
  const button=$('ability');if(button?.classList){button.classList.remove('ready-pulse');void button.offsetWidth;button.classList.add('ready-pulse');}
  sfx('abilityReady');
 }
 function bossEvents(b){ // QUALITY PASS: attack sound/feedback from explicit attack events, once per attack id (frame-rate independent)
 const list=b.events;if(!list?.length)return;b.events=[];state.bossSeen??=new Set();
 for(const e of list){const key=e.id+':'+e.name;if(state.bossSeen.has(key))continue;state.bossSeen.add(key);if(state.bossSeen.size>64)state.bossSeen=new Set([...state.bossSeen].slice(-32));
  if(e.name==='windup')sfx('windup',{base:b.index===2?180:b.index===3?90:120});
  else if(e.name==='release')sfx('release',{fire:e.skill==='flyfire'||e.skill==='breath'||b.index===3});
  else if(e.name==='impact'){sfx('impact');window.KozaGameFeel?.impact(b,e);}
  else if(e.name==='volley')sfx('release',{fire:false});
 }}
 function tick(dt){state.realSeconds+=dt;const cooling=state.cooldown>0;if(state.wardRecharge>0){state.wardRecharge=Math.max(0,state.wardRecharge-dt);if(!state.wardRecharge&&hasPower('shield')){state.ward=true;sfx('shieldReady');window.KozaGameFeel?.wardReady(player); /* Q2: shown by the HUD shield mark + a local ring, no toast */}}for(const k of ['cooldown','magnet','shield','dash','flow','shieldBreak','powerPulse','choiceGrace','relief','readyPulse','bossIntro'])if(state[k]>0&&state[k]<900)state[k]=Math.max(0,state[k]-dt);
  if(state.cooldown===0&&!autoAbility()&&cooling)readyCue(); // Q2: auto cast first; a ready cue only when it waits (Koru without input / blocked path)
  // v5.13: a due power choice first appears as a special yellow light in the arena;
  // collecting it opens the existing three-power choice (see claimSpecial).
  if(!state.specialLight&&KozaRunFlow.choiceDue(runMission,state,elapsed))spawnSpecialLight();
  if(state.specialLight)driftSpecialLight(dt);const phase=KozaDepth.phase(elapsed,runMission.duration);if(!runMission.boss&&phase!==state.encounterPhase){state.encounterPhase=phase;if(phase===2)notice(window.KOZA_K01?'Akış yoğunlaştı':'Son dalga',{kind:'warning',detail:'Hareketi sürdür · Açık alana yönel',priority:3,duration:2.3});}
  if(runMission.boss&&!state.boss&&!state.bossDone&&elapsed>=.5)startBoss();
  const b=state.boss;if(b){ /* Q3: SURVIVE + EVADE + COLLECT LIGHT - the encounter clock drives the phase; light never touches the guardian */
   if(!state.bossEnding){const P=encPhase();if(P!==b.phaseIdx){b.phaseIdx=P;state.bossPhase=P;if(P>0){notice(P===1?'Koruyucu hızlanıyor':'Son evre',{kind:'warning',detail:P===1?'Saldırılar birleşiyor · Boşlukları izle':'En güçlü saldırılar · Az kaldı, dayan!',priority:3,duration:2.2});sfx('bossPhase');window.KozaGameFeel?.phase?.(b,P);}}
    if(elapsed>=runMission.duration)beginBossEnding(b);}
   if(state.bossEnding)bossOutro(b,dt);
   else{const danger=KozaBossPatterns.tick(b,dt,player,W,H,fieldTop,orbs,state.slow>0?.8:1);bossEvents(b);if(danger)damagePlayer();if(mode==='play'){if(b.bodyDanger!==false&&Math.max(b.altitude||0,b.index===2?(b.lift||0):0)<12&&b.age>1.2&&Math.hypot(player.x-b.x,player.y-b.y)<KozaHitbox.boss.body(b))damagePlayer();if(mode==='play')bossLights(b,dt);}}}

  paint();
 }
 const paintCache={};
 function paint(){
  const button=$('ability');if(!button)return;
  const status=KozaRunFlow.abilityStatus(profile.active,state),a=abilities[profile.active],hint=a.hint;
  // Q2: in the normal build this is a PASSIVE readout (no tap, no pointer capture); only the A/B build keeps a button.
  if(paintCache.auto!==AUTO){paintCache.auto=AUTO;button.dataset.auto=String(AUTO);if(AUTO){button.tabIndex=-1;button.setAttribute('aria-disabled','true');$('abilityDock')?.classList?.add('auto');}}
  if(!AUTO){const disabled=state.cooldown>0||state.ready>0||mode!=='play';if(paintCache.disabled!==disabled){paintCache.disabled=disabled;button.disabled=disabled;}}
  {const hold=AUTO&&status.phase==='ready'?(state.autoHold||''):'';if(paintCache.hold!==hold){paintCache.hold=hold;button.dataset.hold=hold;}
   const intro=AUTO&&(state.realSeconds<6||state.autoIntroAt!=null&&state.realSeconds-state.autoIntroAt<3.5);if(paintCache.intro!==intro){paintCache.intro=intro;button.classList?.toggle?.('auto-intro',intro);}}
  if(paintCache.hero!==profile.active){paintCache.hero=profile.active;$('abilityIcon').className='feature-icon i-'+({lumi:'magnet',koru:'dash',pera:'wing'}[profile.active]);$('abilityLabel').textContent=a.name;}
  const statusText=status.phase==='active'?(profile.active==='koru'?'Akış · '+Math.ceil(status.seconds)+' sn':'Etkin · '+Math.ceil(status.seconds)+' sn'):status.phase==='cooldown'?(AUTO?'Doluyor · ':'Hazırlanıyor · ')+Math.ceil(status.seconds)+' sn':AUTO&&state.autoHold==='input'?'Hareketle başlar':AUTO&&state.autoHold==='blocked'?'Yol açılınca':AUTO?'Otomatik':'Hazır';
  if(paintCache.status!==statusText){paintCache.status=statusText;$('abilityStatus').textContent=statusText;}
  if(paintCache.phase!==status.phase){paintCache.phase=status.phase;button.dataset.phase=status.phase;}
  const meter=Math.round(status.ratio*20)/20;
  if(paintCache.meter!==meter){paintCache.meter=meter;$('abilityMeter').style.transform='scaleX('+meter+')';button.style.setProperty?.('--cd',String(meter));}{const num=status.phase==='ready'?'':String(Math.ceil(status.seconds));if(paintCache.num!==num){paintCache.num=num;button.dataset.count=num;}}
  const label=a.name+(AUTO?' (otomatik)':'')+'. '+hint+'. '+statusText;
  if(paintCache.label!==label){paintCache.label=label;button.setAttribute('aria-label',label);}
  const badgeKey=state.picks.join(',')+'|'+state.chosen+'|'+state.ward;
  if(paintCache.badge!==badgeKey){
   paintCache.badge=badgeKey;const badge=$('runPowerBadge'),selected=state.picks.length?state.picks:[state.chosen].filter(Boolean),active=selected.filter(k=>k!=='heal'&&(k!=='shield'||state.ward));
   badge.hidden=!active.length;badge.setAttribute('aria-label',active.map(k=>powers[k].badge).join(' · '));badge.innerHTML=active.map(k=>'<span class="feature-icon i-'+powers[k].icon+'" title="'+powers[k].badge+'" aria-hidden="true"></span>').join('');
  }
  const hintText=state.challenge?window.KOZA_K01?'Dalga '+state.wave+' / 6':'Dalga '+state.wave+' · Rekor '+profile.challenge.best:state.boss?'Koruyucu · süre dolana kadar dayan':state.shield>0||state.ward?'Kalkan hazır':state.magnet>0?'Işık çekimi etkin':state.slow>0?'Düşmanlar yavaşladı':hint;
  if(paintCache.hint!==hintText){paintCache.hint=hintText;$('abilityHint').textContent=hintText;}
 }
 function draw(){const b=state.boss;if(b){KozaBossPatterns.draw(ctx,b);drawBoss();}window.KozaPowerFX?.under(ctx,state,motion,player,reduced,preferences.quality);}
 // v5.15 world pass: ground-level patterns first, the guardian itself depth-sorted.
 function drawUnder(){const b=state.boss;if(b)KozaBossPatterns.draw(ctx,b);window.KozaPowerFX?.under(ctx,state,motion,player,reduced,preferences.quality);}
 function drawBoss(){const b=state.boss;if(!b)return;if(!window.KozaDeer3D?.draw(ctx,b,reduced,preferences.quality==='low')&&groveSheet.complete&&groveSheet.naturalWidth)KozaBossVisuals.draw(ctx,b,groveSheet,KozaGroveAtlas,reduced,preferences.quality==='low');if(b.index===3)window.KozaCombatFX?.boss(ctx,b,'over');}
 function challengeMission(wave){const m=Expedition.level('grove',Math.min(20,Math.max(1,wave)));return {...m,boss:false,name:'Meydan okuma · '+wave,number:wave,id:'gather',target:8+Math.min(18,wave*2),duration:35,interval:Math.max(.95,m.interval-wave*.035),speed:m.speed+Math.min(70,wave*3),maxHazards:Math.min(10,4+Math.floor(wave/2)),bonus:0,wind:0};}
 function challengeOpen(){return Expedition.unlocked(profile,'grove')&&profile.campaign.grove.every(x=>x>0);}
 function startChallenge(){if(mode!=='home'||!challengeOpen())return;window.kozaStartChallenge=true;begin();}
 function endChallenge(){const wave=state.wave,won=lives>0&&score>=runMission.target;if(won){const essenceReward=3+(hasPower('bloom')?2:0);const lightReward=Math.floor(score/3)+4+Math.min(12,wave);profile.coins+=lightReward;profile.essence+=essenceReward;state.challengeLight+=lightReward;state.challengeEssence+=essenceReward;profile.challenge.best=Math.min(999,Math.max(profile.challenge.best,wave));save();state.wave++;runMission=challengeMission(state.wave);elapsed=0;time=runMission.duration;score=0;maxCombo=0;combo=0;hazards=[];projectiles=[];orbs=Array.from({length:8},randomOrb);missionAwarded=false;state.goalScore=null;state.ready=0;state.choiceGrace=.85;state.relief=2.2;hitCD=Math.max(hitCD,.85);release();keys={};state.choice=false;state.offered=[];state.choiceAt=12;state.chosen='';state.picks=[];state.choiceCount=0;state.encounterPhase=0;state.hits=0;state.ward=false;state.shield=0;state.magnet=0;state.slow=0;state.cooldown=0;lives=Math.min(3,lives+1);spawnClock=0;notice('Dalga '+wave+' tamamlandı · +'+essenceReward+' öz');return true;}return false;}
 function hasPower(k){return state.picks.includes(k)||state.chosen===k;}
 return {closeChoice,hideSnapshot,get auto(){return AUTO;},autoAbility,dashClear,pumpNotices,TUNING,claimSpecial,spawnSpecialLight,hasPower,get state(){return state;},abilities,powers,offerPowers,reset,ability,absorb,choose,applyChoice,tick,paint,draw,drawUnder,drawBoss,collect,challengeMission,challengeOpen,startChallenge,endChallenge,notice};
})();
