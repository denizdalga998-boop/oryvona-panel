'use strict';
/* Q3.1: one cached 128 px sprite per soft radial gradient (static look, drawn scaled + globalAlpha) instead of a new gradient per frame */
window.KozaGradCache=(()=>{const m=new Map();const S=128;function make(key,fn){let c=m.get(key);if(!c){c=document.createElement('canvas');c.width=c.height=S;fn(c.getContext('2d'),S);m.set(key,c);}return c;}
 function sprite(key,stops){return make(key,(x,s)=>{const gr=x.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);for(const [o,col] of stops)gr.addColorStop(o,col);x.fillStyle=gr;x.beginPath();x.arc(s/2,s/2,s/2,0,Math.PI*2);x.fill();});}
 function blit(g,c,cx,cy,r,alpha=1){if(!(r>0)||!(alpha>0))return;const a0=g.globalAlpha;g.globalAlpha=a0*Math.min(1,alpha);g.drawImage(c,cx-r,cy-r,r*2,r*2);g.globalAlpha=a0;}
 return {make,sprite,blit,disc:(g,key,stops,cx,cy,r,alpha=1)=>blit(g,sprite(key,stops),cx,cy,r,alpha),on:()=>window.KOZA_PERF?.gradCache!==false,get size(){return m.size;}};})();
window.KozaCombatFX=(()=>{
 const palettes={garden:['#78bbeb','#c3e4ff','#f0f7ff'],grove:['#7dc5bd','#caefe2','#f1fff4'],moon:['#9568e6','#d4b2ff','#fff2dc'],fire:['#e34e39','#ffb75c','#fff2bc'],venom:['#488866','#9aff82','#efffd3']};
 const glowCache=new Map();
 function glow(g,x,y,r,color,alpha=1){if(r<=0||alpha<=0)return;let sprite=glowCache.get(color);if(!sprite){sprite=document.createElement('canvas');sprite.width=sprite.height=64;const c=sprite.getContext('2d'),h=c.createRadialGradient(32,32,0,32,32,32);h.addColorStop(0,color);h.addColorStop(.25,color+'aa');h.addColorStop(1,color+'00');c.fillStyle=h;c.fillRect(0,0,64,64);glowCache.set(color,sprite);}const a0=g.globalAlpha;g.globalAlpha=a0*alpha;g.drawImage(sprite,x-r,y-r,r*2,r*2);g.globalAlpha=a0;}
 /* Q3.1 per-frame budget for DECORATIVE glow sprites (outer glow, motes, trails, aura). Telegraphs, impact cores and hit shapes never use it. */
 let gdLeft=1/0,gdAt=0;function gd(g,x,y,r,color,alpha=1){const t=performance.now();if(t-gdAt>6){gdAt=t;const B=window.KOZA_PERF?.fxBudget;gdLeft=B==null?1/0:B;}if(gdLeft<=0)return;gdLeft--;glow(g,x,y,r,color,alpha);}
 function warm(types=['garden','grove','moon']){for(const k of types)for(const c of palettes[k]||[])if(!glowCache.has(c))glow(warmCtx,0,0,1,c,0);} const warmCtx={globalAlpha:1,drawImage(){}}; /* Q3: glow sprites are built at boss start, not on the first attack frame */


 // Moon mist / wind ribbons follow the actual damage particles. No leaf atlas,
 // orange flame texture, guide beam or collectible-shaped sparkle.
 function plume(g,particles,type,low,reduced,time){
  const colors=palettes[type];
  for(const o of particles){
   const fade=Math.max(0,Math.min(1,o.age/.07,(o.ttl-o.age)/.24));if(fade<=0)continue;
   const seed=o.seed||0,r=o.r,phase=reduced?seed:o.age*4+seed;
   g.save();g.globalCompositeOperation='lighter';if(particles.length<=24||seed%2===0)gd(g,o.x,o.y,r*1.06,colors[0],fade*(particles.length>24?.5:.35));
   g.translate(o.x,o.y);g.rotate(o.a);g.globalAlpha*=fade*.78;g.strokeStyle=colors[1];g.lineWidth=low?1.4:1.8;
   if(type==='garden'){
    // A crescent edge in the mist; its size remains inside the damaging radius.
    if(seed%(low?3:2)===0){g.beginPath();g.ellipse(0,0,r*.45,r*.8,Math.sin(phase)*.15,-1.15,1.15);g.stroke();}
   }else{
    const bend=Math.sin(phase)*r*.3;g.beginPath();g.moveTo(-r*.8,-r*.35);g.quadraticCurveTo(0,bend,r*.8,r*.2);g.stroke();
    if(!low){g.globalAlpha*=.5;g.beginPath();g.moveTo(-r*.5,r*.4);g.quadraticCurveTo(0,-bend,r*.5,-r*.25);g.stroke();}
   }
   g.restore();
  }
 }
 function bolt(g,x,y,a,time,type='moon',size=1,low=false){const colors=palettes[type];g.save();g.globalCompositeOperation='lighter';const count=low?4:7;for(let i=count;i>=0;i--){const f=i/count,d=f*48*size,side=Math.sin(time*15-i*1.7)*f*6*size,r=(1-f*.8)*10*size;(i<=1?glow:gd)(g,x-Math.cos(a)*d-Math.sin(a)*side,y-Math.sin(a)*d+Math.cos(a)*side,r*2,colors[0],(1-f)*.55);}glow(g,x,y,23*size,colors[1],.8);g.fillStyle=colors[2];g.beginPath();g.ellipse(x,y,7*size,4*size,a,0,Math.PI*2);g.fill();g.restore();}
 function burst(g,x,y,t,type='moon',radius=42,low=false){const colors=palettes[type];g.save();g.globalCompositeOperation='lighter';glow(g,x,y,radius,colors[0],.40);const n=low?6:12;for(let i=0;i<n;i++){const a=i*2.399,d=radius*(.15+((i*.137+t*.6)%1));gd(g,x+Math.cos(a)*d,y+Math.sin(a)*d*.65,3+(1-d/radius)*6,colors[i%2],1-d/radius);}g.restore();}
 const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
 function chargeLight(g,b,t,type,low,reduced){
  const c=palettes[type],p=b.muzzle||b,chest=b.chestLight||p;
  const amount=clamp(1-b.charge/(b.chargeTotal||1));
  const nature=type==='garden';
  g.save();g.globalCompositeOperation='lighter';
  glow(g,chest.x,chest.y,20+amount*12,c[0],.12+amount*.16);
  glow(g,p.x,p.y,(nature?7:17)+amount*(nature?7:17),c[0],nature?.18+amount*.12:.35+amount*.25);
  glow(g,p.x,p.y,(nature?2:5)+amount*(nature?2:9),c[2],nature?.16+amount*.14:.45+amount*.4);
  const n=low?6:12;
  for(let i=0;i<n;i++){
   const u=(i/n+(reduced?0:t*.72))%1,a=i*2.399+u*3.1,r=(1-u)*(29+amount*14);
   const x=p.x+Math.cos(a)*r,y=p.y+Math.sin(a)*r*.74;
   gd(g,x,y,(nature?1:2.2)+u*(nature?1:1.6),i%3===0?c[2]:c[1],u*(nature?.55:.8));
  }
  g.restore();
 }
 function landing(g,b,clock,type,low,reduced){
  if(!b.destination)return;
  const z=b.destination,c=palettes[type],radius=67*(window.KozaDragonCombat?.effectScale(b)||1);
  const warning=b.charge>0||b.action>0&&clock<1.08;
  if(warning){
   const amount=b.charge?clamp(1-b.charge/b.chargeTotal)*.45:.45+.55*clamp(clock/1.08);
   g.save();g.fillStyle='rgba(5,18,37,'+(.12+amount*.23)+')';
   g.beginPath();g.arc(z.x,z.y,radius,0,Math.PI*2);g.fill();
   g.globalCompositeOperation='lighter';glow(g,z.x,z.y,radius,c[0],.16+amount*.15);
   // The luminous edge marks the actual 67px impact radius, without a guide line.
   const n=low?18:32;
   for(let i=0;i<n;i++){
    const a=i/n*Math.PI*2;glow(g,z.x+Math.cos(a)*radius,z.y+Math.sin(a)*radius,5+amount*2,c[1],.18+amount*.43);
   }
   g.restore();return;
  }
  if(!b.action||clock<1.08||clock>1.73)return;
  const age=clock-1.08,u=clamp(age/.65),active=age<.30;
  g.save();g.globalCompositeOperation='lighter';
  // The bright filled area persists for the entire damage window.
  if(active){glow(g,z.x,z.y,radius,c[1],.44);glow(g,z.x,z.y,27,c[2],.70*(1-age/.30));}
  const r=radius*clamp(age/.20),n=low?16:30;
  for(let i=0;i<n;i++){
   const a=i/n*Math.PI*2;
   glow(g,z.x+Math.cos(a)*r,z.y+Math.sin(a)*r,6*(1-u)+2,i%3===0?c[2]:c[1],(1-u)*.8);
  }
  if(!reduced)for(let i=0;i<(low?8:18);i++){
   const a=i*2.399,d=(15+(i%5)*9)*u,x=z.x+Math.cos(a)*d,y=z.y+Math.sin(a)*d-Math.sin(u*Math.PI)*(12+i%4*4);
   gd(g,x,y,2.8,i%2?c[1]:c[2],(1-u)*.9);
  }
  g.restore();
 }
 function dragon(g,b,low,reducedMotion,layer){
  const type=b.region==='grove'?'grove':'garden',colors=palettes[type],t=reducedMotion?0:b.age,clock=b.actionTime||0;
  if(layer==='over'){
   if(b.charge&&(b.skill==='breath'||b.skill==='flyfire'))chargeLight(g,b,t,type,low,reducedMotion);
   const exhaling=b.action&&((b.skill==='breath'&&clock>.30&&clock<1.72)||(b.skill==='flyfire'&&clock>.6&&clock<3.1));
   if(exhaling){const p=b.muzzle||b,nature=type==='garden';g.save();g.globalCompositeOperation='lighter';glow(g,p.x,p.y,nature?11:22,colors[0],nature?.22:.48);glow(g,p.x,p.y,nature?3:9,colors[2],nature?.30:.90);g.restore();}
   const liveFlames=(b.bolts||[]).filter(o=>o.flame&&o.ttl>0);plume(g,liveFlames,type,low,reducedMotion,t);
   for(const o of b.bolts||[]){
    if(o.ttl<=0)continue;
    if(o.flame){continue;
    }else{
     // Decorative tail is clipped to distance travelled, so it cannot start behind the mouth.
     const travel=Math.min(1,o.age*255/55);
     g.save();g.globalCompositeOperation='lighter';
     const n=low?3:6;
     for(let i=n;i>0;i--){const f=i/n,d=f*48*travel,side=reducedMotion?0:Math.sin(o.age*13-i*1.6)*f*4;
      gd(g,o.x-Math.cos(o.a)*d-Math.sin(o.a)*side,o.y-Math.sin(o.a)*d+Math.cos(o.a)*side,o.r*(1-f*.7),i%2?colors[0]:colors[1],(1-f*.75)*.45);
     }
     glow(g,o.x,o.y,o.r*1.5,colors[0],.50);glow(g,o.x,o.y,o.r*.95,colors[1],.80);glow(g,o.x,o.y,o.r*.36,colors[2],.95);g.restore();
    }
   }
   return; /* Q3: no guardian recoil (light never damages a guardian) */
  }
  if(b.skill==='pounce')landing(g,b,clock,type,low,reducedMotion);
  if(b.skill==='storm'&&(b.charge||b.action))for(const z of b.zones){
   if(b.charge){glow(g,z.x,z.y,43*(window.KozaHitbox?.bossFx(b)||1),colors[0],.22);continue;}
   if(clock<.68){const fall=(.68-clock)*380;bolt(g,z.x-fall*.25,z.y-fall,Math.atan2(1,.25),t,type,1.4,low);}
   else if(clock<1.28)burst(g,z.x,z.y,t,type,43*(window.KozaHitbox?.bossFx(b)||1),low);
  }
  if(b.action&&(b.skill==='ring'||b.skill==='twinring'||b.skill==='pounce'&&b.attackPhase===2&&clock>=1.32)){
   const radii=b.skill==='pounce'?[(clock-1.32)*180]:[clock*145];if(b.skill==='twinring'&&clock>.8)radii.push((clock-.8)*145);
   const origin=b.skill==='pounce'?b.destination:b;
   for(const r of radii){const gap=b.gap||.65,n=Math.min(low?36:56,Math.max(12,Math.ceil(r*.24)));
    for(let i=0;i<=n;i++){const a=b.aim+gap+(Math.PI*2-gap*2)*i/n;glow(g,origin.x+Math.cos(a)*r,origin.y+Math.sin(a)*r,14,colors[i%2],.88);}
   }
  }
 }
 
 // QUALITY PASS - wind-up telegraphs that show the REAL threat shape before it is active (same geometry as the hit tests):
 // bolt lanes (deer / shell guardian: origin b.r+12 along each zone, hit radius KozaHitbox.boss.bolt) and the owl's dive
 // path + landing ring (KozaHitbox.boss.dive). Soft, map-coloured, grows through the wind-up; no screen-wide flashes.
 const laneGrad=new Map();
 function lane(g,b,z,c,a,low,reduced,t,u=1){const K=window.KozaCamera?.active?.()?KozaCamera.px(1):50,w=(window.KozaHitbox?.boss.bolt(b)||24),len=K*(2.2+2.3*Math.min(1,u*1.4));const ang=Math.atan2(z.ey-z.y,z.ex-z.x),x0=z.x+Math.cos(ang)*(b.r+12),y0=z.y+Math.sin(ang)*(b.r+12);
    g.save();g.translate(x0,y0);g.rotate(ang);g.globalCompositeOperation='lighter';
    /* Q3 perf: ONE cached unit-length gradient per colour (fixed stops, intensity via globalAlpha, length via scale) instead of a new gradient per lane per frame */
    let grad=laneGrad.get(c[0]);if(!grad){grad=g.createLinearGradient(0,0,1,0);grad.addColorStop(0,c[0]+'00');grad.addColorStop(.12,c[0]+'f2');grad.addColorStop(1,c[0]+'00');laneGrad.set(c[0],grad);}
    g.save();g.scale(len,1);g.globalAlpha=Math.min(1.05,a);g.fillStyle=grad;g.beginPath();g.moveTo(0,-w*.7);g.lineTo(1,-w);g.lineTo(1,w);g.lineTo(0,w*.7);g.closePath();g.fill();g.restore();
    if(!low){g.strokeStyle=c[2];g.lineWidth=1.3;const n=3;for(let i=0;i<n;i++){const f=((i/n)+(reduced?0:t*.8))%1,x=f*len*.85+8;g.globalAlpha=a*(1-f)*1.6;g.beginPath();g.moveTo(x-5,-w*.38);g.lineTo(x+3,0);g.lineTo(x-5,w*.38);g.stroke();}}
    g.restore();}
 function telegraph(g,b,t,type,low,reduced,fade=1){
  const total=b.chargeTotal||(b.index===2?1.2:1.05),u=b.charge>0?clamp(1-b.charge/total):1,c=palettes[type],late=u>.72;
  const a=(.10+.30*u)*(late&&!reduced?.85+.15*Math.sin(t*22):1)*fade;
  g.save();
  if((b.index===0||b.index===1)&&b.zones?.length){
   // soft lane: band the width of the real bolt hit radius, fading out ~4.5 wu from the body (the first, readable part of the path)
   const K=window.KozaCamera?.active?.()?KozaCamera.px(1):50,w=(window.KozaHitbox?.boss.bolt(b)||24),len=K*(2.2+2.3*Math.min(1,u*1.4));
   for(const z of b.zones){if(z.delay){const ang=Math.atan2(z.ey-z.y,z.ex-z.x),x0=z.x+Math.cos(ang)*(b.r+12),y0=z.y+Math.sin(ang)*(b.r+12);g.save();g.globalCompositeOperation='lighter';g.strokeStyle=c[1];g.globalAlpha=a*.9;g.lineWidth=1.4;g.setLineDash?.([5,7]);g.beginPath();g.moveTo(x0,y0);g.lineTo(x0+Math.cos(ang)*len*.7,y0+Math.sin(ang)*len*.7);g.stroke();g.restore();continue;}lane(g,b,z,c,a,low,reduced,t,u);}
  }
  if(b.index===2&&b.destination){const z=b.destination,R=(window.KozaHitbox?.boss.dive(b)||b.r+14),sq=window.KozaCamera?.active?.()?KozaCamera.sin:1;
   g.globalAlpha=1;g.fillStyle='rgba(8,24,40,'+(a*.8)+')';g.beginPath();g.ellipse(z.x,z.y,R,R*sq,0,0,Math.PI*2);g.fill();
   g.globalCompositeOperation='lighter';g.strokeStyle=c[1];g.globalAlpha=a*1.4;g.lineWidth=low?1.4:2;g.beginPath();g.ellipse(z.x,z.y,R*(1.25-.25*u),R*(1.25-.25*u)*sq,0,0,Math.PI*2);g.stroke();
   g.setLineDash?.([6,7]);g.lineDashOffset=reduced?0:-t*30;g.globalAlpha=a;g.beginPath();g.moveTo(b.x,b.y);g.lineTo(z.x,z.y);g.stroke();g.setLineDash?.([]);}
  g.restore();
 }
 function boss(g,b,layer='under'){const low=typeof preferences!=='undefined'&&preferences.quality==='low',reducedMotion=typeof reduced!=='undefined'&&reduced,type=b.region==='grove'?'grove':'garden',t=reducedMotion?0:b.age;if(b.defeating)return;if(b.index===3){dragon(g,b,low,reducedMotion,layer);return;}
  g.save();g.globalCompositeOperation='lighter';for(let i=0;i<(low?4:10);i++){const a=i*2.399+t*.35,r=b.r*(.65+(i%3)*.18);gd(g,b.x+Math.cos(a)*r,b.y+Math.sin(a)*r*.46-8,2+(i%2)*2,palettes[type][1],.35);}g.restore();
  if(b.charge){burst(g,b.x,b.y-b.size*.12,t,type,b.r*.65,low);telegraph(g,b,t,type,low,reducedMotion);return;}
  if(!b.action)return;
  if(b.index===0||b.index===1||(b.index===3&&b.skill==='breath')){for(const z of b.zones){const a=Math.atan2(z.ey-z.y,z.ex-z.x),lt=b.actionTime-(z.delay||0);if(lt<0){if(lt>-.45&&!b.ending)lane(g,b,z,palettes[type],1+lt/.45,low,reducedMotion,t);continue;}const d=b.r+12+lt*b.boltSpeed;bolt(g,z.x+Math.cos(a)*d,z.y+Math.sin(a)*d,a,t,type,(b.index===3?1.5:1.15)*(window.KozaHitbox?.bossFx(b)||1),low);}return;}
  if(b.index===2){if(b.actionTime<.8)telegraph(g,b,t,type,low,reducedMotion,1-b.actionTime/.8);for(let i=1;i<7;i++){const f=Math.max(0,b.actionTime/.8-i*.035),ease=f*f*(3-2*f),x=b.origin.x+(b.destination.x-b.origin.x)*ease,y=b.origin.y+(b.destination.y-b.origin.y)*ease;gd(g,x,y,22, palettes[type][0],(1-i/7)*.3);}burst(g,b.x,b.y,t,type,28,low);return;}
  if(b.skill==='storm'){for(const z of b.zones){if(b.actionTime<.65){const fall=(.65-b.actionTime)*380;bolt(g,z.x-fall*.25,z.y-fall,Math.atan2(1,.25),t,type,1.65*(window.KozaHitbox?.bossFx(b)||1),low);}else burst(g,z.x,z.y,t,type,43*(window.KozaHitbox?.bossFx(b)||1),low);}return;}
  const radii=[b.actionTime*145];if(b.skill==='twinring'&&b.actionTime>.8)radii.push((b.actionTime-.8)*145);
  for(const r of radii){const gap=b.gap||.65,count=Math.min(low?60:110,Math.max(8,Math.ceil(r*(Math.PI*2-gap*2)/17)));for(let i=0;i<=count;i++){const a=b.aim+gap+(Math.PI*2-gap*2)*i/count;glow(g,b.x+Math.cos(a)*r,b.y+Math.sin(a)*r,12*(window.KozaHitbox?.bossFx(b)||1),palettes[type][i%2],.85);if(i%4===0)gd(g,b.x+Math.cos(a)*(r-7),b.y+Math.sin(a)*(r-7),4,palettes[type][2],.8);}}
 }
 return {glow,bolt,burst,boss,warm,prepare:()=>Promise.resolve()};
})();
