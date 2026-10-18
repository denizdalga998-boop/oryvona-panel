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
  function createHostPort(callbacks) {
    const map = { getConnection: callbacks.getConnection, submitIntent: callbacks.submitIntent, listIntents: callbacks.listIntents, cancelIntent: callbacks.cancelIntent, uploadEvidence: callbacks.uploadEvidence };
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
    let ownerId = null, generation = 0, disposed = false, revision = 0, refreshSequence = 0, rows = [], serverRows = [], authPaused = false, refreshBlocked = false, refreshError = '', inflight = null;
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
      if (next !== ownerId) { ownerId = next; generation++; rows = []; serverRows = []; authPaused = false; refreshBlocked = false; refreshError = ''; energy = null; connectionInfo = null; if (recognition) recognition.abort(); emit(); }
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
    async function request(operation, payload, expected) { guardedContext(expected); const answer = await host.request(operation, Object.assign({}, payload, { expectedUserId: expected })); guardedContext(expected); return normalizeResult(answer, operation === 'listIntents'); }
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
        const terminalRemote = remote && ['completed','failed','cancelled'].includes(remote.status);
        if (remote?.receipt?.status === 'DURABLY_QUEUED' && !terminalRemote) statusText = 'DJ-KABIN izole kalıcı kuyruğa aldı · ajan başlatılmadı';
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
        jobs.push({ id, projectId, title: (row.text || '').slice(0, 90), status, statusText, canCancel: !['completed', 'failed', 'cancelled'].includes(status), ...(remote && remote.worker_id ? { expert: remote.worker_id } : {}), ...(remote && remote.workspace_label ? { workspaceLabel: remote.workspace_label } : {}) });
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
        const fingerprint = await hash(canonical({ text: payload.text, projectId, attachments })); guardedContext(id);
        const row = { key: key(id, requestId), ownerId: id, requestId, text: payload.text, projectId, attachments, fingerprint, status: 'pending', createdAt: now(), updatedAt: now(), attempts: 0, nextAttemptAt: 0 };
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
          const remote = await request(cancelling ? 'cancelIntent' : 'submitIntent', cancelling ? { requestId: row.requestId } : { requestId: row.requestId, text: row.text, requestedProject: row.projectId, attachments: row.attachments }, id);
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
    async function refresh() {
      await syncAccount(); const id = ownerId;
      if (!id || !online() || !visible() || disposed || authPaused || refreshBlocked) return;
      const sequence = ++refreshSequence, epoch = generation;
      try { const [result, connection] = await Promise.all([request('listIntents', { limit: 50 }, id), request('getConnection', {}, id)]); if (sequence !== refreshSequence || epoch !== generation) return; connectionInfo = connection; const incoming = Array.isArray(result) ? result : result && result.rows || []; serverRows = incoming.map(row => newerRemote(serverRows.find(old => (old.request_id || old.requestId) === (row.request_id || row.requestId)), row)); refreshError = ''; emit(); }
      catch (e) { if (sequence === refreshSequence && epoch === generation && contextOwner() === id) { const kind = classifyFailure(e); if (kind === 'auth') authPaused = true; if (kind === 'permanent') refreshBlocked = true; refreshError = kind === 'permanent' ? 'Sunucu kuyruğu doğrulanamadı · istekler cihazda korunuyor' : 'Sunucu durumu alınamadı · cihazdaki kayıt korunuyor'; emit(); } }
    }
    async function resume() {
      await syncAccount(); const id = requireOwner(); authPaused = false; refreshBlocked = false;
      for (const row of await store.all('outbox', id)) if (row.status === 'auth_paused') await store.put('outbox', Object.assign({}, row, { status: row.cancelRequested ? 'cancel_pending' : 'pending', nextAttemptAt: 0 }));
      await loadRows(); await flush(); await refresh();
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
      const aliases = { koza: boundary('koza'), 'charm-drop': boundary('charm[ -]?drop'), 'forge-run': boundary('forge[ -]?run'), aeryo: boundary('aeryo'), tupsper: boundary('tupsper'), 'oryvona-panel': boundary('oryvona[ -]?panel|panel|paneli|panelde|panelden|panelin|panelinde|jarvis|uygulama|uygulamayı|uygulamayi|uygulamada|uygulamaya') };
      const mentioned = PROJECTS.filter(p => aliases[p].test(text));
      if (scope && !PROJECTS.includes(scope)) return { status: 'rejected', message: 'Geçersiz proje kapsamı.' };
      if (mentioned.length > 1 || (scope && mentioned.length === 1 && mentioned[0] !== scope)) return { status: 'clarify', question: 'Bu isteği hangi tek projeye göndereyim?', candidates: mentioned.length ? mentioned : PROJECTS.slice() };
      if (scope || mentioned.length === 1) return { status: 'ready', projectId: scope || mentioned[0] };
      return { status: 'clarify', question: 'İsteğin hangi projeye ait?', candidates: PROJECTS.slice() };
    }
    const drafts = {
      load: async scope => { await syncAccount(); if (!ownerId || !store) return { text: '', attachments: [] }; const id = ownerId, gen = generation, row = await store.get('drafts', key(id, scope || 'studio')); return gen === generation && id === contextOwner() && row ? { text: row.text, attachments: row.attachments } : { text: '', attachments: [] }; },
      save: async (scope, value) => { requireAccountKey(value.accountKey); await syncAccount(); const id = requireOwner(); requireAccountKey(value.accountKey); if (scope != null && !PROJECTS.includes(scope)) throw error('PROJECT_REQUIRED', 'Geçersiz kapsam.'); if (typeof value.text !== 'string' || value.text.length > MAX_TEXT) throw error('TEXT_INVALID', 'Taslak çok uzun.'); if (!Array.isArray(value.attachments || []) || (value.attachments || []).length > MAX_FILES) throw error('ATTACHMENTS_INVALID','En fazla üç görsel.'); await store.put('drafts', { key: key(id, scope || 'studio'), ownerId: id, text: value.text, attachments: (value.attachments || []).map(x => ({ id: x.id, name: String(x.name || '').slice(0,124), mime: x.mime, size: x.size })), updatedAt: now() }); guardedContext(id); }
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
    const attachments = {
      choose: async args => {
        requireAccountKey(args && args.accountKey);
        await syncAccount(); const id = requireOwner();
        requireAccountKey(args.accountKey);
        if (connectionInfo?.attachmentsAvailable === false) throw error('EVIDENCE_UNAVAILABLE', 'Görsel yükleme henüz hazır değil. Metinle komut gönderebilirsin.');
        if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') throw error('IMAGE_UNSUPPORTED', 'Bu tarayıcı görsel eklemeyi desteklemiyor.');
        const limit = Math.min(MAX_FILES, Math.max(1, args && args.maxFiles || MAX_FILES));
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
    const speech = {
      available: !!Speech,
      start: callbacks => {
        if (!Speech) throw error('SPEECH_UNSUPPORTED', 'Bu tarayıcı sesle yazmayı desteklemiyor.');
        if (recognition) recognition.stop();
        const rec = new Speech(); recognition = rec; rec.lang = 'tr-TR'; rec.interimResults = true; rec.continuous = false;
        rec.onstart = () => { energy = 'listening'; emit(); if (callbacks && callbacks.onStart) callbacks.onStart(); };
        rec.onresult = event => { let text = '', final = true; for (let i = 0; i < event.results.length; i++) { text += event.results[i][0].transcript; final = final && event.results[i].isFinal; } if (callbacks && callbacks.onResult) callbacks.onResult({ text, final }); if (callbacks && callbacks.onTranscript) callbacks.onTranscript(text, final); };
        rec.onerror = event => { if (callbacks && callbacks.onError) callbacks.onError({ code: event.error, message: event.error === 'not-allowed' ? 'Mikrofon izni verilmedi.' : 'Sesle yazma tamamlanamadı.' }); };
        rec.onend = () => { recognition = null; energy = null; emit(); if (callbacks && callbacks.onEnd) callbacks.onEnd(); };
        rec.start(); return { stop: () => rec.stop() };
      },
      stop: () => { if (recognition) recognition.stop(); }
    };
    const onlineHandler = () => { void resume().catch(() => {}); };
    if (typeof globalThis.addEventListener === 'function') { globalThis.addEventListener('online', onlineHandler); globalThis.addEventListener('offline', emit); }
    const timer = options.noTimers ? null : setInterval(() => { void loadRows().then(flush).catch(() => {}); }, 2000);
    const poll = options.noTimers ? null : setInterval(() => { if (!host.context().view || host.context().view === 'jarvis') void refresh(); }, 2000);
    const ready = loadRows().then(() => Promise.all([flush(), refresh()]));
    return { getSnapshot, getAccountKey, subscribe: fn => { listeners.add(fn); fn(getSnapshot()); return () => listeners.delete(fn); }, submitIntent, cancelJob, resolveIntent, drafts, attachments, speech, refresh, resume, ready, flush, dispose: () => { disposed = true; generation++; if (timer) clearInterval(timer); if (poll) clearInterval(poll); if (recognition) recognition.abort(); listeners.clear(); rows = []; serverRows = []; if (typeof globalThis.removeEventListener === 'function') { globalThis.removeEventListener('online', onlineHandler); globalThis.removeEventListener('offline', emit); } } };
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
  return Object.freeze({ create, createHostPort, PROJECTS, readImageDimensions, canonical, classifyFailure, makeIDB, limits: Object.freeze({ MAX_TEXT, MAX_ITEMS, MAX_RAW, MAX_IMAGE, MAX_TOTAL, MAX_FILES }) });
});
