'use strict';
// Menu-only motes: one 2D layer, cached glow sprites, driven by the game's loop.
// Never participates in combat, input, saves or collectible rendering.
window.KozaHomeAtmosphere=(()=>{
 const canvas=document.getElementById('homeAtmosphere'),g=canvas?.getContext('2d');
 const sprites=[];let signature='',lastDraw=-Infinity,wasVisible=false;
 function glow(index){
  if(sprites[index])return sprites[index];
  const c=document.createElement('canvas');c.width=c.height=48;const p=c.getContext('2d');
  const rgb=index?'255,224,153':'162,245,216',light=p.createRadialGradient(24,24,0,24,24,24);
  light.addColorStop(0,`rgba(${rgb},1)`);light.addColorStop(.12,`rgba(${rgb},.9)`);
  light.addColorStop(.3,`rgba(${rgb},.28)`);light.addColorStop(1,`rgba(${rgb},0)`);
  p.fillStyle=light;p.fillRect(0,0,48,48);return sprites[index]=c;
 }
 function position(i,time,width,height,reduced=false){
  const t=reduced?0:time,seed=(Math.sin(i*12.9898+4)*43758.5453)%1;
  return {x:width*(.05+(Math.abs(seed)*.9))+Math.sin(t*.24+i*1.9)*width*.025,
   y:height-((i*79.7+t*(8+i%4*1.4))%(height+40))+20,
   radius:5+i%3*1.6,alpha:.48+(reduced?.14:(Math.sin(t*.8+i)*.5+.5)*.36)};
 }
 function draw({time=0,active=false,reduced=false,quality='balanced',blocked=false}={}){
  if(!g)return;
  const visible=active&&!blocked&&!document.hidden;
  if(!visible){if(wasVisible){canvas.hidden=true;wasVisible=false;}return;}
  canvas.hidden=false;const w=window.innerWidth,h=window.innerHeight,low=quality==='low';
  if(!w||!h)return;
  const ratio=Math.min(window.devicePixelRatio||1,low?1:1.25,Math.sqrt(600000/(w*h)));
  const key=[w,h,ratio,quality,reduced].join(':'),changed=signature!==key||!wasVisible;
  if(changed){signature=key;canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);g.setTransform(ratio,0,0,ratio,0,0);}
  wasVisible=true;
  if(!changed&&(reduced||time-lastDraw<1/(low?20:30)))return;
  lastDraw=time;g.clearRect(0,0,w,h);const count=low?10:24;
  for(let i=0;i<count;i++){const p=position(i,time,w,h,reduced);g.globalAlpha=p.alpha;g.drawImage(glow(i%3===0?1:0),p.x-p.radius,p.y-p.radius,p.radius*2,p.radius*2);}
  g.globalAlpha=1;canvas.dataset.count=String(count);canvas.dataset.motion=reduced?'still':'floating';
 }
 return {draw,position};
})();
