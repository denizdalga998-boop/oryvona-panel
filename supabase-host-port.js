/* Private authenticated transport. v24 uses an exclusive commands lane; never legacy dispatch. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OryvonaStudioHostPort = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const BUCKET = 'studio-v23-evidence', CHAT_BUCKET = 'argon-chat-ekleri', LANE = 'DJ-KABIN:v24-ingress';
  const CHAT_MIMES = Object.freeze({
    'image/jpeg': { ext: 'jpg', maxBytes: 2097152 },
    'application/pdf': { ext: 'pdf', maxBytes: 8 * 1024 * 1024 },
    'text/plain': { ext: 'txt', maxBytes: 1024 * 1024 }
  });
  const MAX_CHAT_ATTACHMENTS = 4, MAX_CHAT_TOTAL_BYTES = 12 * 1024 * 1024;
  function sanitizeChatAttachmentName(raw, ext) {
    const clean = String(raw || '').replace(/[\\/\u0000-\u001f\u007f]/g, '_').trim().slice(0, 120);
    return clean || ('ek.' + (ext || 'txt'));
  }
  function normalizeChatAttachmentRef(a, userId) {
    if (!a || typeof a !== 'object' || Array.isArray(a)) throw failure('PAYLOAD_MISMATCH', 'Ek bilgisi geçersiz.');
    const spec = CHAT_MIMES[a.mime];
    if (!spec || a.bucket !== CHAT_BUCKET || !/^[a-f0-9]{64}$/.test(a.sha256 || '') || a.path !== userId + '/' + a.sha256 + '.' + spec.ext || !Number.isSafeInteger(a.size) || a.size < 1 || a.size > spec.maxBytes) {
      throw failure('PAYLOAD_MISMATCH', 'Ek kapsamı veya boyutu geçersiz.');
    }
    const name = sanitizeChatAttachmentName(a.name, spec.ext);
    return { bucket: CHAT_BUCKET, path: a.path, sha256: a.sha256, mime: a.mime, size: a.size, name };
  }
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const PROJECTS = ['koza','charm-drop','forge-run','aeryo','tupsper','oryvona-panel'];
  const COLUMNS = 'id,text,status,created_by,created_at,started_at,finished_at,runner,result';
  function failure(code, message) { return Object.assign(new Error(message), { code }); }
  async function digest(bytes) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join(''); }
  async function sha256(blob) { return digest(await blob.arrayBuffer()); }
  function canonical(value) { return Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(k => JSON.stringify(k)+':'+canonical(value[k])).join(',') + '}' : JSON.stringify(value); }
  function rowToIntent(row) {
    const r = row.result || {}, receipt = r.receipt || null, rs = receipt?.status || '';
    const mappedStatus = row.status === 'cancelled'
      ? 'cancelled'
      : (row.status === 'failed' || rs === 'FAILED')
      ? 'failed'
      : (rs === 'USER_TEST_READY' || r.execution?.status === 'waiting_review')
      ? 'waiting_review'
      : row.status === 'done'
      ? 'completed'
      : (row.status === 'running' || rs === 'STUDIO_FLOW_RUNNING')
      ? 'running'
      : rs === 'BLOCKED'
      ? 'blocked'
      : receipt
      ? 'claimed'
      : 'recorded';
    const actorId = (typeof r.execution?.actor === 'string' && r.execution.actor.trim()) ? r.execution.actor.trim().slice(0, 80) : ((typeof receipt?.actorId === 'string' && receipt.actorId.trim()) ? receipt.actorId.trim().slice(0, 80) : null);
    const actorLabel = /^codex/i.test(actorId || '') ? 'Codex' : /^gemini/i.test(actorId || '') ? 'Antigravity' : null;
    const isReview = r.execution?.operation === 'review' || receipt?.operation === 'review' || receipt?.mode === 'studio-review';
    const rawStages = Array.isArray(r.execution?.stages) ? r.execution.stages : [];
    const hasRevDev = isReview && rawStages.some(s => s && s.id === 'development');
    const filteredStages = hasRevDev ? rawStages.filter(s => !(s && s.id === 'review' && s.status === 'not_run')) : rawStages;
    return { request_id: row.id, requested_project: r.target_game, text: row.text, attachments: r.attachments || [],
      status: mappedStatus,
      cancel_requested: row.status === 'cancelled', worker_id: receipt?.workerId || null, ...(actorId ? { actor_id: actorId } : {}), receipt, note_tr: String(r.note_tr || '').slice(0, 600),
      ...(typeof r.execution?.summary_tr === 'string' && r.execution.summary_tr.trim() ? { summary_tr: r.execution.summary_tr.slice(0, 1500) } : {}),
      ...(r.execution && r.execution.projectId ? { workspace_label: 'izole çalışma klasörü' } : {}),
      studioFlow: r.studioFlow || r.execution?.studioFlow || r.receipt?.studioFlow || null,
      created_at: row.created_at,
      finished_at: row.finished_at || null,
      stage: typeof r.execution?.stage === 'string' ? r.execution.stage : (isReview && (r.execution || ['RUNNING', 'FINISHED'].includes(rs)) ? 'review' : null),
      steps: filteredStages.slice(0,6).map(s=>{const d=String(s.detail_tr||'').slice(0,300),id=String((hasRevDev&&s.id==='development'?'review':s.id)||'').slice(0,40);return {id,title:String(s.title_tr||'').slice(0,100),status:String(s.status||'').slice(0,40),detail:actorLabel?d.replace(/\bClaude\b/g,actorLabel):d};}),
      updated_at: r.execution?.updatedAt || row.finished_at || r.received_at || row.started_at || row.created_at };
  }
  // Chat history is read without `result` (each reply carries its ~1.3 MB voice recording there): only the fields shown are selected.
  const CHAT_HISTORY_COLUMNS = 'id,text,status,created_at,started_at,finished_at,answer_tr:result->>answer_tr,provider:result->>provider,model:result->>model,audio_status:result->>audio_status,actions:result->actions,worker_receipt:result->workerReceipt,dispatch_receipt:result->dispatchReceipt,attachments:result->attachments,context_attachments:result->context_attachments,transport:result->receipt->>transport,model_verified:result->receipt->>modelVerified';
  // v1.5: names of earlier files a follow-up answer used (the server keeps them briefly; never paths or contents).
  function contextAttachmentNames(value) { return Array.isArray(value) ? value.slice(0, MAX_CHAT_ATTACHMENTS).filter(n => typeof n === 'string' && n.trim()).map(n => sanitizeChatAttachmentName(n)) : []; }
  // v1.2: Charon arrives as MP3 from Google Cloud (about ten times smaller); the older WAV voice still plays.
  function playableAudio(a) { return !!a && (a.mimeType === 'audio/wav' || a.mimeType === 'audio/mpeg') && typeof a.data === 'string' && a.data.length > 0 && a.data.length <= 12 * 1024 * 1024; }
  function rowToChatTurn(row) {
    const slim = !row.result || typeof row.result !== 'object';
    const r = slim ? row : row.result, receipt = slim ? { transport: row.transport || null, modelVerified: row.model_verified === true || row.model_verified === 'true' } : (r.receipt || null);
    const workerReceipt = slim ? (row.worker_receipt || row.dispatch_receipt || null) : (r.workerReceipt || r.dispatchReceipt || null);
    const dispatchReceipt = slim ? (row.dispatch_receipt || row.worker_receipt || null) : (r.dispatchReceipt || r.workerReceipt || null);
    return {
      request_id: row.id,
      operation: 'argon_chat',
      text: String(row.text || '').slice(0, 2000),
      status: row.status,
      answer_tr: String(r.answer_tr || '').slice(0, 8000),
      provider: ['groq', 'openai', 'claude', 'gemini', 'google'].includes(r.provider) ? r.provider : null,
      model: typeof r.model === 'string' ? r.model.slice(0, 100) : null,
      transport: receipt?.transport || null,
      model_verified: receipt?.modelVerified === true,
      audio_status: typeof r.audio_status === 'string' ? r.audio_status.slice(0, 80) : null,
      actions: Array.isArray(r.actions) ? r.actions.slice(0, 4) : [],
      ...(workerReceipt && typeof workerReceipt === 'object' ? { workerReceipt } : {}),
      ...(dispatchReceipt && typeof dispatchReceipt === 'object' ? { dispatchReceipt } : {}),
      ...(Array.isArray(r.attachments) && r.attachments.length ? { attachments: r.attachments.slice(0, MAX_CHAT_ATTACHMENTS).filter(a => a && typeof a === 'object' && typeof a.name === 'string' && a.name.trim()).map(a => ({ name: sanitizeChatAttachmentName(a.name), mime: String(a.mime || '').slice(0, 80), size: Number(a.size) || 0 })) } : {}),
      ...(contextAttachmentNames(r.context_attachments).length ? { context_attachments: contextAttachmentNames(r.context_attachments) } : {}),
      created_at: row.created_at,
      finished_at: row.finished_at || row.started_at || row.created_at
    };
  }
  const PROVIDER_SUFFIX = { auth_required: ' · Claude girişi bekleniyor', quota_wait: ' · Claude kotası bekleniyor', missing: ' · Claude aracı bulunamadı', auth_method_rejected: ' · Claude giriş türü reddedildi', cli_incompatible: ' · Claude aracı uyumsuz' };
  function providerSuffix(state) { return Object.prototype.hasOwnProperty.call(PROVIDER_SUFFIX, state) ? PROVIDER_SUFFIX[state] : ' · AI işçisi hazır değil'; }
  function normalizeRoute(value) {
    if (value == null) return null;
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== 1 || value.provider !== 'claude' || value.environment !== 'local' || !['work','plan'].includes(value.executionMode) || !['low','medium','high'].includes(value.effort) || Object.keys(value).some(k => !['schemaVersion','provider','environment','executionMode','effort'].includes(k))) throw failure('UNSUPPORTED_EXECUTION_ROUTE', 'Yürütme yolu doğrulanmadı. Bulut ve OpenAI işçisi bağlı değil; başka işçiye çevrilmedi.');
    return {schemaVersion:1,provider:value.provider,environment:value.environment,executionMode:value.executionMode,effort:value.effort};
  }
  function normalizeStudioFlow(value) {
    if(value==null)return null;
    if(!value||typeof value!=='object'||Array.isArray(value)||value.schemaVersion!==1||!UUID.test(value.sourceRequestId||'')||Object.keys(value).length!==2)throw failure('STUDIO_FLOW_META_INVALID','Görev kaynağı doğrulanamadı.');
    return {schemaVersion:1,sourceRequestId:value.sourceRequestId};
  }
  function create(options) {
    const client = options.client, getContext = options.getContext;
    if (!client || typeof getContext !== 'function') throw new TypeError('Private Supabase client and getContext required');
    async function guard(payload) {
      if (payload?.signal?.aborted) throw failure('CANCELLED', 'İstek iptal edildi.');
      const context = getContext();
      if (!context.authenticated || !context.isOwner || context.demo || !UUID.test(context.userId || '') || context.userId !== payload.expectedUserId) throw failure('AUTH_CHANGED', 'Sahip oturumu değişti.');
      const { data, error } = await client.auth.getSession(); if (error) throw error;
      const after = getContext();
      if (payload?.signal?.aborted) throw failure('CANCELLED', 'İstek iptal edildi.');
      if (!data.session || data.session.user.id !== payload.expectedUserId || !after.authenticated || !after.isOwner || after.demo || after.userId !== payload.expectedUserId || !data.session.user.email) throw failure('AUTH_CHANGED', 'Oturum yeniden doğrulanmalı.');
      return { ...after, email: data.session.user.email.toLowerCase() };
    }
    async function find(id, context) {
      const result = await client.from('commands').select(COLUMNS).eq('id', id).eq('created_by', context.email).eq('result->>owner_id', context.userId).maybeSingle();
      if (result.error) throw result.error; return result.data;
    }
    async function insert(row, context) {
      const answer = await client.from('commands').insert(row).select(COLUMNS).single();
      if (!answer.error) return answer.data;
      if (answer.error.code !== '23505') throw answer.error;
      const existing = await find(row.id, context);
      if (!existing || existing.text !== row.text || existing.result?.payload_hash !== row.result.payload_hash || existing.result?.operation !== row.result.operation) throw failure('PAYLOAD_MISMATCH', 'Aynı istek kimliği farklı bir kayda ait; üzerine yazılmadı.');
      return existing;
    }
    async function request(operation, payload) {
      const context = await guard(payload);
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
      async function poll(getAnswer, timeoutMs = 95000, complete = answer => answer && ['done','failed','cancelled'].includes(answer.status)) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
          if (payload.signal?.aborted) throw failure('CANCELLED', 'İstek iptal edildi.');
          await guard(payload);
          const answer = await getAnswer();
          await guard(payload);
          if (complete(answer)) return answer;
          await wait(400);
        }
        throw failure('PENDING', 'Google yanıtı bekleniyor; aynı istek kimliği korunuyor.');
      }
      if (operation === 'geminiChat') {
        const clock=()=>performance.now(),began=clock(),submitted=await request('askBrain',payload),enqueueMs=Math.round(clock()-began);
        const expectedHash=submitted.data?.payloadHash;let textDelivered=false,claimObservedMs=null;
        const answer=await poll(async()=>{
          const value=(await request('getBrainAnswer',payload)).data;
          if(claimObservedMs===null&&value.status==='running')claimObservedMs=Math.round(clock()-began);
          if(expectedHash&&value.payloadHash!==expectedHash)throw failure('PAYLOAD_MISMATCH','Yanıt aynı mesajın doğrulanmış kapsamına ait değil.');
          if(!textDelivered&&value.status==='running'&&value.audio_status==='audio_preparing'&&((value.provider==='groq'&&value.transport==='groq-api')||(value.provider==='google'&&value.transport==='google-ai-studio-api'))&&value.model_verified===true){
            textDelivered=true;try{payload.onTextReady?.({...value,requestId:payload.requestId,prepared:true});}catch{}
          }
          return value;
        },180000);
        answer.timings={...answer.timings,client_enqueue_ms:enqueueMs,client_claim_observed_ms:claimObservedMs,client_wait_ms:Math.round(clock()-began)};
        const verifiedModel = ((answer.provider === 'groq' && answer.transport === 'groq-api') || (answer.provider === 'google' && answer.transport === 'google-ai-studio-api')) && answer.model_verified === true;
        // v2.8: planlama halkası cevabı DJ-KABIN'in plan kaydından kurulur; model çağrılmaz ve öyle etiketlenir.
        const serverRing = answer.provider === 'groq' && answer.transport === 'groq-api' && answer.generation_mode === 'planning-ring' && answer.model_verified !== true && answer.receipt?.modelCall === false;
        const ok = answer.status === 'done' && (verifiedModel || serverRing);
        return { ...answer, ok, requestId: payload.requestId, terminal: answer.status !== 'done', status: answer.receipt?.status || answer.status };
      }
      if (operation === 'geminiTts' || operation === 'geminiLiveToken') {
        if (!UUID.test(payload.requestId || '') || !['Puck','Charon','Fenrir'].includes(payload.voice || 'Puck')) throw failure('PAYLOAD_MISMATCH', 'Google ses isteği geçersiz.');
        const service = operation === 'geminiTts' ? 'tts' : 'live_token';
        if (service === 'tts' && (typeof payload.text !== 'string' || !payload.text.trim() || payload.text.length > 2400)) throw failure('PAYLOAD_MISMATCH', 'Ses metni 1–2400 karakter olmalı.');
        const text = service === 'tts' ? payload.text : 'Argon canlı ses oturumu';
        const servicePayload = { ...(service === 'tts' ? {text:payload.text} : {}), voice:payload.voice || 'Puck' };
        const hash = await digest(new TextEncoder().encode(canonical({text,operation:'studio_gemini_service',service,payload:servicePayload})));
        await guard(payload);
        await insert({id:payload.requestId,project_id:'koza',action:'gemini_review',text,status:'queued',created_by:context.email,runner:LANE,
          result:{operation:'studio_gemini_service',transport:'commands-isolated-v24',owner_id:context.userId,client_request_id:payload.requestId,service,servicePayload,payload_hash:hash}},context);
        // A live session is useless after a long wait: DJ-KABIN must hand over the short-lived key quickly or the phone says why.
        let row;
        try { row = await poll(() => find(payload.requestId, context), service === 'live_token' ? 20000 : 95000); }
        catch (error) { if (error?.code === 'PENDING') throw failure('DJ_KABIN_NO_ANSWER', service === 'live_token' ? 'DJ-KABIN canlı ses anahtarını 20 sn içinde vermedi; bilgisayar kapalı, uykuda ya da Argon servisi durmuş olabilir.' : 'DJ-KABIN ses isteğini zamanında yanıtlamadı.'); throw error; }
        await guard(payload);
        if (row.result?.operation !== 'studio_gemini_service' || row.result?.service !== service || row.result?.payload_hash !== hash) throw failure('PAYLOAD_MISMATCH', 'Google yanıt kapsamı değişti.');
        const answer = row.result?.serviceResult;
        // The server's own outcome (service_busy, quota_exhausted, api_access_denied, model_unavailable, a rejected request note...) is kept.
        const detail = String(row.result?.note_tr || '').slice(0, 200);
        if (row.status !== 'done') return {ok:false,status:row.status === 'cancelled'?'cancelled':String(answer?.status || 'service_failed').slice(0, 60),detail};
        return answer && typeof answer === 'object' ? answer : {ok:false,status:'service_unavailable',detail};
      }
      if (operation === 'createWorkerTask') {
        if (!UUID.test(payload.requestId || '') || !UUID.test(payload.sourceRequestId || '') || typeof payload.sourceText !== 'string' || payload.sourceText.length > 2000 || payload.instruction !== payload.sourceText || !PROJECTS.includes(payload.project)) throw failure('PAYLOAD_MISMATCH', 'Özgün sesli görev doğrulanamadı.');
        // The authenticated owner's exact transcript is the command; model-written instructions never replace it.
        const source = payload.sourceText.normalize('NFKC').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
        const aliases = {koza:/\bkoza\b/,'charm-drop':/\b(?:charm[ -]?drop|chandrop)\b/,'forge-run':/\bforge[ -]?run\b/,aeryo:/\baeryo\b/,tupsper:/\b(?:tupsper|tuckspire)\b/,'oryvona-panel':/\b(?:oryvona[ -]?panel|panel\w*|(?:jarvis|argon)\s+(?:sistem\w*|panel\w*|uygulama\w*)|uygulama\w*)\b/};
        const named = PROJECTS.filter(id=>aliases[id].test(source));
        if (named.length !== 1 || named[0] !== payload.project || /\b(?:nasil|neden|desem|desek|diyelim|varsayalim|farz|ornek)\b/.test(source) || /\b(?:yapma|duzeltme|baslatma|gonderme|calistirma|istemiyorum|sadece sohbet|ornek|varsayalim|yayinla|publish|production|deploy|sil|delete|format|wipe)\b/.test(source)
          || !/\b(?:duzelt\w*|gelistir\w*|ekle\w*|uygula\w*|guncelle\w*|onar\w*|hazirla\w*|olustur\w*|degistir\w*|test et|incele\w*|denetle\w*|calismiyor|bozuk|tasiyor|kesiliyor|donuyor|cokuyor|hata var|bitir\w*|tamamla\w*|ilerlet\w*|surdur\w*|hallet\w*|halled\w*|devam e\w*|sonraki (?:asama|adim)\w*|gerekiyorsa yap\w*)\b/.test(source)) throw failure('EXPLICIT_OWNER_TASK_REQUIRED', 'Sohbet işçiye gönderilmedi; açık görev ve tek proje gerekiyor.');
        const sessionRow = await find(payload.sourceRequestId,context);
        await guard(payload);
        const live = sessionRow?.result;
        const expiresAt=Date.parse(live?.serviceResult?.expiresAt || '');
        if (sessionRow?.status !== 'done' || live?.operation !== 'studio_gemini_service' || live?.service !== 'live_token' || live?.serviceResult?.ok !== true || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw failure('LIVE_SESSION_REQUIRED', 'Geçerli sahip ses oturumu doğrulanamadı.');
        const expectedHash = await digest(new TextEncoder().encode(canonical({text:payload.sourceText,requested_project:payload.project,attachments:[]})));
        await request('submitIntent',{expectedUserId:payload.expectedUserId,signal:payload.signal,requestId:payload.requestId,requestedProject:payload.project,text:payload.sourceText,attachments:[]});
        const row = await poll(() => find(payload.requestId,context),12000, row => !!row && (['done','failed','cancelled'].includes(row.status) || (row.runner === 'DJ-KABIN:v24-queued' && (typeof row.result?.receipt?.flowId === 'string' || (['studio-review','studio-workers'].includes(row.result?.receipt?.mode) && (typeof row.result?.receipt?.jobId === 'string' || Array.isArray(row.result?.receipt?.jobIds)))))));
        const receipt = row.result?.receipt;
        const r = row.result;
        const reviewJobId = receipt?.jobId || (Array.isArray(receipt?.jobIds) && receipt.jobIds.length === 1 ? receipt.jobIds[0] : null);
        const flowVerified = UUID.test(receipt?.flowId || '') && ['STUDIO_FLOW_QUEUED','STUDIO_FLOW_WAITING','STUDIO_FLOW_RUNNING','USER_TEST_READY'].includes(receipt?.status);
        const reviewVerified = receipt?.mode === 'studio-review' && UUID.test(reviewJobId || '') && ['DURABLY_QUEUED','WAITING','RUNNING','FINISHED'].includes(receipt?.status);
        // v2.8: bağımsız işçi kaydı (planlama incelemesi, onaylanan planın geliştirmesi) kalıcı kuyruk kanıtıdır; akış kimliği istek kimliğidir.
        const workersVerified = receipt?.mode === 'studio-workers' && UUID.test(reviewJobId || '') && ['DURABLY_QUEUED','WAITING','RUNNING','FINISHED'].includes(receipt?.status);
        const durable = !['failed','cancelled'].includes(row.status) && row.runner === 'DJ-KABIN:v24-queued' && r?.operation === 'studio_v24_intent' && r?.owner_id === context.userId && r?.client_request_id === payload.requestId && r?.target_game === payload.project && r?.payload_hash === expectedHash && (flowVerified || reviewVerified || workersVerified);
        return {accepted:durable,status:durable?'durably_queued':'not_queued',requestId:row.id,flowId:durable&&flowVerified?receipt.flowId:durable&&workersVerified?row.id:null,...(durable&&reviewVerified?{mode:'studio-review',jobId:reviewJobId}:durable&&workersVerified?{mode:'studio-workers',jobId:reviewJobId}:{})};
      }
      if (operation === 'getConnection') {
        const [probe, status] = await Promise.all([
          client.from('commands').select('id').eq('project_id','koza').limit(1),
          client.from('store_status').select('value').eq('key','studio_v24_worker').maybeSingle()
        ]);
        if (probe.error) throw Object.assign(new Error(probe.error.message),probe.error,{status:probe.status}); if (status.error) throw Object.assign(new Error(status.error.message),status.error,{status:status.status});
        const worker = status.data?.value, age = Date.now() - Date.parse(worker?.lastSeen || '');
        const alive = worker?.host === 'DJ-KABIN' && worker?.adapter === 'commands-isolated-v24' && worker?.ingressReady === true && worker?.extraModelSpendAllowed === 0 && !worker?.stopped && Number.isFinite(age) && age >= -5000 && age < 20000;
        const provider = worker && worker.provider && typeof worker.provider === 'object' && !Array.isArray(worker.provider) ? worker.provider : null, providerState = provider && typeof provider.state === 'string' ? provider.state : null;
        const suffix = alive && provider && providerState !== 'ready' ? providerSuffix(providerState) : '';
        return { status: alive ? 'connected' : 'waiting', label: (alive ? 'DJ-KABIN · Canlı Bağlı' : 'Güvenli kuyruk bağlı · DJ-KABIN sinyali bekleniyor') + suffix, submitAvailable: true, workerOnline: alive, attachmentsAvailable: worker?.evidenceBucketReady === true, providerState, executionEnabled: worker?.executionEnabled === true, studioMode: alive && worker?.studioMode === true, studioFlow: alive && worker?.studioMode === true ? worker.studioFlow || null : null, nativeChat: alive && worker?.studioMode === true ? worker.nativeChat || null : null, lastSeen: worker?.lastSeen || null };
      }
      if (operation === 'submitIntent') {
        if (!UUID.test(payload.requestId || '') || !PROJECTS.includes(payload.requestedProject) || typeof payload.text !== 'string' || !payload.text.trim() || payload.text.length > 12000 || !Array.isArray(payload.attachments || []) || (payload.attachments || []).length > 3) throw failure('PAYLOAD_MISMATCH','İstek kapsamı geçersiz.');
        const attachments = payload.attachments || [], route = normalizeRoute(payload.route), studioFlow=normalizeStudioFlow(payload.studioFlow);
        const hash = await digest(new TextEncoder().encode(canonical({ text: payload.text, requested_project: payload.requestedProject, attachments, ...(route ? {route} : {}), ...(studioFlow ? {studioFlow} : {}) })));
        await guard(payload);
        const row = await insert({ id: payload.requestId, project_id: 'koza', action: 'gemini_review', text: payload.text, status: 'queued', created_by: context.email, runner: LANE,
          result: { operation: 'studio_v24_intent', transport: 'commands-isolated-v24', owner_id: context.userId, client_request_id: payload.requestId, target_game: payload.requestedProject, attachments, ...(route ? {route} : {}), ...(studioFlow ? {studioFlow} : {}), payload_hash: hash } }, context);
        await guard(payload); return { data: rowToIntent(row), error: null };
      }
      if (operation === 'listIntents') {
        const result = await client.from('commands').select(COLUMNS).eq('project_id','koza').eq('created_by', context.email).eq('result->>owner_id', context.userId).eq('result->>operation','studio_v24_intent').order('created_at',{ascending:false}).limit(Math.min(50,Math.max(1,payload.limit || 50)));
        return { data: result.data?.map(rowToIntent) || [], error: result.error };
      }
      if (operation === 'listChatHistory') {
        const result = await client.from('commands').select(CHAT_HISTORY_COLUMNS).eq('project_id','koza').eq('created_by', context.email).eq('result->>owner_id', context.userId).eq('result->>operation','argon_chat').order('created_at',{ascending:false}).limit(Math.min(40,Math.max(1,payload.limit || 30)));
        return { data: (result.data || []).map(rowToChatTurn).reverse(), error: result.error };
      }
      if (operation === 'askArchive') {
        // ARGON KARA KUTU: a read-only history question. DJ-KABIN answers it from its local FTS5 archive; it never becomes a job.
        if (!UUID.test(payload.requestId || '') || typeof payload.text !== 'string' || !payload.text.trim() || payload.text.length > 500) throw failure('PAYLOAD_MISMATCH', 'Soru 1–500 karakter olmalı.');
        const hash = await digest(new TextEncoder().encode(canonical({ text: payload.text, operation: 'argon_archive_query' })));
        await guard(payload);
        const row = await insert({ id: payload.requestId, project_id: 'koza', action: 'gemini_review', text: payload.text, status: 'queued', created_by: context.email, runner: LANE,
          result: { operation: 'argon_archive_query', transport: 'commands-isolated-v24', owner_id: context.userId, client_request_id: payload.requestId, payload_hash: hash } }, context);
        await guard(payload); return { data: { requestId: row.id, status: row.status }, error: null };
      }
      if (operation === 'askBrain') {
        // Lightweight Google API conversation. Only a verified explicit source task may produce a durable worker receipt.
        if (!UUID.test(payload.requestId || '') || typeof payload.text !== 'string' || !payload.text.trim() || payload.text.length > 2000) throw failure('PAYLOAD_MISMATCH', 'Mesaj 1–2000 karakter olmalı.');
        const history = (Array.isArray(payload.history) ? payload.history : []).slice(-12).filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string').map(m => ({ role: m.role, text: m.text.slice(0, 1200) }));
        const mode = ['low', 'medium', 'high'].includes(payload.mode) ? payload.mode : 'medium';
        if (payload.attachments != null && (!Array.isArray(payload.attachments) || payload.attachments.length > MAX_CHAT_ATTACHMENTS)) {
          throw failure('PAYLOAD_MISMATCH', 'Bir mesaja en fazla 4 ek eklenebilir.');
        }
        if (Array.isArray(payload.attachments) && payload.attachments.length > 0) {
          const refs = payload.attachments.map(a => normalizeChatAttachmentRef(a, context.userId));
          const totalBytes = refs.reduce((sum, a) => sum + a.size, 0);
          if (totalBytes > MAX_CHAT_TOTAL_BYTES) throw failure('PAYLOAD_MISMATCH', 'Eklerin toplam boyutu en fazla 12 MB olabilir.');
          const audioOutput = typeof payload.audioOutput === 'boolean' ? payload.audioOutput : true;
          const hash = await digest(new TextEncoder().encode(canonical({
            text: payload.text,
            operation: 'argon_chat',
            mode,
            history,
            audioOutput,
            attachments: refs.map(a => ({ sha256: a.sha256, mime: a.mime, size: a.size, name: a.name }))
          })));
          await guard(payload);
          const row = await insert({
            id: payload.requestId,
            project_id: 'koza',
            action: 'gemini_review',
            text: payload.text,
            status: 'queued',
            created_by: context.email,
            runner: LANE,
            result: {
              operation: 'argon_chat',
              chat_schema_version: 4,
              audioOutput,
              attachments: refs,
              transport: 'commands-isolated-v24',
              owner_id: context.userId,
              client_request_id: payload.requestId,
              payload_hash: hash,
              mode,
              history
            }
          }, context);
          await guard(payload);
          return { data: { requestId: row.id, status: row.status, payloadHash: hash }, error: null };
        }
        const audio=typeof payload.audioOutput==='boolean'?{audioOutput:payload.audioOutput}:{};
        const hash = await digest(new TextEncoder().encode(canonical({ text: payload.text, operation: 'argon_chat', mode, history,...audio })));
        await guard(payload);
        const row = await insert({ id: payload.requestId, project_id: 'koza', action: 'gemini_review', text: payload.text, status: 'queued', created_by: context.email, runner: LANE,
          result: { operation: 'argon_chat', chat_schema_version: typeof payload.audioOutput==='boolean'?3:2,...audio, transport: 'commands-isolated-v24', owner_id: context.userId, client_request_id: payload.requestId, payload_hash: hash, mode, history } }, context);
        await guard(payload); return { data: { requestId: row.id, status: row.status, payloadHash:hash }, error: null };
      }
      if (operation === 'getBrainAnswer') {
        if (!UUID.test(payload.requestId || '')) throw failure('PAYLOAD_MISMATCH', 'Mesaj kimliği geçersiz.');
        const row = await find(payload.requestId, context);
        if (!row || row.result?.operation !== 'argon_chat') return { data: { status: 'missing' }, error: null };
        const r = row.result || {};
        return { data: { status: row.status, payloadHash:r.payload_hash, timings:r.timings||{}, answer_tr: String(r.answer_tr || '').slice(0, 8000), audio_b64:playableAudio(r.audio)?r.audio.data:null, audio:playableAudio(r.audio)?{mimeType:r.audio.mimeType,data:r.audio.data}:null, audio_status:typeof r.audio_status==='string'?r.audio_status.slice(0,80):null, project_catalog:Array.isArray(r.project_catalog)?r.project_catalog.slice(0,128).filter(p=>p&&/^[a-z][a-z0-9-]{0,63}$/.test(p.id)).map(p=>({id:p.id,name:String(p.name||p.id).slice(0,120)})):[], actions: Array.isArray(r.actions) ? r.actions.slice(0, 4) : [], workerReceipt:r.workerReceipt || r.dispatchReceipt || null, dispatchReceipt:r.dispatchReceipt || r.workerReceipt || null, model: typeof r.model === 'string' ? r.model : null, provider: ['groq','openai','claude','gemini','google'].includes(r.provider) ? r.provider : null, transport: r.receipt?.transport || null, model_verified: r.receipt?.modelVerified === true, generation_mode: r.receipt?.generationMode === 'planning-ring' ? 'planning-ring' : null, executionCapabilities: r.executionCapabilities && typeof r.executionCapabilities === 'object' ? {claudeLocalWorker:false,googleWorker:r.executionCapabilities.googleWorker === true,openaiWorker:r.executionCapabilities.openaiWorker === true} : null, receipt: r.receipt && typeof r.receipt.status === 'string' ? { status: r.receipt.status, ...(typeof r.receipt.modelCall === 'boolean' ? { modelCall: r.receipt.modelCall } : {}), ...(Number.isSafeInteger(r.receipt.httpStatus) ? { httpStatus: r.receipt.httpStatus } : {}) } : null, ...(contextAttachmentNames(r.context_attachments).length ? { context_attachments: contextAttachmentNames(r.context_attachments) } : {}) }, error: null };
      }
      if (operation === 'getArchiveAnswer') {
        if (!UUID.test(payload.requestId || '')) throw failure('PAYLOAD_MISMATCH', 'Soru kimliği geçersiz.');
        const row = await find(payload.requestId, context);
        if (!row || row.result?.operation !== 'argon_archive_query') return { data: { status: 'missing' }, error: null };
        const r = row.result || {};
        return { data: { status: row.status, answer_tr: String(r.answer_tr || '').slice(0, 1500), hits: Array.isArray(r.hits) ? r.hits.slice(0, 5).map(h => ({ at: String(h?.at || '').slice(0, 40), title: String(h?.title || '').slice(0, 160), snippet: String(h?.snippet || '').slice(0, 400) })) : [] }, error: null };
      }
      if (operation === 'cancelIntent') {
        if (!UUID.test(payload.requestId || '')) throw failure('PAYLOAD_MISMATCH','İptal kimliği geçersiz.');
        // A distinct deterministic tombstone also covers submit's lost-ACK / cancel-before-submit race.
        const hash = await digest(new TextEncoder().encode('cancel:'+context.userId+':'+payload.requestId));
        const id = hash.slice(0,8)+'-'+hash.slice(8,12)+'-4'+hash.slice(13,16)+'-8'+hash.slice(17,20)+'-'+hash.slice(20,32);
        await insert({ id, project_id:'koza', action:'gemini_review', text:'Tekil Jarvis isteğini iptal et', status:'queued', created_by:context.email, runner:LANE,
          result:{operation:'studio_v24_cancel',transport:'commands-isolated-v24',owner_id:context.userId,target_request_id:payload.requestId,payload_hash:hash} },context);
        const original = await find(payload.requestId,context);
        return { request_id:payload.requestId, requested_project:original?.result?.target_game || null, status:'recorded',cancel_requested:true };
      }
      if (operation === 'uploadEvidence') {
        if (!(payload.blob instanceof Blob) || payload.mime !== 'image/jpeg' || payload.blob.type !== 'image/jpeg' || payload.blob.size < 1 || payload.blob.size > 2097152 || !/^[a-f0-9]{64}$/.test(payload.sha256 || '') || payload.path !== context.userId + '/' + payload.sha256 + '.jpg') throw failure('PAYLOAD_MISMATCH', 'Görsel yükleme kapsamı geçersiz.');
        if (await sha256(payload.blob) !== payload.sha256) throw failure('PAYLOAD_MISMATCH', 'Görsel özeti uyuşmuyor.');
        await guard(payload);
        const { error } = await client.storage.from(BUCKET).upload(payload.path,payload.blob,{upsert:false,contentType:'image/jpeg',cacheControl:'3600'});
        if (error) {
          const status = Number(error.statusCode || error.status);
          if (status !== 409 && !/already exists|duplicate/i.test(error.message || '')) throw error;
          await guard(payload); const existing = await client.storage.from(BUCKET).download(payload.path);
          if (existing.error) throw existing.error;
          if (!existing.data || existing.data.size !== payload.blob.size || await sha256(existing.data) !== payload.sha256) throw failure('PAYLOAD_MISMATCH','Önceki görsel farklı; üzerine yazılmadı.');
        }
        await guard(payload); return { bucket:BUCKET,path:payload.path };
      }
      if (operation === 'uploadChatAttachment') {
        const spec = payload && CHAT_MIMES[payload.mime];
        if (!spec || !(payload.blob instanceof Blob) || (payload.blob.type && payload.blob.type !== payload.mime) || payload.blob.size < 1 || payload.blob.size > spec.maxBytes || (payload.size != null && payload.blob.size !== payload.size) || !/^[a-f0-9]{64}$/.test(payload.sha256 || '') || payload.path !== context.userId + '/' + payload.sha256 + '.' + spec.ext) {
          throw failure('PAYLOAD_MISMATCH', 'Sohbet eki yükleme kapsamı geçersiz.');
        }
        if (await sha256(payload.blob) !== payload.sha256) throw failure('PAYLOAD_MISMATCH', 'Sohbet eki özeti uyuşmuyor.');
        const cleanName = sanitizeChatAttachmentName(payload.name, spec.ext);
        await guard(payload);
        const { error } = await client.storage.from(CHAT_BUCKET).upload(payload.path, payload.blob, { upsert: false, contentType: payload.mime });
        if (error) {
          const status = Number(error.statusCode || error.status);
          if (status !== 409 && !/already exists|duplicate/i.test(error.message || '')) throw error;
          await guard(payload);
          const existing = await client.storage.from(CHAT_BUCKET).download(payload.path);
          if (existing.error) throw existing.error;
          if (!existing.data || existing.data.size !== payload.blob.size || await sha256(existing.data) !== payload.sha256) {
            throw failure('PAYLOAD_MISMATCH', 'Önceki ek içeriği farklı; üzerine yazılmadı.');
          }
        }
        await guard(payload);
        return { bucket: CHAT_BUCKET, path: payload.path, sha256: payload.sha256, mime: payload.mime, size: payload.blob.size, name: cleanName };
      }
      throw failure('UNAVAILABLE','Bu işlem izinli değil.');
    }
    return Object.freeze({ context:getContext,request });
  }
  return Object.freeze({create,rowToIntent,rowToChatTurn,LANE,CHAT_BUCKET});
});
