'use strict';
window.KozaSettings=(()=>{
 const defaults={master:true,music:70,effects:90,haptics:true,quality:'balanced',motion:'system',flash:true,contrast:false,sensitivity:1.6,hints:true};
 function normalize(input){const a=input&&typeof input==='object'?input:{};const s={...defaults};for(const k of ['master','haptics','flash','contrast','hints'])if(typeof a[k]==='boolean')s[k]=a[k];for(const [k,lo,hi] of [['music',0,100],['effects',0,100],['sensitivity',.7,2.4]])if(typeof a[k]==='number'&&Number.isFinite(a[k]))s[k]=Math.min(hi,Math.max(lo,a[k]));if(['balanced','low'].includes(a.quality))s.quality=a.quality;if(['system','reduced','full'].includes(a.motion))s.motion=a.motion;return s;}
 let state,stored=true;try{const raw=localStorage.getItem('koza-settings');state=normalize(raw?JSON.parse(raw):{haptics:localStorage.getItem('koza-haptics')!=='off'});}catch{state=normalize({});stored=false;}
 function update(patch){Object.assign(state,normalize({...state,...patch}));try{localStorage.setItem('koza-settings',JSON.stringify(state));stored=true;}catch{stored=false;}return state;}
 function reset(){return update(defaults);}
 return {state,update,reset,normalize,get stored(){return stored;}};
})();
