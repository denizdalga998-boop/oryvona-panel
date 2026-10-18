'use strict';
window.KozaEnemies=(()=>{
 const hints={drift:'Süzülen gölgelerin arasından geç.',rain:'Dikenler üstten iner; belirme işaretine dikkat et.',cross:'Çapraz geçişlerin arasındaki boşluğu kullan.',sentry:'Nöbetçi parlayıp hazırlanır; ardından kilitlediği yöne diken fırlatır.',zigzag:'Zikzak gölgeler yön değiştirir.',hunter:'Avcı yavaşlayıp nişan alır, sonra düz bir hamle yapar.'};
 function aim(h,p){h.aim=Math.atan2(p.y-h.y,p.x-h.x);}
 function advance(h,p,dt,m){h.age+=dt;h.recoil=Math.max(0,(h.recoil||0)-dt);if(h.age<=1)return null;
  if(h.kind==='sentry'){
   if(h.charge>0){h.charge=Math.max(0,h.charge-dt);if(h.charge===0){h.recoil=.22;h.attackClock=0;return {x:h.x+Math.cos(h.aim)*(h.r+10),y:h.y+Math.sin(h.aim)*(h.r+10),vx:Math.cos(h.aim)*m.shotSpeed,vy:Math.sin(h.aim)*m.shotSpeed,r:6,age:0,ttl:3.8};}}
   else{h.attackClock=(h.attackClock||0)+dt;if(h.attackClock>=m.fireDelay){aim(h,p);h.charge=.85;}}
   return null;
  }
  if(h.kind==='hunter'){
   if(h.dash>0){h.dash=Math.max(0,h.dash-dt);h.vx=Math.cos(h.aim)*m.dashSpeed;h.vy=Math.sin(h.aim)*m.dashSpeed;}
   else if(h.charge>0){h.charge=Math.max(0,h.charge-dt);h.vx=0;h.vy=0;if(h.charge===0){h.dash=.55;h.attackClock=0;}}
   else{aim(h,p);const speed=m.chaseSpeed;h.vx+=(Math.cos(h.aim)*speed-h.vx)*Math.min(1,dt*2);h.vy+=(Math.sin(h.aim)*speed-h.vy)*Math.min(1,dt*2);h.attackClock=(h.attackClock||0)+dt;if(h.attackClock>=3.1){aim(h,p);h.charge=.85;h.vx=0;h.vy=0;}}
  }else if(h.kind==='zigzag')h.vy=Math.sin(h.age*2.5)*65;
  h.x+=h.vx*dt;h.y+=h.vy*dt;return null;
 }
 return {advance,hints};
})();
