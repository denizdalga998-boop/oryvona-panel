/* Only authenticated read refreshes run automatically. Work dispatch needs an explicit user action. */
(function (root, factory) {
  'use strict'; var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.OryvonaStudioFlowBootstrap = api; root.OryvonaStudioFlowLifecycle = api.start({ window: root, document: root.document }); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function start(options) {
    options = options || {}; var win = options.window, doc = options.document || win && win.document, clock = options.clock || Date.now;
    if (!win || !doc) return Object.freeze({ refresh: function () { return Promise.resolve(null); }, destroy: function () {}, getClient: function () { return null; } });
    var disposed = false, suspended = false, client = null, mountedOwner = null, epoch = 0, lastRead = -Infinity, listeners = [], timer = null;
    function host() { return win.OryvonaStudioHost; }
    function context() { return host() && typeof host().context === 'function' ? host().context() || {} : {}; }
    function owner() { var c = context(); return c.authenticated === true && c.isOwner === true && c.demo !== true && UUID.test(c.userId || '') ? c.userId : null; }
    function active() { return !doc.hidden && ['jarvis', 'feed'].includes(context().view); }
    function clear() { epoch++; try { if (client) client.dispose(); } finally { client = null; mountedOwner = null; lastRead = -Infinity; } }
    async function submit(payload) {
      var who = owner(), ticket = epoch; if (!who || who !== mountedOwner || who !== payload.expectedUserId || !active() || context().view !== 'jarvis' || !UUID.test(payload.requestId || '') || !UUID.test(payload.sourceRequestId || '')) return { accepted: false };
      var response = await host().request('submitIntent', { expectedUserId: who, requestId: payload.requestId, requestedProject: payload.projectId, text: payload.text, attachments: [], studioFlow: { schemaVersion: 1, sourceRequestId: payload.sourceRequestId } });
      if (disposed || suspended || ticket !== epoch || owner() !== who || mountedOwner !== who || response && response.error) return { accepted: false };
      var answer = response && Object.prototype.hasOwnProperty.call(response, 'data') ? response.data : response;
      var id = answer && (answer.request_id || answer.requestId || answer.id);
      if (id !== payload.requestId || answer.requested_project && answer.requested_project !== payload.projectId) return { accepted: false };
      return { accepted: true, requestId: id };
    }
    function ensure() {
      if (disposed || suspended) return null;
      var who = owner(); if (who !== mountedOwner) clear();
      if (!who || !host() || !win.OryvonaStudioFlow || typeof win.OryvonaStudioFlow.create !== 'function') return null;
      if (!client) { mountedOwner = who; client = win.OryvonaStudioFlow.create({ host: host(), panel: win.OryvonaPanel, document: doc, clock: clock, allowedArtifactOrigins: options.allowedArtifactOrigins, autoRefresh: false, onWork: submit }); }
      return client;
    }
    async function refresh(force) {
      var instance = ensure(); if (!instance || !active()) return null;
      var now = clock(); if (force !== true && now - lastRead < 15000) return instance.getSnapshot();
      lastRead = now; return instance.refresh();
    }
    function sync() { if (disposed || suspended) return; void refresh(false).catch(function () {}); }
    function startTimer() { if (timer === null && typeof win.setInterval === 'function') timer = win.setInterval(sync, 30000); }
    function stopTimer() { if (timer !== null && typeof win.clearInterval === 'function') win.clearInterval(timer); timer = null; }
    function listen(target, type, fn) { if (!target || typeof target.addEventListener !== 'function') return; target.addEventListener(type, fn); listeners.push(function () { target.removeEventListener(type, fn); }); }
    listen(doc, 'oryvona:ready', sync); listen(doc, 'oryvona:view-change', sync); listen(doc, 'oryvona:studio-context-change', sync); listen(doc, 'visibilitychange', sync);
    listen(win, 'pagehide', function () { suspended = true; stopTimer(); clear(); });
    listen(win, 'pageshow', function () { if (disposed) return; suspended = false; startTimer(); sync(); });
    startTimer(); sync();
    return Object.freeze({
      refresh: function () { return refresh(true); },
      getClient: function () { return client; },
      stopWorker: function (payload) {
        var instance = ensure();
        return instance && typeof instance.requestWorkerStop === 'function' ? instance.requestWorkerStop(payload) : Promise.resolve({ accepted: false });
      },
      exportWorkerHistory: function (payload) {
        var instance = ensure();
        return instance && typeof instance.exportWorkerHistory === 'function' ? instance.exportWorkerHistory(payload) : Promise.resolve({ accepted: false });
      },
      downloadWorkerHistory: function (payload) {
        var instance = ensure();
        return instance && typeof instance.downloadWorkerHistory === 'function' ? instance.downloadWorkerHistory(payload && payload.workerId ? payload.workerId : payload) : Promise.resolve({ accepted: false });
      },
      destroy: function () { if (disposed) return; disposed = true; stopTimer(); clear(); listeners.forEach(function (off) { off(); }); listeners = []; }
    });
  }
  return Object.freeze({ start: start });
});
