'use strict';
window.KozaTopdownMotion=(()=>{
 const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
 function create(){return {vx:0,vy:0,pace:0,phase:0,heading:0,headTurn:0,distance:0,flightPhase:0,moving:false,facing:1,faceTarget:1,faceBlend:1};}
 function advance(m,{dt,dx,dy,moveX,moveY,kind,reduced}){
  const ease=1-Math.exp(-dt*12),travel=Math.hypot(moveX,moveY),intent=Math.hypot(dx,dy)>.5;
  m.vx+=(moveX/Math.max(dt,.001)-m.vx)*ease;m.vy+=(moveY/Math.max(dt,.001)-m.vy)*ease;
  m.pace+=(Math.min(1,travel/Math.max(dt,.001)/220)-m.pace)*ease;
  m.moving=intent&&travel>.015;
  if(intent){const desired=Math.atan2(dy,dx)+Math.PI/2,delta=wrap(desired-m.heading);m.headTurn+=(Math.max(-.26,Math.min(.26,delta))*(reduced?0:1)-m.headTurn)*ease;// Large direction changes turn faster so the hero never visibly walks backwards
  // (moonwalk); small steering corrections stay smooth.
  const rate=8+16*Math.min(1,Math.abs(delta)/Math.PI);m.heading=wrap(m.heading+(reduced?delta:Math.sign(delta)*Math.min(Math.abs(delta),dt*rate)));}
  else m.headTurn*=Math.exp(-dt*12);
  if(m.moving)m.distance+=travel;
  m.flightPhase+=dt*(kind==='pera'?4+2*m.pace:3+2*m.pace);
  // Step cadence follows real travel (one cycle per 125 px) so feet do not slide at
  // higher speeds (swift power, Koru stars, dashes are capped at 3.2 cycles/s).
  if(m.moving)m.phase+=Math.min(travel/125,dt*3.2)*Math.PI*2;else {const rest=Math.ceil((m.phase-1e-8)/Math.PI)*Math.PI;m.phase=Math.min(rest,m.phase+dt*Math.PI*5);}
  return m;
 }
 return {create,advance,wrap};
})();
