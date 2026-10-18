'use strict';
// K01 SIMPLE RUN · boot (loaded first, only by k01.html).
// 1) Storage isolation: every localStorage key this page touches is stored under the
//    "koza-k01:" prefix, so the legacy save (koza-v1, its backup, koza-testbuild-v1,
//    settings, sync queue …) is never read or written by the pilot.
// 2) Pilot profile: before the game reads its save, the pilot save is rewritten with
//    the fixed pilot stats (all three heroes, Form 1, no coins/essence/magnet). Only the
//    chosen hero, hero names and the per-hero K01 records survive between visits.
window.KOZA_K01 = true;
(() => {
  const PREFIX = 'koza-k01:';
  let real = null, unavailable = '', blocked = false, bootError = '', lastError = '';
  const reason = error => String(error?.name || 'Error') + ': ' + String(error?.message || error);
  try { real = window.localStorage; } catch (error) { unavailable = reason(error); }
  const memory = new Map(), removed = new Set(), known = new Set(), faults = new Map();
  // A failed clear must not reveal old native entries again in this page. Successful
  // writes after that clear are the only native entries admitted through the barrier.
  let clearBarrier = false;
  const afterClear = new Set();
  const k = (key) => PREFIX + String(key);
  const native = () => { if (!real) throw Error(unavailable || 'Browser storage is unavailable'); return real; };
  const failed = (key, error) => { const text = reason(error); faults.set(key, text); lastError = text; };
  const status = key => {
    const name = String(key), volatile = memory.has(name) || removed.has(name) || (clearBarrier && !afterClear.has(name));
    const persistent = !blocked && !!real && !volatile && !faults.has(name);
    return { persistent, mode: blocked ? 'blocked' : persistent ? 'persistent' : 'memory',
      reason: blocked ? bootError : faults.get(name) || (!real ? unavailable || 'Browser storage is unavailable' : volatile ? 'Only available in this page' : '') };
  };
  const own = () => {
    const out = new Set();
    let complete = true;
    try {
      const source = native();
      for (let i = 0; i < source.length; i++) {
        const n = source.key(i);
        if (n && n.startsWith(PREFIX)) out.add(n.slice(PREFIX.length));
      }
      known.clear(); for (const n of out) known.add(n);
    } catch (error) {
      complete = false; lastError = reason(error);
      for (const n of known) out.add(n);
    }
    for (const n of memory.keys()) out.add(n);
    for (const n of removed) out.delete(n);
    if (clearBarrier) for (const n of out) if (!memory.has(n) && !afterClear.has(n)) out.delete(n);
    return { names: [...out], complete };
  };
  const store = {
    getItem: key => {
      const name = String(key);
      if (memory.has(name)) return memory.get(name);
      if (removed.has(name) || (clearBarrier && !afterClear.has(name))) return null;
      try {
        const value = native().getItem(k(name)); faults.delete(name);
        if (value === null) known.delete(name); else known.add(name);
        return value;
      } catch (error) { failed(name, error); return null; }
    },
    setItem: (key, v) => {
      const name = String(key), value = String(v);
      removed.delete(name);
      try {
        native().setItem(k(name), value);
        memory.delete(name); faults.delete(name); known.add(name); afterClear.add(name);
      } catch (error) { memory.set(name, value); failed(name, error); }
    },
    removeItem: key => {
      const name = String(key);
      memory.delete(name); known.delete(name); afterClear.delete(name);
      removed.add(name);
      try { native().removeItem(k(name)); removed.delete(name); faults.delete(name); }
      catch (error) { failed(name, error); }
    },
    clear: () => {
      const entries = own();
      for (const n of entries.names) store.removeItem(n);
      if (!entries.complete) { clearBarrier = true; afterClear.clear(); }
    },
    key: i => own().names[Number(i) >>> 0] ?? null,
    get length() { return own().names.length; }
  };
  // setItem intentionally permits a session fallback; callers must use isPersistent
  // before claiming that a record will survive a reload.
  window.KozaK01Storage = Object.freeze({
    isPersistent: key => status(key).persistent, status,
    get blocked() { return blocked; }, get error() { return blocked ? bootError : lastError; }
  });
  try {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: store });
    if (window.localStorage !== store) throw Error('The isolated storage adapter could not be installed');
  } catch (error) {
    // The entry page must not initialize the legacy runtime when this flag is set.
    blocked = true; bootError = reason(error);
    window.KOZA_K01_BOOT_BLOCKED = true; window.KOZA_K01_BOOT_ERROR = bootError;
    const show = () => {
      const doc = window.document;
      if (!doc?.body || doc.getElementById('k01BootError')) return;
      const note = doc.createElement('p'); note.id = 'k01BootError'; note.setAttribute('role', 'alert');
      note.textContent = 'K01 başlatılamadı: ayrı kayıt alanı kurulamadı. Eski kaydın değiştirilmedi.';
      doc.body.prepend(note);
    };
    if (window.document?.readyState === 'loading') window.document.addEventListener('DOMContentLoaded', show, { once: true });
    else show();
    return;
  }

  const HEROES = { lumi: 'Lumi', koru: 'Koru', pera: 'Pera' };
  let old = null, pilot = null;
  try { old = JSON.parse(store.getItem('koza-v1') || 'null'); } catch {}
  try { pilot = JSON.parse(store.getItem('pilot-v1') || 'null'); } catch {}
  const active = Object.hasOwn(HEROES, old?.active) ? old.active : 'lumi';
  const pets = {};
  for (const [id, name] of Object.entries(HEROES)) {
    const n = old?.pets?.[id]?.name;
    pets[id] = { name: typeof n === 'string' && n.trim() ? n.slice(0, 18) : name, points: 0 };
  }
  // Same starting stats on every run: points 0 (Form 1), magnet 0, no economy.
  const fixed = { version: 6, active, pets, coins: 0, essence: 0, magnet: 0, xp: 0,
    runs: Number.isSafeInteger(pilot?.runs) ? pilot.runs : 0, best: 0, region: 'garden',
    challenge: { best: 0, runs: 0 }, records: {} };
  store.setItem('koza-v1', JSON.stringify(fixed));
  store.removeItem('koza-v1-backup');
  store.removeItem('koza-v1-recovery');
})();
