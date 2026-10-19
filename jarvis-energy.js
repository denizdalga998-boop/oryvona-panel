/* ORYVONA v26 — bounded, decorative Canvas2D orb. No network or audio startup. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JarvisEnergyCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var TAU = Math.PI * 2;
  var mounts = new WeakMap();
  var MODES = Object.freeze(['idle', 'listening', 'thinking', 'speaking']);
  var STATES = Object.freeze(MODES.concat(['orchestrating', 'success', 'blocked', 'offline']));
  var JOB_STATES = Object.freeze(['queued', 'running', 'blocked', 'completed', 'failed', 'paused', 'cancelled']);
  var COLORS = Object.freeze({
    idle: ['#43d5ed', '#518eff', '#d7fbff'],
    listening: ['#69edee', '#46baff', '#edffff'],
    thinking: ['#64b8ff', '#677fff', '#deecff'],
    speaking: ['#78f4f2', '#50aaff', '#efffff'],
    blocked: ['#dbb276', '#827e93', '#fae5bc'],
    offline: ['#72899c', '#486375', '#b0c3d1']
  });

  function normaliseState(state) {
    if (typeof state !== 'string' || STATES.indexOf(state) === -1) throw new TypeError('Unknown Jarvis energy state');
    return state;
  }
  function modeOf(state) { return state === 'orchestrating' ? 'thinking' : state === 'success' ? 'idle' : state; }
  function clampAudioLevel(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError('Audio level must be a finite number');
    return Math.max(0, Math.min(1, value));
  }
  function pixelBudget(width, height, ratio) {
    var w = Number.isFinite(width) && width > 0 ? Math.max(1, Math.min(width, 512)) : 224;
    var h = Number.isFinite(height) && height > 0 ? Math.max(1, Math.min(height, 512)) : 224;
    var dpr = Number.isFinite(ratio) ? Math.min(1.75, Math.max(1, ratio)) : 1;
    // Absolute backing-store ceiling, even for abnormally large or stretched hosts.
    var pixels = w * h * dpr * dpr;
    if (pixels > 600000) dpr = Math.sqrt(600000 / (w * h));
    return { width: w, height: h, dpr: dpr, pixelWidth: Math.max(1, Math.floor(w * dpr)), pixelHeight: Math.max(1, Math.floor(h * dpr)) };
  }
  function normaliseActivities(records) {
    if (!Array.isArray(records) || records.length > 1000) throw new TypeError('Activities must be an array of at most 1000 real job records');
    var seen = new Set();
    return records.map(function (job) {
      if (!job || typeof job !== 'object' || typeof job.id !== 'string' || !job.id.trim() || job.id.length > 160 ||
          JOB_STATES.indexOf(job.status) === -1 || seen.has(job.id)) throw new TypeError('Activities require unique ids and known statuses');
      if (job.project !== undefined && (typeof job.project !== 'string' || job.project.length > 160)) throw new TypeError('Invalid activity project');
      seen.add(job.id);
      return Object.freeze({ id: job.id, status: job.status, project: job.project || '' });
    });
  }
  function targetFPS(state) {
    var mode = modeOf(normaliseState(state));
    if (mode === 'offline' || mode === 'blocked') return 0;
    return mode === 'idle' ? 24 : 60;
  }

  function mount(canvas, options) {
    options = options || {};
    if (!canvas || typeof canvas.getContext !== 'function' || typeof canvas.getBoundingClientRect !== 'function') throw new TypeError('mount expects a canvas element');
    if (mounts.has(canvas)) throw new Error('Canvas already has a mounted Jarvis energy core');
    if (options.reducedMotion !== undefined && typeof options.reducedMotion !== 'boolean') throw new TypeError('reducedMotion must be boolean');
    var state = normaliseState(options.state === undefined ? options.mode === undefined ? 'idle' : options.mode : options.state);
    var mode = modeOf(state);
    var ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!ctx) throw new Error('Canvas2D unavailable');
    var doc = canvas.ownerDocument;
    var view = doc && doc.defaultView || (typeof globalThis !== 'undefined' ? globalThis : {});
    var runtime = options.runtime || {};
    var raf = runtime.requestAnimationFrame || view.requestAnimationFrame && view.requestAnimationFrame.bind(view);
    var caf = runtime.cancelAnimationFrame || view.cancelAnimationFrame && view.cancelAnimationFrame.bind(view);
    var now = runtime.now || function () { return view.performance && view.performance.now ? view.performance.now() : Date.now(); };
    var timer = runtime.setTimeout || view.setTimeout && view.setTimeout.bind(view);
    var clearTimer = runtime.clearTimeout || view.clearTimeout && view.clearTimeout.bind(view);
    var Resize = runtime.ResizeObserver || view.ResizeObserver;
    var Intersect = runtime.IntersectionObserver || view.IntersectionObserver;
    var matchMedia = runtime.matchMedia || view.matchMedia && view.matchMedia.bind(view);
    if (!raf || !caf || !timer || !clearTimer) throw new Error('Animation and timer APIs unavailable');
    var media = matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    var reducedByOS = !!(media && media.matches);
    var forcedReduced = options.reducedMotion === true;
    var destroyed = false;
    var visible = true;
    var frameId = null;
    var resizeTimer = null;
    var resizeObserver = null;
    var intersectionObserver = null;
    var size = null;
    var gradients = null;
    var jobs = [];
    var marks = [];
    var level = null;
    var smoothLevel = 0;
    var speechEnergy = mode === 'speaking' ? 1 : 0;
    var startedAt = now();
    var modeSince = startedAt;
    var lastDraw = -Infinity;
    var previousDraw = null;
    var tapSince = -Infinity;
    var frames = 0;
    var callbacks = 0;
    var totalDrawMS = 0;
    var maxDrawMS = 0;
    var overBudgetFrames = 0;
    var firstMeasuredFrame = null;
    var lastMeasuredFrame = null;
    var oldAria = canvas.getAttribute('aria-hidden');
    var oldState = canvas.getAttribute('data-energy-state');
    var oldMode = canvas.getAttribute('data-energy-mode');
    var oldBackground = canvas.style ? canvas.style.background : null;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.setAttribute('data-energy-state', state);
    canvas.setAttribute('data-energy-mode', mode);
    if (canvas.style) canvas.style.background = 'transparent';

    function reduced() { return forcedReduced || reducedByOS; }
    function drawable() { return !destroyed && visible && !(doc && doc.hidden); }
    function frozen() { return reduced() || mode === 'offline' || mode === 'blocked'; }
    function stopFrame() { if (frameId !== null) { caf(frameId); frameId = null; } }
    function ring(radius, squash, angle, from, to, color, width, alpha) {
      ctx.save();
      ctx.globalAlpha = alpha === undefined ? 1 : alpha;
      ctx.rotate(angle);
      ctx.scale(1, squash);
      ctx.beginPath();
      ctx.arc(0, 0, radius, from, to);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
      ctx.restore();
    }
    function dot(x, y, radius, color, alpha) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    function resize() {
      if (destroyed) return;
      var rect = canvas.getBoundingClientRect();
      size = pixelBudget(rect.width, rect.height, runtime.devicePixelRatio === undefined ? view.devicePixelRatio : runtime.devicePixelRatio);
      canvas.width = size.pixelWidth;
      canvas.height = size.pixelHeight;
      // Only size changes allocate gradients; no frame-time layout or shadowBlur.
      var halo = ctx.createRadialGradient(0, 0, 12, 0, 0, 108);
      halo.addColorStop(0, 'rgba(57,181,255,.15)');
      halo.addColorStop(.5, 'rgba(38,128,226,.075)');
      halo.addColorStop(1, 'rgba(34,125,232,0)');
      var sphere = ctx.createRadialGradient(-17, -19, 2, 0, 0, 58);
      sphere.addColorStop(0, 'rgba(171,249,255,.24)');
      sphere.addColorStop(.42, 'rgba(47,181,236,.16)');
      sphere.addColorStop(.82, 'rgba(28,86,168,.12)');
      sphere.addColorStop(1, 'rgba(50,167,255,.3)');
      var heart = ctx.createRadialGradient(0, 0, 0, 0, 0, 25);
      heart.addColorStop(0, 'rgba(221,255,255,.7)');
      heart.addColorStop(.18, 'rgba(111,230,255,.4)');
      heart.addColorStop(.6, 'rgba(62,151,255,.17)');
      heart.addColorStop(1, 'rgba(52,166,255,0)');
      gradients = { halo: halo, sphere: sphere, heart: heart };
      refresh();
    }
    function queueResize() {
      if (resizeTimer !== null) clearTimer(resizeTimer);
      resizeTimer = timer(function () { resizeTimer = null; resize(); }, 80);
    }
    function fillGradient(gradient, radius, alpha) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    function render(timestamp) {
      if (!drawable() || !size || !gradients) return;
      var measuredStart = now();
      var isFrozen = frozen();
      var t = isFrozen ? 0 : Math.max(0, timestamp - startedAt) / 1000;
      var modeAge = isFrozen ? 0 : Math.max(0, timestamp - modeSince) / 1000;
      var delta = previousDraw === null ? 1 / 60 : Math.min(.1, Math.max(0, timestamp - previousDraw) / 1000);
      previousDraw = timestamp;
      smoothLevel += ((level === null ? 0 : level) - smoothLevel) * (1 - Math.exp(-delta * 15));
      var palette = COLORS[mode];
      var speaking = mode === 'speaking';
      var listening = mode === 'listening';
      var thinking = mode === 'thinking';
      var speed = thinking ? .78 : speaking ? .38 : listening ? .22 : .075;
      // Listening uses only explicitly supplied real microphone levels. Unknown input never fabricates a spectrum.
      var response = !isFrozen && (listening || speaking) ? smoothLevel : 0;
      // A visual release envelope softens the return to idle without extending speech state.
      speechEnergy = isFrozen ? (speaking ? 1 : 0) : speechEnergy + ((speaking ? 1 : 0) - speechEnergy) * (1 - Math.exp(-delta * 9));
      var breath = isFrozen ? 1 : 1 + Math.sin(t * (1.35 + speechEnergy * 2.05)) * (.018 + speechEnergy * .037);
      var scale = Math.min(size.width, size.height) / 256;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(size.dpr * scale, 0, 0, size.dpr * scale, size.pixelWidth / 2, size.pixelHeight / 2);
      ctx.lineCap = 'round';
      fillGradient(gradients.halo, 108, isFrozen ? .5 : .88 + (breath - 1) * 2 + response * .1);
      ring(107, 1, 0, 0, TAU, palette[0], .45, .13);
      ring(99, 1, 0, 0, TAU, palette[1], .6, .22);
      ring(99, 1, 0, t * speed * .36, t * speed * .36 + .9, palette[0], 1.1, .75);
      ring(99, 1, 0, t * speed * .36 + Math.PI, t * speed * .36 + Math.PI + .36, palette[1], 1.5, .8);
      ring(88, .49, -.36 + t * speed * .1, 0, TAU, palette[0], .8, .28);
      ring(88, .49, -.36 + t * speed * .1, t * speed, t * speed + Math.PI * .94, palette[0], 1.35, .82);
      ring(79, .83, .78 - t * speed * .14, 0, TAU, palette[1], .75, .3);
      ring(79, .83, .78 - t * speed * .14, -t * speed + Math.PI * .2, -t * speed + Math.PI * 1.01, palette[1], 1.3, .8);
      ctx.save();
      var sphereScale = breath + response * .11;
      ctx.scale(sphereScale, sphereScale);
      fillGradient(gradients.sphere, 58, isFrozen ? .65 : 1);
      ring(58, 1, 0, 0, TAU, palette[0], .9, .54);
      ring(57, 1, 0, -t * speed * .65, -t * speed * .65 + Math.PI * .62, palette[2], 1.35, .7);
      // Wireframe meridians and latitudes keep a recognizable spherical silhouette.
      ring(56, .31, .06, 0, TAU, palette[0], .65, .35);
      ring(56, .7, .06, 0, TAU, palette[0], .6, .19);
      ring(56, .28 + Math.sin(t * speed * .55) * .12, Math.PI / 2 + .06, 0, TAU, palette[1], .75, .39);
      ring(56, .76, Math.PI / 2 + .06, 0, TAU, palette[1], .6, .22);
      fillGradient(gradients.heart, 25, isFrozen ? .5 : .75 + response * .25);
      ring(17, 1, 0, t * speed * 1.3, t * speed * 1.3 + Math.PI * 1.65, palette[0], 1.1, .65);
      ring(10.5, .65, -t * speed, 0, TAU, palette[1], .8, .62);
      dot(0, 0, 2.2 + response * 1.5, palette[2], .9);
      ctx.restore();
      // These are decorative energy nodes, never counts or invented worker statuses.
      for (var i = 0; i < 12; i += 1) {
        var theta = i * TAU / 12 + t * speed * .18;
        dot(Math.cos(theta) * 107, Math.sin(theta) * 107, i % 3 === 0 ? 1.35 : .65, palette[i % 2], i % 3 === 0 ? .62 : .25);
      }
      // Only validated real jobs create the separate outer operational marks.
      for (var j = 0; j < marks.length; j += 1) {
        var jobAngle = j * TAU / 6 - Math.PI / 2;
        var running = marks[j].status === 'running';
        dot(Math.cos(jobAngle) * 115, Math.sin(jobAngle) * 115, running ? 2.2 : 1.5, running ? palette[2] : palette[0], running ? .9 : .45);
      }
      if (speechEnergy > .015 && !isFrozen) {
        // Decorative rings live exactly as long as the controller's real speaking state.
        for (var wave = 0; wave < 2; wave += 1) {
          var phase = (modeAge * .62 + wave * .5) % 1;
          ring(63 + phase * 29, 1, 0, 0, TAU, palette[0], .85, (1 - phase) * .32 * speechEnergy);
        }
      }
      if (thinking && !isFrozen) {
        ring(68, 1, 0, t * 1.35, t * 1.35 + Math.PI * .7, palette[0], 1.5, .82);
        ring(71, 1, 0, -t * .9 + Math.PI, -t * .9 + Math.PI * 1.45, palette[1], .8, .6);
      }
      var tapAge = timestamp - tapSince;
      if (!isFrozen && tapAge >= 0 && tapAge < 450) ring(58 + tapAge * .1, 1, 0, 0, TAU, palette[2], .8, (1 - tapAge / 450) * .4);
      ctx.globalAlpha = 1;
      var cost = Math.max(0, now() - measuredStart);
      frames += 1;
      totalDrawMS += cost;
      maxDrawMS = Math.max(maxDrawMS, cost);
      if (cost > 16.67) overBudgetFrames += 1;
      if (firstMeasuredFrame === null) firstMeasuredFrame = timestamp;
      lastMeasuredFrame = timestamp;
    }
    function frame(timestamp) {
      frameId = null;
      if (!drawable() || frozen()) return;
      callbacks += 1;
      var interval = 1000 / targetFPS(state);
      var difference = timestamp - lastDraw;
      if (difference >= interval - .3) {
        render(timestamp);
        lastDraw += Math.max(1, Math.floor((difference + .3) / interval)) * interval;
      }
      frameId = raf(frame);
    }
    function refresh() {
      stopFrame();
      if (!drawable()) return;
      var timestamp = now();
      render(timestamp);
      lastDraw = timestamp;
      if (!frozen()) frameId = raf(frame);
    }
    function visibilityChanged() { refresh(); }
    function motionChanged(event) { reducedByOS = !!event.matches; refresh(); }
    function tapped() {
      if (!drawable() || frozen()) return;
      tapSince = now();
      if (frameId === null) refresh();
    }
    function alive() { if (destroyed) throw new Error('Jarvis energy core has been destroyed'); }
    function setState(next) {
      alive();
      var nextState = normaliseState(next);
      if (nextState === state) return;
      state = nextState;
      var nextMode = modeOf(nextState);
      if (nextMode !== mode) {
        mode = nextMode;
        modeSince = now();
        // Never carry a listening measurement into speech output or another mode.
        level = null;
        smoothLevel = 0;
      }
      canvas.setAttribute('data-energy-state', state);
      canvas.setAttribute('data-energy-mode', mode);
      refresh();
    }
    function setAudioLevel(value) {
      alive();
      if (mode !== 'listening' && mode !== 'speaking') throw new Error('Audio levels require a listening or speaking controller state');
      level = value === null ? null : clampAudioLevel(value);
      if (!reduced() && frameId === null) refresh();
    }
    function setActivities(records) {
      alive();
      jobs = normaliseActivities(records);
      // Stable ordering; do not mislabel a queued job as a running satellite.
      marks = jobs.filter(function (job) { return job.status === 'running'; }).concat(jobs.filter(function (job) { return job.status !== 'running'; })).slice(0, 6);
      refresh();
    }
    function getStats() {
      var elapsed = firstMeasuredFrame !== null && lastMeasuredFrame > firstMeasuredFrame ? lastMeasuredFrame - firstMeasuredFrame : 0;
      return Object.freeze({ state: state, mode: mode, destroyed: destroyed, visible: drawable(), reducedMotion: reduced(),
        targetFPS: reduced() ? 0 : targetFPS(state), frames: frames, rafCallbacks: callbacks,
        averageDrawMS: frames ? totalDrawMS / frames : null, maxDrawMS: frames ? maxDrawMS : null,
        overBudgetFrames: overBudgetFrames, sampleDurationMS: elapsed,
        sampledDrawFPS: elapsed > 0 ? (frames - 1) * 1000 / elapsed : null,
        backingPixels: size ? size.pixelWidth * size.pixelHeight : 0, dpr: size ? size.dpr : null,
        activities: jobs.length, visibleActivityMarks: marks.length, audioLevelKnown: level !== null,
        performanceEvidence: frames > 1 ? 'CANVAS_CPU_AND_DRAW_CADENCE_ONLY' : 'INSUFFICIENT_SAMPLE',
        deviceVerification: 'NOT_DEVICE_VERIFIED' });
    }
    function restore(attribute, value) { if (value === null) canvas.removeAttribute(attribute); else canvas.setAttribute(attribute, value); }
    function destroy() {
      if (destroyed) return;
      destroyed = true;
      stopFrame();
      if (resizeTimer !== null) { clearTimer(resizeTimer); resizeTimer = null; }
      if (resizeObserver) resizeObserver.disconnect();
      if (intersectionObserver) intersectionObserver.disconnect();
      canvas.removeEventListener('pointerdown', tapped);
      if (doc) doc.removeEventListener('visibilitychange', visibilityChanged);
      if (view.removeEventListener) view.removeEventListener('resize', queueResize);
      if (media && media.removeEventListener) media.removeEventListener('change', motionChanged);
      else if (media && media.removeListener) media.removeListener(motionChanged);
      restore('aria-hidden', oldAria);
      restore('data-energy-state', oldState);
      restore('data-energy-mode', oldMode);
      if (canvas.style) canvas.style.background = oldBackground;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      jobs = [];
      marks = [];
      gradients = null;
      mounts.delete(canvas);
    }
    if (doc) doc.addEventListener('visibilitychange', visibilityChanged);
    canvas.addEventListener('pointerdown', tapped, { passive: true });
    if (view.addEventListener) view.addEventListener('resize', queueResize, { passive: true });
    if (media && media.addEventListener) media.addEventListener('change', motionChanged);
    else if (media && media.addListener) media.addListener(motionChanged);
    if (Resize) { resizeObserver = new Resize(queueResize); resizeObserver.observe(canvas); }
    if (Intersect) {
      intersectionObserver = new Intersect(function (entries) {
        if (destroyed) return;
        for (var i = 0; i < entries.length; i += 1) if (entries[i].target === canvas) { visible = entries[i].isIntersecting; break; }
        refresh();
      }, { threshold: 0 });
      intersectionObserver.observe(canvas);
    }
    resize();
    var controller = Object.freeze({ setState: setState, setMode: setState, setAudioLevel: setAudioLevel,
      setActivities: setActivities, getStats: getStats, destroy: destroy });
    mounts.set(canvas, controller);
    return controller;
  }
  return Object.freeze({ version: '26.0.0', MODES: MODES, STATES: STATES, JOB_STATES: JOB_STATES,
    mount: mount, normaliseState: normaliseState, normaliseActivities: normaliseActivities,
    clampAudioLevel: clampAudioLevel, pixelBudget: pixelBudget, targetFPS: targetFPS, modeOf: modeOf });
});
