/* PRODUCT REVIEW receipts only. No worker, execution, publication or QA mutations. */
(function(root,factory){'use strict';if(typeof module==='object'&&module.exports)module.exports=factory();else root.OryvonaStudioDecisionsV26=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const IDS=Object.freeze(['koza','charm-drop','forge-run','aeryo','tupsper']);
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,HASH=/^[a-f0-9]{64}$/;
  function fail(code,message){return Object.assign(new Error(message),{code});}
  function canonical(x){return x&&typeof x==='object'?(Array.isArray(x)?'['+x.map(canonical).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}'):JSON.stringify(x);}
  function normalize(input){
    input=input||{};const a=input.artifact||{},hash=typeof a.sha256==='string'?a.sha256.toLowerCase():'';
    if(!IDS.includes(input.projectId)||!HASH.test(hash)||!['accept','reject','feedback'].includes(input.kind))throw fail('INVALID_DECISION','Proje, paket özeti veya karar geçersiz.');
    const text=input.text==null?'':input.text;if(typeof text!=='string'||text.length>8000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)||input.kind==='feedback'&&!text.trim())throw fail('INVALID_DECISION','Geri bildirim boş veya çok uzun.');
    const version=input.version==null?a.version:input.version,code=input.versionCode==null?a.versionCode:input.versionCode;
    if(version!=null&&(typeof version!=='string'||version.length>300)||code!=null&&(!Number.isSafeInteger(code)||code<0))throw fail('INVALID_DECISION','Paket sürümü geçersiz.');
    return {projectId:input.projectId,artifact:{sha256:hash,version:version==null?null:version,versionCode:code==null?null:code},kind:input.kind,text:text.trim()};
  }
  function receipt(data,payload){
    if(!data||data.ok!==true||data.durable!==true||data.requestId!==payload.requestId||!UUID.test(data.decisionId||'')||data.projectId!==payload.projectId||data.artifactSha256!==payload.artifact.sha256||data.kind!==payload.kind||!Number.isFinite(Date.parse(data.createdAt||'')))throw fail('INVALID_RECEIPT','Sunucunun kalıcı ürün değerlendirmesi makbuzu doğrulanamadı.');
    return Object.freeze({...data});
  }
  function create(options){
    if(!options||!options.host||typeof options.host.request!=='function'||typeof options.getAccountKey!=='function'||typeof options.getSnapshot!=='function')throw new TypeError('Owner-scoped host, identity and snapshot required');
    let owner=null,epoch=0,disposed=false;const ids=new Map(),calls=new Map();
    function sync(){const next=options.getAccountKey();if(next!==owner){owner=next;epoch++;ids.clear();calls.clear();}return owner;}
    function guard(key,generation){if(disposed||sync()!==key||epoch!==generation||!key)throw fail('AUTH_CHANGED','Sahip oturumu değişti.');}
    function checkSnapshot(key,p){const s=options.getSnapshot();if(!s||s.accountKey!==key||s.state==='demo'||s.state==='unauthenticated')throw fail('AUTH_CHANGED','Gerçek sahip oturumu gerekli.');const project=(s.projects||[]).find(x=>x.id===p.projectId),r=project&&project.release;if(!r||r.artifact?.sha256!==p.artifact.sha256)throw fail('ARTIFACT_CHANGED','Görünen paket değişti; kartı yenile.');if(p.artifact.version!=null&&p.artifact.version!==r.version||p.artifact.versionCode!=null&&p.artifact.versionCode!==r.versionCode)throw fail('ARTIFACT_CHANGED','Paket sürümü değişti.');p.artifact.version=r.version||null;p.artifact.versionCode=r.versionCode==null?null:r.versionCode;}
    async function record(input){
      const key=sync(),generation=epoch;if(!key||input?.accountKey!=null&&input.accountKey!==key)throw fail('AUTH_CHANGED','Sahip oturumu değişti.');const p=normalize(input);guard(key,generation);checkSnapshot(key,p);
      const identity=String(key).split(':')[0];if(!UUID.test(identity))throw fail('AUTH_CHANGED','Sahip kimliği geçersiz.');
      const fingerprint=canonical(p);let requestId=input?.requestId;if(requestId!=null&&!UUID.test(requestId))throw fail('INVALID_DECISION','İstek kimliği geçersiz.');
      if(!requestId){const match=[...ids].find(([,v])=>v===fingerprint);requestId=match?match[0]:(options.randomUUID||(()=>globalThis.crypto.randomUUID()))();}
      if(ids.has(requestId)&&ids.get(requestId)!==fingerprint)throw fail('PAYLOAD_MISMATCH','Aynı istek kimliği farklı karara ait.');
      // Retain a bounded retry ledger; callers may also provide their stable UUID.
      if(ids.size>=200&&!ids.has(requestId))throw fail('DECISION_LIMIT','Bu oturumun değerlendirme sınırına ulaşıldı; ekranı yeniden aç.');ids.set(requestId,fingerprint);
      if(calls.has(requestId))return calls.get(requestId);
      const payload={...p,requestId,expectedUserId:identity};const task=(async()=>{guard(key,generation);const reply=await options.host.request('recordArtifactDecision',payload);guard(key,generation);checkSnapshot(key,p);if(reply?.error)throw reply.error;return receipt(reply?.data||reply,payload);})();
      calls.set(requestId,task);try{return await task;}finally{if(calls.get(requestId)===task)calls.delete(requestId);}
    }
    return Object.freeze({record,destroy(){disposed=true;epoch++;ids.clear();calls.clear();}});
  }
  function createHostPort(options){
    if(!options||!options.client||typeof options.getContext!=='function')throw new TypeError('Private Supabase client and context required');
    const client=options.client;let identity=null,epoch=0;
    function context(){const c=options.getContext()||{},next=c.authenticated&&c.isOwner&&!c.demo&&UUID.test(c.userId||'')?c.userId:null;if(next!==identity){identity=next;epoch++;}return next;}
    async function guard(expected,generation){if(context()!==expected||epoch!==generation)throw fail('AUTH_CHANGED','Sahip oturumu değişti.');const answer=await client.auth.getSession();if(answer.error||answer.data?.session?.user?.id!==expected||context()!==expected||epoch!==generation)throw fail('AUTH_CHANGED','Sahip oturumu değişti.');}
    async function request(operation,input){
      if(operation!=='recordArtifactDecision')throw fail('UNAVAILABLE','Bu işlem izinli değil.');const expected=context(),generation=epoch;if(!expected||input?.expectedUserId!==expected||!UUID.test(input.requestId||''))throw fail('AUTH_CHANGED','Sahip oturumu değişti.');const p=normalize(input),payload={...p,requestId:input.requestId};await guard(expected,generation);
      const response=await client.rpc('studio_v26_record_artifact_decision',{expected_owner:expected,request_id:input.requestId,project_id:p.projectId,artifact_sha256:p.artifact.sha256,artifact_version:p.artifact.version,artifact_version_code:p.artifact.versionCode,decision_kind:p.kind,decision_text:p.text});
      await guard(expected,generation);if(response.error)throw response.error;return receipt(Array.isArray(response.data)?response.data[0]:response.data,payload);
    }
    return Object.freeze({request});
  }
  return Object.freeze({create,createHostPort,normalize});
});
