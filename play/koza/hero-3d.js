'use strict';
// KOZA 3D HERO RUNTIME (hero evolution test build).
// One dedicated renderer for heroes, separate from the shared enemy/boss renderer in deer-3d.js:
//  - its own WebGL context, scene, camera and lights; hero GPU resources are never evicted to draw enemies/bosses and the
//    enemy/boss renderer is never resized, cleared or asset-switched to draw a hero (the v5.14 seam did both every frame);
//  - hero model files stay resident (small LRU, disposed only on eviction, never per frame);
//  - authoritative KOZA camera: the hero tilt is KozaCamera.elevation('hero') (= KOZA_CAMERA.pitchDeg, 52 deg);
//  - rotation pivot = the body bone projected to the ground (the body turns in place; tails/wings swing around it);
//  - hero-specific temporary locomotion profiles (Lumi scurry, Koru trot, Pera hover), phase driven by pace, not by
//    true travel (the true travel per frame is far larger than a tiny paw, which caused visible foot-slip sprints);
//  - per hero/form size: 3D on-screen area = the approved 2D sprite area of the same form (measured, AREA table);
//  - any failure returns false so game.js draws the existing 2D top-down sprite (never invisible, never a crash).
(()=>{
 const K=window.KozaThreeKit;
 const FORMS=Object.freeze({
  lumi:['hero-lumi-f1.glb','hero-lumi-f2.glb','hero-lumi-f3.glb','hero-lumi-f4.glb'],
  koru:['hero-koru-f1.glb','hero-koru-f2.glb','hero-koru-f3.glb','hero-koru-f4.glb'],
  pera:['hero-pera-f1.glb','hero-pera-f2.glb','hero-pera-f3.glb','hero-pera-f4.glb']});
 // 3D visual size factor per hero/form: sqrt(area of the approved 2D sprite of that form / area of the 3D model drawn at
 // the 2D extent rule), measured in-game at the same spot and headings (reports/PERFORMANCE_BEFORE_AFTER.md, scale table).
 const AREA=Object.freeze({lumi:[1.080,1.205,0.953,1.057],koru:[0.877,0.954,0.948,1.004],pera:[0.879,1.135,1.246,1.218]});
 // Temporary validation locomotion (final animation pass comes later). Units: fraction of the model height H.
 const PROFILE=Object.freeze({
  lumi:{gait:'scurry',cadence:3.6,stride:.05,lift:.030,bounce:.022,tail:.14,petal:.05,neck:.03},
  koru:{gait:'trot',cadence:2.5,stride:.11,lift:.045,bounce:.012,tail:.11,petal:.04,neck:.025},
  pera:{gait:'hover',cadence:0,stride:0,lift:0,bounce:.020,hover:.10,flap:7.5,flapIdle:4.6,wing:.28,tail:.06,petal:.05,neck:.02}});
 const MAX_RESIDENT=6,GL_SIZE=512,TAU=Math.PI*2;
 let enabled=!!K&&!/[?&]hero3d=0\b/.test(location.search),renderer=null,glCanvas=null,scene=null,camera=null,failedGL=false,rigKey='';
 const entries=new Map(),failed=new Set(),pending=new Map(),transitions=new Map(),lastForm=new Map();
 const stats={renders:0,draws:0,renderMs:0,renderMsEMA:0,loads:0,evictions:0,fallbacks:0,resident:0,contexts:0,errors:[]};
 const cam=()=>window.KozaCamera?.enabled?window.KozaCamera:null;
 const elevation=()=>{const c=cam();return c?c.elevation('hero'):52*Math.PI/180;};
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),ease=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
 const key=(id,form)=>id+':'+form;
 function note(msg,err){stats.errors.push(msg+': '+String(err?.message||err));if(stats.errors.length>20)stats.errors.shift();window.KozaDiag?.warn?.('hero3d',msg,err);}
 function init(){
  if(renderer)return true;if(failedGL||!K)return false;
  try{
   glCanvas=document.createElement('canvas');glCanvas.width=glCanvas.height=GL_SIZE;
   renderer=new K.WebGLRenderer({canvas:glCanvas,alpha:true,antialias:true,preserveDrawingBuffer:false,powerPreference:'low-power'});
   stats.contexts++;renderer.setPixelRatio(1);renderer.setSize(GL_SIZE,GL_SIZE,false);renderer.setClearColor(0,0);renderer.outputColorSpace=K.SRGBColorSpace;
   renderer.toneMapping=K.NeutralToneMapping;renderer.toneMappingExposure=1;renderer.shadowMap.enabled=false;renderer.autoClear=false;
   scene=new K.Scene();K.addLights(scene);camera=new K.OrthographicCamera(-1,1,1,-1,.1,40);camera.position.set(0,0,20);camera.lookAt(0,0,0);
   glCanvas.addEventListener('webglcontextlost',e=>{e.preventDefault();note('context lost','');for(const en of entries.values())en.cacheValid=false;});
   glCanvas.addEventListener('webglcontextrestored',()=>{for(const en of entries.values()){en.cacheValid=false;en.gpu=false;}});
   return true;
  }catch(e){failedGL=true;renderer=null;note('WebGL unavailable',e);return false;}
 }
 // Same colours as the arena rig used for the creatures (no baked moonlight: the base colours stay neutral).
 function applyRig(){
  const rig=cam()?.lightRig?.()||null,r=rig?.roles?.hero||{},k=rig?JSON.stringify(rig):'none';if(k===rigKey)return;rigKey=k;
  // Heroes keep a little more exposure than the matte arena (readability of dark-violet Pera / tails under moonlight).
  renderer.toneMappingExposure=r.exposure??1.1;
  scene.traverse(n=>{
   if(n.isHemisphereLight){n.color.set(rig?.sky||0xffffff);n.groundColor.set(rig?.ground||0x747a80);n.intensity=r.hemi??rig?.hemi??2.2;}
   else if(n.isDirectionalLight&&n.name==='koza-rim'){n.color.set(r.rim||rig?.rim||0xffffff);n.intensity=r.rimIntensity??rig?.rimIntensity??0;}
   else if(n.isDirectionalLight){n.color.set(rig?.key||0xffffff);n.intensity=r.keyIntensity??rig?.keyIntensity??2.6;const d=rig?.keyDir||[-3,6,5];n.position.set(d[0],d[1],d[2]);}
  });for(const en of entries.values())en.cacheValid=false;
 }
 // ---------- model setup ----------
 function build(gltf,id,form,file){
  const model=gltf.scene;model.position.set(0,0,0);model.rotation.set(0,0,0);model.scale.set(1,1,1);model.updateMatrixWorld(true);
  const box=new K.Box3().setFromObject(model,true);if(box.isEmpty())throw new Error('empty model');
  const bones=[],byNode=new Map();let body=null;
  model.traverse(n=>{if(n.isBone){const b={node:n,role:n.userData?.kozaRole||'',side:n.userData?.side||0,phase:n.userData?.phase||0,q:n.quaternion.clone(),p:n.position.clone(),rest:n.getWorldPosition(new K.Vector3())};bones.push(b);byNode.set(n,b);if(b.role==='body'||n.name==='koza_body')body=b;}
   if(n.isMesh){n.frustumCulled=false;}});
  const H=box.max.y-box.min.y,pivot=new K.Vector3(body?body.rest.x:(box.min.x+box.max.x)/2,box.min.y,body?body.rest.z:(box.min.z+box.max.z)/2);
  // Legs (leg0 -> leg1 -> leg2) with the rest geometry the IK solver needs.
  const legs=[];
  for(const up of bones.filter(b=>b.role==='leg0')){
   const lo=up.node.children.map(c=>byNode.get(c)).find(b=>b?.role==='leg1');if(!lo)continue;
   const ft=lo.node.children.map(c=>byNode.get(c)).find(b=>b?.role==='leg2');
   const endC=ft?ft.rest.clone():new K.Vector3().fromArray(lo.node.userData.restEnd||[lo.rest.x,box.min.y,lo.rest.z]);
   const a=up.rest.clone(),b=lo.rest.clone(),c=endC,ab=b.clone().sub(a),bc=c.clone().sub(b),axis=c.clone().sub(a).normalize();
   const pole=ab.clone().addScaledVector(axis,-ab.dot(axis));if(pole.lengthSq()<1e-8)pole.set(0,0,1);pole.normalize();
   const front=a.z>pivot.z;
   legs.push({up,lo,ft,a,b,c,ab,bc,pole,l1:ab.length(),l2:bc.length(),side:up.side||Math.sign(a.x-pivot.x)||1,front});
  }
  // Radius around the pivot (all headings) and frame bounds in model units.
  let r=0;const v=new K.Vector3();
  model.traverse(n=>{if(!n.isMesh)return;const g=n.geometry,pos=g.attributes.position;const step=Math.max(1,Math.floor(pos.count/1500));
   for(let i=0;i<pos.count;i+=step){n.getVertexPosition?n.getVertexPosition(i,v):v.fromBufferAttribute(pos,i);v.applyMatrix4(n.matrixWorld);r=Math.max(r,Math.hypot(v.x-pivot.x,v.z-pivot.z));}});
  r*=1.06;
  const offset=new K.Group(),yawG=new K.Group(),bob=new K.Group(),holder=new K.Group();
  offset.position.set(-pivot.x,-pivot.y,-pivot.z);offset.add(model);yawG.add(offset);bob.add(yawG);holder.add(bob);
  const species=model.userData?.kozaSpecies||gltf.scene.userData?.kozaSpecies||'';
  const prof=PROFILE[id]||PROFILE.koru;
  const lift=(prof.hover||0)*H+(prof.bounce||0)*H*1.5;
  // Reference extent: longest projected dimension at the gameplay camera facing the camera (heading down), fixed per
  // model so turning never pumps the size.
  const e=elevation();holder.rotation.x=e;holder.updateMatrixWorld(true);const pb=new K.Box3().setFromObject(holder,true);
  const extent=Math.max(pb.max.x-pb.min.x,pb.max.y-pb.min.y);
  const cache=document.createElement('canvas'),cctx=cache.getContext('2d');
  return {id,form,file,model,holder,bob,yawG,bones,body,legs,H,r,lift,extent,species,prof,cache,cctx,cacheValid:false,gpu:false,phase:0,move:0,yaw:undefined,t:undefined,lastRender:-1,used:performance.now()};
 }
 async function ensure(id,form){
  const k=key(id,form);if(entries.has(k))return true;if(failed.has(k)||!enabled)return false;if(pending.has(k))return pending.get(k);
  const file=FORMS[id]?.[form-1];if(!file||!init()){failed.add(k);return false;}
  const job=(async()=>{try{stats.loads++;const gltf=await K.loadGLTF(file);if(!gltf)throw new Error('load failed '+file);const en=build(gltf,id,form,file);entries.set(k,en);evict();return true;}
   catch(e){failed.add(k);note('hero model '+file,e);return false;}finally{pending.delete(k);}})();
  pending.set(k,job);return job;
 }
 function disposeEntry(en){en.model.traverse(n=>{if(!n.isMesh)return;n.geometry.dispose();for(const m of [].concat(n.material)){for(const val of Object.values(m))if(val?.isTexture)val.dispose();m.dispose();}});en.gpu=false;en.cacheValid=false;}
 function evict(){
  // LRU beyond MAX_RESIDENT, but never an entry drawn in the last 3 s (no load/dispose ping-pong).
  const now=performance.now(),list=[...entries.values()].sort((a,b)=>b.used-a.used);
  for(const en of list.slice(MAX_RESIDENT))if(now-en.used>3000){disposeEntry(en);entries.delete(key(en.id,en.form));stats.evictions++;}
  stats.resident=entries.size;
 }
 // ---------- locomotion (temporary validation profiles) ----------
 const q0=new K.Quaternion(),q1=new K.Quaternion(),eul=new K.Euler(),tv=new K.Vector3(),dir=new K.Vector3(),knee=new K.Vector3(),pole=new K.Vector3(),tmp=new K.Vector3();
 function solve(leg,target){
  dir.copy(target).sub(leg.a);const d=clamp(dir.length(),Math.abs(leg.l1-leg.l2)+1e-5,leg.l1+leg.l2-1e-5);dir.normalize();target.copy(leg.a).addScaledVector(dir,d);
  const along=(leg.l1*leg.l1+d*d-leg.l2*leg.l2)/(2*d),height=Math.sqrt(Math.max(0,leg.l1*leg.l1-along*along));
  pole.copy(leg.pole).addScaledVector(dir,-leg.pole.dot(dir)).normalize();knee.copy(leg.a).addScaledVector(dir,along).addScaledVector(pole,height);
  q0.setFromUnitVectors(tmp.copy(leg.ab).normalize(),tv.copy(knee).sub(leg.a).normalize());
  q1.setFromUnitVectors(tmp.copy(leg.bc).normalize(),tv.copy(target).sub(knee).normalize());
  leg.up.node.quaternion.copy(leg.up.q).multiply(q0);leg.lo.node.quaternion.copy(q0).invert().multiply(q1);
  if(leg.ft)leg.ft.node.quaternion.copy(q1).invert();
 }
 function animate(en,t,dt,pace,reduced){
  const P=en.prof,H=en.H;for(const b of en.bones){b.node.quaternion.copy(b.q);b.node.position.copy(b.p);}
  const moving=pace>.05?1:0;en.move+=(moving-en.move)*(1-Math.exp(-dt*10));const m=reduced?0:en.move,alive=reduced?0:1;
  if(P.cadence)en.phase+=dt*P.cadence*(.35+.65*clamp(pace,0,1))*m;
  const ph=en.phase*TAU;let bob=0;
  if(P.gait==='hover'){bob=H*((P.hover||0)+Math.sin(t*2.2)*.02*alive);}
  else bob=Math.abs(Math.sin(ph))*H*P.bounce*m;
  en.bob.position.y=bob;
  for(const b of en.bones){
   const r=b.role;let x=0,y=0,z=0;
   if(r.startsWith('wing')){const f=P.flapIdle+(P.flap-P.flapIdle)*m,wrist=r==='wing1',st=Math.sin(t*f)+.16*Math.sin(2*t*f),amp=(P.wing||.4)*(.6+.4*m)*alive;
    z=b.side*(wrist?.25*Math.sin(t*f-.6):st)*amp;x=(wrist?.08:.04)*Math.sin(t*f-.3)*alive;}
   else if(r.startsWith('tail')){const i=Number(r.slice(4))||0;y=Math.sin(t*(2.4+2*m)-i*.45)*P.tail*(.6+.6*m)*alive;x=P.gait==='hover'?Math.sin(t*2.2-i*.4)*P.tail*.6*alive:0;}
   else if(r.startsWith('neck')){x=Math.sin(t*2+(r==='neck1'?.5:0))*P.neck*alive+(P.gait==='trot'?Math.sin(ph*2)*.02*m:0);}
   else if(r.startsWith('petal')){z=b.side*Math.sin(t*2.2+b.phase)*P.petal*alive;x=Math.cos(t*2+b.phase)*P.petal*.6*alive;}
   if(x||y||z){eul.set(x,y,z);b.node.quaternion.multiply(q0.setFromEuler(eul));}
  }
  for(const leg of en.legs){
   const target=tv.copy(leg.c);
   if(P.gait==='hover'){target.y+=H*.05;target.z-=H*.03;}
   else{
    // diagonal pairs (FL+BR, FR+BL): trot for Koru, fast tiny scurry for Lumi
    const off=((leg.front?0:.5)+(leg.side>0?0:.5))%1,u=((en.phase+off)%1+1)%1,stance=P.gait==='scurry'?.55:.6,A=H*P.stride*.5;
    let fwd,up=0;if(u<stance)fwd=A*(1-2*u/stance);else{const s=(u-stance)/(1-stance);fwd=-A+2*A*ease(s);up=Math.sin(s*Math.PI)*H*P.lift;}
    target.z+=fwd*m;target.y+=up*m;
   }
   target.y-=en.bob.position.y*(P.gait==='hover'?0:1);   // feet stay planted under the body bounce
   solve(leg,tmp.copy(target));
  }
 }
 // ---------- drawing ----------
 function render(en,ppu,res){
  const e=elevation();en.holder.rotation.x=e;
  const sin=Math.sin(e),cos=Math.cos(e),r=en.r,top=en.H*1.08*cos+r*sin+en.lift*cos,bottom=-r*sin-en.H*.02;
  let w=Math.round(2*r*ppu*res),h=Math.round((top-bottom)*ppu*res),k=1;if(w>GL_SIZE||h>GL_SIZE){k=GL_SIZE/Math.max(w,h);w=Math.floor(w*k);h=Math.floor(h*k);}
  camera.left=-r;camera.right=r;camera.top=top;camera.bottom=bottom;camera.updateProjectionMatrix();
  scene.add(en.holder);const t0=performance.now();
  renderer.setViewport(0,0,w,h);renderer.setScissor(0,0,w,h);renderer.setScissorTest(true);renderer.clear();renderer.render(scene,camera);renderer.setScissorTest(false);
  scene.remove(en.holder);
  if(en.cache.width!==w||en.cache.height!==h){en.cache.width=w;en.cache.height=h;}else en.cctx.clearRect(0,0,w,h);
  en.cctx.drawImage(glCanvas,0,GL_SIZE-h,w,h,0,0,w,h);
  const ms=performance.now()-t0;stats.renderMs=ms;stats.renderMsEMA=stats.renderMsEMA*.95+ms*.05;stats.renders++;en.gpu=true;en.cacheValid=true;
  en.frame={left:-r*ppu,top:-top*ppu,width:2*r*ppu,height:(top-bottom)*ppu};
 }
 function sizeFor(id,form,en,size){const stage=form-1;return size*(.78+stage*.04)*((AREA[id]||[])[stage]||1)/en.extent;}
 // Returns true when the 3D hero was drawn. x,y = collision centre; foot = offset to the ground line (game heroFoot).
 function drawEntry(g,en,x,y,size,state,alpha,scaleMul=1){
  const now=state.time??performance.now()/1000,dt=en.t===undefined?0:clamp(now-en.t,0,.1);en.t=now;en.used=performance.now();
  const e=elevation(),a=Number.isFinite(state.angle)?state.angle:Math.PI/2;
  const desired=Math.atan2(Math.cos(a),Math.sin(a)/Math.max(.25,Math.sin(e)));
  if(en.yaw===undefined||state.reduced)en.yaw=desired;else{const d=Math.atan2(Math.sin(desired-en.yaw),Math.cos(desired-en.yaw));en.yaw+=d*(1-Math.exp(-dt*14));}
  en.yawG.rotation.y=en.yaw;animate(en,now,dt,state.pace||0,!!state.reduced);
  const ppu=sizeFor(en.id,en.form,en,size)*scaleMul,res=clamp(Math.min(window.devicePixelRatio||1,2),1,2);
  const hz=cam()?.hz?.(false,true)||30;
  if(!en.cacheValid||now-en.lastRender>=1/hz-1e-4||now<en.lastRender||en.lastPPU!==ppu){applyRig();render(en,ppu,res);en.lastRender=now;en.lastPPU=ppu;}
  const f=en.frame,fy=y+(state.foot??size*.3);
  g.save();g.globalAlpha*=alpha;g.drawImage(en.cache,x+f.left,fy+f.top,f.width,f.height);g.restore();stats.draws++;return true;
 }
 function glow(g,x,y,size,k){if(!(k>0))return;g.save();const r=size*(.55+.35*k),gr=g.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,`rgba(255,246,214,${.55*k})`);gr.addColorStop(.5,`rgba(206,244,236,${.25*k})`);gr.addColorStop(1,'rgba(206,244,236,0)');g.fillStyle=gr;g.fillRect(x-r,y-r,2*r,2*r);g.restore();}
 function drawHero(g,id,form,x,y,size,state={}){
  if(!enabled||!init()){stats.fallbacks++;return false;}
  form=clamp(Math.round(form)||1,1,4);const k=key(id,form),en=entries.get(k);
  // Preload: the active form first, then the next form in the background (so a progression step swaps without a gap).
  if(!en){ensure(id,form);stats.fallbacks++;return false;}
  if(form<4&&!entries.has(key(id,form+1))&&!failed.has(key(id,form+1))&&!pending.size)ensure(id,form+1);
  const alpha=state.alpha??1;
  // Form change: brief controlled light + cross-fade + small scale settle (QA evolution preview; not a final animation).
  const prev=state.noTransition?form:lastForm.get(id);if(!state.noTransition)lastForm.set(id,form);
  if(prev&&prev!==form)transitions.set(id,{from:prev,to:form,t0:performance.now()});
  const tr=state.noTransition?null:transitions.get(id);
  if(tr&&tr.to===form){
   const u=(performance.now()-tr.t0)/650;if(u>=1)transitions.delete(id);
   else{
    const old=entries.get(key(id,tr.from)),fy=y+(state.foot??size*.3)-size*.35;
    if(old&&u<.5)drawEntry(g,old,x,y,size,state,alpha*(1-ease(u*2)),1+.04*ease(u*2));
    if(u>=.35)drawEntry(g,en,x,y,size,state,alpha*ease((u-.35)/.4),.92+.08*ease((u-.35)/.65));
    glow(g,x,fy,size,Math.sin(Math.PI*clamp(u,0,1)));return true;
   }
  }
  try{return drawEntry(g,en,x,y,size,state,alpha);}catch(e){failed.add(k);entries.delete(k);note('draw '+k,e);stats.fallbacks++;return false;}
 }
 function preloadAll(id){for(let f=1;f<=4;f++)ensure(id,f);}
 window.KozaHeroes3D=Object.freeze({
  enabled:()=>enabled&&!failedGL,setEnabled(v){enabled=!!v&&!!K;},
  ensure,draw:drawHero,preloadAll,isReady:(id,form=1)=>entries.has(key(id,form)),
  forms:FORMS,profiles:PROFILE,area:AREA,stats,
  entry:(id,form)=>entries.get(key(id,form)),
  failed:()=>[...failed],resident:()=>[...entries.keys()],
  camera:()=>({elevationDeg:elevation()*180/Math.PI})});
})();
