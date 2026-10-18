'use strict';
// K01 SIMPLE RUN · single-garden, six-wave pilot on the verified 516.6-q31 runtime.
// Loaded only by k01.html, after game.js / adventure-ui.js and before loader.js.
// It reuses the existing Meydan okuma (challenge) loop: KozaAdventure.state.challenge and
// state.wave. The visual arena is always the approved Ayışığı Bahçesi NORMAL arena
// (garden, visual number 1); the logical wave number lives only in state.wave.
window.KozaK01 = (() => {
  const BUILD = 'k01-2', BASE = window.KOZA_Q3?.version || '516.6-q31';
  const WAVES = 6, SECONDS = 35, PER_WAVE = 100, PER_LIGHT = 10;
  // The whole K01 balance: one row per wave. Numbers are the existing garden values
  // (source level in the comment). mix = the occasional support enemy after the first 30 %.
  const CONFIG = Object.freeze([
    { pattern: 'drift',  layout: 'scatter',  mix: 'drift', interval: 2.90, speed: 36, maxHazards: 4, shotSpeed: 120, fireDelay: 2.50 }, // garden 1
    { pattern: 'rain',   layout: 'clusters', mix: 'drift', interval: 2.60, speed: 42, maxHazards: 4, shotSpeed: 120, fireDelay: 2.50 }, // garden 4
    { pattern: 'cross',  layout: 'trail',    mix: 'drift', interval: 2.63, speed: 45, maxHazards: 5, shotSpeed: 135, fireDelay: 2.35 }, // garden 6
    { pattern: 'sentry', layout: 'ring',     mix: 'drift', interval: 2.63, speed: 45, maxHazards: 5, shotSpeed: 135, fireDelay: 2.35 }, // garden 6/7
    { pattern: 'zigzag', layout: 'trail',    mix: 'drift', interval: 2.54, speed: 47, maxHazards: 5, shotSpeed: 135, fireDelay: 2.35 }, // garden 7
    { pattern: 'cross',  layout: 'clusters', mix: 'rain',  interval: 2.35, speed: 47, maxHazards: 6, shotSpeed: 135, fireDelay: 2.35 }  // garden 9 (speed held at wave 5)
  ]);
  const NAMES = { drift: 'Süzülen gölgeler', rain: 'Yukarıdan inen dikenler', cross: 'Çapraz geçişler', sentry: 'Nişancı nöbetçiler', zigzag: 'Zikzak gölgeler' };
  const HERO_NAMES = { lumi: 'Lumi', koru: 'Koru', pera: 'Pera' };

  // ---- pilot save (separate key; see k01-boot.js for the storage prefix) ----
  function readPilot() {
    let p = null;
    try { p = JSON.parse(localStorage.getItem('pilot-v1') || 'null'); } catch {}
    const best = {};
    for (const id of Object.keys(HERO_NAMES)) {
      const r = p?.best?.[id];
      if (r && Number.isSafeInteger(r.score) && r.score >= 0) best[id] = { score: r.score, waves: r.waves | 0, lights: r.lights | 0, at: String(r.at || '') };
    }
    return { version: 2, runs: Number.isSafeInteger(p?.runs) && p.runs >= 0 ? p.runs : 0, best,
      cosmetics: KozaK01Forms.normalize(p?.cosmetics) };
  }
  function writePilot(p) {
    try {
      localStorage.setItem('pilot-v1', JSON.stringify(p));
      lastPilotSaved = window.KozaK01Storage?.isPersistent('pilot-v1') === true;
    } catch { lastPilotSaved = false; }
    updateSaveNote();
    return lastPilotSaved;
  }

  // Cosmetic form selection uses the existing portrait/gameplay sheets. Combat stays Form 1.
  let lastPilotSaved = null;
  function formState(hero = profile.active) { return KozaK01Forms.state(readPilot().cosmetics, hero); }
  function fixedStats() {
    if (!Object.hasOwn(HERO_NAMES, profile.active)) profile.active = 'lumi';
    profile.coins = 0; profile.essence = 0; profile.magnet = 0; profile.xp = 0;
    for (const id of Object.keys(HERO_NAMES)) {
      const old = profile.pets[id];
      profile.pets[id] = {name: old?.name || HERO_NAMES[id], points: 0, mastery: KozaDepth.mastery(null)};
    }
  }
  window.petState = function () {
    const s = formState();
    return {star: s.selectedForm, progress: s.progress, required: s.required, remaining: s.remaining};
  };
  const originalBegin = window.begin;
  window.begin = function () { fixedStats(); return originalBegin.apply(this, arguments); };
  function formProgress() {
    const s = formState(), d = Progress.catalog[profile.active];
    $('level').textContent = 'Form ' + (s.selectedForm + 1);
    $('level').title = 'Görünüm değişir; güç aynı kalır.';
    $('xpText').textContent = s.nextAt === null ? '4 / 4 görünüm' : s.lights + ' / ' + s.nextAt + ' ışık';
    $('xpBar').style.width = (s.nextAt === null ? 100 : s.progress / s.required * 100) + '%';
    $('growthText').textContent = s.nextAt === null ? 'Bütün görünümler açık' : 'Sonraki: ' + d.forms[s.unlocked + 1];
    $('upgradeOpen').setAttribute('aria-label', 'Görünümleri seç');
  }
  function chooseForm(hero, form) {
    if (mode !== 'home' || hero !== profile.active) return false;
    const p = readPilot(), selection = KozaK01Forms.select(p.cosmetics, hero, form);
    if (!selection.ok) return false;
    p.cosmetics = selection.cosmetics;
    writePilot(p); fixedStats(); refresh();
    return true;
  }
  function showForms() {
    const id = profile.active, d = Progress.catalog[id], s = formState(id);
    sheet('<span class="eyebrow">AYNI DOST · YENİ GÖRÜNÜM</span><h2>' + d.name + ' görünümleri</h2>' +
      '<p>Tur sonunda topladığın ışıklar yeni görünümleri açar. Gücün değişmez.</p><div class="k01-forms-grid">' +
      d.forms.map((name, i) => '<button class="k01-form-card' + (i === s.selectedForm ? ' current' : '') +
        '" data-k01-form="' + i + '" aria-pressed="' + (i === s.selectedForm) + '" ' + (i > s.unlocked ? 'disabled' : '') + '>' +
        portrait(id, i) + '<strong>' + name + '</strong><small>' +
        (i > s.unlocked ? KozaK01Forms.THRESHOLDS[i] + ' ışıkta açılır' : i === s.selectedForm ? 'Seçili' : 'Görünümü seç') +
        '</small></button>').join('') + '</div><p class="collection-foot">' +
      (s.nextAt === null ? 'Dört görünümün de açık.' : 'Sonraki görünüm için ' + s.remaining + ' ışık.') + '</p>');
    document.querySelectorAll('[data-k01-form]').forEach(b => b.onclick = () => {
      if (chooseForm(id, Number(b.dataset.k01Form))) { sfx('ui'); showForms(); }
    });
  }
  const ABILITY_TEXT = {
    lumi: 'Işık çağrısı parıltıları 5 saniye boyunca uzaktan çeker.',
    koru: 'Rüzgâr akışı kısa süre hızlandırır. Hareket senin kontrolündedir.',
    pera: 'Kanat kalkanı 5 saniye içinde bir darbeyi engeller.'
  };
  window.showCollection = function () {
    const p = readPilot();
    sheet('<span class="eyebrow">ÜÇ DOST · ÜÇ AYRI YOL</span><h2>Dostlarım</h2>' +
      '<div class="roster">' + Object.entries(Progress.catalog).map(([id, d]) => {
        const s = KozaK01Forms.state(p.cosmetics, id);
        return '<article class="creature-card ' + (profile.active === id ? 'active' : '') + '">' + portrait(id, s.selectedForm) +
          '<div><h3>' + d.name + '</h3><span class="creature-kind">' + d.kind + ' · Form ' + (s.selectedForm + 1) +
          '</span><p>' + ABILITY_TEXT[id] + '</p><button class="roster-button" data-k01-hero="' + id + '" ' +
          (profile.active === id ? 'disabled' : '') + '>' + (profile.active === id ? 'Seçili' : 'Birlikte keşfet') +
          '</button></div></article>';
      }).join('') + '</div><p class="collection-foot">Her dostun görünümleri ayrı açılır. Görünümler gücü değiştirmez.</p>');
    document.querySelectorAll('[data-k01-hero]').forEach(b => b.onclick = () => {
      if (mode !== 'home') return;
      profile.active = b.dataset.k01Hero; fixedStats(); save(); refresh(); $('sheet').close(); sfx('ui');
    });
  };
  const originalDrawSettings = window.drawSettings;
  window.drawSettings = function () {
    originalDrawSettings.apply(this, arguments);
    for (const id of ['exportBackup', 'chooseBackup', 'cloudRetry']) {
      const b = $(id); if (b) { b.disabled = true; b.hidden = true; }
    }
    const help = $('settingsPage-help');
    const rules = help?.querySelector('ol');
    if (rules) rules.innerHTML = '<li>Altı dalga var. Her dalgada 35 saniye hayatta kal; ışık toplamak zorunlu değil.</li>' +
      '<li>Puan: tamamlanan her dalga 100, her normal ışık 10. Sarı ışık yalnız o dalga için bir kart seçtirir.</li>' +
      '<li>Tur sonunda topladığın normal ışıklar seçtiğin dostun görünümlerini açar: 30, 90 ve 180 ışık. Görünümler gücü değiştirmez.</li>' +
      '<li>Her dostun görünüm gelişimi ve rekoru ayrıdır. Yeni harita açman veya bir şey satın alman gerekmez.</li>';
    const helpNote = help?.querySelector('.setting-explanation');
    if (helpNote) helpNote.textContent = 'Üç dost, dört görünüm. Görünümler yalnız görünüşü değiştirir; oyun gücü aynı kalır.';
    const oldInsights = document.querySelector('#settingsBody [data-open="tests"]');
    if (oldInsights) { oldInsights.hidden = true; oldInsights.style.display = 'none'; }
    const savePage = $('settingsPage-save');
    const paragraphs = savePage?.querySelectorAll('.setting-explanation');
    if (paragraphs?.[1]) paragraphs[1].textContent = 'Görünümlerin ve rekorun bu tarayıcıda tutulur. Bulut hesabı veya kampanya yedeği kullanılmaz.';
    if (paragraphs?.[2]) paragraphs[2].hidden = true;
  };
  $('appearance').onclick = showCollection;
  $('upgradeOpen').innerHTML = '<span class="feature-icon i-essence" aria-hidden="true"></span><span>Görünümler</span>';
  $('upgradeOpen').onclick = showForms;
  const originalRefresh = window.refresh;
  window.refresh = function () { originalRefresh.apply(this, arguments); formProgress(); };


  // ---- missions ----
  const points = (waves, lights) => PER_WAVE * waves + PER_LIGHT * lights;
  function mission(wave) {
    const w = Math.max(1, Math.min(WAVES, wave | 0)), c = CONFIG[w - 1], base = Expedition.level('garden', 1);
    return { ...base, k01: true, wave: w, number: 1, boss: false, id: 'k01', name: 'Dalga ' + w + ' / ' + WAVES,
      target: 0, comboTarget: 0, minLives: 1, duration: SECONDS, bonus: 0, wind: 0,
      pattern: c.pattern, layout: c.layout, interval: c.interval, speed: c.speed, maxHazards: c.maxHazards,
      shotSpeed: c.shotSpeed, fireDelay: c.fireDelay, patternName: NAMES[c.pattern] };
  }
  const active = () => typeof runMission !== 'undefined' && !!runMission?.k01 && !!KozaAdventure.state.challenge;

  // Every start on this page is a K01 run (the challenge entry of the existing loop).
  try { Object.defineProperty(window, 'kozaStartChallenge', { configurable: true, get: () => true, set: () => {} }); } catch {}
  KozaAdventure.challengeMission = mission;
  const baseResolve = window.resolveRun;
  window.resolveRun = function (challenge = false) { return challenge ? { region: 'garden', mission: mission(1) } : baseResolve(false); };
  // Enemy kind for a K01 wave: the wave pattern, with the support kind on every other spawn later in the wave.
  const basePattern = KozaDepth.pattern;
  KozaDepth.pattern = function (m, elapsedTime, serial) {
    if (!m?.k01) return basePattern.apply(this, arguments);
    const c = CONFIG[m.wave - 1];
    return KozaDepth.phase(elapsedTime, m.duration) > 0 && serial % 2 ? c.mix : c.pattern;
  };
  // "Son dalga" is the campaign name of the last 30 % of a level; in a six-wave run it would read as "final wave".
  const baseRhythm = KozaRunFlow.rhythm;
  KozaRunFlow.rhythm = function (m) {
    const r = baseRhythm.apply(this, arguments);
    return m?.k01 && r.label === 'Son dalga' ? { ...r, label: 'Akış yoğunlaştı' } : r;
  };
  // Cloud is not part of the pilot: no network, no queue, no events.
  window.KozaCloud = { init: () => Promise.resolve(), queue() {}, event() {}, flush: () => Promise.resolve(), insights() {},
    reconnect: () => Promise.resolve(), authRequired: false, status: 'K01 pilot · bulut kapalı' };
  if (window.KozaEntrance) {
    const baseStart = KozaEntrance.start;
    KozaEntrance.start = function (m) {
      baseStart.apply(this, arguments);
      if (!m?.k01) return;
      $('entranceChapter').textContent = 'K01 · AYIŞIĞI BAHÇESİ · DALGA ' + m.wave + ' / ' + WAVES;
      $('entranceGoal').textContent = SECONDS + ' sn hayatta kal · ışıkları topla. Her ışık +' + PER_LIGHT + ', her dalga +' + PER_WAVE + '.';
    };
  }

  // ---- wave transition (survived a full 35 s wave) ----
  function nextWave() {
    const st = KozaAdventure.state, done = st.wave;
    st.k01Done = done;
    st.wave++;
    runMission = mission(st.wave);
    window.KozaScaleV2?.tune?.(runMission);
    elapsed = 0; time = runMission.duration;
    combo = 0; comboAge = 0; spawnClock = 0; orbClock = 0; orbIndex = 0; hazardSerial = 0;
    hazards = []; projectiles = [];
    orbs = Array.from({ length: window.KozaScaleV2?.orbPace?.()?.cap || 8 }, randomOrb);
    missionAwarded = false;
    // cards and every temporary state last for one wave only
    Object.assign(st, { goalScore: null, ready: 0, choiceGrace: 0.85, relief: 2.2, choice: false, offered: [], chosen: '', picks: [],
      choiceCount: 0, choiceAt: 12, encounterPhase: 0, hits: 0, ward: false, wardRecharge: 0, shield: 0, shieldBreak: 0, magnet: 0,
      slow: 0, dash: 0, flow: 0, cooldown: 0, powerPulse: 0, specialLight: null });
    hitCD = Math.max(hitCD, 0.85);
    release(); keys = {};
    const before = lives;
    lives = Math.min(3, lives + 1); // only reached alive (lives > 0): never a revive
    hudCache.heartsKey = null;
    KozaAdventure.notice('Dalga ' + done + ' tamam' + (lives > before ? ' · +1 can' : ''),
      { kind: 'success', detail: 'Dalga ' + st.wave + ' / ' + WAVES + ' · ' + runMission.patternName + ' · kartlar sıfırlandı', priority: 5, duration: 2.6 });
    sfx('goal');
    updateHUD();
  }

  // ---- result ----
  let lastResult = null;
  function result(kind) {
    const st = KozaAdventure.state, waves = kind === 'cleared' ? WAVES : st.wave - 1, lights = score, total = points(waves, lights); // score = normal lights of the whole run
    window.KozaEntrance?.cancel();
    $('resumeCue').hidden = true;
    settled = true; mode = 'result';
    window.KozaAudio.setMode('home'); window.KozaAudio.start();
    target = null;
    const hero = profile.active, pilot = readPilot(), prev = pilot.best[hero] || null, record = !prev || total > prev.score;
    const earned = KozaK01Forms.addLights(pilot.cosmetics, hero, lights);
    pilot.cosmetics = earned.cosmetics;
    if (record) pilot.best[hero] = { score: total, waves, lights, at: new Date().toISOString() };
    pilot.runs++;
    const saved = writePilot(pilot);
    profile.runs = pilot.runs;
    lastResult = { kind, waves, lights, score: total, hero, record, previous: prev ? prev.score : null, best: pilot.best[hero].score, saved,
      cosmeticLights: earned.after.lights, unlockedForm: earned.after.unlocked, newForms: earned.newForms };
    refresh();
    $('resultTag').textContent = 'K01 · Ayışığı Bahçesi · ' + (HERO_NAMES[hero] || hero);
    $('resultTitle').textContent = kind === 'cleared' ? WAVES + ' dalga tamamlandı!' : kind === 'death' ? 'Canların tükendi' : 'Tur bitirildi';
    $('chapterMedals').hidden = true; $('flawlessBadge').hidden = true; $('nextChapter').hidden = true;
    const form = Progress.catalog[hero].forms[earned.after.selectedForm];
    $('levelUp').hidden = false;
    $('levelUp').textContent = earned.newForms ? 'Yeni görünüm açıldı: ' + form + ' · Gücün aynı.' :
      'Görünüm gelişimi +' + lights + ' ışık · ' + (earned.after.nextAt === null ? 'Bütün görünümler açık.' :
      earned.after.lights + ' / ' + earned.after.nextAt + ' ışık');
    $('resultSummary').textContent = 'Puan ' + total + ' = ' + waves + ' dalga × ' + PER_WAVE + ' + ' + lights + ' ışık × ' + PER_LIGHT;
    $('resultRun').innerHTML = ['Dalga ' + waves + ' / ' + WAVES, '✦ ' + lights + ' ışık', 'Seri ' + maxCombo].map((t) => '<span>' + t + '</span>').join('');
    $('resultTotals').textContent = (record ? (prev ? 'Yeni kişisel rekor! Önceki: ' + prev.score : 'İlk kişisel rekor!') : 'Kişisel rekor: ' + pilot.best[hero].score) + ' · ' + (HERO_NAMES[hero] || hero);
    $('resultDetails').textContent = 'Her tamamlanan dalga ' + PER_WAVE + ', her normal ışık ' + PER_LIGHT +
      ' puan. Topladığın normal ışıklar tur sonunda bu dostun görünümlerini de açar. Sarı kart ışığı sayılmaz.' +
      (saved ? '' : ' Bu sonuç ve görünüm gelişimi yalnız açık oturumda tutuluyor; sayfayı kapatırsan kaybolabilir.');
    $('personalResult').hidden = true;
    $('again').className = 'primary';
    $('again').textContent = 'Tekrar oyna';
    if ($('paused').open) $('paused').close();
    $('result').dataset.outcome = kind === 'cleared' ? 'win' : 'lose';
    $('result').dataset.k01 = kind;
    $('result').showModal();
    sfx(kind === 'cleared' ? 'victory' : 'defeat');
  }

  const baseFinish = window.finish;
  window.finish = function (survived = false) {
    if (!active()) return baseFinish.apply(this, arguments);
    if (settled || !['play', 'paused'].includes(mode)) return;
    const st = KozaAdventure.state;
    // death has priority: a timeout in the same step only counts while at least one life is left
    if (survived && lives > 0 && time <= 0) {
      if (st.wave < WAVES) { nextWave(); return; }
      result('cleared');
      return;
    }
    result(lives <= 0 ? 'death' : 'quit');
  };

  // ---- HUD ----
  const baseMissionHUD = window.updateMissionHUD;
  window.updateMissionHUD = function () {
    if (!active()) return baseMissionHUD.apply(this, arguments);
    const hud = $('missionHud'), st = KozaAdventure.state, text = 'Dalga ' + st.wave + ' / ' + WAVES + ' · ' + runMission.patternName;
    hud.classList.remove('boss-health-hud', 'goal-complete', 'goal-pulse', 'is-empty');
    if ($('hud').dataset.goal) $('hud').dataset.goal = '';
    if (hud.dataset.content !== text) {
      hud.dataset.content = text;
      hud.textContent = text;
      hud.setAttribute('aria-label', text + ' · ' + SECONDS + ' saniye hayatta kal');
    }
    syncFieldBoundary();
  };
  window.updateSaveNote = function () {
    const warning = lastPilotSaved === false || window.KozaK01Storage?.status('koza-v1')?.mode === 'memory';
    $('saveNote').dataset.warning = String(warning);
    $('saveNote').textContent = warning ? 'Bu tarayıcı şu an kalıcı kayıt yapamıyor. Görünümlerin ve rekorun yalnız bu açık oturumda korunuyor.' : '';
    $('k01HiddenCaption').hidden = !warning;
  };
  window.refreshJourney = function () {
    const hero = profile.active, pilot = readPilot(), r = pilot.best[hero];
    $('regionName').textContent = 'Ayışığı Bahçesi';
    $('habitatLabel').textContent = 'AYIŞIĞI BAHÇESİ';
    $('missionLabel').textContent = 'Ayışığı Bahçesi · ' + WAVES + ' dalga × ' + SECONDS + ' sn';
    $('missionDescription').textContent = 'Hayatta kal, ışıkları topla. Puan = ' + PER_WAVE + ' × dalga + ' + PER_LIGHT + ' × ışık. ' +
      (HERO_NAMES[hero] || hero) + ' rekoru: ' + (r ? r.score + ' (' + r.waves + ' dalga · ' + r.lights + ' ışık)' : '—');
    $('playLabel').textContent = 'OYNA';
    $('playDuration').innerHTML = '<span class="play-time">' + WAVES + ' dalga</span>';
    $('best').textContent = r ? r.score : '—';
    $('runs').textContent = pilot.runs;
    tag();
    if (mode === 'home') {
      window.KozaAssets?.applyHome('garden');
      $('app').classList.remove('grove');
      document.body.classList.remove('grove-scene');
    }
  };
  // build tag (bottom line): this page is the K01 pilot, not the Q3.1 reference page
  const LABEL = 'KOZA — K01 SIMPLE RUN · ' + BUILD + ' · taban ' + BASE + ' (Q3.1)';
  const tag = () => { const d = document.getElementById('v2Build'); if (d && d.firstChild?.nodeType === 3 && d.firstChild.textContent !== LABEL) d.firstChild.textContent = LABEL; };
  addEventListener('load', () => { tag(); setTimeout(tag, 0); });
  fixedStats();
  $('play').onclick = () => begin();
  updateSaveNote();
  refresh();

  return { BUILD, BASE, WAVES, SECONDS, CONFIG, mission, points, readPilot, forms: {state: formState, select: chooseForm, show: showForms}, get lastResult() { return lastResult; },
    get active() { return active(); } };
})();
