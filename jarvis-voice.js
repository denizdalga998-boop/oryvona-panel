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
    var m2Profile = options.profile === 'supertonic-3-M2';
    var m2 = null, m2State = { status: 'setup_required', progress: 0, error: null };
    var m2Context = null, m2Job = null, m2Prepare = null, m2PrepareEpoch = 0;
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
    var voiceAuditionActive = false;
    var speechStartTimer = null;
    var startupTimeoutMs = Math.max(50, Math.min(20000, Number(options.startupTimeoutMs) || 12000));
    var MAX_AUDIO_B64 = 4 * 1024 * 1024;

    function readAccount() {
      try {
        var value = options.getAccountKey();
        return typeof value === 'string' ? value : '';
      } catch (_) { return ''; }
    }
    function snapshot() {
      return Object.freeze({
        enabled: enabled,
        ttsAvailable: m2Profile ? !!(m2 && (win.AudioContext || win.webkitAudioContext)) : !!(synth && typeof Utterance === 'function' && voice),
        recognitionAvailable: typeof Recognition === 'function',
        mode: mode,
        audioLevel: audioLevel,
        voiceName: m2Profile ? (m2State.status === 'ready' ? 'Argon M2' : '') : voice ? String(voice.name || 'Turkish voice') : '',
        voiceProfile: m2Profile ? { voiceId: 'M2', profile: 'supertonic-3-M2', sampleRate: 44100 } : JARVIS_VOICE_PROFILE,
        localVoice: m2Profile ? true : voice ? voice.localService === true : null,
        needsVoiceSetup: m2Profile && m2State.status !== 'ready' && !m2Prepare && !m2Job,
        voiceSetupPending: m2Profile && !!m2Prepare,
        voiceSetupProgress: m2Profile ? Number(m2State.progress) || 0 : 0,
        voicePending: m2Profile && !!m2Job,
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
      if (m2Profile) {
        voice = null;
        if (!m2) { notice = 'Erkek ses bileşeni yüklenmedi. Uygulamayı kapatıp yeniden aç; yazılı yanıtlar devam eder.'; error = notice; return; }
        if (enabled && !m2Job && !m2Prepare) notice = m2State.status === 'ready' ? 'Argon M2 erkek sesi hazır.' : 'Erkek sesi hazırlamak için üstteki ses düğmesine dokun.';
        return;
      }
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
        if (voice) notice = String(voice.name || 'Türkçe ses') + (voice.localService === true ? ' · cihaz sesi açık.' : ' · tarayıcı ses hizmeti açık; internet gerekebilir.');
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
    function beginMeasurement(epoch, account, conversation) {
      var media = win.navigator && win.navigator.mediaDevices;
      var AudioContext = win.AudioContext || win.webkitAudioContext;
      if (options.measureInput !== true || !media || typeof media.getUserMedia !== 'function' || typeof AudioContext !== 'function' || typeof win.requestAnimationFrame !== 'function') return;
      var pending;
      try { pending = media.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }); }
      catch (_) { return; }
      Promise.resolve(pending).then(function (stream) {
        if (destroyed || epoch !== listenEpoch || (conversation ? !convoCurrent(conversation) || !conversation.rec : !recognition) || !accountCurrent(account)) {
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
            if (measurement !== current || destroyed || epoch !== listenEpoch || (conversation && !convoCurrent(conversation)) || !accountCurrent(account)) return;
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
      if (speechStartTimer !== null) { clearTimeout(speechStartTimer); speechStartTimer = null; }
      stopM2Job('cancelled');
      stopWebAudioPlayback();
      var current = utterance;
      utterance = null;
      activeSpeechId = null;
      audioLevel = null;
      if (current && synth && typeof synth.cancel === 'function') try { synth.cancel(); } catch (_) {}
      if (mode === 'speaking' || mode === 'tts-loading') mode = 'idle';
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
      var hadM2Operation = !!m2Job || !!m2Prepare;
      if (reason !== 'restarted') stopM2Preparation();
      stopConversation();
      stopSpeakingInternal();
      stopListeningInternal(reason);
      if (m2Profile && reason !== 'restarted' && !hadM2Operation && m2) { try { m2.stop(); } catch (_) {} }
      mode = 'idle';
    }
    function visible() { return !doc || doc.hidden !== true; }
    function usable() {
      if (destroyed) return { ok: false, reason: 'DESTROYED' };
      if (voiceAuditionActive) return { ok: false, reason: 'VOICE_AUDITION_ACTIVE' };
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
        var hadM2Operation = !!m2Job || !!m2Prepare;
        stopM2Preparation();
        stopSpeakingInternal(); convoSpeechEnded();
        if (m2Profile && !hadM2Operation && m2) { try { m2.stop(); } catch (_) {} }
        notice = 'Ses kapalı.';
      } else {
        if (m2Profile && m2) { try { Promise.resolve(unlockM2Audio()).catch(function () {}); } catch (_) {} }
        selectVoice();
      }
      emit();
      return snapshot();
    }
    function unlockM2Audio() {
      var AC = win.AudioContext || win.webkitAudioContext;
      if (typeof AC !== 'function') throw new Error('M2_AUDIO_UNAVAILABLE');
      if (!m2Context || m2Context.state === 'closed') {
        try { m2Context = new AC({ sampleRate: 44100 }); }
        catch (_) { m2Context = new AC(); }
      }
      var context = m2Context;
      return Promise.resolve(typeof context.resume === 'function' ? context.resume() : undefined).then(function () {
        if (context !== m2Context || context.state && context.state !== 'running') throw new Error('M2_AUDIO_GESTURE_REQUIRED');
        return context;
      });
    }
    function unlockAudio() {
      var blocked = usable();
      if (blocked) return Promise.resolve(blocked);
      if (!m2Profile || !m2) return Promise.resolve({ ok: false, reason: 'M2_COMPONENT_UNAVAILABLE' });
      try {
        return unlockM2Audio().then(function () { return { ok: true }; }).catch(function () {
          return fail('M2_AUDIO_GESTURE_REQUIRED', 'Erkek sesi açmak için üstteki ses düğmesine yeniden dokun. Yazılı yanıtlar devam eder.');
        });
      } catch (_) { return Promise.resolve(fail('M2_AUDIO_UNAVAILABLE', 'Bu cihaz erkek sesi oynatamıyor. Yazılı yanıtlar devam eder.')); }
    }
    function stopM2Preparation() {
      if (!m2Profile || !m2Prepare) return;
      m2PrepareEpoch++;
      m2Prepare = null;
      try { if (m2) m2.stop(); } catch (_) {}
    }
    function stopM2Job(reason) {
      var job = m2Job;
      if (!job) return;
      m2Job = null;
      try { job.controller.abort(); } catch (_) {}
      job.sources.forEach(function (source) {
        try { source.onended = null; source.stop(); } catch (_) {}
        try { source.disconnect(); } catch (_) {}
      });
      job.sources.clear();
      try { if (m2) m2.stop(); } catch (_) {}
      job.resolve({ ok: false, reason: reason || 'CANCELLED' });
    }
    function prepareM2(input) {
      var blocked = usable();
      if (blocked) return Promise.resolve(blocked);
      if (!m2Profile || !m2 || !input || input.consent !== true) return Promise.resolve({ ok: false, reason: 'M2_CONSENT_REQUIRED' });
      if (m2Prepare) return m2Prepare;
      var contextReady;
      try { contextReady = unlockM2Audio(); }
      catch (_) { return Promise.resolve(fail('M2_AUDIO_UNAVAILABLE', 'Bu cihaz erkek sesi oynatamıyor. Yazılı yanıtlar devam eder.')); }
      var capturedOwner = owner, ticket = ++m2PrepareEpoch;
      notice = 'Erkek ses modeli hazırlanıyor. İlk indirme yaklaşık 400 MB; metin ve mikrofon kullanılabilir.';
      error = null;
      var operation = Promise.all([contextReady, m2.prepare({ consent: true })]).then(function () {
        if (destroyed || ticket !== m2PrepareEpoch || !accountCurrent(capturedOwner) || !visible()) return { ok: false, reason: 'CANCELLED' };
        m2State = m2.snapshot();
        if (m2State.status !== 'ready') throw new Error('M2_NOT_READY');
        notice = enabled ? 'Argon M2 erkek sesi hazır.' : 'Erkek sesi hazır; sesli yanıt kapalı.';
        error = null;
        return { ok: true, profile: 'supertonic-3-M2' };
      }).catch(function (cause) {
        if (destroyed || ticket !== m2PrepareEpoch || !accountCurrent(capturedOwner)) return { ok: false, reason: 'CANCELLED' };
        if (cause && cause.name === 'AbortError') return { ok: false, reason: 'CANCELLED' };
        return fail('M2_SETUP_FAILED', 'Erkek ses hazırlanamadı. Ses düğmesinden yeniden deneyebilirsin; yazılı yanıtlar devam eder.');
      }).then(function (result) {
        if (ticket === m2PrepareEpoch) { m2Prepare = null; emit(); }
        return result;
      });
      m2Prepare = operation;
      emit();
      return operation;
    }
    function speakM2(input) {
      if (!m2) return fail('M2_COMPONENT_UNAVAILABLE', 'Erkek ses bileşeni yüklenmedi. Uygulamayı kapatıp yeniden aç; yazılı yanıt hazır.');
      if (m2State.status !== 'ready') return fail('M2_SETUP_REQUIRED', 'Erkek sesi hazırlamak için üstteki ses düğmesine dokun. Yazılı yanıt hazır; Google sesi kullanılmadı.');
      if (!m2Context || m2Context.state !== 'running') return fail('M2_AUDIO_GESTURE_REQUIRED', 'Erkek sesi açmak için üstteki ses düğmesine dokun. Yazılı yanıt hazır.');
      stopListeningInternal('speaking');
      stopSpeakingInternal();
      var AC = win.AbortController || (typeof AbortController === 'function' ? AbortController : null);
      if (!AC) return fail('M2_CANCEL_UNAVAILABLE', 'Bu cihaz erkek sesi güvenle başlatamıyor. Yazılı yanıt hazır.');
      var resolveCompletion, completion = new Promise(function (resolve) { resolveCompletion = resolve; });
      var job = { epoch: speechEpoch, account: owner, id: input.id, controller: new AC(), sources: new Set(), nextAt: m2Context.currentTime || 0, frames: 0, chunks: 0, done: false, resolve: resolveCompletion };
      m2Job = job; activeSpeechId = input.id; mode = 'tts-loading'; error = null;
      notice = 'Argon M2 yanıtı hazırlıyor; mikrofon kapalı.';
      convoSpeechQueued(); emit();
      function valid() { return m2Job === job && job.epoch === speechEpoch && !job.controller.signal.aborted && accountCurrent(job.account) && visible() && enabled; }
      function finished() {
        if (!valid() || !job.done || job.sources.size) return;
        clearSpeechDeadline(); m2Job = null; activeSpeechId = null; mode = 'idle'; audioLevel = null;
        notice = 'Argon M2 erkek sesi hazır.';
        job.resolve({ ok: true, profile: 'supertonic-3-M2', chunks: job.chunks });
        emit(); convoSpeechEnded();
      }
      function failed(code) {
        if (!valid()) return;
        stopM2Job(code || 'M2_SYNTHESIS_FAILED');
        stopSpeakingInternal(); mode = 'idle'; convoSpeechEnded();
        fail(code || 'M2_SYNTHESIS_FAILED', 'Erkek sesli yanıt hazırlanamadı. Yazılı yanıt hazır; Google sesi kullanılmadı.');
      }
      function onChunk(chunk) {
        if (!valid()) return;
        var samples = chunk && chunk.samples;
        if (!chunk || chunk.profile !== 'supertonic-3-M2' || chunk.sampleRate !== 44100 || Object.prototype.toString.call(samples) !== '[object Float32Array]' || samples.length < 1 || samples.length > 44100 * 30 || job.frames + samples.length > 44100 * 180) { failed('M2_INVALID_PCM'); return; }
        for (var index = 0; index < samples.length; index++) if (!Number.isFinite(samples[index]) || Math.abs(samples[index]) > 1.01) { failed('M2_INVALID_PCM'); return; }
        try {
          var context = m2Context, buffer = context.createBuffer(1, samples.length, 44100), source = context.createBufferSource();
          if (typeof buffer.copyToChannel === 'function') buffer.copyToChannel(samples, 0);
          else buffer.getChannelData(0).set(samples);
          source.buffer = buffer;
          // The approved M2 sample was raw PCM: no device TTS, pitch shifting, EQ or gain preset.
          source.connect(context.destination);
          var at = Math.max((context.currentTime || 0) + 0.015, job.nextAt);
          job.nextAt = at + samples.length / 44100;
          job.frames += samples.length; job.chunks++; job.sources.add(source);
          source.onended = function () {
            if (!valid()) return;
            job.sources.delete(source);
            try { source.disconnect(); } catch (_) {}
            if (!job.sources.size && !job.done) { mode = 'tts-loading'; notice = 'Argon M2 yanıtı tamamlıyor; mikrofon kapalı.'; emit(); }
            finished();
          };
          source.start(at);
          clearSpeechDeadline(); rememberSpoken(input.id); mode = 'speaking'; notice = 'Argon M2 konuşuyor.';
          convoSpeechStarted(); emit();
        } catch (_) { failed('M2_PLAYBACK_FAILED'); }
      }
      speechStartTimer = setTimeout(function () { failed('M2_START_TIMEOUT'); }, 120000);
      try {
        Promise.resolve(m2.synthesize(input.text.trim(), { signal: job.controller.signal, onChunk: onChunk })).then(function () {
          if (!valid()) return;
          if (!job.chunks) { failed('M2_EMPTY_AUDIO'); return; }
          job.done = true; finished();
        }).catch(function (cause) { if (valid()) failed(cause && cause.name === 'AbortError' ? 'M2_CANCELLED' : 'M2_SYNTHESIS_FAILED'); });
      } catch (_) { failed('M2_SYNTHESIS_FAILED'); }
      return { ok: true, id: input.id, engine: 'supertonic-3-M2', pending: true, completion: completion };
    }
    function clearSpeechDeadline() {
      if (speechStartTimer !== null) { clearTimeout(speechStartTimer); speechStartTimer = null; }
    }
    function rememberSpoken(id) {
      spokenIds.add(id);
      if (spokenIds.size > 100) spokenIds.delete(spokenIds.values().next().value);
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
      if (m2Profile) return speakM2(input);
      selectVoice();
      var AC = win.AudioContext || win.webkitAudioContext;
      var encoded = input.audioB64;
      if (encoded !== null && encoded !== undefined && encoded !== '' &&
          (typeof encoded !== 'string' || encoded.length > MAX_AUDIO_B64 || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))) {
        return fail('INVALID_AUDIO', 'Ses paketi geçersiz veya çok büyük. Yazılı yanıt hazır.');
      }
      // Only decoded audio can pass through Web Audio filters. Browser/native speechSynthesis cannot.
      if (typeof encoded === 'string' && encoded && typeof AC === 'function') {
        var bytes;
        try {
          var binStr;
          if (typeof win.atob === 'function') binStr = win.atob(encoded);
          else if (typeof Buffer !== 'undefined') binStr = Buffer.from(encoded, 'base64').toString('binary');
          else throw new Error('NO_BASE64_DECODER');
          if (binStr.length < 16) throw new Error('AUDIO_TOO_SHORT');
          bytes = new Uint8Array(binStr.length);
          for (var bi = 0; bi < binStr.length; bi++) bytes[bi] = binStr.charCodeAt(bi);
        } catch (_) { return fail('INVALID_AUDIO', 'Ses paketi çözülemedi. Yazılı yanıt hazır.'); }
        stopListeningInternal('speaking');
        stopSpeakingInternal();
        var bEpoch = speechEpoch, bAccount = owner, playState = null;
        function audioValid() {
          return bEpoch === speechEpoch && webAudioPlayback === playState && accountCurrent(bAccount) && visible();
        }
        function audioFailed(code) {
          if (bEpoch !== speechEpoch || webAudioPlayback !== playState) return;
          stopSpeakingInternal(); audioLevel = null; mode = 'idle';
          convoSpeechEnded();
          fail(code || 'TTS_AUDIO_FAILED', 'Sesli yanıt başlatılamadı. Yazılı yanıtı okuyabilir veya yeniden deneyebilirsin.');
        }
        try {
          var ctx = new AC();
          playState = { context: ctx, source: null, chain: null, meterTimer: null };
          webAudioPlayback = playState;
          if (typeof ctx.decodeAudioData !== 'function' || typeof ctx.createBufferSource !== 'function') throw new Error('UNSUPPORTED_AUDIO');
          var chain = createJarvisAudioFilter(ctx);
          if (!chain) throw new Error('UNSUPPORTED_FILTER');
          playState.chain = chain;
          activeSpeechId = input.id;
          error = null; audioLevel = null; mode = 'idle';
          convoSpeechQueued();
          speechStartTimer = setTimeout(function () { audioFailed('TTS_START_TIMEOUT'); }, startupTimeoutMs);
          emit();
          Promise.resolve(ctx.decodeAudioData(bytes.buffer)).then(function (audioBuf) {
            if (!audioValid()) return;
            if (!audioBuf || !Number.isFinite(audioBuf.duration) || audioBuf.duration <= 0 || audioBuf.duration > 180 || audioBuf.numberOfChannels > 2) throw new Error('INVALID_AUDIO_DURATION');
            return Promise.resolve(typeof ctx.resume === 'function' ? ctx.resume() : undefined).then(function () {
              if (!audioValid()) return;
              if (typeof ctx.state === 'string' && ctx.state !== 'running') throw new Error('AUDIO_NOT_RUNNING');
              var src = ctx.createBufferSource();
              src.buffer = audioBuf; src.connect(chain.input); playState.source = src;
              src.onended = function () {
                if (!audioValid()) return;
                stopWebAudioPlayback(); activeSpeechId = null; mode = 'idle'; audioLevel = null;
                emit(); convoSpeechEnded();
              };
              src.start(0);
              clearSpeechDeadline(); rememberSpoken(input.id);
              mode = 'speaking'; convoSpeechStarted(); emit();
              if (chain.analyser) {
                var freqData = new Uint8Array(chain.analyser.fftSize);
                playState.meterTimer = setInterval(function () {
                  if (!audioValid() || mode !== 'speaking') return;
                  try {
                    chain.analyser.getByteTimeDomainData(freqData);
                    var sum = 0;
                    for (var k = 0; k < freqData.length; k++) { var dv = (freqData[k] - 128) / 128; sum += dv * dv; }
                    audioLevel = Math.max(0, Math.min(1, Math.sqrt(sum / freqData.length) * 3.5)); emit();
                  } catch (_) { audioLevel = null; }
                }, 50);
              }
            });
          }).catch(function () { audioFailed('TTS_AUDIO_FAILED'); });
          return { ok: true, id: input.id, engine: 'web-audio-jarvis-filter', voice: null };
        } catch (_) { audioFailed('TTS_AUDIO_FAILED'); return { ok: false, reason: 'TTS_AUDIO_FAILED' }; }
      }
      if (!synth || typeof synth.speak !== 'function' || typeof Utterance !== 'function' || !voice) return fail('TURKISH_VOICE_UNAVAILABLE', localOnly ? 'Yerel Türkçe ses bulunamadı. Yazılı yanıt hazır.' : 'Türkçe ses bulunamadı. Yazılı yanıt hazır.');
      stopListeningInternal('speaking');
      stopSpeakingInternal();
      var epoch = speechEpoch, account = owner, current;
      try { current = new Utterance(input.text.trim()); }
      catch (_) { return fail('TTS_FAILED', 'Türkçe ses başlatılamadı. Yazılı yanıt hazır.'); }
      utterance = current; activeSpeechId = input.id;
      current.lang = 'tr-TR'; current.voice = voice;
      if (options.tone === 'argon') { current.rate = 1.04; current.pitch = isMaleVoice(voice) ? 0.94 : 0.8; }
      else { current.rate = 0.94; current.pitch = 1; }
      current.volume = 1;
      function valid() { return epoch === speechEpoch && utterance === current && accountCurrent(account) && visible(); }
      current.onstart = function () {
        if (!valid()) return;
        clearSpeechDeadline(); rememberSpoken(input.id);
        mode = 'speaking'; error = null; audioLevel = null; convoSpeechStarted(); emit();
      };
      current.onend = function () {
        if (!valid()) return;
        clearSpeechDeadline(); utterance = null; activeSpeechId = null; mode = 'idle'; audioLevel = null;
        emit(); convoSpeechEnded();
      };
      current.onerror = function (event) {
        if (!valid()) return;
        clearSpeechDeadline(); utterance = null; activeSpeechId = null; mode = 'idle'; audioLevel = null;
        convoSpeechEnded();
        fail('TTS_' + String(event && event.error || 'FAILED').toUpperCase().replace(/[^A-Z_-]/g, ''), 'Sesli yanıt durdu. Yazılı yanıtı okuyabilirsin.');
      };
      try {
        error = null; convoSpeechQueued();
        speechStartTimer = setTimeout(function () {
          if (!valid()) return;
          stopSpeakingInternal(); convoSpeechEnded();
          fail('TTS_START_TIMEOUT', 'Cihaz sesli yanıtı başlatmadı. Yazılı yanıt hazır; yeniden deneyebilirsin.');
        }, startupTimeoutMs);
        synth.speak(current); emit();
        return { ok: true, id: input.id, engine: 'speech-synthesis', voice: String(voice.name || '') };
      } catch (_) {
        if (utterance === current) stopSpeakingInternal();
        convoSpeechEnded();
        return fail('TTS_FAILED', 'Sesli yanıt başlatılamadı. Yazılı yanıt hazır.');
      }
    }
    function startListening(input) {
      var blocked = usable();
      if (blocked) return Object.assign(blocked, { stop: function () {} });
      if (m2Profile && enabled && m2) { try { Promise.resolve(unlockM2Audio()).catch(function () {}); } catch (_) {} }
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
    /* Hands-free is explicit, account-owned and foreground-only. A quiet recognition-update
       interval is a turn heuristic, not proof that a particular person spoke or acoustic silence. */
    var convo = null;
    var SILENCE_MS = Math.max(10, Math.min(5000, Number(options.silenceMs) || 1000));
    function convoCurrent(c) {
      if (!c || convo !== c || destroyed) return false;
      if (!visible()) { stopConversation(); return false; }
      if (c.accountKey !== readAccount() || c.accountKey !== owner) { accountCurrent(c.accountKey); return false; }
      return true;
    }
    function convoStopRec() {
      if (!convo) return;
      if (convo.timer) { clearTimeout(convo.timer); convo.timer = null; }
      var r = convo.rec; convo.rec = null;
      releaseMeasurement();
      if (r) { r.onstart = r.onresult = r.onend = r.onerror = null; try { r.abort ? r.abort() : r.stop(); } catch (_) {} }
      if (mode === 'listening') mode = 'idle';
    }
    function releaseConvoMeter(m) {
      if (!m) return;
      if (m.timer) clearInterval(m.timer);
      try { m.source && m.source.disconnect(); } catch (_) {}
      try { m.analyser && m.analyser.disconnect && m.analyser.disconnect(); } catch (_) {}
      if (m.stream && m.stream.getTracks) m.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (_) {} });
      if (m.context && m.context.close) try { Promise.resolve(m.context.close()).catch(function () {}); } catch (_) {}
    }
    function convoDisarm() {
      if (!convo || !convo.meter) return;
      var m = convo.meter; convo.meter = null; releaseConvoMeter(m);
    }
    function convoFlush() {
      var c = convo;
      if (!convoCurrent(c)) return;
      var text = c.buffer.trim().slice(0, 6000); c.buffer = '';
      if (c.timer) { clearTimeout(c.timer); c.timer = null; }
      if (text) try { c.onUtterance(text); } catch (_) {}
    }
    function convoRetry(c, code, delay) {
      if (!convoCurrent(c)) return;
      c.failures += 1;
      if (c.failures >= 5) {
        stopConversation(); fail('RECOGNITION_RETRY_LIMIT', 'Ses tanıma tekrar tekrar durdu. Canlı modu yeniden açabilir veya yazabilirsin.'); return;
      }
      if (mode === 'listening') mode = 'idle';
      notice = code === 'network' ? 'Ses tanıma bağlantısı bekleniyor.' : 'Ses tanıma yeniden hazırlanıyor.';
      emit(); convoRestart(delay);
    }
    function convoListen() {
      var c = convo;
      if (!convoCurrent(c) || c.paused || c.rec) return;
      if (utterance || webAudioPlayback || mode === 'speaking') { if (mode === 'speaking') convoArmBargeIn(); return; }
      if (typeof Recognition !== 'function') { stopConversation(); fail('RECOGNITION_UNAVAILABLE', 'Bu cihazda sürekli Türkçe ses tanıma yok. Yazarak konuşabilirsin.'); return; }
      var current;
      try { current = new Recognition(); } catch (_) { convoRetry(c, 'failed', 800); return; }
      c.rec = current;
      current.lang = 'tr-TR'; current.continuous = true; current.interimResults = true; current.maxAlternatives = 1;
      current.onstart = function () {
        if (!convoCurrent(c) || c.rec !== current || mode === 'speaking') return;
        mode = 'listening'; notice = 'Canlı: dinliyorum.'; error = null; emit(); beginMeasurement(listenEpoch, c.accountKey, c);
      };
      current.onresult = function (event) {
        if (!convoCurrent(c) || c.rec !== current) return;
        var results = event && event.results || [], text = '';
        for (var i = 0; i < results.length; i++) text += (text ? ' ' : '') + String(results[i] && results[i][0] && results[i][0].transcript || '').trim();
        c.buffer = text.trim().slice(0, 6000); c.failures = 0;
        if (typeof c.onPartial === 'function') try { c.onPartial(c.buffer); } catch (_) {}
        if (c.timer) clearTimeout(c.timer);
        c.timer = setTimeout(function () {
          if (!convoCurrent(c) || c.rec !== current) return;
          convoStopRec(); convoFlush(); convoRestart(150);
        }, SILENCE_MS);
      };
      current.onend = function () {
        if (!convoCurrent(c) || c.rec !== current) return;
        c.rec = null; releaseMeasurement();
        if (c.buffer.trim()) convoFlush();
        if (mode === 'listening') { mode = 'idle'; emit(); }
        convoRestart(250);
      };
      current.onerror = function (event) {
        if (!convoCurrent(c) || c.rec !== current) return;
        var code = String(event && event.error || 'failed');
        convoStopRec();
        if (code === 'not-allowed' || code === 'service-not-allowed') { stopConversation(); fail('RECOGNITION_NOT_ALLOWED', 'Mikrofon izni verilmedi. Canlı mod kapandı; yazarak konuşabilirsin.'); return; }
        convoRetry(c, code, code === 'network' ? 1500 : 400);
      };
      try { current.start(); } catch (_) { if (c.rec === current) convoStopRec(); convoRetry(c, 'failed', 800); }
    }
    function convoRestart(ms) {
      var c = convo;
      if (!convoCurrent(c)) return;
      if (c.restartTimer) clearTimeout(c.restartTimer);
      c.restartTimer = setTimeout(function () { c.restartTimer = null; if (convoCurrent(c)) convoListen(); }, ms);
    }
    function convoArmBargeIn() {
      var c = convo;
      if (!convoCurrent(c) || c.meter || options.bargeIn === false || mode !== 'speaking') return;
      var media = win.navigator && win.navigator.mediaDevices, AC = win.AudioContext || win.webkitAudioContext;
      if (!media || typeof media.getUserMedia !== 'function' || typeof AC !== 'function') return;
      var armedAt = Date.now(), m = { stream: null, context: null, source: null, analyser: null, timer: null }, pending;
      c.meter = m;
      try { pending = media.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false }, video: false }); }
      catch (_) { c.meter = null; return; }
      Promise.resolve(pending).then(function (stream) {
        m.stream = stream;
        if (!convoCurrent(c) || c.meter !== m || mode !== 'speaking') { if (c.meter === m) c.meter = null; releaseConvoMeter(m); return; }
        m.context = new AC(); var analyser = m.context.createAnalyser(); m.analyser = analyser; analyser.fftSize = 512;
        m.source = m.context.createMediaStreamSource(stream); m.source.connect(analyser);
        return Promise.resolve(typeof m.context.resume === 'function' ? m.context.resume() : undefined).then(function () {
          if (!convoCurrent(c) || c.meter !== m || mode !== 'speaking') { if (c.meter === m) c.meter = null; releaseConvoMeter(m); return; }
          if (typeof m.context.state === 'string' && m.context.state !== 'running') throw new Error('METER_NOT_RUNNING');
          var data = new Uint8Array(analyser.fftSize), loud = 0;
          m.timer = setInterval(function () {
            if (!convoCurrent(c) || c.meter !== m || mode !== 'speaking') { if (c.meter === m) c.meter = null; releaseConvoMeter(m); return; }
            try { analyser.getByteTimeDomainData(data); } catch (_) { convoDisarm(); return; }
            var sum = 0;
            for (var i = 0; i < data.length; i++) { var v = (data[i] - 128) / 128; sum += v * v; }
            var rms = Math.sqrt(sum / data.length);
            loud = rms > (options.bargeInLevel || 0.07) ? loud + 50 : Math.max(0, loud - 50);
            if (Date.now() - armedAt > 500 && loud >= 250) {
              convoDisarm(); stopSpeakingInternal(); mode = 'idle'; notice = 'Sözünü kestim; dinliyorum.'; emit();
              if (typeof c.onBargeIn === 'function') try { c.onBargeIn(); } catch (_) {}
              convoListen();
            }
          }, 50);
        });
      }).catch(function () { if (c.meter === m) c.meter = null; releaseConvoMeter(m); });
    }
    bind(doc, 'oryvona:voice-audition', function (event) {
      cancel();
      voiceAuditionActive = !(event && event.detail && event.detail.active === false);
      if (event && event.detail && typeof event.detail === 'object') event.detail.cancelled = true;
    });
    function startConversation(handlers) {
      var blocked = usable(); if (blocked) return blocked;
      if (typeof Recognition !== 'function') return fail('RECOGNITION_UNAVAILABLE', 'Bu cihazda sürekli Türkçe ses tanıma yok. Yazarak konuşabilirsin.');
      handlers = handlers || {};
      stopAll('conversation');
      convo = { accountKey: owner, onUtterance: handlers.onUtterance || function () {}, onPartial: handlers.onPartial, onBargeIn: handlers.onBargeIn, buffer: '', timer: null, restartTimer: null, rec: null, meter: null, paused: false, failures: 0 };
      enabled = true; selectVoice(); notice = 'Canlı mod açık: konuş, susunca gönderirim.'; error = null; emit();
      convoListen();
      return { ok: true, stop: stopConversation };
    }
    function stopConversation() {
      if (!convo) return;
      var c = convo;
      if (c.restartTimer) { clearTimeout(c.restartTimer); c.restartTimer = null; }
      convoStopRec(); convoDisarm(); convo = null;
      if (mode === 'listening') mode = 'idle';
      notice = 'Canlı mod kapalı.'; emit();
    }
    // Pause recognition while queued, but claim speaking and arm barge-in only after real playback starts.
    function convoSpeechQueued() { if (!convo) return; convoStopRec(); convoDisarm(); }
    function convoSpeechStarted() { if (!convo) return; convoStopRec(); convoArmBargeIn(); }
    function convoSpeechEnded() { if (!convo) return; convoDisarm(); convoRestart(200); }
    function cancel() { if (destroyed) return; stopConversation(); stopAll('cancelled'); notice = 'Ses durduruldu.'; emit(); }
    function contextChanged() { accountCurrent(); }
    function hidden() { if (!visible()) cancel(); }
    function voicesChanged() { if (!destroyed) { accountCurrent(); selectVoice(); emit(); } }
    if (m2Profile && win.OryvonaM2Voice && typeof win.OryvonaM2Voice.create === 'function') {
      try {
        m2 = win.OryvonaM2Voice.create({ window: win, onState: function (next) {
          m2State = next || { status: 'setup_required', progress: 0, error: null };
          if (enabled && !m2Job) {
            if (m2Prepare && m2State.status === 'loading') notice = 'Erkek ses modeli hazırlanıyor: %' + Math.round(Math.max(0, Math.min(1, Number(m2State.progress) || 0)) * 100) + '. Metin ve mikrofon kullanılabilir.';
            else if (!m2Prepare) selectVoice();
          }
          if (!destroyed) emit();
        } });
        m2State = m2.snapshot();
      } catch (_) { m2 = null; m2State = { status: 'error', progress: 0, error: 'M2_UNAVAILABLE' }; }
    }
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
      unlockAudio: unlockAudio,
      prepareM2: prepareM2,
      startListening: startListening,
      startConversation: startConversation,
      stopConversation: function () { if (!destroyed) stopConversation(); },
      conversationActive: function () { return !!convo; },
      stopListening: function () { if (!destroyed) { stopListeningInternal('stopped'); emit(); } },
      speak: speak,
      stopSpeaking: function () { if (!destroyed) { stopSpeakingInternal(); convoSpeechEnded(); emit(); } },
      cancel: cancel,
      destroy: function () {
        if (destroyed) return;
        stopConversation();
        stopAll('destroyed');
        if (m2Context && typeof m2Context.close === 'function') { try { Promise.resolve(m2Context.close()).catch(function () {}); } catch (_) {} }
        m2Context = null;
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
