/* Personal APK owner access: real Supabase identity, awaited studio startup, no embedded owner secret. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./studio-bootstrap.js'));else root.OryvonaPersonalAccess=factory(root.OryvonaStudioBootstrap);})(typeof globalThis!=='undefined'?globalThis:this,function(bootstrap){
 'use strict';
 function create(options){
  const native=options.native,local=options.localStorage,key=options.storageKey;
  const fetcher=options.fetch||globalThis.fetch,delay=options.setTimeout||setTimeout,cancel=options.clearTimeout||clearTimeout;
  let client=null,identity=null,running=null,retryTimer=null,stopped=false,epoch=0,pairing=null,snapshot={state:'connecting',stage:'session',busy:false},stage='session',memorySession=undefined,pendingWrite=null,persistTimer=null,storageFault=null;
  const status=(state,extra={})=>{snapshot=Object.freeze({state,stage,busy:state==='connecting',...(pairing||{}),persistencePending:pendingWrite!==null,storageDiagnostic:storageFault,...extra});options.onStatus?.(snapshot);};
  const advance=name=>{stage=name;status('connecting');};
  function storageError(error){storageFault=bootstrap.diagnostic({code:error.code||error.message||'SESSION_STORAGE_UNAVAILABLE',message:'Güvenli oturum deposu geçici olarak okunamıyor/yazılamıyor; mevcut kayıt korunuyor.'},'session','native_storage');}
  function retryPersistence(){if(stopped||persistTimer!==null||pendingWrite===null)return;persistTimer=delay(()=>{persistTimer=null;flushPersistence().catch(()=>{});},5000);}
  async function flushPersistence(){
   const value=pendingWrite;if(value===null||stopped)return;
   try{await native.ownerStorage('set',key,value);if(pendingWrite===value){pendingWrite=null;storageFault=null;if(local.getItem(key)===value)local.removeItem(key);}}
   catch(error){storageError(error);retryPersistence();}
  }
  const storage={
   async getItem(name){
    if(name!==key)return local.getItem(name);if(memorySession!==undefined)return memorySession;
    try{const stored=await native.ownerStorage('get',key);if(stored!==null){memorySession=stored;return stored;}}
    catch(error){storageError(error);}
    const old=local.getItem(key);memorySession=old||null;
    if(old){pendingWrite=old;await flushPersistence();}return memorySession;
   },
   async setItem(name,value){
    if(name!==key)return local.setItem(name,value);
    if(typeof value!=='string'||value.length>24000)throw bootstrap.failure('session','SESSION_STORAGE_VALUE_INVALID','Oturum depolama biçimi geçerli değil.');
    // These are actual Supabase-issued credentials, not a synthesized owner session. Persistence may retry independently.
    memorySession=value;pendingWrite=value;await flushPersistence();
   },
   async removeItem(name){
    if(name!==key)return local.removeItem(name);
    // SDK refresh/signOut errors only invalidate this in-memory view. Never erase the encrypted fallback or device keys.
    memorySession=null;pendingWrite=null;
   }
  };
  async function api(body,bearer){
   const response=await fetcher(options.url+'/functions/v1/personal-device',{method:'POST',headers:{apikey:options.anonKey,Authorization:'Bearer '+(bearer||options.anonKey),'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
   let result;try{result=await response.json();}catch{throw bootstrap.failure(stage,'INVALID_RESPONSE','Cihaz servisi JSON yanıtı vermedi.',response.status,'personal-device/'+body.op);}
   if(!response.ok)throw bootstrap.failure(stage,result.error||'DEVICE_REQUEST_FAILED',result.message||result.error||'Cihaz isteği başarısız.',response.status,'personal-device/'+body.op);return result;
  }
  function clearRetry(){if(retryTimer!==null){cancel(retryTimer);retryTimer=null;}}
  function retry(ms=6000){if(stopped||retryTimer!==null)return;retryTimer=delay(()=>{retryTimer=null;ensure().catch(()=>{});},ms);}
  async function checkOwner(session){
   if(!session?.access_token)return null;
   advance('auth_user');const {data,error}=await client.auth.getUser(session.access_token);
   if(error){if(error.status===401)return false;throw error;}
   if(!data?.user?.id||data.user.id!==session.user?.id)return false;
   advance('owner');
   // A newly issued session is not installed yet: use THAT real bearer explicitly.
   const response=await fetcher(options.url+'/rest/v1/team_members?select=email,role&role=eq.owner&email=ilike.'+encodeURIComponent(data.user.email),{headers:{apikey:options.anonKey,Authorization:'Bearer '+session.access_token},signal:AbortSignal.timeout(20000)});
   const roles=await response.json();
   if(!response.ok)throw bootstrap.failure('owner',roles.code||'OWNER_QUERY_FAILED',roles.message||'Sahip rolü sorgulanamadı.',response.status,'team_members');
   return Array.isArray(roles)&&roles.some(row=>String(row.email||'').toLowerCase()===data.user.email.toLowerCase()&&row.role==='owner')?data.user:false;
  }
  async function recoverExistingIdentity(){
   if(typeof native.deviceRecoveryProof!=='function'||typeof native.restoreDeviceIdentity!=='function')throw bootstrap.failure('device','DEVICE_RECOVERY_COMPONENT_REQUIRED','Mevcut anahtarla kimlik kurtarma bileşeni gerekli.');
   advance('device');const proof=await native.deviceRecoveryProof();
   const recovered=await api({op:'recover',...proof});
   if(recovered.status!=='recovered')throw bootstrap.failure('device','DEVICE_RECOVERY_UNAVAILABLE','Mevcut anahtar için onaylı cihaz kaydı doğrulanamadı. Yeni kimlik üretilmedi.');
   await native.restoreDeviceIdentity(recovered);identity=await native.personalIdentity();return identity;
  }
  async function enroll(session){
   advance('device');
   if(!identity){try{identity=await native.personalIdentity();}catch(error){if(!['device_id_recovery_required','device_identity_marker_corrupt','device_key_fingerprint_changed'].includes(error.code||error.message))throw error;await recoverExistingIdentity();}}
   try{return await api({op:'register',...identity},session?.access_token);}
   catch(error){if(!['device_id_recovery_required','device_key_mismatch'].includes(error.code))throw error;await recoverExistingIdentity();return api({op:'register',...identity},session?.access_token);}
  }
  async function authenticate(){
   advance('challenge');const challenge=await api({op:'challenge',deviceId:identity.deviceId});
   advance('signature');const signature=await native.signDeviceChallenge(challenge);
   advance('session');return api({op:'session',deviceId:identity.deviceId,challengeId:challenge.challengeId,signature});
  }
  async function run(){
   if(!client||stopped)return;
   const ticket=epoch,valid=()=>!stopped&&ticket===epoch;
   try{
    advance('session');const {data,error}=await client.auth.getSession();
    if(error&&error.name!=='AuthSessionMissingError'&&!(error.name==='AuthApiError'&&[400,401].includes(error.status)))throw error;
    let session=data?.session||null,owner=await checkOwner(session);
    if(owner===false&&session?.refresh_token&&typeof client.auth.refreshSession==='function'){advance('session');const renewed=await client.auth.refreshSession({refresh_token:session.refresh_token});if(renewed.error&&![400,401].includes(renewed.error.status))throw renewed.error;if(renewed.data?.session){session=renewed.data.session;owner=await checkOwner(session);}}
    if(!valid())return;
    let registrationPending=false;
    if(owner){
     // Keep a valid owner session even when device enrollment is temporarily unavailable.
     try{const enrolled=await enroll(session);registrationPending=enrolled.status!=='approved';}catch{registrationPending=true;}
    }else{
     if(session)await options.onSession(null);
     const registered=await enroll(null);if(!valid())return;
     if(registered.status!=='approved'){
      pairing={pairingCode:registered.pairingCode,fingerprint:registered.fingerprint,expiresAt:registered.expiresAt};status('pairing_required');retry(5000);return;
     }
     pairing=null;const result=await authenticate();if(!valid())return;
     if(result.status!=='authenticated')throw bootstrap.failure('session','OWNER_SESSION_REQUIRED','Cihaz onaylı fakat gerçek oturum henüz oluşturulamadı.');
     owner=await checkOwner(result.session);if(!owner)throw bootstrap.failure('owner','owner_access_revoked','Doğrulanmış sahip rolü bulunamadı.');
     advance('session');const saved=await client.auth.setSession({access_token:result.session.access_token,refresh_token:result.session.refresh_token});
     if(saved.error)throw saved.error;session=saved.data.session;
    }
    if(!valid())return;pairing=null;advance('panel');
    const panel=await options.onSession(session,{onStage:info=>{if(valid())advance(info.stage);}});
    if(!valid())return;
    if(panel?.ready!==true)throw bootstrap.failure('panel','PANEL_NOT_READY','Gerçek stüdyo başlangıcı tamamlanmadı.');
    stage='complete';status('ready',{deviceRegistrationPending:registrationPending,projectCount:panel.projectCount,recordCount:panel.recordCount,connection:panel.connection,trace:panel.trace});
   }catch(error){
    if(!valid())return;
    const d=bootstrap.diagnostic(error,stage);
    if(['device_revoked','owner_access_revoked','owner_session_rejected','device_key_mismatch'].includes(d.code)){
     pairing=null;await options.onSession(null);status('access_revoked',{diagnostic:d});return;
    }
    stage=d.stage;status(pairing?'pairing_wait':'connection_wait',{diagnostic:d,trace:error.trace||[]});retry(d.http===429?31000:10000);
   }
  }
  function ensure(){if(stopped)return Promise.resolve();if(running)return running;clearRetry();running=run().finally(()=>{running=null;});return running;}
  function authChanged(event,session){
   // Do not await Supabase work inside its auth-lock callback. Never report ready here.
   if(event==='SIGNED_OUT'){epoch++;pairing=null;options.onSession(null);}
   delay(()=>{if(stopped)return;if(event==='SIGNED_OUT'&&running)running.finally(()=>ensure()).catch(()=>{});else ensure().catch(()=>{});},0);
  }
  return Object.freeze({storage,ensure,reconnect(){clearRetry();return ensure();},getSnapshot:()=>Object.freeze({...snapshot,persistencePending:pendingWrite!==null,storageDiagnostic:storageFault}),authChanged,bind(value){client=value;},destroy(){stopped=true;epoch++;clearRetry();if(persistTimer!==null)cancel(persistTimer);pendingWrite=null;memorySession=undefined;}});
 }
 return Object.freeze({create});
});
