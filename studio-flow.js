/* Studio workflow read model. No model request, worker startup, or implicit dispatch. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OryvonaStudioFlow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var PROJECTS = Object.freeze({ koza: 'KOZA', 'charm-drop': 'Charm Drop', 'forge-run': 'Forge Run', aeryo: 'AERYO', tupsper: 'Tuckspire', 'oryvona-panel': 'Oryvona Panel' });
  var PROVIDERS = Object.freeze({ codex: 'OpenAI Codex', claude: 'Claude Code · Kapalı', gemini: 'Google Antigravity' });
  var STAGES = Object.freeze(['development', 'review', 'test', 'package', 'delivery']);
  var LABELS = Object.freeze({ development: 'Geliştirme', test: 'Test', review: 'İnceleme', package: 'Paketleme', delivery: 'Teslim' });
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var HEAD = /^[a-f0-9]{40}$/i, HASH = /^[a-f0-9]{64}$/i;
  var DEFAULT_ORIGINS = Object.freeze(['https://denizdalga998-boop.github.io']);
  function object(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  function text(v, max) {
    return typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/(?:Bearer\s+|\b(?:sk-[a-z0-9_-]{12,}|AIza[a-z0-9_-]{20,}|gh[pousr]_[a-z0-9_]{15,}))\S*/gi, '[gizlendi]').slice(0, max || 500) : '';
  }
  function timestamp(v) { var n = typeof v === 'number' ? v : Date.parse(v || ''); return Number.isFinite(n) && n >= 0 ? n : null; }
  function recent(v, now, maxAge) { var at = timestamp(v); return at !== null && at <= now + 5000 && now - at <= maxAge; }
  function project(v) { var id = v === 'tuckspire' ? 'tupsper' : v; return typeof id === 'string' && Object.prototype.hasOwnProperty.call(PROJECTS, id) ? id : null; }
  function provider(v) { if (v && typeof v === 'object') v = v.provider; var id = v === 'openai' ? 'codex' : v === 'google' || v === 'antigravity' ? 'gemini' : v === 'anthropic' ? 'claude' : v; return Object.prototype.hasOwnProperty.call(PROVIDERS, id) ? id : null; }
  function stageId(value) { return ({ implement: 'development', build: 'package' })[value] || (STAGES.includes(value) ? value : null); }
  function flowStatus(value) { return ({ QUEUED: 'queued', IMPLEMENTING: 'running', REVIEWING: 'running', TESTING: 'running', BUILDING: 'running', VERIFYING_DELIVERY: 'running', USER_TEST_READY: 'ready', NEEDS_ATTENTION: 'blocked', CANCELLED: 'cancelled' })[value] || (/^WAITING_/.test(value || '') ? 'blocked' : ['queued', 'running', 'blocked', 'paused', 'failed', 'cancelled', 'ready', 'completed', 'delivered'].includes(value) ? value : 'unknown'); }
  function canonicalGates(value) { var gates = object(value); return { development: object(gates.development || gates.implement), test: object(gates.test), review: object(gates.review), package: object(gates.package || gates.build), delivery: object(gates.delivery) }; }
  function unwrap(v) { if (v && v.error) throw new Error('READ_FAILED'); return v && Object.prototype.hasOwnProperty.call(v, 'data') ? v.data : v; }
  function safeDelivery(flow, options) {
    options = options || {}; var d = object(flow.delivery), gates = canonicalGates(flow.gates), now = options.now == null ? Date.now() : options.now;
    var developer = provider(flow.developer), reviewer = provider(flow.reviewer);
    if (!['ready', 'completed', 'delivered'].includes(flowStatus(flow.status)) || stageId(flow.stage) !== 'delivery' || !project(flow.projectId) || !developer || !reviewer || developer === reviewer || !['codex','gemini'].includes(developer) || !['codex','gemini'].includes(reviewer)) return null;
    if (!HEAD.test(flow.headSha || '') || d.verified !== true || d.headSha !== flow.headSha || d.projectId !== flow.projectId || !HASH.test(d.sha256 || '') || !Number.isSafeInteger(d.bytes) || d.bytes < 1 || !text(d.receiptId, 160) || !recent(d.verifiedAt, now, 365 * 86400000)) return null;
    if (!STAGES.every(function (s) { var g = object(gates[s]); return g.status === 'PASS' && g.headSha === flow.headSha && (s !== 'review' || provider(g.provider) === reviewer); })) return null;
    if (typeof d.url !== 'string' || d.url.length > 1800 || /[\s\\]/.test(d.url) || /%(?:2e|2f|5c|00|0a|0d)/i.test(d.url)) return null;
    try {
      var url = new URL(d.url), origins = Array.isArray(options.allowedArtifactOrigins) ? options.allowedArtifactOrigins : DEFAULT_ORIGINS;
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !origins.includes(url.origin) || !/\.(?:apk|aab|zip|html)$/i.test(url.pathname)) return null;
      return Object.freeze({ url: url.href, sha256: d.sha256.toLowerCase(), bytes: d.bytes, headSha: d.headSha.toLowerCase(), receiptId: text(d.receiptId, 160) });
    } catch (_) { return null; }
  }
  function normalizeFlow(row, options) {
    row = object(row); var receipt = object(row.receipt), execution = object(row.execution);
    var f = object(row.studioFlow || execution.studioFlow || receipt.studioFlow);
    if (f.schemaVersion !== 1) return null;
    var pid = project(row.requested_project || row.projectId || row.project_id || f.projectId);
    if (!pid || project(f.projectId) !== pid) return null;
    var id = text(row.request_id || row.id || f.id, 160); if (!id) return null;
    var stage = stageId(f.stage || f.phase);
    var result = { id: id, projectId: pid, projectLabel: PROJECTS[pid], title: text(row.title || row.text || f.title, 220), headSha: HEAD.test(f.headSha || '') ? f.headSha.toLowerCase() : null,
      lastEditor: provider(f.lastEditor), developer: provider(f.developer), reviewer: provider(f.reviewer), stage: stage,
      status: flowStatus(f.status || f.state),
      waitingReason: text(f.waitingReason, 400), updatedAt: timestamp(f.updatedAt || row.updated_at), steps: [], delivery: null };
    var gates = canonicalGates(f.gates);
    result.steps = STAGES.map(function (s) {
      var gate = object(gates[s]);
      var valid = result.headSha && gate.headSha === result.headSha && gate.status === 'PASS';
      if (s === 'review') valid = valid && result.reviewer && result.developer && result.reviewer !== result.developer && provider(gate.provider) === result.reviewer;
      return { id: s, label: LABELS[s], state: valid ? 'passed' : s === stage && result.status === 'running' ? 'running' : s === stage && ['blocked', 'paused', 'failed'].includes(result.status) ? 'blocked' : 'pending' };
    });
    result.delivery = safeDelivery(Object.assign({}, f, { projectId: pid, stage: stage }), options);
    if (['ready', 'completed', 'delivered'].includes(result.status) && !result.delivery) {
      result.status = 'evidence_pending';
      result.waitingReason = 'Teslim kaydı bekleniyor; kaynak sürümü, bağımsız inceleme ve paket kapıları birlikte doğrulanmadı.';
    }
    if (result.delivery) result.steps[result.steps.length - 1].state = 'passed';
    return result;
  }
  function normalize(input, options) {
    options = options || {}; input = object(input); var now = options.now == null ? Date.now() : options.now;
    var connection = object(input.connection), c = object(connection.studioFlow || input.studioFlow); if(c.schemaVersion !== 1)c = {};
    var conversation = object(c.conversation), studioMode = connection.studioMode === true;
    var isGroq = conversation.provider === 'groq' && conversation.transport === 'groq-api';
    var isGoogle = ['gemini','google'].includes(conversation.provider) && conversation.transport === 'google-ai-studio-api';
    var apiReady = (isGroq || isGoogle) && ['ready','connected'].includes(conversation.status) && recent(conversation.observedAt || conversation.verifiedAt, now, 120000);
    var brain = { state: apiReady ? 'connected' : 'setup_pending', label: isGroq ? (apiReady ? 'Groq sohbeti bağlı' : 'Groq sohbet ayarı bekleniyor') : (apiReady ? 'Google AI Studio sohbeti bağlı' : 'Google AI Studio sohbet ayarı bekleniyor'), provider: apiReady ? (isGroq ? 'groq' : 'gemini') : null,
      model: apiReady ? text(conversation.model, 100) : null, modelVerified: apiReady && (conversation.model_verified === true || conversation.modelVerified === true), detail: isGroq ? (apiReady ? 'Günlük sohbet Groq (openai/gpt-oss-120b · düşünme: düşük) üzerinden; ağır işçiler yalnız açık görevlerde çalışır.' : 'GROQ_API_KEY tek sunucu ayarından girilir; sohbette Codex geri dönüşü kullanılmaz.') : (apiReady ? 'Günlük sohbet Gemini API üzerinden; ağır işçiler yalnız açık görevlerde çalışır.' : 'GEMINI_API_KEY tek sunucu ayarından girilir; sohbette Codex geri dönüşü kullanılmaz.') };
    var workers = ['codex', 'claude', 'gemini'].map(function (id) {
      var raw = (Array.isArray(c.workers) ? c.workers : []).find(function (w) { return provider(object(w).provider) === id; }) || {};
      var fresh = studioMode && recent(raw.lastSeen, now, 120000), state = id === 'claude' || raw.enabled === false ? 'disabled' : fresh && ['ready', 'running', 'busy'].includes(raw.state) ? raw.state : fresh && ['auth_required', 'quota_wait', 'missing', 'disabled', 'setup_pending'].includes(raw.state) ? raw.state : 'unknown';
      return { provider: id, label: PROVIDERS[id], state: state, online: ['ready', 'running', 'busy'].includes(state), detail: ({ ready: 'Hazır', running: 'Çalışıyor', busy: 'Çalışıyor', auth_required: 'Giriş bekliyor', quota_wait: 'Kota bekliyor', missing: 'Kurulum bekliyor', disabled: 'Kapalı', setup_pending: 'Kurulum bekliyor', unknown: 'Güncel sinyal yok' })[state] };
    });
    var rows = Array.isArray(input.rows) ? input.rows : [];
    var flows = rows.slice(0, 50).map(function (row) { return normalizeFlow(row, options); }).filter(Boolean);
    return { conversation: brain, workers: workers, flows: flows, readState: text(input.readState, 80) || 'unknown', accountKey: text(input.accountKey, 100) || null };
  }
  function render(doc, target, snapshot, options) {
    options = options || {}; if (!doc || !target) return null;
    function node(tag, cls, value) { var n = doc.createElement(tag); if (cls) n.className = cls; if (value != null) n.textContent = value; return n; }
    var section = node('section', 'sf-root'); section.setAttribute('aria-label', 'Jarvis ve iki etkin işçi');
    var brain = node('div', 'sf-brain'), name = node('strong', 'sf-brain-name', snapshot.conversation.label);
    brain.dataset.state = snapshot.conversation.state; brain.append(name); section.append(brain);
    var workers = node('div', 'sf-workers'); workers.setAttribute('aria-label', 'Gerçek işçi bağlantıları');
    snapshot.workers.forEach(function (worker) { var n = node('div', 'sf-worker'); n.dataset.state = worker.state; n.append(node('span', 'sf-worker-name', worker.state === 'disabled' ? worker.label.replace(/ · Kapalı$/, '') : worker.label), node('span', 'sf-worker-state', worker.detail)); workers.append(n); }); section.append(workers);
    if (options.compact !== true || snapshot.flows.length) {
      var details = node('details', 'sf-flows'); details.open = options.compact !== true;
      details.append(node('summary', '', 'İş akışı · ' + snapshot.flows.length));
      var list = node('div', 'sf-flow-list');
      snapshot.flows.slice(0, options.compact === true ? 3 : 20).forEach(function (flow) {
        var card = node('article', 'sf-card'); card.dataset.flowId = flow.id;
        var top = node('div', 'sf-card-head'); top.append(node('strong', '', flow.projectLabel), node('span', 'sf-stage', flow.status === 'evidence_pending' ? 'Kanıt bekleniyor' : flow.delivery ? 'Teste hazır' : LABELS[flow.stage] || 'Sıra bekleniyor')); card.append(top);
        if (flow.title) card.append(node('p', 'sf-task', flow.title));
        var owners = node('p', 'sf-owners', 'Son düzenleyen: ' + (PROVIDERS[flow.lastEditor] || 'Kayıt bekleniyor') + ' · İşçi: ' + (PROVIDERS[flow.developer] || 'Atanmadı') + ' · Kontrol: ' + (PROVIDERS[flow.reviewer] || 'Atanmadı')); card.append(owners);
        var steps = node('ol', 'sf-steps'); steps.setAttribute('aria-label', 'Doğrulanmış aşamalar');
        flow.steps.forEach(function (step) { var item = node('li', '', step.label); item.dataset.state = step.state; item.setAttribute('aria-label', step.label + ': ' + ({ passed: 'Geçti', running: 'Çalışıyor', blocked: 'Bekliyor', pending: 'Henüz doğrulanmadı' })[step.state]); steps.append(item); }); card.append(steps);
        if (flow.waitingReason) card.append(node('p', 'sf-waiting', flow.waitingReason));
        if (flow.delivery) { var a = node('a', 'sf-test', 'Test Et'); a.href = flow.delivery.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.setAttribute('aria-label', flow.projectLabel + ' doğrulanmış paketi aç'); card.append(a); }
        list.append(card);
      });
      if (!snapshot.flows.length) list.append(node('p', 'sf-empty', 'Bu zincire ait iş kaydı henüz yok. Mevcut işler aşağıda görünmeye devam eder.'));
      details.append(list); section.append(details);
    }
    target.replaceChildren(section); return section;
  }
  function create(options) {
    options = options || {}; var host = options.host, doc = options.document || (typeof document !== 'undefined' ? document : null), win = doc && doc.defaultView || (typeof window !== 'undefined' ? window : null), clock = options.clock || Date.now;
    if (!host || typeof host.context !== 'function' || typeof host.request !== 'function') throw new TypeError('Authenticated studio host required');
    var disposed = false, epoch = 0, inflight = null, account = null, proposal = null, submitBusy = false, observer = null, timer = null, listeners = [], containers = new Map(), observedInput = {}, snapshot = normalize({}, { now: clock() });
    function context() { return object(host.context()); }
    function identity() { var c = context(); return c.authenticated === true && c.isOwner === true && c.demo !== true && UUID.test(c.userId || '') ? c.userId : null; }
    function same(owner, ticket) { return !disposed && owner && owner === account && owner === identity() && ticket === epoch; }
    function build() { snapshot = normalize(Object.assign({}, observedInput, { accountKey: account }), { now: clock(), allowedArtifactOrigins: options.allowedArtifactOrigins }); return snapshot; }
    function syncAccount() { var next = identity(); if (next !== account) { account = next; epoch++; inflight = null; proposal = null; submitBusy = false; observedInput = {}; build(); containers.forEach(function (container) { container.replaceChildren(); }); } return account; }
    function active() { var c = context(); return !doc || (!doc.hidden && ['jarvis', 'feed'].includes(c.view)); }
    function mountPoint(id, selector) { if (!doc) return null; var root = doc.getElementById(id), parent = root && (selector ? root.querySelector(selector) : root); if (!parent) return null; var record = containers.get(id); if (!record || record.parentNode !== parent) { if (record) record.remove(); record = doc.createElement('div'); record.className = 'sf-mount'; record.setAttribute('data-studio-flow', id); parent.insertBefore(record, parent.firstChild); containers.set(id, record); } return record; }
    function renderProposal(target) {
      if (!proposal || !target || !doc) return;
      var box = doc.createElement('section'); box.className = 'sf-proposal'; var title = doc.createElement('strong'); title.textContent = PROJECTS[proposal.projectId] + ' · İş isteği';
      var body = doc.createElement('p'); body.textContent = proposal.text;
      var button = doc.createElement('button'); button.type = 'button'; button.textContent = submitBusy ? 'Gönderiliyor…' : 'İş olarak gönder'; button.disabled = submitBusy;
      var status = doc.createElement('p'); status.className = 'sf-submit-status'; status.setAttribute('role', 'status'); status.textContent = proposal.message || 'Yalnız bu düğmeye bastığında iş kuyruğuna gönderilir.';
      button.addEventListener('click', function () { requestWork(proposal).then(function (answer) { if (disposed || !proposal) return; proposal.message = answer.accepted ? 'İş isteği kuyruğa kaydedildi.' : answer.message; paint(); }); });
      box.append(title, body, button, status); target.append(box);
    }
    function paint() {
      syncAccount(); build(); if (!doc || disposed || !account) return;
      [['jarvisWorld', '.jw-thread', true], ['studioWorld-feed', null, false]].forEach(function (item) { var point = mountPoint(item[0], item[1]); if (!point) return; render(doc, point, snapshot, { compact: item[2] }); if (item[2]) renderProposal(point); });
    }
    async function refresh() {
      var owner = syncAccount(), ticket = epoch; paint(); if (disposed || !owner || !active()) return snapshot; if (inflight) return inflight;
      var pending = Promise.resolve().then(function () { return Promise.all([host.request('getConnection', { expectedUserId: owner }), host.request('listIntents', { expectedUserId: owner, limit: 50 })]); }).then(function (responses) {
        if (!same(owner, ticket)) return snapshot;
        var connection = unwrap(responses[0]), rows = unwrap(responses[1]);
        if (rows && !Array.isArray(rows)) rows = rows.rows;
        observedInput = { accountKey: owner, connection: connection, rows: rows, readState: 'ready' }; paint(); return snapshot;
      }).catch(function () { if (same(owner, ticket)) { observedInput = { accountKey: owner, readState: 'unavailable' }; paint(); } return snapshot; }).finally(function () { if (inflight === pending) inflight = null; });
      inflight = pending; return pending;
    }
    function proposeWork(payload) {
      if (disposed) return { accepted: false, message: 'İş görünümü kapalı.' };
      var owner = syncAccount(); payload = object(payload); var pid = project(payload.projectId), body = typeof payload.text === 'string' ? payload.text.trim() : '';
      if (!owner || !pid || !body || body.length > 12000 || !UUID.test(payload.sourceRequestId || '')) return { accepted: false, message: 'İş hedefi veya kaynak sohbet kaydı doğrulanmadı.' };
      proposal = { projectId: pid, text: body, sourceRequestId: payload.sourceRequestId, requestId: UUID.test(payload.requestId || '') ? payload.requestId : null, owner: owner, message: '' }; paint(); return { accepted: true, queued: false };
    }
    async function requestWork(payload) {
      if (disposed) return { accepted: false, message: 'İş görünümü kapalı.' };
      var owner = syncAccount(), ticket = epoch; payload = object(payload); var pid = project(payload.projectId), body = typeof payload.text === 'string' ? payload.text.trim() : '';
      if (!owner || !active() || context().view !== 'jarvis') return { accepted: false, message: 'İşi göndermek için sahip hesabıyla Jarvis’i aç.' };
      if (!pid || !body || body.length > 12000 || !UUID.test(payload.sourceRequestId || '')) return { accepted: false, message: 'Hedef proje ve kaynak sohbet kaydı gerekli.' };
      if (submitBusy) return { accepted: false, message: 'Bu istek gönderiliyor.' };
      var id = payload.requestId; if (!UUID.test(id || '')) { if (!win || !win.crypto || typeof win.crypto.randomUUID !== 'function') return { accepted: false, message: 'Güvenli istek kimliği üretilemedi.' }; id = win.crypto.randomUUID(); if (proposal) proposal.requestId = id; }
      var request = Object.freeze({ requestId: id, projectId: pid, text: body, sourceRequestId: payload.sourceRequestId, expectedUserId: owner, pipeline: 'development-test-review-package-delivery' });
      submitBusy = true; paint();
      try {
        var answer;
        if (typeof options.onWork === 'function') answer = await options.onWork(request);
        else {
          var response = null, eventType = win && win.CustomEvent || (typeof CustomEvent !== 'undefined' ? CustomEvent : null);
          if (!doc || !eventType) throw new Error('DISPATCH_UNAVAILABLE');
          var detail = Object.assign({}, request, { respondWith: function (promise) { if (response !== null) throw new Error('DUPLICATE_WORK_HANDLER'); response = Promise.resolve(promise); } });
          doc.dispatchEvent(new eventType('oryvona:studio-work-request', { detail: detail }));
          if (response === null) throw new Error('DISPATCH_UNAVAILABLE'); answer = await response;
        }
        if (!same(owner, ticket)) return { accepted: false, message: 'Hesap değişti; yeni hesaba sonuç taşınmadı.' };
        if (!answer || answer.accepted !== true || (answer.requestId || answer.commandId) !== id) return { accepted: false, message: 'İş kuyruğa alındı kaydı doğrulanmadı. Aynı istek kimliğiyle tekrar deneyebilirsin.' };
        return { accepted: true, requestId: id };
      } catch (_) { return { accepted: false, message: 'İş kuyruğu bağlantısı henüz hazır değil. Metin gönderilmiş kabul edilmedi.' }; }
      finally { if (same(owner, ticket)) { submitBusy = false; paint(); } }
    }
    function listen(target, name, fn) { if (!target || typeof target.addEventListener !== 'function') return; target.addEventListener(name, fn); listeners.push(function () { target.removeEventListener(name, fn); }); }
    function changed() { syncAccount(); paint(); if (active() && options.autoRefresh !== false) void refresh(); }
    listen(doc, 'oryvona:studio-context-change', changed); listen(doc, 'oryvona:view-change', changed); listen(doc, 'oryvona:ready', changed); listen(doc, 'visibilitychange', changed);
    // Observe only the two mount roots, not canvas frames or orb style mutations.
    if (doc && win && typeof win.MutationObserver === 'function') { observer = new win.MutationObserver(function (records) { var structural = records.some(function (record) { return record.target && (record.target.id === 'jarvisWorld' || record.target.id === 'studioWorld-feed'); }); if (structural) paint(); }); ['jarvisWorld', 'studioWorld-feed'].forEach(function (id) { var root = doc.getElementById(id); if (root) observer.observe(root, { childList: true }); }); }
    if (win && typeof win.setInterval === 'function' && options.autoRefresh !== false) timer = win.setInterval(function () { if (active()) void refresh(); }, 30000);
    syncAccount(); paint();
    return Object.freeze({ refresh: refresh, getSnapshot: function () { syncAccount(); build(); return JSON.parse(JSON.stringify(snapshot)); }, proposeWork: proposeWork, requestWork: requestWork, dispose: function () { if (disposed) return; disposed = true; epoch++; proposal = null; inflight = null; observedInput = {}; build(); if (timer !== null && win) win.clearInterval(timer); if (observer) observer.disconnect(); listeners.forEach(function (off) { off(); }); containers.forEach(function (container) { container.remove(); }); containers.clear(); } });
  }
  return Object.freeze({ create: create, normalize: normalize, normalizeFlow: normalizeFlow, safeDelivery: safeDelivery, render: render, DEFAULT_ORIGINS: DEFAULT_ORIGINS });
});
