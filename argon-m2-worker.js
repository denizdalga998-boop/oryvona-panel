/* Local-only M2 synthesis. No model download before explicit consent, no text API. */
'use strict';
importScripts(new URL('./vendor/supertonic-m2-helper.js?v=2680', self.location.href).href);
(function () {
  const REVISION = 'aafc6e32416a594460b32413efc49d7fe4ce6d46';
  const MODEL = 'supertone-oss-archive/supertonic-3';
  const RUNTIME_VERSION = '1.23.2';
  const MODEL_BASE = 'https://huggingface.co/' + MODEL + '/resolve/' + REVISION + '/';
  const CACHE_NAME = 'oryvona-m2-model-' + REVISION + '-ort-' + RUNTIME_VERSION;
  const MANIFEST_URL = new URL('./voice/argon-m2-model.json?v=2680', self.location.href).href;
  const MODEL_FILES = ['onnx/duration_predictor.onnx', 'onnx/text_encoder.onnx', 'onnx/vector_estimator.onnx', 'onnx/vocoder.onnx', 'onnx/tts.json', 'onnx/unicode_indexer.json', 'voice_styles/M2.json', 'LICENSE'];
  const RUNTIME_FILES = { script: 'ort.wasm.min.js', loader: 'ort-wasm-simd-threaded.mjs', wasm: 'ort-wasm-simd-threaded.wasm' };
  const MAX_ASSET_BYTES = 268435456;
  let engine = null;
  let preparation = null;
  let synthesis = null;
  let runtimeLoaded = false;
  const cancelled = new Set();
  const controllers = new Map();
  const metadata = { model: MODEL, revision: REVISION, voice: 'M2', lang: 'tr', sampleRate: 44100 };
  const errors = {
    CONSENT_REQUIRED: 'Erkek sesi ilk kez hazırlamak için indirme onayı gerekiyor.',
    SETUP_REQUIRED: 'Erkek ses modeli bu cihazda eksik. İndirmeyi başlatmak için açık onay gerekiyor.',
    MODEL_CACHE_CORRUPT: 'Kayıtlı ses modelinin doğrulaması başarısız. Bozuk parça temizlendi; yeniden indirme için onay gerekiyor.',
    MODEL_STORAGE_FULL: 'Ses modeli için cihazda yeterli alan yok. Yazılı sohbet kullanılabilir.',
    MODEL_CACHE_UNAVAILABLE: 'Bu cihaz ses modelini kalıcı saklayamıyor. Yazılı sohbet kullanılabilir.',
    INTEGRITY_MISMATCH: 'Ses dosyası güvenilir sürümle eşleşmedi; ses açılmadı.',
    MODEL_NOT_READY: 'Erkek ses modeli henüz hazır değil.',
    INVALID_MANIFEST: 'Erkek ses dosyalarının sürümü doğrulanamadı.',
    DOWNLOAD_FAILED: 'Erkek ses dosyaları indirilemedi. Bağlantıyı kontrol et.',
    CANCELLED: 'Ses işlemi iptal edildi.',
    BUSY: 'Başka bir ses işlemi sürüyor.',
    SYNTHESIS_FAILED: 'Erkek ses üretilemedi. Yanıt yazılı olarak korunuyor.'
  };
  function failure(code) { const e = new Error(errors[code] || code); e.code = code; return e; }
  function preparationDiagnostics(stage, cause) {
    const causeName = String(cause?.name || 'Error').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 64) || 'Error';
    const causeMessage = String(cause?.message || cause || 'Preparation failed')
      .replace(/\b(?:https?|blob|file|data):[^\s"'<>]+/gi, '[asset]')
      .replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 600);
    return { stage, causeName, causeMessage };
  }
  function assert(value, code) { if (!value) throw failure(code); }
  function post(type, id, values = {}, transfer = []) { self.postMessage({ type, id, ...metadata, ...values }, transfer); }
  function check(id) { if (cancelled.has(id)) throw failure('CANCELLED'); }
  function validId(id) { return (typeof id === 'string' && /^[a-zA-Z0-9_.:-]{1,160}$/.test(id)) || (Number.isSafeInteger(id) && id >= 0); }
  function validAsset(asset) { return asset && Number.isSafeInteger(asset.bytes) && asset.bytes > 0 && asset.bytes <= MAX_ASSET_BYTES && /^[0-9a-f]{64}$/.test(asset.sha256 || ''); }
  function validateManifest(value) {
    assert(value?.schemaVersion === 1 && value.model === MODEL && value.revision === REVISION && value.voice === 'M2' && value.language === 'tr' && value.sampleRate === 44100 && value.steps === 8 && value.speed === 1 && value.baseUrl === MODEL_BASE, 'INVALID_MANIFEST');
    assert(Array.isArray(value.assets) && value.assets.length === MODEL_FILES.length && value.assets.every(validAsset), 'INVALID_MANIFEST');
    assert(new Set(value.assets.map(a => a.file)).size === MODEL_FILES.length && MODEL_FILES.every(file => value.assets.some(a => a.file === file)), 'INVALID_MANIFEST');
    assert(value.assets.reduce((sum, asset) => sum + asset.bytes, 0) <= 400000000, 'INVALID_MANIFEST');
    assert(value.runtime?.version === RUNTIME_VERSION && Array.isArray(value.runtime.assets) && value.runtime.assets.length === 3, 'INVALID_MANIFEST');
    for (const [id, file] of Object.entries(RUNTIME_FILES)) {
      const asset = value.runtime.assets.find(a => a.id === id);
      assert(validAsset(asset) && asset.file === file && asset.url === 'https://cdn.jsdelivr.net/npm/onnxruntime-web@' + RUNTIME_VERSION + '/dist/' + file, 'INVALID_MANIFEST');
    }
    assert(value.runtime.assets.reduce((sum, asset) => sum + asset.bytes, 0) <= 33554432, 'INVALID_MANIFEST');
    return value;
  }
  async function manifest() {
    let response;
    try { response = await fetch(MANIFEST_URL, { credentials: 'same-origin', cache: 'no-cache' }); } catch { throw failure('INVALID_MANIFEST'); }
    assert(response.ok, 'INVALID_MANIFEST');
    try { return validateManifest(await response.json()); } catch { throw failure('INVALID_MANIFEST'); }
  }
  function allAssets(value) { return [...value.runtime.assets.map(a => ({ ...a, url: a.url })), ...value.assets.map(a => ({ ...a, url: value.baseUrl + a.file }))]; }
  async function openCache() {
    assert(typeof caches !== 'undefined' && typeof caches.open === 'function', 'MODEL_CACHE_UNAVAILABLE');
    try { return await caches.open(CACHE_NAME); } catch { throw failure('MODEL_CACHE_UNAVAILABLE'); }
  }
  async function hasAll(cache, assets) {
    for (const asset of assets) if (!await cache.match(asset.url)) return false;
    return true;
  }
  async function digest(bytes) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join(''); }
  async function boundedBytes(response, asset, id, progress) {
    const size = Number(response.headers?.get('content-length'));
    if (Number.isFinite(size) && size > asset.bytes) throw failure('DOWNLOAD_FAILED');
    const bytes = new Uint8Array(asset.bytes);
    let offset = 0;
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      try {
        while (true) {
          check(id);
          const part = await reader.read();
          if (part.done) break;
          assert(offset + part.value.byteLength <= bytes.length, 'DOWNLOAD_FAILED');
          bytes.set(part.value, offset); offset += part.value.byteLength;
          progress(offset);
        }
      } catch (error) { try { await reader.cancel(); } catch {} throw error; }
      finally { try { reader.releaseLock(); } catch {} }
    } else {
      const body = new Uint8Array(await response.arrayBuffer());
      assert(body.length === bytes.length, 'DOWNLOAD_FAILED');
      bytes.set(body); offset = body.length; progress(offset);
    }
    check(id);
    assert(offset === bytes.length, 'DOWNLOAD_FAILED');
    return bytes;
  }
  async function assetBytes(cache, asset, id, allowDownload, progress) {
    check(id);
    const cached = await cache.match(asset.url);
    if (cached) {
      let bytes;
      try { bytes = await boundedBytes(cached, asset, id, () => {}); }
      catch (error) { if (error.code === 'CANCELLED') throw error; await cache.delete(asset.url); throw failure('MODEL_CACHE_CORRUPT'); }
      if (await digest(bytes) !== asset.sha256) { await cache.delete(asset.url); throw failure('MODEL_CACHE_CORRUPT'); }
      check(id); progress(asset.bytes, 'cache'); return bytes;
    }
    assert(allowDownload, 'SETUP_REQUIRED');
    let response;
    try { response = await fetch(asset.url, { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal: controllers.get(id)?.signal }); }
    catch (error) { check(id); throw failure('DOWNLOAD_FAILED'); }
    assert(response.ok && response.type !== 'opaque' && (!response.url || response.url.startsWith('https:')), 'DOWNLOAD_FAILED');
    let bytes;
    try { bytes = await boundedBytes(response, asset, id, loaded => progress(loaded, 'download')); }
    catch (error) { check(id); if (typeof error?.code === 'string') throw error; throw failure('DOWNLOAD_FAILED'); }
    assert(await digest(bytes) === asset.sha256, 'INTEGRITY_MISMATCH');
    check(id);
    try { await cache.put(asset.url, new Response(bytes, { headers: { 'Content-Type': asset.file.endsWith('.json') ? 'application/json' : 'application/octet-stream' } })); }
    catch (error) { if (error?.name === 'QuotaExceededError') throw failure('MODEL_STORAGE_FULL'); throw failure('MODEL_CACHE_UNAVAILABLE'); }
    progress(asset.bytes, 'verified');
    return bytes;
  }
  function json(bytes) { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  async function prepare(message) {
    const id = message.id;
    assert(message.consent === true || message.cacheOnly === true, 'CONSENT_REQUIRED');
    assert(preparation === null && synthesis === null, 'BUSY');
    if (engine) { post('ready', id, { cached: true }); return; }
    preparation = id; cancelled.delete(id); controllers.set(id, new AbortController());
    const sessions = {};
    let stage = 'manifest';
    try {
      const value = await manifest(); check(id);
      stage = 'cache_open';
      const assets = allAssets(value), cache = await openCache();
      const allowDownload = message.consent === true && message.cacheOnly !== true;
      stage = 'cache_presence';
      if (!allowDownload) assert(await hasAll(cache, assets), 'SETUP_REQUIRED');
      const total = assets.reduce((n, a) => n + a.bytes, 0);
      let complete = 0;
      async function get(file) {
        stage = 'asset:' + file;
        const asset = assets.find(a => a.file === file);
        assert(asset, 'INVALID_MANIFEST');
        const bytes = await assetBytes(cache, asset, id, allowDownload, (loaded, stage) => post('progress', id, { stage, asset: file, loaded: complete + loaded, total }));
        complete += asset.bytes; return bytes;
      }
      const scriptBytes = await get(RUNTIME_FILES.script);
      const loaderBytes = await get(RUNTIME_FILES.loader);
      const wasmBytes = await get(RUNTIME_FILES.wasm);
      const config = json(await get('onnx/tts.json'));
      const indexer = json(await get('onnx/unicode_indexer.json'));
      const style = json(await get('voice_styles/M2.json'));
      await get('LICENSE');
      check(id);
      if (!runtimeLoaded) {
        stage = 'runtime_import';
        const scriptUrl = URL.createObjectURL(new Blob([scriptBytes], { type: 'application/javascript' }));
        try { importScripts(scriptUrl); } finally { URL.revokeObjectURL(scriptUrl); }
        assert(self.ort?.InferenceSession, 'MODEL_NOT_READY');
        runtimeLoaded = true;
      }
      const loaderUrl = URL.createObjectURL(new Blob([loaderBytes], { type: 'application/javascript' }));
      const wasmUrl = URL.createObjectURL(new Blob([wasmBytes], { type: 'application/wasm' }));
      try {
        stage = 'runtime_configuration';
        self.ort.env.wasm.numThreads = 1;
        self.ort.env.wasm.proxy = false;
        // A locateFile override prevents the generated loader from resolving a
        // relative WASM filename against its blob: import.meta.url. Both URLs
        // contain the exact bytes verified above; neither can fetch CDN code.
        self.ort.env.wasm.wasmBinary = undefined;
        self.ort.env.wasm.wasmPaths = { mjs: loaderUrl, wasm: wasmUrl };
        self.ort.env.wasm.initTimeout = 120000;
        self.ort.env.logLevel = 'error';
        for (const [key, file] of [['duration', 'duration_predictor'], ['text', 'text_encoder'], ['vector', 'vector_estimator'], ['vocoder', 'vocoder']]) {
          let bytes = await get('onnx/' + file + '.onnx');
          check(id);
          post('progress', id, { stage: 'loading', asset: file, loaded: complete, total });
          stage = 'session:' + key;
          sessions[key] = await self.ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all', executionMode: 'sequential', enableCpuMemArena: false });
          bytes = null; check(id);
        }
      } finally { URL.revokeObjectURL(loaderUrl); URL.revokeObjectURL(wasmUrl); }
      stage = 'engine_configuration';
      engine = OryvonaM2Engine.createEngine(self.ort, config, indexer, style, sessions);
      check(id); post('ready', id, { cached: !allowDownload });
    } catch (error) {
      for (const session of Object.values(sessions)) { try { await session.release(); } catch {} }
      engine = null;
      const wrapped = failure(typeof error?.code === 'string' ? error.code : 'SYNTHESIS_FAILED');
      wrapped.preparationDiagnostics = preparationDiagnostics(stage, error);
      throw wrapped;
    } finally { if (preparation === id) preparation = null; controllers.delete(id); cancelled.delete(id); }
  }
  async function synthesize(message) {
    const id = message.id;
    assert(engine, 'MODEL_NOT_READY');
    assert(preparation === null && synthesis === null, 'BUSY');
    assert(message.lang === 'tr', 'LANGUAGE_NOT_ALLOWED');
    const chunks = OryvonaM2Engine.splitText(message.text, 220);
    synthesis = id; cancelled.delete(id);
    try {
      let seconds = 0;
      for (let index = 0; index < chunks.length; index++) {
        check(id);
        const result = await engine.synthesize(chunks[index], { checkCancelled: () => check(id), onProgress: (step, steps) => post('progress', id, { stage: 'synthesizing', chunk: index, chunks: chunks.length, step, steps }) });
        check(id);
        seconds += result.pcm.length / result.sampleRate;
        assert(seconds <= 180, 'AUDIO_DURATION_LIMIT');
        post('chunk', id, { index, chunks: chunks.length, channels: 1, pcm: result.pcm, durationSeconds: result.pcm.length / result.sampleRate }, [result.pcm.buffer]);
      }
      check(id); post('done', id, { chunks: chunks.length, durationSeconds: seconds });
    } finally { if (synthesis === id) synthesis = null; cancelled.delete(id); }
  }
  async function handle(message) {
    if (!message || !validId(message.id)) return;
    const id = message.id;
    try {
      if (message.type === 'cancel') { cancelled.add(id); controllers.get(id)?.abort(); return; }
      if (message.type === 'probe') {
        const value = await manifest(), cache = await openCache();
        post('availability', id, { available: await hasAll(cache, allAssets(value)), ready: engine !== null });
      } else if (message.type === 'prepare') await prepare(message);
      else if (message.type === 'synthesize') await synthesize(message);
      else throw failure('UNKNOWN_MESSAGE');
    } catch (error) {
      const code = typeof error?.code === 'string' ? error.code : 'SYNTHESIS_FAILED';
      const values = { code, message: errors[code] || (code === 'INVALID_TEXT' || code === 'TEXT_SEGMENT_TOO_LONG' ? 'Metin seslendirme sınırını aşıyor.' : 'Erkek ses üretilemedi. Yanıt yazılı olarak korunuyor.') };
      if (message.type === 'prepare' && error.preparationDiagnostics) values.diagnostics = error.preparationDiagnostics;
      post('error', id, values);
    }
  }
  self.addEventListener('message', event => { void handle(event.data); });
})();
