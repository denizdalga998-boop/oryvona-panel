'use strict';
// Enemy entrances. Moving creatures enter from beyond an arena edge (or from
// under the HUD band for falling/crossing kinds) instead of appearing in place;
// sentries sprout at logical anchors. Every first harmful position keeps a safe
// distance from the hero. Planning is pure and seedable for tests.
window.KozaSpawn=(()=>{
 // Small deterministic generator (mulberry32) for per-run spawn variety.
 function rng(seed){let a=seed>>>0;return()=>{a=a+0x6D2B79F5>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
 const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 // Keep arrivals apart so two creatures never enter stacked on the same lane.
 const clear=(p,hazards,gap)=>hazards.every(h=>dist(h.entering&&h.target?h.target:h,p)>gap);
 const SENTRY_ANCHORS=[[.22,.25],[.78,.45],[.5,.82],[.24,.65],[.76,.82],[.5,.3],[.18,.42],[.8,.18]];
 // Returns {x,y,vx,vy,entering,target,after} or null when no safe entrance exists now.
 function plan({kind,serial,W,H,top,bottom,player,speed,size,random=Math.random,hazards=[],safe=150}){
  const half=size/2,inset=Math.max(half+6,24),edgeGap=half+8;
  if(kind==='sentry'){
   const spots=SENTRY_ANCHORS.map((_,j)=>SENTRY_ANCHORS[(serial+j)%SENTRY_ANCHORS.length]).map(([ax,ay])=>({x:Math.max(inset,Math.min(W-inset,W*ax)),y:top+(bottom-top)*ay}));
   const spot=spots.find(p=>dist(p,player)>=safe&&hazards.every(h=>dist(h,p)>70));
   return spot?{x:spot.x,y:spot.y,vx:0,vy:0,entering:false,sprout:true}:null;
  }
  const lane=(lo,hi)=>lo+random()*Math.max(0,hi-lo);
  if(kind==='rain'){
   // Falls in from under the HUD band along one of five columns.
   const columns=[0,1,2,3,4].map(i=>inset+i*(W-2*inset)/4),start=serial%5;
   for(let j=0;j<5;j++){const x=columns[(start+j*2)%5],target={x,y:top+half};if((dist(target,player)>=safe*.8||Math.abs(x-player.x)>size*1.4)&&clear(target,hazards,size*1.1))return {x,y:top-edgeGap,vx:0,vy:speed*1.25,entering:true,target,after:{vx:0,vy:speed*1.25}};}
   return null;
  }
  if(kind==='cross'){
   const fromTop=serial%4<2,dir=fromTop?1:-1;
   for(let tries=0;tries<6;tries++){
    const x=lane(inset,W-inset),y0=fromTop?top-edgeGap:bottom+edgeGap,target={x,y:fromTop?top+half:bottom-half};
    if(dist(target,player)>=safe&&clear(target,hazards,size*1.2)){const vy=dir*speed*.65,vx=(random()-.5)*30;return {x,y:y0,vx,vy:dir*Math.max(Math.abs(vy),speed*.9),entering:true,target,after:{vx,vy}};}
   }
   return null;
  }
  // drift / zigzag / hunter: run, slide or fly in from a side edge.
  const preferLeft=serial%2===0;
  for(const left of [preferLeft,!preferLeft]){
   for(let tries=0;tries<8;tries++){
    const y=lane(top+inset,bottom-inset),target={x:left?inset:W-inset,y};
    if(dist(target,player)>=safe&&clear(target,hazards,size*1.2)){const dir=left?1:-1,vy=(random()-.5)*30;return {x:left?-edgeGap:W+edgeGap,y,vx:dir*Math.max(speed*1.5,90),vy:0,entering:true,target,after:{vx:dir*speed,vy}};}
   }
  }
  return null;
 }
 // Advances an entering enemy; returns true once it has fully arrived.
 function enter(h,dt,player=null,safe=150){
  const t=h.target;if(!t){h.entering=false;return true;}
  h.x+=h.vx*dt;h.y+=h.vy*dt;h.enterTime=(h.enterTime||0)+dt;
  const horizontal=Math.abs(h.vx)>=Math.abs(h.vy),arrived=h.enterTime>4||(horizontal?(h.vx>0?h.x>=t.x:h.x<=t.x):(h.vy>0?h.y>=t.y:h.y<=t.y));
  if(!arrived)return false;
  h.entering=false;h.entered=true;h.vx=h.after?.vx??h.vx;h.vy=h.after?.vy??h.vy;delete h.target;delete h.after;
  // A short settle keeps the existing warning beat without a second pop-in. If the
  // hero ran onto the entry point meanwhile, the harmless warning lasts longer.
  h.age=player&&dist(h,player)<safe*.4?.3:Math.max(h.age,h.kind==="rain"||h.kind==="cross"?1:.8);return true;
 }
 return {rng,plan,enter,SENTRY_ANCHORS};
})();
