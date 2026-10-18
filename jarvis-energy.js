/* ORYVONA v23 — decorative energy core. No network, microphone or audio startup. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JarvisEnergyCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var TAU = Math.PI * 2;
  var mounts = new WeakMap();
  var STATES = Object.freeze(['idle', 'listening', 'thinking', 'orchestrating', 'success', 'blocked', 'offline']);
  var JOB_STATES = Object.freeze(['queued', 'running', 'blocked', 'completed', 'failed', 'paused', 'cancelled']);
  var PALETTES = Object.freeze({
    idle: ['rgba(79,205,204,.12)', 'rgba(97,232,221,.45)', '#a4f7e9'],
    listening: ['rgba(79,225,212,.18)', 'rgba(111,247,221,.8)', '#d2fff2'],
    thinking: ['rgba(68,188,224,.16)', 'rgba(112,219,247,.72)', '#c1f4ff'],
    orchestrating: ['rgba(67,214,200,.18)', 'rgba(77,236,217,.8)', '#bcfff0'],
    success: ['rgba(77,213,157,.18)', 'rgba(127,245,181,.8)', '#e1ffed'],
    blocked: ['rgba(225,172,89,.13)', 'rgba(239,193,116,.7)', '#ffe4b6'],
    offline: ['rgba(148,170,179,.07)', 'rgba(148,170,179,.32)', '#a4b5bc']
  });

  function normaliseState(state) {
    if (typeof state !== 'string' || STATES.indexOf(state) === -1) throw new TypeError('Unknown Jarvis energy state');
    return state;
  }

  function clampAudioLevel(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError('Audio level must be a finite number');
    return Math.max(0, Math.min(1, value));
  }

  function pixelBudget(width, height, ratio) {
    var w = typeof width === 'number' && Number.isFinite(width) && width > 0 ? Math.max(1, Math.min(width, 512)) : 140;
    var h = typeof height === 'number' && Number.isFinite(height) && height > 0 ? Math.max(1, Math.min(height, 256)) : 88;
    var dpr = typeof ratio === 'number' && Number.isFinite(ratio) ? Math.min(1.75, Math.max(1, ratio)) : 1;
    return { width: w, height: h, dpr: dpr, pixelWidth: Math.round(w * dpr), pixelHeight: Math.round(h * dpr) };
  }

  function normaliseActivities(jobs) {
    if (!Array.isArray(jobs) || jobs.length > 1000) throw new TypeError('Activities must be an array of at most 1000 real job records');
    var seen = new Set();
    var accepted = [];
    for (var i = 0; i < jobs.length; i += 1) {
      var job = jobs[i];
      if (!job || typeof job !== 'object' || typeof job.id !== 'string' || !job.id.trim() || job.id.length > 160 ||
          JOB_STATES.indexOf(job.status) === -1 || seen.has(job.id)) throw new TypeError('Each activity requires a unique id and a known status');
      if (job.project !== undefined && (typeof job.project !== 'string' || job.project.length > 160)) throw new TypeError('Invalid activity project');
      seen.add(job.id);
      accepted.push(Object.freeze({ id: job.id, status: job.status, project: job.project || '' }));
    }
    return accepted;
  }

  function targetFPS(state) {
    if (state === 'offline') return 0;
    return state === 'thinking' || state === 'listening' || state === 'orchestrating' ? 60 : 24;
  }

  function mount(canvas, options) {
    options = options || {};
    if (!canvas || typeof canvas.getContext !== 'function' || typeof canvas.getBoundingClientRect !== 'function') throw new TypeError('mount expects a canvas element');
    if (mounts.has(canvas)) throw new Error('Canvas already has a mounted Jarvis energy core');
    var state = normaliseState(options.state === undefined ? 'idle' : options.state);
    if (options.reducedMotion !== undefined && typeof options.reducedMotion !== 'boolean') throw new TypeError('reducedMotion must be boolean');
    var context = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!context) throw new Error('Canvas2D unavailable');
    var doc = canvas.ownerDocument;
    var view = doc && doc.defaultView ? doc.defaultView : typeof globalThis !== 'undefined' ? globalThis : {};
    var runtime = options.runtime || {};
    var requestFrame = runtime.requestAnimationFrame || (view.requestAnimationFrame && view.requestAnimationFrame.bind(view));
    var cancelFrame = runtime.cancelAnimationFrame || (view.cancelAnimationFrame && view.cancelAnimationFrame.bind(view));
    var now = runtime.now || function () { return view.performance && view.performance.now ? view.performance.now() : Date.now(); };
    var timer = runtime.setTimeout || (view.setTimeout && view.setTimeout.bind(view));
    var clearTimer = runtime.clearTimeout || (view.clearTimeout && view.clearTimeout.bind(view));
    var Resize = runtime.ResizeObserver || view.ResizeObserver;
    var Intersect = runtime.IntersectionObserver || view.IntersectionObserver;
    var matchMedia = runtime.matchMedia || (view.matchMedia && view.matchMedia.bind(view));
    if (!requestFrame || !cancelFrame || !timer || !clearTimer) throw new Error('Animation and timer APIs unavailable');
    var media = matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    var prefersReducedMotion = !!(media && media.matches);
    var forcedReducedMotion = options.reducedMotion === true;
    var destroyed = false;
    var onScreen = true;
    var frameId = null;
    var resizeTimer = null;
    var resizeObserver = null;
    var intersectionObserver = null;
    var size = null;
    var gradient = null;
    var audioLevel = 0;
    var jobs = [];
    var visibleJobs = 0;
    var runningJobs = 0;
    var rippleStart = -10000;
    var lastRender = -Infinity;
    var startedAt = now();
    var firstMeasuredFrame = null;
    var lastMeasuredFrame = null;
    var frames = 0;
    var callbacks = 0;
    var totalDrawMS = 0;
    var maxDrawMS = 0;
    var overBudgetFrames = 0;
    var ringAngles = new Float32Array(8);
    for (var i = 0; i < 8; i += 1) ringAngles[i] = i * TAU / 8 - Math.PI / 2;
    var oldAriaHidden = canvas.getAttribute('aria-hidden');
    var oldState = canvas.getAttribute('data-energy-state');
    canvas.setAttribute('aria-hidden', 'true');
    // Keep the decorative canvas transparent even inside dark Android WebViews.
    if (canvas.style) canvas.style.background = 'transparent';
    canvas.setAttribute('data-energy-state', state);

    function reducedMotion() { return forcedReducedMotion || prefersReducedMotion; }
    function drawable() { return !destroyed && onScreen && !(doc && doc.hidden); }
    function cancel() {
      if (frameId !== null) { cancelFrame(frameId); frameId = null; }
    }

    function resize() {
      if (destroyed) return;
      var rect = canvas.getBoundingClientRect();
      var dpr = runtime.devicePixelRatio === undefined ? view.devicePixelRatio : runtime.devicePixelRatio;
      size = pixelBudget(rect.width, rect.height, dpr);
      canvas.width = size.pixelWidth;
      canvas.height = size.pixelHeight;
      // Cached once per resize, never allocated by the frame renderer.
      gradient = context.createRadialGradient(0, 0, 1, 0, 0, 18);
      gradient.addColorStop(0, 'rgba(171,255,237,.72)');
      gradient.addColorStop(.22, 'rgba(75,225,214,.32)');
      gradient.addColorStop(1, 'rgba(53,171,186,0)');
      refresh();
    }

    function queueResize() {
      if (resizeTimer !== null) clearTimer(resizeTimer);
      resizeTimer = timer(function () { resizeTimer = null; resize(); }, 90);
    }

    function ellipse(radius, squash, angle, from, to, color, width) {
      context.save();
      context.rotate(angle);
      context.scale(1, squash);
      context.beginPath();
      context.arc(0, 0, radius, from, to);
      context.strokeStyle = color;
      context.lineWidth = width;
      context.stroke();
      context.restore();
    }

    function render(timestamp) {
      if (!drawable() || !size) return;
      var measureStart = now();
      var frozen = reducedMotion() || state === 'offline';
      var elapsed = frozen ? 0 : Math.max(0, timestamp - startedAt) / 1000;
      var palette = PALETTES[state];
      var speed = state === 'thinking' ? .65 : state === 'orchestrating' ? .42 : .16;
      var pulse = frozen ? 1 : 1 + Math.sin(elapsed * 2.4) * .035;
      var response = state === 'listening' ? audioLevel * .22 : 0;
      var scale = Math.min(size.width / 140, size.height / 88);
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.setTransform(size.dpr * scale, 0, 0, size.dpr * scale, size.pixelWidth / 2, size.pixelHeight / 2);
      context.lineCap = 'round';
      ellipse(48, .57, -.12, 0, TAU, palette[0], .8);
      ellipse(39, .72, .23, 0, TAU, palette[0], .7);
      ellipse(48, .57, -.12, elapsed * speed, elapsed * speed + Math.PI * .76, palette[1], 1.1);
      ellipse(39, .72, .23, -elapsed * speed + Math.PI, -elapsed * speed + Math.PI * 1.65, palette[1], .9);
      context.save();
      context.scale(pulse + response, pulse + response);
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(0, 0, 18, 0, TAU);
      context.fill();
      ellipse(12, 1, 0, 0, TAU, palette[0], .85);
      ellipse(6.6, 1, 0, 0, TAU, palette[1], 1.1);
      context.beginPath();
      context.arc(0, 0, 2.1, 0, TAU);
      context.fillStyle = palette[2];
      context.fill();
      context.restore();
      // Only supplied job records create satellite marks. No decorative fake workers.
      for (var j = 0; j < visibleJobs; j += 1) {
        var angle = ringAngles[j] + elapsed * (j < runningJobs ? .22 : 0);
        context.beginPath();
        context.arc(Math.cos(angle) * 48, Math.sin(angle) * 27.4, j < runningJobs ? 2 : 1.4, 0, TAU);
        context.fillStyle = j < runningJobs ? palette[2] : palette[1];
        context.fill();
      }
      var rippleAge = timestamp - rippleStart;
      if (!frozen && rippleAge >= 0 && rippleAge < 420) {
        context.globalAlpha = (1 - rippleAge / 420) * .45;
        ellipse(14 + rippleAge * .06, .75, 0, 0, TAU, palette[1], .8);
        context.globalAlpha = 1;
      }
      var cost = Math.max(0, now() - measureStart);
      frames += 1;
      totalDrawMS += cost;
      if (cost > maxDrawMS) maxDrawMS = cost;
      if (cost > 16.67) overBudgetFrames += 1;
      if (firstMeasuredFrame === null) firstMeasuredFrame = timestamp;
      lastMeasuredFrame = timestamp;
    }

    function frame(timestamp) {
      frameId = null;
      if (!drawable() || reducedMotion() || targetFPS(state) === 0) return;
      callbacks += 1;
      var interval = 1000 / targetFPS(state);
      var delta = timestamp - lastRender;
      if (delta >= interval - .3) {
        render(timestamp);
        // Preserve fractional cadence on 60/90/120 Hz displays without catch-up loops.
        lastRender += Math.max(1, Math.floor((delta + .3) / interval)) * interval;
      }
      frameId = requestFrame(frame);
    }

    function refresh() {
      cancel();
      if (!drawable()) return;
      var timestamp = now();
      render(timestamp);
      lastRender = timestamp;
      if (!reducedMotion() && targetFPS(state) > 0) frameId = requestFrame(frame);
    }

    function visibilityChanged() { refresh(); }
    function motionChanged(event) { prefersReducedMotion = !!event.matches; refresh(); }
    function tapped() {
      if (!drawable() || reducedMotion() || state === 'offline') return;
      rippleStart = now();
      if (frameId === null) refresh();
    }

    function ensureAlive() { if (destroyed) throw new Error('Jarvis energy core has been destroyed'); }
    function setState(next) {
      ensureAlive();
      var nextState = normaliseState(next);
      if (state === nextState) return;
      state = nextState;
      if (state !== 'listening') audioLevel = 0;
      canvas.setAttribute('data-energy-state', state);
      refresh();
    }
    function setAudioLevel(level) {
      ensureAlive();
      var actualLevel = clampAudioLevel(level);
      if (state !== 'listening') throw new Error('Audio levels require an explicit listening controller state');
      audioLevel = actualLevel;
      if (reducedMotion()) return; // Motion reduction also disables audio-driven pulses.
      if (frameId === null) refresh();
    }
    function setActivities(activities) {
      ensureAlive();
      jobs = normaliseActivities(activities);
      runningJobs = 0;
      for (var j = 0; j < jobs.length; j += 1) if (jobs[j].status === 'running') runningJobs += 1;
      visibleJobs = Math.min(8, jobs.length);
      runningJobs = Math.min(visibleJobs, runningJobs);
      refresh();
    }
    function getStats() {
      var elapsed = firstMeasuredFrame !== null && lastMeasuredFrame > firstMeasuredFrame ? lastMeasuredFrame - firstMeasuredFrame : 0;
      return Object.freeze({
        state: state, destroyed: destroyed, visible: drawable(), reducedMotion: reducedMotion(),
        targetFPS: reducedMotion() ? 0 : targetFPS(state), frames: frames, rafCallbacks: callbacks,
        averageDrawMS: frames ? totalDrawMS / frames : null, maxDrawMS: frames ? maxDrawMS : null,
        overBudgetFrames: overBudgetFrames, sampleDurationMS: elapsed,
        sampledDrawFPS: elapsed > 0 ? (frames - 1) * 1000 / elapsed : null,
        backingPixels: size ? size.pixelWidth * size.pixelHeight : 0, dpr: size ? size.dpr : null,
        activities: jobs.length, visibleActivityMarks: visibleJobs,
        performanceEvidence: frames > 1 ? 'MEASURED_IN_CURRENT_RUNTIME' : 'INSUFFICIENT_SAMPLE',
        deviceVerification: 'NOT_DEVICE_VERIFIED'
      });
    }
    function destroy() {
      if (destroyed) return;
      destroyed = true;
      cancel();
      if (resizeTimer !== null) { clearTimer(resizeTimer); resizeTimer = null; }
      if (resizeObserver) resizeObserver.disconnect();
      if (intersectionObserver) intersectionObserver.disconnect();
      canvas.removeEventListener('pointerdown', tapped);
      if (doc) doc.removeEventListener('visibilitychange', visibilityChanged);
      if (view.removeEventListener) view.removeEventListener('resize', queueResize);
      if (media && media.removeEventListener) media.removeEventListener('change', motionChanged);
      else if (media && media.removeListener) media.removeListener(motionChanged);
      if (oldAriaHidden === null) canvas.removeAttribute('aria-hidden'); else canvas.setAttribute('aria-hidden', oldAriaHidden);
      if (oldState === null) canvas.removeAttribute('data-energy-state'); else canvas.setAttribute('data-energy-state', oldState);
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      jobs = [];
      gradient = null;
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
        for (var k = 0; k < entries.length; k += 1) {
          if (entries[k].target === canvas) { onScreen = entries[k].isIntersecting; break; }
        }
        refresh();
      }, { threshold: 0 });
      intersectionObserver.observe(canvas);
    }
    resize();
    var controller = Object.freeze({ setState: setState, setAudioLevel: setAudioLevel, setActivities: setActivities, getStats: getStats, destroy: destroy });
    mounts.set(canvas, controller);
    return controller;
  }

  return Object.freeze({ version: '23.0.0', STATES: STATES, JOB_STATES: JOB_STATES,
    mount: mount, normaliseState: normaliseState, normaliseActivities: normaliseActivities,
    clampAudioLevel: clampAudioLevel, pixelBudget: pixelBudget, targetFPS: targetFPS });
});
