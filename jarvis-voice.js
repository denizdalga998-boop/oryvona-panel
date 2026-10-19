(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OryvonaJarvisVoice = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var JARVIS_VOICE_PROFILE = Object.freeze({
    voiceId: 'tr-TR-AhmetNeural',
    pitch: '-5%',
    rate: '+10%',
    bassHz: 110,
    bassGainDb: 4.5,
    presenceHz: 3000,
    presenceGainDb: 3.0,
    presenceQ: 1.0
  });
  var AHMET_NEURAL = /tr-tr-ahmetneural|\bahmet\b.*\b(?:natural|neural|online)\b/i;
  var MALE = /\b(?:ahmet|tolga|male|erkek|man)\b|tr-tr-x-(?:tmc|mfm|efm)|tr-tr-x-.*-male|argon-male/i;
  var FEMALE = /\b(?:emel|seda|yelda|filiz|female|kad[ıi]n|woman)\b/i;
  function isMaleVoice(v) { return !!v && MALE.test(String(v.name || '') + ' ' + String(v.voiceURI || '')); }

  function createJarvisAudioFilter(ctx) {
    if (!ctx || typeof ctx.createBiquadFilter !== 'function') return null;
    try {
      var bass = ctx.createBiquadFilter();
      bass.type = 'lowshelf';
      if (bass.frequency) bass.frequency.value = JARVIS_VOICE_PROFILE.bassHz; // 110Hz bas derinliği
      if (bass.gain) bass.gain.value = JARVIS_VOICE_PROFILE.bassGainDb;

      var presence = ctx.createBiquadFilter();
      presence.type = 'peaking';
      if (presence.frequency) presence.frequency.value = JARVIS_VOICE_PROFILE.presenceHz; // 3kHz netlik
      if (presence.Q) presence.Q.value = JARVIS_VOICE_PROFILE.presenceQ;
      if (presence.gain) presence.gain.value = JARVIS_VOICE_PROFILE.presenceGainDb;

      var gain = typeof ctx.createGain === 'function' ? ctx.createGain() : null;
      if (gain && gain.gain) gain.gain.value = 1.15;

      var analyser = typeof ctx.createAnalyser === 'function' ? ctx.createAnalyser() : null;
      if (analyser) analyser.fftSize = 256;

      bass.connect(presence);
      var tail = presence;
      if (gain) { tail.connect(gain); tail = gain; }
      if (analyser) { tail.connect(analyser); tail = analyser; }
      if (ctx.destination) tail.connect(ctx.destination);
      return { input: bass, bass: bass, presence: presence, gain: gain, analyser: analyser };
    } catch (_) { return null; }
  }

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
    var webAudioPlayback = null;
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
        voiceName: voice ? String(voice.name || 'tr-TR-AhmetNeural') : 'tr-TR-AhmetNeural',
        voiceProfile: JARVIS_VOICE_PROFILE,
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
          if (AHMET_NEURAL.test(name)) score += 120; // Microsoft Neural tr-TR-AhmetNeural en üst öncelik
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
        if (voice) notice = voice.localService === true ? 'Türkçe Jarvis sesi açık (110Hz + 3kHz).' : 'Türkçe Neural Jarvis sesi açık (tr-TR-AhmetNeural · 110Hz + 3kHz).';
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
    function stopWebAudioPlayback() {
      var w = webAudioPlayback;
      webAudioPlayback = null;
      if (!w) return;
      if (w.meterTimer) clearInterval(w.meterTimer);
      try { if (w.source && typeof w.source.stop === 'function') w.source.stop(); } catch (_) {}
      try { if (w.source && typeof w.source.disconnect === 'function') w.source.disconnect(); } catch (_) {}
      try { if (w.context && typeof w.context.close === 'function') Promise.resolve(w.context.close()).catch(function () {}); } catch (_) {}
    }
    function stopSpeakingInternal() {
      speechEpoch += 1;
      stopWebAudioPlayback();
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
      var AC = win.AudioContext || win.webkitAudioContext;
      // If neural audioB64 (tr-TR-AhmetNeural) is provided and Web Audio decodeAudioData is available, play through Jarvis 110Hz + 3kHz filter chain
      if (typeof input.audioB64 === 'string' && input.audioB64.length > 64 && typeof AC === 'function') {
        try {
          var ctx = new AC();
          if (typeof ctx.decodeAudioData === 'function' && typeof ctx.createBufferSource === 'function') {
            var chain = createJarvisAudioFilter(ctx);
            if (chain) {
              stopListeningInternal('speaking');
              stopSpeakingInternal();
              var bEpoch = speechEpoch, bAccount = owner;
              activeSpeechId = input.id;
              spokenIds.add(input.id);
              if (spokenIds.size > 100) spokenIds.delete(spokenIds.values().next().value);
              var binStr = typeof win.atob === 'function' ? win.atob(input.audioB64) : Buffer.from(input.audioB64, 'base64').toString('binary');
              var bytes = new Uint8Array(binStr.length);
              for (var bi = 0; bi < binStr.length; bi++) bytes[bi] = binStr.charCodeAt(bi);
              var playState = { context: ctx, source: null, chain: chain, meterTimer: null };
              webAudioPlayback = playState;
              mode = 'speaking';
              error = null;
              convoSpeechStarted();
              emit();
              Promise.resolve(ctx.decodeAudioData(bytes.buffer.slice(0))).then(function (audioBuf) {
                if (bEpoch !== speechEpoch || webAudioPlayback !== playState || !accountCurrent(bAccount)) return;
                var src = ctx.createBufferSource();
                src.buffer = audioBuf;
                src.connect(chain.input);
                playState.source = src;
                if (chain.analyser) {
                  var freqData = new Uint8Array(chain.analyser.fftSize);
                  playState.meterTimer = setInterval(function () {
                    if (webAudioPlayback !== playState || mode !== 'speaking') return;
                    chain.analyser.getByteTimeDomainData(freqData);
                    var s = 0;
                    for (var k = 0; k < freqData.length; k++) { var dv = (freqData[k] - 128) / 128; s += dv * dv; }
                    audioLevel = Math.max(0, Math.min(1, Math.sqrt(s / freqData.length) * 3.5));
                    emit();
                  }, 50);
                }
                src.onended = function () {
                  if (bEpoch !== speechEpoch || webAudioPlayback !== playState) return;
                  stopWebAudioPlayback();
                  activeSpeechId = null;
                  mode = 'idle';
                  audioLevel = null;
                  emit();
                  convoSpeechEnded();
                };
                src.start(0);
              }).catch(function () {
                if (bEpoch === speechEpoch && webAudioPlayback === playState) {
                  stopWebAudioPlayback();
                  activeSpeechId = null;
                  mode = 'idle';
                  convoSpeechEnded();
                }
              });
              return { ok: true, id: input.id, engine: 'web-audio-jarvis-filter', voice: JARVIS_VOICE_PROFILE.voiceId };
            }
          }
          if (typeof ctx.close === 'function') try { Promise.resolve(ctx.close()).catch(function () {}); } catch (_) {}
        } catch (_) {}
      }
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
      // ARGON tonu: tr-TR-AhmetNeural (pitch: -5% / 0.94, rate: +10% / 1.04) + Web Audio 110Hz bas & 3kHz netlik filtresi.
      // Only a female/unknown fallback voice is pulled lower, so it never sounds thin; a real male voice keeps its natural timbre.
      if (options.tone === 'argon') { current.rate = 1.04; current.pitch = isMaleVoice(voice) ? 0.94 : 0.8; }
      else { current.rate = 0.94; current.pitch = 1; }
      current.volume = 1.0; // ARGON: tarayıcının izin verdiği en yüksek ve net seviye (kısık kalmaz)
      current.jarvisFilter = JARVIS_VOICE_PROFILE;
      if (typeof AC === 'function') {
        try {
          var filterCtx = new AC();
          var filterChain = createJarvisAudioFilter(filterCtx);
          if (filterChain) webAudioPlayback = { context: filterCtx, source: null, chain: filterChain, meterTimer: null };
          else if (typeof filterCtx.close === 'function') Promise.resolve(filterCtx.close()).catch(function () {});
        } catch (_) {}
      }
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
        stopWebAudioPlayback();
        utterance = null;
        activeSpeechId = null;
        mode = 'idle';
        emit();
        convoSpeechEnded();
      };
      current.onerror = function (event) {
        if (!valid()) return;
        stopWebAudioPlayback();
        utterance = null;
        activeSpeechId = null;
        mode = 'idle';
        convoSpeechEnded();
        fail('TTS_' + String(event && event.error || 'FAILED').toUpperCase().replace(/[^A-Z_-]/g, ''), 'Sesli yanıt durdu. Yazılı yanıtı okuyabilirsin.');
      };
      try {
        error = null;
        mode = convo ? 'speaking' : mode;   // hands-free: recognition pauses before Argon's first word
        convoSpeechStarted();
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
    /* ===== ARGON eller serbest (hands-free): continuous listening, ~1 s silence = end of utterance, auto-resume after Argon speaks,
       barge-in (the owner talking over Argon cuts the speech). Recognition is paused while Argon speaks so it never transcribes itself;
       during speech only a level meter listens (echo-cancelled mic) to detect the owner's voice. ===== */
    var convo = null;
    var SILENCE_MS = typeof options.silenceMs === 'number' ? options.silenceMs : 1000;
    function convoStopRec() {
      if (!convo) return;
      if (convo.timer) { clearTimeout(convo.timer); convo.timer = null; }
      var r = convo.rec; convo.rec = null;
      if (r) { r.onresult = r.onend = r.onerror = null; try { r.abort ? r.abort() : r.stop(); } catch (_) {} }
    }
    function convoDisarm() {
      if (!convo || !convo.meter) return;
      var m = convo.meter; convo.meter = null;
      if (m.timer) clearInterval(m.timer);
      try { m.source && m.source.disconnect(); } catch (_) {}
      if (m.stream && m.stream.getTracks) m.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (_) {} });
      if (m.context && m.context.close) try { Promise.resolve(m.context.close()).catch(function () {}); } catch (_) {}
    }
    function convoFlush() {
      if (!convo) return;
      var text = convo.buffer.trim(); convo.buffer = '';
      if (convo.timer) { clearTimeout(convo.timer); convo.timer = null; }
      if (!text) return;
      try { convo.onUtterance(text); } catch (_) {}
    }
    function convoListen() {
      if (!convo || destroyed || convo.paused || convo.rec) return;
      if (mode === 'speaking') { convoArmBargeIn(); return; }
      if (typeof Recognition !== 'function') { fail('RECOGNITION_UNAVAILABLE', 'Bu cihazda sürekli Türkçe ses tanıma yok. Yazarak konuşabilirsin.'); return; }
      var current; try { current = new Recognition(); } catch (_) { return; }
      convo.rec = current;
      current.lang = 'tr-TR'; current.continuous = true; current.interimResults = true; current.maxAlternatives = 1;
      current.onstart = function () { if (convo && convo.rec === current && mode !== 'speaking') { mode = 'listening'; notice = 'Canlı: dinliyorum.'; error = null; emit(); } };
      current.onresult = function (event) {
        if (!convo || convo.rec !== current) return;
        var results = event && event.results || [], text = '';
        for (var i = 0; i < results.length; i++) text += (text ? ' ' : '') + String(results[i] && results[i][0] && results[i][0].transcript || '').trim();
        convo.buffer = text.trim();
        if (typeof convo.onPartial === 'function') try { convo.onPartial(convo.buffer); } catch (_) {}
        if (convo.timer) clearTimeout(convo.timer);
        // End of utterance = silence. Recognition keeps running; the buffered sentence goes to the brain without any tap.
        convo.timer = setTimeout(function () { if (convo && convo.rec === current) { convoStopRec(); convoFlush(); convoRestart(150); } }, SILENCE_MS);
      };
      current.onend = function () {
        if (!convo || convo.rec !== current) return;
        convo.rec = null;
        if (convo.buffer.trim()) convoFlush();
        if (mode === 'listening') { mode = 'idle'; emit(); }
        convoRestart(250);
      };
      current.onerror = function (event) {
        if (!convo || convo.rec !== current) return;
        var code = String(event && event.error || 'failed');
        convo.rec = null;
        if (code === 'not-allowed' || code === 'service-not-allowed') { stopConversation(); fail('RECOGNITION_NOT_ALLOWED', 'Mikrofon izni verilmedi. Canlı mod kapandı; yazarak konuşabilirsin.'); return; }
        convoRestart(code === 'network' ? 1500 : 400);
      };
      try { current.start(); } catch (_) { convo.rec = null; convoRestart(800); }
    }
    function convoRestart(ms) { if (!convo) return; var c = convo; setTimeout(function () { if (convo === c) convoListen(); }, ms); }
    function convoArmBargeIn() {
      if (!convo || convo.meter || options.bargeIn === false) return;
      var media = win.navigator && win.navigator.mediaDevices, AC = win.AudioContext || win.webkitAudioContext;
      if (!media || typeof media.getUserMedia !== 'function' || typeof AC !== 'function') return;
      var c = convo, armedAt = Date.now(), m = { stream: null, context: null, source: null, timer: null };
      c.meter = m;
      Promise.resolve(media.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false }, video: false })).then(function (stream) {
        if (convo !== c || c.meter !== m || mode !== 'speaking') { stream.getTracks().forEach(function (t) { try { t.stop(); } catch (_) {} }); if (c.meter === m) c.meter = null; return; }
        m.stream = stream; m.context = new AC(); var analyser = m.context.createAnalyser(); analyser.fftSize = 512;
        m.source = m.context.createMediaStreamSource(stream); m.source.connect(analyser);
        var data = new Uint8Array(analyser.fftSize), loud = 0;
        // setInterval, not rAF: it must keep working while the page is not painting.
        m.timer = setInterval(function () {
          if (convo !== c || mode !== 'speaking') { convoDisarm(); return; }
          analyser.getByteTimeDomainData(data); var sum = 0;
          for (var i = 0; i < data.length; i++) { var v = (data[i] - 128) / 128; sum += v * v; }
          var rms = Math.sqrt(sum / data.length);
          loud = rms > (options.bargeInLevel || 0.07) ? loud + 50 : Math.max(0, loud - 50);
          if (Date.now() - armedAt > 500 && loud >= 250) {   // ~¼ s of the owner's voice over Argon
            convoDisarm(); stopSpeakingInternal(); mode = 'idle'; notice = 'Sözünü kestim; dinliyorum.'; emit();
            if (typeof c.onBargeIn === 'function') try { c.onBargeIn(); } catch (_) {}
            convoListen();
          }
        }, 50);
      }).catch(function () { if (c.meter === m) c.meter = null; });
    }
    function startConversation(handlers) {
      var blocked = usable(); if (blocked) return blocked;
      handlers = handlers || {};
      stopConversation(); stopListeningInternal('conversation');
      convo = { onUtterance: handlers.onUtterance || function () {}, onPartial: handlers.onPartial, onBargeIn: handlers.onBargeIn, buffer: '', timer: null, rec: null, meter: null, paused: false };
      enabled = true; selectVoice(); notice = 'Canlı mod açık: konuş, susunca gönderirim.'; error = null; emit();
      convoListen();
      return { ok: true, stop: stopConversation };
    }
    function stopConversation() {
      if (!convo) return;
      convoStopRec(); convoDisarm(); convo = null;
      if (mode === 'listening') mode = 'idle';
      notice = 'Canlı mod kapalı.'; emit();
    }
    // Speech hand-off: pause recognition while Argon talks, resume (or barge-in) around it.
    function convoSpeechStarted() { if (!convo) return; convoStopRec(); convoArmBargeIn(); }
    function convoSpeechEnded() { if (!convo) return; convoDisarm(); convoRestart(200); }
    function cancel() { if (destroyed) return; stopConversation(); stopAll('cancelled'); notice = 'Ses durduruldu.'; emit(); }
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
      startConversation: startConversation,
      stopConversation: function () { if (!destroyed) stopConversation(); },
      conversationActive: function () { return !!convo; },
      stopListening: function () { if (!destroyed) { stopListeningInternal('stopped'); emit(); } },
      speak: speak,
      stopSpeaking: function () { if (!destroyed) { stopSpeakingInternal(); emit(); } },
      cancel: cancel,
      destroy: function () {
        if (destroyed) return;
        stopConversation();
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
