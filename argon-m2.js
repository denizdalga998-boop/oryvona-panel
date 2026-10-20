/* Argon Supertonic-3 M2 controller. Model downloads require explicit consent. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OryvonaM2Voice = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  var MODEL = 'supertone-oss-archive/supertonic-3';
  var REVISION = 'aafc6e32416a594460b32413efc49d7fe4ce6d46';
  var PROFILE = 'supertonic-3-M2';
  function error(code, message) { var e = new Error(message || code); e.code = code; if (code === 'ABORTED') e.name = 'AbortError'; return e; }
  function create(options) {
    options = options || {};
    var win = options.window || root;
    var WorkerClass = options.Worker || win.Worker;
    var worker = null, epoch = 0, sequence = 0, setupSequence = 0, destroyed = false;
    var prepared = false, cached = false, preparePromise = null, synthesisActive = false;
    var pending = new Map();
    var state = { status: 'setup_required', phase: null, progress: 0, error: null, voice: 'M2', profile: PROFILE, model: MODEL, revision: REVISION, warm: false };
    var timerSet = options.setTimeout || win.setTimeout.bind(win);
    var timerClear = options.clearTimeout || win.clearTimeout.bind(win);
    function snapshot() { return Object.assign({}, state, { warm: prepared }); }
    function update(change) {
      Object.assign(state, change);
      try { if (typeof options.onState === 'function') options.onState(snapshot()); } catch (_) {}
    }
    function finish(job, failure, value) {
      if (!pending.has(job.id)) return;
      pending.delete(job.id);
      timerClear(job.timer);
      if (job.signal && job.abort) job.signal.removeEventListener('abort', job.abort);
      if (failure) job.reject(failure); else job.resolve(value);
    }
    function failAll(failure) {
      pending.forEach(function (job) { finish(job, failure); });
    }
    function validIdentity(message) {
      return message.voice === 'M2' && message.sampleRate === 44100 && message.model === MODEL && message.revision === REVISION;
    }
    function resetWorker(failure) {
      epoch++;
      if (worker) { try { worker.terminate(); } catch (_) {} }
      worker = null; prepared = false; synthesisActive = false;
      preparePromise = null;
      failAll(failure || error('ABORTED', 'Ses işlemi iptal edildi.'));
    }
    function failWorker(failure) {
      resetWorker(failure);
      if (failure.code === 'SETUP_REQUIRED' || failure.code === 'CACHE_MISS') {
        cached = false;
        update({ status: 'setup_required', phase: null, progress: 0, error: 'Erkek sesini hazırlamak için ses düğmesine dokun.' });
      } else update({ status: 'error', phase: null, error: failure.message });
    }
    function ensureWorker() {
      if (destroyed) throw error('DESTROYED', 'Ses motoru kapatıldı.');
      if (worker) return worker;
      if (typeof WorkerClass !== 'function') throw error('WORKER_UNAVAILABLE', 'Bu cihaz erkek ses motorunu çalıştıramıyor.');
      var base = win.document && win.document.baseURI || win.location && win.location.href;
      var url = new win.URL('./argon-m2-worker.js?v=2680', base);
      if (win.location && url.origin !== win.location.origin) throw error('WORKER_ORIGIN', 'Ses motorunun adresi doğrulanamadı.');
      var currentEpoch = epoch;
      worker = new WorkerClass(url.href);
      worker.onmessage = function (event) {
        if (currentEpoch !== epoch || destroyed) return;
        var message = event && event.data;
        var job = message && pending.get(message.id);
        if (!job || job.epoch !== epoch) return;
        if (message.type === 'progress') {
          var loaded = Number(message.loaded), total = Number(message.total);
          var progress = total > 0 && Number.isFinite(loaded) ? Math.max(0, Math.min(1, loaded / total)) : state.progress;
          update({ status: 'loading', phase: job.type === 'prepare' ? 'download' : 'synthesis', progress: progress, downloadedBytes: loaded, totalBytes: total, error: null });
          return;
        }
        if (message.type === 'availability' && job.type === 'probe') {
          if (job.setupSequence !== setupSequence) { finish(job, null, { available: cached }); return; }
          cached = message.available === true;
          if (!preparePromise && !synthesisActive) update({ status: cached ? 'ready' : 'setup_required', phase: null, error: null });
          finish(job, null, { available: cached });
          return;
        }
        if (message.type === 'ready' && job.type === 'prepare') {
          if (!validIdentity(message)) { failWorker(error('VOICE_IDENTITY', 'Beklenen M2 ses profili doğrulanamadı.')); return; }
          prepared = true; cached = true;
          update({ status: 'ready', phase: null, progress: 1, error: null });
          finish(job, null, snapshot());
          return;
        }
        if (message.type === 'chunk' && job.type === 'synthesize') {
          var pcm = message.pcm;
          if (!validIdentity(message) || message.index !== job.chunks || !ArrayBuffer.isView(pcm) || Object.prototype.toString.call(pcm) !== '[object Float32Array]' || pcm.length < 1 || pcm.length > 44100 * 30) {
            failWorker(error('INVALID_PCM', 'Erkek ses verisi doğrulanamadı.')); return;
          }
          for (var i = 0; i < pcm.length; i++) if (!Number.isFinite(pcm[i]) || Math.abs(pcm[i]) > 8) { failWorker(error('INVALID_PCM', 'Ses verisi geçersiz.')); return; }
          job.duration += pcm.length / 44100;
          if (job.duration > 180) { failWorker(error('AUDIO_TOO_LONG', 'Yanıt ses sınırını aştı. Yazılı yanıt korunuyor.')); return; }
          job.chunks++;
          var chunk = { samples: pcm, sampleRate: 44100, profile: PROFILE, voice: 'M2', model: MODEL, revision: REVISION, index: message.index };
          job.queue = job.queue.then(function () {
            if (job.epoch !== epoch || !pending.has(job.id)) throw error('ABORTED', 'Ses işlemi iptal edildi.');
            return typeof job.onChunk === 'function' ? job.onChunk(chunk) : undefined;
          });
          job.queue.catch(function (failure) { if (pending.has(job.id)) failWorker(failure); });
          return;
        }
        if (message.type === 'done' && job.type === 'synthesize') {
          if (!validIdentity(message) || job.chunks < 1 || Number(message.chunks) !== job.chunks) { failWorker(error('INCOMPLETE_AUDIO', 'Yanıt sesi tamamlanamadı. Yazılı yanıt korunuyor.')); return; }
          job.queue.then(function () {
            if (job.epoch !== epoch || !pending.has(job.id)) return;
            synthesisActive = false;
            update({ status: 'ready', phase: null, progress: 1, error: null });
            finish(job, null, { voice: 'M2', profile: PROFILE, chunks: job.chunks, durationSeconds: job.duration });
          }).catch(function (failure) { if (pending.has(job.id)) failWorker(failure); });
          return;
        }
        if (message.type === 'error') {
          var code = typeof message.code === 'string' ? message.code : 'M2_ERROR';
          var text = typeof message.message === 'string' ? message.message.slice(0, 240) : 'Erkek ses hazırlanamadı.';
          if (job.type === 'probe') { if (job.setupSequence === setupSequence) cached = false; finish(job, null, { available: cached }); return; }
          failWorker(error(code, text));
        }
      };
      worker.onerror = function () { if (currentEpoch === epoch) failWorker(error('WORKER_ERROR', 'Erkek ses motoru başlatılamadı. Yazılı yanıt korunuyor.')); };
      return worker;
    }
    function request(type, fields, requestOptions) {
      requestOptions = requestOptions || {};
      var signal = requestOptions.signal;
      if (signal && signal.aborted) return Promise.reject(error('ABORTED', 'Ses işlemi iptal edildi.'));
      return new Promise(function (resolve, reject) {
        var job = { id: ++sequence, type: type, epoch: epoch, setupSequence: setupSequence, resolve: resolve, reject: reject, signal: signal, onChunk: requestOptions.onChunk, queue: Promise.resolve(), chunks: 0, duration: 0 };
        try {
          var current = ensureWorker();
          pending.set(job.id, job);
          job.timer = timerSet(function () { if (pending.has(job.id)) failWorker(error('M2_TIMEOUT', 'Erkek ses işlemi zaman aşımına uğradı. Yazılı yanıt korunuyor.')); }, type === 'prepare' ? 600000 : type === 'probe' ? 20000 : 240000);
          if (signal) { job.abort = function () { stop(); }; signal.addEventListener('abort', job.abort, { once: true }); }
          current.postMessage(Object.assign({ type: type, id: job.id }, fields));
        } catch (failure) { failWorker(failure); reject(failure); }
      });
    }
    function prepare(prepareOptions) {
      prepareOptions = prepareOptions || {};
      if (destroyed) return Promise.reject(error('DESTROYED'));
      if (prepared) return Promise.resolve(snapshot());
      if (preparePromise) return preparePromise;
      if (prepareOptions.consent !== true && !cached) return Promise.reject(error('SETUP_REQUIRED', 'Erkek sesini hazırlamak için ses düğmesine dokun.'));
      setupSequence++;
      update({ status: 'loading', phase: prepareOptions.consent === true ? 'download' : 'restore', progress: 0, error: null });
      var promise = request('prepare', { consent: prepareOptions.consent === true, cacheOnly: prepareOptions.consent !== true }, prepareOptions);
      preparePromise = promise;
      promise.then(function () { if (preparePromise === promise) preparePromise = null; }, function () { if (preparePromise === promise) preparePromise = null; });
      return promise;
    }
    async function synthesize(text, synthesisOptions) {
      synthesisOptions = synthesisOptions || {};
      if (typeof text !== 'string' || !text.trim() || text.length > 4000) throw error('INVALID_TEXT', 'Seslendirilecek yanıt uzunluğu geçersiz.');
      if (synthesisActive) throw error('M2_BUSY', 'Önce mevcut ses işlemini durdur.');
      if (synthesisOptions.signal && synthesisOptions.signal.aborted) throw error('ABORTED');
      var synthesisEpoch = epoch;
      synthesisActive = true;
      try {
        await prepare({ consent: false, signal: synthesisOptions.signal });
        if (synthesisEpoch !== epoch || synthesisOptions.signal && synthesisOptions.signal.aborted) throw error('ABORTED');
        update({ status: 'loading', phase: 'synthesis', progress: 0, error: null });
        return await request('synthesize', { text: text, lang: 'tr' }, synthesisOptions);
      } catch (failure) {
        if (synthesisEpoch === epoch) synthesisActive = false;
        throw failure;
      }
    }
    function stop() {
      resetWorker(error('ABORTED', 'Ses işlemi iptal edildi.'));
      if (!destroyed) update({ status: cached ? 'ready' : 'setup_required', phase: null, progress: cached ? 1 : 0, error: null });
    }
    function probe() {
      if (destroyed || preparePromise || synthesisActive) return Promise.resolve({ available: cached });
      return request('probe', {}).catch(function () { return { available: false }; });
    }
    Promise.resolve().then(probe).catch(function () {});
    return Object.freeze({ snapshot: snapshot, prepare: prepare, synthesize: synthesize, stop: stop, probe: probe,
      destroy: function () { destroyed = true; resetWorker(error('ABORTED')); } });
  }
  return Object.freeze({ create: create, MODEL: MODEL, REVISION: REVISION, PROFILE: PROFILE });
});
