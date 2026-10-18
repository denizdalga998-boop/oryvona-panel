'use strict';
// Transparent home controls; existing approved chapter crests are preserved.
window.KozaSymbols=(()=>{
 // Reuse the existing RGBA artwork, never an opaque screenshot crop.
 const atlas='menu-ui-v57.png';
 const artRects={logo:[20,205,492,204],light:[586,119,358,339],essence:[1105,119,352,340],friends:[87,580,349,331],play:[1028,635,498,214]};
 function art(name){const [x,y,w,h]=artRects[name];return `<span class="menu-art menu-art-${name}" data-menu-art="${name}" style="aspect-ratio:${w}/${h}"><img src="${atlas}" alt="" aria-hidden="true" draggable="false" style="width:${1536/w*100}%;height:${1024/h*100}%;left:${-x/w*100}%;top:${-y/h*100}%"></span>`;}
 function logo(){return art('logo');}
 function jewel(kind){return art(kind==='essence'?'essence':'light');}
 function wing(){return art('friends');}
 function crest(index,region='garden'){
  const shapes=[
   '<path d="M32 49 21 35l4-7 7 5 7-5 4 7Zm0-3-4-9h8ZM26 30C10 28 7 14 8 7l7 10 8 5-3-13 7 10v11Zm12 0c16-2 19-16 18-23l-7 10-8 5 3-13-7 10v11Z"/>',
   '<path d="M32 8c-13 14-13 22 0 35C45 30 45 22 32 8ZM27 41C13 39 7 27 9 16c12 4 19 12 18 25Zm10 0c14-2 20-14 18-25-12 4-19 12-18 25ZM30 47C16 48 9 42 7 34c12 0 17 4 23 13Zm4 0c14 1 21-5 23-13-12 0-17 4-23 13ZM31 43h2v12h-2Z"/>',
   '<path d="M29 30 32 25l3 5-3 19ZM26 29C16 29 8 22 4 10c9 8 14 8 22 12v7Zm-1 5C14 33 8 28 6 22l19 9v3Zm2 4C17 40 11 35 8 30l18 5ZM38 29c10 0 18-7 22-19-9 8-14 8-22 12v7Zm1 5c11-1 17-6 19-12l-19 9v3Zm-2 4c10 2 16-3 19-8l-18 5ZM28 22l4-6 4 6-4 2Z"/>',
   '<path d="m35 10 7-5-2 10 6 6-7 8-8-1 6-6-5-2C14 27 11 44 26 49c11 4 20-7 17-17 11 12 2 26-12 25C8 55 8 35 22 22l9-9 4-9v6Zm-2 20c-10 10-8 16 2 15-14 9-21-5-10-13Z"/>'
  ];const wolf='<path d="m14 8 13 12h10L50 8l-2 26-16 19-16-19Zm9 18 5 5-7-1Zm18 0-5 5 7-1ZM28 38l4 5 4-5Z"/>';
  return '<span class="boss-emblem" aria-hidden="true"><svg viewBox="0 0 64 64" fill="currentColor"><circle cx="32" cy="32" r="29" fill="#332914" fill-opacity=".7" stroke="currentColor" stroke-width="1"/>'+((region==='grove'&&index===0)?wolf:shapes[index])+'<path d="m32 0 2 5-2 5-2-5Z"/></svg></span>';
 }
 document.querySelectorAll('[data-koza-logo]').forEach(e=>e.innerHTML=logo());
 for(const [selector,art] of [['#lightWallet .feature-icon',jewel('light')],['#essenceWallet .feature-icon',jewel('essence')],['#upgradeOpen .feature-icon',jewel('essence')],['#appearance .feature-icon',wing()]]){const e=document.querySelector(selector);if(e){e.classList.add('ui-art');e.innerHTML=art;}}
 const gear=document.querySelector('#settingsOpen');if(gear)gear.textContent='⚙';
 const playFrame=document.querySelector('.play-frame');if(playFrame)playFrame.innerHTML=art('play');
 // Both initial screens and later-created sheets use the same resource art.
 function watch(root){root.querySelectorAll('.menu-art>img').forEach(img=>{if(img.dataset.watched)return;img.dataset.watched='true';img.addEventListener('error',()=>{
  const el=img.parentElement,host=el.closest('.feature-icon');
  if(host){host.classList.remove('ui-art');el.remove();}
  else if(el.dataset.menuArt==='logo'){el.classList.add('art-unavailable');el.textContent='KOZA';}
  else{el.remove();}
 });});}
 function hydrate(root=document){
  root.querySelectorAll('.feature-icon.i-light,.feature-icon.i-essence').forEach(el=>{
   if(el.classList.contains('ui-art'))return;
   el.classList.add('ui-art');el.innerHTML=jewel(el.classList.contains('i-essence')?'essence':'light');
  });watch(root);
 }
 hydrate();
 return {logo,jewel,wing,crest,artRects,hydrate};
})();
