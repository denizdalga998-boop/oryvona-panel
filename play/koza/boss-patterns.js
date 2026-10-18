'use strict';
window.KozaBossPatterns=(()=>{
 // Q3 BOSS DESIGN: every guardian encounter is SURVIVE + EVADE + COLLECT LIGHT. Light never damages a guardian; the
 // encounter is timed and its pressure comes from attack patterns in three phases (EARLY readable / MID combined /
 // LATE strongest but fair). b.phaseIdx is set by KozaAdventure from the encounter clock. hp/maxHp stay on the object
 // only for older readers (no gameplay, HUD or reward reads them).
 const types=[
 {name:'Boynuzlu Muhafız',hint:'Boynuz yelpazesinden kaç, boşluklarda kal; süre dolana kadar dayan.',hp:4,delay:2.8,size:166},
 {name:'Zırhlı Kabuk Muhafızı',hint:'Zehir kürelerinin arasından geç; dalgalar birleşince yer değiştir.',hp:5,delay:2.6,size:165},
 {name:'Fırtına Baykuşu',hint:'Yükselişi izle, dalış yolundan çekil; son evrede art arda dalar.',hp:6,delay:2.4,size:172},
 {name:'Kadim Rüzgâr Ejderi',hint:'Sıçrayış, uçuş alevi, enerji nefesi, göktaşları ve halkalar. Evreler ilerledikçe saldırılar birleşir.',hp:7,delay:2.2,size:184}];
 function spec(level,region){const index=Math.max(0,Math.min(3,Math.floor(level/5)-1)),t=types[index];const names=region==='grove'?['Fırtına Boynuzu','Diken Zırhlısı','Kasırga Kanadı','Fırtına Hükümdarı']:['Ayışığı Muhafızı','İnci Kabuk','Ay Kanadı','Kadim Ay Ejderi'];return {...t,region,index,name:names[index],hp:index===3?(region==='grove'?15:12):t.hp+(region==='grove'?1:0),delay:t.delay-(region==='grove'?.15:0)};}
 // v5.16: in a wide world the boss is sized against the v5.15.1 reference floor (7 x 15 wu), never the world width.
 function fitSize(s,w,h,top){const ref=window.KozaCamera?.sizeRef?.();if(ref){w=ref.w;h=ref.h;top=0;}const area=Math.max(100,h-top);
  // GAMEPLAY SCALE TEST V2: the arena spec may shrink the boss relative to its v5.15.1 reference size (Boss05 V2: 0.82). Hitbox follows (r = size*.26).
  const bs=ref?(window.KozaCamera?.bossScale?.()||1):1;return bs*Math.min(s.size*1.28,w*(s.index===3?.405:s.index===0?.44:.42),area*(s.index===0?.35:.32));}
 function resize(b,w,h,top){b.size=fitSize(spec((b.index+1)*5,b.region),w,h,top);b.r=b.size*.26;}
 function create(level,region,w,h,top){const s=spec(level,region),size=fitSize(s,w,h,top);return {...s,size,x:w/2,y:top+Math.max(size*(s.index===0?.95:.7),(h-top)*.25),age:0,attack:0,charge:0,action:0,actionTime:0,aim:0,hp:s.hp,maxHp:s.hp,r:size*.26,recoil:0,cycle:0,zones:[],echoes:[],lift:0,walk:0,phaseIdx:0,ending:false,calm:0};}
 // Q3: phase = encounter clock (0 early, 1 mid, 2 late); never guardian health.
 function phase(b){return Math.max(0,Math.min(2,b.phaseIdx|0));}
 const PACE=[1,.86,.74]; // time between attacks per phase (x base delay)
 // Lane volleys: [angle offsets, delay s]. Later waves are interleaved and delayed, so each wave has real gaps and the
 // next wave asks for one short, readable step (never a wall).
 const VOLLEYS={
  0:[[[[-.55,0],[0,0],[.55,0]]],
     [[[-.55,0],[0,0],[.55,0],[-.28,.5],[.28,.5]]],
     [[[-.8,0],[-.4,0],[0,0],[.4,0],[.8,0],[-.6,.55],[-.2,.55],[.2,.55],[.6,.55]]]],
  1:[[[[-.65,0],[-.325,0],[0,0],[.325,0],[.65,0]]],
     [[[-.65,0],[-.325,0],[0,0],[.325,0],[.65,0],[-.4875,.55],[-.1625,.55],[.1625,.55],[.4875,.55]]],
     [[[-.65,0],[-.325,0],[0,0],[.325,0],[.65,0],[-.4875,.5],[-.1625,.5],[.1625,.5],[.4875,.5],[-.65,1.0],[-.325,1.0],[0,1.0],[.325,1.0],[.65,1.0]]]]};
 function charge(b,p,w,h,top){if(b.index===3)return KozaDragonCombat.prepare(b,p,w,h,top);b.aim=Math.atan2(p.y-b.y,p.x-b.x);b.charge=b.chargeTotal=b.index===2?(b.chain?.78:1.2):1.05;b.zones=[];b.origin={x:b.x,y:b.y};const hs=h/(window.KozaCamera?.gameplayScale?.()||1);b.boltSpeed=Math.max(240,hs/1.65);
  if(b.index===0||b.index===1){for(const [a,delay] of VOLLEYS[b.index][phase(b)][0]){const angle=b.aim+a;b.zones.push({x:b.x,y:b.y,ex:b.x+Math.cos(angle)*h,ey:b.y+Math.sin(angle)*h,delay});}if(b.index===1)b.boltSpeed=Math.max(210,hs/2.1);}
  if(b.index===2){b.destination={x:Math.max(b.size/2+5,Math.min(w-b.size/2-5,p.x)),y:Math.max(top+b.size/2+10,Math.min(h-b.size/2-15,p.y))};const C=window.KozaCamera;if(C?.isV2Arena?.())C.confine(b.destination,b.r*.6);if(!b.chain)b.divesLeft=phase(b);}}
 function segmentDistance(p,z){const dx=z.ex-z.x,dy=z.ey-z.y,t=Math.max(0,Math.min(1,((p.x-z.x)*dx+(p.y-z.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-z.x-t*dx,p.y-z.y-t*dy);}
 // Q3: after an attack the guardian leaves ONE golden light near its body - a tempting, optional reward (worth 2).
 function releaseLight(b,orbs,w,h,top){if(b.ending||b.cycle%2||orbs.filter(o=>o.bossMark).length>=4)return;
  const C=window.KozaCamera;if(C?.isV2Arena?.()&&typeof player!=='undefined'){const k=C.px(1),side=(b.cycle%2?1:-1);for(let t=0;t<12;t++){const a=Math.atan2(player.y-b.y,player.x-b.x)+side*(.9+.25*t),r=b.r+k*(2.3+.15*t),o={x:b.x+Math.cos(a)*r,y:b.y+Math.sin(a)*r*C.sin,r:11,phase:b.cycle,bossMark:true,risky:true,gain:2,ttl:7,age:0};C.confine(o,26);if(Math.hypot(o.x-b.x,(o.y-b.y)/C.sin)>=b.r+k*1.8){orbs.push(o);return;}}}const positions=[[.24,.70],[.76,.56],[.30,.45],[.72,.79]],v=positions[(b.cycle+b.index)%positions.length];let x=Math.max(48,Math.min(w-48,w*v[0])),y=top+(h-top-55)*v[1];if(Math.hypot(x-b.x,y-b.y)<b.r+70)y=Math.min(h-65,b.y+b.r+85);orbs.push({x,y,r:11,phase:b.cycle,bossMark:true,risky:true,gain:2,ttl:7,age:0});}
 function updateDragonPose(b,dt){window.KozaDeer3D?.updatePose(b,dt,typeof reduced!=='undefined'&&reduced);}
 // Attack flow (all bosses): ready -> wind-up (charge: turn to target, telegraph grows) -> active (action) -> recovery -> ready.
 // Explicit events (b.events) carry the attack id (b.cycle) so sound / VFX fire exactly once per attack, whatever the frame rate.
 function ev(b,name){(b.events||(b.events=[])).push({name,id:b.cycle,index:b.index});}
 function stage(b){return b.calm>0?'calm':b.charge>0?'windup':b.action>0?'active':(b.recovery||0)>0?'recovery':'ready';}
 const laneT=(b,z)=>b.actionTime-(z.delay||0);
 function tick(b,dt,p,w,h,top,orbs,enemyScale=1){if(b.index===3)return KozaDragonCombat.tick(b,dt,p,w,h,top,orbs,enemyScale,updateDragonPose);const d=dt*enemyScale;b.age+=d;b.recoil=Math.max(0,b.recoil-dt);b.echoes=b.echoes.filter(e=>(e.life-=dt)>0);const oldX=b.x;
 // QUALITY PASS: the deer guardian (index 0) walks like a quadruped - world heading b.hd, turn first, then walk forward
 // (KozaBossLocomotion). Other guardians keep their approved motion (the six-legged shell guardian's omni-directional
 // scuttle is the reference the player likes; the owl hovers).
 const L=window.KozaBossLocomotion,walker=b.index===0&&!!L,G=walker?L.GAITS.deer:null;if(walker)L.init(b,p);
 if(b.charge>0){b.charge=Math.max(0,b.charge-d);
  // Q3 deer: the wind-up is a planted anticipation - turn with stepping legs at a natural rate, then lower the antlers.
  if(walker)L.face(b,b.aim,d,G,G.turnWindup);
  if(!b.charge){b.actionTime=0;b.action=b.index===0?(phase(b)===2?2.9:2.6):b.index===1?(phase(b)===2?3.4:2.9):b.index===2?.8:1.25;b.cycle++;ev(b,'release');}}
 else if(b.action>0){b.action=Math.max(0,b.action-d);const t0=b.actionTime;b.actionTime+=d;if(b.index===2){const t=Math.min(1,b.actionTime/.8),ease=t*t*(3-2*t);b.x=b.origin.x+(b.destination.x-b.origin.x)*ease;b.y=b.origin.y+(b.destination.y-b.origin.y)*ease;if(t0<.8&&b.actionTime>=.8)ev(b,'impact');}
  if(walker){L.lunge(b,t0/.42,b.actionTime/.42,G.lunge);b.spd=0;} // antler thrust: one decelerating forward step along the body heading
  if(b.zones)for(const z of b.zones)if(z.delay&&!z.fired&&b.actionTime>=z.delay){z.fired=true;ev(b,'volley');}
  if(!b.action){b.attack=0;b.echoes.push({x:b.x,y:b.y,life:.8});ev(b,'recover');
   // owl, mid/late phase: a second (third) dive follows after a short, readable re-aim (never instant)
   if(b.index===2&&!b.ending&&(b.divesLeft|0)>0){b.divesLeft--;b.chain=true;b.recovery=0;charge(b,p,w,h,top);b.chain=false;ev(b,'windup');}
   else releaseLight(b,orbs,w,h,top);}}
 else{b.attack+=d;const H=window.KozaCamera?.bossHome?.(); /* MAP 1 SCALE ROLLOUT: home + sway from the boss's own area in scaled arenas */const homeY=H?H.y:top+Math.max(b.size*(b.index===0?.95:.7),(h-top)*.25),desired=H?H.x+Math.sin(b.age*.48)*H.sway*(b.index===2?1.5:1):w/2+Math.sin(b.age*.48)*(b.index===2?w*.20:w*.13);
  if(walker){if((b.recovery||0)>0)L.face(b,Math.atan2(p.y-b.y,p.x-b.x),d*.35,G);else L.steer(b,{x:desired,y:homeY},d,G);}
  else{b.x+=(desired-b.x)*Math.min(1,d*1.4);b.y+=(homeY-b.y)*Math.min(1,d*1.2);}
  if(!b.ending&&b.attack>=b.delay*PACE[phase(b)]){charge(b,p,w,h,top);ev(b,'windup');}}
 b.recovery=Math.max(0,(b.recovery||0)-d);if(!b.action&&b.actionTime>0&&b.attack===0&&!(b.charge>0))b.recovery=b.index===0?.75:.6;
 b.walk+=Math.hypot(b.x-oldX,b.y-(b.previousY??b.y))*.09;b.previousY=b.y;b.x=Math.max(b.size*.52,Math.min(w-b.size*.52,b.x));b.y=Math.max(top+b.size*(b.index===0?.95:.6),Math.min(h-b.size*.55,b.y));
 // Q3 owl: RISE (climbs high and hangs while it aims) -> readable TELEGRAPH (landing ring + path) -> DIVE (fast, low) ->
 // RECOVERY (lands low, then climbs back). The shadow always stays on the floor under the body (lift is drawn height only).
 if(b.index===2){const hover=22+Math.sin(b.age*2)*6,ct=b.chargeTotal||1.2,u=b.charge>0?1-b.charge/ct:0,dive=b.action>0?Math.min(1,b.actionTime/.8):0,rise=Math.min(1,u/.55),e=rise*rise*(3-2*rise);
  b.lift=b.charge>0?hover+(58-hover)*e+Math.sin(b.age*9)*1.5*(u>.55?1:0):b.action>0?Math.max(4,58*Math.pow(1-dive,2.4)+4*dive):(b.recovery||0)>0?4+(hover-4)*Math.pow(1-(b.recovery/.6),1.6):hover;}
 else b.lift=0;
 b.stage=stage(b);
 if(!b.action||b.ending)return false;if(b.index===0||b.index===1)return b.zones.some(z=>{const t=laneT(b,z);if(t<0)return false;const angle=Math.atan2(z.ey-z.y,z.ex-z.x),distance=b.r+12+t*b.boltSpeed;return Math.hypot(p.x-z.x-Math.cos(angle)*distance,p.y-z.y-Math.sin(angle)*distance)<KozaHitbox.boss.bolt(b);});if(b.index===2)return b.actionTime>.35&&Math.hypot(p.x-b.x,p.y-b.y)<KozaHitbox.boss.dive(b);
 return false;
 }
 // Q3 outro: the guardian stops attacking, walks back to its home at half pace and settles (b.calm 0..1 lowers the head /
 // slows the idle in the 3D pose). Never 'killed': no defeat pose, no fade.
 function calm(b,dt,p,w,h,top){b.age+=dt;b.charge=0;b.zones=[];b.recoil=0;b.calm=Math.min(1,(b.calm||0)+dt/.9);b.echoes=b.echoes.filter(e=>(e.life-=dt)>0);const H=window.KozaCamera?.bossHome?.(),home={x:H?H.x:w/2,y:H?H.y:top+(h-top)*.25};
  if(b.index===3){if(window.KozaBossLocomotion&&(b.action||0)<=0)KozaBossLocomotion.steer(b,home,dt,KozaBossLocomotion.GAITS.dragon,.5);b.altitude=Math.max(0,(b.altitude||0)-dt*60);b.lift=b.altitude;b.bodyDanger=false;updateDragonPose(b,dt);}
  else if(b.index===0&&window.KozaBossLocomotion)KozaBossLocomotion.steer(b,home,dt,KozaBossLocomotion.GAITS.deer,.5);
  else{b.x+=(home.x-b.x)*Math.min(1,dt*.8);b.y+=(home.y-b.y)*Math.min(1,dt*.8);if(b.index===2)b.lift=Math.max(6,(b.lift||22)-dt*14);}
  b.stage='calm';}
 function draw(g,b){window.KozaCombatFX?.boss(g,b);}
 return {types,spec,create,resize,fitSize,phase,charge,tick,calm,draw,segmentDistance,stage,VOLLEYS,PACE};
})();
