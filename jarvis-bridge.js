/* ORYVONA v24: owner-bound durable UI transport; isolated commands lane, no model SDK. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OryvonaJarvisBridge = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const PROJECTS = Object.freeze(['koza', 'charm-drop', 'forge-run', 'aeryo', 'tupsper', 'oryvona-panel']);
  const DB = 'oryvona-studio-v23-owner-outbox';
  const MAX_TEXT = 12000, MAX_ITEMS = 100, MAX_RAW = 5 * 1024 * 1024, MAX_IMAGE = 2 * 1024 * 1024;
  const MAX_TOTAL = 40 * 1024 * 1024, MAX_FILES = 3;
  const MAX_CHAT_FILES = 4, MAX_CHAT_TOTAL = 12 * 1024 * 1024, MAX_PDF = 8 * 1024 * 1024, MAX_TEXT_FILE = 1024 * 1024;
  const CHAT_BUCKET = 'argon-chat-ekleri';
  const TEXT_EXTENSIONS = Object.freeze(['txt','md','json','csv','log','xml','yaml','yml','js','mjs','cjs','ts','tsx','jsx','py','java','kt','cs','cpp','c','h','hpp','go','rs','rb','php','swift','sql','sh','ps1','bat','gd','lua','html','css','ini','toml']);
  const FILE_ACCEPT = ['application/pdf','.pdf',...TEXT_EXTENSIONS.map(ext => '.' + ext)].join(',');
  function sanitizeAttachmentName(raw, fallback) {
    const clean = String(raw || fallback || 'ek').replace(/[\\/\u0000-\u001f\u007f]/g, '_').trim().slice(0, 120);
    return clean || (fallback || 'ek');
  }
  function chatExt(mime) {
    return mime === 'image/jpeg' ? 'jpg' : mime === 'application/pdf' ? 'pdf' : mime === 'text/plain' ? 'txt' : null;
  }
  function chatMimeLimit(mime) {
    return mime === 'image/jpeg' ? MAX_IMAGE : mime === 'application/pdf' ? MAX_PDF : mime === 'text/plain' ? MAX_TEXT_FILE : 0;
  }
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const LOCAL_ACTIVE = new Set(['pending', 'retry', 'sending', 'cancel_pending']);
  const BACKOFF = [2000, 5000, 15000, 30000, 60000, 120000, 300000];
  function error(code, message) { const e = new Error(message); e.code = code; return e; }
  function owner(context) { return context && context.authenticated && context.isOwner && !context.demo && UUID.test(context.userId || '') ? context.userId : null; }
  function key(ownerId, id) { return ownerId + ':' + id; }
  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
    return JSON.stringify(value);
  }
  async function hash(value) {
    if (!globalThis.crypto || !globalThis.crypto.subtle) throw error('CRYPTO_REQUIRED', 'Güvenli tarayıcı bağlantısı gerekli.');
    const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
    return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('');
  }
  function makeIDB(indexedDB) {
    let ready;
    function db() {
      if (!ready) ready = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => { for (const name of ['outbox', 'evidence', 'drafts']) if (!req.result.objectStoreNames.contains(name)) { const s = req.result.createObjectStore(name, { keyPath: 'key' }); s.createIndex('ownerId', 'ownerId', { unique: false }); } };
        req.onsuccess = () => { req.result.onversionchange = () => req.result.close(); resolve(req.result); };
        req.onerror = () => reject(error('STORAGE_UNAVAILABLE', 'Yerel güvenli kayıt açılamadı. Metnin silinmedi.'));
        req.onblocked = () => reject(error('STORAGE_BLOCKED', 'Diğer panel sekmesini kapatıp tekrar dene.'));
      });
      return ready;
    }
    async function op(name, mode, action) {
      const handle = await db();
      return new Promise((resolve, reject) => {
        const tx = handle.transaction(name, mode); let value;
        try { action(tx.objectStore(name), x => { value = x; }); } catch (e) { tx.abort(); reject(e); }
        tx.oncomplete = () => resolve(value); tx.onerror = () => reject(tx.error || error('STORAGE_FAILURE', 'Yerel kayıt başarısız.')); tx.onabort = () => reject(tx.error || error('STORAGE_FAILURE', 'Yerel kayıt iptal edildi.'));
      });
    }
    return {
      get: (name, id) => op(name, 'readonly', (s, done) => { const r = s.get(id); r.onsuccess = () => done(r.result || null); }),
      put: (name, row) => op(name, 'readwrite', (s, done) => { s.put(row); done(row); }),
      delete: (name, id) => op(name, 'readwrite', s => s.delete(id)),
      all: (name, ownerId) => op(name, 'readonly', (s, done) => { const r = s.index('ownerId').getAll(ownerId); r.onsuccess = () => done(r.result); }),
      saveIntent: row => op('outbox', 'readwrite', (s, done) => {
        const r = s.get(row.key);
        r.onsuccess = () => {
          if (r.result) { if (r.result.fingerprint !== row.fingerprint) { done({ conflict: true }); return; } done({ row: r.result, existing: true }); return; }
          const count = s.index('ownerId').getAll(row.ownerId);
          count.onsuccess = () => { const all = count.result; if (all.length >= MAX_ITEMS) { const disposable = all.filter(x => ['acknowledged','cancelled'].includes(x.status)).sort((a,b) => a.createdAt-b.createdAt); if (!disposable.length) { done({ full: true }); return; } s.delete(disposable[0].key); } s.add(row); done({ row, existing: false }); };
        };
      }),
      close: async () => { if (ready) (await ready).close(); }
    };
  }
  function normalizeRoute(value) {
    if (value == null) return null;
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== 1 || value.provider !== 'claude' || value.environment !== 'local' || !['work','plan'].includes(value.executionMode) || !['low','medium','high'].includes(value.effort) || Object.keys(value).some(k => !['schemaVersion','provider','environment','executionMode','effort'].includes(k))) throw error('UNSUPPORTED_EXECUTION_ROUTE', 'Bu yürütme yolu bağlı değil. Yalnız doğrulanmış Claude / yerel işçi destekleniyor.');
    return {schemaVersion:1,provider:value.provider,environment:value.environment,executionMode:value.executionMode,effort:value.effort};
  }
  function normalizeStudioFlow(value) {
    if(value==null)return null;
    if(!value||typeof value!=='object'||Array.isArray(value)||value.schemaVersion!==1||!UUID.test(value.sourceRequestId||'')||Object.keys(value).length!==2)throw error('STUDIO_FLOW_META_INVALID','Görev kaynağı doğrulanamadı.');
    return {schemaVersion:1,sourceRequestId:value.sourceRequestId};
  }
  function cleanBrainPending(value) {
    if (!value || !UUID.test(value.requestId || '') || typeof value.text !== 'string' || !value.text.trim() || value.text.length > 2000 || !['low','medium','high'].includes(value.mode)) return null;
    const attachments = Array.isArray(value.attachments) ? value.attachments.slice(0, MAX_CHAT_FILES).map(x => typeof x === 'string' ? x : x && x.id).filter(x => UUID.test(x || '')) : [];
    return {requestId:value.requestId,...(UUID.test(value.ttsRequestId||'')?{ttsRequestId:value.ttsRequestId}:{}),text:value.text,mode:value.mode,...(typeof value.audioOutput==='boolean'?{audioOutput:value.audioOutput}:{}),...(attachments.length?{attachments}:{}),...(value.terminal===true?{terminal:true}:{}),history:(Array.isArray(value.history)?value.history:[]).slice(-12).filter(m=>m&&['user','assistant'].includes(m.role)&&typeof m.text==='string').map(m=>({role:m.role,text:m.text.slice(0,1200)}))};
  }
  function cleanChatHistory(items) {
    if (!Array.isArray(items)) return [];
    return items.slice(-60).filter(m => m && typeof m.id === 'string' && m.id.length <= 160 && ['user', 'assistant', 'system'].includes(m.role) && typeof m.body === 'string' && m.body.trim() && !m.pending).map(m => {
      const att = Array.isArray(m.attachments) ? m.attachments.slice(0, MAX_CHAT_FILES).filter(a => a && typeof a.name === 'string' && a.name.trim()).map(a => ({ name: sanitizeAttachmentName(a.name, 'ek'), mime: String(a.mime || '').slice(0, 80), size: Number(a.size) || 0 })) : [];
      return {
        id: m.id,
        ...(typeof m.requestId === 'string' && m.requestId.length <= 160 ? { requestId: m.requestId } : {}),
        role: m.role,
        body: m.body.slice(0, 2400),
        ...(att.length ? { attachments: att } : {}),
        ...(m.projectId && PROJECTS.includes(m.projectId) ? { projectId: m.projectId } : {}),
        ...(m.failed === true ? { failed: true } : {}),
        createdAt: m.createdAt || null,
        origin: m.origin && typeof m.origin === 'object' ? {
          kind: String(m.origin.kind || 'local').slice(0, 40),
          ...(typeof m.origin.provider === 'string' ? { provider: m.origin.provider.slice(0, 60) } : {}),
          ...(typeof m.origin.model === 'string' ? { model: m.origin.model.slice(0, 100) } : {}),
          ...(typeof m.origin.modelVerified === 'boolean' ? { modelVerified: m.origin.modelVerified } : {}),
          ...(typeof m.origin.voiceLabel === 'string' ? { voiceLabel: m.origin.voiceLabel.slice(0, 120) } : {}),
          ...(typeof m.origin.evidenceLabel === 'string' ? { evidenceLabel: m.origin.evidenceLabel.slice(0, 240) } : {})
        } : { kind: 'local' }
      };
    });
  }
  function createHostPort(callbacks) {
    const map = { getConnection: callbacks.getConnection, submitIntent: callbacks.submitIntent, listIntents: callbacks.listIntents, listChatHistory: callbacks.listChatHistory, cancelIntent: callbacks.cancelIntent, uploadEvidence: callbacks.uploadEvidence, uploadChatAttachment: callbacks.uploadChatAttachment, geminiChat: callbacks.geminiChat, askBrain: callbacks.askBrain, getBrainAnswer: callbacks.getBrainAnswer, askArchive: callbacks.askArchive, getArchiveAnswer: callbacks.getArchiveAnswer };
    return Object.freeze({
      context: callbacks.getContext,
      request: async (operation, payload) => {
        const current = callbacks.getContext(); const id = owner(current);
        if (!id || id !== payload.expectedUserId) throw error('AUTH_CHANGED', 'Oturum değişti. Önce hesabını doğrula.');
        if (!Object.prototype.hasOwnProperty.call(map, operation) || typeof map[operation] !== 'function') throw error('UNAVAILABLE', 'Bu bağlantı henüz yapılandırılmadı.');
        return map[operation](payload, current);
      }
    });
  }
  function classifyFailure(e) {
    const status = Number(e && (e.status || e.statusCode)); const code = e && e.code;
    if (status === 401 || status === 403 || ['AUTH_CHANGED', 'AUTH_REQUIRED', '42501', 'PGRST301', 'PGRST302'].includes(code)) return 'auth';
    if (status === 408 || status === 429 || status >= 500 || ['ECONNRESET','ETIMEDOUT','ENETUNREACH'].includes(code) || e instanceof TypeError || /network|failed to fetch|fetch failed/i.test(e && e.message || '')) return 'retry';
    return 'permanent';
  }
  function normalizeResult(result, multiple) { if (result && result.error) throw Object.assign(new Error(result.error.message || 'Bağlantı başarısız.'), result.error); const data = result && Object.prototype.hasOwnProperty.call(result, 'data') ? result.data : result; return !multiple && Array.isArray(data) ? data[0] : data; }
  function create(host, options) {
    options = options || {};
    if (!host || typeof host.context !== 'function' || typeof host.request !== 'function') throw new TypeError('Host context/request port required');
    const store = options.store || (globalThis.indexedDB ? makeIDB(globalThis.indexedDB) : null);
    const now = options.now || Date.now;
    const listeners = new Set();
    let ownerId = null, generation = 0, disposed = false, revision = 0, refreshSequence = 0, rows = [], serverRows = [], serverChatRows = [], authPaused = false, refreshBlocked = false, refreshError = '', inflight = null;
    let online = options.online || (() => typeof navigator === 'undefined' || navigator.onLine !== false);
    let energy = null, connectionInfo = null;
    const Speech = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
    function contextOwner() { return owner(host.context()); }
    function getAccountKey() { const current = contextOwner(); return current ? current + ':' + (current === ownerId ? generation : generation + 1) : null; }
    function requireAccountKey(value) { if (!value || value !== getAccountKey()) throw error('AUTH_CHANGED', 'Hesap değişti. Bu taslağı yeni hesaba göndermedim.'); }
    function visible() { return typeof document === 'undefined' || document.visibilityState !== 'hidden'; }
    function emit() { revision++; for (const fn of listeners) { try { fn(getSnapshot()); } catch (_) {} } }
    async function syncAccount() {
      const next = contextOwner();
      if (next !== ownerId) { ownerId = next; generation++; rows = []; serverRows = []; serverChatRows = []; authPaused = false; refreshBlocked = false; refreshError = ''; energy = null; connectionInfo = null; if (recognition) recognition.abort(); emit(); }
      return ownerId;
    }
    async function loadRows() {
      const id = await syncAccount(), gen = generation;
      if (!id || !store) return;
      const local = await store.all('outbox', id);
      if (gen !== generation || id !== contextOwner() || disposed) return;
      rows = local.sort((a, b) => a.createdAt - b.createdAt); emit();
    }
    function requireOwner() { const current = contextOwner(); if (!current || current !== ownerId) throw error('AUTH_REQUIRED', 'Sahip hesabınla giriş yap.'); if (!store) throw error('STORAGE_UNAVAILABLE', 'Bu tarayıcıda kalıcı kayıt kullanılamıyor. Metnin korunuyor.'); return current; }
    function guardedContext(expected) { if (disposed || contextOwner() !== expected || ownerId !== expected) throw error('AUTH_CHANGED', 'Hesap değişti; işlem bekletildi.'); }
    async function request(operation, payload, expected) { guardedContext(expected); const answer = await host.request(operation, Object.assign({}, payload, { expectedUserId: expected })); guardedContext(expected); return normalizeResult(answer, operation === 'listIntents' || operation === 'listChatHistory'); }
    function allVisible() {
      if (!ownerId || contextOwner() !== ownerId) return [];
      const map = new Map(serverRows.map(x => [x.request_id || x.requestId || x.id, x]));
      for (const x of rows) { const remote = map.get(x.requestId); map.set(x.requestId, remote ? Object.assign({}, x, { remote }) : x); }
      return Array.from(map.values()).sort((a, b) => Number(a.createdAt || Date.parse(a.created_at)) - Number(b.createdAt || Date.parse(b.created_at))).slice(-100);
    }
    function newerRemote(previous, incoming) {
      if (!previous) return incoming;
      if (['completed','failed','cancelled'].includes(previous.status) && !['completed','failed','cancelled'].includes(incoming.status)) return previous;
      const a = Date.parse(previous.updated_at || previous.created_at || ''), b = Date.parse(incoming.updated_at || incoming.created_at || '');
      return Number.isFinite(a) && Number.isFinite(b) && a > b ? previous : incoming;
    }
    function chatRowMessages(chat) {
      if (!chat || typeof chat !== 'object' || !UUID.test(chat.request_id || chat.requestId || '') || typeof chat.text !== 'string' || !chat.text.trim()) return [];
      const id = chat.request_id || chat.requestId;
      const chatAttachments = Array.isArray(chat.attachments) && chat.attachments.length
        ? chat.attachments.slice(0, MAX_CHAT_FILES).filter(a => a && typeof a.name === 'string' && a.name.trim()).map(a => ({ name: sanitizeAttachmentName(a.name, 'ek'), mime: String(a.mime || ''), size: Number(a.size) || 0 }))
        : [];
      const out = [{
        id: 'chat:' + id + ':user',
        requestId: id,
        role: 'user',
        body: chat.text.slice(0, 2000),
        ...(chatAttachments.length ? { attachments: chatAttachments } : {}),
        createdAt: chat.created_at || null,
        origin: { kind: 'user-input', evidenceLabel: 'Canlı beyne gönderildi.' }
      }];
      const answerText = typeof chat.answer_tr === 'string' ? chat.answer_tr.trim() : '';
      if (answerText) {
        const providerLabel = ({ groq: 'Groq', google: 'Google AI Studio', gemini: 'Gemini', openai: 'OpenAI Codex', claude: 'Claude' })[chat.provider] || null;
        const verifiedGroq = chat.provider === 'groq' && chat.transport === 'groq-api' && chat.model_verified === true;
        const verifiedGoogle = ['google', 'gemini'].includes(chat.provider) && chat.transport === 'google-ai-studio-api' && chat.model_verified === true;
        const origin = (verifiedGroq || verifiedGoogle)
          ? {
              kind: 'model',
              provider: verifiedGroq ? 'Groq' : 'Google AI Studio',
              model: String(chat.model || (verifiedGroq ? 'openai/gpt-oss-120b' : 'gemini-3.8-flash')).slice(0, 100),
              modelVerified: true,
              evidenceLabel: verifiedGroq
                ? 'Groq API yanıtında doğrulanan model (düşünme: düşük). Günlük sohbet Codex işçisine gönderilmez.'
                : 'Google API yanıtında bildirilen model. Günlük sohbet Codex işçisine gönderilmez.'
            }
          : chat.status === 'done' && providerLabel && chat.model
          ? { kind: 'model', provider: providerLabel, model: String(chat.model).slice(0, 100), evidenceLabel: 'Sunucu sohbet kaydından geri yüklendi.' }
          : chat.status !== 'done'
          ? { kind: 'provider-error', provider: providerLabel || 'Groq', evidenceLabel: 'Önceki sohbet kaydı hata ile sonuçlandı.' }
          : { kind: 'local', evidenceLabel: 'Sunucu sohbet kaydından geri yüklendi.' };
        out.push({
          id: 'chat:' + id,
          requestId: id,
          role: 'assistant',
          body: answerText.slice(0, 2400),
          failed: chat.status === 'failed' || chat.status === 'cancelled',
          createdAt: chat.finished_at || chat.created_at || null,
          origin
        });
      }
      return out;
    }
    function getSnapshot() {
      const id = contextOwner(), active = id && id === ownerId;
      let connection = { status: 'unknown', label: 'Sahip hesabıyla giriş gerekli', submitAvailable: false };
      if (active) connection = !online() ? { status: 'offline', label: 'Çevrimdışı · istekler cihazda saklanır', submitAvailable: !!store } : authPaused ? { status: 'unknown', label: 'Oturumu yenile · kuyruk güvenle bekliyor', submitAvailable: false } : Object.assign({ status: 'waiting', label: 'DJ-KABIN bağlantısı doğrulanıyor', submitAvailable: !!store }, connectionInfo || {});
      if (refreshError && active) connection = { ...connection, status: 'waiting', label: refreshError };
      const messages = [], jobs = [];
      for (const row of allVisible()) {
        const remote = row.remote || (row.request_id ? row : null), id = row.requestId || row.request_id, projectId = row.projectId || row.requested_project;
        let status = 'queued', statusText = 'Cihazda kaydedildi · sunucuya iletilmedi';
        if (remote) { const s = remote.status; status = ({ recorded: 'queued', claimed: 'queued', running: 'running', waiting_review: 'waiting_review', completed: 'completed', failed: 'failed', cancelled: 'cancelled' })[s] || 'blocked'; statusText = ({ recorded: 'İstek sunucuda kayıtlı · ajan başlamadı', claimed: 'İzole işçi teslim aldı · çalışma kanıtı bekleniyor', running: 'İşçi çalışma bildirimi alındı', waiting_review: 'İnceleme bekliyor', completed: 'İşçi tamamlanma kaydı alındı · test kanıtlarını incele', failed: 'İşçi hata kaydı alındı', cancelled: 'İstek iptal edildi' })[s] || 'Bilinmeyen sunucu durumu'; }
        const terminalRemote = remote && ['completed','failed','cancelled'].includes(remote.status), runningRemote = remote && remote.status === 'running';
        const note = remote && typeof remote.note_tr === 'string' ? remote.note_tr.trim().slice(0, 240) : '';
        if (note && (terminalRemote || runningRemote)) statusText = note;
        if (remote?.receipt?.status === 'DURABLY_QUEUED' && !terminalRemote && !runningRemote) statusText = 'DJ-KABIN izole kalıcı kuyruğa aldı · ajan başlatılmadı';
        if (remote?.receipt?.status === 'STUDIO_FLOW_QUEUED' && !terminalRemote && !runningRemote) statusText = 'DJ-KABIN kalıcı işçi kuyruğuna aldı · sırası bekleniyor';
        if ((remote?.receipt?.status === 'WAITING' || remote?.receipt?.status === 'STUDIO_FLOW_WAITING') && !terminalRemote) statusText = note || 'DJ-KABIN işçi sırası bekleniyor';
        if (remote?.receipt?.status === 'STUDIO_FLOW_RUNNING' && !terminalRemote) { status = 'running'; statusText = note || 'DJ-KABIN üzerinde işçi çalışıyor'; }
        if (remote?.receipt?.status === 'USER_TEST_READY') { status = 'waiting_review'; statusText = note || 'Test paketi hazır · Deniz incelemesi bekleniyor'; }
        if (remote?.receipt?.status === 'NEEDS_CLARIFICATION' && !terminalRemote) { status = 'blocked'; statusText = 'DJ-KABIN kaydetti · işlem netleştirme bekliyor'; }
        if (!terminalRemote) {
          if (row.status === 'retry') statusText = 'Bağlantı kesildi · güvenli tekrar bekleniyor';
          if (row.status === 'auth_paused') { status = 'paused'; statusText = 'Hesabı yenile · metin cihazda güvende'; }
          if (row.status === 'cancel_pending') { status = 'paused'; statusText = 'İptal isteği iletilmeyi bekliyor'; }
          if (row.status === 'cancel_requested' || remote && remote.cancel_requested) { status = 'paused'; statusText = 'Durdurma istendi · işçi durdu kanıtı bekleniyor'; }
          if (row.status === 'cancelled') { status = 'cancelled'; statusText = 'İstek iptal edildi'; }
          if (row.status === 'failed') { status = 'failed'; statusText = row.lastError || 'İstek gönderilemedi; metin cihazda saklanıyor'; }
        }
        messages.push({ id: 'intent-' + id, role: 'user', body: row.text || '', projectId, createdAt: row.createdAt || row.created_at, commandId: id, origin: { kind: 'local' } });
        jobs.push({ id, projectId, title: (row.text || '').slice(0, 90), status, statusText, canCancel: !['completed', 'failed', 'cancelled'].includes(status), ...(remote && remote.worker_id ? { expert: remote.worker_id } : {}), ...(remote && remote.workspace_label ? { workspaceLabel: remote.workspace_label } : {}),
          createdAt: row.createdAt || row.created_at || null,
          updatedAt: remote?.updated_at || null, finishedAt: remote?.finished_at || null,
          receipt: remote?.receipt ? JSON.parse(JSON.stringify(remote.receipt)) : null,
          stage: remote?.stage || null,
          steps: Array.isArray(remote?.steps) ? remote.steps.map(s=>({...s})) : [] });
      }
      if (active && Array.isArray(serverChatRows) && serverChatRows.length) {
        for (const chat of serverChatRows.slice(-40)) {
          for (const m of chatRowMessages(chat)) messages.push(m);
        }
      }
      return { revision, accountKey: getAccountKey(), connection, messages, jobs, energyState: energy || (!online() ? 'offline' : authPaused ? 'blocked' : 'idle'), capabilities: { attachments: !!store && !!active && connectionInfo?.attachmentsAvailable === true && typeof createImageBitmap === 'function', speech: !!Speech, maxAttachments: MAX_FILES }, projects: PROJECTS.slice() };
    }
    async function refsFor(input, id) {
      if (!Array.isArray(input) || input.length > MAX_FILES) throw error('ATTACHMENTS_INVALID', 'En fazla üç görsel ekleyebilirsin.');
      const refs = [];
      for (const item of input) {
        if (!item || !UUID.test(item.id || '')) throw error('ATTACHMENT_MISSING', 'Görseli tekrar seç.');
        const saved = await store.get('evidence', key(id, item.id)); guardedContext(id);
        if (!saved || !saved.blob || saved.ownerId !== id) throw error('ATTACHMENT_MISSING', 'Görsel bu hesapta bulunamadı. Tekrar seç.');
        refs.push({ id: saved.id, name: saved.name, mime: saved.mime, size: saved.size, sha256: saved.sha256, bucket: 'studio-v23-evidence', path: id + '/' + saved.sha256 + '.jpg' });
      }
      return refs.sort((a, b) => a.id.localeCompare(b.id));
    }
    /** ARGON KARA KUTU: ask DJ-KABIN's FTS5 archive a history question and wait (bounded) for its answer. Read-only; never a job. */
    async function askArchive(payload) {
      try {
        requireAccountKey(payload && payload.accountKey);
        await syncAccount(); const id = contextOwner(); if (!id || id !== ownerId) throw error('AUTH_REQUIRED', 'Sahip hesabınla giriş yap.');
        const text = String(payload.text || '').trim(); if (!text || text.length > 500) throw error('TEXT_INVALID', 'Soruyu 1–500 karakterle yaz.');
        const requestId = globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function' ? globalThis.crypto.randomUUID() : null; if (!requestId) throw error('UNAVAILABLE', 'Bu tarayıcı güvenli kimlik üretemiyor.');
        await request('askArchive', { requestId, text }, id);
        const deadline = now() + (Number(payload.timeoutMs) > 0 ? Number(payload.timeoutMs) : 25000), wait = ms => new Promise(r => setTimeout(r, ms));
        while (now() < deadline) {
          await wait(Number(payload.pollMs) > 0 ? Number(payload.pollMs) : 1500); requireAccountKey(payload.accountKey);
          const answer = await request('getArchiveAnswer', { requestId }, id);
          if (answer && (answer.status === 'done' || answer.status === 'failed')) return { ok: answer.status === 'done', answer_tr: String(answer.answer_tr || ''), hits: Array.isArray(answer.hits) ? answer.hits : [], requestId };
        }
        return { ok: false, timeout: true, requestId, answer_tr: 'DJ-KABIN kara kutudan henüz yanıt vermedi (çevrimdışı olabilir). Soru kayıtlı; iş emri oluşturulmadı.' };
      } catch (e) { return { ok: false, code: e.code || 'ARCHIVE_FAILED', answer_tr: e.message || 'Kara kutuya ulaşılamadı. İş emri oluşturulmadı.' }; }
    }
    /** ARGON canlı beyin: one conversational turn answered by the model on DJ-KABIN; returns its reply and proposed tool calls. */
    async function askBrain(payload) {
      let requestId=null;
      try {
        requireAccountKey(payload&&payload.accountKey);await syncAccount();const id=requireOwner();requireAccountKey(payload.accountKey);
        const text=String(payload.text||'').trim();if(!text||text.length>2000)throw error('TEXT_INVALID','Mesaj 1–2000 karakter olmalı.');
        requestId=payload.requestId||globalThis.crypto?.randomUUID();if(!UUID.test(requestId||''))throw error('REQUEST_ID_REQUIRED','Geçerli istek kimliği gerekli.');
        const rawAttachments=payload.attachments==null?[]:payload.attachments;
        if(!Array.isArray(rawAttachments)||rawAttachments.length>MAX_CHAT_FILES)throw error('ATTACHMENTS_INVALID','Bir mesaja en fazla 4 ek gönderebilirsin.');
        const uploadedRefs=[],localKeysToDelete=[];
        let totalBytes=0;
        for(const item of rawAttachments){
          const attId=typeof item==='string'?item:item&&item.id;
          if(!UUID.test(attId||''))throw error('ATTACHMENT_MISSING','Ek kimliği geçersiz. Eki yeniden seç.');
          const localKey=key(id,attId);
          const saved=await store.get('evidence',localKey);guardedContext(id);requireAccountKey(payload.accountKey);
          if(!saved||!saved.blob||saved.ownerId!==id)throw error('ATTACHMENT_MISSING','Seçilen ek cihazda bulunamadı. Lütfen yeniden ekle.');
          const ext=chatExt(saved.mime),limit=chatMimeLimit(saved.mime);
          if(!ext||!limit||saved.size<1||saved.size>limit)throw error('ATTACHMENT_INVALID','Ek türü veya boyutu sınır dışı: '+sanitizeAttachmentName(saved.name,'ek'));
          totalBytes+=saved.size;
          if(totalBytes>MAX_CHAT_TOTAL)throw error('ATTACHMENTS_TOO_LARGE','Eklerin toplam boyutu en fazla 12 MB olabilir.');
          const path=id+'/'+saved.sha256+'.'+ext,cleanName=sanitizeAttachmentName(saved.name,'ek.'+ext);
          const uploaded=await request('uploadChatAttachment',{path,blob:saved.blob,mime:saved.mime,sha256:saved.sha256,size:saved.size,name:cleanName},id);
          requireAccountKey(payload.accountKey);
          if(!uploaded||uploaded.bucket!==CHAT_BUCKET||uploaded.path!==path)throw error('ATTACHMENT_UPLOAD_FAILED','Ek yükleme kaydı doğrulanamadı: '+cleanName);
          uploadedRefs.push({bucket:CHAT_BUCKET,path,sha256:saved.sha256,mime:saved.mime,size:saved.size,name:sanitizeAttachmentName(uploaded.name||cleanName,'ek.'+ext)});
          localKeysToDelete.push(localKey);
        }
        const answer=await request('geminiChat',{requestId,text,history:Array.isArray(payload.history)?payload.history:[],mode:payload.mode,...(typeof payload.audioOutput==='boolean'?{audioOutput:payload.audioOutput}:{}),...(uploadedRefs.length?{attachments:uploadedRefs}:{}),signal:payload.signal,onTextReady:value=>{guardedContext(id);requireAccountKey(payload.accountKey);if(typeof payload.onTextReady==='function')payload.onTextReady(value);}},id);
        requireAccountKey(payload.accountKey);
        if(answer?.ok===true&&localKeysToDelete.length){
          for(const localKey of localKeysToDelete){try{await store.delete('evidence',localKey);}catch(_){}}
          guardedContext(id);
        }
        return {...answer,ok:answer?.ok===true,requestId,answer_tr:String(answer?.answer_tr||answer?.reply_tr||''),actions:Array.isArray(answer?.actions)?answer.actions:[]};
      } catch(e) { return {ok:false,requestId,code:e.code||'GEMINI_FAILED',answer_tr:e.message||'Google AI Studio bağlantısı hazırlanmalı. Mesaj kod işçisine aktarılmadı.'}; }
    }
    async function submitIntent(payload) {
      try {
        requireAccountKey(payload && payload.accountKey);
        await syncAccount(); const id = requireOwner();
        requireAccountKey(payload.accountKey);
        const requestId = payload && (payload.id || payload.requestId);
        if (!UUID.test(requestId || '')) throw error('REQUEST_ID_REQUIRED', 'Geçerli istek kimliği gerekli.');
        const projectId = payload.projectId;
        if (!PROJECTS.includes(projectId)) throw error('PROJECT_REQUIRED', 'Hedef projeyi seç.');
        if (payload.scope != null && payload.scope !== projectId) throw error('PROJECT_MISMATCH', 'Sohbet kapsamı ve hedef proje uyuşmuyor.');
        if (typeof payload.text !== 'string' || !payload.text.trim() || payload.text.length > MAX_TEXT) throw error('TEXT_INVALID', 'İsteğini 1–12.000 karakterle yaz.');
        const attachments = await refsFor(payload.attachments || [], id);
        const route = normalizeRoute(payload.route);
        const studioFlow = normalizeStudioFlow(payload.studioFlow);
        const fingerprint = await hash(canonical({ text: payload.text, projectId, attachments, ...(route ? {route} : {}), ...(studioFlow ? {studioFlow} : {}) })); guardedContext(id);
        const row = { key: key(id, requestId), ownerId: id, requestId, text: payload.text, projectId, attachments, ...(route ? {route} : {}), ...(studioFlow ? {studioFlow} : {}), fingerprint, status: 'pending', createdAt: now(), updatedAt: now(), attempts: 0, nextAttemptAt: 0 };
        const saved = await store.saveIntent(row); guardedContext(id);
        if (saved.conflict) throw error('REQUEST_CONFLICT', 'Bu istek kimliği farklı içerikle kullanılmış. Yeni bir istek oluştur.');
        if (saved.full) throw error('OUTBOX_FULL', 'Yerel kuyruk dolu. Bekleyen istekler iletilince tekrar dene.');
        await loadRows(); void flush();
        return { accepted: true, commandId: requestId, projectId, durable: true, delivery: saved.row.status === 'acknowledged' ? 'server-recorded' : 'local-recorded' };
      } catch (e) { return { accepted: false, code: e.code || 'SUBMIT_FAILED', message: e.message || 'İstek kaydedilemedi. Metnin silinmedi.' }; }
    }
    async function uploadRefs(row, id) {
      for (const ref of row.attachments) {
        const saved = await store.get('evidence', key(id, ref.id)); guardedContext(id);
        if (!saved || saved.sha256 !== ref.sha256) throw error('PAYLOAD_MISMATCH', 'Görsel kanıtı uyuşmuyor.');
        if (!saved.uploaded) {
          const result = await request('uploadEvidence', { path: ref.path, blob: saved.blob, mime: ref.mime, sha256: ref.sha256, size: ref.size }, id);
          if (!result || result.path !== ref.path || result.bucket !== ref.bucket) throw error('PAYLOAD_MISMATCH', 'Görsel yükleme kaydı doğrulanamadı.');
          await store.put('evidence', Object.assign({}, saved, { uploaded: true })); guardedContext(id);
        }
      }
    }
    async function flushOnce() {
      await syncAccount(); const id = ownerId;
      if (!id || !store || !online() || !visible() || authPaused || disposed) return;
      const pending = (await store.all('outbox', id)).filter(x => LOCAL_ACTIVE.has(x.status) && x.nextAttemptAt <= now()).sort((a, b) => a.createdAt - b.createdAt);
      for (const row of pending) {
        guardedContext(id); if (!online()) break;
        const cancelling = row.status === 'cancel_pending' || row.cancelRequested === true;
        try {
          if (!cancelling) await uploadRefs(row, id);
          const remote = await request(cancelling ? 'cancelIntent' : 'submitIntent', cancelling ? { requestId: row.requestId } : { requestId: row.requestId, text: row.text, requestedProject: row.projectId, attachments: row.attachments, ...(row.route ? {route:normalizeRoute(row.route)} : {}), ...(row.studioFlow ? {studioFlow:normalizeStudioFlow(row.studioFlow)} : {}) }, id);
          if (!remote || (remote.request_id || remote.requestId || remote.id) !== row.requestId || (remote.requested_project && remote.requested_project !== row.projectId)) throw error('PAYLOAD_MISMATCH', 'Sunucu istek kaydı eşleşmedi.');
          const latest = await store.get('outbox', row.key); guardedContext(id);
          await store.put('outbox', Object.assign({}, latest || row, { status: cancelling ? remote.status === 'cancelled' ? 'cancelled' : 'cancel_requested' : latest && latest.status === 'cancel_pending' ? 'cancel_pending' : 'acknowledged', updatedAt: now(), lastError: null, remote }));
          const previous = serverRows.find(x => (x.request_id || x.requestId) === row.requestId);
          serverRows = serverRows.filter(x => (x.request_id || x.requestId) !== row.requestId).concat(newerRemote(previous, Object.assign({}, row.remote || {}, remote)));
        } catch (e) {
          if (contextOwner() !== id || disposed) return;
          const kind = classifyFailure(e); authPaused = kind === 'auth';
          const attempts = row.attempts + 1;
          const latest = await store.get('outbox', row.key);
          const stopped = kind === 'permanent'; // Transient outages never discard a durable intent.
          await store.put('outbox', Object.assign({}, latest || row, { status: kind === 'auth' ? 'auth_paused' : stopped ? 'failed' : cancelling || latest && latest.status === 'cancel_pending' ? 'cancel_pending' : 'retry', attempts, updatedAt: now(), nextAttemptAt: now() + BACKOFF[Math.min(attempts - 1, BACKOFF.length - 1)], lastError: stopped ? 'İletim durdu: ' + (e.message || 'Bağlantıyı kontrol edip elle tekrar dene.') : null }));
          if (kind === 'auth') break;
        }
      }
      await loadRows();
    }
    function flush() {
      if (inflight) return inflight.then(() => flush());
      inflight = flushOnce().catch(e => { if (!disposed) { refreshError = e.code === 'AUTH_CHANGED' ? '' : 'Bağlantı bekleniyor · istekler cihazda güvende'; emit(); } }).finally(() => { inflight = null; });
      return inflight;
    }
    // v1.1 rationed server reads. The 2 s poll used to pull the full chat history with every reply's embedded voice recording
    // (~1.3 MB each) and overlap with itself; that exhausted the free Supabase connection pool ("Timed out acquiring connection from
    // connection pool") and stalled DJ-KABIN's intake. Now one refresh runs at a time: connection 5 s, jobs 15 s, chat history at
    // start and then every 60 s. A forced refresh (after an action, on resume) reads connection and jobs at once.
    const REFRESH_EVERY = { connection: 5000, intents: 15000, history: 60000 };
    let refreshing = null, refreshingForced = false, queuedForce = null, lastRead = { connection: 0, intents: 0, history: 0 }, readScope = null;
    function refresh(force) {
      force = force === true;
      if (refreshing) {
        if (!force || refreshingForced) return refreshing;
        // An action wants fresh jobs while a rationed read is running: read once more right after it, never in parallel.
        const again = () => { queuedForce = null; return refresh(true); };
        return queuedForce || (queuedForce = refreshing.then(again, again));
      }
      refreshingForced = force;
      refreshing = refreshOnce(force).finally(() => { refreshing = null; refreshingForced = false; });
      return refreshing;
    }
    async function refreshOnce(force) {
      await syncAccount(); const id = ownerId;
      if (!id || !online() || !visible() || disposed || authPaused || refreshBlocked) return;
      if (readScope !== id + ':' + generation) { readScope = id + ':' + generation; lastRead = { connection: 0, intents: 0, history: 0 }; }
      const t = now(), due = kind => t - lastRead[kind] >= REFRESH_EVERY[kind];
      const wantIntents = force || due('intents'), wantConnection = force || due('connection'), wantHistory = due('history');
      if (!wantIntents && !wantConnection && !wantHistory) return;
      const sequence = ++refreshSequence, epoch = generation;
      const [intents, connection, history] = await Promise.allSettled([
        wantIntents ? request('listIntents', { limit: 50 }, id) : Promise.resolve(undefined),
        wantConnection ? request('getConnection', {}, id) : Promise.resolve(undefined),
        wantHistory ? request('listChatHistory', { limit: 30 }, id) : Promise.resolve(undefined)
      ]);
      if (sequence !== refreshSequence || epoch !== generation || contextOwner() !== id) return;
      // Each read stands alone: a failing connection probe no longer discards the job list or the chat history.
      if (wantConnection && connection.status === 'fulfilled') { connectionInfo = connection.value; lastRead.connection = t; }
      if (wantHistory && history.status === 'fulfilled' && Array.isArray(history.value)) { serverChatRows = history.value; lastRead.history = t; }
      let failure = wantIntents && intents.status === 'rejected' ? intents.reason : null;
      if (wantIntents && !failure) {
        try {
          const result = intents.value, incoming = (Array.isArray(result) ? result : result && result.rows || []).filter(row => row && typeof row === 'object');
          serverRows = incoming.map(row => newerRemote(serverRows.find(old => (old.request_id || old.requestId) === (row.request_id || row.requestId)), row));
          lastRead.intents = t; refreshError = '';
        } catch (e) { failure = e; }
      }
      if (failure) {
        const kind = classifyFailure(failure); if (kind === 'auth') authPaused = true; if (kind === 'permanent') refreshBlocked = true;
        refreshError = kind === 'permanent' ? 'Sunucu kuyruğu doğrulanamadı · istekler cihazda korunuyor' : 'Sunucu durumu alınamadı · cihazdaki kayıt korunuyor';
      }
      emit();
    }
    async function resume() {
      await syncAccount(); const id = requireOwner(); authPaused = false; refreshBlocked = false;
      for (const row of await store.all('outbox', id)) if (row.status === 'auth_paused') await store.put('outbox', Object.assign({}, row, { status: row.cancelRequested ? 'cancel_pending' : 'pending', nextAttemptAt: 0 }));
      await loadRows(); await flush(); await refresh(true);
    }
    async function cancelJob(payload) {
      requireAccountKey(payload && payload.accountKey);
      const requestId = payload && payload.jobId;
      await syncAccount(); const id = requireOwner();
      requireAccountKey(payload.accountKey);
      if (!UUID.test(requestId || '')) throw error('REQUEST_ID_REQUIRED', 'Geçersiz iş kimliği.');
      let row = await store.get('outbox', key(id, requestId));
      if (!row) { const remote = serverRows.find(x => x.request_id === requestId); if (!remote) throw error('NOT_FOUND', 'İstek bulunamadı.'); row = { key: key(id, requestId), ownerId: id, requestId, text: remote.text, projectId: remote.requested_project, attachments: remote.attachments || [], fingerprint: '', createdAt: Date.parse(remote.created_at), attempts: 0 }; }
      guardedContext(id);
      if (row.status === 'cancelled') return { accepted: true, commandId: requestId };
      // Even a local pending request may have reached the server before a lost ACK. Always cancel remotely.
      await store.put('outbox', Object.assign({}, row, { status: 'cancel_pending', cancelRequested: true, nextAttemptAt: 0, updatedAt: now() }));
      await loadRows(); void flush(); return { accepted: true, commandId: requestId };
    }
    function resolveIntent(payload) {
      const scope = payload.scope, text = String(payload.text || '').normalize('NFKC').toLocaleLowerCase('tr-TR');
      const boundary = value => new RegExp('(?<![\\p{L}\\p{N}])(?:' + value + ')(?![\\p{L}\\p{N}])', 'u');
      const aliases = { koza: boundary('koza'), 'charm-drop': boundary('charm[ -]?drop'), 'forge-run': boundary('forge[ -]?run'), aeryo: boundary('aeryo'), tupsper: boundary('tuckspire|tupsper'), 'oryvona-panel': boundary('oryvona[ -]?panel|panel|paneli|panelde|panelden|panelin|panelinde|jarvis|argon|uygulama|uygulamayı|uygulamayi|uygulamada|uygulamaya') };
      const mentioned = PROJECTS.filter(p => aliases[p].test(text));
      if (scope && !PROJECTS.includes(scope)) return { status: 'rejected', message: 'Geçersiz proje kapsamı.' };
      if (mentioned.length > 1 || (scope && mentioned.length === 1 && mentioned[0] !== scope)) return { status: 'clarify', question: 'Bu isteği hangi tek projeye göndereyim?', candidates: mentioned.length ? mentioned : PROJECTS.slice() };
      if (scope || mentioned.length === 1) return { status: 'ready', projectId: scope || mentioned[0] };
      return { status: 'clarify', question: 'İsteğin hangi projeye ait?', candidates: PROJECTS.slice() };
    }
    const drafts = {
      load: async scope => { await syncAccount(); if (!ownerId || !store) return { text: '', attachments: [] }; const id = ownerId, gen = generation, row = await store.get('drafts', key(id, scope || 'studio')); return gen === generation && id === contextOwner() && row ? { text: row.text, attachments: row.attachments, brainPending: cleanBrainPending(row.brainPending), ...(Array.isArray(row.chatHistory) ? { chatHistory: cleanChatHistory(row.chatHistory) } : {}) } : { text: '', attachments: [] }; },
      save: async (scope, value) => { requireAccountKey(value.accountKey); await syncAccount(); const id = requireOwner(); requireAccountKey(value.accountKey); if (scope != null && !PROJECTS.includes(scope)) throw error('PROJECT_REQUIRED', 'Geçersiz kapsam.'); if (typeof value.text !== 'string' || value.text.length > MAX_TEXT) throw error('TEXT_INVALID', 'Taslak çok uzun.'); if (!Array.isArray(value.attachments || []) || (value.attachments || []).length > MAX_CHAT_FILES) throw error('ATTACHMENTS_INVALID','En fazla dört ek.'); const targetKey = key(id, scope || 'studio'); const existing = value.chatHistory === undefined ? await store.get('drafts', targetKey) : null; guardedContext(id); const chatHistory = Array.isArray(value.chatHistory) ? cleanChatHistory(value.chatHistory) : (existing && Array.isArray(existing.chatHistory) ? cleanChatHistory(existing.chatHistory) : undefined); await store.put('drafts', { key: targetKey, ownerId: id, text: value.text, brainPending: cleanBrainPending(value.brainPending), ...(chatHistory ? { chatHistory } : {}), attachments: (value.attachments || []).map(x => ({ id: x.id, name: String(x.name || '').slice(0,124), mime: x.mime, size: x.size })), updatedAt: now() }); guardedContext(id); }
    };
    async function processFile(file, id) {
      if (!file || file.size > MAX_RAW || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw error('IMAGE_INVALID', 'JPEG, PNG veya WebP seç; dosya en fazla 5 MB olabilir.');
      const buffer = new Uint8Array(await file.arrayBuffer()); guardedContext(id);
      const dimensions = readImageDimensions(buffer, file.type);
      if (!dimensions || dimensions.width < 1 || dimensions.height < 1 || dimensions.width > 4096 || dimensions.height > 4096 || dimensions.width * dimensions.height > 16000000) throw error('IMAGE_DIMENSIONS', 'Görsel en fazla 4096×4096 ve 16 megapiksel olabilir.');
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      let blob;
      try {
        guardedContext(id);
        if (bitmap.width > 4096 || bitmap.height > 4096 || bitmap.width * bitmap.height > 16000000) throw error('IMAGE_DIMENSIONS', 'Görsel çok büyük.');
        const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const ctx = canvas.getContext('2d', { alpha: false }); if (!ctx) throw error('IMAGE_UNSUPPORTED', 'Görsel dönüştürülemedi.'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82)); canvas.width = canvas.height = 1;
      } finally { bitmap.close(); }
      if (!blob || blob.size > MAX_IMAGE) throw error('IMAGE_TOO_LARGE', 'Görseli küçültüp tekrar seç; yükleme sınırı 2 MB.');
      const sha256 = await hash(await blob.arrayBuffer()); guardedContext(id);
      const existing = await store.all('evidence', id); if (existing.reduce((sum, x) => sum + x.size, 0) + blob.size > MAX_TOTAL) throw error('EVIDENCE_FULL', 'Yerel görsel alanı dolu. Bekleyen istekler korunuyor.');
      const imageId = globalThis.crypto.randomUUID(); const name = String(file.name || 'gorsel').replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 120).replace(/\.[^.]+$/, '') + '.jpg';
      const row = { key: key(id, imageId), ownerId: id, id: imageId, name, mime: 'image/jpeg', size: blob.size, sha256, blob, uploaded: false, createdAt: now() };
      await store.put('evidence', row); guardedContext(id); return { id: row.id, name: row.name, mime: row.mime, size: row.size };
    }
    async function processDocument(file, id) {
      if (!file || typeof file.arrayBuffer !== 'function') throw error('FILE_INVALID', 'Geçerli bir dosya seç.');
      const rawName = String(file.name || '').trim();
      const extMatch = /\.([A-Za-z0-9]+)$/.exec(rawName);
      const ext = extMatch ? extMatch[1].toLowerCase() : '';
      const isPdf = ext === 'pdf' || (!ext && file.type === 'application/pdf');
      const isText = !isPdf && TEXT_EXTENSIONS.includes(ext);
      if (!isPdf && !isText) throw error('FILE_TYPE_UNSUPPORTED', 'Bu dosya türü desteklenmiyor. PDF, metin veya kod dosyası seç.');
      if (!Number.isFinite(file.size) || file.size < 1) throw error('FILE_EMPTY', 'Boş dosya gönderilemez.');
      if (isPdf && file.size > MAX_PDF) throw error('PDF_TOO_LARGE', 'PDF dosyası en fazla 8 MB olabilir.');
      if (isText && file.size > MAX_TEXT_FILE) throw error('TEXT_FILE_TOO_LARGE', 'Metin veya kod dosyası en fazla 1 MB olabilir.');
      const bytes = new Uint8Array(await file.arrayBuffer()); guardedContext(id);
      if (bytes.byteLength < 1) throw error('FILE_EMPTY', 'Boş dosya gönderilemez.');
      let mime;
      if (isPdf) {
        if (bytes.byteLength > MAX_PDF) throw error('PDF_TOO_LARGE', 'PDF dosyası en fazla 8 MB olabilir.');
        if (bytes.byteLength < 5 || bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46 || bytes[4] !== 0x2d) {
          throw error('PDF_INVALID', 'Geçerli bir PDF dosyası değil (%PDF- başlığı bulunamadı).');
        }
        mime = 'application/pdf';
      } else {
        if (bytes.byteLength > MAX_TEXT_FILE) throw error('TEXT_FILE_TOO_LARGE', 'Metin veya kod dosyası en fazla 1 MB olabilir.');
        try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
        catch (_) { throw error('FILE_NOT_UTF8', 'Dosya geçerli UTF-8 metni değil.'); }
        mime = 'text/plain';
      }
      const sha256 = await hash(bytes); guardedContext(id);
      const existing = await store.all('evidence', id); guardedContext(id);
      if (existing.reduce((sum, x) => sum + (Number(x.size) || 0), 0) + bytes.byteLength > MAX_TOTAL) throw error('EVIDENCE_FULL', 'Yerel ek alanı dolu. Bekleyen istekler korunuyor.');
      const docId = globalThis.crypto.randomUUID();
      const name = sanitizeAttachmentName(rawName, isPdf ? 'belge.pdf' : 'metin.txt');
      const blob = new Blob([bytes], { type: mime });
      const row = { key: key(id, docId), ownerId: id, id: docId, name, mime, size: bytes.byteLength, sha256, blob, uploaded: false, purpose: 'chat', createdAt: now() };
      await store.put('evidence', row); guardedContext(id);
      return { id: row.id, name: row.name, mime: row.mime, size: row.size, sha256: row.sha256 };
    }
    const attachments = {
      choose: async args => {
        requireAccountKey(args && args.accountKey);
        await syncAccount(); const id = requireOwner();
        requireAccountKey(args.accountKey);
        if (connectionInfo?.attachmentsAvailable === false) throw error('EVIDENCE_UNAVAILABLE', 'Görsel yükleme henüz hazır değil. Metinle komut gönderebilirsin.');
        const kind = args && args.kind === 'file' ? 'file' : 'image';
        const isChatKind = args && (args.kind === 'file' || args.kind === 'image');
        const cap = isChatKind ? MAX_CHAT_FILES : MAX_FILES;
        if (args && typeof args.maxFiles === 'number' && args.maxFiles < 1) throw error('TOO_MANY_ATTACHMENTS', 'En fazla ' + cap + ' ek seçebilirsin.');
        const limit = Math.min(cap, Math.max(1, Number(args && args.maxFiles) || cap));
        if (kind === 'file') {
          if (typeof document === 'undefined') throw error('FILE_UNSUPPORTED', 'Bu tarayıcı dosya eklemeyi desteklemiyor.');
          const files = await new Promise(resolve => {
            const picker = document.createElement('input'); picker.type = 'file'; picker.accept = FILE_ACCEPT; picker.multiple = limit > 1;
            picker.onchange = () => { resolve(Array.from(picker.files || [])); picker.remove(); };
            picker.oncancel = () => { resolve([]); picker.remove(); }; picker.click();
          });
          guardedContext(id);
          if (files.length > limit) throw error('TOO_MANY_ATTACHMENTS', 'En fazla ' + limit + ' dosya seç.');
          const result = []; let total = 0;
          for (const file of files) {
            const doc = await processDocument(file, id);
            total += doc.size;
            if (total > MAX_CHAT_TOTAL) throw error('ATTACHMENTS_TOO_LARGE', 'Eklerin toplam boyutu en fazla 12 MB olabilir.');
            result.push(doc);
          }
          return result;
        }
        if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') throw error('IMAGE_UNSUPPORTED', 'Bu tarayıcı görsel eklemeyi desteklemiyor.');
        const files = await new Promise(resolve => {
          const picker = document.createElement('input'); picker.type = 'file'; picker.accept = 'image/jpeg,image/png,image/webp'; picker.multiple = limit > 1;
          picker.onchange = () => { resolve(Array.from(picker.files || [])); picker.remove(); };
          picker.oncancel = () => { resolve([]); picker.remove(); }; picker.click();
        });
        guardedContext(id); if (files.length > limit) throw error('TOO_MANY_IMAGES', 'En fazla ' + limit + ' görsel seç.');
        const result = []; for (const file of files) result.push(await processFile(file, id)); return result;
      }
    };
    let recognition = null;
    // Android SpeechRecognizer errors arrive through the native shim with Web Speech names; each gets its real, actionable reason.
    const SPEECH_ERRORS = {
      'not-allowed': 'Mikrofon izni verilmedi. Ayarlar › Uygulamalar › ARGON › İzinler › Mikrofon’u aç ve yeniden dokun.',
      'service-not-allowed': 'Telefonda konuşma tanıma servisi kullanılamıyor (Google uygulaması/ses tanıma kapalı olabilir). Yazarak devam edebilirsin.',
      'no-speech': 'Ses algılanmadı. Mikrofona dokunup yeniden konuş.',
      'network': 'Konuşma tanıma için internet gerekiyor; bağlantı kurulamadı. Biraz sonra yeniden dene.',
      'aborted': 'Dinleme kesildi. Mikrofona yeniden dokunabilirsin.'
    };
    const speech = {
      available: !!Speech,
      start: callbacks => {
        if (!Speech) throw error('SPEECH_UNSUPPORTED', 'Bu tarayıcı sesle yazmayı desteklemiyor.');
        if (recognition) recognition.stop();
        const rec = new Speech(); recognition = rec; rec.lang = 'tr-TR'; rec.interimResults = true; rec.continuous = false;
        rec.onstart = () => { energy = 'listening'; emit(); if (callbacks && callbacks.onStart) callbacks.onStart(); };
        rec.onresult = event => { let text = '', final = true; for (let i = 0; i < event.results.length; i++) { text += event.results[i][0].transcript; final = final && event.results[i].isFinal; } if (callbacks && callbacks.onResult) callbacks.onResult({ text, final }); if (callbacks && callbacks.onTranscript) callbacks.onTranscript(text, final); };
        rec.onerror = event => { const code = String(event && event.error || 'unknown'); if (callbacks && callbacks.onError) callbacks.onError({ code, message: SPEECH_ERRORS[code] || ('Sesle yazma tamamlanamadı (' + code.slice(0, 40) + '). Mesajın taslakta korunuyor.') }); };
        rec.onend = () => { recognition = null; energy = null; emit(); if (callbacks && callbacks.onEnd) callbacks.onEnd(); };
        rec.start(); return { stop: () => rec.stop() };
      },
      stop: () => { if (recognition) recognition.stop(); }
    };
    const onlineHandler = () => { void resume().catch(() => {}); };
    if (typeof globalThis.addEventListener === 'function') { globalThis.addEventListener('online', onlineHandler); globalThis.addEventListener('offline', emit); }
    const timer = options.noTimers ? null : setInterval(() => { void loadRows().then(flush).catch(() => {}); }, 2000);
    const poll = options.noTimers ? null : setInterval(() => { if (!host.context().view || host.context().view === 'jarvis') void refresh(); }, 2000);
    const ready = loadRows().then(() => Promise.all([flush(), refresh(true)]));
    return { getSnapshot, getAccountKey, subscribe: fn => { listeners.add(fn); fn(getSnapshot()); return () => listeners.delete(fn); }, submitIntent, askArchive, askBrain, cancelJob, resolveIntent, drafts, attachments, speech, refresh: () => refresh(true), refreshDue: () => refresh(false), resume, ready, flush, dispose: () => { disposed = true; generation++; if (timer) clearInterval(timer); if (poll) clearInterval(poll); if (recognition) recognition.abort(); listeners.clear(); rows = []; serverRows = []; serverChatRows = []; if (typeof globalThis.removeEventListener === 'function') { globalThis.removeEventListener('online', onlineHandler); globalThis.removeEventListener('offline', emit); } } };
  }
  // Read dimensions BEFORE image decoding/canvas allocation. Reject unknown encodings.
  function readImageDimensions(bytes, mime) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (mime === 'image/png' && bytes.length >= 24 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a && view.getUint32(12) === 0x49484452) return { width: view.getUint32(16), height: view.getUint32(20) };
    if (mime === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8) {
      let at = 2;
      while (at + 4 <= bytes.length) { if (bytes[at] !== 0xff) return null; const marker = bytes[at + 1]; at += 2; if (marker === 0xd9 || marker === 0xda) return null; if (marker === 0xd8 || marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue; const length = view.getUint16(at); if (length < 2 || at + length > bytes.length) return null; if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 7) return { height: view.getUint16(at + 3), width: view.getUint16(at + 5) }; at += length; }
    }
    if (mime === 'image/webp' && bytes.length >= 30 && view.getUint32(0) === 0x52494646 && view.getUint32(8) === 0x57454250) {
      const type = view.getUint32(12);
      if (type === 0x56503858) return { width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16) };
      if (type === 0x56503820 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
      if (type === 0x5650384c && bytes[20] === 0x2f) { const b = view.getUint32(21, true); return { width: (b & 0x3fff) + 1, height: ((b >>> 14) & 0x3fff) + 1 }; }
    }
    return null;
  }
  return Object.freeze({ create, createHostPort, PROJECTS, readImageDimensions, canonical, classifyFailure, normalizeRoute, makeIDB, TEXT_EXTENSIONS, FILE_ACCEPT, CHAT_BUCKET, limits: Object.freeze({ MAX_TEXT, MAX_ITEMS, MAX_RAW, MAX_IMAGE, MAX_TOTAL, MAX_FILES, MAX_CHAT_FILES, MAX_CHAT_TOTAL, MAX_PDF, MAX_TEXT_FILE }) });
});
