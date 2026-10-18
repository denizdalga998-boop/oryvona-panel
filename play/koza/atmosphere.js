'use strict';
// Soft surface light and passing canopy shade sit below all game objects.
// Sprites are made once; no per-frame blur, particles, or gameplay obstacles.
window.KozaAtmosphere=(()=>{
 const cache=new Map();
 function sprite(kind){
  if(cache.has(kind))return cache.get(kind);
  const c=document.createElement('canvas');c.width=256;c.height=128;const g=c.getContext('2d');
  const glow=g.createRadialGradient(128,64,2,128,64,118);
  glow.addColorStop(0,kind==='shade'?'#071633b0':kind==='moon'?'#d2deff90':'#d5ffe5a0');
  glow.addColorStop(.48,kind==='shade'?'#07163365':kind==='moon'?'#a8caff48':'#acffec50');
  glow.addColorStop(1,kind==='shade'?'#07163300':'#bffff000');
  g.fillStyle=glow;g.fillRect(0,0,256,128);cache.set(kind,c);return c;
 }
 function draw(g,{width:w,height:h,region,time,reduced,quality}){
  const grove=region==='grove',t=reduced?0:time,low=quality==='low',count=low?2:4;
  const light=sprite(grove?'moon':'water');g.save();
  for(let i=0;i<count;i++){
   const phase=t*(grove?.065:.10)+i*2.1;
   const x=w*(.17+i*.23)+Math.sin(phase)*w*.035,y=h*(.23+(i%3)*.22)+Math.cos(phase*.7)*h*.012;
   g.save();g.translate(x,y);g.rotate(grove?-.55:-.36);
   g.globalAlpha=(grove?.09:.14)+(reduced?0:Math.sin(phase)*.035);
   g.drawImage(light,-w*.23,-h*.055,w*.46,h*.11);g.restore();
  }
  if(grove){const shade=sprite('shade');g.globalAlpha=low?.10:.14;const x=w*(.5+Math.sin(t*.045)*.18);g.drawImage(shade,x-w*.55,h*.31,w*1.1,h*.35);}
  g.restore();
 }
 return {draw};
})();
