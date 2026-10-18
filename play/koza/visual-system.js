'use strict';
// KOZA v5.15 shared gameplay presentation (VISUAL-SYSTEM-v5.15.md, Phase 2).
// One orthographic camera (pitch 52°, yaw 0°) for heroes, creatures, bosses,
// shadows and arena paintings. Behind a feature flag: ?visual=v515 or
// localStorage "koza-visual"="v515". With the flag off nothing here changes the
// game (the v5.14 presentation stays the default and the fallback).
window.KozaCamera=(()=>{
 const KOZA_CAMERA=Object.freeze({
  pitchDeg:52,            // LOCKED after pilot approval
  yawDeg:0,
  targetOffset:.08,       // floor sits slightly lower: more room near the thumb
  floorWidthRatio:.88,    // playable floor = 88% of the screen width (portrait)
  floors:Object.freeze({normal:[7,16],boss:[7,15]})  // world units (wu), approved v5.15 refinement
 });
 // v5.16 MAP1_WIDE_CAMERA_V516: Map 1 becomes a larger bounded world seen through a
 // moving window. Same 52° orthographic camera, same actor scale; the WORLD grows, the
 // viewport does not. KOZA's own bounded-follow system inspired by the room-scale
 // principle - no copied camera constants. Flag OFF = exact v5.15.1 behaviour.
 const WIDE=Object.freeze({
  viewWidthWu:7.7,                 // world width across the phone (v5.15.1 showed 7.95 wu of plate; k +3.3 %)
  deadZone:Object.freeze([.8,1.2]),// half extents (wu): x, depth. Lumi roams here without moving the camera
  smoothTime:.22,                  // seconds, frame-rate independent smooth-damp response
  lookAhead:Object.freeze([.35,.42]),// max look-ahead (wu): x, depth
  lookAheadResponse:.30,           // seconds to build / release look-ahead
  bossInfluence:.20,               // max pull of the camera target toward a living boss (hero keeps >=80 %)
  heroSafeRect:Object.freeze([.22,.78,.18,.82]), // hero must stay inside this fraction of the band (x0,x1,y0,y1)
  arenas:Object.freeze({
   'garden:normal':'arena-garden-wide-v516',
   'garden:5':'arena-garden-ayisigi-muhafizi-wide-v516',
   'garden:10':'arena-garden-inci-kabuk-wide-v516',
   'garden:15':'arena-garden-ay-kanadi-wide-v516',
   'garden:20':'arena-garden-kadim-ay-ejderi-wide-v516'
  })
 });
 let wideFlag=window.KOZA_MAP1_WIDE_V516!==undefined?!!window.KOZA_MAP1_WIDE_V516:true; // candidate default ON
 // MAP 1 FULL HYBRID INTEGRATION: the five FROZEN hybrid arenas (approved painterly plate = visual layer, hand-authored
 // polygon / spawns / starts = gameplay layer, restrained masked FX). They replace the v5.16 QA-extension arenas
 // (QA-TEMP plates, provisional QA polygons, QA water blockers), which stay on disk ONLY as the ?hybrid=off A/B fallback.
 const HYBRID=Object.freeze({
  'garden:normal':'arena-garden-ayisigi-bahcesi-hybrid',
  'garden:5':'arena-garden-ayisigi-muhafizi-hybrid',
  'garden:10':'arena-garden-inci-kabuk-hybrid',
  'garden:15':'arena-garden-ay-kanadi-hybrid',
  'garden:20':'arena-garden-kadim-ay-ejderi-hybrid'
 });
 let hybridFlag=window.KOZA_MAP1_HYBRID!==undefined?!!window.KOZA_MAP1_HYBRID:true;
 try{if(/[?&]hybrid=off\b/.test(location.search)||localStorage.getItem('koza-map1-hybrid')==='off')hybridFlag=false;}catch{}
 try{if(/[?&]wide=off\b/.test(location.search)||localStorage.getItem('koza-map1-wide')==='off')wideFlag=false;if(/[?&]wide=on\b/.test(location.search)||localStorage.getItem('koza-map1-wide')==='on')wideFlag=true;}catch{}
 // ---- KOZA MAP 1 SCALE ROLLOUT REVIEW (builds on the validated GAMEPLAY SCALE TEST V2: Main + Boss05 are the reference) ----
 // The V2 scale philosophy now covers ALL five Map 1 arenas: Main x1.75, Boss05 x1.9 (reference, unchanged), Boss10 x2.1,
 // Boss15 x1.8, Boss20 x2.0; boss 0.82 (Boss05) / 0.88 / 0.87 / 0.86. Continuous follow + light V2 are the Map 1 standard.
 // Rollout encounter tuning (more lights, denser enemies, boss escorts) is a separate switch (URL &enc=rollout|v2).
 // Scale V2 = the SAME approved plate and the SAME hand-fitted polygon, both scaled together about the floor origin
 // (arena JSON *-v2), actors and the 52 deg camera unchanged. Camera / light variants are independent A/B switches.
 // URL: ?scale=v2|current  &cam=cont|old  &light=v2|old   (QA panel sets the same switches at run time).
 const V2=Object.freeze({
  label:'KOZA — MAP 1 TEST BUILD · Q3.1 TELEFON PERFORMANSI · 516.6-q31',
  arenas:Object.freeze({'garden:normal':'arena-garden-ayisigi-bahcesi-hybrid-v2','garden:5':'arena-garden-ayisigi-muhafizi-hybrid-v2',
   'garden:10':'arena-garden-inci-kabuk-hybrid-v2','garden:15':'arena-garden-ay-kanadi-hybrid-v2','garden:20':'arena-garden-kadim-ay-ejderi-hybrid-v2'}),
  camera:Object.freeze({deadZone:Object.freeze([.12,.16]),smoothTime:.15}),   // continuous follow: tiny soft dead zone, smooth damping
  light:Object.freeze({bubbleMin:1.1,bubbleMax:3.6,magnetWu:1.6,magnetPullWu:3.2,cueMaxWu:10,recycleWu:7.5,recycleAge:10,vacuumAge:4,vacuumMax:3,retireWu:8.5})
 });
 const v2={scale:'v2',camera:'continuous',light:'v2',enc:'rollout'};
 // The camera / light / encounter switches act on the five Map 1 hybrid arenas (current or scaled variant). Map 2 is untouched.
 const V2_TEST=new Set(Object.values(HYBRID).flatMap(id=>[id,id+'-v2']));
 const testArena=()=>!!arena&&V2_TEST.has(arena.id),camCont=()=>v2.camera==='continuous'&&testArena();
 try{const q=location.search,g=n=>{const m=new RegExp('[?&]'+n+'=([a-z]+)').exec(q);return m?m[1]:null;};
  const a=g('scale'),c=g('cam'),l=g('light'),e=g('enc');if(a==='current'||a==='v2')v2.scale=a;if(a==='rollout')v2.scale='v2';if(e==='v2'||e==='rollout')v2.enc=e;if(c==='old')v2.camera='old';else if(c==='cont'||c==='continuous')v2.camera='continuous';if(l==='old'||l==='v2')v2.light=l;}catch{}
 const pitch=KOZA_CAMERA.pitchDeg*Math.PI/180,sin=Math.sin(pitch),cos=Math.cos(pitch);
 // Rig readability tilt (degrees) inside the model; the camera never changes.
 const READABILITY=Object.freeze({quadruped:4,arthropod:6,bird:0,dragon:-4,serpent:-2,flower:0,float:0,hero:0});
 // Drawn silhouette sizes (wu). Gameplay footprints stay in KozaHitbox and never
 // grow with decoration (fins, ears, tails, hair, leaves, wing tips).
 const SILHOUETTE=Object.freeze({hero:1.22,drift:1.0,sentry:1.05,hunter:1.2,boss:Object.freeze([2.6,2.6,3.0,3.5])});
 // Pilot arenas only (Phase 2). Everything else keeps the v5.14 presentation.
 const PILOTS=Object.freeze({
  'garden:normal':'arena-garden-pilot',
  'garden:5':'arena-garden-ayisigi-muhafizi',
  'garden:10':'arena-garden-inci-kabuk',
  'garden:15':'arena-garden-ay-kanadi',
  'garden:20':'arena-garden-kadim-ay-ejderi'
 });
 let flag=!!window.KOZA_VISUAL_V515;
 try{flag=flag||/[?&]visual=v515\b/.test(location.search)||localStorage.getItem('koza-visual')==='v515';}catch{}
 const specs=new Map(),images=new Map(),ready=new Map();
 let arena=null,layout=null;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 function arenaId(region,number,challenge=false){
  if(!flag||challenge)return null;
  const table=wideFlag&&region==='garden'?(hybridFlag?HYBRID:WIDE.arenas):PILOTS; // Map 2 (grove) has no entries in any table: untouched
  if(wideFlag&&hybridFlag&&region==='garden'&&v2.scale==='v2'){const k2=V2.arenas[`${region}:${number}`]?`${region}:${number}`:(number%5?'garden:normal':null);if(k2&&V2.arenas[k2])return V2.arenas[k2];} // all five Map 1 arenas (rollout)
  return table[`${region}:${number}`]||(number%5?table[`${region}:normal`]:null)||null;
 }
 function picture(file){
  if(images.has(file))return images.get(file);
  const img=new Image(),job=new Promise((resolve,reject)=>{img.onload=()=>resolve(img);img.onerror=()=>{images.delete(file);reject(Error('Arena image failed: '+file));};});
  img.src=file;images.set(file,job);return job;
 }
 // Loads spec + base + foreground + prop tops. Rejects on failure; the caller
 // then keeps the old presentation for that stage.
 async function prepare(id){
  if(!specs.has(id)){const job=fetch(id+'.json').then(r=>{if(!r.ok)throw Error('Arena spec '+r.status);return r.json();});specs.set(id,job);job.catch(()=>specs.delete(id));}
  const spec=await specs.get(id);
  const [base,fg,water,glow,pulse]=await Promise.all([picture(spec.base).catch(e=>{ /* QUALITY q1: a missing edited plate falls back to its verified source plate (same geometry, spec.basePrev) instead of dropping the arena */if(!spec.basePrev)throw e;(window.KozaPlateFallback=window.KozaPlateFallback||[]).push({id,missing:spec.base,using:spec.basePrev});window.KozaDiag?.warn?.('arena','plate fallback '+spec.base+' -> '+spec.basePrev);return picture(spec.basePrev);}),spec.foreground?picture(spec.foreground):null,spec.water?picture(spec.water).catch(()=>null):null,
   spec.fx?.glow?.mask?picture(spec.fx.glow.mask).catch(()=>null):null,spec.fx?.pulse?.mask?picture(spec.fx.pulse.mask).catch(()=>null):null]); // FX masks are optional: a failed mask only drops that FX
  const props=await Promise.all((spec.props||[]).map(async p=>({...p,img:p.top?.file?await picture(p.top.file):null})));
  ready.set(id,{id,spec,base,fg,water,glow,pulse,props});
  return spec;
 }
 // Synchronous switch at stage start (assets were prepared by the loader).
 // v5.16: only the active arena's heavy assets stay resident. Everything else that was prepared earlier
 // (base painting, water mask, prop tops) is released so the browser can free the decoded bitmaps; the JSON
 // spec cache is kept. The loader prepares the next arena again before it is needed.
 function release(exceptId){for(const [id,a] of ready){if(id===exceptId)continue;for(const f of [a.spec.base,a.spec.basePrev,a.spec.water,a.spec.foreground,a.spec.fx?.glow?.mask,a.spec.fx?.pulse?.mask,...(a.spec.props||[]).map(p=>p.top?.file)].filter(Boolean))images.delete(f);ready.delete(id);}}
 function use(id){const prev=arena?.id;arena=id&&ready.get(id)||null;layout=null;resetCamera();if(prev&&prev!==arena?.id){phases=null;phaseKey='';phaseBox=null;fxCache=null;}if(arena&&arena.spec.wide)release(arena.id);return !!arena;}
 function deactivate(){arena=null;layout=null;resetCamera();}
 const active=()=>!!arena;
 // ---- v5.16 camera state (wide arenas only). Field px = world px with the floor's
 // top-left at (0,0); the camera centre C is a field-px point that is drawn at the
 // screen anchor A. layout.ox/oy (screen position of the field origin) are derived
 // from C every frame, so every consumer of layout.ox/oy pans with the world.
 const cam={x:0,y:0,vx:0,vy:0,lx:0,ly:0,tx:0,ty:0,hx:null,hy:null,snapped:false};
 const isWide=()=>!!(arena&&arena.spec.wide&&layout&&layout.wide);
 function applyCenter(){ // C -> ox/oy/imgX/imgY
  const L=layout;if(!L||!L.wide)return;
  L.ox=L.A[0]-cam.x;L.oy=L.A[1]-cam.y;L.imgX=L.ox+L.IXf;L.imgY=L.oy+L.IYf;L.camX=cam.x;L.camY=cam.y;
 }
 function clampCenter(x,y,b=layout?.bounds){const L=layout;if(!L||!L.wide)return {x,y};return {x:b.x0<=b.x1?clamp(x,b.x0,b.x1):(b.x0+b.x1)/2,y:b.y0<=b.y1?clamp(y,b.y0,b.y1):(b.y0+b.y1)/2};}
 // Established hero-safe rule (WIDE.heroSafeRect) keeps priority over authored framing: after the framing clamp,
 // Lumi is pulled back inside the safe band of the free HUD/dock band, then only the art bounds (no void) apply.
 function heroFirst(hero){const L=layout;if(!L||!L.wide||!hero||!L.framed)return;const r=WIDE.heroSafeRect,sx0=L.EW*r[0],sx1=L.EW*r[1],sy0=L.availTop+(L.availBottom-L.availTop)*r[2],sy1=L.availTop+(L.availBottom-L.availTop)*r[3];
  const hx=L.A[0]-cam.x+hero.x,hy=L.A[1]-cam.y+hero.y;if(hx<sx0)cam.x-=sx0-hx;else if(hx>sx1)cam.x+=hx-sx1;if(hy<sy0)cam.y-=sy0-hy;else if(hy>sy1)cam.y+=hy-sy1;
  const c=clampCenter(cam.x,cam.y,L.artBounds);cam.x=c.x;cam.y=c.y;}
 // Screen placement for the element size and the free band between HUD and dock.
 function place(EW,EH,availTop,availBottom){
  if(!arena)return null;
  const [fw,fd]=arena.spec.floor,avail=Math.max(120,availBottom-availTop),im=arena.spec.image;
  if(arena.spec.wide&&wideFlag){
   // Scale comes from the fixed VIEWPORT width, never from the world width.
   const view=arena.spec.camera?.viewWidth||WIDE.viewWidthWu,k=EW/view,floorW=fw*k,floorH=fd*k*sin,s=floorW/im.floorRect[2];
   const IXf=-im.floorRect[0]*s,IYf=-im.floorRect[1]*s,IW=im.w*s,IH=im.h*s;            // image rect in field px
   const A=[EW/2,availTop+avail/2+KOZA_CAMERA.targetOffset*avail*.5];                  // screen anchor of the camera centre
   // cameraBounds: the FULL element (HUD overlaps the plate, as in v5.15.1) must stay inside the painting -> no void.
   const bounds={x0:A[0]+IXf,x1:A[0]+IXf+IW-EW,y0:A[1]+IYf,y1:A[1]+IYf+IH-EH};
   // Authored camera limits (wu, centre) tighten the art-derived ones, never loosen them.
   const cb=arena.spec.camera?.bounds;if(cb){bounds.x0=Math.max(bounds.x0,cb[0][0]*k);bounds.x1=Math.min(bounds.x1,cb[1][0]*k);bounds.y0=Math.max(bounds.y0,cb[0][1]*k*sin);bounds.y1=Math.min(bounds.y1,cb[1][1]*k*sin);}
   // Frozen hybrid framing (spec.camera.keepInView = [u0,v0,u1,v1] wu): the follow target is NARROWED so that this floor
   // rect stays on screen (same rule as the approved hybrid reviews). It never widens the art bounds; if the rect is
   // larger than the screen the centre sits on its middle, clamped to the painting.
   const artBounds={...bounds},kv=camCont()?null:arena.spec.camera?.keepInView; // V2 continuous follow: no authored framing pin
  let framed=false;
   if(Array.isArray(kv)&&kv.length===4){const ks=k*sin,ax=(lo,hi,b0,b1)=>{let a=lo,b=hi;if(a>b)a=b=(lo+hi)/2;let m0=Math.max(b0,a),m1=Math.min(b1,b);if(m0>m1){const c=b0<=b1?clamp((a+b)/2,b0,b1):(b0+b1)/2;m0=m1=c;}return [m0,m1];};
    [bounds.x0,bounds.x1]=ax(kv[2]*k+A[0]-EW,kv[0]*k+A[0],artBounds.x0,artBounds.x1);[bounds.y0,bounds.y1]=ax(kv[3]*ks+A[1]-EH,kv[1]*ks+A[1],artBounds.y0,artBounds.y1);framed=true;}
   layout={wide:true,framed,artBounds,k,floorW,floorH,ox:0,oy:0,EW,EH,s,imgW:IW,imgH:IH,imgX:0,imgY:0,IXf,IYf,A,bounds,availTop,availBottom,
    viewW:EW/k,viewD:EH/(k*sin),bandD:avail/(k*sin),worldW:fw,worldD:fd};
   if(!cam.snapped){cam.x=floorW/2;cam.y=floorH*.6;cam.vx=cam.vy=cam.lx=cam.ly=0;}
   const c=clampCenter(cam.x,cam.y);cam.x=c.x;cam.y=c.y;applyCenter();
   return layout;
  }
  let k=KOZA_CAMERA.floorWidthRatio*EW/fw;
  if(fd*k*sin>avail)k=avail/(fd*sin);                       // short screens: fit the depth
  const floorW=fw*k,floorH=fd*k*sin,ox=(EW-floorW)/2;
  const oy=clamp(availTop+(avail-floorH)/2+KOZA_CAMERA.targetOffset*floorH*.5,availTop,availBottom-floorH);
  const s=floorW/im.floorRect[2];         // image px -> screen px
  layout={k,floorW,floorH,ox,oy,EW,EH,s,imgX:ox-im.floorRect[0]*s,imgY:oy-im.floorRect[1]*s,imgW:im.w*s,imgH:im.h*s};
  return layout;
 }
 // Frame-rate independent critically damped smooth-damp (one axis).
 function smoothDamp(cur,target,vel,smoothTime,dt){const o=2/Math.max(1e-4,smoothTime),x=o*dt,e=1/(1+x+.48*x*x+.235*x*x*x);let ch=cur-target;const tmp=(vel+o*ch)*dt;vel=(vel-o*tmp)*e;let out=target+(ch+tmp)*e;if((target-cur>0)===(out>target)){out=target;vel=0;}return [out,vel];}
 // Bounded soft-follow: dead zone -> smooth-damp -> look-ahead -> restrained boss framing -> hero safe rect -> clamp.
 function follow(dt,hero,boss){
  if(!isWide()||!hero)return;const L=layout,k=L.k,ks=k*sin;
  if(!cam.snapped){snap(hero);return;}
  dt=clamp(dt||0,0,.1);
  // look-ahead from hero velocity (field px/s), built and released over lookAheadResponse
  const vx=cam.hx===null?0:(hero.x-cam.hx)/Math.max(dt,1e-3),vy=cam.hy===null?0:(hero.y-cam.hy)/Math.max(dt,1e-3);cam.hx=hero.x;cam.hy=hero.y;
  const vmax=ks*4.2,lax=clamp(vx/vmax,-1,1)*WIDE.lookAhead[0]*k,lay=clamp(vy/vmax,-1,1)*WIDE.lookAhead[1]*ks,a=1-Math.exp(-dt/WIDE.lookAheadResponse);
  cam.lx+=(lax-cam.lx)*a;cam.ly+=(lay-cam.ly)*a;
  let tx=hero.x+cam.lx,ty=hero.y+cam.ly;
  // restrained combat framing: at most bossInfluence toward a living boss, and only while it is not near the hero
  if(boss&&!boss.defeating&&boss.hp>0){const dx=boss.x-hero.x,dy=boss.y-hero.y;
   if(camCont()&&arena.spec.scaleTest){ // V2 boss-aware framing: shift only as much as needed to keep the boss on screen (1 wu margin),
    // never more than 45 % of the Lumi-boss separation, so Lumi stays in the central band (hero safe rect still applies after).
    const hx=L.EW/2-k*1.0,hy=(L.availBottom-L.availTop)/2-ks*1.2;let sx=0,sy=0;
    if(Math.abs(dx)>hx)sx=Math.sign(dx)*Math.min(Math.abs(dx)-hx,Math.abs(dx)*.45);if(Math.abs(dy)>hy)sy=Math.sign(dy)*Math.min(Math.abs(dy)-hy,Math.abs(dy)*.45);tx+=sx;ty+=sy;}
   else{const d=Math.hypot(dx,dy/sin)/k,w=WIDE.bossInfluence*clamp((d-2)/3,0,1);tx+=dx*w;ty+=dy*w;}}
  // dead zone around the current centre: the target only counts once it leaves the box
  const cont=camCont(),DZ=cont?V2.camera.deadZone:WIDE.deadZone,ST=cont?V2.camera.smoothTime:WIDE.smoothTime;
  const dzx=DZ[0]*k,dzy=DZ[1]*ks;
  let wantX=cam.x,wantY=cam.y;if(tx>cam.x+dzx)wantX=tx-dzx;else if(tx<cam.x-dzx)wantX=tx+dzx;if(ty>cam.y+dzy)wantY=ty-dzy;else if(ty<cam.y-dzy)wantY=ty+dzy;
  const w=clampCenter(wantX,wantY);
  [cam.x,cam.vx]=smoothDamp(cam.x,w.x,cam.vx,ST,dt);[cam.y,cam.vy]=smoothDamp(cam.y,w.y,cam.vy,ST,dt);
  // hero safe rect (screen): never let framing push Lumi toward an edge
  const r=WIDE.heroSafeRect,sx0=L.EW*r[0],sx1=L.EW*r[1],sy0=L.availTop+(L.availBottom-L.availTop)*r[2],sy1=L.availTop+(L.availBottom-L.availTop)*r[3];
  let hx=L.A[0]-cam.x+hero.x,hy=L.A[1]-cam.y+hero.y;
  if(hx<sx0)cam.x-=sx0-hx;else if(hx>sx1)cam.x+=hx-sx1;if(hy<sy0)cam.y-=sy0-hy;else if(hy>sy1)cam.y+=hy-sy1;
  const c=clampCenter(cam.x,cam.y);cam.x=c.x;cam.y=c.y;heroFirst(hero);applyCenter();
 }
 // Teleport-safe: put the camera on the hero at once (stage start, respawn, resize).
 function snap(hero){if(!layout||!layout.wide)return;const c=clampCenter(hero?hero.x:cam.x,hero?hero.y:cam.y);cam.x=c.x;cam.y=c.y;cam.vx=cam.vy=cam.lx=cam.ly=0;cam.hx=hero?hero.x:null;cam.hy=hero?hero.y:null;cam.snapped=true;heroFirst(hero);applyCenter();}
 function resetCamera(){cam.snapped=false;cam.vx=cam.vy=cam.lx=cam.ly=0;cam.hx=cam.hy=null;}
 // Visible field rect (px) for culling; legacy = whole screen.
 function viewRect(margin=0){const L=layout;if(!L)return null;return {x0:-L.ox-margin,y0:-L.oy-margin,x1:L.EW-L.ox+margin,y1:L.EH-L.oy+margin};}
 function onScreen(x,y,margin=80){const r=viewRect(margin);return !r||(x>=r.x0&&x<=r.x1&&y>=r.y0&&y<=r.y1);}
 const toScreen=(x,y)=>({x:(layout?.ox||0)+x,y:(layout?.oy||0)+y});
 // Boss sizing reference: the v5.15.1 boss size was fitted to a 7 wu floor; keep that even in an 11 wu world.
 const sizeRefWidth=()=>isWide()?KOZA_CAMERA.floors.boss[0]*layout.k:null;
 const sizeRef=()=>isWide()?{w:KOZA_CAMERA.floors.boss[0]*layout.k,h:KOZA_CAMERA.floors.boss[1]*layout.k*sin}:null;
 const cameraState=()=>({x:cam.x,y:cam.y,vx:cam.vx,vy:cam.vy,lookX:cam.lx,lookY:cam.ly,snapped:cam.snapped});
 const px=wu=>wu*(layout?.k||49);
 // Floor coordinates (u across 0..w, v from the far edge 0..d, in wu) <-> field px.
 const toField=(u,v)=>({x:u*(layout?.k||49),y:v*(layout?.k||49)*sin});
 const toFloor=(x,y)=>({u:x/(layout?.k||49),v:y/((layout?.k||49)*sin)});
 // Ellipse collision: a world circle is squashed by sin(pitch) on screen, so
 // screen-y distances are stretched back before comparing radii.
 const ySquash=()=>arena?sin:1;
 const elevation=species=>pitch+clamp(READABILITY[species]||0,-6,6)*Math.PI/180;
 function silhouette(kind,index=0){return kind==='boss'?px(SILHOUETTE.boss[index]||SILHOUETTE.boss[0])*(arena?.spec.bossScale||1):px(SILHOUETTE[kind]||SILHOUETTE.drift);} // V2: arena bossScale shrinks the drawn boss with its hitbox
 // Shared contact shadow + ambient-occlusion core, tinted by the arena light rig.
 function groundShadow(g,x,y,rx,ry,alpha=.38,altitude=0){
  if(!(rx>0&&ry>0))return;
  const lift=clamp(altitude/(px(1)*2.5),0,1),scale=1-.3*lift,so=arena?.spec.light.shadowOpacity,a=(so?Math.min(alpha,so):alpha)*(1-.45*lift),tint=arena?.spec.light.shadow||'6,23,35';
  // The soft shadow leans toward the lower right, away from the shared key light
  // (upper left), exactly like the painted prop shadows; the AO core stays at the contact.
  const kd=arena?.spec.light.keyDir,side=kd?Math.sign(-kd[0])||1:1; // shadow falls away from the arena key light
  g.save();g.translate(x,y);g.scale(1,ry/rx);const r=rx*scale,sx=side*r*(.2+.25*lift),sy=r*(.16+.2*lift);
  if(window.KozaGradCache?.on()){const C=KozaGradCache;C.disc(g,'gs:'+tint,[[0,`rgba(${tint},1)`],[.7,`rgba(${tint},.8)`],[1,`rgba(${tint},0)`]],sx,sy,r,a);C.disc(g,'gc:'+tint,[[0,`rgba(${tint},1)`],[1,`rgba(${tint},0)`]],0,0,r*.55,.3*(1-lift));g.restore();return;} /* Q3.1: 2 cached sprites instead of 2 new gradients per actor per frame */
  let grad=g.createRadialGradient(sx,sy,0,sx,sy,r);grad.addColorStop(0,`rgba(${tint},${a})`);grad.addColorStop(.7,`rgba(${tint},${a*.8})`);grad.addColorStop(1,`rgba(${tint},0)`);
  g.fillStyle=grad;g.beginPath();g.arc(sx,sy,r,0,Math.PI*2);g.fill();
  const core=r*.55;grad=g.createRadialGradient(0,0,0,0,0,core);grad.addColorStop(0,`rgba(${tint},${.3*(1-lift)})`);grad.addColorStop(1,`rgba(${tint},0)`);
  g.fillStyle=grad;g.beginPath();g.arc(0,0,core,0,Math.PI*2);g.fill();g.restore();
 }
 // Readability: a soft, lighter local zone of floor under a creature (arena rig
 // colour, no outline, no glow) so dark bodies never merge with a dark floor.
 function separation(g,x,y,r,squash=sin,role=''){
  const L=arena?.spec.light,tint=L?.separation;if(!tint||!(r>0))return;
  g.save();g.translate(x,y);g.scale(1,squash);
  if(window.KozaGradCache?.on()){const C=KozaGradCache;if(L.quietFloor){const qf=L.shadow||'6,23,35';C.disc(g,'sq:'+qf,[[0,`rgba(${qf},.4)`],[.55,`rgba(${qf},.18)`],[1,`rgba(${qf},0)`]],0,0,r);}else C.disc(g,'st:'+tint,[[0,`rgba(${tint},.16)`],[.6,`rgba(${tint},.07)`],[1,`rgba(${tint},0)`]],0,0,r);const warm=role==='danger'&&L.danger,ea=L.quietFloor?.07:.14;if(warm)C.disc(g,'sd:'+L.danger+':'+ea,[[0,`rgba(${L.danger},${ea})`],[.55,`rgba(${L.danger},${ea/2})`],[1,`rgba(${L.danger},0)`]],0,0,r*.72);g.restore();return;}
  let grad=g.createRadialGradient(0,0,0,0,0,r);
  if(L.quietFloor){ // lighter floors: a soft QUIET pool under the creature (local value contrast), never an outline
   const q=L.shadow||'6,23,35';grad.addColorStop(0,`rgba(${q},.4)`);grad.addColorStop(.55,`rgba(${q},.18)`);grad.addColorStop(1,`rgba(${q},0)`);}
  else{grad.addColorStop(0,`rgba(${tint},.16)`);grad.addColorStop(.6,`rgba(${tint},.07)`);grad.addColorStop(1,`rgba(${tint},0)`);}
  g.fillStyle=grad;g.beginPath();g.arc(0,0,r,0,Math.PI*2);g.fill();
  // Danger reads warm against the cool, matte world: a faint matte ember tint on the
  // floor under enemies (not a glow, not an outline; alpha ≤ .14).
  const warm=role==='danger'&&L.danger,ea=L.quietFloor?.07:.14;if(warm){const rr=r*.72;grad=g.createRadialGradient(0,0,0,0,0,rr);grad.addColorStop(0,`rgba(${L.danger},${ea})`);grad.addColorStop(.55,`rgba(${L.danger},${ea/2})`);grad.addColorStop(1,`rgba(${L.danger},0)`);g.fillStyle=grad;g.beginPath();g.arc(0,0,rr,0,Math.PI*2);g.fill();}
  g.restore();
 }
 // Base painting and foreground overlay, in element (not field) coordinates.
 function drawBase(g){if(!arena||!layout)return;const L=layout;g.fillStyle=arena.spec.light.fill||'#0b1d2c';g.fillRect(0,0,L.EW,L.EH);
  if(!L.wide){g.drawImage(arena.base,L.imgX,L.imgY,L.imgW,L.imgH);return;}
  // wide: blit only the visible part of the (much larger) plate
  const im=arena.base,inv=(im.naturalWidth||im.width)/L.imgW,x0=Math.max(0,-L.imgX),y0=Math.max(0,-L.imgY),x1=Math.min(L.imgW,L.EW-L.imgX),y1=Math.min(L.imgH,L.EH-L.imgY);
  if(x1<=x0||y1<=y0)return;g.drawImage(im,x0*inv,y0*inv,(x1-x0)*inv,(y1-y0)*inv,L.imgX+x0,L.imgY+y0,x1-x0,y1-y0);}
 // Approved-plate water enhancement: the plate's water pixels stay the base; over the
 // authored water mask we add only a very slow, low-alpha caustic drift. Phases are
 // pre-composited once per layout (mask ∧ tile) at 1× and cross-faded, so a frame costs
 // two drawImage calls and no extra WebGL context.
 let tile=null,phases=null,phaseKey='';
 function causticTile(){if(tile)return tile;const T=256,c=document.createElement('canvas');c.width=c.height=T;const g=c.getContext('2d');let s=7;const r=()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return((s>>>0)%1e6)/1e6;};
  g.strokeStyle='rgba(255,255,255,.55)';g.lineCap='round';g.lineJoin='round';
  for(let i=0;i<34;i++){const cx=r()*T,cy=r()*T,rad=T*(.07+r()*.09),n=7+Math.floor(r()*4);g.lineWidth=1.4+r()*2;
   for(const [ox,oy] of [[0,0],[T,0],[-T,0],[0,T],[0,-T]]){g.beginPath();for(let k=0;k<=n;k++){const a=k/n*Math.PI*2,rr=rad*(.75+r()*.5*0+.2*Math.sin(k*2.1+i)),x=cx+ox+Math.cos(a)*rr,y=cy+oy+Math.sin(a)*rr*.8;k?g.lineTo(x,y):g.moveTo(x,y);}g.closePath();g.stroke();}}
  const b=document.createElement('canvas');b.width=b.height=T;const bg=b.getContext('2d');bg.filter='blur(1.5px)';bg.drawImage(c,0,0);tile=b;return tile;}
 // Water phases are pre-composited in IMAGE space over the mask's bounding box (not at screen
 // size / screen position), so a moving camera never rebuilds them and the caustics stay
 // glued to the painted water. Memory = 6 × (mask bbox at screen scale).
 let phaseBox=null;
 function maskBox(img){
  if(img.__kozaBox)return img.__kozaBox;const W=img.naturalWidth||img.width,H=img.naturalHeight||img.height,sc=Math.min(1,256/Math.max(W,H)),w=Math.max(1,Math.round(W*sc)),h=Math.max(1,Math.round(H*sc));
  const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(img,0,0,w,h);
  let x0=w,y0=h,x1=-1,y1=-1;try{const d=g.getImageData(0,0,w,h).data;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(d[(y*w+x)*4+3]>8){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}}catch{x0=0;y0=0;x1=w-1;y1=h-1;}
  const box=x1<0?{x:0,y:0,w:0,h:0}:{x:Math.max(0,(x0-2)/sc),y:Math.max(0,(y0-2)/sc),w:Math.min(W,(x1-x0+5)/sc),h:Math.min(H,(y1-y0+5)/sc)};
  img.__kozaBox=box;return box;
 }
 function buildPhases(){
  const im=arena.water,N=6,L=layout,box=maskBox(im),ms=arena.spec.image.w/(im.naturalWidth||im.width)*L.s,key=[arena.id,L.s.toFixed(4)].join(':');if(phaseKey===key&&phases)return phases;phaseKey=key;phases=[];
  const bw=Math.max(1,Math.ceil(box.w*ms)),bh=Math.max(1,Math.ceil(box.h*ms));phaseBox={x:box.x*ms,y:box.y*ms,w:bw,h:bh}; // ms: mask px -> screen px (mask may be half-res)
  if(!box.w||!box.h)return phases;
  const t=causticTile(),step=t.width*L.s,q=1/(arena.spec.gameplayScale||1); // V2: phases kept at the x1 bitmap budget, drawn scaled (no memory growth)
  for(let i=0;i<N;i++){const c=document.createElement('canvas');c.width=Math.max(1,Math.ceil(bw*q));c.height=Math.max(1,Math.ceil(bh*q));const g=c.getContext('2d');if(q!==1)g.scale(q,q);
   const off=i/N;
   for(let y=-step+off*step*.6;y<bh+step;y+=step)for(let x=-step+off*step;x<bw+step;x+=step)g.drawImage(t,x,y,step,step);
   g.globalCompositeOperation='destination-in';g.drawImage(im,box.x,box.y,box.w,box.h,0,0,bw,bh);phases.push(c);}
  return phases;}
 function drawWater(g,time){
  if(!arena?.water||!layout||!arena.spec.light)return;const ph=buildPhases(),N=ph.length;if(!N)return;const speed=.32; // one full cycle ≈ 19 s: calm, never "swimming pool"
  const x=layout.imgX+phaseBox.x,y=layout.imgY+phaseBox.y;if(x>layout.EW||y>layout.EH||x+phaseBox.w<0||y+phaseBox.h<0)return; // culled: water not on screen
  const f=(time*speed)%N,i=Math.floor(f),k=f-i,a=arena.spec.fx?.water?.alpha??.16;
  g.save();g.globalCompositeOperation='screen';const pw=phaseBox.w,phh=phaseBox.h,sc=ph[i].width!==pw;g.globalAlpha=a*(1-k);sc?g.drawImage(ph[i],x,y,pw,phh):g.drawImage(ph[i],x,y);g.globalAlpha=a*k;sc?g.drawImage(ph[(i+1)%N],x,y,pw,phh):g.drawImage(ph[(i+1)%N],x,y);g.restore();}
 // ---- Hybrid arena FX (Canvas2D port of the frozen hybrid plate FX; masked, outside the walkable floor) ----
 // glow  : the focal element breathes (value only, x(1 +- amp)) - pearl, Moon Tree crown, dais seal, roost
 // pulse : additive cool colour pulse on the focal element (Boss15 roost, Boss20 seal)
 // card  : a low additive light pool on the focal element;  motes: a few moon motes around the sanctuary
 // Masks are pre-composited ONCE per arena/scale in image space (bbox only); a frame costs <= 4 drawImage + a few arcs.
 let fxCache=null;
 function fxLayers(){
  const L=layout,a=arena;if(!L||!a||!a.spec.fx)return null;const q=1/(a.spec.gameplayScale||1),key=a.id+':'+L.s.toFixed(4)+':'+q;if(fxCache&&fxCache.key===key)return fxCache;
  const bw0=a.base.naturalWidth||a.base.width;
  const mk=(mask,fill)=>{if(!mask)return null;const box=maskBox(mask),mw=mask.naturalWidth||mask.width,ms=a.spec.image.w/mw*L.s,pr=bw0/mw;if(!box.w||!box.h)return null;
   const w=Math.max(1,Math.ceil(box.w*ms)),h=Math.max(1,Math.ceil(box.h*ms)),c=document.createElement('canvas');c.width=Math.ceil(w*q);c.height=Math.ceil(h*q);const g=c.getContext('2d');g.scale(q,q);
   if(fill==='plate')g.drawImage(a.base,box.x*pr,box.y*pr,box.w*pr,box.h*pr,0,0,w,h);else{g.fillStyle=fill;g.fillRect(0,0,w,h);}
   g.globalCompositeOperation='destination-in';g.drawImage(mask,box.x,box.y,box.w,box.h,0,0,w,h);return {c,x:box.x*ms,y:box.y*ms,w,h};};
  const fx=a.spec.fx,rgb=v=>`rgb(${v.map(x=>Math.round(clamp(x,0,1)*255)).join(',')})`;
  let card=null;if(fx.card){const c=fx.card,rx=Math.max(2,Math.round(c.size[0]/2*L.k)),ry=Math.max(2,Math.round(c.size[1]/2*L.k*sin)),cv=document.createElement('canvas');cv.width=rx*2;cv.height=ry*2;const g=cv.getContext('2d');g.translate(rx,ry);g.scale(1,ry/rx);const gr=g.createRadialGradient(0,0,rx*.02,0,0,rx);gr.addColorStop(0,c.inner);gr.addColorStop(.5,c.mid);gr.addColorStop(1,c.outer);g.fillStyle=gr;g.beginPath();g.arc(0,0,rx,0,Math.PI*2);g.fill();card={c:cv,rx,ry};}
  const mote=document.createElement('canvas');mote.width=mote.height=16;{const g=mote.getContext('2d'),gr=g.createRadialGradient(8,8,0,8,8,8);gr.addColorStop(0,'rgba(179,209,255,1)');gr.addColorStop(1,'rgba(179,209,255,0)');g.fillStyle=gr;g.fillRect(0,0,16,16);}
  fxCache={key,glowLight:mk(a.glow,'plate'),glowDark:mk(a.glow,'#000'),pulse:fx.pulse?mk(a.pulse,rgb(fx.pulse.rgb)):null,card,mote};return fxCache;}
 const fxStats={frames:0,draws:0};
 function drawFx(g,time){
  const L=layout,a=arena,fx=a?.spec.fx;if(!L||!fx)return 0;const lay=fxLayers();let n=0;const put=(o,alpha,op)=>{if(!o||!(alpha>.002))return;const x=L.imgX+o.x,y=L.imgY+o.y;if(x>L.EW||y>L.EH||x+o.w<0||y+o.h<0)return;g.globalCompositeOperation=op;g.globalAlpha=alpha;g.drawImage(o.c,x,y,o.w,o.h);n++;};
  g.save();
  if(fx.glow&&lay){const s=Math.sin(time*(fx.glow.w||.33)+1);if(s>0)put(lay.glowLight,fx.glow.amp*s,'lighter');else put(lay.glowDark,fx.glow.amp*-s,'source-over');}
  if(fx.pulse&&lay){const br=.5+.5*Math.sin(time*(fx.pulse.w||.85));put(lay.pulse,.45+.55*br,'lighter');}
  const ks=L.k*sin;
  if(fx.card&&lay?.card){const c=fx.card,x=L.ox+c.at[0]*L.k,y=L.oy+c.at[1]*ks,{rx,ry}=lay.card,w=fx.pulse?.w||.85,o=c.opacity*(.6+.4*(.5+.5*Math.sin(time*w)));
   if(x+rx>0&&x-rx<L.EW&&y+ry>0&&y-ry<L.EH){g.globalCompositeOperation='lighter';g.globalAlpha=o;g.drawImage(lay.card.c,x-rx,y-ry,rx*2,ry*2);n++;}}
  g.restore();g.save();
  if(fx.motes?.length&&lay){g.globalCompositeOperation='lighter';const pxs=Math.max(1,L.k/120);
   fx.motes.forEach(([u,h,v],i)=>{for(let k2=0;k2<4;k2++){const seed=i*4+k2,pu=u+Math.sin(i*7.1+k2*2.3)*.5+.18*Math.sin(time*.23+seed),ph=h+.25*k2+.25*Math.sin(time*.4+seed*1.7),pv=v+Math.cos(i*3.7+k2*1.9)*.4+.14*Math.cos(time*.19+seed*2.1);
    const al=.35+.35*Math.sin(time*.9+seed*2.9);if(al<=.01)continue;
    if(clearance(pu,pv-ph*cos/sin)>-.25)continue; /* never over (or at the edge of) the walkable floor on screen: telegraph space stays clean */
    const x=L.ox+pu*L.k,y=L.oy+pv*ks-ph*L.k*cos;if(x<-4||y<-4||x>L.EW+4||y>L.EH+4)continue;
    const r=(1.5+(seed*.37%1))*pxs;g.globalAlpha=al;g.drawImage(lay.mote,x-r,y-r,r*2,r*2);n++;}});}
  g.restore();fxStats.frames++;fxStats.draws+=n;return n;}
 // QA / diagnostics: decoded bitmap and pre-composite cost of the active arena (read-only).
 function memoryStats(){const a=arena;if(!a)return null;const nb=o=>o?o.c.width*o.c.height*4:0,mb=b=>+(b/1048576).toFixed(2),bw=a.base.naturalWidth||a.base.width,bh=a.base.naturalHeight||a.base.height;
  return {plate:[bw,bh],plateMB:mb(bw*bh*4),masks:[a.water,a.glow,a.pulse].filter(Boolean).map(m=>[m.naturalWidth||m.width,m.naturalHeight||m.height]),
   waterPhases:phases?phases.length:0,waterPhasesMB:phases?mb(phases.reduce((t,c)=>t+c.width*c.height*4,0)):0,fxMB:fxCache?mb(nb(fxCache.glowLight)+nb(fxCache.glowDark)+nb(fxCache.pulse)):0};}
 function drawForeground(g){if(arena?.fg&&layout)g.drawImage(arena.fg,layout.imgX,layout.imgY,layout.imgW,layout.imgH);}
 // Tall props inside the floor: their tops are y-sorted with actors.
 function propTops(){
  if(!arena||!layout)return [];
  return arena.props.filter(p=>p.img).map(p=>{const t=p.top,s=layout.s,box={x:layout.imgX-layout.ox+t.x*s,y:layout.imgY-layout.oy+t.y*s,w:t.w*s,h:t.h*s};return {foot:toField(p.u,p.v).y,box,draw:g=>g.drawImage(p.img,box.x,box.y,box.w,box.h)};});
 }
 // Blocked props (circles in wu) push the hero out.
 function resolveBlocked(o,radius){
  if(!arena)return;
  for(const p of arena.spec.props||[]){if(!p.r)continue;const c=toField(p.u,p.v),dx=o.x-c.x,dy=(o.y-c.y)/sin,d=Math.hypot(dx,dy),min=p.r*layout.k+radius;if(d<min&&d>0){o.x=c.x+dx/d*min;o.y=c.y+dy/d*min*sin;}}
 }
 // ---- World boundary (authoritative arena JSON polygon, in world units) ----
 // Field px <-> world: u = x/k, v = y/(k·sin). All tests run in world units so the
 // boundary is identical on every phone size.
 const K=()=>layout?.k||49;
 const W2=(x,y)=>({u:x/K(),v:y/(K()*sin)});
 const F2=(u,v)=>({x:u*K(),y:v*K()*sin});
 function polyOf(name='floorPolygon'){return arena?.spec[name]||null;}
 function inPoly(poly,u,v){let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [ui,vi]=poly[i],[uj,vj]=poly[j];if((vi>v)!==(vj>v)&&u<(uj-ui)*(v-vi)/(vj-vi)+ui)c=!c;}return c;}
 function nearestEdge(poly,u,v){let best=null;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [ax,ay]=poly[j],[bx,by]=poly[i],dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((u-ax)*dx+(v-ay)*dy)/(dx*dx+dy*dy||1))),px=ax+dx*t,py=ay+dy*t,d=Math.hypot(u-px,v-py);if(!best||d<best.d){const l=Math.hypot(dx,dy)||1;best={d,px,py,nx:-dy/l,ny:dx/l};}}return best;}
 // Signed clearance (wu) from the boundary: > 0 inside, < 0 outside.
 function clearance(u,v,name){const poly=polyOf(name);if(!poly)return Infinity;const e=nearestEdge(poly,u,v);return inPoly(poly,u,v)?e.d:-e.d;}
 function insideField(x,y,marginPx=0,name){if(!arena)return true;const w=W2(x,y);return clearance(w.u,w.v,name)>=marginPx/K();}
 // Moves o (field px) inside the polygon by at least radius and out of blocked
 // circles. Returns true when it had to move.
 function confine(o,radiusPx=0,name='floorPolygon'){
  if(!arena)return false;const poly=polyOf(name);if(!poly)return false;let moved=false;
  for(let pass=0;pass<6;pass++){
   const w=W2(o.x,o.y),r=radiusPx/K(),c=clearance(w.u,w.v,name);
   if(c<r){const e=nearestEdge(poly,w.u,w.v);let nx=e.nx,ny=e.ny;const du=w.u-e.px,dv=w.v-e.py,dl=Math.hypot(du,dv);
    // Map 1 integration fix: INSIDE the floor, push straight away from the closest boundary point. When that point is a
    // vertex (a wall corner jutting into the floor - frequent on hand-authored polygons) the old segment normal put the
    // actor on one FIXED spot (vertex + normal) and pinned it there ("sticky corner"); the radial push slides around it.
    // Outside the floor (or exactly on the line) the inward normal of the nearest segment is kept.
    if(c>0&&dl>1e-6){nx=du/dl;ny=dv/dl;}
    // Inward normal of the nearest boundary segment (orientation-independent).
    else if(!inPoly(poly,e.px+nx*.01,e.py+ny*.01)){nx=-nx;ny=-ny;}
    const f=F2(e.px+nx*(r+.02),e.py+ny*(r+.02));o.x=f.x;o.y=f.y;moved=true;}
   if(name==='floorPolygon')for(const p of arena.spec.props||[]){if(!p.r)continue;const w2=W2(o.x,o.y),dx=w2.u-p.u,dy=w2.v-p.v,d=Math.hypot(dx,dy),min=p.r+r;if(d<min){const k2=d>1e-6?min/d:1,f=F2(p.u+(d>1e-6?dx:0)*k2,p.v+(d>1e-6?dy:min)*k2);o.x=f.x;o.y=f.y;moved=true;}}
  }
  return moved;
 }
 const centres=new WeakMap();
 function polyCentre(poly){if(centres.has(poly))return centres.get(poly);let u=0,v=0;for(const [a,b] of poly){u+=a;v+=b;}const c=[u/poly.length,v/poly.length];centres.set(poly,c);return c;}
 // Random point inside the playable polygon (not in blocked props), margin px.
 // Collectible light in a wide world: keep it near the visible window (pacing like v5.15.1), inside the floor.
 function randomInView(random=Math.random,marginPx=0){if(!isWide())return randomInside(random,marginPx);const r=viewRect(-40);for(let i=0;i<40;i++){const p=randomInside(random,marginPx,6);if(p&&p.x>=r.x0&&p.x<=r.x1&&p.y>=Math.max(r.y0,-layout.oy+(layout.availTop||0))&&p.y<=r.y1)return p;}return randomInside(random,marginPx);}
 function randomInside(random=Math.random,marginPx=0,tries=24){
  const poly=polyOf();if(!poly)return null;let minU=1e9,maxU=-1e9,minV=1e9,maxV=-1e9;for(const [u,v] of poly){minU=Math.min(minU,u);maxU=Math.max(maxU,u);minV=Math.min(minV,v);maxV=Math.max(maxV,v);}
  for(let i=0;i<tries;i++){const u=minU+random()*(maxU-minU),v=minV+random()*(maxV-minV),f=F2(u,v);if(clearance(u,v)>=marginPx/K()&&!(arena.spec.props||[]).some(p=>p.r&&Math.hypot(u-p.u,v-p.v)<p.r+marginPx/K()))return f;}
  return null;
 }
 // Enemy entrances come only from the arena JSON (paths, openings between roots,
 // flights over the edge). The creature starts ON the boundary, hidden by the
 // painted edge/foreground, and emerges inward to its first target.
 function planSpawn({kind,serial=0,player,speed,size,random=Math.random,hazards=[],safe=150}){
  if(!arena)return null;const spec=arena.spec,k=K(),dist=(a,b)=>Math.hypot(a.x-b.x,(a.y-b.y)/sin);
  const clearOf=(p,gap)=>hazards.every(h=>dist(h.entering&&h.target?h.target:h,p)>gap);
  if(kind==='sentry'){
   let anchors=(spec.sentryAnchors||[]).map((_,j,a)=>a[(serial+j)%a.length]).map(([u,v])=>F2(u,v));
   if(spec.scaleTest)anchors=anchors.sort((a,b)=>dist(a,player)-dist(b,player)); // V2: a sentry takes the nearest free anchor (large world)
   const spot=anchors.find(p=>dist(p,player)>=safe&&clearOf(p,size*1.4));
   return spot?{x:spot.x,y:spot.y,vx:0,vy:0,entering:false,sprout:true}:null;
  }
  const vertical=kind==='rain'||kind==='cross',flying=kind==='hunter';
  let list=(spec.spawns||[]).filter(e=>flying?true:e.via!=='air').filter(e=>vertical?Math.abs(e.dir[1])>=Math.abs(e.dir[0]):true);
  if(!list.length)list=spec.spawns||[];
  let order=list.map((_,j)=>list[(serial+j)%list.length]);
  if(isWide()){ // wide world: entrances nearest the camera first (rotated by serial among the nearest four), so creatures enter from the visible edges
   const cx=spec.scaleTest?player.x:cam.x,cy=spec.scaleTest?player.y:cam.y,d=e=>{const f=F2(e.u,e.v);return Math.hypot(f.x-cx,(f.y-cy)/sin);};const near=list.slice().sort((a,b)=>d(a)-d(b));const head=near.slice(0,4),tail=near.slice(4);
   if(spec.scaleTest){const h2=near.slice(0,encRollout()?3:2);order=h2.map((_,j)=>h2[(serial+j)%h2.length]).concat(near.slice(2));}else order=head.map((_,j)=>head[(serial+j)%head.length]).concat(tail);}
  // V2 (large world, normal stages): when every authored entrance is far from Lumi (> 6 wu), a crossing shadow arrives from JUST
  // OUTSIDE the visible window (3.9-5.4 wu away, never popping in on screen) heading into the combat zone. Authored entrances
  // stay first choice whenever one is near. Experimental spacing aid - flagged in the report.
  const RO=encRollout(),boss=RO?window.KozaAdventure?.state?.boss:null,offBoss=q=>!boss||boss.hp<=0||dist(q,boss)>boss.r+k*1.6;
  if(spec.scaleTest&&kind!=='hunter'&&(!spec.bossArea||RO)){const pf=W2(player.x,player.y),nearE=Math.min(99,...list.map(e=>Math.hypot(e.u-pf.u,e.v-pf.v)));
   // rollout: multi-angle pressure - arrival bearing walks round Lumi by the golden angle per spawn (+-20 deg jitter)
   if(nearE>(RO?5:6)){for(let i=0;i<24;i++){const q=RO?(()=>{const a=serial*2.39996+(random()-.5)*.7+i*.9,r=3.9+random()*1.5,pf2=W2(player.x,player.y),u=pf2.u+Math.cos(a)*r,v=pf2.v+Math.sin(a)*r;return clearance(u,v)>=size*.9/k?F2(u,v):null;})():randomNear(player.x,player.y,3.9,5.4,size*.9,random);if(!q||onScreen(q.x,q.y,-10)||!clearOf(q,size*1.2)||!offBoss(q))continue;
     const ax=player.x-q.x,ay=(player.y-q.y)/sin,al=Math.hypot(ax,ay)||1,j=(random()-.5)*.6,c=Math.cos(j),s2=Math.sin(j),hx=(ax/al)*c-(ay/al)*s2,hy=(ax/al)*s2+(ay/al)*c;
     return {x:q.x,y:q.y,vx:hx*speed,vy:hy*sin*speed*(kind==='rain'?1.25:1),entering:false,emerge:false,entrance:'offscreen'};}}}
  for(const e of order){
   const start=F2(e.u,e.v),dl=Math.hypot(e.dir[0],e.dir[1])||1,du=e.dir[0]/dl,dv=e.dir[1]/dl,depth=e.depth??1.3;
   const target=F2(e.u+du*depth,e.v+dv*depth);
   if(clearance(e.u+du*depth,e.v+dv*depth)<size/k*.5)continue;
   if(dist(target,player)<safe||!clearOf(target,size*1.2)||!offBoss(target))continue;
   const px=F2(du,dv),pl=Math.hypot(px.x,px.y)||1,ux=px.x/pl,uy=px.y/pl,v0=Math.max(speed*1.2,80);
   const lateral=(random()-.5)*.25,after=kind==='hunter'?{vx:0,vy:0}:{vx:(ux+lateral*uy)*speed,vy:(uy-lateral*ux)*speed*(kind==='rain'?1.25:1)};
   // V2 (large world): a crossing shadow leaves its authored entrance TOWARD the combat zone (Lumi +- ~25 deg) instead of along the
   // fixed entrance direction, so it crosses the fight instead of an empty far corner. Only if that heading still points inward.
   if(spec.scaleTest&&kind!=='hunter'){const ax=player.x-target.x,ay=(player.y-target.y)/sin,al=Math.hypot(ax,ay)||1;let hx=ax/al,hy=ay/al;const ex=du,ey=dv;
    if(hx*ex+hy*ey>.15){const j=(random()-.5)*.85,c=Math.cos(j),s2=Math.sin(j);[hx,hy]=[hx*c-hy*s2,hx*s2+hy*c];if(kind==='rain'&&Math.abs(hy)<.8){hy=Math.sign(ey||1)*.8;hx=Math.sign(hx||1)*.6;}
     const q=Math.hypot(hx,hy*sin)||1;after.vx=hx/q*speed;after.vy=hy*sin/q*speed*(kind==='rain'?1.25:1);}}
   return {x:start.x,y:start.y,vx:ux*v0,vy:uy*v0,entering:true,emerge:true,target,after,entrance:e.via||'path'};
  }
  return null;
 }
 // ---- V2 helpers ----
 const gameplayScale=()=>arena?.spec.gameplayScale||1;
 const bossScale=()=>arena?.spec.bossScale||1;
 const isV2Arena=()=>!!arena?.spec.scaleTest;
 const encRollout=()=>v2.enc==='rollout'&&testArena();
 // Rollout: a boss's idle "home" is taken from its own movement area (centre column, upper quarter) instead of a fraction of
 // the whole (now much larger) field, and its idle sway spans +-30 % of that area's width. Scaled arenas only.
 function bossHome(){const B=arena?.spec.scaleTest&&arena.spec.bossArea;if(!B)return null;const us=B.map(p=>p[0]),vs=B.map(p=>p[1]),u0=Math.min(...us),u1=Math.max(...us),v0=Math.min(...vs),v1=Math.max(...vs);
  const h=F2((u0+u1)/2,v0+(v1-v0)*.25);return {x:h.x,y:h.y,sway:(u1-u0)*.3*K()};}
 // Combat bubble: a random floor point between minWu and maxWu from (x,y) (field px), inside the polygon by marginPx.
 function randomNear(x,y,minWu,maxWu,marginPx=0,random=Math.random){if(!arena)return null;const c=W2(x,y);
  for(let i=0;i<40;i++){const a=random()*Math.PI*2,r=minWu+Math.sqrt(random())*(maxWu-minWu),u=c.u+Math.cos(a)*r,v=c.v+Math.sin(a)*r;
   if(clearance(u,v)>=marginPx/K()&&!(arena.spec.props||[]).some(p=>p.r&&Math.hypot(u-p.u,v-p.v)<p.r+marginPx/K()))return F2(u,v);}
  return null;}
 // The visible gameplay window (field px): what the phone shows between HUD and dock.
 function combatWindow(){const L=layout;if(!L)return null;const x0=-L.ox,x1=L.EW-L.ox,y0=(L.availTop||0)-L.oy,y1=(L.availBottom||L.EH)-L.oy;return {x0,y0,x1,y1,w:x1-x0,h:y1-y0};}
 // Boss stays fully readable inside its authored area.
 const confineBoss=b=>confine(b,0,'bossArea');
 // Hybrid arenas carry Lumi's footprint radius in WORLD units (0.4 wu, the radius every hybrid polygon was hand-fitted
 // and tested with). Legacy arenas keep the fixed pixel body (fallback), so this only changes hybrid stages.
 const heroRadius=px=>{const r=arena?.spec.hybrid?.footprintRadiusWu;return r&&layout?r*layout.k:px;};
 // 3D light rig colours for the active arena (one lighting language).
 const lightRig=()=>arena?.spec.light||null;
 // Adaptive actor refresh: 60 Hz first; 30 Hz only after sustained overload.
 let ema=16.7,over=0,under=0,actorHz=60;
 function noteFrame(ms){
  if(!(ms>0&&ms<250))return;ema=ema*.95+ms*.05;
  if(ema>18){over++;under=0;if(over>90&&actorHz>30){actorHz=30;over=0;window.KozaDiag?.log('visual','actor refresh 30 Hz (sustained frame time '+ema.toFixed(1)+' ms)');}}
  else if(ema<14){under++;over=0;if(under>300&&actorHz<60){actorHz=60;under=0;window.KozaDiag?.log('visual','actor refresh 60 Hz');}}
  else{over=Math.max(0,over-1);under=Math.max(0,under-1);}
 }
 function hz(low=false,critical=false){const base=low?30:actorHz;return critical?Math.max(30,base):low?Math.max(24,base-6):base;}
 return {KOZA_CAMERA,READABILITY,SILHOUETTE,PILOTS,pitch,sin,cos,
  get enabled(){return flag;},set enabled(v){flag=!!v;},get layout(){return layout;},get arena(){return arena;},active,
  WIDE,get wide(){return wideFlag;},set wide(v){wideFlag=!!v;},isWide,follow,snap,resetCamera,viewRect,onScreen,toScreen,sizeRefWidth,sizeRef,cameraState,
  arenaId,prepare,use,deactivate,place,px,toField,toFloor,ySquash,elevation,silhouette,groundShadow,drawWater,drawBase,drawForeground,propTops,resolveBlocked,lightRig,noteFrame,hz,get actorHz(){return actorHz;},
  separation,inPoly,clearance,insideField,confine,confineBoss,heroRadius,drawFx,memoryStats,get fxStats(){return fxStats;},HYBRID,get hybrid(){return hybridFlag;},set hybrid(v){hybridFlag=!!v;},randomInside,randomInView,release,planSpawn,EXIT_AGE:8,
  V2,v2,testArena,gameplayScale,bossScale,isV2Arena,encRollout,bossHome,randomNear,combatWindow,W2,F2,polygonField:(name='floorPolygon')=>(polyOf(name)||[]).map(([u,v])=>F2(u,v))};
})();
