/* Oryvona v21: durable, user-bound command delivery. No models, polling or remote work while idle. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.OryvonaCommandOutbox = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const VERSION = 1;
  const MAX_COMMAND_BYTES = 8 * 1024 * 1024;
  const MAX_QUEUE_BYTES = 40 * 1024 * 1024;
  const MAX_PENDING = 100;
  const ACTIONS = new Set(["claude_do", "gemini_review", "approve", "stop"]);
  const GAMES = new Set(["koza", "charm-drop", "forge-run", "aeryo", "tupsper"]);
  const encoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
  const bytes = value => encoder ? encoder.encode(value).byteLength : unescape(encodeURIComponent(value)).length;
  const copy = value => JSON.parse(JSON.stringify(value));
  const pending = item => !["delivered", "cancelled"].includes(item.state);
  const identity = value => {
    const c = value || {};
    return { userId: String(c.userId || ""), email: String(c.email || "").trim().toLowerCase(),
      allowed: !!c.authenticated && !!c.isOwner && !c.demo && !!c.userId && !!c.email };
  };
  const sameOwner = (record, owner) => owner.allowed && record.ownerId === owner.userId && record.ownerEmail === owner.email;
  function classifyError(error) {
    const e = error || {}, status = Number(e.status || e.statusCode || 0), code = String(e.code || "");
    const message = String(e.message || e || "Delivery failed");
    if ([401, 403].includes(status) || ["42501", "PGRST301", "PGRST302", "PGRST303"].includes(code)) return "auth";
    if (status === 408 || status === 429 || status >= 500 || ["AbortError", "TimeoutError"].includes(e.name)) return "retry";
    if (status >= 400 && status < 500 || /^23\d{3}$/.test(code) || /^PGRST/.test(code)) return "permanent";
    if (/failed to fetch|fetch failed|networkerror|network request failed|load failed|internet|offline|timed?\s*out|connection|ECONNRESET|ENOTFOUND/i.test(message)) return "retry";
    return "permanent";
  }
  function createIndexedDbStore(indexedDB, name) {
    let opened;
    function open() {
      if (!indexedDB) return Promise.reject(new Error("Bu tarayıcı kalıcı IndexedDB depolamasını desteklemiyor. Emir gönderilmedi."));
      if (!opened) opened = new Promise((resolve, reject) => {
        const request = indexedDB.open(name || "oryvona-command-outbox", VERSION);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains("commands")) request.result.createObjectStore("commands", { keyPath: "id" });
        };
        request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); opened = null; }; resolve(request.result); };
        request.onerror = () => { opened = null; reject(request.error || new Error("Kalıcı kuyruk açılamadı.")); };
        request.onblocked = () => { opened = null; reject(new Error("Kalıcı kuyruk başka sekmede kilitli; emri koruyup yeniden dene.")); };
      });
      return opened;
    }
    async function transaction(mode, operation) {
      const db = await open();
      return new Promise((resolve, reject) => {
        let tx;
        try { tx = db.transaction("commands", mode, mode === "readwrite" ? { durability: "strict" } : undefined); }
        catch { tx = db.transaction("commands", mode); }
        let result;
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error || new Error("Kalıcı kuyruk yazılamadı."));
        tx.onabort = () => reject(tx.error || new Error("Kalıcı kuyruk işlemi tamamlanamadı."));
        try { operation(tx.objectStore("commands"), value => { result = value; }, tx); }
        catch (error) { try { tx.abort(); } catch {} reject(error); }
      });
    }
    return {
      list: () => transaction("readonly", (store, done) => { const r = store.getAll(); r.onsuccess = () => done(r.result || []); }),
      // Capacity checks and add share a transaction, including when two tabs enqueue simultaneously.
      add: (record, limits) => transaction("readwrite", (store, done, tx) => {
        const r = store.getAll();
        r.onsuccess = () => {
          const active = (r.result || []).filter(pending);
          if (active.length >= limits.count || active.reduce((n, item) => n + (item.byteSize || 0), 0) + record.byteSize > limits.bytes) {
            done(false); return;
          }
          const put = store.add(record); put.onsuccess = () => done(true);
        };
      }),
      update: (id, change) => transaction("readwrite", (store, done) => {
        const r = store.get(id);
        r.onsuccess = () => {
          if (!r.result) { done(null); return; }
          const next = change(r.result);
          if (next === null) { store.delete(id); done(null); }
          else { store.put(next); done(next); }
        };
      }),
      removeDelivered: (before, maxCount = 50) => transaction("readwrite", (store, done) => {
        const r = store.getAll(); r.onsuccess = () => {
          const receipts = (r.result || []).filter(item => ["delivered", "cancelled"].includes(item.state)).sort((a, b) => b.updatedAt - a.updatedAt);
          receipts.forEach((item, index) => { if (index >= maxCount || item.updatedAt < before) store.delete(item.id); }); done();
        };
      })
    };
  }
  function create(options) {
    const o = options || {}, runtime = o.runtime || (typeof window !== "undefined" ? window : globalThis);
    const store = o.store || createIndexedDbStore(runtime.indexedDB, o.databaseName);
    const now = o.now || Date.now, random = o.random || Math.random;
    const setTimer = o.setTimeout || setTimeout, clearTimer = o.clearTimeout || clearTimeout;
    const uuid = o.uuid || (() => runtime.crypto.randomUUID());
    const online = o.isOnline || (() => !runtime.navigator || runtime.navigator.onLine !== false);
    const subscribers = new Set();
    let running = null, timer = null, stopped = false, lastSnapshot = [], persistenceError = null;
    let storageBlocked = false, circuitUntil = 0;
    const owner = () => identity(o.getContext ? o.getContext() : null);
    const emit = () => {
      const c = owner();
      const state = { items: lastSnapshot.filter(item => sameOwner(item, { ...c, allowed: true })).map(item => ({
        id: item.id, game: item.row.result.target_game || "koza", text: item.row.text, operation: item.row.result.operation || null,
        state: !sameOwner(item, c) && pending(item) ? "paused" : item.state,
        attempts: item.attempts, created_at: item.row.created_at, next_attempt_at: item.nextAttemptAt || null,
        error: item.lastError || "", byteSize: item.byteSize
      })), error: persistenceError };
      for (const listener of subscribers) { try { listener(copy(state)); } catch {} }
      if (runtime.document && typeof runtime.CustomEvent === "function") runtime.document.dispatchEvent(new runtime.CustomEvent("oryvona:outbox-change", { detail: state }));
      return state;
    };
    async function refresh() { try { lastSnapshot = await store.list(); if (!storageBlocked) persistenceError = null; } catch (error) { persistenceError = String(error.message || error); } return emit(); }
    function schedule(records) {
      if (timer) clearTimer(timer); timer = null;
      if (stopped || storageBlocked || !online()) return;
      const c = owner();
      const eligible = records.filter(item => sameOwner(item, c) && ["queued", "retry", "sending"].includes(item.state));
      if (!eligible.length) return;
      const wait = Math.max(0, Math.max(circuitUntil, Math.min(...eligible.map(item => Number(item.nextAttemptAt || 0)))) - now());
      timer = setTimer(() => { timer = null; flush(); }, wait);
    }
    async function request(row) {
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      let deadline;
      const timeout = new Promise((_, reject) => { deadline = setTimer(() => { if (controller) controller.abort(); const e = new Error("Sunucu yanıtı zaman aşımına uğradı."); e.name = "TimeoutError"; reject(e); }, o.timeoutMs || 20000); });
      try {
        return await Promise.race([Promise.resolve().then(() => o.transport(copy(row), { signal: controller && controller.signal })), timeout]);
      } finally { clearTimer(deadline); }
    }
    async function run() {
      if (timer) clearTimer(timer); timer = null;
      if (stopped || storageBlocked) return refresh();
      let records;
      try { records = await store.list(); } catch (error) { persistenceError = String(error.message || error); return emit(); }
      lastSnapshot = records; emit();
      if (!online() || !owner().allowed) return emit();
      if (now() < circuitUntil) { schedule(records); return emit(); }
      for (const record of records.sort((a, b) => a.row.created_at.localeCompare(b.row.created_at))) {
        if (stopped || !online() || !sameOwner(record, owner())) continue;
        if (!["queued", "retry", "sending"].includes(record.state) || Number(record.nextAttemptAt || 0) > now()) continue;
        // Never retry a different owner's work, and never acknowledge using a fresh command id.
        let attempted;
        try {
          attempted = await store.update(record.id, current => pending(current) && current.state !== "failed" && current.state !== "auth" ? {
            ...current, state: "sending", attempts: current.attempts + 1, updatedAt: now(), lastError: ""
          } : current);
          if (!attempted || attempted.state !== "sending" || !sameOwner(attempted, owner())) continue;
        } catch (error) { persistenceError = String(error.message || error); storageBlocked = true; break; }
        await refresh();
        let response, failure;
        try { response = await request(attempted.row); if (!response || response.error || response.id !== attempted.id) failure = response && response.error || new Error("Sunucu teslim kimliği doğrulanamadı."); }
        catch (error) { failure = error; }
        try {
          await store.update(record.id, current => {
            if (!pending(current)) return current;
            if (!failure) return { ...current, row: { ...current.row, result: {
              target_game: current.row.result.target_game, operation: current.row.result.operation,
              client_request_id: current.id, ...(current.row.result.attachment ? { attachment: { name: current.row.result.attachment.name, delivered: true } } : {})
            } }, state: "delivered", updatedAt: now(), lastError: "", receipt: {
              id: current.id, status: response.status || "queued", created_at: response.created_at || current.row.created_at
            } };
            const type = classifyError(failure), delay = Math.round(Math.min(60000, 1000 * 2 ** Math.min(10, current.attempts - 1)) * (0.5 + random()));
            if (type === "retry") circuitUntil = now() + delay;
            return { ...current, state: type === "retry" ? "retry" : type === "auth" ? "auth" : "failed", updatedAt: now(),
              nextAttemptAt: type === "retry" ? now() + delay : null, lastError: String(failure.message || failure).slice(0, 500) };
          });
          if (!failure && store.removeDelivered) await store.removeDelivered(now() - 86400000);
        } catch (error) { persistenceError = String(error.message || error); storageBlocked = true; break; }
        await refresh();
        // A transiently unavailable server must not cause a burst of retries for the rest of the queue.
        if (failure && classifyError(failure) === "retry") break;
      }
      await refresh(); schedule(lastSnapshot); return emit();
    }
    async function flush() {
      if (running) return running;
      const execute = async () => {
        if (runtime.navigator && runtime.navigator.locks && runtime.navigator.locks.request)
          return runtime.navigator.locks.request("oryvona-command-outbox-v1", { mode: "exclusive" }, run);
        return run(); // The commands primary key still prevents duplicate execution on older browsers.
      };
      running = execute().catch(error => { persistenceError = String(error.message || error); return emit(); }).finally(() => { running = null; });
      return running;
    }
    async function enqueue(command) {
      const c = owner();
      if (!c.allowed) return { ok: false, error: "Emir için sahip hesabıyla giriş yapmalısın; hiçbir emir gönderilmedi." };
      if (stopped) return { ok: false, error: "Komut kuyruğu kapalı." };
      try {
        if (!command || !ACTIONS.has(command.action) || !String(command.text || "").trim()) throw new Error("Geçersiz emir; hiçbir emir gönderilmedi.");
        if (String(command.text).length > 10000) throw new Error("Emir metni 10000 karakteri aşıyor; giriş korunuyor ve emir gönderilmedi.");
        const result = copy(command.result || {});
        if (!GAMES.has(result.target_game || "koza")) throw new Error("Geçersiz hedef oyun.");
        const id = uuid();
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error("Güvenli komut kimliği oluşturulamadı.");
        const row = { id, project_id: "koza", action: command.action, text: String(command.text), created_by: c.email,
          status: "queued", created_at: new Date(now()).toISOString(), result: { ...result, client_request_id: id } };
        const size = bytes(JSON.stringify(row));
        if (size > (o.maxCommandBytes || MAX_COMMAND_BYTES)) throw new Error("Görsel/emir kalıcı kuyruk sınırını aşıyor (8 MB). Görseli küçült; emir gönderilmedi ve giriş korunuyor.");
        const record = { id, ownerId: c.userId, ownerEmail: c.email, row, byteSize: size, state: "queued", attempts: 0,
          nextAttemptAt: now(), updatedAt: now(), lastError: "" };
        const saved = await store.add(record, { count: o.maxPending || MAX_PENDING, bytes: o.maxQueueBytes || MAX_QUEUE_BYTES });
        if (!saved) throw new Error("Kalıcı kuyruk dolu. Bekleyen emirleri teslim et veya iptal et; bu emir gönderilmedi.");
        await refresh();
        // Persistence has completed before returning success or starting any network request.
        Promise.resolve().then(flush);
        return { ok: true, id, status: "queued", created_at: row.created_at, delivery: "local", error: null };
      } catch (error) { return { ok: false, error: String(error.message || error) }; }
    }
    async function resume() {
      storageBlocked = false; persistenceError = null;
      const c = owner();
      try {
        if (store.removeDelivered) await store.removeDelivered(now() - 86400000);
        if (c.allowed) {
          const records = await store.list();
          for (const item of records) if (sameOwner(item, c) && item.state === "auth")
            await store.update(item.id, record => ({ ...record, state: "queued", nextAttemptAt: now(), updatedAt: now() }));
        }
      } catch (error) { storageBlocked = true; persistenceError = String(error.message || error); return emit(); }
      return flush();
    }
    async function retry(id) {
      try {
        const c = owner();
        const item = await store.update(id, record => sameOwner(record, c) && ["failed", "auth", "retry"].includes(record.state)
          ? { ...record, state: "queued", nextAttemptAt: now(), lastError: "", updatedAt: now() } : record);
        if (!item || !sameOwner(item, c)) return { ok: false, error: "Bu emir mevcut sahip oturumuna ait değil." };
        await refresh(); flush(); return { ok: true };
      } catch (error) { return { ok: false, error: String(error.message || error) }; }
    }
    async function cancel(id) {
      try {
        const c = owner();
        const item = await store.update(id, record => sameOwner(record, c) && ["queued", "retry", "auth", "failed"].includes(record.state)
          ? { ...record, state: "cancelled", updatedAt: now() } : record);
        await refresh();
        return { ok: !!item && item.state === "cancelled", error: item && item.state === "sending" ? "Teslim başlamış; panelde Durdur komutunu kullan." : null };
      } catch (error) { return { ok: false, error: String(error.message || error) }; }
    }
    const wake = () => { if (!stopped) flush(); };
    if (runtime.addEventListener) runtime.addEventListener("online", wake);
    if (runtime.document && runtime.document.addEventListener) runtime.document.addEventListener("visibilitychange", wake);
    return { enqueue, flush, resume, retry, cancel, snapshot: refresh,
      subscribe(listener) { subscribers.add(listener); refresh(); return () => subscribers.delete(listener); },
      dispose() { stopped = true; if (timer) clearTimer(timer); if (runtime.removeEventListener) runtime.removeEventListener("online", wake);
        if (runtime.document && runtime.document.removeEventListener) runtime.document.removeEventListener("visibilitychange", wake); subscribers.clear(); },
      storage: "IndexedDB", version: VERSION };
  }
  return Object.freeze({ create, createIndexedDbStore, classifyError, version: VERSION });
});
