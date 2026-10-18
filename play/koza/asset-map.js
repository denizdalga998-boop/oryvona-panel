'use strict';
// Approved geometry; v5.5 adds skinned copies and retains original GLBs. Campaign level numbers and collision geometry live elsewhere.
window.KozaAssets=(()=>{
 const milestones=Object.freeze([5,10,15,20]);
 // A shuffled bag shows every supplied loading illustration before reuse.
 // This presentation preference is independent of the version-6 game save.
 const loadingImages=Object.freeze(Array.from({length:10},(_,i)=>`loading-scene-${String(i+1).padStart(2,'0')}-v511.png`));
 let loadingBag=[],previousLoadingImage='';
 try{previousLoadingImage=sessionStorage.getItem('koza.loading.previous')||'';}catch{}
 function nextLoadingImage(){
  if(!loadingBag.length){
   loadingBag=[...loadingImages];
   for(let i=loadingBag.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[loadingBag[i],loadingBag[j]]=[loadingBag[j],loadingBag[i]];}
   const end=loadingBag.length-1;
   if(loadingBag[end]===previousLoadingImage)[loadingBag[0],loadingBag[end]]=[loadingBag[end],loadingBag[0]];
  }
  previousLoadingImage=loadingBag.pop();
  try{sessionStorage.setItem('koza.loading.previous',previousLoadingImage);}catch{}
  return previousLoadingImage;
 }
 const regions={};
 for(const region of ['garden','grove']){
  regions[region]={normal:`bg-${region}-normal.png`,enemies:{drift:`enemy-${region}-thorn-rigged-v55.glb`,sentry:`enemy-${region}-flower-rigged-v55.glb`,hunter:`enemy-${region}-hunter-rigged-v55.glb`},bosses:milestones.map(n=>({stage:n,model:`boss-${region}-${String(n).padStart(2,'0')}-rigged-v55.glb`,portrait:`portrait-${region}-${String(n).padStart(2,'0')}.png`,background:`bg-${region}-boss-${String(n).padStart(2,'0')}.png`}))};
 }
 for(const [region,n] of [['garden',15],['garden',20],['grove',15]])regions[region].bosses[n/5-1].model=`boss-${region}-${n}-rigged-v56.glb`;
 regions.grove.enemies.hunter='enemy-grove-hunter-rigged-v56.glb';
 const regionFor=r=>regions[r]?r:'garden';
 function bossFor(region,index){return regions[regionFor(region)].bosses[index]||null;}
 function enemyFor(region,kind){const e=regions[regionFor(region)].enemies;return e[kind]||e.drift;}
 function backgroundFor(region,level){const r=regions[regionFor(region)];return r.bosses.find(b=>b.stage===Number(level))?.background||r.normal;}
 function applyBackground(region,level){const file=backgroundFor(region,level);document.body.style.setProperty('--mission-background',`url("${file}")`);document.body.dataset.background=file;}
 // v5.14 home background slot. A calm, region-independent home painting
 // (HOME-ART-SPEC-v5.14.md) goes here once approved: set available:true. Until then
 // the approved menu painting is shown through the calm fallback treatment in
 // ui-v514.css (softened, darker edges, clear space behind Lumi).
 const homeSlot={file:'menu-home-calm-v514.png',available:false};
 function homeFor(){return homeSlot.available?homeSlot.file:'menu-garden-v57.png';}
 // Future 3D heroes (v5.14 seam): no hero GLB ships yet, so every hero stays a 2D
 // sprite. Map an id to an approved rigged GLB here once one passes review.
 const heroModels={};function heroModelFor(id){return heroModels[id]||null;}
 function applyHome(region){const r=regionFor(region);document.body.style.setProperty('--home-background',`url("${homeFor(r)}")`);document.body.dataset.homeRegion=r;document.body.dataset.homeArt=homeSlot.available?'calm':'fallback';document.body.style.setProperty('--region-thumbnail',`url("map-${r}-clean-v55.png")`);}
 function loadingFor(region,level,challenge=false){const r=regionFor(region);if(r==='grove')return {image:backgroundFor(r,challenge?20:level),lore:challenge?'Rüzgâr Korusu’nda yeni bir meydan okuma başlıyor.':'Rüzgârın izinde, korunun derinliklerine…'};return Number(level)===20?{image:'loading-garden-dragon-v56.png',lore:'En derinde, Kadim Ay Ejderi son sırrı bekliyor…'}:milestones.includes(Number(level))?{image:'loading-garden-guardian-v56.png',lore:'Kadim muhafızlar, bozulan dengeyi korumak için uyandı…'}:{image:'loading-garden-normal-v56.png',lore:'Bir zamanlar Ayışığı Bahçesi ışıkla nefes alıyordu…'};}
 return {homeFor,homeSlot,heroModelFor,applyHome,loadingFor,loadingImages,nextLoadingImage,regions,milestones,regionFor,bossFor,enemyFor,backgroundFor,applyBackground};
})();
