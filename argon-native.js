/* ARGON native shim, main-frame message-port protocol 1. No Java object is injected into frames. */
(function () {
  'use strict';
  var origin = 'https://denizdalga998-boop.github.io', path = '/oryvona-panel/';
  if (window.top !== window || !window.location || window.location.origin !== origin ||
      (window.location.pathname !== path && window.location.pathname !== path + 'index.html') ||
      !window.__ARGON_NATIVE_BOOT__ || window.__ARGON_NATIVE_BOOT__.channel !== 'capabilities' || window.__argonNative) return;
  var caps = window.__ARGON_NATIVE_BOOT__, port = null, paused = false, seq = 0;
  var utterances = Object.create(null), recognitions = Object.create(null), listeners = [], launches = Object.create(null), personal = Object.create(null), replies = Object.create(null);
  function dispatch(target, name, event) { try { if (typeof target['on' + name] === 'function') target['on' + name](event || { type: name }); } catch (_) {} }
  function command(message) {
    if (!port || paused) return false;
    try { port.postMessage(JSON.stringify(message)); return true; } catch (_) { return false; }
  }
  function flushPersonal() {
    Object.keys(personal).forEach(function(id){var p=personal[id];if(!p.sent)p.sent=command(p.message);});
  }
  // The 15 s budget counts only foreground time: a paused app (permission screen, lock screen, app switch) cannot answer, so the
  // timer stops on pause and restarts on resume. A resend after resume keeps the SAME id; native executes an id once per page and
  // re-delivers a completed reply, so a write is never run twice.
  function armPersonal(id){var p=personal[id];if(!p||paused||p.timer)return;p.timer=setTimeout(function(){if(personal[id]!==p)return;delete personal[id];p.reject(new Error('native_not_ready'));},15000);}
  function disarmPersonal(){Object.keys(personal).forEach(function(id){var p=personal[id];if(p.timer){clearTimeout(p.timer);p.timer=null;}});}
  function personalRpc(op,payload) {
    return new Promise(function(resolve,reject){
      var id='p'+(++seq),entry={message:Object.assign({op:op,id:id},payload||{}),resolve:resolve,reject:reject,sent:false,timer:null};
      personal[id]=entry;armPersonal(id);flushPersonal();
    });
  }
  // v1.7: Paylaş / Kopyala under an Argon reply. Text only; the APK answers once per id (opened, copied, no_app, invalid...).
  function nativeText(op, prefix, channel, text, supported) {
    var value = String(text == null ? '' : text);
    if (!supported) return Promise.resolve({ status: 'unsupported' });
    if (!value.trim() || value.length > 12000) return Promise.resolve({ status: 'invalid' });
    return new Promise(function (resolve) {
      var id = prefix + (++seq), entry = { channel: channel, resolve: resolve, timer: null };
      entry.timer = setTimeout(function () { if (replies[id] === entry) { delete replies[id]; resolve({ status: 'no_reply' }); } }, 4000);
      replies[id] = entry;
      if (!command({ op: op, id: id, text: value })) { clearTimeout(entry.timer); delete replies[id]; resolve({ status: 'native_not_ready' }); }
    });
  }
  function selectedVoice() {
    var voice = caps.voice;
    if (!caps.ttsReady || !voice || !/^tr(?:-|$)/i.test(voice.lang || '')) return [];
    return [Object.freeze({ name: String(voice.name), lang: String(voice.lang), localService: voice.localService === true, voiceURI: String(voice.voiceURI), default: true })];
  }
  function voicesChanged() {
    dispatch(synth, 'voiceschanged');
    listeners.slice().forEach(function (fn) { try { fn({ type: 'voiceschanged' }); } catch (_) {} });
  }
  function Utterance(text) { this.text = String(text || ''); this.lang = 'tr-TR'; this.rate = 1; this.pitch = 1; this.volume = 1; this.voice = null; }
  function finish(id, event, detail) {
    var utterance = utterances[id]; if (!utterance) return;
    delete utterances[id];
    synth.speaking = Object.keys(utterances).some(function (key) { return utterances[key]._argonStarted; });
    synth.pending = Object.keys(utterances).some(function (key) { return !utterances[key]._argonStarted; });
    dispatch(utterance, event === 'end' ? 'end' : 'error', event === 'end' ? { type: 'end' } : { type: 'error', error: detail || 'synthesis-failed' });
  }
  var synth = {
    speaking: false, pending: false, paused: false, onvoiceschanged: null,
    getVoices: selectedVoice,
    speak: function (utterance) {
      if (!utterance) return;
      synth.cancel();
      var id = 'u' + (++seq); utterance._argonStarted = false; utterances[id] = utterance; synth.pending = true;
      if (!command({ op: 'speak', id: id, text: String(utterance.text || '').slice(0, 3900), rate: Number(utterance.rate) || 1, pitch: Number(utterance.pitch) || 1, volume: utterance.volume === undefined ? 1 : Number(utterance.volume) })) finish(id, 'error', 'native-not-ready');
    },
    cancel: function () { utterances = Object.create(null); synth.speaking = false; synth.pending = false; command({ op: 'cancelSpeech' }); },
    pause: function () {}, resume: function () {},
    addEventListener: function (name, fn) { if (name === 'voiceschanged' && typeof fn === 'function' && listeners.indexOf(fn) < 0) listeners.push(fn); },
    removeEventListener: function (name, fn) { if (name === 'voiceschanged') listeners = listeners.filter(function (value) { return value !== fn; }); }
  };
  function Recognition() { this.lang = 'tr-TR'; this.continuous = false; this.interimResults = true; this.maxAlternatives = 1; this._id = null; }
  Recognition.prototype.start = function () {
    if (this._id && recognitions[this._id]) throw new Error('Recognition already started');
    var id = 'r' + (++seq); this._id = id; recognitions[id] = this;
    if (!caps.recognitionAvailable || !command({ op: 'startListening', id: id })) { dispatch(this, 'error', { type: 'error', error: 'service-not-allowed' }); endRecognition(id); }
  };
  Recognition.prototype.stop = function () { command({ op: 'stopListening' }); if (this._id) endRecognition(this._id); };
  Recognition.prototype.abort = Recognition.prototype.stop;
  function endRecognition(id) { var recognition = recognitions[id]; if (!recognition) return; delete recognitions[id]; recognition._id = null; dispatch(recognition, 'end'); }
  function cancelLocally() { synth.cancel(); Object.keys(recognitions).forEach(endRecognition); try { if (window.document && typeof window.document.dispatchEvent === 'function' && typeof window.CustomEvent === 'function') window.document.dispatchEvent(new window.CustomEvent('oryvona:lifecycle-pause')); } catch (_) {} }
  function receive(event) {
    var data; try { data = JSON.parse(event.data); } catch (_) { return; }
    if (!data || typeof data !== 'object') return;
    if (data.channel === 'capabilities') { caps = data; voicesChanged(); if (window.OryvonaGameNavigation) window.OryvonaGameNavigation.renderVersion(); return; }
    if (data.channel === 'personal') {
      var rpc=personal[data.id];if(!rpc)return;delete personal[data.id];clearTimeout(rpc.timer);
      if(data.ok===true)rpc.resolve(data.value);else {var error=new Error(data.error||'device_storage_unavailable');error.code=data.error||'device_storage_unavailable';error.diagnostic=data.diagnostic;rpc.reject(error);}return;
    }
    // Answered before a possible pause: the share sheet pauses the app right after Android opens it.
    if (data.channel === 'share' || data.channel === 'clipboard') {
      var waiting = replies[data.id]; if (!waiting || waiting.channel !== data.channel) return;
      delete replies[data.id]; clearTimeout(waiting.timer); waiting.resolve({ status: String(data.status || 'failed').slice(0, 40) }); return;
    }
    if (data.channel === 'lifecycle') { paused = data.event !== 'resume'; if (paused) { cancelLocally(); disarmPersonal(); } else { Object.keys(personal).forEach(function(id){personal[id].sent=false;armPersonal(id);}); flushPersonal(); } return; }
    if (paused) return;
    if (data.channel === 'gameLaunch') {
      var pending = launches[data.id];
      if (pending && pending.gameId === data.gameId) { delete launches[data.id]; clearTimeout(pending.timer); pending.resolve(data); }
      return;
    }
    if (data.channel === 'back') {
      var result = 'unavailable';
      try { if (window.OryvonaGameNavigation) result = window.OryvonaGameNavigation.handleBack(); } catch (_) {}
      command({ op: 'backResult', id: data.id, status: result }); return;
    }
    if (data.channel === 'tts') {
      var utterance = utterances[data.id]; if (!utterance) return;
      if (data.event === 'start') { utterance._argonStarted = true; synth.speaking = true; synth.pending = false; dispatch(utterance, 'start'); }
      else finish(data.id, data.event, data.detail);
    } else if (data.channel === 'stt') {
      var recognition = recognitions[data.id]; if (!recognition) return;
      if (data.event === 'end') endRecognition(data.id);
      else if (data.event === 'start') dispatch(recognition, 'start');
      else if (data.event === 'error') dispatch(recognition, 'error', { type: 'error', error: data.detail || 'aborted' });
    } else if (data.channel === 'sttResult') {
      var target = recognitions[data.id]; if (!target) return;
      var result = [{ transcript: String(data.text || ''), confidence: 1 }]; result.isFinal = data.isFinal === true;
      dispatch(target, 'result', { type: 'result', resultIndex: 0, results: [result] });
    }
  }
  function connect(event) {
    // Child frames have a child WindowProxy as source; they cannot supply the privileged main-frame port.
    if (port || (event.source != null && event.source !== window) || (event.origin && event.origin !== 'null' && event.origin !== origin) || !event.ports || event.ports.length !== 1) return;
    var hello; try { hello = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch (_) { return; }
    if (!hello || hello.type !== 'argon-native-port' || hello.protocol !== 1) return;
    port = event.ports[0]; port.onmessage = receive; if (port.start) port.start();
    command({ op: 'capabilities' });flushPersonal();
  }
  window.addEventListener('message', connect);
  window.addEventListener('pagehide', function () { Object.keys(personal).forEach(function(id){var p=personal[id];delete personal[id];clearTimeout(p.timer);p.reject(new Error('page_closed'));});command({ op: 'stopListening' }); cancelLocally(); if (port) { port.close(); port = null; } });
  if (window.document && window.document.addEventListener) window.document.addEventListener('visibilitychange', function () { if (window.document.hidden) { command({ op: 'stopListening' }); cancelLocally(); } });
  // Compatibility marker only: there are no Java methods or privileged capabilities on this public object.
  Object.defineProperty(window, 'ArgonNative', { value: Object.freeze({ transport: 'main-frame-port-v1',
    personalIdentity:function(){return personalRpc('personalIdentity');},
    personalDiagnostics:function(){return personalRpc('personalDiagnostics');},
    deviceRecoveryProof:function(){return personalRpc('personalRecoveryProof');},
    restoreDeviceIdentity:function(value){return personalRpc('personalRestoreIdentity',{deviceId:value.deviceId,fingerprint:value.fingerprint});},
    signDeviceChallenge:function(challenge){return personalRpc('personalSign',{challengeId:challenge.challengeId,nonce:challenge.nonce});},
    ownerStorage:function(operation,key,value){return personalRpc('personalStorage',{operation:operation,key:key,value:value||''});},
    getAppInfo: function () { return caps.app ? JSON.parse(JSON.stringify(caps.app)) : null; },
    shareText: function (text) { return nativeText('shareText', 's', 'share', text, caps.share === true); },
    copyText: function (text) { return nativeText('copyText', 'c', 'clipboard', text, caps.clipboard === true); },
    launchGame: function (gameId) {
      if (['forge-run','aeryo','tupsper'].indexOf(gameId) < 0) return Promise.resolve({ status: 'not_allowed', gameId: gameId });
      return new Promise(function (resolve) {
        var id = 'g' + (++seq), entry = { gameId: gameId, resolve: resolve };
        entry.timer = setTimeout(function () { if (launches[id]) { delete launches[id]; resolve({ status: 'timeout', gameId: gameId }); } }, 5000);
        launches[id] = entry;
        if (!command({ op: 'launchGame', id: id, gameId: gameId })) { clearTimeout(entry.timer); delete launches[id]; resolve({ status: 'native_not_ready', gameId: gameId }); }
      });
    }
  }), configurable: false });
  Object.defineProperty(window, '__argonNative', { value: Object.freeze({ protocol: 1 }), configurable: false });
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = Utterance;
  if (caps.recognitionAvailable === true) { window.SpeechRecognition = Recognition; window.webkitSpeechRecognition = Recognition; }
})();
