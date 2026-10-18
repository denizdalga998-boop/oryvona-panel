'use strict';
// KOZA — GAMEPLAY SCALE TEST V2 (experimental branch). Light-collection support for larger arenas + on-screen build label.
// Active only on wide (Map 1) arenas and only while the LIGHT switch is "v2" (KozaCamera.v2.light). With LIGHT = old, every
// function here returns early and the v5.16 / Map 1 integration behaviour is unchanged.
//   A. combat-bubble light spawn   B. moderate light magnet   C. subtle off-screen light cue   D. wave-end light vacuum
// Plus two spacing aids for the larger world (same KOZA rules, no new content): lights / shadows that were left far behind
// (off screen, far away, old) quietly retire so the refill brings them back near the fight.
// MAP 1 SCALE ROLLOUT REVIEW: the same support now runs on all five Map 1 arenas, plus the rollout encounter tuning (switch
// ENCOUNTERS = ROLLOUT / V2, URL &enc=): more lights (cap 10, refill 0.65 s, ~45 % placed ahead of a moving Lumi), denser normal
// stages (enemy cap x1.6 <= 10, spawn interval x0.6, far shadows retire at 6.5 wu and are replaced at once, multi-angle arrivals) and a small boss-stage
// escort of EXISTING shadow types (cap 2-3, every 4.5 s, never during a boss telegraph). Boss golden lights are unchanged in number.
window.KozaScaleV2=(()=>{
 const C=()=>window.KozaCamera;
 const ENC=Object.freeze({orbCap:10,orbEvery:.65,forwardShare:.45,forwardMin:2.4,forwardMax:4.4,hazardMul:1.6,hazardCap:10,intervalMul:.6,retireWu:6.5,
  escortEvery:4.5,escortFirst:5,escorts:Object.freeze({5:{cap:2,kinds:['drift']},10:{cap:2,kinds:['drift','cross']},15:{cap:3,kinds:['zigzag','drift']},20:{cap:3,kinds:['cross','zigzag']}})});
 const stats={runs:0,recycled:0,retired:0,vacuums:[],cues:{frames:0,max:0},magnetPulls:0,orbs:0,forward:0,escorts:0,escortKinds:{}};
 const ro=()=>!!(C()?.encRollout?.()&&C()?.isV2Arena?.()); // rollout tuning: scaled arenas only (CURRENT stays the old reference)
 let escortClock=0,escortKind=null,escortSerial=0,heading=null,lastP=null;
 // escorts reuse the regular spawn path (addHazard -> planSpawn); only the picked kind is forced while one is being added
 function wrapPattern(){if(!window.KozaDepth||KozaDepth.pattern.__ro)return;const base=KozaDepth.pattern;KozaDepth.pattern=function(){return escortKind||base.apply(this,arguments);};KozaDepth.pattern.__ro=true;}
 // Boss stages: escorts are drawn with KOZA's existing 2D enemy sprites. The shared 3D renderer would otherwise switch between
 // "boss" and "enemies" mode every frame (resize + texture re-upload: ~400-800 ms frames measured). Normal stages keep 3D enemies.
 function wrapEnemy3D(){const E=window.KozaEnemies3D;if(!E||E.prepareFrame.__ro)return;const base=E.prepareFrame;E.prepareFrame=function(){if(typeof runMission!=='undefined'&&runMission?.boss)return false;return base.apply(this,arguments);};E.prepareFrame.__ro=true;}
 // run-start tuning of the mission object (restored from its base values whenever the switch / arena says otherwise)
 function tune(m){if(!m)return;m._base??={maxHazards:m.maxHazards,interval:m.interval};const b=m._base;const c=C();
  if(ro()&&c?.isV2Arena?.()&&!m.boss){m.maxHazards=Math.min(ENC.hazardCap,Math.round(b.maxHazards*ENC.hazardMul));m.interval=+(b.interval*ENC.intervalMul).toFixed(3);}else{m.maxHazards=b.maxHazards;m.interval=b.interval;}
  escortClock=0;escortSerial=0;heading=null;lastP=null;}
 const orbPace=()=>ro()&&on()&&typeof runMission!=='undefined'&&runMission&&!runMission.boss?{every:ENC.orbEvery,cap:ENC.orbCap}:null;
 let lastPhase=null,lastRelief=false,lastElapsed=0,runKey=null,activeVac=null;
 const on=()=>{const c=C();return !!(c&&c.active?.()&&c.isWide?.()&&c.testArena?.()&&c.v2?.light==='v2');}; // Main + Boss05 only
 const k=()=>C().px(1),sin=()=>C().sin;let K=50;
 const wd=(ax,ay,bx,by)=>Math.hypot(ax-bx,(ay-by)/sin())/k(); // world distance (wu) between two field-px points
 // A. combat-bubble spawn. Authored layouts (trail / ring / clusters) keep their shape but are laid out inside the visible
 // combat window (never over the whole large world); free lights appear 1.1-3.6 wu around Lumi, inside the floor.
 function orb(){
  if(!on()||typeof runMission==='undefined'||!runMission)return null;
  K=k();const c=C(),L=c.V2.light,i=orbIndex++,m=runMission,win=c.combatWindow(),o={x:player.x,y:player.y,r:6+Math.random()*2,phase:Math.random()*6,born:elapsed,v2:true};
  if(win&&['trail','ring','clusters'].includes(m.layout)){
   const pad=Math.min(win.w*.12,K*.9),x0=win.x0+pad,w=win.w-2*pad,y0=win.y0+pad,h=win.h-2*pad;
   if(m.layout==='trail'){const cols=[.2,.4,.6,.8,.8,.6,.4,.2];o.x=x0+w*cols[i%8];o.y=y0+h*(.2+.55*(Math.floor(i/8)%2));}
   else if(m.layout==='ring'){const a=i*Math.PI/4;o.x=x0+w/2+Math.cos(a)*w*.3;o.y=y0+h*.5+Math.sin(a)*h*.34;}
   else{const ce=Math.floor(i/4)%3;o.x=x0+w*[.25,.75,.5][ce]+Math.cos(i*2)*24;o.y=y0+h*[.24,.55,.8][ce]+Math.sin(i*2)*24;}
  }else{let p=null;
   if(ro()&&heading&&Math.random()<ENC.forwardShare){for(let t=0;t<16&&!p;t++){const a=heading+(Math.random()-.5)*1.2,r=ENC.forwardMin+Math.random()*(ENC.forwardMax-ENC.forwardMin),q={x:player.x+Math.cos(a)*r*K,y:player.y+Math.sin(a)*r*K*sin()};if(c.insideField(q.x,q.y,26))p=q;}if(p)stats.forward++;}
   p=p||c.randomNear(player.x,player.y,L.bubbleMin,L.bubbleMax,26)||c.randomInView(Math.random,26);if(p){o.x=p.x;o.y=p.y;}}
  stats.orbs++;c.confine(o,22);return o;
 }
 function resetRun(){lastPhase=null;lastRelief=false;activeVac=null;stats.runs++;}
 // B + D + spacing aids, once per simulation step (before the regular pickup loop).
 function lights(dt){
  if(mode==='play'&&typeof runMission!=='undefined'&&runMission?.boss&&ro()&&C()?.isV2Arena?.()){K=k();escorts(dt);} // boss escort: independent of the LIGHT switch
  if(!on()||mode!=='play'||typeof runMission==='undefined')return;
  const c=C(),L=c.V2.light;K=k();const key=runMission.number+':'+(c.arena?.id||'');
  if(key!==runKey||elapsed<lastElapsed){runKey=key;resetRun();}lastElapsed=elapsed;
  // movement heading (world bearing, smoothed) for the rollout "lights ahead" placement
  if(lastP){const dx=player.x-lastP.x,dy=(player.y-lastP.y)/sin(),sp=Math.hypot(dx,dy)/Math.max(dt,1e-3)/K;if(sp>.8){const a=Math.atan2(dy,dx);heading=heading===null?a:Math.atan2(Math.sin(heading)*.8+Math.sin(a)*.2,Math.cos(heading)*.8+Math.cos(a)*.2);}else if(sp<.2)heading=null;}lastP={x:player.x,y:player.y};
  const statR=Progress.stats(profile).radius+(KozaAdventure.hasPower('magnet')?30:0)+(KozaAdventure.state.magnet>0?65:0),R=L.magnetWu*K;
  // D. wave boundary = KOZA's own rhythm phases (Işıkları topla -> Akış hızlanıyor -> Son dalga).
  if(!runMission.boss){
   const ph=KozaDepth.phase(elapsed,runMission.duration),relief=KozaAdventure.state.relief>0;
   if(lastPhase!==null&&ph!==lastPhase){ // cleanup only: lights that were MISSED (off screen, older than 4 s), at most 3 per wave
    let n=0;const miss=orbs.filter(o=>!o.special&&!o.bossMark&&!o.vac&&elapsed-(o.born??elapsed)>=L.vacuumAge&&!c.onScreen(o.x,o.y,-8)).sort((a,b)=>wd(a.x,a.y,player.x,player.y)-wd(b.x,b.y,player.x,player.y)).slice(0,L.vacuumMax);for(const o of miss){o.vac=true;o.vt=0;n++;}
    if(n){activeVac={at:elapsed,count:n,reason:'phase '+lastPhase+'->'+ph,done:null};stats.vacuums.push(activeVac);}
   }
   lastPhase=ph;lastRelief=relief;
  }
  for(let i=orbs.length-1;i>=0;i--){const o=orbs[i];if(o.special)continue;o.born??=elapsed;
   const dw=wd(o.x,o.y,player.x,player.y),d=dw*K;
   if(o.vac){o.vt+=dt;const sp=(4+12*o.vt)*K*dt,dx=player.x-o.x,dy=player.y-o.y,l=Math.hypot(dx,dy)||1,st=Math.min(l,sp);o.x+=dx/l*st;o.y+=dy/l*st;continue;}
   // B. moderate magnet band outside the regular pickup radius: a gentle pull that fades to zero at the band edge.
   const sr=Math.hypot(o.x-player.x,o.y-player.y);
   if(d<R&&sr>=statR){const pull=K*(L.magnetPullWu*(1-d/R)+.5)*dt,dx=player.x-o.x,dy=player.y-o.y,l=Math.hypot(dx,dy)||1;o.x+=dx/l*Math.min(l,pull);o.y+=dy/l*Math.min(l,pull);stats.magnetPulls++;}
   // spacing aid: a normal light left far behind (off screen, > 7.5 wu, older than 10 s) dissolves; the refill brings a new one near the fight.
   if(!runMission.boss&&!o.bossMark&&dw>L.recycleWu&&elapsed-o.born>L.recycleAge&&!c.onScreen(o.x,o.y,20)){orbs.splice(i,1);stats.recycled++;}
  }
  if(activeVac&&activeVac.done===null&&!orbs.some(o=>o.vac))activeVac.done=+(elapsed-activeVac.at).toFixed(2);
  // spacing aid: a drifting shadow that wandered far off screen (> 8.5 wu) retires, so the hazard cap refills near Lumi.
  const RW=ro()?ENC.retireWu:L.retireWu;for(const h of hazards){if(h.entering||h.exiting||h.kind==='sentry'||h.age<3)continue;if(wd(h.x,h.y,player.x,player.y)>RW&&!c.onScreen(h.x,h.y,40)){h.exiting=true;h.exitT=0;stats.retired++;if(ro()&&!runMission.boss&&typeof spawnClock!=='undefined')spawnClock=Math.max(spawnClock,runMission.interval*.85);}} // rollout: a retired straggler is replaced near the fight right away
 }
 // Boss-stage escort (rollout): existing shadow kinds join the fight in small numbers from the arena's own entrances /
 // just off screen, never while the boss is telegraphing, never while it is being defeated.
 function escorts(dt){const b=KozaAdventure.state.boss,e=ENC.escorts[runMission.number];if(!e||!b||b.hp<=0||b.defeating||elapsed<ENC.escortFirst||typeof addHazard!=='function')return;
  escortClock+=dt;if(escortClock<ENC.escortEvery||b.charge>0)return;if(hazards.length>=e.cap){escortClock=ENC.escortEvery*.6;return;}
  wrapPattern();wrapEnemy3D();escortKind=e.kinds[escortSerial%e.kinds.length];const cap=runMission.maxHazards;runMission.maxHazards=Math.max(cap,e.cap);let ok=false;try{ok=addHazard();}finally{runMission.maxHazards=cap;escortKind=null;}
  if(ok){const h=hazards[hazards.length-1];h.escort=true;stats.escorts++;stats.escortKinds[h.kind]=(stats.escortKinds[h.kind]||0)+1;escortSerial++;escortClock=0;}else escortClock=ENC.escortEvery*.7;}
 // C. off-screen light cue: a tiny soft chevron on the screen edge toward a collectible light that is outside the view
 // (<= 10 wu away). Max 3, merged when close, KOZA mint (gold for boss / special light). Not a minimap, not an arrow HUD.
 function cues(g){
  if(!on()||mode!=='play')return;const c=C(),Lay=c.layout;if(!Lay)return;const L=c.V2.light,K=k();
  const x0=12,x1=Lay.EW-12,y0=(Lay.availTop||0)+10,y1=(Lay.availBottom||Lay.EH)-10,hx=Lay.ox+player.x,hy=Lay.oy+player.y;
  const list=[];for(const o of orbs){if(o.vac||o.claimed)continue;const sx=Lay.ox+o.x,sy=Lay.oy+o.y;if(sx>=x0-6&&sx<=x1+6&&sy>=y0-6&&sy<=y1+6)continue;
   const d=wd(o.x,o.y,player.x,player.y);if(d>L.cueMaxWu)continue;list.push({o,sx,sy,d});}
  list.sort((a,b)=>a.d-b.d);
  // boss off screen (large V2 boss arena): the same tiny cue in a warm ember tone, always first
  const bo=KozaAdventure.state.boss;if(bo&&bo.hp>0&&!bo.defeating){const sx=Lay.ox+bo.x,sy=Lay.oy+bo.y;if(sx<x0-10||sx>x1+10||sy<y0-10||sy>y1+10)list.unshift({o:{boss:true},sx,sy,d:0,boss:true});}
  const shown=[];
  for(const it of list){const dx=it.sx-hx,dy=it.sy-hy;let t=1e9;if(dx>0)t=Math.min(t,(x1-hx)/dx);if(dx<0)t=Math.min(t,(x0-hx)/dx);if(dy>0)t=Math.min(t,(y1-hy)/dy);if(dy<0)t=Math.min(t,(y0-hy)/dy);if(!(t>0&&t<1e8))continue;
   const px=hx+dx*t,py=hy+dy*t;if(shown.some(s=>Math.hypot(s.px-px,s.py-py)<22))continue;shown.push({px,py,a:Math.atan2(dy,dx),d:it.d,gold:!!(it.o.bossMark||it.o.special),boss:!!it.boss});if(shown.length>=3)break;}
  stats.cues.frames+=shown.length?1:0;stats.cues.max=Math.max(stats.cues.max,shown.length);if(!shown.length)return;
  g.save();g.setTransform(dpr,0,0,dpr,0,0);const t=clock;
  for(const s of shown){const a=(.45+.4*(1-s.d/L.cueMaxWu))*(reduced?1:.9+.1*Math.sin(t*3+s.px*.05)),col=s.boss?'255,170,130':s.gold?'255,220,124':'190,246,222';
   g.save();g.translate(s.px,s.py);g.rotate(s.a);const gr=g.createRadialGradient(0,0,0,0,0,12);gr.addColorStop(0,`rgba(${col},${a*.5})`);gr.addColorStop(1,`rgba(${col},0)`);g.fillStyle=gr;g.beginPath();g.arc(0,0,12,0,Math.PI*2);g.fill();
   g.fillStyle=`rgba(${col},${a})`;g.beginPath();g.moveTo(6.5,0);g.lineTo(-2.6,-4.6);g.lineTo(-.7,0);g.lineTo(-2.6,4.6);g.closePath();g.fill();g.beginPath();g.arc(-5.2,0,1.5,0,Math.PI*2);g.fill();g.restore();}
  g.restore();
 }
 // On-screen build label (always visible in this branch) + live switch summary.
 function label(){
  if(document.getElementById('v2Build'))return;const css=document.createElement('style');
  css.textContent='#v2Build{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 1px);transform:translateX(-50%);z-index:99998;pointer-events:none;text-align:center;font:700 7.5px/1.2 system-ui,sans-serif;letter-spacing:.06em;color:rgba(234,242,255,.74);text-shadow:0 1px 2px #000a;white-space:nowrap}#v2Build small{display:none}';
  document.head.appendChild(css);const d=document.createElement('div');d.id='v2Build';d.setAttribute('aria-hidden','true');d.innerHTML=(C()?.V2?.label||'KOZA — MAP 1 TEST BUILD · POLISH PASS')+'<small></small>';document.body.appendChild(d);summary();
 }
 function summary(){const c=C();if(!c?.v2)return;const v=c.v2,txt='ÖLÇEK '+(v.scale==='v2'?'ROLLOUT':'MEVCUT')+' · KAMERA '+(v.camera==='continuous'?'SÜREKLİ':'ESKİ')+' · IŞIK '+(v.light==='v2'?'V2':'ESKİ')+' · KARŞILAŞMA '+(v.enc==='rollout'?'ROLLOUT':'V2');for(const el of [document.querySelector('#v2Build small'),document.querySelector('#qaPanel .qa-head')])if(el)el.textContent=el.classList?.contains('qa-head')?'SCALE ROLLOUT · '+txt:txt;}
 addEventListener('DOMContentLoaded',label);
 return {orb,lights,cues,label,summary,stats,on,tune,orbPace,ENC};
})();
