(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OryvonaStudioDataV26 = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const PROJECTS = Object.freeze([
    Object.freeze({ id: 'koza', name: 'KOZA' }), Object.freeze({ id: 'charm-drop', name: 'Charm Drop' }),
    Object.freeze({ id: 'forge-run', name: 'Forge Run' }), Object.freeze({ id: 'aeryo', name: 'AERYO' }),
    Object.freeze({ id: 'tupsper', name: 'Tuckspire' })
  ]);
  const IDS = new Set(PROJECTS.map(p => p.id).concat('oryvona-panel'));
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
  const list = (x, limit) => Array.isArray(x) ? x.slice(0, limit) : [];
  const text = (x, limit = 2000) => typeof x === 'string' ? x.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, limit) : '';
  const object = x => x && typeof x === 'object' && !Array.isArray(x) ? x : {};
  function stamp(x) { if (x == null || x === '') return null; const n = typeof x === 'number' ? x : Date.parse(x); return Number.isFinite(n) && n >= 0 ? n : null; }
  const iso = x => { const n = stamp(x); return n === null ? null : new Date(n).toISOString(); };
  function projectId(value) {
    const v = text(value, 100).trim().toLowerCase().replace(/[ _]+/g, '-');
    const id = ({ tuckspire: 'tupsper', tupsper: 'tupsper', 'charmdrop': 'charm-drop', 'forgerun': 'forge-run', panel: 'oryvona-panel' })[v] || v;
    return IDS.has(id) ? id : null;
  }
  function dayWindow(value) {
    const now = stamp(value); if (now === null) return { date: null, timeZone: 'Europe/Istanbul', from: null, to: null };
    // Istanbul has remained UTC+03:00 since 2016. Intl obtains the civil date; the
    // UTC conversion is for that same 2026 studio day, never the host timezone.
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now));
    const part = type => parts.find(p => p.type === type).value;
    const date = `${part('year')}-${part('month')}-${part('day')}`;
    return { date, timeZone: 'Europe/Istanbul', from: new Date(Date.parse(date + 'T00:00:00+03:00')).toISOString(), to: new Date(now).toISOString() };
  }
  function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const v of Object.values(value)) deepFreeze(v); } return value; }
  function normalizeGates(game) {
    const g = object(game.v26Gates || game.gates || game.v22Gates);
    const pick = (a, b) => text(g[a] == null ? g[b] : g[a], 200) || 'UNKNOWN';
    return { technicalQa: pick('technicalQa', 'technical_qa'), deviceQa: pick('deviceQa', 'device_qa'), productAcceptance: pick('productAcceptance', 'product_acceptance'), publication: pick('publication', 'publication_status'), apkAllowed: g.apkAllowed === true || g.apk_allowed === true };
  }
  function safeArtifact(game) {
    const a = object(game.artifact), file = text(a.file, 500), hash = text(a.sha256, 64);
    // Only same-site relative package paths. A recorded hash is not a byte audit.
    const safe = !!file && !/^(?:[a-z][a-z\d+.-]*:|\/|\\)/i.test(file) && !/[\\\u0000-\u0020#?]/.test(file) && !file.split('/').some(p => p === '..' || p === '.' || !p) && /^[\w./-]+$/.test(file);
    return { file: safe ? file : null, sha256: /^[a-f\d]{64}$/i.test(hash) ? hash.toLowerCase() : null, bytes: Number.isSafeInteger(a.bytes) && a.bytes >= 0 ? a.bytes : null, downloadUrl: safe ? file : null, verified: false, verification: 'RECORDED_METADATA' };
  }
  function safeStoreUrl(value) {
    try { const url = new URL(text(value, 1200)); return url.protocol === 'https:' && ['play.google.com', 'apps.apple.com'].includes(url.hostname) && !url.username && !url.password ? url.href : null; } catch (_) { return null; }
  }
  function safeEntry(value) {
    const entry = text(value, 700), parts = entry.split('?');
    if (parts.length > 2 || !entry || /[#%\s\\]/.test(entry)) return null;
    const path = safeArtifact({ artifact: { file: parts[0] } }).file;
    if (!path || !path.startsWith('play/') || !path.endsWith('.html')) return null;
    if (parts.length === 2) {
      const seen = new Set(), query = new URLSearchParams(parts[1]);
      if (!parts[1]) return null;
      for (const [key, val] of query) {
        if (seen.has(key) || !(key === 'panel' && val === '1' || key === 'v' && /^[a-z\d._-]{1,50}$/i.test(val))) return null;
        seen.add(key);
      }
    }
    return entry;
  }
  function stageId(value) {
    const id = text(value, 60).toLowerCase();
    return ({ packaging: 'package', development: 'development', test: 'test', review: 'review', package: 'package', delivery: 'delivery' })[id] || 'unknown';
  }
  function connectionSnapshot(bridge, matches) {
    const c = matches ? object(bridge.connection) : {}, boolean = key => typeof c[key] === 'boolean' ? c[key] : null;
    const providerStates = ['ready', 'auth_required', 'quota_wait', 'missing', 'auth_method_rejected', 'cli_incompatible'];
    return { status: text(c.status, 80) || 'unknown', label: text(c.label, 500) || 'İşçi bağlantısı doğrulanmadı', submitAvailable: c.submitAvailable === true,
      executionEnabled: boolean('executionEnabled'), workerOnline: boolean('workerOnline'), attachmentsAvailable: boolean('attachmentsAvailable'),
      providerState: providerStates.includes(c.providerState) ? c.providerState : null, lastSeen: iso(c.lastSeen) };
  }
  function coverage(raw, now) {
    const today = dayWindow(now), result = {};
    for (const name of ['statuses', 'events', 'runs', 'releases']) {
      const c = object(object(raw.coverage)[name]);
      const state = ['complete', 'partial', 'unknown', 'error'].includes(c.state) ? c.state : 'unknown';
      const from = iso(c.from), to = iso(c.to);
      result[name] = { state, from, to, truncated: c.truncated === true, error: c.error ? text(c.error, 180) : null };
      result[name].todayComplete = state === 'complete' && !result[name].truncated && from !== null && to !== null && stamp(from) <= stamp(today.from) && stamp(to) >= now - 300000 && stamp(to) <= now + 300000;
    }
    return result;
  }
  function normalizeJob(row, now, today) {
    row = object(row); const pid = projectId(row.projectId || row.project_id || row.requested_project);
    if (!pid) return null;
    const status = text(row.status, 80).toLowerCase() || 'unknown', receipt = object(row.receipt);
    const finishAt = iso(row.finishedAt || row.finished_at || receipt.finishedAt || receipt.finished_at);
    const rawWorker = text(row.actorId || row.actor_id || receipt.actorId || row.expert || row.worker_id || receipt.workerId || receipt.worker_id, 160);
    const isCoord = /(?:^|[-:])coordinator$|^dj-kabin:v2\d-(?:queued|claim|ingress)$/i.test(rawWorker);
    const worker = isCoord ? text(row.actorId || row.actor_id || receipt.actorId, 160) : rawWorker;
    const receiptProject = receipt.projectId || receipt.project_id;
    const receiptId = receipt.requestId || receipt.request_id;
    const id = text(row.id || row.requestId || row.request_id, 160);
    const completed = status === 'completed';
    const verified = completed && receipt.status === 'FINISHED' && !!(worker || rawWorker) && projectId(receiptProject) === pid && receiptId === id;
    const finished = stamp(finishAt);
    return { id, projectId: pid, title: text(row.title || row.text, 300), status, statusText: text(row.statusText || row.note_tr, 1500),
      expert: worker || null, workspaceLabel: text(row.workspaceLabel || row.workspace_label, 200) || null, stage: stageId(row.stage || receipt.stage),
      originalStage: text(row.stage || receipt.stage, 60) || null,
      steps: list(row.steps, 8).map(s => ({ id: stageId(s.id), originalId: text(s.id, 60), title: text(s.title, 100), status: ({ done: 'completed', not_run: 'pending' })[s.status] || text(s.status, 60), originalStatus: text(s.status, 60) })),
      completedStages: list(row.completedStages || receipt.completedStages || receipt.completed_stages, 5).map(stageId).filter(s => s !== 'unknown'),
      createdAt: iso(row.createdAt || row.created_at), updatedAt: iso(row.updatedAt || row.updated_at), finishedAt: finishAt,
      canCancel: row.canCancel === true && !['completed', 'failed', 'cancelled'].includes(status),
      completionEvidence: verified ? 'worker-receipt' : completed ? 'recorded-status-only' : 'none',
      verifiedCompletedToday: verified && finished !== null && finished >= stamp(today.from) && finished <= now,
      receipt: { status: text(receipt.status, 100) || null, workerId: (worker || rawWorker) || null, projectId: receiptProject ? projectId(receiptProject) : null, requestId: receiptId ? text(receiptId, 160) : null }
    };
  }
  function normalizeEvent(row, now, today) {
    row = object(row); const pid = projectId(row.projectId || row.project_id || row.game_id); if (!pid) return null;
    const at = iso(row.at || row.created_at), time = stamp(at);
    return { id: text(row.id, 160), projectId: pid, at, today: time !== null && time >= stamp(today.from) && time <= now,
      actor: text(row.actor, 100) || 'unknown', kind: text(row.kind, 100) || 'note', status: text(row.status, 100),
      title: text(row.title_tr || row.titleTr || row.title, 300), body: text(row.text_tr || row.textTr || row.text, 1200),
      taskId: text(row.task_id || row.taskId, 160) || null };
  }
  function normalizeRun(row, now, today) {
    row = object(row); const data = { ...object(row.data), ...row }, pid = projectId(row.projectId || row.project_id || data.project_id); if (!pid) return null;
    const finishedAt = iso(data.finished_at || data.finishedAt || data.completed_at), startedAt = iso(data.started_at || data.startedAt), at = stamp(finishedAt || startedAt);
    const suites = object(data.suites), states = Object.entries(suites).slice(0, 12).map(([id, suite]) => ({ id, status: text(suite && suite.status, 100) || 'UNKNOWN' }));
    const failed = states.some(s => ['FAIL', 'BLOCKED'].includes(s.status));
    const code = object(data.code), codePassed = data.code_passed == null ? code.passed : data.code_passed, codeTotal = data.code_total == null ? code.total : data.code_total;
    const codeStatus = text(object(suites.code).status || code.status, 100) || (Number.isFinite(codePassed) && Number.isFinite(codeTotal) && codeTotal > 0 && codePassed <= codeTotal ? codePassed === codeTotal ? 'PASS' : 'FAIL' : 'UNKNOWN');
    const all = codeStatus === 'PASS' && ['baseline', 'natural', 'lifecycle'].every(k => object(suites[k]).status === 'PASS');
    return { id: text(data.run_id || data.id, 160), projectId: pid, startedAt, finishedAt, today: at !== null && at >= stamp(today.from) && at <= now,
      status: failed || codeStatus === 'FAIL' ? 'FAIL_OR_BLOCKED' : all ? 'RECORDED_PASS' : 'PARTIAL_OR_UNKNOWN', suites: states, evidence: 'RECORDED_RUN', sourceCommit: text(data.source_commit || data.head_sha, 80) || null };
  }
  function normalize(raw, options) {
    options = options || {}; raw = object(raw); const now = stamp(options.now == null ? Date.now() : options.now) ?? Date.now(), today = dayWindow(now);
    if (!raw.accountKey || !['ready', 'loading', 'error', 'demo'].includes(raw.state)) raw = { ...raw, events: [], runs: [], statuses: [], releases: [], accountKey: null };
    const meta = object(options.metadata), bridge = object(options.bridgeSnapshot), bridgeMatches = raw.accountKey && bridge.accountKey === raw.accountKey;
    const jobs = bridgeMatches ? list(bridge.jobs, 200).map(j => normalizeJob(j, now, today)).filter(Boolean) : [];
    const events = list(raw.events, 300).map(e => normalizeEvent(e, now, today)).filter(Boolean);
    const runs = list(raw.runs, 200).map(r => normalizeRun(r, now, today)).filter(Boolean);
    const statuses = Array.isArray(raw.statuses) ? raw.statuses : Object.entries(object(raw.statuses)).map(([project_id, data]) => ({ project_id, data }));
    const byStatus = new Map(statuses.map(s => [projectId(s.project_id || s.id), s]));
    const byMeta = new Map(list(meta.games, 10).map(g => [projectId(g.id), g]));
    const byRelease = new Map(list(raw.releases, 10).map(g => [projectId(g.project_id || g.projectId || g.id), g]));
    const priorities = [], projects = PROJECTS.map(p => {
      const row = object(byStatus.get(p.id)), s = object(row.data || row.status), hand = object(s.handoff), m = object(byMeta.get(p.id)), dbRelease = object(byRelease.get(p.id));
      const updatedAt = iso(s.updatedAt || s.updated_at || row.updated_at), updated = stamp(updatedAt);
      const stale = updated === null || now - updated > 25 * 60000 || updated > now + 300000;
      const actualJobs = jobs.filter(j => j.projectId === p.id), actualEvents = events.filter(e => e.projectId === p.id), actualRuns = runs.filter(r => r.projectId === p.id);
      const gates = normalizeGates(m), q = object(m.qa), handoff = text(hand.status, 120) || 'UNKNOWN';
      const status = { phase: text(s.phaseTr || s.phase, 300), summary: text(s.summaryTr || s.summary, 1800), taskId: text(hand.task_id, 160) || null, taskTitle: text(s.taskTitleTr || s.taskTitle, 500), taskText: text(s.taskTextTr || s.taskText, 1600), handoff, updatedAt, stale, actor: text(object(hand.lease).actor, 100) || null };
      const release = { projectId: p.id, version: text(m.version, 200) || null, versionCode: Number.isSafeInteger(m.versionCode) ? m.versionCode : null, artifact: safeArtifact(m), entry: safeEntry(m.entry), gates,
        reportedStage: ['development', 'closed_testing', 'open_testing', 'production', 'paused'].includes(dbRelease.stage) ? dbRelease.stage : null,
        storeUrl: safeStoreUrl(dbRelease.store_url || dbRelease.storeUrl), currentStoreUpdatedAt: iso(dbRelease.updated_at || dbRelease.updatedAt), currentStoreSource: own(dbRelease, 'stage') ? 'SCOPED_DATABASE_RECORD' : 'UNKNOWN',
        qa: { status: text(q.status, 200) || 'UNKNOWN', observedAt: iso(q.observedAt), summary: text(q.summary, 1800), source: text(q.source, 500), recorded: true, verified: false },
        levels: Object.fromEntries(['implemented', 'planned', 'dailyBoards', 'designs'].map(k => [k, Number.isSafeInteger(object(m.levels)[k]) && object(m.levels)[k] >= 0 ? object(m.levels)[k] : null]).concat([['unit', text(object(m.levels).unit, 100)], ['world', text(object(m.levels).world, 200)]])),
        acceptance: text(m.acceptance, 800), metadataGeneratedAt: iso(meta.generatedAt), metadataVersion: text(meta.studioVersion, 80) || null, provenance: 'RECORDED_METADATA' };
      const counts = { active: actualJobs.filter(j => j.status === 'running').length, queued: actualJobs.filter(j => ['queued', 'recorded', 'claimed'].includes(j.status)).length, blocked: actualJobs.filter(j => ['blocked', 'failed', 'paused', 'waiting_review'].includes(j.status)).length, completedToday: actualJobs.filter(j => j.verifiedCompletedToday).length };
      const blocked = handoff === 'BLOCKED' || counts.blocked > 0;
      if (blocked) priorities.push({ projectId: p.id, kind: 'blocked', title: p.name + ' engelini çöz', body: status.taskTitle || 'İşçi veya devir kaydı müdahale bekliyor.', rank: 1 });
      else if (handoff === 'READY_WORK' || handoff === 'READY_CLAUDE') priorities.push({ projectId: p.id, kind: 'review', title: p.name + ' inceleme bekliyor', body: status.taskTitle || 'Son teslim ve kanıtları incele.', rank: 2 });
      if (!blocked && !stale && (handoff === 'USER_TEST_READY' || /NOT_RUN|DEVICE_PENDING|PENDING|OPEN/.test(gates.deviceQa))) priorities.push({ projectId: p.id, kind: 'device-test', title: p.name + ' cihaz kabulü', body: 'Kayıtlı cihaz kapısı: ' + gates.deviceQa + '. Gerçek telefonda doğrulama gerekli.', rank: 3 });
      if (stale) priorities.push({ projectId: p.id, kind: 'stale', title: p.name + ' durumunu güncelle', body: updatedAt ? 'Son durum kaydı eski; canlı çalışma kabul edilmedi.' : 'Bu oyun için zaman damgalı durum kaydı alınamadı.', rank: 2 });
      return { ...p, status, jobs: actualJobs, events: actualEvents, runs: actualRuns, release, counts, blocked };
    });
    priorities.sort((a, b) => a.rank - b.rank || PROJECTS.findIndex(p => p.id === a.projectId) - PROJECTS.findIndex(p => p.id === b.projectId));
    const loadedAt = iso(raw.loadedAt), loaded = stamp(loadedAt), cov = coverage(raw, now);
    const state = ['ready', 'loading', 'error', 'unauthenticated', 'demo'].includes(raw.state) ? raw.state : 'unauthenticated';
    return deepFreeze({ accountKey: text(raw.accountKey, 200) || null, revision: Number.isSafeInteger(raw.revision) ? raw.revision : 0, state, loadedAt,
      stale: loaded === null || now - loaded > 120000 || loaded > now + 300000, coverage: cov, metadataState: options.metadataState || (meta.games ? 'recorded' : 'unavailable'),
      connection: connectionSnapshot(bridge, bridgeMatches),
      projects, jobs, events, runs, releases: projects.map(p => p.release), priorities,
      summary: { activeJobs: jobs.filter(j => j.status === 'running').length, queuedJobs: jobs.filter(j => ['queued', 'recorded', 'claimed'].includes(j.status)).length, blockedProjects: projects.filter(p => p.blocked).length, verifiedCompletedToday: jobs.filter(j => j.verifiedCompletedToday).length, unknownProjects: projects.filter(p => !p.status.updatedAt).length },
      today, policy: { extraModelSpendAllowed: 0, summaryEngine: 'DETERMINISTIC_LOCAL', newQaExecuted: false } });
  }
  function create(options) {
    options = options || {}; const panel = options.panel, bridge = options.bridge, clock = options.clock || Date.now;
    if (!panel || typeof panel.getStudioSnapshot !== 'function' || typeof panel.refreshStudioSnapshot !== 'function') throw new TypeError('Scoped studio snapshot facade required');
    const listeners = new Set(), doc = own(options, 'document') ? options.document : typeof document !== 'undefined' ? document : null;
    let disposed = false, generation = 0, raw = object(panel.getStudioSnapshot()), metadata = object(options.metadata), metadataState = metadata.games ? 'recorded' : 'unavailable', inflight = null;
    let accountKey = text(raw.accountKey, 200) || null, snapshot, minute = -1, localRevision = 0;
    const bridgeSnapshot = () => bridge && typeof bridge.getSnapshot === 'function' ? bridge.getSnapshot() : {};
    function build() { minute = Math.floor(clock() / 60000); snapshot = normalize({ ...raw, revision: ++localRevision }, { now: clock(), metadata, metadataState, bridgeSnapshot: bridgeSnapshot() }); return snapshot; }
    function publish() { if (disposed) return; const s = build(); for (const f of [...listeners]) try { f(s); } catch (_) {} }
    function sync() {
      const next = object(panel.getStudioSnapshot()), nextKey = text(next.accountKey, 200) || null;
      if (nextKey !== accountKey) { generation++; inflight = null; accountKey = nextKey; raw = { ...next, events: [], runs: [], statuses: [], releases: [] }; }
      else raw = next;
      publish();
    }
    async function refresh() {
      if (disposed) return snapshot;
      sync(); if (inflight) return inflight;
      const gen = generation, key = accountKey;
      const pending = Promise.resolve().then(() => panel.refreshStudioSnapshot()).then(result => {
        if (disposed || gen !== generation || key !== (text(object(panel.getStudioSnapshot()).accountKey, 200) || null)) return snapshot;
        const incoming = object(result || panel.getStudioSnapshot());
        if ((text(incoming.accountKey, 200) || null) !== key) return snapshot;
        raw = incoming; publish(); return snapshot;
      }, () => { if (!disposed && gen === generation) { raw = { ...raw, state: 'error', coverage: { ...object(raw.coverage), events: { state: 'error' }, runs: { state: 'error' } } }; publish(); } return snapshot; }).finally(() => { if (inflight === pending) inflight = null; });
      inflight = pending; return pending;
    }
    async function loadMetadata() {
      if (metadata.games || options.fetch === false) return;
      const fetcher = options.fetch || (typeof fetch === 'function' ? fetch : null); if (!fetcher) return;
      const abort = typeof AbortController === 'function' ? new AbortController() : null;
      const timeout = setTimeout(() => abort && abort.abort(), 10000);
      try {
        const response = await fetcher('data/game-builds.json', { cache: 'no-cache', credentials: 'same-origin', signal: abort && abort.signal });
        if (!response.ok) throw new Error('Metadata unavailable');
        const declared = Number(response.headers && response.headers.get && response.headers.get('content-length'));
        if (declared > 2097152) throw new Error('Metadata too large');
        const source = await response.text(); if (source.length > 2097152) throw new Error('Metadata too large');
        const decoded = JSON.parse(source); if (!Array.isArray(decoded.games) || decoded.games.length > 10) throw new Error('Metadata invalid');
        if (!disposed) { metadata = decoded; metadataState = 'recorded'; publish(); }
      } catch (_) { if (!disposed) { metadataState = 'unavailable'; publish(); } }
      finally { clearTimeout(timeout); }
    }
    const events = ['oryvona:studio-data-change', 'oryvona:studio-context-change', 'oryvona:ready'];
    for (const e of events) if (doc && doc.addEventListener) doc.addEventListener(e, sync);
    const unsubscribeBridge = bridge && typeof bridge.subscribe === 'function' ? bridge.subscribe(() => { sync(); }) : null;
    const unsubscribePanel = typeof panel.subscribeStudioSnapshot === 'function' ? panel.subscribeStudioSnapshot(sync) : null;
    build(); const ready = Promise.all([loadMetadata(), refresh()]).then(() => snapshot);
    return Object.freeze({ getSnapshot() { const next = object(panel.getStudioSnapshot()); if ((text(next.accountKey, 200) || null) !== accountKey) sync(); else if (minute !== Math.floor(clock() / 60000)) build(); return snapshot; },
      subscribe(callback) { if (typeof callback !== 'function') throw new TypeError('Listener required'); listeners.add(callback); return () => listeners.delete(callback); }, refresh, ready,
      destroy() { if (disposed) return; disposed = true; generation++; listeners.clear(); for (const e of events) if (doc && doc.removeEventListener) doc.removeEventListener(e, sync); if (typeof unsubscribeBridge === 'function') unsubscribeBridge(); if (typeof unsubscribePanel === 'function') unsubscribePanel(); } });
  }
  return Object.freeze({ create, normalize, projectId, dayWindow, normalizeGates, safeArtifact, safeStoreUrl, safeEntry, stageId, PROJECTS });
});
