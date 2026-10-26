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
  var PRODUCT_SOURCE_POLICY = 'oryvona-panel-source-v1';
  var LABELS = Object.freeze({ development: 'Geliştirme', test: 'Test', review: 'İnceleme', package: 'Paketleme', delivery: 'Teslim' });
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var PUBLIC_ID = /^[a-z][a-z0-9-]{0,63}$/, SESSION = /^(?:[0-9a-f-]{36}|(?:thread|session|conversation)_[a-zA-Z0-9_-]{8,100})$/i;
  var WORKER_LABELS = Object.freeze({ not_started: 'Başlatılmadı', queued: 'Sırada', starting: 'Başlatılıyor', leased: 'İş ayrıldı', running: 'Çalışıyor', busy: 'Çalışıyor', paused: 'Duraklatıldı', quota_wait: 'Kota bekliyor', auth_required: 'Giriş bekliyor', blocked: 'Bekliyor', failed: 'Başarısız', completed: 'Tamamlandı', succeeded: 'Tamamlandı', cancelled: 'İptal edildi', idle: 'Boşta', waiting: 'Bekliyor', disabled: 'Kapalı', unknown: 'Güncel sinyal yok' });
  var HEAD = /^[a-f0-9]{40}$/i, HASH = /^[a-f0-9]{64}$/i;
  var DEFAULT_ORIGINS = Object.freeze(['https://denizdalga998-boop.github.io', 'https://dj-kabin.tail0c7f5d.ts.net', 'https://dj-kabin.tail0c7f5d.ts.net:8443']);
  function object(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  function text(v, max) {
    return typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/(?:Bearer\s+\S+|\b(?:sk-|gsk_|AIza|gh[pousr]_)[a-z0-9_-]{12,}|eyJ[\w-]+\.[\w-]+\.[\w-]+)/gi, '[gizlendi]').slice(0, max || 500) : '';
  }
  function timestamp(v) { var n = typeof v === 'number' ? v : Date.parse(v || ''); return Number.isFinite(n) && n >= 0 ? n : null; }
  function recent(v, now, maxAge) { var at = timestamp(v); return at !== null && at <= now + 5000 && now - at <= maxAge; }
  function project(v) { var id = v === 'tuckspire' ? 'tupsper' : v; return typeof id === 'string' && Object.prototype.hasOwnProperty.call(PROJECTS, id) ? id : null; }
  function provider(v) { if (v && typeof v === 'object') v = v.provider; var id = v === 'openai' ? 'codex' : v === 'google' || v === 'antigravity' ? 'gemini' : v === 'anthropic' ? 'claude' : v; return Object.prototype.hasOwnProperty.call(PROVIDERS, id) ? id : null; }
  function stageId(value) { return ({ implement: 'development', build: 'package' })[value] || (STAGES.includes(value) ? value : null); }
  function flowStatus(value) { return ({ QUEUED: 'queued', IMPLEMENTING: 'running', REVIEWING: 'running', TESTING: 'running', BUILDING: 'running', VERIFYING_DELIVERY: 'running', USER_TEST_READY: 'ready', SOURCE_TEST_READY: 'source_ready', NEEDS_ATTENTION: 'blocked', CANCELLED: 'cancelled' })[value] || (/^WAITING_/.test(value || '') ? 'blocked' : ['queued', 'running', 'blocked', 'paused', 'failed', 'cancelled', 'ready', 'completed', 'delivered', 'source_ready'].includes(value) ? value : 'unknown'); }
  function canonicalGates(value) { var gates = object(value); return { development: object(gates.development || gates.implement), test: object(gates.test), review: object(gates.review), package: object(gates.package || gates.build), delivery: object(gates.delivery) }; }
  function unwrap(v) { if (v && v.error) throw new Error('READ_FAILED'); return v && Object.prototype.hasOwnProperty.call(v, 'data') ? v.data : v; }
  function normalizeIndependent(value, options) {
    options = options || {}; value = object(value); var now = options.now == null ? Date.now() : options.now;
    if (value.schemaVersion !== 1) return null;
    var fresh = options.studioMode === true && recent(value.observedAt, now, 120000), seen = new Set();
    var roster = (Array.isArray(value.roster) ? value.roster : []).slice(0, 24).map(function (raw) {
      raw = object(raw); var id = text(raw.id, 64), p = provider(raw.provider); if (!PUBLIC_ID.test(id) || !p || seen.has(id)) return null; seen.add(id);
      return { id: id, label: text(raw.label, 100) || id, specialty: text(raw.specialty, 240), provider: p, enabled: raw.enabled === true };
    }).filter(Boolean);
    seen = new Set();
    var workers = (Array.isArray(value.workers) ? value.workers : []).slice(0, 40).map(function (raw) {
      raw = object(raw); var template = roster.find(function (item) { return item.id === raw.templateId; }), p = provider(raw.provider);
      if (!UUID.test(raw.id || '') || seen.has(raw.id) || !template || !p || !PUBLIC_ID.test(raw.projectId || '')) return null; seen.add(raw.id);
      var state = fresh ? Object.prototype.hasOwnProperty.call(WORKER_LABELS, raw.state) ? raw.state : 'unknown' : 'unknown';
      var operation = raw.operation === undefined ? 'review' : ['implement','fix','review','test'].includes(raw.operation) ? raw.operation : 'unknown';
      var followupAllowed = ['implement','fix','review'].includes(operation) && (raw.followupAllowed === true || (raw.followupAllowed === undefined && operation === 'review'));
      var cancelRequestId = UUID.test(raw.cancelRequestId || '') ? raw.cancelRequestId : null;
      return { id: raw.id, templateId: template.id, label: text(raw.label, 100) || template.label, specialty: text(raw.specialty, 240) || template.specialty, provider: p, projectId: raw.projectId, projectLabel: PROJECTS[raw.projectId] || raw.projectId,
        jobId: UUID.test(raw.jobId || '') ? raw.jobId : null, sessionId: SESSION.test(raw.sessionId || '') ? raw.sessionId : null, state: state, operation: operation, updatedAt: timestamp(raw.updatedAt), workspaceLabel: text(raw.workspaceLabel, 160), legacy: raw.legacy === true, historyLimited: raw.historyLimited === true || (Array.isArray(raw.turns) && raw.turns.length > 12),
        canFollowup: fresh && template.enabled && raw.providerEnabled !== false && raw.legacy !== true && followupAllowed && SESSION.test(raw.sessionId || '') && ['completed','succeeded'].includes(state),
        cancelRequestId: cancelRequestId, cancelAllowed: Boolean(fresh && template.enabled && raw.providerEnabled !== false && raw.legacy !== true && raw.cancelAllowed === true && cancelRequestId && ['queued','starting','running'].includes(state)),
        turns: (Array.isArray(raw.turns) ? raw.turns : []).slice(-12).map(function (turn) { turn = object(turn); if (!UUID.test(turn.requestId || '')) return null; return { requestId: turn.requestId, instruction: text(turn.instruction, 2000), result: text(turn.result, 4000), state: Object.prototype.hasOwnProperty.call(WORKER_LABELS, turn.state) ? turn.state : 'unknown', updatedAt: timestamp(turn.updatedAt) }; }).filter(Boolean) };
    }).filter(Boolean);
    var capacity = Number.isSafeInteger(value.maxActiveWorkers) && value.maxActiveWorkers >= 1 && value.maxActiveWorkers <= 8 ? value.maxActiveWorkers : 2;
    return { fresh: fresh, maxActiveWorkers: capacity, activeCount: fresh && Number.isSafeInteger(value.activeCount) && value.activeCount >= 0 ? Math.min(40, value.activeCount) : null, roster: roster, workers: workers };
  }
  function safeDelivery(flow, options) {
    options = options || {}; var d = object(flow.delivery), gates = canonicalGates(flow.gates), now = options.now == null ? Date.now() : options.now;
    if (flow.qualityPolicy === PRODUCT_SOURCE_POLICY) return null;
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
    var rawWait = text(f.waitingReason, 400);
    var rowNote = text(row.note_tr || row.note || (row.result && row.result.note_tr), 400);
    var waitingReason = /^(?:IMPLEMENT|REVIEW|TEST|BUILD|DELIVERY)_FAILED$|^REVISION_LIMIT_REACHED$/.test(rawWait) && rowNote && !/aşaması:\s*NEEDS_ATTENTION$/i.test(rowNote)
      ? rowNote + ' (' + rawWait + ')'
      : rawWait;
    var productPolicy = pid === 'oryvona-panel' && f.qualityPolicy === PRODUCT_SOURCE_POLICY;
    var requiredStages = productPolicy ? ['development', 'review', 'test'] : STAGES;
    var result = { id: id, projectId: pid, projectLabel: PROJECTS[pid], title: text(row.title || row.text || f.title, 220), headSha: HEAD.test(f.headSha || '') ? f.headSha.toLowerCase() : null,
      lastEditor: provider(f.lastEditor), developer: provider(f.developer), reviewer: provider(f.reviewer), stage: stage,
      status: flowStatus(f.status || f.state),
      waitingReason: waitingReason, updatedAt: timestamp(f.updatedAt || row.updated_at), qualityPolicy: productPolicy ? PRODUCT_SOURCE_POLICY : null, sourceTestReady: false, steps: [], delivery: null };
    var gates = canonicalGates(f.gates);
    result.steps = requiredStages.map(function (s) {
      var gate = object(gates[s]);
      var valid = result.headSha && gate.headSha === result.headSha && gate.status === 'PASS';
      if (s === 'review') valid = valid && result.reviewer && result.developer && result.reviewer !== result.developer && provider(gate.provider) === result.reviewer;
      return { id: s, label: LABELS[s], state: valid ? 'passed' : s === stage && result.status === 'running' ? 'running' : s === stage && ['blocked', 'paused', 'failed'].includes(result.status) ? 'blocked' : 'pending' };
    });
    result.sourceTestReady = Boolean(productPolicy && f.sourceTestReady === true && result.status === 'source_ready' && stage === 'test' && Boolean(result.headSha)
      && result.developer && result.reviewer && result.developer !== result.reviewer && result.steps.every(function (step) { return step.state === 'passed'; })
      && provider(gates.test.provider) === result.reviewer);
    if (result.status === 'source_ready' && !result.sourceTestReady) {
      result.status = 'evidence_pending';
      result.waitingReason = 'Kaynak test kaydı bekleniyor; aynı kaynak sürümündeki geliştirme, bağımsız inceleme ve ürün testi birlikte doğrulanmadı.';
    }
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
    return { conversation: brain, workers: workers, independentWorkers: normalizeIndependent(c.independentWorkers, { now: now, studioMode: studioMode }), flows: flows, readState: text(input.readState, 80) || 'unknown', accountKey: text(input.accountKey, 100) || null };
  }
  function render(doc, target, snapshot, options) {
    options = options || {}; if (!doc || !target) return null;
    function node(tag, cls, value) { var n = doc.createElement(tag); if (cls) n.className = cls; if (value != null) n.textContent = value; return n; }
    var section = node('section', 'sf-root'); section.setAttribute('aria-label', 'Jarvis ve iki etkin işçi');
    var brain = node('div', 'sf-brain'), name = node('strong', 'sf-brain-name', snapshot.conversation.label);
    brain.dataset.state = snapshot.conversation.state; brain.append(name); section.append(brain);
    var workers = node('div', 'sf-workers'); workers.setAttribute('aria-label', 'Gerçek işçi bağlantıları');
    snapshot.workers.forEach(function (worker) { var n = node('div', 'sf-worker'); n.dataset.state = worker.state; n.append(node('span', 'sf-worker-name', worker.state === 'disabled' ? worker.label.replace(/ · Kapalı$/, '') : worker.label), node('span', 'sf-worker-state', worker.detail)); workers.append(n); }); section.append(workers);
    var independent = snapshot.independentWorkers;
    if (independent) {
      var iw = node('section', 'sf-independent'); iw.setAttribute('aria-label', 'Bağımsız işçi oturumları');
      iw.append(node('strong', 'sf-independent-title', 'Bağımsız işçiler'), node('p', 'sf-capacity', (independent.activeCount == null ? 'Güncel kapasite sinyali bekleniyor' : independent.activeCount + ' / ' + independent.maxActiveWorkers + ' etkin işçi') + ' · ' + independent.roster.length + ' uzman şablonu'));
      var instances = node('div', 'sf-instance-list');
      independent.workers.forEach(function (worker) {
        var button = node('button', 'sf-instance'); button.type = 'button'; button.dataset.workerId = worker.id; button.dataset.state = worker.state; button.setAttribute('aria-expanded', String(options.selectedWorkerId === worker.id));
        button.append(node('strong', '', worker.label), node('span', '', worker.projectLabel + ' · ' + WORKER_LABELS[worker.state]), node('small', '', PROVIDERS[worker.provider].replace(/ · Kapalı$/, '') + ' · ' + worker.specialty));
        button.addEventListener('click', function () { if (typeof options.onSelectWorker === 'function') options.onSelectWorker(worker.id); }); instances.append(button);
      });
      if (!independent.workers.length) instances.append(node('p', 'sf-empty', 'Henüz bağımsız işçi başlatılmadı.'));
      iw.append(instances);
      var selected = independent.workers.find(function (worker) { return worker.id === options.selectedWorkerId; });
      if (selected) {
        var detail = node('section', 'sf-worker-detail'); detail.setAttribute('aria-label', selected.label + ' oturum ayrıntıları');
        var close = node('button', 'sf-detail-close', 'Ayrıntıları kapat'); close.type = 'button'; close.addEventListener('click', function () { if (typeof options.onSelectWorker === 'function') options.onSelectWorker(null); });
        detail.append(node('strong', '', selected.label + ' · ' + selected.projectLabel), close, node('p', 'sf-session-id', 'Görev: ' + ({ implement: 'Geliştirme', fix: 'Düzeltme', review: 'İnceleme', test: 'Test', unknown: 'Türü doğrulanmadı' })[selected.operation]), node('p', 'sf-session-id', 'Sağlayıcı: ' + PROVIDERS[selected.provider].replace(/ · Kapalı$/, '')), node('p', 'sf-session-id', 'İşçi: ' + selected.id), node('p', 'sf-session-id', 'Oturum: ' + (selected.sessionId || 'Henüz doğrulanmadı')));
        if (selected.workspaceLabel) detail.append(node('p', 'sf-workspace', selected.workspaceLabel));
        if (selected.legacy) detail.append(node('p', 'sf-evidence-note', 'Önceki sistemden gelen iş kaydı. Bu kayıt salt okunur; bağımsız işçiye takip görevi gönderilemez.'));
        detail.append(node('p', 'sf-evidence-note', selected.operation === 'review' ? 'Kaynak incelemesi, çalıştırılmış oyun testi veya paket kabulü anlamına gelmez.' : 'İşçinin tamamlanması, çalıştırılmış oyun testi veya paket kabulü anlamına gelmez.'));
        if (selected.historyLimited) detail.append(node('p', 'sf-evidence-note', 'Panel son tur kayıtlarının sınırlı bir özetini gösteriyor; eski kayıtlar yerel işçi geçmişinde korunur.'));
        var turns = node('ol', 'sf-worker-turns');
        selected.turns.forEach(function (turn, index) { var item = node('li', ''); item.append(node('strong', '', 'Tur ' + (index + 1) + ' · ' + WORKER_LABELS[turn.state]), node('p', 'sf-turn-instruction', turn.instruction || 'Talimat kaydı yok'), node('p', 'sf-turn-result', turn.result || 'Sonuç bekleniyor')); turns.append(item); }); detail.append(turns);
        if (!selected.turns.length) detail.append(node('p', 'sf-empty', 'Bu oturumun tur kaydı henüz yok.'));
        var actions = node('div', 'sf-worker-actions');
        var stopBtn = node('button', 'sf-stop-worker', options.stopBusy === true ? 'Durduruluyor…' : 'Çalışanı durdur');
        stopBtn.type = 'button';
        stopBtn.disabled = !selected.cancelAllowed || options.stopBusy === true;
        stopBtn.addEventListener('click', function () {
          if (typeof options.onStopWorker === 'function') options.onStopWorker(selected.id);
        });
        actions.append(stopBtn);
        var exportBtn = node('button', 'sf-export-history', options.exportBusy === true ? 'Hazırlanıyor…' : 'Geçmişi indir (JSON)');
        exportBtn.type = 'button';
        exportBtn.disabled = options.exportBusy === true;
        exportBtn.addEventListener('click', function () {
          if (typeof options.onExportHistory === 'function') options.onExportHistory(selected.id);
        });
        actions.append(exportBtn);
        if (options.actionStatus) {
          var actionStatus = node('p', 'sf-action-status', options.actionStatus);
          actionStatus.setAttribute('role', 'status');
          actions.append(actionStatus);
        }
        detail.append(actions);
        if (typeof options.onFollowup === 'function') {
          var form = node('form', 'sf-followup'), label = node('label', '', 'Aynı işçiye takip görevi'), input = node('textarea', ''); input.rows = 3; input.required = true; input.maxLength = 1800; input.value = options.followupDraft || ''; input.placeholder = 'Bu oturumda devam etmesini istediğin görevi yaz'; input.disabled = !selected.canFollowup || options.followupBusy === true; label.append(input);
          input.addEventListener('input', function () { if (typeof options.onDraft === 'function') options.onDraft(selected.id, input.value); });
          var submit = node('button', '', options.followupBusy ? 'Gönderiliyor…' : 'Takip görevini gönder'); submit.type = 'submit'; submit.disabled = !selected.canFollowup || options.followupBusy === true;
          var status = node('p', 'sf-submit-status', options.followupMessage || (selected.canFollowup ? 'Aynı işçi ve doğrulanmış oturum kaydıyla devam eder.' : independent.fresh ? 'Başarıyla tamamlanmış bağımsız işçi, açık sağlayıcı ve doğrulanmış oturum kaydı gerekir.' : 'Güncel bağlantı gelince takip görevi gönderilebilir.')); status.setAttribute('role', 'status');
          form.append(label, submit, status); form.addEventListener('submit', function (event) { event.preventDefault(); if (!submit.disabled) options.onFollowup(selected.id, input.value); }); detail.append(form);
        }
        iw.append(detail);
      }
      var templates = node('details', 'sf-roster'); templates.append(node('summary', '', 'Uzman kadrosu · ' + independent.roster.length)); var rosterList = node('div', 'sf-roster-list');
      independent.roster.forEach(function (template) { var assigned = independent.workers.filter(function (worker) { return worker.templateId === template.id; }), item = node('div', 'sf-template'); item.dataset.state = !template.enabled ? 'disabled' : assigned.length ? 'assigned' : 'not_started'; item.append(node('strong', '', template.label), node('span', '', PROVIDERS[template.provider].replace(/ · Kapalı$/, '') + ' · ' + (!template.enabled ? 'Kapalı' : assigned.length ? assigned.length + ' oturum' : 'Başlatılmadı')), node('small', '', template.specialty)); rosterList.append(item); }); templates.append(rosterList); iw.append(templates); section.append(iw);
    }
    if (options.compact !== true || snapshot.flows.length) {
      var details = node('details', 'sf-flows'); details.open = options.compact !== true;
      details.append(node('summary', '', 'İş akışı · ' + snapshot.flows.length));
      var list = node('div', 'sf-flow-list');
      snapshot.flows.slice(0, options.compact === true ? 3 : 20).forEach(function (flow) {
        var card = node('article', 'sf-card'); card.dataset.flowId = flow.id;
        var top = node('div', 'sf-card-head'); top.append(node('strong', '', flow.projectLabel), node('span', 'sf-stage', flow.sourceTestReady ? 'Kaynak testleri geçti' : flow.status === 'evidence_pending' ? 'Kanıt bekleniyor' : flow.delivery ? 'Teste hazır' : LABELS[flow.stage] || 'Sıra bekleniyor')); card.append(top);
        if (flow.title) card.append(node('p', 'sf-task', flow.title));
        var owners = node('p', 'sf-owners', 'Son düzenleyen: ' + (PROVIDERS[flow.lastEditor] || 'Kayıt bekleniyor') + ' · İşçi: ' + (PROVIDERS[flow.developer] || 'Atanmadı') + ' · Kontrol: ' + (PROVIDERS[flow.reviewer] || 'Atanmadı')); card.append(owners);
        var steps = node('ol', 'sf-steps'); steps.setAttribute('aria-label', 'Doğrulanmış aşamalar'); steps.setAttribute('style', 'grid-template-columns:repeat(' + flow.steps.length + ',minmax(0,1fr))');
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
    var disposed = false, epoch = 0, inflight = null, account = null, proposal = null, submitBusy = false, observer = null, timer = null, listeners = [], containers = new Map(), observedInput = {}, snapshot = normalize({}, { now: clock() }), selectedWorkerId = null, followups = new Map(), stopBusyId = null, exportBusyId = null, actionStatuses = new Map();
    function context() { return object(host.context()); }
    function identity() { var c = context(); return c.authenticated === true && c.isOwner === true && c.demo !== true && UUID.test(c.userId || '') ? c.userId : null; }
    function same(owner, ticket) { return !disposed && owner && owner === account && owner === identity() && ticket === epoch; }
    function build() { snapshot = normalize(Object.assign({}, observedInput, { accountKey: account }), { now: clock(), allowedArtifactOrigins: options.allowedArtifactOrigins }); return snapshot; }
    function syncAccount() { var next = identity(); if (next !== account) { account = next; epoch++; inflight = null; proposal = null; submitBusy = false; selectedWorkerId = null; stopBusyId = null; exportBusyId = null; actionStatuses.clear(); followups.clear(); observedInput = {}; build(); containers.forEach(function (container) { container.replaceChildren(); }); } return account; }
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
      [['jarvisWorld', '.jw-thread', true], ['studioWorld-feed', null, false]].forEach(function (item) {
        var point = mountPoint(item[0], item[1]); if (!point) return;
        var followup = followups.get(selectedWorkerId) || {};
        render(doc, point, snapshot, {
          compact: item[2],
          selectedWorkerId: selectedWorkerId,
          onSelectWorker: selectWorker,
          onStopWorker: function (id) { void handleStopWorker(id); },
          onExportHistory: function (id) { void handleExportHistory(id); },
          stopBusy: stopBusyId === selectedWorkerId,
          exportBusy: exportBusyId === selectedWorkerId,
          actionStatus: actionStatuses.get(selectedWorkerId) || '',
          onFollowup: function (id, body) { void requestWorkerFollowup({ workerId: id, text: body }); },
          onDraft: function (id, body) { var previous = followups.get(id) || {}; followups.set(id, { text: body, requestId: previous.text === body ? previous.requestId : null, message: '', busy: false }); },
          followupDraft: followup.text || '',
          followupBusy: followup.busy === true,
          followupMessage: followup.message || ''
        });
        if (item[2]) renderProposal(point);
      });
    }
    function selectWorker(id) { syncAccount(); if (id !== null && (!snapshot.independentWorkers || !snapshot.independentWorkers.workers.some(function (worker) { return worker.id === id; }))) return false; selectedWorkerId = id; paint(); return true; }
    async function handleStopWorker(id) {
      if (stopBusyId) return;
      stopBusyId = id; actionStatuses.set(id, 'Durdurma isteği gönderiliyor…'); paint();
      try {
        var answer = await requestWorkerStop({ workerId: id });
        if (answer && answer.accepted) {
          actionStatuses.set(id, 'Durdurma isteği iletildi.');
          void refresh();
        } else {
          actionStatuses.set(id, 'Durdurma isteği reddedildi veya işçi durdurulamaz.');
        }
      } catch (_) {
        actionStatuses.set(id, 'Durdurma sırasında bir hata oluştu.');
      } finally {
        stopBusyId = null; paint();
      }
    }
    async function handleExportHistory(id) {
      if (exportBusyId) return;
      exportBusyId = id; actionStatuses.set(id, 'Geçmiş JSON hazırlanıyor…'); paint();
      try {
        var res = await exportAndDownloadHistory(id);
        if (res && res.accepted) {
          actionStatuses.set(id, 'Geçmiş hazırlandı ve indirme başlatıldı.');
        } else {
          actionStatuses.set(id, 'Geçmiş dışa aktarılamadı.');
        }
      } catch (_) {
        actionStatuses.set(id, 'Dışa aktarma sırasında bir hata oluştu.');
      } finally {
        exportBusyId = null; paint();
      }
    }
    async function requestWorkerStop(payload) {
      if (disposed) return { accepted: false, message: 'İş görünümü kapalı.' };
      payload = object(payload); var owner = syncAccount(), ticket = epoch; build();
      var id = payload.workerId, worker = snapshot.independentWorkers && snapshot.independentWorkers.workers.find(function (item) { return item.id === id; });
      if (!owner || !active() || !worker || !worker.cancelAllowed || !worker.cancelRequestId || !UUID.test(worker.cancelRequestId)) {
        return { accepted: false, message: 'Durdurulabilir etkin işçi oturumu bulunamadı.' };
      }
      try {
        var response = await host.request('cancelIntent', { expectedUserId: owner, requestId: worker.cancelRequestId });
        if (!same(owner, ticket)) return { accepted: false, message: 'Hesap değişti.' };
        if (response && response.error) return { accepted: false, message: 'İşçi durdurma isteği reddedildi.' };
        return { accepted: true, requestId: worker.cancelRequestId, data: response };
      } catch (_) {
        return { accepted: false, message: 'İşçi durdurma isteği iletilemedi.' };
      }
    }
    function utf8Bytes(str) {
      if (typeof str !== 'string') return 0;
      if (typeof TextEncoder !== 'undefined') {
        return new TextEncoder().encode(str).length;
      }
      if (typeof Buffer !== 'undefined' && typeof Buffer.byteLength === 'function') {
        return Buffer.byteLength(str, 'utf8');
      }
      try {
        return encodeURIComponent(str).replace(/%[A-F0-9]{2}/gi, 'U').length;
      } catch (_) {
        return str.length;
      }
    }
    function serializeHistory(data) {
      return JSON.stringify(data, null, 2).replace(/(?:Bearer\s+\S+|\b(?:sk-|gsk_|AIza|gh[pousr]_|claimToken|reservationToken|service[_-]?key)[a-z0-9_=-]{0,100})/gi, '[gizlendi]');
    }
    async function exportWorkerHistory(payload) {
      if (disposed) return { accepted: false, message: 'İş görünümü kapalı.' };
      payload = object(payload); var owner = syncAccount(); build();
      var id = payload.workerId, worker = snapshot.independentWorkers && snapshot.independentWorkers.workers.find(function (item) { return item.id === id; });
      if (!owner || !worker) return { accepted: false, message: 'Doğrulanmış işçi geçmişi bulunamadı.' };
      var safeTurns = (Array.isArray(worker.turns) ? worker.turns : []).map(function (turn) {
        turn = object(turn);
        return {
          requestId: turn.requestId,
          instruction: turn.instruction,
          result: turn.result,
          state: turn.state,
          updatedAt: turn.updatedAt ? new Date(turn.updatedAt).toISOString() : null
        };
      });
      var exportData = {
        schemaVersion: 1,
        exportedAt: new Date(clock()).toISOString(),
        workerId: worker.id,
        id: worker.id,
        projectId: worker.projectId,
        projectLabel: worker.projectLabel,
        label: worker.label,
        specialty: worker.specialty,
        provider: worker.provider,
        templateId: worker.templateId,
        jobId: worker.jobId,
        sessionId: worker.sessionId,
        state: worker.state,
        operation: worker.operation,
        workspaceLabel: worker.workspaceLabel,
        updatedAt: worker.updatedAt ? new Date(worker.updatedAt).toISOString() : null,
        turns: safeTurns
      };
      var content = serializeHistory(exportData);
      if (utf8Bytes(content) > 131072) {
        var truncatedTurns = exportData.turns.slice();
        while (truncatedTurns.length > 0 && utf8Bytes(serializeHistory(Object.assign({}, exportData, { turns: truncatedTurns }))) > 131072) {
          truncatedTurns.shift();
        }
        exportData.turns = truncatedTurns;
        content = serializeHistory(exportData);
      }
      if (utf8Bytes(content) > 131072) {
        return { accepted: false, message: 'İşçi geçmişi izin verilen 128 KB sınırını aşıyor.' };
      }
      var filename = 'worker-' + (worker.projectId || 'panel') + '-' + worker.id + '-history.json';
      return { accepted: true, filename: filename, content: content };
    }
    async function exportAndDownloadHistory(id) {
      var result = await exportWorkerHistory({ workerId: id });
      if (!result || !result.accepted || !result.content || !result.filename) return result;
      if (doc && typeof doc.createElement === 'function') {
        try {
          var blob = win && typeof win.Blob === 'function' ? new win.Blob([result.content], { type: 'application/json;charset=utf-8' }) : null;
          if (blob && win && win.URL && typeof win.URL.createObjectURL === 'function') {
            var url = win.URL.createObjectURL(blob);
            var link = doc.createElement('a');
            link.href = url;
            link.download = result.filename;
            link.style.display = 'none';
            if (doc.body && typeof doc.body.appendChild === 'function') doc.body.appendChild(link);
            if (typeof link.click === 'function') link.click();
            if (typeof link.remove === 'function') link.remove();
            if (typeof win.URL.revokeObjectURL === 'function') {
              if (typeof win.setTimeout === 'function') win.setTimeout(function () { win.URL.revokeObjectURL(url); }, 1000);
              else win.URL.revokeObjectURL(url);
            }
          } else {
            var a = doc.createElement('a');
            a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(result.content);
            a.download = result.filename;
            a.style.display = 'none';
            if (typeof a.click === 'function') a.click();
          }
        } catch (_) {}
      }
      return result;
    }
    async function requestWorkerFollowup(payload) {
      payload = object(payload); var owner = syncAccount(), ticket = epoch; build();
      var id = payload.workerId, worker = snapshot.independentWorkers && snapshot.independentWorkers.workers.find(function (item) { return item.id === id; }), body = typeof payload.text === 'string' ? payload.text.trim() : '';
      if (disposed || !owner || !active() || !worker || !worker.canFollowup) return { accepted: false, message: 'Güncel, doğrulanmış ve başarıyla tamamlanmış bağımsız işçi oturumu gerekli.' };
      if (!body || body.length > 1800) { followups.set(id, { text: body, busy: false, message: 'Takip görevi 1–1800 karakter olmalı.' }); paint(); return { accepted: false, message: 'Takip görevi 1–1800 karakter olmalı.' }; }
      var prior = followups.get(id) || {}; if (prior.busy) return { accepted: false, message: 'Bu takip isteği gönderiliyor.' };
      var requestId = prior.text === body && UUID.test(prior.requestId || '') ? prior.requestId : null;
      if (!requestId) { if (!win || !win.crypto || typeof win.crypto.randomUUID !== 'function') return { accepted: false, message: 'Güvenli istek kimliği üretilemedi.' }; requestId = win.crypto.randomUUID(); }
      var record = { text: body, requestId: requestId, busy: true, message: '' }; followups.set(id, record); paint();
      try {
        var answer = unwrap(await host.request('submitIntent', { expectedUserId: owner, requestId: requestId, requestedProject: worker.projectId, text: worker.projectLabel + ' projesinde çalışan ' + id + ' işçisine takip görevi: ' + body, attachments: [] }));
        if (!same(owner, ticket)) return { accepted: false, message: 'Hesap değişti; sonuç yeni hesaba taşınmadı.' };
        if (!answer || (answer.request_id || answer.requestId || answer.id) !== requestId || (answer.requested_project && answer.requested_project !== worker.projectId)) throw new Error('FOLLOWUP_RECEIPT_MISMATCH');
        record.message = 'Takip isteği komut kuyruğuna kaydedildi. Başlaması ve sonucu işçi kaydında görünecek.'; record.text = ''; record.requestId = null;
        return { accepted: true, requestId: requestId };
      } catch (_) { if (same(owner, ticket)) record.message = 'Kuyruk kaydı doğrulanamadı. Aynı istek kimliğiyle tekrar deneyebilirsin.'; return { accepted: false, requestId: requestId, message: 'Kuyruk kaydı doğrulanamadı.' }; }
      finally { if (same(owner, ticket)) { record.busy = false; paint(); } }
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
    return Object.freeze({
      refresh: refresh,
      getSnapshot: function () { syncAccount(); build(); return JSON.parse(JSON.stringify(snapshot)); },
      proposeWork: proposeWork,
      requestWork: requestWork,
      selectWorker: selectWorker,
      requestWorkerFollowup: requestWorkerFollowup,
      requestWorkerStop: requestWorkerStop,
      exportWorkerHistory: exportWorkerHistory,
      downloadWorkerHistory: exportAndDownloadHistory,
      dispose: function () {
        if (disposed) return;
        disposed = true; epoch++; proposal = null; inflight = null; selectedWorkerId = null;
        stopBusyId = null; exportBusyId = null; actionStatuses.clear(); followups.clear();
        observedInput = {}; build();
        if (timer !== null && win) win.clearInterval(timer);
        if (observer) observer.disconnect();
        listeners.forEach(function (off) { off(); });
        containers.forEach(function (container) { container.remove(); });
        containers.clear();
      }
    });
  }
  return Object.freeze({ create: create, normalize: normalize, normalizeIndependent: normalizeIndependent, normalizeFlow: normalizeFlow, safeDelivery: safeDelivery, render: render, DEFAULT_ORIGINS: DEFAULT_ORIGINS });
});
