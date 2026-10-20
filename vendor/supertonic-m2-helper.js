/* Adapted from Supertone Supertonic web/helper.js at
 * 1e9799e964ea4c0dad7cde993b65c3c813a7b373, MIT, Copyright (c) 2025 Supertone Inc.
 * ORYVONA adaptation: verified inputs, Turkish M2 only, bounded typed arrays,
 * one chunk at a time and no network access. See voice/SUPERTONIC-CODE-LICENSE.txt.
 */
(function (root) {
  'use strict';
  const SAMPLE_RATE = 44100;
  function problem(code) { const error = new Error(code); error.code = code; return error; }
  function assert(value, code) { if (!value) throw problem(code); }
  function splitText(text, limit = 220) {
    assert(typeof text === 'string' && text.trim() && text.length <= 4000, 'INVALID_TEXT');
    assert(Number.isInteger(limit) && limit >= 100 && limit <= 250, 'INVALID_CHUNK_LIMIT');
    const words = text.replace(/\s+/gu, ' ').trim().split(' ');
    const chunks = [];
    let current = '';
    for (const word of words) {
      assert(word.length <= limit, 'TEXT_SEGMENT_TOO_LONG');
      if (current && current.length + word.length + 1 > limit) { chunks.push(current); current = ''; }
      current += (current ? ' ' : '') + word;
    }
    if (current) chunks.push(current);
    assert(chunks.length > 0 && chunks.length <= 40, 'INVALID_TEXT');
    return chunks;
  }
  class UnicodeProcessor {
    constructor(indexer) { this.indexer = indexer; }
    preprocessText(text, lang) {
      assert(lang === 'tr', 'LANGUAGE_NOT_ALLOWED');
      text = text.normalize('NFKD');
      text = text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]+/gu, '');
      const replacements = { '–': '-', '‑': '-', '—': '-', '_': ' ', '“': '"', '”': '"', '‘': "'", '’': "'", '´': "'", '`': "'", '[': ' ', ']': ' ', '|': ' ', '/': ' ', '#': ' ', '→': ' ', '←': ' ' };
      for (const [from, to] of Object.entries(replacements)) text = text.replaceAll(from, to);
      text = text.replace(/[♥☆♡©\\]/g, '');
      for (const [from, to] of Object.entries({ '@': ' at ', 'e.g.,': 'for example, ', 'i.e.,': 'that is, ' })) text = text.replaceAll(from, to);
      text = text.replace(/ ([,.!?;:'])/g, '$1');
      while (text.includes('""')) text = text.replace('""', '"');
      while (text.includes("''")) text = text.replace("''", "'");
      text = text.replace(/\s+/g, ' ').trim();
      assert(text, 'EMPTY_SPEECH_TEXT');
      if (!/[.!?;:,'"')\]}…。」』】〉》›»]$/.test(text)) text += '.';
      return '<tr>' + text + '</tr>';
    }
    call(text, lang) {
      const normalized = this.preprocessText(text, lang);
      const points = Array.from(normalized, value => value.codePointAt(0));
      const ids = new BigInt64Array(points.length);
      const mask = new Float32Array(points.length).fill(1);
      for (let i = 0; i < points.length; i++) ids[i] = BigInt(points[i] < this.indexer.length ? this.indexer[points[i]] : -1);
      return { ids, mask };
    }
  }
  function styleTensor(ort, value) {
    assert(value && Array.isArray(value.dims) && value.dims.length === 3 && value.dims[0] === 1, 'INVALID_VOICE_STYLE');
    assert(value.dims.every(x => Number.isInteger(x) && x > 0 && x <= 2048), 'INVALID_VOICE_STYLE');
    const count = value.dims.reduce((a, b) => a * b, 1);
    assert(count <= 200000, 'INVALID_VOICE_STYLE');
    const data = value.data.flat(Infinity);
    assert(data.length === count && data.every(Number.isFinite), 'INVALID_VOICE_STYLE');
    return new ort.Tensor('float32', Float32Array.from(data), value.dims);
  }
  function validatePcm(samples, duration) {
    assert(Number.isFinite(duration) && duration > 0 && duration <= 30, 'AUDIO_DURATION_LIMIT');
    const count = Math.floor(duration * SAMPLE_RATE);
    assert(count > 0 && samples && samples.length >= count && samples.length <= SAMPLE_RATE * 32, 'INVALID_PCM');
    const pcm = new Float32Array(count);
    let peak = 0;
    for (let i = 0; i < count; i++) {
      const value = samples[i];
      assert(Number.isFinite(value) && Math.abs(value) <= 100, 'INVALID_PCM');
      peak = Math.max(peak, Math.abs(value));
      pcm[i] = Math.max(-1, Math.min(1, value));
    }
    assert(peak >= 0.000001, 'SILENT_PCM');
    return pcm;
  }
  function gaussianNoise(size) {
    const values = new Float32Array(size);
    for (let i = 0; i < size; i++) values[i] = Math.sqrt(-2 * Math.log(Math.max(0.0001, Math.random()))) * Math.cos(2 * Math.PI * Math.random());
    return values;
  }
  function createEngine(ort, config, indexer, voiceStyle, sessions) {
    assert(config?.ae?.sample_rate === SAMPLE_RATE && config?.ttl, 'INVALID_MODEL_CONFIG');
    assert(Array.isArray(indexer) && indexer.length > 0 && indexer.length <= 0x110000 && indexer.every(x => Number.isInteger(x) && x >= -1 && x <= 2147483647), 'INVALID_INDEXER');
    const baseChunk = config.ae.base_chunk_size, compress = config.ttl.chunk_compress_factor, dimensions = config.ttl.latent_dim;
    assert([baseChunk, compress, dimensions].every(x => Number.isInteger(x) && x > 0 && x <= 8192), 'INVALID_MODEL_CONFIG');
    assert(compress * dimensions <= 2048, 'INVALID_MODEL_CONFIG');
    assert(['duration', 'text', 'vector', 'vocoder'].every(key => sessions[key]?.run), 'MODEL_NOT_READY');
    const processor = new UnicodeProcessor(indexer);
    const style = { ttl: styleTensor(ort, voiceStyle.style_ttl), dp: styleTensor(ort, voiceStyle.style_dp) };
    async function synthesize(text, { checkCancelled = () => {}, onProgress = () => {} } = {}) {
      assert(typeof text === 'string' && text.length > 0 && text.length <= 250, 'INVALID_TEXT');
      const cleanup = new Set();
      const hold = value => { if (value?.dispose) cleanup.add(value); return value; };
      const release = value => { cleanup.delete(value); try { value?.dispose?.(); } catch {} };
      const output = values => { for (const value of Object.values(values)) hold(value); return values; };
      try {
        checkCancelled();
        const encoded = processor.call(text, 'tr');
        const ids = hold(new ort.Tensor('int64', encoded.ids, [1, encoded.ids.length]));
        const mask = hold(new ort.Tensor('float32', encoded.mask, [1, 1, encoded.mask.length]));
        const dp = output(await sessions.duration.run({ text_ids: ids, style_dp: style.dp, text_mask: mask }));
        checkCancelled();
        const duration = Number(dp.duration?.data?.[0]);
        assert(Number.isFinite(duration) && duration > 0 && duration <= 30, 'AUDIO_DURATION_LIMIT');
        release(dp.duration);
        const encodedText = output(await sessions.text.run({ text_ids: ids, style_ttl: style.ttl, text_mask: mask }));
        checkCancelled();
        const chunkSize = baseChunk * compress;
        const latentLength = Math.ceil(Math.floor(duration * SAMPLE_RATE) / chunkSize);
        const latentDimensions = dimensions * compress;
        assert(latentLength > 0 && latentLength <= 16384 && latentLength * latentDimensions <= 10000000, 'LATENT_MEMORY_LIMIT');
        const shape = [1, latentDimensions, latentLength];
        let latent = hold(new ort.Tensor('float32', gaussianNoise(latentLength * latentDimensions), shape));
        const latentMask = hold(new ort.Tensor('float32', new Float32Array(latentLength).fill(1), [1, 1, latentLength]));
        const totalStep = hold(new ort.Tensor('float32', Float32Array.of(8), [1]));
        for (let step = 0; step < 8; step++) {
          checkCancelled();
          const currentStep = hold(new ort.Tensor('float32', Float32Array.of(step), [1]));
          const estimated = output(await sessions.vector.run({ noisy_latent: latent, text_emb: encodedText.text_emb, style_ttl: style.ttl, latent_mask: latentMask, text_mask: mask, current_step: currentStep, total_step: totalStep }));
          checkCancelled();
          const next = estimated.denoised_latent;
          assert(next?.data?.length === latentLength * latentDimensions, 'INVALID_LATENT');
          const nextData = Float32Array.from(next.data);
          assert(nextData.every(Number.isFinite), 'INVALID_LATENT');
          release(latent); release(currentStep); release(next);
          latent = hold(new ort.Tensor('float32', nextData, shape));
          onProgress(step + 1, 8);
        }
        const decoded = output(await sessions.vocoder.run({ latent }));
        checkCancelled();
        return { pcm: validatePcm(decoded.wav_tts?.data, duration), durationSeconds: duration, sampleRate: SAMPLE_RATE };
      } finally { for (const value of cleanup) { try { value.dispose(); } catch {} } }
    }
    return { sampleRate: SAMPLE_RATE, synthesize };
  }
  const api = { createEngine, UnicodeProcessor, splitText, validatePcm };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.OryvonaM2Engine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
