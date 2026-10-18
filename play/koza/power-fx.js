'use strict';
window.KozaPowerFX=(()=>{
 const tau=Math.PI*2;const has=(s,k)=>s.picks?.includes(k)||s.chosen===k;
 function circle(g,x,y,r){g.beginPath();g.arc(x,y,r,0,tau);}
 function under(g,s,m,p,reduced,quality){const t=reduced?0:s.realSeconds,low=quality==='low';g.save();g.translate(p.x,p.y);
  if(s.choiceGrace>0){g.strokeStyle='#d4ffe8';g.lineWidth=2;g.globalAlpha=.65;circle(g,0,0,34);g.stroke();g.globalAlpha=1;}
  if(s.shield>0||s.ward){const r=46+(reduced?0:Math.sin(t*2)*1.5);if(window.KozaGradCache?.on()){const C=KozaGradCache;C.blit(g,C.make('shield',(x,S)=>{const k=S/2/46,a=x.createRadialGradient(S/2-15*k,S/2-18*k,3*k,S/2,S/2,S/2);a.addColorStop(0,'#e0ffff55');a.addColorStop(.65,'#7edaff08');a.addColorStop(.88,'#88eaff33');a.addColorStop(1,'#d8ffff99');x.fillStyle=a;x.beginPath();x.arc(S/2,S/2,S/2,0,Math.PI*2);x.fill();}),0,0,r);}else{const a=g.createRadialGradient(-15,-18,3,0,0,r);a.addColorStop(0,'#e0ffff55');a.addColorStop(.65,'#7edaff08');a.addColorStop(.88,'#88eaff33');a.addColorStop(1,'#d8ffff99');g.fillStyle=a;circle(g,0,0,r);g.fill();}}
  if(s.magnet>0||has(s,'magnet')){g.strokeStyle='#8affd2';g.lineWidth=1.5;const count=low?3:5;for(let i=0;i<count;i++){const phase=reduced?.45:(t*.6+i/count)%1,r=24+(1-phase)*45,a=i/count*tau+t*.5;g.globalAlpha=.12+phase*.38;g.beginPath();g.arc(0,0,r,a,a+.52);g.stroke();g.fillStyle='#c4ffe5';circle(g,Math.cos(a+.52)*r,Math.sin(a+.52)*r,2);g.fill();}g.globalAlpha=1;}
  if((has(s,'swift')&&m.moving)||(s.flow>0&&m.moving)){g.save();g.rotate(m.heading);g.strokeStyle='#ffe9a0';g.lineWidth=2;g.globalAlpha=reduced?.3:.55;for(let i=0;i<3;i++){const x=(i-1)*15,y=20+(reduced?0:Math.sin(t*9+i)*3);g.beginPath();g.moveTo(x,y);g.lineTo(x,y+(s.flow>0?30:18));g.stroke();}g.restore();}
  if(has(s,'bloom')){g.fillStyle='#ffe097';for(let i=0;i<3;i++){const a=t*.7+i*tau/3;g.globalAlpha=.65;circle(g,Math.cos(a)*36,Math.sin(a)*36,2.5);g.fill();}}
  g.restore();
  if(s.slow>0){g.save();g.strokeStyle='#b8dff2';g.fillStyle='#6bb6d422';g.lineWidth=1.5;for(const e of hazards){
   const y=e.y+e.r+5,r=Math.max(11,e.r*.78);g.globalAlpha=reduced?.65:.58+Math.sin(t*2.2)*.08;
   g.beginPath();g.ellipse(e.x,y,r,4.5,0,0,tau);g.fill();g.stroke();
   // One small frost seal, separated from the creature and the ellipse.
   g.globalAlpha=.85;g.beginPath();g.moveTo(e.x,y+2);g.lineTo(e.x,y+10);g.moveTo(e.x-3,y+4);g.lineTo(e.x+3,y+8);g.moveTo(e.x+3,y+4);g.lineTo(e.x-3,y+8);g.stroke();
  }g.restore();}
 }
 function over(g,s,m,p,reduced,quality){const t=reduced?0:s.realSeconds;g.save();g.translate(p.x,p.y);
  if(s.shield>0||s.ward){g.strokeStyle='#edffff';g.lineWidth=2;g.globalAlpha=.75;g.beginPath();g.arc(-2,-2,42,3.6,4.65);g.stroke();g.lineWidth=1;g.globalAlpha=.3;const n=quality==='low'?4:6;for(let i=0;i<n;i++){const a=i*tau/n+(reduced?0:t*.1),x=Math.cos(a)*43,y=Math.sin(a)*43;g.beginPath();g.moveTo(x,y);g.lineTo(Math.cos(a+.16)*34,Math.sin(a+.16)*34);g.lineTo(Math.cos(a+.35)*42,Math.sin(a+.35)*42);g.stroke();}g.globalAlpha=1;}
  if(s.shieldBreak>0){const phase=1-s.shieldBreak/.65;g.fillStyle='#d9ffff';g.globalAlpha=(1-phase)*.8;for(let i=0;i<(quality==='low'?6:12);i++){const a=i*tau/12,r=42+(reduced?0:phase*24),x=Math.cos(a)*r,y=Math.sin(a)*r;g.beginPath();g.moveTo(x,y-4);g.lineTo(x+3,y+1);g.lineTo(x-3,y+5);g.closePath();g.fill();}}
  if(s.powerPulse>0&&s.chosen==='heal'){g.globalAlpha=Math.min(1,s.powerPulse);g.fillStyle='#b4ffd0';const y=-36-(reduced?0:(1.2-s.powerPulse)*18);g.fillRect(-3,y-10,6,20);g.fillRect(-10,y-3,20,6);}
  if(s.powerPulse>0&&s.chosen!=='heal'&&!reduced){g.globalAlpha=s.powerPulse*.45;g.fillStyle=has(s,'bloom')?'#ffe298':'#c9fff2';for(let i=0;i<6;i++){const a=i*tau/6+t*.7,r=30+(1.2-s.powerPulse)*22;circle(g,Math.cos(a)*r,Math.sin(a)*r,2);g.fill();}}
  g.restore();
 }
 return {under,over};
})();

/* ==== KOZA Q2 game feel: one place that turns REAL game events (already committed by the game) into short, local
   feedback. Kept in this already-served file (no new file name for a running local server). Rules: effects are
   spawned once per event (never inside draw), drawn from a fixed pool, local to the event, short; reduced-motion /
   quality-low shrink decoration first; danger telegraphs are never drawn over; no screen shake, no hit-stop. ==== */
window.KozaGameFeel=(()=>{
 const tau=Math.PI*2,POOL=64,pool=Array.from({length:POOL},()=>({on:false}));
 const stats={spawned:0,dropped:0,events:{}};
 const pref=()=>typeof preferences!=='undefined'?preferences:{};
 const calm=()=>(typeof reduced!=='undefined'&&reduced);
 const low=()=>pref().quality==='low';
 function note(name){stats.events[name]=(stats.events[name]||0)+1;}
 function spawn(o){let f=null;for(const p of pool)if(!p.on){f=p;break;}if(!f){stats.dropped++;return null;}for(const k in f)delete f[k];Object.assign(f,{on:true,t:0},o);stats.spawned++;return f;}
 const baseRadius=()=>{try{return Progress.stats(profile).radius;}catch{return 60;}};
 const squash=()=>window.KozaCamera?.active?.()?window.KozaCamera.sin:1;
 function ring(x,y,r0,r1,life,color,width=2,ground=false){return spawn({type:'ring',x,y,r0,r1,life,color,width,ground});}
 // ---- events (called from the game's own commit points) ----
 function cast(hero,s){note('ability.'+hero);const p=typeof player!=='undefined'?player:null;if(!p)return;
  if(hero==='lumi'){ring(p.x,p.y,18,150,.45,'#9fffd8',2.2,true);if(!low())ring(p.x,p.y,10,90,.35,'#e9fff4',1.2,true);}
  else if(hero==='pera'){ring(p.x,p.y,56,44,.4,'#e8fdff',2.6);if(!calm())for(let i=0;i<(low()?4:8);i++){const a=i*tau/8;spawn({type:'feather',x:p.x+Math.cos(a)*48,y:p.y+Math.sin(a)*48,vx:Math.cos(a)*-40,vy:Math.sin(a)*-40,life:.4,color:'#dff6ff'});}}
  else if(hero==='koru'){const dx=s.flowX||0,dy=s.flowY||0;for(let i=0;i<(low()?3:6);i++){const side=(i%3-1)*9;spawn({type:'streak',x:p.x-dy*side,y:p.y+dx*side,dx:-dx,dy:-dy,len:26+i*4,life:.28+i*.02,color:'#fff0bf'});}}
 }
 function pickup(o,combo){ /* normal light: small + quick; every 5th in a chain a slightly larger ring; golden light: warm ring + a few motes */
  if(o.bossMark){note('light.gold');ring(o.x,o.y,5,o.risky?30:22,.32,'#ffe1a0',o.risky?2:1.6);if(!low()&&!calm()){const n=o.risky?6:4;for(let i=0;i<n;i++){const a=i*tau/n+.4;spawn({type:'mote',x:o.x,y:o.y,vx:Math.cos(a)*26,vy:Math.sin(a)*18-22,life:.45,size:2,color:'#ffe9a8'});}}bump('score');return;}
  note('light.pickup');ring(o.x,o.y,4,16,.2,'#c4ffe3',1.4);if(combo>0&&combo%5===0&&!low()&&!calm())ring(o.x,o.y,8,30,.3,'#fff0b8',1.6);bump('score');}
 function phase(b,P){note('boss.phase');const c=window.KozaDeer3D?.contact?.(b),x=c?.x??b.x,y=c?.y??b.y;ring(x,y,b.r*.8,b.r*2.2+40,.8,P===2?'#ffb48a':'#ffe0a0',2.4,true);if(!low()&&!calm())ring(x,y,b.r*.5,b.r*1.6+20,.6,'#fff3d8',1.2,true);bump('missionHud');}
 function victory(b){note('boss.calm');const c=window.KozaDeer3D?.contact?.(b),x=c?.x??b.x,y=c?.y??b.y;
  for(let i=0;i<3;i++)spawn({type:'ring',x,y,r0:b.r*.4,r1:b.r*2.6+60,life:1.1,color:i===1?'#fff3d0':'#ffe1a0',width:2.2-i*.4,ground:true,t:-i*.28});
  if(!calm())for(let i=0;i<(low()?6:14);i++){const a=i*2.399,rr=b.r*(.3+.7*((i*.37)%1));spawn({type:'mote',x:x+Math.cos(a)*rr,y:y+Math.sin(a)*rr*.5,vx:Math.cos(a)*8,vy:-26-(i%4)*9,life:1.2+(i%3)*.25,size:1.8+(i%3)*.6,color:i%3?'#ffe9a8':'#fff8e0',t:-(i%5)*.12});}
  if(typeof player!=='undefined')ring(player.x,player.y,10,54,.6,'#fff0c0',2);bump('score');haptic(35);}
 function special(o){note('special.appear');ring(o.x,o.y,40,14,.5,'#ffe89b',2);}
 function seal(b){note('boss.seal');ring(b.x,b.y,20,b.r*1.4+30,.55,'#ffe1a0',2.4,true);}
 function impact(b,e){note('boss.impact');const c=window.KozaDeer3D?.contact?.(b),x=c?.x??b.x,y=c?.y??b.y;ring(x,y,b.r*.4,b.r*1.5+24,.5,'#f3e3c4',3,true);if(!low()&&!calm())ring(x,y,b.r*.3,b.r*1.1,.35,'#fff6df',1.5,true);}
 function bossIntro(b){note('boss.intro');const c=window.KozaDeer3D?.contact?.(b);ring(c?.x??b.x,c?.y??b.y,b.r*.6,b.r*1.8+30,.9,'#d8f6ff',2,true);}
 function shieldBlock(p){note('shield.block');haptic(25);}
 function wardReady(p){note('shield.recharged');ring(p.x,p.y,70,46,.45,'#dffbff',1.8);}
 function heal(p){note('hero.heal');ring(p.x,p.y,10,44,.4,'#c8f5b0',2);}
 function damage(p){note('hero.damage');ring(p.x,p.y,12,40,.28,'#ffb3a6',2);}
 function power(kind,p){note('power.'+kind);const radius=baseRadius()+30;
  if(kind==='magnet')ring(p.x,p.y,radius-10,radius,.8,'#9fffd8',1.5,true);           // the new pickup reach, once
  else if(kind==='slow'){if(typeof hazards!=='undefined')for(const h of hazards.slice(0,8))ring(h.x,h.y,h.r+14,h.r+4,.7,'#bfe6ff',1.6);}
  else if(kind==='swift'){for(let i=0;i<4;i++)spawn({type:'streak',x:p.x+(i-1.5)*10,y:p.y+14,dx:0,dy:1,len:22,life:.35,color:'#ffe9a0'});}
  else if(kind==='shield')ring(p.x,p.y,70,46,.45,'#dffbff',2);
 }
 // ---- HUD micro-reactions (WAAPI transform/opacity only; no layout work) ----
 const bumping=new Map();
 function bump(id){if(calm())return;const el=document.getElementById(id);if(!el?.animate)return;const prev=bumping.get(id);if(prev&&prev.playState==='running')return;bumping.set(id,el.animate([{transform:'scale(1)'},{transform:'scale(1.18)'},{transform:'scale(1)'}],{duration:170,easing:'ease-out'}));}
 function haptic(ms){const P=pref();if(!P.haptics||!navigator.vibrate||document.hidden)return false;try{return navigator.vibrate(ms);}catch{return false;}}
 // ---- world drawing (render pass; dt = 0 while the world is frozen, so effects freeze with it) ----
 function draw(g,dt){
  // Lumi pull: short trails on the lights that are really being pulled (only while the ability is active).
  const s=window.KozaAdventure?.state;
  if(s&&s.magnet>0&&typeof orbs!=='undefined'&&typeof player!=='undefined'&&!calm()){g.save();g.strokeStyle='#bfffe4';g.lineWidth=1.4;let n=0;const reach=baseRadius()+(window.KozaAdventure.hasPower('magnet')?30:0)+65;
   for(const o of orbs){if(n>=10)break;const dx=player.x-o.x,dy=player.y-o.y,d=Math.hypot(dx,dy);if(d>reach||d<12)continue;n++;g.globalAlpha=.35*(1-d/reach)+.12;g.beginPath();g.moveTo(o.x,o.y);g.lineTo(o.x+dx/d*Math.min(22,d*.4),o.y+dy/d*Math.min(22,d*.4));g.stroke();}g.restore();}
  const sq=squash();
  for(const f of pool){if(!f.on)continue;f.t+=dt;if(f.t<0)continue;const u=f.t/f.life;if(u>=1){f.on=false;continue;}
   g.save();g.globalAlpha=(1-u)*(f.type==='ring'?.85:.9);
   if(f.type==='ring'){g.strokeStyle=f.color;g.lineWidth=f.width;const r=f.r0+(f.r1-f.r0)*(1-Math.pow(1-u,2));g.beginPath();if(f.ground)g.ellipse(f.x,f.y,r,r*sq,0,0,tau);else g.arc(f.x,f.y,r,0,tau);g.stroke();}
   else if(f.type==='streak'){g.strokeStyle=f.color;g.lineWidth=2;g.lineCap='round';const off=u*18;g.beginPath();g.moveTo(f.x+f.dx*off,f.y+f.dy*off);g.lineTo(f.x+f.dx*(off+f.len*(1-u)),f.y+f.dy*(off+f.len*(1-u)));g.stroke();}
   else if(f.type==='mote'){f.x+=f.vx*dt;f.y+=f.vy*dt;g.globalAlpha=(1-u)*Math.min(1,u*6)*.9;g.fillStyle=f.color;g.beginPath();g.arc(f.x,f.y,f.size||2,0,tau);g.fill();}
   else if(f.type==='feather'){f.x+=f.vx*dt;f.y+=f.vy*dt;g.fillStyle=f.color;g.beginPath();g.ellipse(f.x,f.y,4,1.8,Math.atan2(f.vy,f.vx),0,tau);g.fill();}
   g.restore();}
 }
 function clear(){for(const p of pool)p.on=false;bumping.clear();}
 function active(){let n=0;for(const p of pool)if(p.on)n++;return n;}
 return {cast,pickup,phase,victory,special,seal,impact,bossIntro,shieldBlock,wardReady,heal,damage,power,bump,haptic,draw,clear,active,stats};
})();
