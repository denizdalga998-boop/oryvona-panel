/* Google AI Studio transport. No key, model call, microphone or worker starts at mount. */
(function (root, factory) {
  'use strict'; var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OryvonaStudioGemini = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var LIVE_MODEL = 'gemini-3.8-live';
  var ENDPOINT = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';
  function fold(v) { return String(v || '').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i'); }
function classifyOwnerSource(text, catalog) {
  if (typeof text !== 'string' || !text.trim() || text.length > 8000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) return { explicit: false, project: null, reason: 'invalid_source' };
  const normalized = fold(text);
  const names = [ ['koza', /\bkoza(?:nin|yi|ya|da|daki|dan)?\b/], ['charm-drop', /\b(?:charm[\s-]*drop|chandrop)(?:ta|taki|u|da|a|un)?\b/], ['forge-run', /\bforge[\s-]*run(?:da|daki|i|u)?\b/], ['aeryo', /\baeryo(?:da|daki|yu|nun)?\b/], ['tupsper', /\b(?:tupsper|tuckspire|boks oyunu)\b/], ['oryvona-panel', /\b(?:oryvona[\s-]*panel|panel(?:i|de|deki|in|imiz)?|uygulama(?:yi|da|daki|nin)?)\b/] ];
  const matches = names.filter(([, re]) => re.test(normalized)).map(([id]) => id);
  (Array.isArray(catalog)?catalog:[]).forEach(function(p){
    if(!p||!/^[a-z][a-z0-9-]{0,63}$/.test(p.id))return;
    var found=[p.id,p.name].some(function(name){var a=fold(name).replace(/[-_]+/g,' ').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return a&&new RegExp('(?<![\\p{L}\\p{N}])'+a+'(?:[’\']?(?:nin|nun|yi|yu|da|de|ta|te|dan|den|daki|deki))?(?![\\p{L}\\p{N}])','u').test(normalized.replace(/[-_]+/g,' '));});
    if(found&&!matches.includes(p.id))matches.push(p.id);
  });
  if(matches.some(id=>id!=='oryvona-panel')&&!/oryvona[\s-]*(?:games[\s-]*)?panel|(?:jarvis|argon)\s+(?:arayuz|sistem)/.test(normalized)){const at=matches.indexOf('oryvona-panel');if(at>=0)matches.splice(at,1);}
  // Jarvis/Argon may address the assistant, so a bare vocative cannot select the panel.
  if (!matches.length && /\b(?:jarvis|argon)(?:['’](?:i|u|un|nun)\b|\s+(?:sistem(?:i|ini)?|arayuz(?:u|unu)?|kod(?:u|unu)?|modul(?:u|unu)?)\b)/.test(normalized)) matches.push('oryvona-panel');
  // Target must occur in the owner's source. Neither model output nor a client hint grants scope.
  const project = matches.length === 1 ? matches[0] : null;
  if (/\b(?:yapma|degistirme|duzeltme|baslatma|gonderme|calistirma|olusturma|ekleme|silme|kod yazma|gorev verme|sadece sohbet|sadece fikir|sadece soruyorum|istemiyorum|desem|desek|dersem|dersek|deseydim|deseydik|diyelim|varsayalim|farz|ornek|ornegin|hypothetical|example|nasil|neden|niye)\b/.test(normalized)) return { explicit: false, project, reason: 'non_action_or_negated' };
  // v2.8 planlama halkası: ayrıntısız sonuç hedefi ("Charm Drop'u bitir", "Charm Drop'a devam et") da açık iştir; planlamayı sunucu doğrular.
  const command = /\b(?:duzelt|duzeltir misin|duzeltebilir misin|gelistir|gelistirebilir misin|gelistirir misin|ekle|ekler misin|ekleyebilir misin|uygula|degistir|olustur|kodla|tamir et|test et|incele|denetle|onar|iyilestir|hazirla|guncelle|dizayn et|tasarla)\b/.test(normalized)
    || /(?<![\p{L}\p{N}])(?:bitir|tamamla|ilerlet|surdur|sonuclandir|hallet|halled|devam\s+e[td]|sonraki\s+(?:asama|adim)\p{L}*\s+(?:gec|tasi)|ne\s+gerekiyorsa\s+yap)/u.test(normalized);
  const requestedFault = /\b(?:hata|bug|bozuk|calismiyor|tasiyor|kesiliyor|donuyor|cokuyor|duzeltme|gelistirme)\b/.test(normalized) && /\b(?:istiyorum|istiyoruz|gider|coz|gorev|yapabilir misin)\b/.test(normalized);
  const directFaultReport = Boolean(project) && !/[?？]/.test(text) && /\b(?:calismiyor|tasiyor|kesiliyor|donuyor|cokuyor|bozuk|hata var|hata veriyor|acilmiyor|titriyor|takiliyor)\b/.test(normalized);
  if (!(command || requestedFault || directFaultReport)) return { explicit: false, project, reason: 'conversation_only' };
  if (/\b(?:yayinla|publish|production|deploy|format|wipe|delete|sil|eposta gonder|mesaj gonder)\b/.test(normalized)) return { explicit: false, project, reason: 'separate_authorization_required' };
  return { explicit: true, project, reason: project ? 'explicit_task' : 'project_clarification_required' };
}

  function explicitTask(v,catalog) { return classifyOwnerSource(v,catalog).explicit; }
  function sourceProject(v,catalog) { return classifyOwnerSource(v,catalog).project; }
  function create(options) {
    options = options || {}; var host = options.host, win = options.window || (typeof window !== 'undefined' ? window : {});
    if (!host || typeof host.request !== 'function' || typeof options.getAccountKey !== 'function') throw new TypeError('Authenticated Google transport required');
    var catalog=[],catalogOwner=null;
    var disposed = false, epoch = 0, liveAttempt = 0, live = null, listeners = new Set(), removers = [];
    var state = { live: false, interactionStatus: 'IDLE', model: null, error: null };
    function snapshot() { return Object.freeze(Object.assign({}, state)); }
    function emit() { listeners.forEach(function (fn) { try { fn(snapshot()); } catch (_) {} }); }
    function owner() { return options.getAccountKey() || null; }
    function current(key, ticket) { return !disposed && key && key === owner() && ticket === epoch; }
    async function request(operation, payload) {
      var key = owner(), ticket = epoch;if(key!==catalogOwner){catalog=[];catalogOwner=key;} if (!key || disposed) return { ok: false, error: 'ACCOUNT_REQUIRED' };
      var identity = typeof host.context === 'function' ? host.context() : null;
      var uid = identity && identity.userId;
      if (!identity || !identity.authenticated || !identity.isOwner || identity.demo || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uid || '') || key.split(':')[0] !== uid) return { ok: false, error: 'OWNER_AUTH_REQUIRED' };
      var r = await host.request(operation, Object.assign({}, payload, { accountKey: key, expectedUserId: uid }));
      if (!current(key, ticket)) return { ok: false, error: 'ACCOUNT_CHANGED' };
      if (host.context().userId !== uid) return { ok: false, error: 'ACCOUNT_CHANGED' };
      if (r && r.error) return { ok: false, error: 'GOOGLE_TRANSPORT_UNAVAILABLE' };
      var data=r && Object.prototype.hasOwnProperty.call(r, 'data') ? r.data : r;
      if(Array.isArray(data?.project_catalog))catalog=data.project_catalog.slice(0,128).filter(p=>p&&/^[a-z][a-z0-9-]{0,63}$/.test(p.id)).map(p=>({id:p.id,name:String(p.name||p.id).slice(0,120)}));
      return data;
    }
    function close(reason) {
      liveAttempt++; var c = live; live = null;
      if (c) { c.closed = true; c.pendingTools.clear(); if (c.timer) clearTimeout(c.timer); if (!c.ready) c.resolve({ ok: false, reason: 'CANCELLED' }); try { c.socket.close(1000, 'owner-stop'); } catch (_) {} if (typeof c.handlers.onEnd === 'function') c.handlers.onEnd({ reason: reason || 'stopped' }); }
      state.live = false; state.interactionStatus = 'IDLE'; state.model = null; emit();
    }
    function send(c, message) { if (live === c && !c.closed && c.socket.readyState === 1) { c.socket.send(JSON.stringify(message)); return true; } return false; }
    async function onTools(c, calls) {
      for (var i = 0; i < calls.length; i++) {
        var call = calls[i]; if (live !== c || c.closed) return;
        if (!call || call.name !== 'create_worker_task' || typeof call.id !== 'string' || !call.id || c.pendingTools.has(call.id)) continue;
        c.pendingTools.add(call.id);
        var args = call.args || {}, response;
        var target = String(args.project || args.projectId || '').toLowerCase().replace(/[ _]+/g, '-');
        target = ({ tuckspire: 'tupsper', charmdrop: 'charm-drop', forgerun: 'forge-run', panel: 'oryvona-panel' })[target] || target;
        var candidates = c.turns.filter(function (turn) { return turn.finalized && !turn.consumed && turn.project === target && explicitTask(turn.source,catalog); });
        if (!candidates.length && c.currentTurn && !c.currentTurn.finalized && sourceProject(c.input,catalog) === target && explicitTask(c.input,catalog)) { c.pendingTools.delete(call.id); c.deferredCalls.push(call); continue; }
        var turn = candidates.length === 1 ? candidates[0] : null, source = turn && turn.source;
        if (!source) response = { status: 'rejected', reason: candidates.length > 1 ? 'AMBIGUOUS_SOURCE_TURN' : 'EXPLICIT_OWNER_TASK_REQUIRED', message: 'Açık ve tekil kaynak görev doğrulanamadı; günlük sohbet işçi kuyruğuna gönderilmedi.' };
        else {
          var sourceKey = JSON.stringify([turn.id, source, target]);
          if (!c.sourceTasks.has(sourceKey)) {
            var id = win.crypto.randomUUID();
            var operation = request('createWorkerTask', { requestId: id, sourceRequestId: c.requestId, liveSessionId: c.requestId, sourceText: source, originalText: source, toolCallId: call.id, project: target, instruction: source, task: args }).then(function (receipt) {
              var uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
              if (!receipt || receipt.accepted !== true || receipt.status !== 'durably_queued' || (receipt.requestId || receipt.commandId) !== id || !uuid.test(id) || !(uuid.test(receipt.flowId || '') || (receipt.mode === 'studio-review' && uuid.test(receipt.jobId || '')))) return { status: 'not_queued', reason: 'DURABLE_RECEIPT_REQUIRED' };
              turn.consumed = true;
              return receipt;
            }).catch(function () { return { status: 'not_queued', reason: 'QUEUE_UNAVAILABLE' }; });
            c.sourceTasks.set(sourceKey, operation);
          }
          response = await c.sourceTasks.get(sourceKey);
        }
        if (live !== c || c.closed || c.owner !== owner()) return;
        send(c, { toolResponse: { functionResponses: [{ id: call.id, name: call.name, response: response }] } });
        if (typeof c.handlers.onTask === 'function') c.handlers.onTask(response);
      }
    }
    async function message(c, event) {
      if (live !== c || c.closed || c.owner !== owner()) return;
      var raw = event.data; if (raw && typeof raw.text === 'function') raw = await raw.text();
      if (live !== c || c.closed) return;
      if (typeof raw === 'string' && raw.length > 4 * 1024 * 1024) return;
      var value; try { value = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) { return; }
      if (!value || typeof value !== 'object') return;
      if (value.error) {
        var e = value.error, detail = String(typeof e === 'object' ? (e.message || e.status || e.code || 'hata') : e).slice(0, 200);
        state.error = 'GOOGLE_LIVE_ERROR'; emit();
        if (!c.ready) c.resolve({ ok: false, reason: 'GOOGLE_LIVE_ERROR', message: 'Google canlı ses hatası: ' + detail });
        close('error'); return;
      }
      if (value.setupComplete || value.setup_complete) { c.ready = true; if (c.timer) clearTimeout(c.timer); c.resolve({ ok: true, stop: function () { if (live === c) close(); }, sendAudio: function (b64) { if (c.ready && typeof b64 === 'string' && b64.length <= 65536) send(c, { realtimeInput: { audio: { data: b64, mimeType: 'audio/pcm;rate=16000' } } }); }, endAudio: function () { send(c, { realtimeInput: { audioStreamEnd: true } }); } }); }
      var content = value.serverContent || value.server_content || {};
      var status = value.interaction_status || value.interactionStatus || content.interaction_status || content.interactionStatus;
      if (status && typeof status === 'object') status = status.status;
      if (status === 'IN_PROGRESS' || status === 'IDLE') { state.interactionStatus = status; emit(); if (typeof c.handlers.onInteraction === 'function') c.handlers.onInteraction(status); }
      if (content.interrupted) {
        c.turnInterrupted = true;
        c.newInput = true;
        if (c.currentTurn) { c.currentTurn.finalized = true; c.currentTurn.interrupted = true; }
        if (c.output && typeof c.handlers.onReply === 'function') c.handlers.onReply(c.output, { final: true, interrupted: true, turnId: c.turnId || 1 });
        if (typeof c.handlers.onInterrupted === 'function') c.handlers.onInterrupted({ turnId: c.turnId || 1 });
      }
      var input = content.inputTranscription || content.input_transcription;
      if (input && typeof input.text === 'string') {
        var bargeIn = (c.output || c.audioStarted) && !c.turnInterrupted && !c.newInput;
        if (bargeIn) {
          if (c.output && typeof c.handlers.onReply === 'function') c.handlers.onReply(c.output, { final: true, interrupted: true, turnId: c.turnId || 1 });
          if (typeof c.handlers.onInterrupted === 'function') c.handlers.onInterrupted({ turnId: c.turnId || 1 });
        }
        if (c.newInput || !c.input || (c.currentTurn && c.currentTurn.finalized) || bargeIn) {
          c.input = ''; c.output = ''; c.audioStarted = false; c.turnInterrupted = false; c.newInput = false;
          c.turnId++; c.currentTurn = { id: c.turnId, source: '', finalized: false, project: null, consumed: false };
          c.turns.push(c.currentTurn); if (c.turns.length > 12) c.turns.shift();
        }
        c.input += input.text;
        c.currentTurn.source = c.input.trim(); c.currentTurn.project = sourceProject(c.input,catalog); if (input.finished === true) c.currentTurn.finalized = true;
        if (typeof c.handlers.onTranscript === 'function') c.handlers.onTranscript(c.input, { final: input.finished === true, turnId: c.turnId });
      }
      var output = content.outputTranscription || content.output_transcription;
      if (output && typeof output.text === 'string' && !c.turnInterrupted) {
        if (!c.turnId) c.turnId = 1;
        c.output += output.text;
        if (typeof c.handlers.onReply === 'function') c.handlers.onReply(c.output, { final: output.finished === true, interrupted: false, turnId: c.turnId });
      }
      var parts = !c.turnInterrupted ? ((content.modelTurn || content.model_turn || {}).parts || []) : [];
      parts.forEach(function (part) {
        var audio = part.inlineData || part.inline_data;
        if (audio && /^audio\/pcm(?:;|$)/i.test(audio.mimeType || audio.mime_type || '') && typeof c.handlers.onAudio === 'function') {
          if (!c.turnId) c.turnId = 1;
          c.audioStarted = true;
          c.handlers.onAudio(audio.data, audio.mimeType || audio.mime_type, { turnId: c.turnId });
        }
      });
      if (content.turnComplete || content.turn_complete) {
        if (c.currentTurn) c.currentTurn.finalized = true;
        if (!c.turnInterrupted) {
          if (typeof c.handlers.onTranscript === 'function' && c.input) c.handlers.onTranscript(c.input, { final: true, turnId: c.turnId || 1 });
          if (typeof c.handlers.onReply === 'function' && c.output) c.handlers.onReply(c.output, { final: true, interrupted: false, turnId: c.turnId || 1 });
        }
        c.newInput = true;
        // Retain connection across turns; never close the session at turnComplete.
        if (typeof c.handlers.onTurnComplete === 'function') c.handlers.onTurnComplete({ turnId: c.turnId || 1, interactionStatus: state.interactionStatus });
      }
      var tools = value.toolCall || value.tool_call; if (tools) onTools(c, tools.functionCalls || tools.function_calls || []).catch(function () {});
      if (c.currentTurn && c.currentTurn.finalized && c.deferredCalls.length) { var deferred = c.deferredCalls.splice(0); onTools(c, deferred).catch(function () {}); }
    }
    /* Every live failure keeps its real cause: the DJ-KABIN token status, the server note, or Google's WebSocket close code/reason. */
    function reasonOf(value, fallback) {
      var raw = value && (value.code || value.error || value.status || value.reason);
      return String(raw || fallback || 'UNKNOWN').replace(/[^A-Za-z0-9_.:-]+/g, '_').slice(0, 60);
    }
    async function startLive(handlers) {
      handlers = handlers || {};
      if (handlers.gesture !== true) return { ok: false, reason: 'EXPLICIT_PHONE_GESTURE_REQUIRED' };
      close('restarted'); var key = owner(), ticket = epoch, attempt = liveAttempt, id = win.crypto.randomUUID();
      var token;
      try { token = await request('geminiLiveToken', { requestId: id, voice: handlers.voice || 'Charon' }); }
      catch (error) {
        var note = error && typeof error.message === 'string' && error.message !== error.code ? ': ' + error.message.slice(0, 140) : '';
        return { ok: false, reason: 'LIVE_TOKEN_FAILED', message: 'DJ-KABIN canlı ses anahtarı veremedi (' + reasonOf(error, 'TRANSPORT') + note + ').' };
      }
      if (!current(key, ticket) || attempt !== liveAttempt) return { ok: false, reason: 'GOOGLE_LIVE_UNAVAILABLE', message: 'Canlı ses isteği iptal edildi.' };
      if (!token || token.ok !== true) return { ok: false, reason: 'LIVE_TOKEN_FAILED', message: 'Canlı ses anahtarı alınamadı (' + reasonOf(token, 'yanıt yok') + (token && token.detail ? ': ' + String(token.detail).slice(0, 160) : '') + ').' };
      if (typeof token.token !== 'string' || token.websocketUrl !== ENDPOINT) return { ok: false, reason: 'GOOGLE_LIVE_UNAVAILABLE', message: 'Canlı ses anahtarı beklenen biçimde gelmedi (adres veya anahtar uyuşmuyor).' };
      var setup = token.setup; if (!setup || String(setup.model || '').replace(/^models\//, '') !== LIVE_MODEL) return { ok: false, reason: 'GOOGLE_LIVE_SETUP_INVALID', message: 'Canlı ses kurulumu beklenen model (' + LIVE_MODEL + ') için değil: ' + String(setup && setup.model || 'yok').slice(0, 80) + '.' };
      return new Promise(function (resolve) {
        var socket; try { socket = new win.WebSocket(ENDPOINT + '?access_token=' + encodeURIComponent(token.token)); } catch (_) { resolve({ ok: false, reason: 'WEBSOCKET_UNAVAILABLE', message: 'Bu telefonda WebSocket açılamadı.' }); return; }
        token = null; // The ephemeral credential is never persisted or exposed on window.
        var c = { socket: socket, handlers: handlers, owner: key, requestId: id, resolve: resolve, ready: false, closed: false, input: '', output: '', audioStarted: false, turnInterrupted: false, newInput: false, turnId: 0, currentTurn: null, turns: [], deferredCalls: [], pendingTools: new Set(), sourceTasks: new Map(), timer: null };
        function failSetup(reason, text) { if (live === c && !c.ready) { state.error = text; resolve({ ok: false, reason: reason, message: text }); close('error'); } }
        live = c; state.live = true; state.model = LIVE_MODEL; state.error = null; state.interactionStatus = 'IDLE'; emit();
        c.timer = setTimeout(function () { failSetup('LIVE_SETUP_TIMEOUT', 'Google canlı ses kurulumu 20 sn içinde tamamlanmadı.'); }, 20000);
        socket.onopen = function () { if (live === c && current(key, ticket)) send(c, { setup: setup }); else try { socket.close(); } catch (_) {} };
        socket.onmessage = function (event) { message(c, event).catch(function () { if (live === c) close('error'); }); };
        // An error event carries no detail; the close event that follows has Google's code and reason, so it is awaited briefly.
        socket.onerror = function () { if (live !== c) return; if (c.ready) { close('error'); return; } setTimeout(function () { failSetup('LIVE_CONNECTION_FAILED', 'Google canlı ses sunucusuna bağlanılamadı (ağ hatası, kapanış kodu gelmedi).'); }, 1500); };
        socket.onclose = function (event) {
          if (live !== c) return;
          var code = event && event.code, why = event && event.reason ? String(event.reason).slice(0, 200) : '';
          var text = 'Google canlı ses bağlantısı kapandı (kod ' + (code || '?') + (why ? ': ' + why : '') + ').';
          state.error = text; if (!c.ready) resolve({ ok: false, reason: 'LIVE_CONNECTION_CLOSED', message: text, closeCode: code || null });
          close('disconnected');
        };
      });
    }
    function bind(target, name, fn) { if (target && typeof target.addEventListener === 'function') { target.addEventListener(name, fn); removers.push(function () { target.removeEventListener(name, fn); }); } }
    bind(win.document, 'visibilitychange', function () { if (win.document.hidden) close('hidden'); });
    bind(win.document, 'oryvona:lifecycle-pause', function () { close('pause'); });
    bind(win.document, 'oryvona:studio-context-change', function () { if (live && live.owner !== owner()) { epoch++; close('account-change'); } });
    bind(win, 'pagehide', function () { close('pagehide'); });
    return Object.freeze({ requestChat: function (p) { return request('geminiChat', p); }, synthesize: function (p) { return request('geminiTts', p); }, startLive: startLive, stopLive: close, getSnapshot: snapshot, subscribe: function (fn) { listeners.add(fn); fn(snapshot()); return function () { listeners.delete(fn); }; }, destroy: function () { close('destroyed'); disposed = true; epoch++; removers.forEach(function (off) { off(); }); listeners.clear(); } });
  }
  return Object.freeze({ create: create, isExplicitTask: explicitTask, classifyOwnerSource: classifyOwnerSource, LIVE_MODEL: LIVE_MODEL, LIVE_ENDPOINT: ENDPOINT });
});
