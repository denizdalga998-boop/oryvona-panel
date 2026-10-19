/* v26 lifecycle: five views share one owner-scoped bridge and read model. No provider/worker startup. */
(() => {
  'use strict';
  const VIEWS=['home','feed','tests','store','jarvis'];
  let mountedKey=null,bridge=null,data=null,voice=null,decisions=null,disposed=false,mounting=false;
  let timer=null,pendingSync=0,lastRefresh=0,dataUnsub=null;
  const worlds=new Map(),listeners=[];
  const host=()=>window.OryvonaStudioHost;
  const context=()=>host()?.context?.()||{};
  const key=()=>{const c=context();return [c.userId||'',!!c.authenticated,!!c.isOwner,!!c.demo].join('|');};
  function on(node,name,fn,options){node.addEventListener(name,fn,options);listeners.push(()=>node.removeEventListener(name,fn,options));}
  function rootFor(view){return document.getElementById(view==='jarvis'?'jarvisWorld':'studioWorld-'+view);}
  function bottomInset(){const nav=document.querySelector('.tabs');if(!nav||nav.hidden||!nav.getClientRects().length)return 0;const vv=window.visualViewport,lower=vv?vv.offsetTop+vv.height:window.innerHeight,r=nav.getBoundingClientRect();return Math.max(0,Math.min(r.height,lower-r.top));}
  function companyBrand(){
    const old=document.getElementById('titleBtn');if(!old)return;
    old.hidden=true;old.dataset.v26LegacyTitle='true';
    let brand=document.getElementById('v26CompanyBrand');
    if(!brand){brand=document.createElement('div');brand.id='v26CompanyBrand';brand.className='sv-company-brand';const small=document.createElement('span'),strong=document.createElement('strong');small.textContent='ORYVONA GAMES';strong.textContent='STUDIO OS';brand.append(small,strong);old.after(brand);}
  }
  function syncCompatibility(close=false){
    const disclosure=document.getElementById('v26StoreCompatibility'),legacy=document.getElementById('v26Legacy-store');
    if(!disclosure||!legacy)return;
    if(close)disclosure.open=false;
    const c=context();disclosure.hidden=!c.authenticated||!!c.demo||document.hidden;
    const show=!disclosure.hidden&&c.view==='store'&&disclosure.open;
    legacy.hidden=!show;legacy.inert=!show;legacy.setAttribute('aria-hidden',String(!show));
  }
  function disposeMount(){
    syncCompatibility(true);
    if(dataUnsub)dataUnsub();dataUnsub=null;
    for(const record of worlds.values())try{record.ui.destroy();}catch{}worlds.clear();
    try{decisions?.destroy?.();}catch{}try{voice?.destroy();}catch{}try{data?.destroy();}catch{}try{bridge?.dispose();}catch{}
    bridge=data=voice=decisions=null;mountedKey=null;
    for(const view of VIEWS)rootFor(view)?.replaceChildren();
  }
  function fail(message){for(const view of VIEWS){const root=rootFor(view);if(!root)continue;root.replaceChildren();const p=document.createElement('p');p.className='sv-boot-error';p.setAttribute('role','status');p.textContent=message;root.appendChild(p);}const boot=document.getElementById('jarvisV23BootMessage');if(boot)boot.hidden=true;}
  function applyActive(){
    const view=context().view||'home',visible=!document.hidden;
    document.body.dataset.view=view;document.body.dataset.oryvonaView=view;
    document.body.classList.toggle('oryvona-jarvis-world',view==='jarvis');
    for(const [name,record]of worlds){const active=visible&&view===name;if(record.active!==active){record.active=active;record.ui.setActive(active);}}
    syncCompatibility();
    if(!visible||view!=='jarvis')voice?.cancel();
  }
  async function refresh(force=false){
    if(disposed||document.hidden||!data||!bridge)return;
    const now=Date.now();if(!force&&now-lastRefresh<15000)return;lastRefresh=now;
    await Promise.allSettled([bridge.refresh(),data.refresh()]);
  }
  function mount(){
    if(mounting||disposed)return;mounting=true;
    try{
      const required=['OryvonaJarvisBridge','OryvonaStudioDataV26','OryvonaJarvisBrief','OryvonaJarvisVoice','OryvonaStudioWorldV26','OryvonaJarvisWorld','OryvonaStudioDecisionsV26'];
      if(!host()||!window.OryvonaPanel||required.some(name=>!window[name]))throw Error('COMPONENT_UNAVAILABLE');
      disposeMount();
      bridge=window.OryvonaJarvisBridge.create(host());
      // The raw private facade validates UID; this wrapper carries the bridge's exact account generation.
      const panel=window.OryvonaPanel;
      const scopedPanel={
        getStudioSnapshot:()=>panel.getStudioSnapshot(bridge.getAccountKey()),
        async refreshStudioSnapshot(){const captured=bridge.getAccountKey(),answer=await panel.refreshStudioSnapshot(captured);return captured===bridge.getAccountKey()?answer:panel.getStudioSnapshot(bridge.getAccountKey());}
      };
      data=window.OryvonaStudioDataV26.create({panel:scopedPanel,bridge,document});
      // Browser-native Turkish voices only: local voices preferred. Remote browser voices are labelled;
      // no paid service, API key or model endpoint is configured. Audio remains opt-in.
      voice=window.OryvonaJarvisVoice.create({getAccountKey:()=>bridge?.getAccountKey()||null,localOnly:false,measureInput:true,tone:'argon',
        // Barge-in: inside the APK Argon's own voice comes back louder through the phone speaker, so the owner must be clearly louder.
        bargeInLevel:window.ArgonNative?0.16:0.07});
      decisions=window.OryvonaStudioDecisionsV26.create({host:host(),getAccountKey:()=>bridge?.getAccountKey()||null,getSnapshot:()=>data.getSnapshot()});
      const feedback=payload=>decisions.record({...payload,kind:'feedback'});
      const approve=payload=>decisions.record({...payload,kind:'accept'});
      for(const view of VIEWS){const root=rootFor(view);if(!root)throw Error('VIEW_ROOT_MISSING');const ui=view==='jarvis'?
        window.OryvonaJarvisWorld.mount(root,{bridge,studioData:data,voice,brief:window.OryvonaJarvisBrief,mode:'live',showActivity:true,bottomInset}):
        window.OryvonaStudioWorldV26.mount(root,{data,bridge,view,onOpenTests:id=>panel.openTests(id),onFeedback:feedback,onApprove:approve});
        worlds.set(view,{ui,active:null});
      }
      dataUnsub=data.subscribe(snapshot=>{if(snapshot.accountKey!==bridge?.getAccountKey())voice?.cancel();});
      mountedKey=key();window.__oryvonaJarvisV23Mounted=true;
      const old=document.getElementById('jarvisLegacySurface');if(old)old.hidden=true;
      const notice=document.getElementById('jarvisV23BootMessage');if(notice)notice.hidden=true;
      companyBrand();applyActive();refresh(true).catch(()=>{});
    }catch(error){disposeMount();fail('Stüdyo güvenli başlatılamadı. Sayfayı yenile; yeni ekran eski görev yoluna geçmedi.');}
    finally{mounting=false;}
  }
  function sync(){pendingSync=0;if(disposed)return;if(mountedKey!==key()||!data)mount();else{companyBrand();applyActive();refresh().catch(()=>{});}}
  // A view switch must never wait on painting: when frames stall (hidden/throttled WebView) a short timer still applies it.
  let syncTimer=0;
  function runSync(){if(pendingSync)window.cancelAnimationFrame(pendingSync);if(syncTimer)window.clearTimeout(syncTimer);pendingSync=0;syncTimer=0;sync();}
  function schedule(){if((pendingSync||syncTimer)||disposed)return;pendingSync=window.requestAnimationFrame(runSync);syncTimer=window.setTimeout(runSync,60);}
  function refreshClick(event){if(!event.target.closest?.('#refreshBtn'))return;event.preventDefault();event.stopImmediatePropagation();refresh(true).catch(()=>{});}
  on(document,'oryvona:ready',schedule);on(document,'oryvona:view-change',()=>{syncCompatibility();schedule();});on(document,'oryvona:studio-context-change',()=>{syncCompatibility(true);schedule();});
  const compatibility=document.getElementById('v26StoreCompatibility');if(compatibility)on(compatibility,'toggle',()=>syncCompatibility());
  on(document,'visibilitychange',()=>{applyActive();if(!document.hidden){schedule();refresh().catch(()=>{});}});
  on(document,'click',refreshClick,true);on(window,'pageshow',schedule);
  // No pagehide destroy: the document may enter bfcache. Each module handles suspension.
  timer=window.setInterval(()=>refresh().catch(()=>{}),30000);
  window.OryvonaStudioV26Lifecycle=Object.freeze({refresh:()=>refresh(true),destroy(){if(disposed)return;disposed=true;if(pendingSync)window.cancelAnimationFrame(pendingSync);if(syncTimer)window.clearTimeout(syncTimer);if(timer)window.clearInterval(timer);listeners.forEach(off=>off());disposeMount();document.body.classList.remove('oryvona-jarvis-world');}});
  syncCompatibility(true);
  sync();
})();
