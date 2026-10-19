(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OryvonaJarvisVoice = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MALE = /\b(?:ahmet|tolga|male|erkek|man)\b|tr-tr-x-(?:tmc|mfm|efm)|tr-tr-x-.*-male|argon-male/i;
  var FEMALE = /\b(?:emel|seda|yelda|filiz|female|kad[ıi]n|woman)\b/i;
  function isMaleVoice(v) { return !!v && MALE.test(String(v.name || '') + ' ' + String(v.voiceURI || '')); }

  function create(options) {
    options = options || {};
    if (typeof options.getAccountKey !== 'function') throw new TypeError('getAccountKey is required');
    var win = options.window || (typeof window !== 'undefined' ? window : {});
    var doc = options.document || win.document || null;
    var synth = win.speechSynthesis || null;
    var Utterance = win.SpeechSynthesisUtterance;
    var Recognition = win.SpeechRecognition || win.webkitSpeechRecognition;
    var localOnly = options.localOnly !== false;
    var listeners = new Set();
    var removers = [];
    var destroyed = false;
    var enabled = false;
    var owner = readAccount();
    var voice = null;
    var mode = 'idle';
    var audioLevel = null;
    var notice = 'Ses kapalı. Açmak için ses düğmesine dokun.';
    var error = null;
    var utterance = null;
    var recognition = null;
    var listenEnd = null;
    var speechEpoch = 0;
    var listenEpoch = 0;
    var measurement = null;
    var spokenIds = new Set();
    var activeSpeechId = null;

    function readAccount() {
      try {
        var value = options.getAccountKey();
        return typeof value === 'string' ? value : '';
      } catch (_) { return ''; }
    }
    function snapshot() {
      return Object.freeze({
        enabled: enabled,
        ttsAvailable: !!(synth && typeof Utterance === 'function' && voice),
        recognitionAvailable: typeof Recognition === 'function',
        mode: mode,
        audioLevel: audioLevel,
        voiceName: voice ? String(voice.name || 'Türkçe ses') : null,
        localVoice: voice ? voice.localService === true : null,
        notice: notice,
        error: error
      });
    }
    function emit() {
      var value = snapshot();
      listeners.forEach(function (fn) { try { fn(value); } catch (_) {} });
    }
    function fail(code, message) {
      error = message;
      notice = message;
      emit();
      if (typeof options.onError === 'function') {
        try { options.onError({ code: code, message: message }); } catch (_) {}
      }
      return { ok: false, reason: code };
    }
    function accountCurrent(expected) {
      var next = readAccount();
      if (next !== owner) {
        owner = next;
        stopAll('account-change');
        enabled = false;
        error = null;
        spokenIds.clear();
        notice = 'Hesap değişti. Sesi yeniden açabilirsin.';
        emit();
      }
      return !destroyed && !!owner && (expected === undefined || expected === owner);
    }
    function selectVoice() {
      var available = [];
      if (synth && typeof synth.getVoices === 'function') {
        try { available = Array.from(synth.getVoices() || []); } catch (_) {}
      }
      voice = available.filter(function (item) {
        var lang = String(item.lang || '').toLowerCase().replace(/_/g, '-');
        return /^tr(?:-|$)/.test(lang) && (!localOnly || item.localService === true);
      }).sort(function (a, b) {
        function rank(item) {
          var name = String(item.name || '') + ' ' + String(item.voiceURI || '');
          var score = String(item.lang || '').toLowerCase().replace(/_/g, '-') === 'tr-tr' ? 8 : 0;
          if (item.localService === true) score += 20;
          if (/natural|doğal|enhanced|premium|neural/i.test(name)) score += 12;
          // ARGON: a deep male Turkish voice first (Edge "Ahmet Online (Natural)", Windows "Tolga", Android male voices);
          // the Google network voice (the robotic "Translate" sound) last.
          if (MALE.test(name)) score += 60;
          if (/google/i.test(name) && item.localService !== true) score -= 40;
          if (FEMALE.test(name)) score -= 25;
          if (item.default === true) score += 1;
          return score;
        }
        return rank(b) - rank(a) || String(a.name || '').localeCompare(String(b.name || ''));
      })[0] || null;
      if (enabled) {
        if (voice) notice = voice.localService === true ? 'Türkçe cihaz sesi açık.' : 'Türkçe uzak ses açık; cihaz dışında işlenebilir.';
        else notice = localOnly ? 'Bu cihazda yerel Türkçe ses bulunamadı. Yazılı yanıtlar devam eder.' : 'Türkçe ses bulunamadı. Yazılı yanıtlar devam eder.';
      }
    }
    function bind(target, name, fn) {
      if (!target || typeof target.addEventListener !== 'function') return;
      target.addEventListener(name, fn);
      removers.push(function () { target.removeEventListener(name, fn); });
    }
    function releaseMeasurement() {
      var current = measurement;
      measurement = null;
      audioLevel = null;
      if (!current) return;
      if (current.frame !== null && typeof win.cancelAnimationFrame === 'function') win.cancelAnimationFrame(current.frame);
      if (current.source && typeof current.source.disconnect === 'function') try { current.source.disconnect(); } catch (_) {}
      if (current.analyser && typeof current.analyser.disconnect === 'function') try { current.analyser.disconnect(); } catch (_) {}
      if (current.stream && typeof current.stream.getTracks === 'function') current.stream.getTracks().forEach(function (track) { try { track.stop(); } catch (_) {} });
      if (current.context && typeof current.context.close === 'function') try { Promise.resolve(current.context.close()).catch(function () {}); } catch (_) {}
    }
    function beginMeasurement(epoch, account) {
      var media = win.navigator && win.navigator.mediaDevices;
      var AudioContext = win.AudioContext || win.webkitAudioContext;
      if (options.measureInput !== true || !media || typeof media.getUserMedia !== 'function' || typeof AudioContext !== 'function' || typeof win.requestAnimationFrame !== 'function') return;
      var pending;
      try { pending = media.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }); }
      catch (_) { return; }
      Promise.resolve(pending).then(function (stream) {
        if (destroyed || epoch !== listenEpoch || !recognition || !accountCurrent(account)) {
          if (stream && typeof stream.getTracks === 'function') stream.getTracks().forEach(function (track) { try { track.stop(); } catch (_) {} });
          return;
        }
        var current = { stream: stream, context: null, source: null, analyser: null, frame: null, last: -Infinity };
        measurement = current;
        try {
          current.context = new AudioContext();
          current.analyser = current.context.createAnalyser();
          current.analyser.fftSize = 256;
          current.source = current.context.createMediaStreamSource(stream);
          current.source.connect(current.analyser);
          var data = new Uint8Array(current.analyser.fftSize);
          if (typeof current.context.resume === 'function') Promise.resolve(current.context.resume()).catch(function () {
            if (measurement === current) { releaseMeasurement(); emit(); }
          });
          function sample(time) {
            if (measurement !== current || destroyed || epoch !== listenEpoch || !accountCurrent(account)) return;
            if (time - current.last >= 32) {
              current.last = time;
              current.analyser.getByteTimeDomainData(data);
              var sum = 0;
              for (var i = 0; i < data.length; i++) { var v = (data[i] - 128) / 128; sum += v * v; }
              audioLevel = Math.max(0, Math.min(1, Math.sqrt(sum / data.length) * 3.5));
              emit();
            }
            current.frame = win.requestAnimationFrame(sample);
          }
          current.frame = win.requestAnimationFrame(sample);
        } catch (_) { if (measurement === current) { releaseMeasurement(); emit(); } }
      }).catch(function () {
        // Recognition may still work. A denied optional meter never produces a fake level.
      });
    }
    function stopSpeakingInternal() {
      speechEpoch += 1;
      var current = utterance;
      utterance = null;
      activeSpeechId = null;
      if (current && synth && typeof synth.cancel === 'function') try { synth.cancel(); } catch (_) {}
      if (mode === 'speaking') mode = 'idle';
    }
    function stopListeningInternal(reason) {
      listenEpoch += 1;
      var current = recognition;
      var ended = listenEnd;
      recognition = null;
      listenEnd = null;
      releaseMeasurement();
      if (current) try {
        if (typeof current.abort === 'function') current.abort();
        else if (typeof current.stop === 'function') current.stop();
      } catch (_) {}
      if (mode === 'listening') mode = 'idle';
      if (ended) try { ended({ reason: reason || 'stopped' }); } catch (_) {}
    }
    function stopAll(reason) {
      stopSpeakingInternal();
      stopListeningInternal(reason);
      mode = 'idle';
    }
    function visible() { return !doc || doc.hidden !== true; }
    function usable() {
      if (destroyed) return { ok: false, reason: 'DESTROYED' };
      if (!accountCurrent()) return fail('ACCOUNT_REQUIRED', 'Ses için geçerli bir hesap bağlamı gerekli.');
      if (!visible()) return fail('HIDDEN', 'Ses yalnız açık Argon ekranında kullanılabilir.');
      return null;
    }
    function setEnabled(value) {
      if (destroyed) return snapshot();
      accountCurrent();
      enabled = value === true;
      error = null;
      if (!enabled) {
        stopSpeakingInternal();
        notice = 'Ses kapalı.';
      } else { selectVoice(); }
      emit();
      return snapshot();
    }
    function speak(input) {
      var blocked = usable();
      if (blocked) return blocked;
      input = input || {};
      if (input.accountKey !== owner) return fail('ACCOUNT_MISMATCH', 'Yanıt bu hesap bağlamına ait değil.');
      if (!enabled) return { ok: false, reason: 'MUTED' };
      if (typeof input.id !== 'string' || !input.id || input.id.length > 200) return fail('INVALID_ID', 'Sesli yanıt kimliği geçersiz.');
      if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 6000) return fail('INVALID_TEXT', 'Sesli yanıt metni geçersiz veya çok uzun.');
      if (spokenIds.has(input.id) || activeSpeechId === input.id) return { ok: false, reason: 'DUPLICATE' };
      selectVoice();
      if (!synth || typeof synth.speak !== 'function' || typeof Utterance !== 'function' || !voice) return fail('TURKISH_VOICE_UNAVAILABLE', localOnly ? 'Yerel Türkçe ses bulunamadı. Yazılı yanıt hazır.' : 'Türkçe ses bulunamadı. Yazılı yanıt hazır.');
      stopListeningInternal('speaking');
      stopSpeakingInternal();
      var epoch = speechEpoch;
      var account = owner;
      var current;
      try { current = new Utterance(input.text.trim()); }
      catch (_) { return fail('TTS_FAILED', 'Türkçe ses başlatılamadı. Yazılı yanıt hazır.'); }
      utterance = current;
      activeSpeechId = input.id;
      current.lang = 'tr-TR';
      current.voice = voice;
      // ARGON tonu: tok ve akıcı (≈ pitch −6 %, rate +8 %). Only a female/unknown fallback voice is pulled lower, so it never
      // sounds thin; a real male voice keeps its natural timbre.
      if (options.tone === 'argon') { current.rate = 1.04; current.pitch = isMaleVoice(voice) ? 0.94 : 0.8; }
      else { current.rate = 0.94; current.pitch = 1; }
      current.volume = 1.0; // ARGON: tarayıcının izin verdiği en yüksek ve net seviye (kısık kalmaz)
      function valid() { return epoch === speechEpoch && utterance === current && accountCurrent(account); }
      current.onstart = function () {
        if (!valid()) return;
        mode = 'speaking';
        error = null;
        audioLevel = null;
        emit();
      };
      current.onend = function () {
        if (!valid()) return;
        utterance = null;
        activeSpeechId = null;
        mode = 'idle';
        emit();
      };
      current.onerror = function (event) {
        if (!valid()) return;
        utterance = null;
        activeSpeechId = null;
        mode = 'idle';
        fail('TTS_' + String(event && event.error || 'FAILED').toUpperCase().replace(/[^A-Z_-]/g, ''), 'Sesli yanıt durdu. Yazılı yanıtı okuyabilirsin.');
      };
      try {
        error = null;
        synth.speak(current);
        spokenIds.add(input.id);
        if (spokenIds.size > 100) spokenIds.delete(spokenIds.values().next().value);
        emit();
        return { ok: true, id: input.id };
      } catch (_) {
        if (utterance === current) stopSpeakingInternal();
        return fail('TTS_FAILED', 'Sesli yanıt başlatılamadı. Yazılı yanıt hazır.');
      }
    }
    function startListening(input) {
      var blocked = usable();
      if (blocked) return Object.assign(blocked, { stop: function () {} });
      input = input || {};
      if (typeof Recognition !== 'function') return Object.assign(fail('RECOGNITION_UNAVAILABLE', 'Bu tarayıcı Türkçe ses tanımayı desteklemiyor. Yazabilirsin.'), { stop: function () {} });
      stopAll('restarted');
      var epoch = listenEpoch;
      var account = owner;
      var current;
      try { current = new Recognition(); }
      catch (_) { return Object.assign(fail('RECOGNITION_FAILED', 'Ses tanıma başlatılamadı. Yazabilirsin.'), { stop: function () {} }); }
      recognition = current;
      listenEnd = typeof input.onEnd === 'function' ? input.onEnd : null;
      current.lang = 'tr-TR';
      current.continuous = false;
      current.interimResults = true;
      current.maxAlternatives = 1;
      function valid() { return epoch === listenEpoch && recognition === current && accountCurrent(account); }
      current.onstart = function () { if (valid()) { mode = 'listening'; error = null; notice = 'Dinliyorum.'; emit(); } };
      current.onresult = function (event) {
        if (!valid()) return;
        var text = '';
        var allFinal = true;
        var results = event && event.results || [];
        for (var i = 0; i < results.length; i++) {
          text += (text ? ' ' : '') + String(results[i] && results[i][0] && results[i][0].transcript || '').trim();
          if (!results[i].isFinal) allFinal = false;
        }
        text = text.trim();
        if (!text) return;
        var fn = typeof input.onTranscript === 'function' ? input.onTranscript : options.onTranscript;
        if (typeof fn === 'function') try { fn(text, { final: allFinal, accountKey: account, source: 'speech-recognition' }); } catch (_) {}
      };
      current.onend = function () {
        if (!valid()) return;
        recognition = null;
        var ended = listenEnd;
        listenEnd = null;
        releaseMeasurement();
        mode = 'idle';
        notice = 'Dinleme bitti.';
        emit();
        if (ended) try { ended({ reason: 'ended' }); } catch (_) {}
      };
      current.onerror = function (event) {
        if (!valid()) return;
        var code = String(event && event.error || 'failed');
        stopListeningInternal('error');
        var message = code === 'not-allowed' || code === 'service-not-allowed' ? 'Mikrofon veya ses hizmeti izni verilmedi. Yazabilirsin.' : code === 'network' ? 'Ses tanıma bağlantısı kurulamadı. Yazabilirsin.' : code === 'no-speech' ? 'Ses algılanmadı. Yeniden deneyebilir veya yazabilirsin.' : 'Ses tanıma durdu. Yazabilirsin.';
        fail('RECOGNITION_' + code.toUpperCase().replace(/[^A-Z_-]/g, ''), message);
      };
      try {
        current.start();
        beginMeasurement(epoch, account);
        error = null;
        emit();
        return { ok: true, stop: function () { if (epoch === listenEpoch && recognition === current) { stopListeningInternal('stopped'); emit(); } } };
      } catch (_) {
        stopListeningInternal('error');
        return Object.assign(fail('RECOGNITION_FAILED', 'Ses tanıma başlatılamadı. Yazabilirsin.'), { stop: function () {} });
      }
    }
    function cancel() { if (destroyed) return; stopAll('cancelled'); notice = 'Ses durduruldu.'; emit(); }
    function contextChanged() { accountCurrent(); }
    function hidden() { if (!visible()) cancel(); }
    function voicesChanged() { if (!destroyed) { accountCurrent(); selectVoice(); emit(); } }
    selectVoice();
    if (synth && typeof synth.addEventListener === 'function') bind(synth, 'voiceschanged', voicesChanged);
    else if (synth) {
      var previousVoicesHandler = synth.onvoiceschanged;
      var voicesHandler = function (event) { if (typeof previousVoicesHandler === 'function') try { previousVoicesHandler.call(synth, event); } catch (_) {} voicesChanged(); };
      synth.onvoiceschanged = voicesHandler;
      removers.push(function () { if (synth.onvoiceschanged === voicesHandler) synth.onvoiceschanged = previousVoicesHandler; });
    }
    bind(doc, 'visibilitychange', hidden);
    bind(doc, 'oryvona:studio-context-change', contextChanged);
    bind(win, 'pagehide', cancel);
    return Object.freeze({
      getSnapshot: function () { accountCurrent(); return snapshot(); },
      subscribe: function (fn) {
        if (typeof fn !== 'function') throw new TypeError('subscriber must be a function');
        if (destroyed) return function () {};
        listeners.add(fn);
        try { fn(snapshot()); } catch (_) {}
        return function () { listeners.delete(fn); };
      },
      setEnabled: setEnabled,
      startListening: startListening,
      stopListening: function () { if (!destroyed) { stopListeningInternal('stopped'); emit(); } },
      speak: speak,
      stopSpeaking: function () { if (!destroyed) { stopSpeakingInternal(); emit(); } },
      cancel: cancel,
      destroy: function () {
        if (destroyed) return;
        stopAll('destroyed');
        enabled = false;
        destroyed = true;
        notice = 'Ses kapatıldı.';
        removers.forEach(function (remove) { remove(); });
        removers.length = 0;
        emit();
        listeners.clear();
        spokenIds.clear();
      }
    });
  }
  return Object.freeze({ create: create });
});
