'use strict';
// KOZA Map 1 - QA / TEST BUILD direct arena entry.
// MAP 1 TEST POLISH PASS + HERO EVOLUTION (12 hero forms): this file belongs to the TEST BUILD only. Here QA mode is ON by default (?qa=0 turns it off);
// in a production build the file is simply not shipped. In QA mode the game runs on a SEPARATE test save
// (key "koza-testbuild-v1": the player's real save keys are never read or written), kept between visits on this device,
// every Map 1 stage 1-20 is open, and resources are topped up at each start (Işık >= 9999, Öz >= 999).
// A small "QA · TEST" chip opens direct entry into Main / Boss05 / Boss10 / Boss15 / Boss20.
(()=>{
 const TEST_BUILD=true,TEST_KEY='koza-testbuild-v1',FLOOR={coins:9999,essence:999};
 let on=false;try{on=TEST_BUILD?!/[?&]qa=0\b/.test(location.search):/[?&]qa=1\b/.test(location.search);}catch{}
 window.KOZA_QA=on;window.KOZA_TEST_BUILD=TEST_BUILD&&on;if(!on)return;
 let real=null;try{real=window.localStorage;}catch{}
 const memory=new Map();let fresh=false;try{fresh=/[?&]fresh=1\b/.test(location.search);if(!fresh){const raw=real?.getItem(TEST_KEY);if(raw)for(const [k,v] of JSON.parse(raw))memory.set(k,String(v));}}catch{}
 let pending=null;const persist=()=>{if(!real)return;clearTimeout(pending);pending=setTimeout(()=>{try{real.setItem(TEST_KEY,JSON.stringify([...memory]));}catch{}},120);};
 try{Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>memory.has(k)?memory.get(k):null,setItem:(k,v)=>{memory.set(k,String(v));persist();},removeItem:k=>{memory.delete(k);persist();},clear:()=>{memory.clear();persist();},key:i=>[...memory.keys()][i]??null,get length(){return memory.size;}}});}catch{}
 function resetTestSave(){try{real?.removeItem(TEST_KEY);}catch{}memory.clear();location.replace(location.pathname+location.search.replace(/[?&]fresh=1\b/,''));}
 // HERO EVOLUTION QA: hero + form selector. Form N = existing star level N-1 (KozaProgress bounds 0/12/42/102 points);
 // only the separate test save is changed. Evolution preview steps Form 1 -> 4 on the active hero.
 const HEROES=[['lumi','Lumi'],['koru','Koru'],['pera','Pera']],BOUNDS=[0,12,42,102];
 function unlockAll(){for(const [id] of HEROES)if(!profile.pets[id])profile.pets[id]={name:Progress.catalog[id].name,points:0};profile=Progress.normalize(profile);}
 const curForm=()=>{try{return petState().star+1;}catch{return 1;}};
 function setHero(id){unlockAll();profile.active=id;profile=Progress.normalize(profile);save();refresh();try{KozaTopdown?.load?.(id);}catch{}if(id!=='lumi')window.KozaHeroes3D?.ensure?.(id,curForm());paintHero();}
 function setForm(f){unlockAll();profile.pets[profile.active].points=BOUNDS[f-1];profile=Progress.normalize(profile);save();refresh();if(profile.active!=='lumi')window.KozaHeroes3D?.ensure?.(profile.active,f);paintHero();}
 let preview=null;function evolutionPreview(){if(preview)return;const id=profile.active,start=curForm();if(id!=='lumi')window.KozaHeroes3D?.preloadAll?.(id);let f=1;setForm(1);preview=setInterval(()=>{f++;if(f>4){clearInterval(preview);preview=null;setForm(start);return;}setForm(f);},1700);}
 function paintHero(){document.querySelectorAll('#qaPanel [data-hero]').forEach(b=>{b.dataset.on=String(b.dataset.hero===profile.active);});document.querySelectorAll('#qaPanel [data-form]').forEach(b=>{b.dataset.on=String(Number(b.dataset.form)===curForm());});
  }
 const STAGES=[['Ana arena (1)',1],['Ana arena (6)',6],['Boss 5 · Muhafız',5],['Boss 10 · İnci Kabuk',10],['Boss 15 · Ay Kanadı',15],['Boss 20 · Ejder',20]];
 function seed(){
  // First visit: a fresh test profile. Later visits: the saved test profile is kept (upgrades, pets, stars), only topped up.
  // 19 cleared stages keep Map 2 locked; every Map 1 stage 1-20 is selectable.
  const first=!memory.has('koza-testbuild-seeded');
  if(first)profile=Progress.normalize({version:6,coins:FLOOR.coins,essence:FLOOR.essence,region:'garden',pets:{lumi:{name:'Lumi',points:0}},campaign:{garden:Array(19).fill(1).concat([0]),grove:Array(20).fill(0),selected:{garden:1,grove:1},groveUnlocked:false}});
  else{profile.coins=Math.max(profile.coins,FLOOR.coins);profile.essence=Math.max(profile.essence,FLOOR.essence);const g=profile.campaign.garden;for(let i=0;i<19;i++)if(!g[i])g[i]=1;profile.region='garden';}
  unlockAll();
  memory.set('koza-testbuild-seeded','1');save();refresh();
 }
 // SCALE TEST V2 A/B switches (live; arena variant applies on (re)entry, so the V2 buttons restart the stage).
 const cur=()=>window.KozaCamera?.v2||{};
 function setV2(k,v){const s=cur();if(!s)return;s[k]=v;window.KozaScaleV2?.summary?.();paint();}
 let lastStage=1;
 function jump(n){lastStage=n;
  if(mode!=='home')home();
  profile.region='garden';profile.campaign.selected.garden=n;save();refresh();
  document.getElementById('qaPanel').dataset.open='0';
  document.getElementById('play').click();
 }
 function paint(){const s=cur();document.querySelectorAll('#qaPanel [data-v2]').forEach(b=>{b.dataset.on=String(b.dataset.v2.split(':')[0]===s.scale);});
  const c=document.querySelector('#qaPanel [data-toggle="camera"]'),l=document.querySelector('#qaPanel [data-toggle="light"]'),e=document.querySelector('#qaPanel [data-toggle="enc"]');
  if(e)e.textContent='ENCOUNTERS: '+(s.enc==='rollout'?'ROLLOUT (MORE LIGHTS / DENSER / BOSS ESCORT)':'V2 TEST LEVEL');
  if(c)c.textContent='CAMERA: '+(s.camera==='continuous'?'CONTINUOUS FOLLOW':'OLD FOLLOW');if(l)l.textContent='LIGHT: '+(s.light==='v2'?'V2 MAGNET / INDICATOR / WAVE VACUUM':'OLD');}
 function panel(){
  const css=document.createElement('style');
  css.textContent='#qaPanel{position:fixed;left:8px;bottom:8px;z-index:99999;font:600 12px system-ui,sans-serif;color:#eaf2ff}#qaPanel button{display:block;margin:3px 0;padding:6px 10px;border-radius:8px;border:1px solid #9fb8e066;background:#0d2238e6;color:#eaf2ff;font:inherit}#qaPanel[data-open="0"] .qa-list{display:none}#qaPanel .qa-chip{background:#7a3b10e6}#qaPanel .qa-list{max-height:72vh;overflow-y:auto}#qaPanel .qa-head{margin:8px 0 2px;font-size:10px;letter-spacing:.08em;color:#bef6de}#qaPanel [data-on="true"]{border-color:#bef6de;background:#14524ae6}#qaPanel [data-toggle]{font-size:11px}#qaPanel .qa-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 4px}#qaPanel .qa-grid button{font-size:11px;padding:6px 6px}#qaPanel .qa-note{max-width:250px;margin:2px 0 6px;font:500 10px/1.35 system-ui,sans-serif;color:#cfe0f5}#qaPanel .qa-reset{background:#3a1420e6;font-size:11px}#qaPanel .qa-grid3{grid-template-columns:1fr 1fr 1fr}#qaPanel .qa-grid4{grid-template-columns:1fr 1fr 1fr 1fr}';
  document.head.appendChild(css);
  const box=document.createElement('div');box.id='qaPanel';box.dataset.open='0';
  const chip=document.createElement('button');chip.className='qa-chip';chip.textContent='QA · TEST';chip.title='TEST BUILD: doğrudan arena girişi, ayrı test kaydı';chip.onclick=()=>{box.dataset.open=box.dataset.open==='1'?'0':'1';};
  const list=document.createElement('div');list.className='qa-list';
  const h0=document.createElement('div');h0.className='qa-head';h0.textContent='KOZA TEST BUILD';list.appendChild(h0);
  const note=document.createElement('div');note.className='qa-note';note.textContent='Ayrı test kaydı (gerçek kayıt kullanılmaz). Map 1 bölümleri 1-20 açık. Her açılışta Işık ≥ 9999, Öz ≥ 999.';list.appendChild(note);
  for(const [label,n] of STAGES){const b=document.createElement('button');b.textContent=label;b.dataset.stage=String(n);b.onclick=()=>jump(n);list.appendChild(b);}
  const hh=document.createElement('div');hh.className='qa-head';hh.textContent='KAHRAMAN · FORM (Lumi: onaylı 2D)';list.appendChild(hh);
  const hg=document.createElement('div');hg.className='qa-grid qa-grid3';list.appendChild(hg);
  for(const [id,label] of HEROES){const b=document.createElement('button');b.textContent=label;b.dataset.hero=id;b.onclick=()=>setHero(id);hg.appendChild(b);}
  const fg=document.createElement('div');fg.className='qa-grid qa-grid4';list.appendChild(fg);
  for(let f=1;f<=4;f++){const b=document.createElement('button');b.textContent='FORM '+f;b.dataset.form=String(f);b.onclick=()=>setForm(f);fg.appendChild(b);}
  const ev=document.createElement('button');ev.textContent='EVRİM ÖNİZLEME 1→2→3→4';ev.onclick=evolutionPreview;list.appendChild(ev);
  /* QUALITY q1: 3D hero toggle removed - heroes stay on the approved 2D art */
  const head=document.createElement('div');head.className='qa-head';head.textContent='SCALE ROLLOUT';list.appendChild(head);
  const grid=document.createElement('div');grid.className='qa-grid';list.appendChild(grid);
  for(const [name,n] of [['MAIN',1],['BOSS05',5],['BOSS10',10],['BOSS15',15],['BOSS20',20]])for(const [tag,sc] of [['CURRENT','current'],['ROLLOUT','v2']]){const b=document.createElement('button');b.textContent=name+' '+tag;b.dataset.v2=sc+':'+n;b.onclick=()=>{setV2('scale',sc);jump(n);};grid.appendChild(b);}
  const cam=document.createElement('button');cam.dataset.toggle='camera';cam.onclick=()=>{setV2('camera',cur().camera==='continuous'?'old':'continuous');if(typeof mode!=='undefined'&&mode!=='home')jump(lastStage);};list.appendChild(cam);
  const lig=document.createElement('button');lig.dataset.toggle='light';lig.onclick=()=>setV2('light',cur().light==='v2'?'old':'v2');list.appendChild(lig);
  const enc=document.createElement('button');enc.dataset.toggle='enc';enc.onclick=()=>{setV2('enc',cur().enc==='rollout'?'v2':'rollout');if(typeof mode!=='undefined'&&mode!=='home')jump(lastStage);};list.appendChild(enc);
  const rs=document.createElement('button');rs.className='qa-reset';rs.textContent='TEST KAYDINI SIFIRLA';rs.onclick=()=>{if(rs.dataset.armed==='1')resetTestSave();else{rs.dataset.armed='1';rs.textContent='SIFIRLAMAK İÇİN TEKRAR DOKUN';setTimeout(()=>{rs.dataset.armed='0';rs.textContent='TEST KAYDINI SIFIRLA';},3000);}};list.appendChild(rs);
  paint();setTimeout(()=>window.KozaScaleV2?.summary?.(),0);
  box.append(list,chip);document.body.appendChild(box);paint();paintHero();setInterval(paintHero,1500);
 }
 const wait=()=>{if(window.kozaReady===true&&typeof profile!=='undefined'&&typeof Progress!=='undefined'){seed();panel();window.KozaQA={jump,seed,setHero,setForm,evolutionPreview};return;}setTimeout(wait,200);};
 addEventListener('DOMContentLoaded',()=>setTimeout(wait,0));
})();
