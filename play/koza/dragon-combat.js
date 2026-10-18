'use strict';
/* ==== KOZA q1: KozaBossLocomotion (boss world-heading locomotion). Kept in this already-served file so a test
   install needs no new file names (the local server only serves names listed in mime-types.json at start-up). ==== */
// KOZA boss locomotion (Map 1 quality pass). Ground-walking bosses (quadruped deer, dragon) move like animals:
// a world-space heading b.hd (radians, x = screen right, z = screen down on the floor plane) that turns at a limited
// rate, and travel only ALONG that heading. Speed falls when the target is off to the side, so the body turns first
// and then walks - it never slides sideways or rotates like a chess piece. Positions stay in the same field px as all
// combat code; the camera pitch (KozaCamera.sin) converts field y to floor depth. Pure data + maths; no rendering.
window.KozaBossLocomotion = (() => {
 const TAU = Math.PI * 2, wrap = a => Math.atan2(Math.sin(a), Math.cos(a)), clamp = (n, a, b) => Math.max(a, Math.min(b, n));
 // Tuning per boss gait (world units / seconds). vmax is kept close to the previous sway speed (~1-1.5 wu/s peaks).
 const GAITS = Object.freeze({
  deer: { vmax: 1.35, accel: 2.6, decel: 3.4, turn: 2.4, turnFace: 5.2, turnWindup: 3.1, arrive: .14, brake: .9, lunge: .38 },
  dragon: { vmax: 1.1, accel: 2.0, decel: 2.8, turn: 1.9, turnFace: 4.2, arrive: .16, brake: 1.0, lunge: 0 }
 });
 function frame() { const C = window.KozaCamera; const on = !!C?.active?.(); return { k: on ? C.px(1) : 50, s: on ? C.sin : 1 }; }
 // screen-space angle (field px, e.g. b.aim) -> world heading, and back
 const toWorld = (a, s) => Math.atan2(Math.sin(a) / s, Math.cos(a));
 const toScreen = (h, s) => Math.atan2(Math.sin(h) * s, Math.cos(h));
 function init(b, towards) {
  if (Number.isFinite(b.hd)) return;
  const { s } = frame(); b.hd = towards ? Math.atan2((towards.y - b.y) / s, towards.x - b.x) : Math.PI / 2; b.spd = 0; b.turnRate = 0; b.gaitSpeed = 0;
 }
 // A step that would leave the guardian's own area is not taken: the body stops and keeps facing its goal instead of
 // being pushed sideways by the area clamp afterwards (that clamp slide read as a sideways walk). If the boss is not
 // inside a known area right now (legacy arenas / no polygon) nothing is blocked, so old arenas behave as before.
 function free(b, nx, ny) { const C = window.KozaCamera; if (!C?.insideField || !C.active?.()) return true; try { return !C.insideField(b.x, b.y, 0, 'bossArea') || C.insideField(nx, ny, 0, 'bossArea'); } catch { return true; } }
 function move(b, d, k, s) { if (!(d > 0)) return true; const nx = b.x + Math.cos(b.hd) * d * k, ny = b.y + Math.sin(b.hd) * d * k * s; if (!free(b, nx, ny)) { b.spd = 0; b.gaitSpeed = 0; b.blocked = true; return false; } b.x = nx; b.y = ny; b.blocked = false; return true; }
 function turnTowards(b, heading, rate, dt) {
  const err = wrap(heading - b.hd), step = clamp(err, -rate * dt, rate * dt); b.hd = wrap(b.hd + step); b.turnRate = dt > 0 ? step / dt : 0; return err - step;
 }
 // Walk towards a field-px point. Returns the remaining world distance.
 function steer(b, target, dt, gait = GAITS.deer, scale = 1) {
  const { k, s } = frame(); init(b, target);
  const wx = (target.x - b.x) / k, wz = (target.y - b.y) / (k * s), dist = Math.hypot(wx, wz);
  let want = 0;
  if (dist > gait.arrive) {
   const bearing = Math.atan2(wz, wx); turnTowards(b, bearing, gait.turn * scale, dt);
   const align = Math.max(0, Math.cos(Math.abs(wrap(bearing - b.hd)))); // 1 = walking straight at it, 0 = target beside/behind
   want = gait.vmax * scale * Math.pow(align, 3) * Math.min(1, dist / gait.brake);
  } else b.turnRate = 0;
  const rate = want > b.spd ? gait.accel : gait.decel; b.spd += clamp(want - b.spd, -rate * dt, rate * dt);
  const d = Math.min(b.spd * dt, dist); b.gaitSpeed = b.spd; move(b, d, k, s);
  return dist;
 }
 // Stand and turn to face a screen-space direction (attack aim). Speed brakes to zero.
 function face(b, screenAngle, dt, gait = GAITS.deer, rate = 0) {
  const { s } = frame(); init(b); b.spd = Math.max(0, b.spd - gait.decel * dt); b.gaitSpeed = b.spd;
  if (b.spd > 0) { const { k } = frame(); move(b, b.spd * dt, k, s); }
  return Math.abs(turnTowards(b, toWorld(screenAngle, s), rate || gait.turnFace, dt));
 }
 // Forward lunge of a fixed world length with ease-out (arrival / deceleration). u: 0..1 progress.
 function lunge(b, u0, u1, length) {
  if (!(length > 0)) return; const { k, s } = frame(), e = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3), d = (e(u1) - e(u0)) * length;
  move(b, d, k, s);
 }
 function facingScreen(b) { const { s } = frame(); return toScreen(b.hd, s); }
 function reset(b) { delete b.hd; b.spd = 0; b.turnRate = 0; b.gaitSpeed = 0; }
 return { GAITS, steer, face, lunge, init, facingScreen, toWorld, toScreen, reset, wrap };
})();
/* ==== end KozaBossLocomotion ==== */
window.KozaDragonCombat=(()=>{
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),mix=(a,b,t)=>a+(b-a)*t,ph=b=>Math.max(0,Math.min(2,b.phaseIdx|0)); /* Q3: phase = encounter clock, never health */
 const skills=[['pounce','breath','ring'],['pounce','flyfire','storm','breath','ring'],['flyfire','pounce','twinring','storm','breath','ring']];
 const duration={pounce:2.10,flyfire:4.25,breath:2.65,storm:2,ring:2.65,twinring:3.55};
 function fieldBounds(b,w,h,top){const moon=true;return {left:b.size*(moon?1.03:.46),right:w-b.size*(moon?1.03:.46),top:top+(moon?Math.min(b.size*1.82,(h-top)*.58):b.size*.50),bottom:h-b.size*(moon?.35:.44)-15};}
 function prepare(b,p,w,h,top){const bounds=fieldBounds(b,w,h,top);b.attackPhase=ph(b);b.skill=skills[b.attackPhase][b.cycle%skills[b.attackPhase].length];b.charge=b.skill==='pounce'?(b.attackPhase===0?1.25:1.1):b.skill==='flyfire'?1.0:1.15; /* Q3: longer, readable anticipation */b.chargeTotal=b.charge;b.origin={x:b.x,y:b.y};b.aim=Math.atan2(p.y-b.y,p.x-b.x);b.gap=b.region==='grove'?.56:.67;b.destination={x:clamp(p.x,bounds.left,bounds.right),y:clamp(p.y,bounds.top,bounds.bottom)};b.flightEnd={x:clamp(b.x<w/2?w*.73:w*.27,bounds.left,bounds.right),y:clamp(top+(h-top)*.25,bounds.top,bounds.bottom)};b.zones=b.skill==='storm'?[{x:clamp(p.x,48,w-48),y:clamp(p.y,top+45,h-65)},{x:w*.23,y:top+(h-top)*.47},{x:w*.77,y:top+(h-top)*.73}]:[];
  // MAP 1 SCALE ROLLOUT (scaled arena): the two extra meteor marks fall 2.4-2.8 wu either side of Lumi (inside the floor) instead of
  // at fixed fractions of a now 2x larger field (they would land far off screen); the flight ends on the far side of the boss area.
  const C=window.KozaCamera;if(C?.isV2Arena?.()){const k=C.px(1),sg=C.sin;if(b.skill==='pounce'&&C.confineBoss)C.confineBoss(b.destination);if(b.skill==='storm'){const s0=b.cycle%2?1:-1;b.zones=[b.zones[0],{x:p.x+s0*2.6*k,y:p.y-1.2*k*sg},{x:p.x-s0*2.4*k,y:p.y+1.4*k*sg}];for(const z of b.zones)C.confine(z,40);}
   const H=C.bossHome?.();if(H){b.flightEnd={x:H.x+(b.x<H.x?1:-1)*H.sway*1.6,y:H.y};}}b.emission=0;b.attackAim=b.aim;b.bodyDanger=false;}
 function mouth(b){return b.muzzle||{x:b.x+Math.cos(b.aim)*b.size*.28,y:b.y+Math.sin(b.aim)*b.size*.28-(b.altitude||0)*.65};}
 function effectScale(b){const C=window.KozaCamera,bs=C?.isV2Arena?.()?C.bossScale():0;return clamp(b.size/160*(bs>.86?Math.sqrt(.86/bs):1),.55,1.6);} /* TEST POLISH: a larger drawn dragon keeps its attack scale growing only with sqrt(size) above the 0.86 rollout size */
 function shoot(b,angle,flame=false){if(b.bolts.length>=64)return;const p=mouth(b),s=effectScale(b),v=(flame?235:255)*s; b.bolts.push({x:p.x,y:p.y,px:p.x,py:p.y,vx:Math.cos(angle)*v,vy:Math.sin(angle)*v,a:angle,r:(flame?8:14)*s,scale:s,age:0,ttl:flame?1.35:2.6,flame,element:b.region==='garden'?'moon':'wind',seed:(b.emittedSerial=(b.emittedSerial||0)+1)});}
 function movingHit(p,o){const dx=o.x-o.px,dy=o.y-o.py,q=clamp(((p.x-o.px)*dx+(p.y-o.py)*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(p.x-o.px-dx*q,p.y-o.py-dy*q)<KozaHitbox.boss.flame(o);}
 function ringHit(b,p,r,origin=b){const angle=Math.atan2(p.y-origin.y,p.x-origin.x),a=Math.atan2(Math.sin(angle-b.aim),Math.cos(angle-b.aim));return Math.abs(Math.hypot(p.x-origin.x,p.y-origin.y)-r)<KozaHitbox.boss.ringBand(b)+1&&Math.abs(a)>b.gap;}
 function release(b,orbs,w,h,top){if(b.ending||b.cycle%2||orbs.filter(o=>o.bossMark).length>=4)return;
  const C=window.KozaCamera;if(C?.isV2Arena?.()&&typeof player!=='undefined'){const k=C.px(1),side=(b.cycle%2?1:-1);for(let t=0;t<12;t++){const a=Math.atan2(player.y-b.y,player.x-b.x)+side*(.9+.25*t),r=b.r+k*(1.8+.15*t),o={x:b.x+Math.cos(a)*r,y:b.y+Math.sin(a)*r*C.sin,r:11,phase:b.cycle,bossMark:true,risky:true,gain:2,ttl:7,age:0};C.confine(o,26);if(Math.hypot(o.x-b.x,(o.y-b.y)/C.sin)>=b.r+k*1.3){orbs.push(o);return;}}} /* MAP 1 SCALE ROLLOUT: golden light near the fight */const positions=[[.22,.68],[.78,.53],[.28,.43],[.73,.79]],v=positions[b.cycle%4];let x=clamp(w*v[0],45,w-45),y=clamp(top+(h-top-55)*v[1],top+45,h-65);if(Math.hypot(x-b.x,y-b.y)<b.r+60){x=x<w/2?w*.76:w*.24;}orbs.push({x,y,r:11,phase:b.cycle,bossMark:true,risky:true,gain:2,ttl:7,age:0});}
 function tick(b,dt,p,w,h,top,orbs,scale=1,pose){const emissions=[];const d=dt*scale,oldX=b.x,oldY=b.y;b.bolts??=[];b.age+=d;b.recoil=Math.max(0,b.recoil-dt);b.altitude=0;b.bodyDanger=true;b.recovery=Math.max(0,(b.recovery||0)-d);
  for(const o of b.bolts){o.px=o.x;o.py=o.y;o.age+=d;o.x+=o.vx*d;o.y+=o.vy*d;if(o.flame)o.r=(8+o.age*15)*(o.scale||1);}
  b.bolts=b.bolts.filter(o=>o.age<o.ttl&&o.x>-60&&o.x<w+60&&o.y>top-70&&o.y<h+70);let hit=false;
  // QUALITY PASS: world heading b.hd (KozaBossLocomotion). Idle: turn-then-walk, never sideways. Wind-up: turn to the target.
  // Pounce: body along the leap. Breath / flight fire: head and body follow the aim, so the mouth socket and the flames agree.
  const L=window.KozaBossLocomotion,G=L?.GAITS.dragon;if(L)L.init(b,p);
  if(b.charge>0){b.bodyDanger=false;b.charge=Math.max(0,b.charge-d);if(L&&b.skill!=='ring'&&b.skill!=='twinring'&&b.skill!=='storm')L.face(b,b.skill==='pounce'?Math.atan2(b.destination.y-b.y,b.destination.x-b.x):b.aim,d,G);else if(L)L.face(b,b.hd!=null?L.toScreen(b.hd,window.KozaCamera?.active?.()?KozaCamera.sin:1):b.aim,d,G);if(!b.charge){b.action=duration[b.skill];b.actionTime=0;b.cycle++;b.emission=0;b.origin={x:b.x,y:b.y};if(L&&b.skill==='pounce')b.hd=L.toWorld(Math.atan2(b.destination.y-b.y,b.destination.x-b.x),window.KozaCamera?.active?.()?KozaCamera.sin:1);(b.events||(b.events=[])).push({name:'release',id:b.cycle,index:3,skill:b.skill});}}
  else if(b.action>0){b.actionTime+=d;b.action=Math.max(0,b.action-d);const t=b.actionTime;
   if(L&&(b.skill==='breath'||b.skill==='flyfire'))b.hd=L.toWorld(b.aim,window.KozaCamera?.active?.()?KozaCamera.sin:1);
   if(b.skill==='pounce'&&t-d<1.08&&t>=1.08)(b.events||(b.events=[])).push({name:'impact',id:b.cycle,index:3,skill:'pounce'});
   if(b.skill==='pounce'){const u=clamp(t/1.08,0,1),ease=u*u*(3-2*u);b.x=mix(b.origin.x,b.destination.x,ease);b.y=mix(b.origin.y,b.destination.y,ease);b.altitude=Math.sin(u*Math.PI)*84;b.bodyDanger=false;if(L&&u<1)b.hd=L.toWorld(Math.atan2(b.destination.y-b.origin.y,b.destination.x-b.origin.x),window.KozaCamera?.active?.()?KozaCamera.sin:1); /* Q3: the body flies along its leap (no sideways drift) */hit=t>=1.08&&t<1.38&&Math.hypot(p.x-b.destination.x,p.y-b.destination.y)<67*effectScale(b);if(b.attackPhase===2&&t>=1.32)hit||=ringHit(b,p,(t-1.32)*180,b.destination);}
   if(b.skill==='flyfire'){const u=clamp((t-.35)/3.2,0,1);b.x=mix(b.origin.x,b.flightEnd.x,u);b.y=mix(b.origin.y,b.flightEnd.y,u);const ascent=clamp(t/.55,0,1),descent=clamp((4.02-t)/.37,0,1);b.altitude=55*Math.min(ascent*ascent*(3-2*ascent),descent*descent*(3-2*descent));b.bodyDanger=b.altitude<12;b.aim=b.attackAim+Math.sin((t-.6)*1.3)*.38;if(t>.6&&t<3.1){b.emission-=d;while(b.emission<=0){b.emission+=.045;emissions.push([b.aim+Math.sin(t*9)*.055,true]);}}}
   if(b.skill==='breath'){b.aim=b.attackAim+Math.sin(t*1.7)*.16;if(t>.30&&t<1.72){b.emission-=d;while(b.emission<=0){b.emission+=.045;emissions.push([b.aim+Math.sin(t*12)*.025,true]);}}}
   if(b.skill==='storm')hit=t>=.68&&t<1.28&&b.zones.some(z=>Math.hypot(p.x-z.x,p.y-z.y)<KozaHitbox.boss.storm(b));
   if(b.skill==='ring'||b.skill==='twinring'){hit=ringHit(b,p,t*145);if(b.skill==='twinring'&&t>.8)hit||=ringHit(b,p,(t-.8)*145);}
   if(!b.action){release(b,orbs,w,h,top);b.attack=0;b.altitude=0;b.bodyDanger=false;b.recovery=b.skill==='pounce'?.9:.6; /* Q3: heavier landing recovery */if(L)b.spd=0;(b.events||(b.events=[])).push({name:'recover',id:b.cycle,index:3});}
  }else{b.attack+=d;const H=window.KozaCamera?.bossHome?.(),home=H?H.y:top+(h-top)*.27,desired=H?H.x+Math.sin(b.age*.43)*H.sway:w/2+Math.sin(b.age*.43)*w*.13;if(L){if(b.recovery>0)L.face(b,Math.atan2(p.y-b.y,p.x-b.x),d*.35,G);else L.steer(b,{x:desired,y:home},d,G);}else{b.x+=(desired-b.x)*Math.min(1,d*1.3);b.y+=(home-b.y)*Math.min(1,d*1.1);}if(!b.ending&&b.attack>=b.delay*[1,.85,.72][ph(b)]){prepare(b,p,w,h,top);(b.events||(b.events=[])).push({name:'windup',id:b.cycle,index:3,skill:b.skill});}}
  const bounds=fieldBounds(b,w,h,top);b.x=clamp(b.x,bounds.left,bounds.right);b.y=clamp(b.y,bounds.top,bounds.bottom);b.walk+=Math.hypot(b.x-oldX,b.y-oldY)*.09;b.lift=b.altitude;
  pose?.(b,d);for(const [angle,flame]of emissions){const facing=b.facingAim??b.aim;shoot(b,facing+angle-b.aim,flame);}
  for(const o of b.bolts)if(movingHit(p,o)){hit=true;o.ttl=0;}b.stage=b.charge>0?'windup':b.action>0?'active':(b.recovery||0)>0?'recovery':'ready';return b.ending?false:hit;
 }
 function resize(b,sx,sy){const scale=Math.sqrt(sx*sy);for(const o of b.bolts||[]){if(o.vx!=null)o.vx*=sx;if(o.vy!=null)o.vy*=sy;if(o.r!=null)o.r*=scale;if(o.scale!=null)o.scale*=scale;if(o.vx!=null)o.a=Math.atan2(o.vy,o.vx);}for(const key of ['origin','destination','flightEnd','muzzle'])if(b[key]){b[key].x*=sx;b[key].y*=sy;}for(const o of [...(b.bolts||[]),...(b.zones||[])]){o.x*=sx;o.y*=sy;if(o.px!=null){o.px*=sx;o.py*=sy;}}}
 return {tick,prepare,skills,effectScale,phase:ph,resize};
})();
