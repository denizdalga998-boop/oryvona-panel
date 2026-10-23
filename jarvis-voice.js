/* Explicit phone gestures only: Gemini Live audio-to-audio, generated Gemini TTS (Charon), and the phone's Turkish Android TTS
   whenever Charon cannot play for any reason (quota, server TTS failure, slow audio, suspended web audio, bad WAV). Argon never goes
   silent while a Turkish phone voice exists; every fallback and failure carries its real reason. */
(function (root, factory) {
  'use strict'; var api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.OryvonaJarvisVoice = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var STYLE = "Iron Man J.A.R.V.I.S. tarzı: sakin, tok, kendinden emin, ölçülü bir İngiliz beyefendisi nezaketi ve hafif kuru zeki bir mizah taşıyan asistan tonu";
  function pcmWav(pcm, rate, channels) {
    rate = Number(rate) || 24000; channels = Number(channels) || 1;
    if (!(pcm instanceof Uint8Array) || !pcm.byteLength || pcm.byteLength % (2 * channels) || ![1, 2].includes(channels) || rate < 8000 || rate > 96000) throw Error('INVALID_PCM');
    var data = new Uint8Array(44 + pcm.byteLength), view = new DataView(data.buffer);
    function ascii(offset, str) { for (var i = 0; i < str.length; i++) data[offset + i] = str.charCodeAt(i); }
    ascii(0, 'RIFF'); view.setUint32(4, 36 + pcm.byteLength, true); ascii(8, 'WAVE'); ascii(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true); view.setUint32(24, rate, true); view.setUint32(28, rate * channels * 2, true); view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); ascii(36, 'data'); view.setUint32(40, pcm.byteLength, true); data.set(pcm, 44); return data;
  }
  // v1.2: Google Cloud Charon is MP3: an ID3 tag or an MPEG frame sync must open the data.
  function mp3Valid(b) { return !!b && b.length > 4 && ((b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)); }
  function wavValid(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length < 44 || bytes.length > 8 * 1024 * 1024) return false;
    var v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    function ascii(at, size) { return String.fromCharCode.apply(null, bytes.slice(at, at + size)); }
    return ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE' && v.getUint32(4, true) + 8 === bytes.length;
  }
  function resample16k(float, sourceRate) {
    var step = sourceRate / 16000, out = new Int16Array(Math.floor(float.length / step));
    for (var i = 0; i < out.length; i++) { var start = Math.floor(i * step), end = Math.max(start + 1, Math.floor((i + 1) * step)), sum = 0; for (var j = start; j < end && j < float.length; j++) sum += float[j]; var value = Math.max(-1, Math.min(1, sum / (end - start))); out[i] = value < 0 ? value * 32768 : value * 32767; }
    return new Uint8Array(out.buffer);
  }
  function create(options) {
    options = options || {}; var win = options.window || (typeof window !== 'undefined' ? window : {}), doc = options.document || win.document, client = options.geminiClient;
    if (!client || typeof client.synthesize !== 'function' || typeof client.startLive !== 'function' || typeof options.getAccountKey !== 'function') throw TypeError('Google voice client required');
    var listeners = new Set(), removers = [], enabled = false, destroyed = false, gestureGranted = false, owner = options.getAccountKey(), epoch = 0;
    var context = null, capture = null, live = null, sources = new Set(), activeUtterance = null, nextAt = 0, spoken = new Set(), ttsIds = new Map(), playbackPrepareMs = null;
    // v1.7: Charon audio of the last spoken replies (by reply id) for "Dinle", and which reply is being read right now.
    var clips = new Map(), reading = null;
    var state = { mode: 'idle', notice: 'Ses kapalı. Telefonda ses düğmesine dokun.', error: null, audioLevel: null, voiceName: 'Charon', voiceProvider: 'google-ai-studio', voiceLang: 'tr-TR', localVoice: false };
    function phone() { var n = win.navigator || {}, mobile = !!win.ArgonNative || n.userAgentData && n.userAgentData.mobile === true || /Android|iPhone|iPad|iPod/i.test(n.userAgent || ''); return mobile && n.webdriver !== true; }
    function visible() { return !doc || doc.hidden !== true; }
    function gesture() { return phone() && visible() && !!(win.navigator && win.navigator.userActivation && win.navigator.userActivation.isActive); }
    function turkishAndroidVoice() {
      var synth = win.speechSynthesis;
      if (!synth || typeof synth.speak !== 'function' || typeof synth.getVoices !== 'function' || typeof win.SpeechSynthesisUtterance !== 'function') return null;
      var voices = [];
      try { voices = synth.getVoices() || []; } catch (_) { voices = []; }
      for (var i = 0; i < voices.length; i++) {
        var v = voices[i];
        if (v && typeof v.lang === 'string' && /^tr(?:-|_|$)/i.test(v.lang.trim())) return v;
      }
      return null;
    }
    function available() { return phone() && (typeof (win.AudioContext || win.webkitAudioContext) === 'function' || !!turkishAndroidVoice()); }
    function snapshot() {
      var isAndroidFallback = state.voiceProvider === 'android-tts';
      return Object.freeze({
        enabled: enabled,
        ttsAvailable: available(),
        recognitionAvailable: available() && !!(win.navigator && win.navigator.mediaDevices && win.navigator.mediaDevices.getUserMedia),
        mode: state.mode,
        voiceName: state.voiceName || 'Charon',
        voiceProvider: state.voiceProvider || 'google-ai-studio',
        voiceProfile: {
          voiceId: isAndroidFallback ? (state.voiceName || 'Android Türkçe') : 'Charon',
          fallbackVoiceId: 'Fenrir',
          provider: state.voiceProvider || 'google-ai-studio',
          lang: state.voiceLang || 'tr-TR',
          speech_metadata: { style: STYLE }
        },
        localVoice: Boolean(state.localVoice),
        needsVoiceSetup: false,
        voiceSetupPending: false,
        voicePending: state.mode === 'tts-loading',
        audioLevel: state.audioLevel,
        notice: state.notice,
        error: state.error,
        conversationActive: !!live,
        readingId: reading ? reading.id : null,
        readingPhase: reading ? reading.phase : 'idle',
        timings: { playback_prepare_ms: playbackPrepareMs }
      });
    }
    function emit() { listeners.forEach(function (fn) { try { fn(snapshot()); } catch (_) {} }); }
    function fail(reason, text) { state.error = text; state.notice = text; emit(); return { ok: false, reason: reason }; }
    function current(ticket, captured) { return !destroyed && ticket === epoch && captured && captured === options.getAccountKey() && visible(); }
    function stopPlayback() {
      sources.forEach(function (s) { try { s.onended = null; s.stop(); s.disconnect(); } catch (_) {} });
      sources.clear();
      if (activeUtterance) {
        var u = activeUtterance;
        activeUtterance = null;
        try { u.onstart = null; u.onend = null; u.onerror = null; } catch (_) {}
        try { if (win.speechSynthesis && typeof win.speechSynthesis.cancel === 'function') win.speechSynthesis.cancel(); } catch (_) {}
      }
      nextAt = 0;
      state.audioLevel = null;
      reading = null;
    }
    function stopCapture() { var c = capture; capture = null; if (!c) return; if (c.processor) { c.processor.onaudioprocess = null; try { c.processor.disconnect(); } catch (_) {} } if (c.source) try { c.source.disconnect(); } catch (_) {} if (c.gain) try { c.gain.disconnect(); } catch (_) {} if (c.stream) c.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (_) {} }); }
    function stopConversation() { live = null; client.stopLive('owner-stop'); stopCapture(); if (state.mode !== 'tts-loading') state.mode = 'idle'; state.notice = 'Canlı ses kapalı.'; emit(); }
    function cancel() { epoch++; stopConversation(); stopPlayback(); state.mode = 'idle'; emit(); }
    function ownerCurrent() { var next = options.getAccountKey(); if (next !== owner) { owner = next; cancel(); enabled = gestureGranted = false; spoken.clear(); ttsIds.clear(); playbackPrepareMs = null; state.voiceName = 'Charon'; state.voiceProvider = 'google-ai-studio'; state.voiceLang = 'tr-TR'; state.localVoice = false; } return !!owner && !destroyed; }
    function unlockAudio() {
      if (!ownerCurrent() || !gesture()) return Promise.resolve(fail('PHONE_GESTURE_REQUIRED', 'Ses yalnız telefonda açık bir dokunuşla açılır. DJ-KABIN’de ses ve mikrofon kapalı.'));
      gestureGranted = true; var AC = win.AudioContext || win.webkitAudioContext;
      if (typeof AC !== 'function') {
        if (turkishAndroidVoice()) return Promise.resolve({ ok: true });
        return Promise.resolve(fail('AUDIO_UNAVAILABLE', 'Bu telefon ses oynatamıyor. Yazılı yanıtlar devam eder.'));
      }
      try { if (!context || context.state === 'closed') context = new AC(); var pending = context.resume ? context.resume() : undefined; return Promise.resolve(pending).then(function () { return { ok: true }; }); }
      catch (_) { return Promise.resolve(fail('AUDIO_PERMISSION_REQUIRED', 'Sesi açmak için ses düğmesine yeniden dokun.')); }
    }
    function setEnabled(value) {
      if (!value) { enabled = false; cancel(); state.notice = 'Sesli yanıt kapalı.'; emit(); return snapshot(); }
      if (!ownerCurrent() || !gesture()) { fail('PHONE_GESTURE_REQUIRED', 'Ses yalnız telefondaki ses düğmesiyle açılabilir.'); return snapshot(); }
      enabled = true; gestureGranted = true; unlockAudio().catch(function () {}); state.error = null; state.notice = 'Gemini Charon sesi açık. Yeni yanıtlar seslendirilecek.'; emit(); return snapshot();
    }
    function bytes(b64) { if (typeof b64 !== 'string' || b64.length > 12 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) throw Error('INVALID_AUDIO'); var raw = win.atob(b64), out = new Uint8Array(raw.length); for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i); return out; }
    function encode(array) { var s = ''; for (var i = 0; i < array.length; i++) s += String.fromCharCode(array[i]); return win.btoa(s); }
    function playBuffer(buffer, ticket, captured, streaming, onStart) {
      if (!current(ticket, captured) || !enabled || !gestureGranted || !phone() || !context || context.state !== 'running') return false;
      var source = context.createBufferSource(); source.buffer = buffer; source.connect(context.destination); sources.add(source);
      var start = streaming ? Math.max(context.currentTime, nextAt) : context.currentTime; nextAt = start + buffer.duration;
      source.onended = function () { sources.delete(source); try { source.disconnect(); } catch (_) {} if (!sources.size && current(ticket, captured)) { state.mode = live ? 'listening' : 'idle'; state.audioLevel = null; if (reading && reading.ticket === ticket) reading = null; emit(); } };
      state.voiceName = 'Charon'; state.voiceProvider = 'google-ai-studio'; state.voiceLang = 'tr-TR'; state.localVoice = false;
      var meta = { ok: true, provider: streaming ? 'google-ai-studio-live' : 'google-ai-studio', voiceName: 'Charon', voiceLang: 'tr-TR', localVoice: false };
      source.start(start); if (typeof onStart === 'function') onStart(meta); state.mode = 'speaking'; state.notice = streaming ? 'Argon konuşuyor (Gemini Live · Charon).' : 'Argon konuşuyor (Google TTS · Charon).'; emit(); return true;
    }
    /* Plain Turkish reason shown to Deniz when Charon cannot play. The code itself is kept for diagnostics. */
    function charonFailureText(code) {
      var c = String(code || '');
      if (/QUOTA/i.test(c)) return 'Google ses kotası doldu';
      if (c === 'AUDIO_PREPARATION_TIMEOUT') return 'Charon sesi zamanında hazırlanamadı';
      if (/^AUDIO_CONTEXT_/.test(c)) return 'telefonun web ses çıkışı uykuda';
      if (/^SERVER_TTS_/.test(c)) return 'sunucu Charon sesini üretemedi (' + c.replace(/^SERVER_TTS_/, '').toLowerCase() + ')';
      if (c === 'INVALID_WAV' || c === 'INVALID_AUDIO' || /decode/i.test(c)) return 'Charon ses dosyası çözülemedi';
      return 'Charon sesi açılamadı (' + (c || 'bilinmiyor').slice(0, 60) + ')';
    }
    function speakAndroidTurkish(trVoice, input, ticket, captured, clock, began, reasonCode) {
      return new Promise(function (resolve, reject) {
        if (!current(ticket, captured) || !enabled || !gestureGranted || !phone()) { resolve({ ok: false, reason: 'CANCELLED' }); return; }
        var voiceLabel = String(trVoice.name || trVoice.voiceURI || 'Android Türkçe').trim() || 'Android Türkçe';
        var voiceLang = String(trVoice.lang || 'tr-TR').trim() || 'tr-TR';
        var isLocal = trVoice.localService !== false;
        var reasonText = charonFailureText(reasonCode || 'GOOGLE_TTS_QUOTA');
        state.voiceName = voiceLabel;
        state.voiceProvider = 'android-tts';
        state.voiceLang = voiceLang;
        state.localVoice = isLocal;
        state.notice = 'Telefonun Türkçe sesi (' + voiceLabel + ') hazırlanıyor · ' + reasonText + '.';
        emit();
        var u;
        try {
          u = new win.SpeechSynthesisUtterance(String(input.text).slice(0, 2400));
          u.lang = voiceLang;
          u.voice = trVoice;
          u.rate = 0.98;
          u.pitch = 0.92;
          u.volume = 1;
        } catch (err) {
          reject(err || Error('ANDROID_TTS_FAILED'));
          return;
        }
        var started = false;
        activeUtterance = u;
        u.onstart = function () {
          if (started) return;
          started = true;
          if (!current(ticket, captured) || !enabled || !gestureGranted || !phone() || activeUtterance !== u) {
            try { if (win.speechSynthesis && typeof win.speechSynthesis.cancel === 'function') win.speechSynthesis.cancel(); } catch (_) {}
            resolve({ ok: false, reason: 'CANCELLED' });
            return;
          }
          playbackPrepareMs = Math.round(clock() - began);
          var meta = {
            ok: true,
            fallback: 'android-tts',
            provider: 'android-tts',
            voiceName: voiceLabel,
            voiceLang: voiceLang,
            localVoice: isLocal,
            fallbackReason: String(reasonCode || 'GOOGLE_TTS_QUOTA'),
            fallbackReasonText: reasonText,
            timings: { playback_prepare_ms: playbackPrepareMs }
          };
          if (typeof input.onStart === 'function') input.onStart(meta);
          state.mode = 'speaking';
          state.error = null;
          state.notice = 'Telefonun Türkçe sesi (' + voiceLabel + ') konuşuyor · ' + reasonText + '.';
          emit();
          spoken.add(input.id);
          reading = { id: input.id, phase: 'playing', ticket: ticket };
          emit();
          resolve(meta);
        };
        u.onend = function () {
          if (activeUtterance === u) activeUtterance = null;
          if (!started) {
            reject(Error('ANDROID_TTS_ENDED_BEFORE_START'));
            return;
          }
          if (current(ticket, captured)) {
            state.mode = live ? 'listening' : 'idle';
            state.audioLevel = null;
            if (reading && reading.ticket === ticket) reading = null;
            emit();
          }
        };
        u.onerror = function () {
          if (activeUtterance === u) activeUtterance = null;
          if (!started) {
            reject(Error('ANDROID_TTS_FAILED'));
            return;
          }
          if (current(ticket, captured)) {
            state.mode = live ? 'listening' : 'idle';
            state.audioLevel = null;
            if (reading && reading.ticket === ticket) reading = null;
            emit();
          }
        };
        try {
          win.speechSynthesis.speak(u);
        } catch (err) {
          if (activeUtterance === u) activeUtterance = null;
          reject(err || Error('ANDROID_TTS_FAILED'));
        }
      });
    }
    /* A page that was unlocked by a tap may later find its AudioContext suspended (app switch, lock screen, microphone use).
       resume() is retried once without a new gesture; a context that stays asleep sends the reply to the phone's own voice. */
    function ensureContext() {
      if (context && context.state === 'running') return Promise.resolve(true);
      if (!context || context.state === 'closed' || typeof context.resume !== 'function') return Promise.resolve(false);
      var timer;
      return Promise.race([
        Promise.resolve().then(function () { return context.resume(); }).then(function () { return !!context && context.state === 'running'; }, function () { return false; }),
        new Promise(function (resolve) { timer = setTimeout(function () { resolve(false); }, 900); })
      ]).then(function (value) { clearTimeout(timer); return value; });
    }
    function failureCode(error) {
      var raw = error && (error.code || error.message || error.name) || 'GOOGLE_TTS_UNAVAILABLE';
      return String(raw).replace(/[^A-Za-z0-9_.:-]+/g, '_').slice(0, 60) || 'GOOGLE_TTS_UNAVAILABLE';
    }
    async function speak(input) {
      input = input || {}; if (!ownerCurrent() || !enabled || !gestureGranted || !phone() || !visible() || !input.text || spoken.has(input.id)) return { ok: false, reason: 'VOICE_NOT_ENABLED' };
      var ready = input.audioB64 || (input.audio && input.audio.data);
      // Why Charon cannot be used for this reply; null means Charon is tried first.
      var skip = null;
      if (!ready) {
        if (input.audioStatus === 'quota_exhausted') skip = 'GOOGLE_TTS_QUOTA';
        else if (input.audioStatus && input.audioStatus !== 'audio_ready' && input.audioStatus !== 'client_tts_required') skip = 'SERVER_TTS_' + String(input.audioStatus).replace(/[^A-Za-z0-9_]+/g, '_').toUpperCase().slice(0, 40);
        else if (input.serverAudioOnly) skip = 'SERVER_TTS_UNAVAILABLE';
      }
      if (live || capture || state.mode === 'starting') cancel();
      stopPlayback(); var ticket = ++epoch, captured = owner; state.mode = 'tts-loading'; state.error = null; state.notice = skip ? 'Telefonun Türkçe sesi hazırlanıyor…' : 'Gemini Charon sesi hazırlanıyor…'; emit();
      var clock = function () { return win.performance && typeof win.performance.now === 'function' ? win.performance.now() : performance.now(); }, began = clock(), timer;
      async function phoneVoiceOrFail(code) {
        if (!current(ticket, captured)) return { ok: false, reason: 'CANCELLED' };
        var trVoice = turkishAndroidVoice(), androidError = null;
        if (trVoice) {
          var guard;
          try {
            var outcome = await Promise.race([speakAndroidTurkish(trVoice, input, ticket, captured, clock, began, code), new Promise(function (_resolve, reject) { guard = setTimeout(function () { reject(Error('ANDROID_TTS_TIMEOUT')); }, options.androidStartTimeoutMs || 8000); })]);
            if (outcome && outcome.ok === true) return outcome;
            if (!current(ticket, captured)) return { ok: false, reason: 'CANCELLED' };
            androidError = (outcome && outcome.reason) || 'ANDROID_TTS_FAILED';
          } catch (err) { androidError = failureCode(err); }
          finally { clearTimeout(guard); }
        }
        if (!current(ticket, captured)) return { ok: false, reason: 'CANCELLED' };
        epoch++; stopPlayback(); state.mode = 'idle';
        var why = charonFailureText(code);
        var text = trVoice
          ? 'Ses oynatılamadı: ' + why + ', telefonun Türkçe sesi de başlamadı (' + androidError + '). Yazılı yanıt gösterildi.'
          : 'Ses oynatılamadı: ' + why + '. Telefonda Türkçe metin okuma sesi bulunamadı (Ayarlar › Metin okuma çıkışı › Türkçe ses paketi). Yazılı yanıt gösterildi.';
        var reason = code === 'AUDIO_PREPARATION_TIMEOUT' ? 'AUDIO_PREPARATION_TIMEOUT' : /^AUDIO_CONTEXT_/.test(code) ? 'AUDIO_GESTURE_REQUIRED' : 'GOOGLE_TTS_UNAVAILABLE';
        var failed = fail(reason, text); failed.detail = code; if (androidError) failed.androidError = androidError; return failed;
      }
      if (!skip) {
        var awake = await ensureContext();
        if (!current(ticket, captured)) return { ok: false, reason: 'CANCELLED' };
        if (!awake) skip = 'AUDIO_CONTEXT_' + String(context ? context.state : 'missing').toUpperCase();
      }
      if (skip) return await phoneVoiceOrFail(skip);
      try {
        // The Charon attempt owns its own ticket by value: a timeout re-tickets the reply, so a late Charon can never play over the phone voice.
        var work = (async function (charonTicket) {
          if (!ready && !ttsIds.has(input.id)) { if (ttsIds.size >= 256) throw Error('TTS_CAPACITY'); ttsIds.set(input.id, input.requestId || win.crypto.randomUUID()); }
          var r = ready ? { ok: true, audio: { mimeType: input.audio && input.audio.mimeType || 'audio/wav', data: ready } } : await client.synthesize({ requestId: ttsIds.get(input.id), text: String(input.text).slice(0, 2400), voice: 'Charon', speech_metadata: { style: STYLE } });
          if (!current(charonTicket, captured)) return { ok: false, reason: 'CANCELLED' };
          if ((!r || r.ok !== true) && r && (r.status === 'quota_exhausted' || r.reason === 'QUOTA_EXHAUSTED')) throw Object.assign(Error('GOOGLE_TTS_QUOTA'), { code: 'GOOGLE_TTS_QUOTA' });
          if (!r || r.ok !== true) throw Object.assign(Error('TTS_UNAVAILABLE'), { code: 'SERVER_TTS_' + String(r && (r.status || r.error || r.reason) || 'unavailable').replace(/[^A-Za-z0-9_]+/g, '_').toUpperCase().slice(0, 40) });
          var mp3 = !!r.audio && r.audio.mimeType === 'audio/mpeg';
          if (!r.audio || (r.audio.mimeType !== 'audio/wav' && !mp3)) throw Error('INVALID_AUDIO');
          var wav = bytes(r.audio.data); if (mp3 ? !mp3Valid(wav) : !wavValid(wav)) throw Error(mp3 ? 'INVALID_MP3' : 'INVALID_WAV');
          var buffer = await context.decodeAudioData(wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength));
          if (!current(charonTicket, captured)) return { ok: false, reason: 'CANCELLED' };
          playbackPrepareMs = Math.round(clock() - began);
          reading = { id: input.id, phase: 'playing', ticket: charonTicket };
          if (!playBuffer(buffer, charonTicket, captured, false, input.onStart)) { if (reading && reading.ticket === charonTicket) reading = null; return { ok: false, reason: 'CANCELLED' }; }
          rememberClip(input.id, input.text, r.audio);
          spoken.add(input.id); return { ok: true, provider: 'google-ai-studio', voiceSource: mp3 ? 'google-cloud' : 'google-ai-studio', voiceName: 'Charon', voiceLang: 'tr-TR', localVoice: false, timings: { playback_prepare_ms: playbackPrepareMs } };
        })(ticket);
        return await Promise.race([work, new Promise(function (_resolve, reject) { timer = setTimeout(function () { reject(Error('AUDIO_PREPARATION_TIMEOUT')); }, options.preparationTimeoutMs || 12000); })]);
      } catch (error) {
        if (!current(ticket, captured)) return { ok: false, reason: 'CANCELLED' };
        // The late Charon attempt is invalidated before the phone voice starts, so two voices never overlap.
        epoch++; stopPlayback(); ticket = epoch;
        return await phoneVoiceOrFail(failureCode(error));
      } finally { clearTimeout(timer); }
    }
    /* v1.7 "Dinle": a tap under a reply reads that whole reply aloud, even when automatic voice replies are off.
       The reply's own Charon audio is replayed while this phone still has it; otherwise DJ-KABIN prepares Charon piece by
       piece (a short first piece so the voice starts quickly; the next piece is prepared while the current one plays).
       Whatever Charon cannot prepare is read by the phone's Turkish voice, so a tap is never silent while such a voice exists. */
    function rememberClip(id, text, audio) {
      if (!id || !audio || typeof audio.data !== 'string' || audio.data.length > 4 * 1024 * 1024) return;
      clips.delete(id); clips.set(id, { text: String(text || ''), audio: { mimeType: audio.mimeType === 'audio/mpeg' ? 'audio/mpeg' : 'audio/wav', data: audio.data } });
      while (clips.size > 12) clips.delete(clips.keys().next().value);
    }
    function speechKey(text) { return String(text || '').replace(/[*`#•_]/g, '').replace(/[\s.,;:!?…]+/g, ' ').trim().toLocaleLowerCase('tr-TR'); }
    // Lines are read as sentences: list marks are dropped and every line ends with a pause.
    function speechReady(text) {
      return String(text || '').replace(/\r\n?/g, '\n').split('\n').map(function (line) {
        line = line.replace(/^[\s•*\-–]+/, '').replace(/[*`#_]+/g, '').trim();
        return line && !/[.!?…:;,]$/.test(line) ? line + '.' : line;
      }).filter(Boolean).join('\n');
    }
    function speechPieces(text, firstLimit, limit) {
      var rest = String(text || '').trim(), out = [], max = firstLimit;
      while (rest) {
        if (rest.length <= max) { out.push(rest); break; }
        var head = rest.slice(0, max), cut = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '), head.lastIndexOf('\n'), head.lastIndexOf('… '));
        if (cut < max * 0.35) cut = Math.max(head.lastIndexOf(', '), head.lastIndexOf('; '));
        if (cut < max * 0.25) cut = head.lastIndexOf(' ');
        if (cut < 1) cut = max - 1;
        out.push(rest.slice(0, cut + 1).trim()); rest = rest.slice(cut + 1).trim(); max = limit;
      }
      return out.filter(Boolean);
    }
    function readingCurrent(ticket, captured) { return current(ticket, captured) && !!reading && reading.ticket === ticket; }
    function readingDone(ticket) {
      if (!reading || reading.ticket !== ticket) return;
      reading = null; state.mode = live ? 'listening' : 'idle'; state.audioLevel = null; state.notice = 'Okuma bitti.'; emit();
    }
    function scheduleReading(buffer, ticket, captured) {
      if (!readingCurrent(ticket, captured) || !context || context.state !== 'running') return false;
      var source = context.createBufferSource(); source.buffer = buffer; source.connect(context.destination); sources.add(source);
      var start = Math.max(context.currentTime, nextAt); nextAt = start + buffer.duration;
      source.onended = function () {
        sources.delete(source); try { source.disconnect(); } catch (_) {}
        // Waiting for the next piece: the button shows "preparing" again until it starts.
        if (!sources.size && readingCurrent(ticket, captured) && !reading.allScheduled && reading.phase === 'playing') { reading.phase = 'preparing'; state.mode = 'tts-loading'; state.notice = 'Argon devamını hazırlıyor…'; emit(); }
      };
      source.start(start); return true;
    }
    function drained(ticket, captured) {
      return new Promise(function (resolve) {
        (function check() { if (!readingCurrent(ticket, captured) || !sources.size) { resolve(); return; } setTimeout(check, 120); })();
      });
    }
    function withTimeout(promise, ms, code) {
      var timer;
      return Promise.race([promise, new Promise(function (_resolve, reject) { timer = setTimeout(function () { reject(Object.assign(Error(code), { code: code })); }, ms); })])
        .then(function (value) { clearTimeout(timer); return value; }, function (error) { clearTimeout(timer); throw error; });
    }
    function readWithPhone(text, ticket, captured, reasonCode) {
      var trVoice = turkishAndroidVoice();
      if (!trVoice) {
        reading = null; state.mode = live ? 'listening' : 'idle';
        return Promise.resolve(fail('READ_ALOUD_UNAVAILABLE', 'Okunamadı: ' + charonFailureText(reasonCode) + '. Telefonda Türkçe metin okuma sesi de yok (Ayarlar › Metin okuma çıkışı › Türkçe ses paketi).'));
      }
      var parts = speechPieces(text, 2400, 2400), k = 0, voiceLabel = String(trVoice.name || trVoice.voiceURI || 'Android Türkçe');
      return new Promise(function (resolve) {
        function next() {
          if (!readingCurrent(ticket, captured)) { resolve({ ok: false, reason: 'CANCELLED' }); return; }
          if (k >= parts.length) { readingDone(ticket); resolve({ ok: true, provider: 'android-tts', voiceName: voiceLabel }); return; }
          var u;
          try { u = new win.SpeechSynthesisUtterance(parts[k++]); u.lang = String(trVoice.lang || 'tr-TR'); u.voice = trVoice; u.rate = 0.98; u.pitch = 0.92; u.volume = 1; }
          catch (_) { readingDone(ticket); resolve({ ok: false, reason: 'ANDROID_TTS_FAILED' }); return; }
          activeUtterance = u;
          u.onstart = function () {
            if (!readingCurrent(ticket, captured) || activeUtterance !== u) return;
            reading.phase = 'playing'; state.mode = 'speaking'; state.error = null;
            state.voiceName = voiceLabel; state.voiceProvider = 'android-tts'; state.voiceLang = String(trVoice.lang || 'tr-TR'); state.localVoice = trVoice.localService !== false;
            state.notice = 'Telefonun Türkçe sesi okuyor · ' + charonFailureText(reasonCode) + '.'; emit();
          };
          u.onend = function () { if (activeUtterance !== u) return; activeUtterance = null; next(); };
          u.onerror = function () { if (activeUtterance !== u) return; activeUtterance = null; if (readingCurrent(ticket, captured)) readingDone(ticket); resolve({ ok: false, reason: 'ANDROID_TTS_FAILED' }); };
          try { win.speechSynthesis.speak(u); } catch (_) { u.onerror(); }
        }
        next();
      });
    }
    async function runReading(id, text, ticket, captured, unlocking) {
      var unlocked = await unlocking;
      if (!readingCurrent(ticket, captured)) return { ok: false, reason: 'CANCELLED' };
      var cached = clips.get(id), pieces = cached && speechKey(cached.text) === speechKey(text) ? [{ text: text, audio: cached.audio }]
        : speechPieces(text, 240, 1500).map(function (piece) { return { text: piece }; });
      var webAudio = !!(unlocked && unlocked.ok === true) && await ensureContext();
      if (!readingCurrent(ticket, captured)) return { ok: false, reason: 'CANCELLED' };
      if (!webAudio) return await readWithPhone(text, ticket, captured, 'AUDIO_CONTEXT_' + String(context ? context.state : 'missing').toUpperCase());
      var started = false;
      for (var i = 0; i < pieces.length; i++) {
        var buffer = null, failure = null;
        try {
          var audio = pieces[i].audio;
          if (!audio) {
            var r = await withTimeout(Promise.resolve(client.synthesize({ requestId: win.crypto.randomUUID(), text: pieces[i].text, voice: 'Charon', speech_metadata: { style: STYLE } })), started ? 90000 : (options.readPreparationTimeoutMs || 15000), 'AUDIO_PREPARATION_TIMEOUT');
            if (!readingCurrent(ticket, captured)) return { ok: false, reason: 'CANCELLED' };
            if (r && (r.status === 'quota_exhausted' || r.reason === 'QUOTA_EXHAUSTED')) throw Object.assign(Error('GOOGLE_TTS_QUOTA'), { code: 'GOOGLE_TTS_QUOTA' });
            if (!r || r.ok !== true || !r.audio) throw Object.assign(Error('TTS_UNAVAILABLE'), { code: 'SERVER_TTS_' + String(r && (r.status || r.error || r.reason) || 'unavailable').replace(/[^A-Za-z0-9_]+/g, '_').toUpperCase().slice(0, 40) });
            audio = r.audio;
            if (pieces.length === 1) rememberClip(id, text, audio);
          }
          var mp3 = audio.mimeType === 'audio/mpeg', raw = bytes(audio.data);
          if (mp3 ? !mp3Valid(raw) : !wavValid(raw)) throw Error(mp3 ? 'INVALID_MP3' : 'INVALID_WAV');
          buffer = await context.decodeAudioData(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
        } catch (error) { failure = failureCode(error); }
        if (!readingCurrent(ticket, captured)) return { ok: false, reason: 'CANCELLED' };
        if (!buffer) {
          // The phone's voice continues from this piece once what is already playing has finished.
          await drained(ticket, captured);
          if (!readingCurrent(ticket, captured)) return { ok: false, reason: 'CANCELLED' };
          return await readWithPhone(pieces.slice(i).map(function (p) { return p.text; }).join('\n'), ticket, captured, failure);
        }
        if (!scheduleReading(buffer, ticket, captured)) return { ok: false, reason: 'CANCELLED' };
        if (!started || reading.phase !== 'playing') {
          started = true; reading.phase = 'playing'; state.mode = 'speaking'; state.error = null;
          state.voiceName = 'Charon'; state.voiceProvider = 'google-ai-studio'; state.voiceLang = 'tr-TR'; state.localVoice = false;
          state.notice = 'Argon okuyor (Google TTS · Charon).'; emit();
        }
      }
      reading.allScheduled = true;
      await drained(ticket, captured);
      if (readingCurrent(ticket, captured)) readingDone(ticket);
      return { ok: true, provider: 'google-ai-studio', voiceName: 'Charon' };
    }
    function readAloud(input) {
      input = input || {};
      var id = typeof input.id === 'string' ? input.id.slice(0, 200) : '', text = speechReady(String(input.text || '').slice(0, 12000));
      if (!ownerCurrent() || !id || !text) return Promise.resolve({ ok: false, reason: 'NOTHING_TO_READ' });
      if (!phone()) return Promise.resolve(fail('PHONE_ONLY', 'Sesli dinleme yalnız telefonda çalışır; DJ-KABIN’de ses kapalı.'));
      // The tap itself unlocks web audio, exactly like the sound button, so this runs before anything waits.
      var unlocking = unlockAudio();
      if (live || capture || state.mode === 'starting') cancel();
      stopPlayback();
      var ticket = ++epoch, captured = owner;
      reading = { id: id, phase: 'preparing', ticket: ticket, allScheduled: false };
      state.mode = 'tts-loading'; state.error = null; state.notice = 'Argon okumaya hazırlanıyor…'; emit();
      return runReading(id, text, ticket, captured, unlocking).catch(function () {
        if (readingCurrent(ticket, captured)) readingDone(ticket);
        return { ok: false, reason: 'READ_ALOUD_FAILED' };
      });
    }
    function stopReading() { if (!reading) return; epoch++; stopPlayback(); state.mode = live ? 'listening' : 'idle'; state.notice = 'Okuma durduruldu.'; emit(); }
    async function startConversation(handlers) {
      handlers = handlers || {};
      if (!ownerCurrent() || !gesture()) return fail('PHONE_GESTURE_REQUIRED', 'Canlı ses yalnız telefonda mikrofon düğmesine dokunulduğunda açılır.');
      var pendingUnlock = unlockAudio(); cancel(); enabled = gestureGranted = true;
      var ticket = epoch, captured = owner, stream;
      state.mode = 'starting'; state.notice = 'Google canlı ses bağlantısı kuruluyor…'; state.error = null; emit();
      try {
        await pendingUnlock; if (!current(ticket, captured)) return { ok: false, reason: 'CANCELLED' };
        stream = await win.navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
        if (!current(ticket, captured)) { stream.getTracks().forEach(function (t) { t.stop(); }); return { ok: false, reason: 'CANCELLED' }; }
        capture = { stream: stream, source: null, processor: null, gain: null };
        var session = await client.startLive({ gesture: true, voice: 'Charon', onTranscript: function (value, meta) { if (current(ticket, captured) && handlers.onTranscript) handlers.onTranscript(value, meta); }, onReply: function (value, meta) { if (current(ticket, captured) && handlers.onReply) handlers.onReply(value, meta); }, onTask: function (r) { if (current(ticket, captured) && handlers.onTask) handlers.onTask(r); }, onInteraction: function (status) { if (!current(ticket, captured)) return; state.mode = status === 'IN_PROGRESS' ? 'thinking' : sources.size ? 'speaking' : 'listening'; state.notice = status === 'IN_PROGRESS' ? 'Argon arka planda düşünüyor; konuşmaya devam edebilirsin.' : 'Dinliyorum.'; emit(); if (handlers.onInteraction) handlers.onInteraction(status); }, onAudio: function (data, mime, meta) { if (!current(ticket, captured) || !enabled) return; try { var pcm = bytes(data), rate = Number((/rate=(\d+)/.exec(mime) || [])[1]) || 24000; if (pcm.byteLength % 2) return; var buffer = context.createBuffer(1, pcm.length / 2, rate), channel = buffer.getChannelData(0), view = new DataView(pcm.buffer); for (var i = 0; i < channel.length; i++) channel[i] = view.getInt16(i * 2, true) / 32768; playBuffer(buffer, ticket, captured, true, function () { if (handlers.onAudioStart) handlers.onAudioStart(meta); }); } catch (_) {} }, onInterrupted: function (meta) { if (current(ticket, captured)) { stopPlayback(); state.mode = 'listening'; state.notice = 'Araya girdin; önceki yanıt durduruldu, seni dinliyorum.'; emit(); if (handlers.onInterrupted) handlers.onInterrupted(meta); } }, onTurnComplete: function (meta) { if (current(ticket, captured) && handlers.onTurnComplete) handlers.onTurnComplete(meta); }, onEnd: function (r) { if (!current(ticket, captured)) return; live = null; stopCapture(); stopPlayback(); state.mode = 'idle'; state.notice = 'Canlı ses bağlantısı kapandı. Mikrofon düğmesinden yeniden açabilirsin.'; emit(); if (handlers.onEnd) handlers.onEnd(r); } });
        if (!current(ticket, captured)) { if (session && session.stop) session.stop(); return { ok: false, reason: 'CANCELLED' }; }
        if (!session || session.ok !== true) { var liveReason = (session && (session.reason || session.status)) || 'LIVE_UNAVAILABLE', liveErr = Error(liveReason); liveErr.code = liveReason; liveErr.detail = session && session.message; throw liveErr; } live = session;
        capture.source = context.createMediaStreamSource(stream); capture.processor = context.createScriptProcessor(4096, 1, 1); capture.gain = context.createGain(); capture.gain.gain.value = 0;
        capture.source.connect(capture.processor); capture.processor.connect(capture.gain); capture.gain.connect(context.destination);
        capture.processor.onaudioprocess = function (event) { if (!current(ticket, captured) || live !== session) return; var samples = event.inputBuffer.getChannelData(0); session.sendAudio(encode(resample16k(samples, context.sampleRate))); var sum = 0; for (var i = 0; i < samples.length; i++) sum += samples[i] * samples[i]; state.audioLevel = Math.min(1, Math.sqrt(sum / samples.length) * 3.5); emit(); };
        state.mode = 'listening'; state.notice = 'Canlı Argon açık. Konuşabilirsin; bitirmek için mikrofon düğmesine dokun.'; emit(); return { ok: true, stop: cancel };
      } catch (err) {
        if (current(ticket, captured)) {
          var hadCapture = !!capture;
          cancel();
          var code = (err && (err.code || err.name || err.message)) || 'GOOGLE_LIVE_UNAVAILABLE';
          var isMicErr = !hadCapture && /NotAllowed|Permission|NotFound|NotReadable|AudioCapture|DevicesNotFound/i.test(String(code) + ' ' + String(err && err.message || ''));
          var msg = isMicErr
            ? 'Canlı ses açılamadı (Mikrofon izni/erişimi: ' + code + '). Uygulama izinlerinden mikrofonu açıp yeniden dene.'
            : (err && err.detail ? 'Canlı ses açılamadı (' + code + '): ' + err.detail : 'Canlı ses açılamadı (' + code + '). Mikrofon iznini ve Google bağlantısını kontrol et; yazarak devam edebilirsin.');
          return fail(isMicErr ? 'MIC_PERMISSION_REQUIRED' : 'GOOGLE_LIVE_UNAVAILABLE', msg);
        }
        if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
        return { ok: false, reason: 'CANCELLED' };
      }
    }
    function bind(target, name, fn) { if (target && target.addEventListener) { target.addEventListener(name, fn); removers.push(function () { target.removeEventListener(name, fn); }); } }
    bind(doc, 'visibilitychange', function () { if (!visible()) cancel(); }); bind(doc, 'oryvona:lifecycle-pause', cancel); bind(doc, 'oryvona:studio-context-change', ownerCurrent); bind(win, 'pagehide', cancel);
    return Object.freeze({ getSnapshot: snapshot, subscribe: function (fn) { listeners.add(fn); fn(snapshot()); return function () { listeners.delete(fn); }; }, setEnabled: setEnabled, unlockAudio: unlockAudio, speak: speak, startConversation: startConversation, startListening: startConversation, conversationActive: function () { return !!live; }, stopConversation: cancel, stopListening: function () { if (live || capture || state.mode === 'starting') cancel(); }, stopSpeaking: function () { if (live || capture) cancel(); else epoch++; stopPlayback(); state.mode = 'idle'; emit(); }, readAloud: readAloud, stopReading: stopReading, cancel: cancel, destroy: function () { if (destroyed) return; cancel(); destroyed = true; enabled = false; removers.forEach(function (off) { off(); }); if (context && context.close) Promise.resolve(context.close()).catch(function () {}); context = null; listeners.clear(); } });
  }
  return Object.freeze({ create: create, pcmWav: pcmWav, wavValid: wavValid, resample16k: resample16k, STYLE: STYLE });
});
