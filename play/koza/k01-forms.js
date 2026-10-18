'use strict';
// Existing art only. This progression never writes character points or combat stats.
window.KozaK01Forms = (() => {
  const HEROES = Object.freeze(['lumi', 'koru', 'pera']);
  const THRESHOLDS = Object.freeze([0, 30, 90, 180]);
  const MAX_LIGHTS = 1000000000;
  const validCount = n => Number.isSafeInteger(n) && n >= 0 ? Math.min(MAX_LIGHTS, n) : 0;
  const unlocked = lights => THRESHOLDS.reduce((best, n, i) => lights >= n ? i : best, 0);
  function normalize(raw) {
    const out = {};
    for (const id of HEROES) {
      const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw[id] : null;
      const lights = validCount(source?.lights), top = unlocked(lights);
      const selectedForm = Number.isInteger(source?.selectedForm) && source.selectedForm >= 0 && source.selectedForm <= top ? source.selectedForm : 0;
      out[id] = {lights, selectedForm};
    }
    return out;
  }
  function state(cosmetics, hero) {
    if (!HEROES.includes(hero)) throw new Error('Unknown K01 hero');
    const c = normalize(cosmetics)[hero], top = unlocked(c.lights);
    return {...c, unlocked: top, nextAt: top < 3 ? THRESHOLDS[top + 1] : null,
      remaining: top < 3 ? THRESHOLDS[top + 1] - c.lights : 0,
      progress: top < 3 ? c.lights - THRESHOLDS[top] : 0,
      required: top < 3 ? THRESHOLDS[top + 1] - THRESHOLDS[top] : 0};
  }
  function addLights(cosmetics, hero, amount) {
    const out = normalize(cosmetics);
    if (!HEROES.includes(hero)) throw new Error('Unknown K01 hero');
    const before = state(out, hero);
    out[hero].lights = Math.min(MAX_LIGHTS, before.lights + validCount(amount));
    const top = unlocked(out[hero].lights);
    if (top > before.unlocked) out[hero].selectedForm = top;
    const after = state(out, hero);
    return {cosmetics: out, before, after, newForms: top - before.unlocked};
  }
  function select(cosmetics, hero, form) {
    const out = normalize(cosmetics);
    if (!HEROES.includes(hero)) return {ok: false, cosmetics: out};
    const top = state(out, hero).unlocked;
    const ok = Number.isInteger(form) && form >= 0 && form <= top;
    if (ok) out[hero].selectedForm = form;
    return {ok, cosmetics: out};
  }
  return Object.freeze({HEROES, THRESHOLDS, normalize, state, addLights, select});
})();

