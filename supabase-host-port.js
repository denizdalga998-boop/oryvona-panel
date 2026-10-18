/* Install INSIDE the existing authenticated app closure; never put sb/tokens on window. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OryvonaStudioHostPort = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const BUCKET = 'studio-v23-evidence';
  function failure(code, message) { return Object.assign(new Error(message), { code }); }
  async function sha256(blob) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), x => x.toString(16).padStart(2, '0')).join(''); }
  function create(options) {
    const client = options.client, getContext = options.getContext;
    if (!client || typeof getContext !== 'function') throw new TypeError('Private Supabase client and getContext required');
    async function guard(payload) {
      const context = getContext();
      if (!context.authenticated || !context.isOwner || context.demo || !context.userId || context.userId !== payload.expectedUserId) throw failure('AUTH_CHANGED', 'Sahip oturumu değişti.');
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      const after = getContext();
      if (!data.session || data.session.user.id !== payload.expectedUserId || !after.authenticated || !after.isOwner || after.demo || after.userId !== payload.expectedUserId) throw failure('AUTH_CHANGED', 'Oturum yeniden doğrulanmalı.');
      return after;
    }
    async function request(operation, payload) {
      const context = await guard(payload);
      if (operation === 'submitIntent') return client.rpc('studio_v23_submit_intent', { request_id: payload.requestId, text: payload.text, requested_project: payload.requestedProject, attachments: payload.attachments || [], expected_owner: payload.expectedUserId });
      if (operation === 'listIntents') return client.from('studio_v23_intents').select('request_id,requested_project,text,attachments,status,cancel_requested,worker_id,session_id,receipt,created_at,updated_at').eq('owner_id', context.userId).order('created_at', { ascending: false }).limit(Math.min(50, Math.max(1, payload.limit || 50)));
      if (operation === 'cancelIntent') return client.rpc('studio_v23_cancel_intent', { request_id: payload.requestId, expected_owner: payload.expectedUserId });
      if (operation === 'uploadEvidence') {
        if (!(payload.blob instanceof Blob) || payload.mime !== 'image/jpeg' || payload.blob.type !== 'image/jpeg' || payload.blob.size < 1 || payload.blob.size > 2097152 || !/^[a-f0-9]{64}$/.test(payload.sha256 || '') || payload.path !== context.userId + '/' + payload.sha256 + '.jpg') throw failure('PAYLOAD_MISMATCH', 'Görsel yükleme kapsamı geçersiz.');
        if (await sha256(payload.blob) !== payload.sha256) throw failure('PAYLOAD_MISMATCH', 'Görsel özeti uyuşmuyor.');
        await guard(payload);
        const { error } = await client.storage.from(BUCKET).upload(payload.path, payload.blob, { upsert: false, contentType: 'image/jpeg', cacheControl: '3600' });
        if (error) {
          const status = Number(error.statusCode || error.status);
          if (status !== 409 && !/already exists|duplicate/i.test(error.message || '')) throw error;
          await guard(payload);
          const { data: existing, error: readError } = await client.storage.from(BUCKET).download(payload.path);
          if (readError) throw readError;
          if (!existing || existing.size !== payload.blob.size || await sha256(existing) !== payload.sha256) throw failure('PAYLOAD_MISMATCH', 'Önceki görsel farklı; üzerine yazılmadı.');
        }
        await guard(payload);
        return { bucket: BUCKET, path: payload.path };
      }
      throw failure('UNAVAILABLE', 'Bu işlem izinli değil.');
    }
    return Object.freeze({ context: getContext, request });
  }
  return Object.freeze({ create });
});
