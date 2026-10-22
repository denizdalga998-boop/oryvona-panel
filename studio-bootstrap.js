/* Awaited, owner-scoped panel startup. No model/worker execution; reads only existing studio data. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.OryvonaStudioBootstrap=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function clean(value){return String(value||'').replace(/Bearer\s+\S+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|\b(?:sb_secret_|gh[pousr]_)[A-Za-z0-9_-]+/g,'[REDACTED]').replace(/[\u0000-\u001f]/g,' ').slice(0,600);}
 function diagnostic(error,stage,source){
  const d=error?.diagnostic||{},http=Number(d.http??error?.http??error?.status);
  return Object.freeze({stage:clean(d.stage||error?.stage||stage||'unknown'),source:clean(d.source||error?.source||source||stage||'unknown'),http:Number.isInteger(http)&&http>=100&&http<=599?http:null,code:clean(d.code||error?.code||error?.name||'ERROR'),message:clean(d.message||error?.message||error||'Bilinmeyen hata')});
 }
 function failure(stage,code,message,http=null,source=stage){const error=new Error(message);error.code=code;error.diagnostic=diagnostic({code,message,http},stage,source);return error;}
 function create(options){
  let generation=0,inflight=null;
  function reset(){generation++;inflight=null;}
  function run(meta={}){
   if(inflight)return inflight;
   const owner=options.getIdentity(),ticket=generation;
   if(!owner)return Promise.reject(failure('owner','AUTH_SESSION_REQUIRED','Gerçek kullanıcı oturumu henüz yok.'));
   const trace=[];let stage='owner';
   const guard=()=>{if(ticket!==generation||options.getIdentity()!==owner)throw failure(stage,'AUTH_CHANGED','Başlangıç sırasında hesap değişti.');};
   async function step(name,fn){
    stage=name;guard();meta.onStage?.({stage:name,trace:[...trace]});
    const abort=new AbortController();let timer;
    try{const value=await Promise.race([Promise.resolve().then(()=>fn({signal:abort.signal,owner})),new Promise((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(failure(name,'STAGE_TIMEOUT','Bu aşama 20 saniyede yanıt vermedi.'));},20000);})]);guard();trace.push({stage:name,status:'passed'});return value;}
    catch(error){const d=diagnostic(error,name);throw Object.assign(new Error(d.message),{code:d.code,diagnostic:d,trace:[...trace,{stage:name,status:'failed'}]});}
    finally{clearTimeout(timer);}
   }
   const work=(async()=>{
    if(await step('owner',options.owner)!==true)throw failure('owner','OWNER_ROLE_MISSING','Doğrulanmış sahip rolü bulunamadı.');
    const projects=await step('projects',options.projects);
    if(!Array.isArray(projects)||!projects.length)throw failure('projects','PROJECTS_EMPTY','projects sorgusu boş döndü; sahip rolü proje verisi yerine kullanılmadı.',200,'projects');
    const records=await step('records',options.records);
    if(records?.state!=='ready'){
     const bad=Object.entries(records?.coverage||{}).find(([,c])=>c.state==='error');
     const error=failure('records','STUDIO_RECORDS_NOT_READY','Stüdyo kayıtlarının yüklenmesi tamamlanmadı.');
     if(bad?.[1]?.diagnostic)error.diagnostic=diagnostic(bad[1].diagnostic,'records',bad[0]);
     throw error;
    }
    const count=['statuses','events','runs','releases'].reduce((n,key)=>n+(Array.isArray(records[key])?records[key].length:0),0);
    if(!count)throw failure('records','STUDIO_RECORDS_EMPTY','Sorgular başarılı fakat henüz gerçek stüdyo kaydı bulunamadı.',200);
    const connection=await step('connection',options.connection);
    if(!connection||connection.submitAvailable!==true)throw failure('connection','COMMAND_PORT_UNAVAILABLE','Sahip komut portu henüz doğrulanmadı.');
    guard();return {ready:true,projectCount:projects.length,recordCount:count,connection,trace};
   })().finally(()=>{if(inflight===work)inflight=null;});
   inflight=work;return work;
  }
  return Object.freeze({run,reset});
 }
 return Object.freeze({create,diagnostic,failure});
});
