'use strict';
window.KozaScreen=(()=>{
 let requesting=false,requestSerial=0,requestDeadline=0,pending=0,settle=0,watchdog=0,until=0,burstStart=0,lastFit=-Infinity,reframe=false;
 const now=()=>performance.now();
 function apply(){if(typeof resize==='function')resize();}
 function fit(){
  const t=now();
  // Viewport resize/ResizeObserver bursts must never freeze simulation forever.
  if(t-lastFit>500){burstStart=t;reframe=true;}
  lastFit=t;until=Math.min(t+220,burstStart+650);
  if(!pending)pending=requestAnimationFrame(()=>{pending=0;apply();});
  clearTimeout(settle);settle=setTimeout(apply,180);
 }
 function complete(token=requestSerial){if(token!==requestSerial)return;requesting=false;clearTimeout(watchdog);fit();}
 function enter(){
  const t=now();if((requesting&&t<requestDeadline)||document.fullscreenElement||navigator.userActivation?.isActive===false)return;
  const root=document.documentElement;if(!root.requestFullscreen||document.fullscreenEnabled===false)return;
  const token=++requestSerial;requesting=true;reframe=true;requestDeadline=t+1200;until=t+650;
  // Android browser promises can stay pending even after fullscreenchange.
  // The event and this bounded watchdog both release the transition lock.
  clearTimeout(watchdog);watchdog=setTimeout(()=>complete(token),1200);
  try{Promise.resolve(root.requestFullscreen({navigationUI:'hide'})).then(()=>complete(token),()=>complete(token));}catch{complete(token);}
 }
 document.addEventListener('fullscreenchange',()=>{
  requestSerial++;requesting=false;clearTimeout(watchdog);if(typeof release==='function')release();fit();
  if(!document.fullscreenElement&&typeof mode!=='undefined'&&mode==='play')pause();
 });
 document.addEventListener('fullscreenerror',()=>complete());
 window.visualViewport?.addEventListener('resize',fit);window.addEventListener('resize',fit);
 return {enter,fit,takeResumeFrame(){const value=reframe;reframe=false;return value;},get transitioning(){const t=now();return(requesting&&t<requestDeadline)||t<until;}};
})();
