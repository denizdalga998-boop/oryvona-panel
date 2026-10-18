'use strict';
let mapRegion='garden',mapChapter=1;
const MAP_STEP=88;
// v5.14: artwork, route and nodes share ONE virtual coordinate system: the world
// is 1000 units wide and scaled to the trail width, so every node keeps its place
// on the painting on every phone. Node coordinates are given in the painting's own
// percentages ([section, x%, y%] of the ORIGINAL, unmirrored painting).
// The approved region painting is 941x1672, too short for 20 readable stages at
// phone width, so the fallback world stacks three sections of it (full painting,
// mirrored lower part, lower part) joined by soft fog blends. A dedicated tall map
// painting can replace them through MAP_ART[region].tall (see MAP-ART-SPEC-v5.14.md).
const MAP_WORLD_W=1000,MAP_SOURCE={w:941,h:1672},MAP_BLEND=130;
const MAP_SECTIONS=[{crop:[0,0,1,1]},{crop:[0,.3,1,1],mirror:true},{crop:[0,.3,1,1]}];
const MAP_ART={
 garden:{file:'map-garden-clean-v55.png',sections:MAP_SECTIONS,nodes:[[2,56,94],[2,34,88],[2,52,81],[2,38,75],[2,25,69],[2,63,55],[2,44,40],[1,52,88],[1,25,69],[1,63,57],[1,55,45],[0,50,93],[0,35,82],[0,47,66],[0,63,57],[0,44,40],[0,24,34],[0,46,28],[0,66,24],[0,79,18]],tall:null},
 grove:{file:'map-grove-clean-v55.png',sections:MAP_SECTIONS,nodes:[[2,56,94],[2,34,88],[2,52,81],[2,38,75],[2,22,67],[2,63,55],[2,55,46],[1,52,88],[1,22,67],[1,63,55],[1,55,45],[0,50,93],[0,35,82],[0,45,63],[0,12,50],[0,58,42],[0,42,34],[0,58,28],[0,48,22],[0,69,17]],tall:null}
};
// World layout for a region: section rectangles and node points in world units.
function mapWorld(region){
 const art=MAP_ART[region]||MAP_ART.garden,src=art.tall||art,source=src.source||MAP_SOURCE,sections=[];let top=0;
 for(const section of src.sections){const [x0,y0,x1,y1]=section.crop,height=MAP_WORLD_W*((y1-y0)*source.h)/((x1-x0)*source.w);sections.push({...section,top,height});top+=height-MAP_BLEND;}
 const height=top+MAP_BLEND;
 const points=src.nodes.map(([index,px,py])=>{const s=sections[index],[x0,y0,x1,y1]=s.crop;let x=(px/100-x0)/(x1-x0);if(s.mirror)x=1-x;return {x:x*MAP_WORLD_W,y:s.top+(py/100-y0)/(y1-y0)*s.height};});
 return {file:src.file,sections,points,height};
}
function mapScale(){const w=$('mapTrail').clientWidth||Math.min(560,window.innerWidth||390);return w/MAP_WORLD_W;}
// Live UI symbols: no portraits or state baked into the map scenery.
function mapBossEmblem(index){return window.KozaSymbols.crest(index,mapRegion);}
// Screen position (x in % of the trail width, y in px) of stage i+1.
function mapPosition(i){const w=mapWorld(mapRegion),p=w.points[i],k=mapScale();return {x:+(p.x/MAP_WORLD_W*100).toFixed(2),y:Math.round(p.y*k)};}
function mapHeight(){return Math.round(mapWorld(mapRegion).height*mapScale());}
let mapLayoutWidth=-1;
function centerMapChapter(){if(($('mapTrail').clientWidth||0)!==mapLayoutWidth)layoutMap();const p=mapPosition(mapChapter-1),v=$('mapViewport');v.scrollTop=Math.max(0,Math.min(mapHeight()-v.clientHeight,p.y-v.clientHeight*.58));}
// Artwork layers and trail height follow the trail width (called on draw and resize).
function layoutMap(){
 const w=mapWorld(mapRegion),k=mapScale(),trail=$('mapTrail');mapLayoutWidth=trail.clientWidth||0;
 trail.style.height=mapHeight()+'px';trail.style.setProperty?.('--map-k',String(k));
 const art=trail.querySelector?.('.map-art-layer');if(art)art.innerHTML=w.sections.map((s,i)=>{const [x0,y0,x1,y1]=s.crop,cw=x1-x0,ch=y1-y0,pos=(o,c)=>c>=1?0:+(o/(1-c)*100).toFixed(3);
  return `<div class="map-art${s.mirror?' mirrored':''}${i?' blended':''}" style="top:${Math.round(s.top*k)}px;height:${Math.ceil(s.height*k)+1}px;background-image:url('${w.file}');background-size:${+(100/cw).toFixed(3)}% ${+(100/ch).toFixed(3)}%;background-position:${pos(x0,cw)}% ${pos(y0,ch)}%;--blend:${Math.round(MAP_BLEND*k)}px"></div>`;}).join('');
 trail.querySelectorAll?.('[data-chapter]').forEach(b=>{const p=mapPosition(Number(b.dataset.chapter)-1);b.style.left=p.x+'%';b.style.top=p.y+'px';});
}
function openChapterMap(id){
 if(mode!=='home')return;
 mapRegion=Object.hasOwn(Expedition.regions,id)&&Expedition.unlocked(profile,id)?id:'garden';
 mapChapter=profile.campaign.selected[mapRegion];drawChapterMap();
 const entering=$('chapterMap').hidden;$('chapterMap').hidden=false;$('app').hidden=true;document.body.classList.add('map-open');
 if(entering)history.pushState({kozaScreen:'map'},'','#harita');
 requestAnimationFrame(()=>{centerMapChapter();$('mapClose').focus({preventScroll:true});});
}
function drawChapterMap(){
 const r=Expedition.regions[mapRegion],cleared=profile.campaign[mapRegion].filter(n=>n>0).length,groveOpen=Expedition.unlocked(profile,'grove');
 $('mapTitle').textContent=r.name;$('mapProgress').textContent=cleared+' / 20 bölüm · '+profile.campaign[mapRegion].reduce((a,b)=>a+b,0)+' / 60 ★';
 $('mapDescription').textContent=mapRegion==='garden'&&!groveOpen?'Rüzgâr Korusu için 20 bölümün tamamını bitir.':'Yukarı kaydırarak keşfet.';
 $('chapterMap').classList.toggle('grove-map',mapRegion==='grove');const world=mapWorld(mapRegion);$('mapGarden').setAttribute('aria-pressed',String(mapRegion==='garden'));$('mapGrove').setAttribute('aria-pressed',String(mapRegion==='grove'));$('mapGrove').disabled=!groveOpen;$('mapGrove').textContent=groveOpen?'Rüzgâr Korusu':'Rüzgâr Korusu · Kilitli';
 const positions=Array.from({length:20},(_,i)=>mapPosition(i)),points=world.points;
 // The route is drawn in world units over the same painting (smooth Catmull-Rom
 // through the terrain points), so it scales together with art and nodes.
 function route(list){return list.map((p,i)=>{if(!i)return `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;const a=list[i-2]||list[i-1],b=list[i-1],d=list[i+1]||p;return `C ${(b.x+(p.x-a.x)/6).toFixed(1)} ${(b.y+(p.y-a.y)/6).toFixed(1)} ${(p.x-(d.x-b.x)/6).toFixed(1)} ${(p.y-(d.y-b.y)/6).toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;}).join(' ');}
 const path=route(points),passed=route(points.slice(0,Math.min(20,cleared+1)));
 $('mapTrail').innerHTML=`<div class="map-art-layer" aria-hidden="true"></div><svg class="map-path" viewBox="0 0 ${MAP_WORLD_W} ${Math.round(world.height)}" preserveAspectRatio="none" aria-hidden="true"><path d="${path}" class="path-bed"/><path d="${path}" class="path-thread"/><path d="${passed}" class="path-complete"/></svg>`+positions.map((pos,i)=>{
  const n=i+1,m=Expedition.level(mapRegion,n),stars=profile.campaign[mapRegion][i],available=Expedition.available(profile,mapRegion,n),boss=n%5===0;
  return `<button class="chapter-node ${stars?'cleared ':''}${n===mapChapter?'selected ':''}${boss?'milestone':''}" data-chapter="${n}" data-state="${!available?'locked':stars?'completed':'available'}" style="left:${pos.x}%;top:${pos.y}px" ${!available?'disabled ':''}aria-label="Bölüm ${n}, ${m.name}, ${available?stars+' yıldız':'kilitli'}" aria-pressed="${n===mapChapter}">${boss?mapBossEmblem(n/5-1):''}<b>${n}</b><span class="node-state" aria-hidden="true">${stars?'★'.repeat(stars)+'☆'.repeat(3-stars):available?'•':'▣'}</span></button>`;
 }).join('');
 $('mapTrail').querySelectorAll('[data-chapter]').forEach(button=>button.onclick=()=>selectMapChapter(Number(button.dataset.chapter)));
 layoutMap();updateChapterDetail();
}
function selectMapChapter(n){
 if(!Expedition.available(profile,mapRegion,n))return;mapChapter=n;
 for(const b of $('mapTrail').querySelectorAll('[data-chapter]')){const selected=Number(b.dataset.chapter)===n;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));}
 updateChapterDetail();requestAnimationFrame(centerMapChapter);
}
function updateChapterDetail(){
 const m=Expedition.level(mapRegion,mapChapter),available=Expedition.available(profile,mapRegion,mapChapter),cleared=profile.campaign[mapRegion][mapChapter-1]>0;
 $('guardianPreview').hidden=!m.boss;$('chapterTitle').textContent=mapChapter+'. '+(m.boss?KozaRunFlow.bossPreview(m.number,mapRegion).name:m.name);$('chapterGoal').textContent=Expedition.description(m);
 if(m.boss){const boss=KozaRunFlow.bossPreview(m.number,mapRegion);$('guardianPreview').innerHTML=mapBossEmblem(boss.index)+'<div><p>'+boss.name+'</p><span class="boss-skill">'+boss.skill.name+'</span></div>';}
 $('chapterRules').textContent=m.duration+' saniye · '+(m.boss?'Muhafız karşılaşması':window.KozaEnemies.hints[m.pattern]);
 $('chapterReward').textContent=cleared?'Tekrar: +'+(4+Math.floor((m.number-1)/5)*2)+' ışık · +3–5 öz':'İlk tamamlama: +'+m.bonus+' ışık · +3–5 öz';
 const record=profile.records?.[mapRegion+'-'+mapChapter];if(record?.clears)$('chapterReward').textContent+=' · Rekor '+record.bestScore;
 $('chapterStart').disabled=!available;$('chapterStart').textContent=available?'Bu bölüme başla →':'Önce önceki bölümleri tamamla';
}
$('mapGarden').onclick=()=>openChapterMap('garden');$('mapGrove').onclick=()=>{if(Expedition.unlocked(profile,'grove'))openChapterMap('grove');};$('mapClose').onclick=()=>closeChapterMap();
$('mapViewport').addEventListener('keydown',event=>{
 const amount=event.key==='ArrowUp'?-MAP_STEP:event.key==='ArrowDown'?MAP_STEP:event.key==='PageUp'?-$('mapViewport').clientHeight*.8:event.key==='PageDown'?$('mapViewport').clientHeight*.8:0;
 if(amount){event.preventDefault();$('mapViewport').scrollBy({top:amount,behavior:reduced?'auto':'smooth'});}
 if(event.key==='Home'||event.key==='End'){event.preventDefault();$('mapViewport').scrollTop=event.key==='Home'?mapHeight():0;}
});
$('chapterStart').onclick=()=>{if(mode!=='home'||!Expedition.available(profile,mapRegion,mapChapter))return;profile.region=mapRegion;profile.campaign.selected[mapRegion]=mapChapter;save();refresh();closeChapterMap();begin();};
$('resultMap').onclick=()=>{home();openChapterMap(profile.region);};
function closeChapterMap(fromHistory=false){const wasOpen=!$('chapterMap').hidden;$('chapterMap').hidden=true;$('app').hidden=false;document.body.classList.remove('map-open');if(wasOpen&&!fromHistory){if(history.state?.kozaScreen==='map')history.back();else if(location.hash==='#harita')history.replaceState(null,'',location.pathname+location.search);}if(mode==='home'){$('regionOpen').focus({preventScroll:true});resize();}}
window.addEventListener('popstate',()=>{if(history.state?.kozaScreen==='map'){if(mode==='home')openChapterMapFromHistory();}else if(!$('chapterMap').hidden)closeChapterMap(true);});
function openChapterMapFromHistory(){mapRegion=Expedition.unlocked(profile,mapRegion)?mapRegion:'garden';mapChapter=profile.campaign.selected[mapRegion];drawChapterMap();$('chapterMap').hidden=false;$('app').hidden=true;document.body.classList.add('map-open');requestAnimationFrame(centerMapChapter);}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('chapterMap').hidden){e.preventDefault();closeChapterMap();}});
window.addEventListener('resize',()=>{if(!$('chapterMap').hidden){layoutMap();centerMapChapter();}});
if(location.hash==='#harita')openChapterMapFromHistory();
