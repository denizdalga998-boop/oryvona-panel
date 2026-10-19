/* Private authenticated transport. v24 uses an exclusive commands lane; never legacy dispatch. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OryvonaStudioHostPort = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const BUCKET = 'studio-v23-evidence', LANE = 'DJ-KABIN:v24-ingress';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const PROJECTS = ['koza','charm-drop','forge-run','aeryo','tupsper','oryvona-panel'];
  const COLUMNS = 'id,text,status,created_by,created_at,started_at,finished_at,runner,result';
  function failure(code, message) { return Object.assign(new Error(message), { code }); }
  async function digest(bytes) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join(''); }
  async function sha256(blob) { return digest(await blob.arrayBuffer()); }
  function canonical(value) { return Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(k => JSON.stringify(k)+':'+canonical(value[k])).join(',') + '}' : JSON.stringify(value); }
  function rowToIntent(row) {
    const r = row.result || {}, receipt = r.receipt || null;
    return { request_id: row.id, requested_project: r.target_game, text: row.text, attachments: r.attachments || [],
      status: row.status === 'cancelled' ? 'cancelled' : row.status === 'failed' ? 'failed' : row.status === 'done' ? 'completed' : row.status === 'running' ? 'running' : receipt ? 'claimed' : 'recorded',
      cancel_requested: row.status === 'cancelled', worker_id: receipt?.workerId || null, receipt, note_tr: String(r.note_tr || '').slice(0, 600),
      ...(r.execution && r.execution.projectId ? { workspace_label: 'izole çalışma klasörü' } : {}),
      created_at: row.created_at,
      finished_at: row.finished_at || null,
      stage: typeof r.execution?.stage === 'string' ? r.execution.stage : null,
      steps: Array.isArray(r.execution?.stages) ? r.execution.stages.slice(0,6).map(s=>({id:String(s.id||'').slice(0,40),title:String(s.title_tr||'').slice(0,100),status:String(s.status||'').slice(0,40),detail:String(s.detail_tr||'').slice(0,300)})) : [],
      updated_at: r.execution?.updatedAt || row.finished_at || r.received_at || row.started_at || row.created_at };
  }
  const PROVIDER_SUFFIX = { auth_required: ' · Claude girişi bekleniyor', quota_wait: ' · Claude kotası bekleniyor', missing: ' · Claude aracı bulunamadı', auth_method_rejected: ' · Claude giriş türü reddedildi', cli_incompatible: ' · Claude aracı uyumsuz' };
  function providerSuffix(state) { return Object.prototype.hasOwnProperty.call(PROVIDER_SUFFIX, state) ? PROVIDER_SUFFIX[state] : ' · AI işçisi hazır değil'; }
  function create(options) {
    const client = options.client, getContext = options.getContext;
    if (!client || typeof getContext !== 'function') throw new TypeError('Private Supabase client and getContext required');
    async function guard(payload) {
      const context = getContext();
      if (!context.authenticated || !context.isOwner || context.demo || !UUID.test(context.userId || '') || context.userId !== payload.expectedUserId) throw failure('AUTH_CHANGED', 'Sahip oturumu değişti.');
      const { data, error } = await client.auth.getSession(); if (error) throw error;
      const after = getContext();
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
      if (operation === 'getConnection') {
        const [probe, status] = await Promise.all([
          client.from('commands').select('id').eq('project_id','koza').limit(1),
          client.from('store_status').select('value').eq('key','studio_v24_worker').maybeSingle()
        ]);
        if (probe.error) throw probe.error; if (status.error) throw status.error;
        const worker = status.data?.value, age = Date.now() - Date.parse(worker?.lastSeen || '');
        const alive = worker?.host === 'DJ-KABIN' && worker?.adapter === 'commands-isolated-v24' && worker?.ingressReady === true && worker?.extraModelSpendAllowed === 0 && !worker?.stopped && Number.isFinite(age) && age >= -5000 && age < 20000;
        const provider = worker && worker.provider && typeof worker.provider === 'object' && !Array.isArray(worker.provider) ? worker.provider : null, providerState = provider && typeof provider.state === 'string' ? provider.state : null;
        const suffix = alive && provider && providerState !== 'ready' ? providerSuffix(providerState) : '';
        return { status: alive ? 'connected' : 'waiting', label: (alive ? 'DJ-KABIN · Canlı Bağlı' : 'Güvenli kuyruk bağlı · DJ-KABIN sinyali bekleniyor') + suffix, submitAvailable: true, workerOnline: alive, attachmentsAvailable: worker?.evidenceBucketReady === true, providerState, executionEnabled: worker?.executionEnabled === true, lastSeen: worker?.lastSeen || null };
      }
      if (operation === 'submitIntent') {
        if (!UUID.test(payload.requestId || '') || !PROJECTS.includes(payload.requestedProject) || typeof payload.text !== 'string' || !payload.text.trim() || payload.text.length > 12000 || !Array.isArray(payload.attachments || []) || (payload.attachments || []).length > 3) throw failure('PAYLOAD_MISMATCH','İstek kapsamı geçersiz.');
        const attachments = payload.attachments || [];
        const hash = await digest(new TextEncoder().encode(canonical({ text: payload.text, requested_project: payload.requestedProject, attachments })));
        await guard(payload);
        const row = await insert({ id: payload.requestId, project_id: 'koza', action: 'gemini_review', text: payload.text, status: 'queued', created_by: context.email, runner: LANE,
          result: { operation: 'studio_v24_intent', transport: 'commands-isolated-v24', owner_id: context.userId, client_request_id: payload.requestId, target_game: payload.requestedProject, attachments, payload_hash: hash } }, context);
        await guard(payload); return { data: rowToIntent(row), error: null };
      }
      if (operation === 'listIntents') {
        const result = await client.from('commands').select(COLUMNS).eq('project_id','koza').eq('created_by', context.email).eq('result->>owner_id', context.userId).eq('result->>operation','studio_v24_intent').order('created_at',{ascending:false}).limit(Math.min(50,Math.max(1,payload.limit || 50)));
        return { data: result.data?.map(rowToIntent) || [], error: result.error };
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
        // ARGON canlı beyin: one conversational turn for the model on DJ-KABIN. Read-only for the phone: tool calls come back as
        // proposals; a dispatch still becomes a real intent only through submitIntent after the owner's explicit Evet.
        if (!UUID.test(payload.requestId || '') || typeof payload.text !== 'string' || !payload.text.trim() || payload.text.length > 2000) throw failure('PAYLOAD_MISMATCH', 'Mesaj 1–2000 karakter olmalı.');
        const history = (Array.isArray(payload.history) ? payload.history : []).slice(-12).filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string').map(m => ({ role: m.role, text: m.text.slice(0, 1200) }));
        const mode = ['low', 'medium', 'high'].includes(payload.mode) ? payload.mode : 'medium';
        const hash = await digest(new TextEncoder().encode(canonical({ text: payload.text, operation: 'argon_chat', mode })));
        await guard(payload);
        const row = await insert({ id: payload.requestId, project_id: 'koza', action: 'gemini_review', text: payload.text, status: 'queued', created_by: context.email, runner: LANE,
          result: { operation: 'argon_chat', transport: 'commands-isolated-v24', owner_id: context.userId, client_request_id: payload.requestId, payload_hash: hash, mode, history } }, context);
        await guard(payload); return { data: { requestId: row.id, status: row.status }, error: null };
      }
      if (operation === 'getBrainAnswer') {
        if (!UUID.test(payload.requestId || '')) throw failure('PAYLOAD_MISMATCH', 'Mesaj kimliği geçersiz.');
        const row = await find(payload.requestId, context);
        if (!row || row.result?.operation !== 'argon_chat') return { data: { status: 'missing' }, error: null };
        const r = row.result || {};
        return { data: { status: row.status, answer_tr: String(r.answer_tr || '').slice(0, 2400), actions: Array.isArray(r.actions) ? r.actions.slice(0, 4) : [], model: typeof r.model === 'string' ? r.model : null, receipt: r.receipt && typeof r.receipt.status === 'string' ? { status: r.receipt.status } : null }, error: null };
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
      throw failure('UNAVAILABLE','Bu işlem izinli değil.');
    }
    return Object.freeze({ context:getContext,request });
  }
  return Object.freeze({create,rowToIntent,LANE});
});
