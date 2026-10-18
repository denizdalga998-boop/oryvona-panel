'use strict';
window.KozaCloud=(()=>{
 // Panel staging only: static hosting has no KOZA cloud service. Preserve local
 // saves; do not create cloud queues, requests, polls, listeners, or fake results.
 if(new URLSearchParams(window.location.search).get('panel')==='1'){
  return Object.freeze({init:()=>Promise.resolve(),queue(){},event(){},flush:()=>Promise.resolve(),
   reconnect:()=>Promise.resolve(),insights(){const el=document.getElementById('testInsights');if(el)el.textContent='Panel önizlemesi · Bulut hizmeti bağlı değil.';},
   authRequired:false,status:'Panel önizlemesi · Cihaz kaydı kullanılıyor'});
 }
 let revision=0,ready=false,busy=false,pending=null,timer,status='Bağlanıyor',conflict=null,events=[],eventBusy=false,authRequired=false,reconnecting=null;
 try{events=JSON.parse(localStorage.getItem('koza-events')||'[]');if(!Array.isArray(events))events=[];}catch{}
 const copy=p=>JSON.parse(JSON.stringify(p));
 function remember(){if(!KozaSaveStore.canSync)return;try{localStorage.setItem('koza-sync',JSON.stringify({revision,pending,recovery:KozaSaveStore.recovery}));}catch{}}
 async function request(path,method='GET',body){const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);try{const r=await fetch('/api/'+path,{method,headers:method==='GET'?{}:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:controller.signal});if(r.status===401){authRequired=true;clearTimeout(timer);updateStatus('');throw Object.assign(Error('auth'),{auth:true});}if(r.status===409)throw Object.assign(Error('conflict'),{conflict:true});if(!r.ok)throw Error('unavailable');return await r.json();}finally{clearTimeout(timeout);}}
 function updateStatus(s){if(authRequired)s='Oturum gerekli · İlerlemen bu cihazda korunuyor';status=s;if($('cloudSignIn'))$('cloudSignIn').hidden=!authRequired;if($('cloudStatus'))$('cloudStatus').textContent=s;}
 function queue(p){if(!KozaSaveStore.canSync)return;pending=copy(p);remember();if(ready&&!authRequired){clearTimeout(timer);if(KozaSaveStore.recovery==='backup'){updateStatus('Kurtarılan kayıt bulut kontrolünü bekliyor');return;}updateStatus('Kaydediliyor…');timer=setTimeout(flush,600);}}
 function adoptRemote(value){const next=Progress.normalize(value);if(!KozaSaveStore.write(next,{replaceDamaged:true})){updateStatus('Bulut kaydı cihaza yazılamadı. Mevcut ilerleme korundu.');return false;}profile=next;saveOK=true;updateSaveNote();return true;}
 async function showConflict(remote){conflict=remote;updateStatus('İki kayıt arasında seçim gerekiyor');const local=copy(profile);try{localStorage.setItem('koza-conflict-local',JSON.stringify(local));}catch{}$('cloudConflictText').textContent='Bu cihaz: '+local.runs+' keşif, '+local.coins+' ışık. Bulut: '+remote.profile.runs+' keşif, '+remote.profile.coins+' ışık. İki kaydı birleştirmek ödülleri çoğaltabilir; devam edeceğin kaydı seç. Diğer cihaz kopyası burada saklanır.';if(mode==='play')pause();if(!$('cloudConflict').open)$('cloudConflict').showModal();}
 async function flush(){if(!ready||busy||!pending||conflict||authRequired||KozaSaveStore.recovery!=='none')return;busy=true;const snapshot=pending;try{const result=await request('profile','PUT',{profile:snapshot,revision});revision=result.revision;if(JSON.stringify(pending)===JSON.stringify(snapshot))pending=null;remember();updateStatus(pending?'Kaydediliyor…':'Buluta kaydedildi');}catch(e){if(e.conflict){try{await showConflict(await request('profile'));}catch{updateStatus('Bağlantı bekleniyor · Cihaz kaydı korunuyor');}}else updateStatus('Bağlantı bekleniyor · Cihaz kaydı korunuyor');}finally{busy=false;if(pending&&!conflict&&!authRequired)timer=setTimeout(flush,5000);}}
 function safePoint(){return new Promise(resolve=>{const check=()=>['play','paused','choice'].includes(typeof mode==='undefined'?'':mode)||(window.KozaLoading?.busy&&window.kozaReady)?setTimeout(check,250):resolve();check();});}
 async function init(){const initialProfile=JSON.stringify(profile);let previous;try{previous=JSON.parse(localStorage.getItem('koza-sync')||'null');}catch{}
  try{const remote=await request('profile');revision=remote.revision;ready=true;
   // Never swap the profile under an active or loading mission; decide at a safe point.
   if(remote.profile)await safePoint();
   if(remote.profile){
    const differs=JSON.stringify(profile)!==JSON.stringify(Progress.normalize(remote.profile));
    if(((JSON.stringify(profile)!==initialProfile||mode==='play'||mode==='choice'||KozaSaveStore.recovery==='backup'||previous?.recovery==='backup')&&differs)||(previous?.pending&&previous.revision!==remote.revision&&JSON.stringify(previous.pending)!==JSON.stringify(remote.profile))){pending=KozaSaveStore.canSync?copy(profile):null;await showConflict(remote);}
    else if(KozaSaveStore.recovery==='none'&&previous?.recovery!=='backup'&&previous?.pending&&previous.revision===remote.revision){pending=copy(profile);await flush();}
    else if(adoptRemote(remote.profile)){pending=null;remember();refresh();if(!$('chapterMap').hidden){mapRegion=profile.region;mapChapter=profile.campaign.selected[mapRegion];drawChapterMap();centerMapChapter();}updateStatus('Bulut kaydı yüklendi');}
    else{await showConflict(remote);updateStatus('Bulut kaydı cihaza yazılamadı. Tekrar seçerek deneyebilirsin.');}
   }else if(KozaSaveStore.canSync){KozaSaveStore.acknowledge();updateSaveNote();pending=copy(profile);await flush();}
   else updateStatus('Kullanılabilir bulut kaydı yok. Ayarlardan yedek yükle.');
  }catch{revision=previous?.revision||0;pending=KozaSaveStore.canSync?copy(profile):null;ready=true;remember();updateStatus(KozaSaveStore.canSync?'Çevrimdışı · Cihaz kaydı korunuyor':'Kayıt kurtarılmayı bekliyor · Buluta ulaşılamadı');if(!authRequired&&pending)timer=setTimeout(flush,5000);}
  event('session_start',{});flushEvents();
 }
 function eventId(){
  if(typeof crypto.randomUUID==='function')return crypto.randomUUID();
  const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);
  return Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
 }
 function event(kind,data){events.push({id:eventId(),kind,data});events=events.slice(-150);try{localStorage.setItem('koza-events',JSON.stringify(events));}catch{}if(ready)flushEvents();}
 async function flushEvents(){if(eventBusy||!ready||!events.length||authRequired)return;eventBusy=true;const batch=events.slice(0,20);try{await request('events','POST',{events:batch});const sent=new Set(batch.map(e=>e.id));events=events.filter(e=>!sent.has(e.id));try{localStorage.setItem('koza-events',JSON.stringify(events));}catch{}}catch{}finally{eventBusy=false;}}
 $('useCloud').onclick=()=>{if(!conflict||!adoptRemote(conflict.profile))return;revision=conflict.revision;conflict=null;pending=null;remember();$('cloudConflict').close();if($('paused').open)$('paused').close();if($('powerChoice').open)$('powerChoice').close();home();refresh();updateStatus('Bulut kaydı seçildi');};
 $('keepLocal').onclick=()=>{if(!conflict)return;if(!KozaSaveStore.write(profile,{replaceDamaged:true})){updateStatus('Cihaz kaydı yazılamadı. Seçimin uygulanmadı.');return;}saveOK=true;updateSaveNote();revision=conflict.revision;conflict=null;pending=copy(profile);remember();$('cloudConflict').close();flush();};
 $('cloudConflict').addEventListener('cancel',e=>e.preventDefault());
 function resumeSync(){if(KozaSaveStore.recovery!=='none')reconnect();else{flush();flushEvents();}}
 window.addEventListener('online',resumeSync);document.addEventListener('visibilitychange',()=>{if(!document.hidden)resumeSync();});
 function reconnect(){if(reconnecting)return reconnecting;authRequired=false;clearTimeout(timer);updateStatus('Bağlantı kontrol ediliyor…');reconnecting=init().then(flush).finally(()=>{reconnecting=null;});return reconnecting;}
 async function insights(){if(authRequired){$('testInsights').textContent='Bulut istatistikleri için oturum açmalısın.';return;}try{const s=await request('insights');$('testInsights').textContent=s.starts+' tur başlangıcı · '+s.finished+' tur sonu · '+s.wins+' başarı · '+s.days+' farklı gün. '+(s.rating?'Eğlence puanı: '+s.rating+'/5 ('+s.ratings+' görüş). ':'')+(s.hardest?'En çok kaybedilen: '+s.hardest.replace('garden','Ayışığı').replace('grove','Koru')+'.':'');}catch{$('testInsights').textContent='Deneme verileri şu anda yüklenemedi.';}}
 return {init,queue,event,flush,insights,reconnect,get authRequired(){return authRequired;},get status(){return status;}};
})();
