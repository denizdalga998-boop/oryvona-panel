/* v26 read-only studio scope. Inject private SDK getters inside the original app closure. */
(function(root,factory){'use strict';if(typeof module==='object'&&module.exports)module.exports=factory();else root.OryvonaStudioFacadeV26=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const IDS=Object.freeze(['koza','charm-drop','forge-run','aeryo','tupsper','oryvona-panel']);
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const txt=(v,n=1200)=>typeof v==='string'?v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').slice(0,n):'';
  const obj=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
  const iso=v=>{const n=typeof v==='number'?v:Date.parse(v);return Number.isFinite(n)&&n>=0?new Date(n).toISOString():null;};
  function freeze(x){if(x&&typeof x==='object'&&!Object.isFrozen(x)){Object.freeze(x);Object.values(x).forEach(freeze);}return x;}
  function dayFrom(now){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now)),v=t=>p.find(x=>x.type===t).value;return new Date(`${v('year')}-${v('month')}-${v('day')}T00:00:00+03:00`).toISOString();}
  function statusRow(row){const s=obj(row.data),h=obj(s.handoff),lease=obj(h.lease);return {project_id:row.project_id,updated_at:iso(row.updated_at),data:{updatedAt:iso(s.updatedAt||s.updated_at||row.updated_at),phaseTr:txt(s.phaseTr||s.phase,300),summaryTr:txt(s.summaryTr||s.summary,1800),taskTitleTr:txt(s.taskTitleTr||s.taskTitle,500),taskTextTr:txt(s.taskTextTr||s.taskText,1600),handoff:{status:txt(h.status,120),task_id:txt(h.task_id,160),lease:{actor:txt(lease.actor,100),claimed_at:iso(lease.claimed_at)}}}};}
  function eventRow(r){return {id:txt(r.id,160),project_id:r.project_id,at:iso(r.at),actor:txt(r.actor,100),kind:txt(r.kind,100),title_tr:txt(r.title_tr,300),text_tr:txt(r.text_tr||r.text,1200),task_id:txt(r.task,160),run_id:txt(r.run_id,160)};}
  function runRow(r){const d=obj(r.data),s=obj(d.suites),suites={};for(const [id,value]of Object.entries(s).slice(0,12))suites[txt(id,60)]={status:txt(obj(value).status,100)};const c=obj(d.code);return {project_id:r.project_id,run_id:txt(r.run_id,160),started_at:iso(r.started_at),data:{finished_at:iso(d.finished_at||d.finishedAt||d.completed_at),started_at:iso(r.started_at||d.startedAt),source_commit:txt(d.source_commit||d.head_sha,80),suites,code:{status:txt(c.status,100),passed:Number.isFinite(c.passed)?c.passed:null,total:Number.isFinite(c.total)?c.total:null},code_passed:Number.isFinite(d.code_passed)?d.code_passed:null,code_total:Number.isFinite(d.code_total)?d.code_total:null}};}
  function releaseRow(r){return {id:txt(r.id,160),project_id:r.project_id,name:txt(r.name,160),package_id:txt(r.package_id,160),platform:txt(r.platform,80),stage:txt(r.stage,80),store_url:txt(r.store_url,1000),updated_at:iso(r.updated_at)};}
  function create(options){
    if(!options||typeof options.getClient!=='function'||typeof options.getContext!=='function')throw new TypeError('Private client and owner context getters required');
    const clock=options.clock||Date.now,doc=options.document||(typeof document!=='undefined'?document:null),listeners=new Set();
    let owner=null,epoch=0,revision=0,disposed=false,inflight=null,controller=null,authInvalidated=false;
    function empty(){return {state:'unauthenticated',loadedAt:null,coverage:Object.fromEntries(['statuses','events','runs','releases'].map(k=>[k,{state:'unknown',from:null,to:null,truncated:false}])),statuses:[],events:[],runs:[],releases:[]};}
    let state=empty();
    function identity(){const c=obj(options.getContext());return c.authenticated&&c.isOwner&&!c.demo&&UUID.test(c.userId||'')?c.userId:null;}
    function sync(){const next=identity();if(next!==owner){owner=next;epoch++;revision++;if(controller)controller.abort();controller=null;inflight=null;authInvalidated=false;state=empty();if(owner)state.state='loading';}return owner;}
    function scopedKey(scopeKey){if(!owner)return null;if(scopeKey==null)return owner+':studio-'+epoch;return typeof scopeKey==='string'&&scopeKey.startsWith(owner+':')&&scopeKey.length<=200?scopeKey:null;}
    function getSnapshot(scopeKey){sync();const key=authInvalidated?null:scopedKey(scopeKey),c=obj(options.getContext());const valid=!!key;return freeze({accountKey:key,revision,state:valid?state.state:c.demo?'demo':'unauthenticated',loadedAt:valid?state.loadedAt:null,coverage:valid?structuredClone(state.coverage):empty().coverage,projects:(options.getProjects?options.getProjects():[]).filter(p=>IDS.includes(p.id)).slice(0,6).map(p=>({id:p.id,name:txt(p.name,160),code:txt(p.code,40)})),statuses:valid?structuredClone(state.statuses):[],events:valid?structuredClone(state.events):[],runs:valid?structuredClone(state.runs):[],releases:valid?structuredClone(state.releases):[]});}
    function publish(){revision++;for(const fn of [...listeners])try{fn();}catch{}if(doc&&doc.dispatchEvent){const EventClass=doc.defaultView&&doc.defaultView.CustomEvent||globalThis.CustomEvent;if(typeof EventClass==='function')doc.dispatchEvent(new EventClass('oryvona:studio-data-change'));}}
    async function guard(id,gen,client){if(disposed||sync()!==id||epoch!==gen)throw Error('AUTH_CHANGED');const result=await client.auth.getSession();if(result.error||!result.data?.session||result.data.session.user?.id!==id||disposed||sync()!==id||epoch!==gen)throw Error('AUTH_CHANGED');}
    function attachAbort(query,signal){return signal&&typeof query.abortSignal==='function'?query.abortSignal(signal):query;}
    async function refresh(scopeKey){
      const id=sync();if(disposed||!id||!scopedKey(scopeKey)||doc&&doc.visibilityState==='hidden')return getSnapshot(scopeKey);
      if(inflight){await inflight;return getSnapshot(scopeKey);}
      const gen=epoch,client=options.getClient();if(!client)return getSnapshot(scopeKey);
      const now=clock(),from=dayFrom(now),to=new Date(now).toISOString();
      const abort=typeof AbortController==='function'?new AbortController():null;controller=abort;
      let timeout;const timeoutPromise=new Promise((_,reject)=>{timeout=setTimeout(()=>{abort?.abort();reject(Error('READ_TIMEOUT'));},12000);});
      const work=(async()=>{
        await Promise.race([guard(id,gen,client),timeoutPromise]);authInvalidated=false;if(!state.loadedAt){state={...state,state:'loading'};publish();}
        // Every list is explicitly scoped and bounded; none starts a worker or reads mail/private keys.
        const specs=[
          ['statuses',8,statusRow,()=>client.from('project_status').select('project_id,data,updated_at').in('project_id',IDS).limit(8)],
          ['events',200,eventRow,()=>client.from('events').select('id,project_id,at,actor,kind,title_tr,text_tr,task,run_id').in('project_id',IDS).gte('at',from).lte('at',to).order('at',{ascending:false}).limit(200)],
          // Include older starts: a run may have finished today after starting yesterday.
          // A full 120-row window is explicitly partial, never a complete day claim.
          ['runs',120,runRow,()=>client.from('runs').select('project_id,run_id,data,started_at').in('project_id',IDS).order('started_at',{ascending:false,nullsFirst:false}).limit(120)],
          ['releases',30,releaseRow,()=>client.from('store_games').select('id,project_id,name,package_id,platform,stage,store_url,updated_at').in('project_id',IDS).order('updated_at',{ascending:false}).limit(30)]
        ];
        const replies=await Promise.race([Promise.allSettled(specs.map(async([,,,query])=>attachAbort(query(),abort?.signal))),timeoutPromise]);
        await Promise.race([guard(id,gen,client),timeoutPromise]);let anyError=false;const next={...state,coverage:{...state.coverage}};
        replies.forEach((reply,i)=>{const [name,limit,map]=specs[i],response=reply.status==='fulfilled'?reply.value:null;if(!response||response.error||!Array.isArray(response.data)){anyError=true;next.coverage[name]={...state.coverage[name],state:'error',error:'Veri kaynağı okunamadı; önceki kayıt korunuyor.'};return;}const rows=response.data.filter(r=>r&&IDS.includes(r.project_id));next[name]=rows.map(map);const truncated=response.data.length>=limit;next.coverage[name]={state:truncated?'partial':'complete',from,to,truncated};});
        next.state=anyError?'error':'ready';next.loadedAt=to;state=next;publish();
      })().catch(error=>{if(!disposed&&sync()===id&&epoch===gen){if(error.message==='AUTH_CHANGED'){authInvalidated=true;state=empty();}else state={...state,state:'error',coverage:Object.fromEntries(Object.entries(state.coverage).map(([k,v])=>[k,{...v,state:'error',error:'Stüdyo verisi alınamadı; önceki kayıt korunuyor.'}]))};publish();}}).finally(()=>{clearTimeout(timeout);if(controller===abort)controller=null;if(inflight===work)inflight=null;});
      inflight=work;await work;return getSnapshot(scopeKey);
    }
    return Object.freeze({getSnapshot,refresh,subscribe(fn){if(typeof fn!=='function')throw new TypeError('Listener required');listeners.add(fn);return()=>listeners.delete(fn);},contextChanged(){sync();publish();},destroy(){disposed=true;epoch++;controller?.abort();listeners.clear();state=empty();}});
  }
  return Object.freeze({create,dayFrom});
});
