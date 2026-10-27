/* ORYVONA Tema R — Tek paylaşımlı WebGL1 kara delik gökyüzü tuvali.
   Q temasındaki WebP arka plan resmini korur; döngüsüz ve yalnız 2 doku okumalı parça gölgelendiriciyle
   gaz diskini akıtır, foton halkasını Argon durumuna göre parlatır, 30 sn periyotla nefes alır ve
   açılışta deliğe yaklaşıp dalar. WebGL yoksa veya cihaz yavaşlarsa Q'daki sabit resme döner. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.OryvonaJarvisSky = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERSION = '1.0.0';
  var MAX_PIXELS = 250000;
  var DEFAULT_SCALE = 0.6;
  var LOW_SCALE = 0.45;
  var MAX_FPS = 30;
  var FRAME_INTERVAL_MS = 1000 / MAX_FPS;
  var SLOW_FRAME_MS = 45;
  var SLOW_WINDOW_MS = 2000;
  var TRANSITION_SEC = 0.6;
  var STORAGE_KEY = 'oryvona.sky.motion';

  var CONSTANTS = Object.freeze({
    AMP: 0.48,
    FALL: 1.65,
    RING_R: 1.12,
    RING_W: 0.09
  });

  var DISK_PROFILES = Object.freeze({
    portrait: Object.freeze({
      file: 'theme/kara-delik-dikey.webp',
      width: 1080,
      height: 2340,
      aspect: 0.4615,
      center: Object.freeze([0.4657, 0.7389]),
      shadowRadius: 0.0718,
      phi: 0.5635,
      tilt: Object.freeze([0.8454, 0.5341]),
      q: 0.6277,
      topAlign: true
    }),
    landscape: Object.freeze({
      file: 'theme/kara-delik-yatay.webp',
      width: 1920,
      height: 1080,
      aspect: 1.7778,
      center: Object.freeze([0.6948, 0.6861]),
      shadowRadius: 0.0796,
      phi: 0.5482,
      tilt: Object.freeze([0.8535, 0.5212]),
      q: 0.6206,
      topAlign: false
    })
  });

  var STATE_TARGETS = Object.freeze({
    idle: Object.freeze({ speed: 1.0, glow: 0.15 }),
    listening: Object.freeze({ speed: 1.4, glow: 0.5 }),
    thinking: Object.freeze({ speed: 2.4, glow: 0.6 }),
    waiting: Object.freeze({ speed: 2.4, glow: 0.6 }),
    starting: Object.freeze({ speed: 2.4, glow: 0.6 }),
    working: Object.freeze({ speed: 2.4, glow: 0.6 }),
    speaking: Object.freeze({ speed: 1.3, glow: 0.45 })
  });

  var VERTEX = [
    'attribute vec2 aPos;',
    'varying vec2 vUv;',
    'void main(){',
    '  vUv = aPos * 0.5 + 0.5;',
    '  gl_Position = vec4(aPos, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FRAGMENT = [
    'precision mediump float;',
    'uniform sampler2D uTex;',
    'uniform vec4 uCover;',
    'uniform vec4 uDisk;',
    'uniform vec2 uTilt;',
    'uniform float uAsp;',
    'uniform vec4 uM;',
    'varying vec2 vUv;',
    'const float AMP = 0.48, FALL = 1.65, RING_R = 1.12, RING_W = 0.09;',
    'vec2 toDisk(vec2 d){ d = vec2(uTilt.x*d.x + uTilt.y*d.y, -uTilt.y*d.x + uTilt.x*d.y); d.y /= uDisk.w; return d; }',
    'vec2 fromDisk(vec2 d){ d.y *= uDisk.w; return vec2(uTilt.x*d.x - uTilt.y*d.y, uTilt.y*d.x + uTilt.x*d.y); }',
    'vec2 turn(vec2 d, float a){ float c = cos(a), s = sin(a); return vec2(c*d.x - s*d.y, s*d.x + c*d.y); }',
    'void main(){',
    '  vec2 uv = vUv * uCover.xy + uCover.zw;',
    '  uv = uDisk.xy + (uv - uDisk.xy) / uM.z;',
    '  vec2 d = toDisk((uv - uDisk.xy) * vec2(uAsp, 1.0));',
    '  float r = length(d) / uDisk.z;',
    '  float amp = AMP * smoothstep(1.0, 1.3, r) * exp(-(r - 1.3) * FALL);',
    '  float p1 = fract(uM.x), p2 = fract(uM.x + 0.5);',
    '  vec3 c1 = texture2D(uTex, uDisk.xy + fromDisk(turn(d, -amp * (p1 - 0.5))) / vec2(uAsp, 1.0)).rgb;',
    '  vec3 c2 = texture2D(uTex, uDisk.xy + fromDisk(turn(d, -amp * (p2 - 0.5))) / vec2(uAsp, 1.0)).rgb;',
    '  vec3 col = mix(c1, c2, abs(2.0 * p1 - 1.0));',
    '  col += vec3(0.85, 0.72, 1.0) * exp(-pow((r - RING_R) / RING_W, 2.0)) * uM.y * 0.35;',
    '  gl_FragColor = vec4(col * uM.w, 1.0);',
    '}'
  ].join('\n');

  function stateTarget(mode) {
    var key = String(mode || 'idle').toLowerCase();
    return STATE_TARGETS[key] || STATE_TARGETS.idle;
  }

  function pixelBudget(cssWidth, cssHeight, scaleFactor) {
    var w = Math.max(1, Number(cssWidth) || 390);
    var h = Math.max(1, Number(cssHeight) || 844);
    var desired = Number(scaleFactor) > 0 ? Number(scaleFactor) : DEFAULT_SCALE;
    var maxScale = Math.sqrt(MAX_PIXELS / (w * h));
    var scale = Math.min(desired, maxScale);
    var pw = Math.max(1, Math.floor(w * scale));
    var ph = Math.max(1, Math.floor(h * scale));
    while (pw * ph > MAX_PIXELS && (pw > 1 || ph > 1)) {
      if (pw >= ph && pw > 1) pw--;
      else if (ph > 1) ph--;
    }
    return {
      scale: scale,
      pixelWidth: pw,
      pixelHeight: ph,
      backingPixels: pw * ph
    };
  }

  function computeCover(canvasWidth, canvasHeight, texWidth, texHeight, topAlign) {
    var cw = Math.max(1, Number(canvasWidth) || 1);
    var ch = Math.max(1, Number(canvasHeight) || 1);
    var tw = Math.max(1, Number(texWidth) || 1);
    var th = Math.max(1, Number(texHeight) || 1);
    var sAsp = cw / ch;
    var tAsp = tw / th;
    var sx = 1.0, sy = 1.0, ox = 0.0, oy = 0.0;
    if (sAsp > tAsp) {
      sy = tAsp / sAsp;
      oy = topAlign ? (1.0 - sy) : (1.0 - sy) * 0.5;
    } else {
      sx = sAsp / tAsp;
      ox = (1.0 - sx) * 0.5;
    }
    return [sx, sy, ox, oy];
  }

  function introCurve(sec) {
    var s = Math.max(0, Number(sec) || 0);
    if (s <= 1.3) {
      var u = s / 1.3;
      var decel = 1 - Math.pow(1 - u, 2.4);
      var zoom = 1.6 - 0.6 * decel;
      var brightness = Math.min(1, s / 0.42);
      return { zoom: zoom, brightness: brightness, diving: false, done: false };
    }
    if (s <= 1.75) {
      var d = Math.min(1, (s - 1.3) / 0.45);
      var k = d * d;
      return {
        zoom: 1.0 + 2.0 * k,
        brightness: Math.max(0, 1.0 - Math.pow(d, 1.25)),
        diving: true,
        done: false
      };
    }
    return { zoom: 3.0, brightness: 0.0, diving: true, done: true };
  }

  function readMotionPref(storage) {
    if (!storage || typeof storage.getItem !== 'function') return true;
    try {
      var v = storage.getItem(STORAGE_KEY);
      if (v === '0' || v === 'false' || v === 'off') return false;
      return true;
    } catch (_) {
      return true;
    }
  }

  function writeMotionPref(storage, enabled) {
    if (!storage || typeof storage.setItem !== 'function') return;
    try {
      storage.setItem(STORAGE_KEY, enabled ? '1' : '0');
    } catch (_) {}
  }

  function mount(canvas, options) {
    options = options || {};
    if (!canvas || typeof canvas.getContext !== 'function') {
      throw new Error('Geçerli bir canvas öğesi gerekli.');
    }
    var doc = canvas.ownerDocument || (typeof document !== 'undefined' ? document : null);
    var win = options.runtime || (doc && doc.defaultView) || (typeof window !== 'undefined' ? window : globalThis);
    var storage = options.storage || (win && win.localStorage) || null;
    var nowFn = typeof win.now === 'function' ? function () { return win.now(); } :
      (win.performance && typeof win.performance.now === 'function' ? function () { return win.performance.now(); } : Date.now);
    var raf = typeof win.requestAnimationFrame === 'function' ? function (fn) { return win.requestAnimationFrame(fn); } : null;
    var caf = typeof win.cancelAnimationFrame === 'function' ? function (id) { return win.cancelAnimationFrame(id); } : function () {};

    var reducedMotion = options.reducedMotion !== undefined ? Boolean(options.reducedMotion) :
      Boolean(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var motionEnabled = options.motionEnabled !== undefined ? Boolean(options.motionEnabled) : readMotionPref(storage);

    var gl = null;
    try {
      gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false }) ||
           canvas.getContext('experimental-webgl', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
    } catch (_) {
      gl = null;
    }

    function markStaticFallback(reason) {
      if (typeof canvas.setAttribute === 'function') {
        canvas.setAttribute('data-sky-fallback', reason || 'static');
      }
      if (canvas.parentNode && typeof canvas.parentNode.setAttribute === 'function') {
        canvas.parentNode.setAttribute('data-sky-fallback', reason || 'static');
      }
      if (doc && doc.documentElement && typeof doc.documentElement.removeAttribute === 'function') {
        doc.documentElement.removeAttribute('data-sky-active');
      }
      canvas.hidden = true;
    }

    function clearFallbackMark() {
      if (typeof canvas.removeAttribute === 'function') {
        canvas.removeAttribute('data-sky-fallback');
      }
      if (canvas.parentNode && typeof canvas.parentNode.removeAttribute === 'function') {
        canvas.parentNode.removeAttribute('data-sky-fallback');
      }
      if (doc && doc.documentElement && typeof doc.documentElement.setAttribute === 'function') {
        doc.documentElement.setAttribute('data-sky-active', 'true');
      }
      canvas.hidden = false;
    }

    if (!gl) {
      markStaticFallback('no-webgl');
      return {
        getStats: function () {
          return {
            renderer: 'static-css',
            quality: 'static-fallback',
            scaleFactor: 0,
            scale: 0,
            backingPixels: 0,
            targetFPS: 0,
            phase: 0,
            speed: 1,
            glow: 0.15,
            mode: 'idle',
            motionEnabled: motionEnabled,
            reducedMotion: reducedMotion,
            draws: 0
          };
        },
        setMode: function () {},
        setMotionEnabled: function (flag) {
          motionEnabled = Boolean(flag);
          writeMotionPref(storage, motionEnabled);
        },
        isMotionEnabled: function () { return motionEnabled; },
        setIntroTime: function () {},
        resize: function () {},
        destroy: function () { clearFallbackMark(); }
      };
    }

    function compile(type, src) {
      var s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        gl.deleteShader(s);
        return null;
      }
      return s;
    }

    var vs = compile(gl.VERTEX_SHADER, VERTEX);
    var fs = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    var prog = (vs && fs) ? gl.createProgram() : null;
    var linked = false;
    if (prog) {
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      linked = Boolean(gl.getProgramParameter(prog, gl.LINK_STATUS));
    }
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);

    if (!prog || !linked) {
      if (prog) gl.deleteProgram(prog);
      markStaticFallback('shader-error');
      return {
        getStats: function () {
          return { renderer: 'static-css', quality: 'static-fallback', scaleFactor: 0, scale: 0, backingPixels: 0, targetFPS: 0, draws: 0 };
        },
        setMode: function () {},
        setMotionEnabled: function () {},
        isMotionEnabled: function () { return motionEnabled; },
        setIntroTime: function () {},
        resize: function () {},
        destroy: function () { clearFallbackMark(); }
      };
    }

    gl.useProgram(prog);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    var uTexLoc = gl.getUniformLocation(prog, 'uTex');
    var uCoverLoc = gl.getUniformLocation(prog, 'uCover');
    var uDiskLoc = gl.getUniformLocation(prog, 'uDisk');
    var uTiltLoc = gl.getUniformLocation(prog, 'uTilt');
    var uAspLoc = gl.getUniformLocation(prog, 'uAsp');
    var uMLoc = gl.getUniformLocation(prog, 'uM');

    var tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (gl.pixelStorei && gl.UNPACK_FLIP_Y_WEBGL !== undefined) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (gl.texImage2D && gl.RGBA && gl.UNSIGNED_BYTE) {
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([7, 4, 13, 255]));
      } catch (_) {}
    }
    if (uTexLoc !== null && gl.uniform1i) {
      gl.uniform1i(uTexLoc, 0);
    }

    var destroyed = false;
    var quality = 'normal';
    var scaleFactor = DEFAULT_SCALE;
    var currentScale = DEFAULT_SCALE;
    var cssWidth = 390, cssHeight = 844;
    var mode = String(options.mode || options.state || 'idle').toLowerCase();
    var initialTarget = stateTarget(mode);
    var speed = initialTarget.speed;
    var glow = initialTarget.glow;
    var fromSpeed = speed, fromGlow = glow;
    var toSpeed = speed, toGlow = glow;
    var transitionElapsed = TRANSITION_SEC;
    var phase = 0;
    var totalSec = 0;
    var speakClock = 0;
    var introSec = options.introTime !== undefined && options.introTime !== null ? Number(options.introTime) : null;
    var rafId = 0;
    var lastDrawAt = null;
    var windowSumMs = 0;
    var windowFrames = 0;
    var draws = 0;
    var loadedOrientation = null;

    function isHidden() {
      return Boolean(doc && doc.hidden);
    }

    function currentProfile() {
      return cssWidth > cssHeight ? DISK_PROFILES.landscape : DISK_PROFILES.portrait;
    }

    function loadOrientationTexture() {
      if (destroyed) return;
      var orient = cssWidth > cssHeight ? 'landscape' : 'portrait';
      if (loadedOrientation === orient) return;
      loadedOrientation = orient;
      var prof = DISK_PROFILES[orient];
      var ImageCtor = win.Image || (typeof Image !== 'undefined' ? Image : null);
      if (typeof ImageCtor !== 'function') return;
      var img = new ImageCtor();
      img.decoding = 'async';
      img.onload = function () {
        if (destroyed || loadedOrientation !== orient) return;
        try {
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          if (gl.pixelStorei && gl.UNPACK_FLIP_Y_WEBGL !== undefined) {
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
          }
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
          drawFrame();
        } catch (_) {}
      };
      img.src = prof.file;
    }

    function updateSize() {
      var rect = typeof canvas.getBoundingClientRect === 'function' ? canvas.getBoundingClientRect() : null;
      cssWidth = Math.max(1, Math.round((rect && rect.width) || win.innerWidth || 390));
      cssHeight = Math.max(1, Math.round((rect && rect.height) || win.innerHeight || 844));
      var b = pixelBudget(cssWidth, cssHeight, scaleFactor);
      currentScale = b.scale;
      if (canvas.width !== b.pixelWidth || canvas.height !== b.pixelHeight) {
        canvas.width = b.pixelWidth;
        canvas.height = b.pixelHeight;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      loadOrientationTexture();
    }

    function drawFrame() {
      if (destroyed || quality === 'static-fallback' || !motionEnabled) return;
      var prof = currentProfile();
      var cover = computeCover(cssWidth, cssHeight, prof.width, prof.height, prof.topAlign);
      gl.uniform4f(uCoverLoc, cover[0], cover[1], cover[2], cover[3]);
      gl.uniform4f(uDiskLoc, prof.center[0], prof.center[1], prof.shadowRadius, prof.q);
      gl.uniform2f(uTiltLoc, prof.tilt[0], prof.tilt[1]);
      if (gl.uniform1f) gl.uniform1f(uAspLoc, prof.aspect);

      var zoom = 1.0;
      var brightness = 1.0;
      var glowOut = glow;
      if (reducedMotion) {
        zoom = 1.0;
        brightness = 1.0;
      } else if (introSec !== null && introSec >= 0) {
        var ic = introCurve(introSec);
        zoom = ic.zoom;
        brightness = ic.brightness;
      } else {
        zoom = 1.0 + 0.012 * Math.sin((2 * Math.PI * totalSec) / 30.0);
        if (mode === 'speaking') {
          glowOut = Math.max(0, Math.min(1, glow + 0.08 * Math.sin((2 * Math.PI * speakClock) / 0.8)));
        }
      }

      gl.uniform4f(uMLoc, phase, glowOut, zoom, brightness);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      draws++;
    }

    function stopLoop() {
      if (rafId) {
        caf(rafId);
        rafId = 0;
      }
      lastDrawAt = null;
    }

    function canAnimate() {
      return !destroyed && motionEnabled && !reducedMotion && quality !== 'static-fallback' && !isHidden() && Boolean(raf);
    }

    function stepPhysics(dtMs) {
      var clampedMs = Math.max(0, Math.min(250, dtMs));
      var dt = clampedMs / 1000;
      totalSec += dt;
      if (transitionElapsed < TRANSITION_SEC) {
        transitionElapsed = Math.min(TRANSITION_SEC, transitionElapsed + dt);
        var u = transitionElapsed / TRANSITION_SEC;
        var smooth = u * u * (3 - 2 * u);
        speed = fromSpeed + (toSpeed - fromSpeed) * smooth;
        glow = fromGlow + (toGlow - fromGlow) * smooth;
      } else {
        speed = toSpeed;
        glow = toGlow;
      }
      if (mode === 'speaking') {
        speakClock += dt;
      } else {
        speakClock = 0;
      }
      phase += (dt * speed) / 6.0;
      if (introSec !== null) {
        introSec += dt;
        if (introSec > 1.8) {
          introSec = null;
        }
      }
    }

    function recordFrameCost(dtMs) {
      if (dtMs <= 0 || dtMs > 500) return false;
      windowSumMs += dtMs;
      windowFrames += 1;
      if (windowSumMs >= SLOW_WINDOW_MS && windowFrames > 0) {
        var avg = windowSumMs / windowFrames;
        windowSumMs = 0;
        windowFrames = 0;
        if (avg > SLOW_FRAME_MS) {
          if (quality === 'normal') {
            quality = 'low-res';
            scaleFactor = LOW_SCALE;
            updateSize();
            return false;
          }
          quality = 'static-fallback';
          stopLoop();
          markStaticFallback('slow-device');
          return true;
        }
      }
      return false;
    }

    function onFrame(timestamp) {
      rafId = 0;
      if (!canAnimate()) return;
      var t = Number(timestamp !== undefined ? timestamp : nowFn());
      if (lastDrawAt === null) {
        lastDrawAt = t;
        drawFrame();
        scheduleNext();
        return;
      }
      var sinceDraw = t - lastDrawAt;
      if (sinceDraw + 0.5 >= FRAME_INTERVAL_MS) {
        lastDrawAt = t;
        if (recordFrameCost(sinceDraw)) return;
        stepPhysics(sinceDraw);
        drawFrame();
      }
      scheduleNext();
    }

    function scheduleNext() {
      if (!rafId && canAnimate()) {
        rafId = raf(onFrame);
      }
    }

    function applyState() {
      if (destroyed) return;
      if (!motionEnabled || quality === 'static-fallback') {
        stopLoop();
        markStaticFallback(!motionEnabled ? 'motion-off' : 'slow-device');
        return;
      }
      clearFallbackMark();
      updateSize();
      if (reducedMotion) {
        stopLoop();
        drawFrame();
        return;
      }
      if (isHidden()) {
        stopLoop();
        return;
      }
      if (draws === 0 || lastDrawAt === null) {
        lastDrawAt = nowFn();
        drawFrame();
      }
      scheduleNext();
    }

    function onVisibility() {
      if (isHidden()) {
        stopLoop();
      } else {
        windowSumMs = 0;
        windowFrames = 0;
        applyState();
      }
    }

    function onResize() {
      if (destroyed || !motionEnabled || quality === 'static-fallback') return;
      updateSize();
      drawFrame();
    }

    if (doc && typeof doc.addEventListener === 'function') {
      doc.addEventListener('visibilitychange', onVisibility);
    }
    if (win && typeof win.addEventListener === 'function') {
      win.addEventListener('resize', onResize);
    }

    applyState();

    return {
      getStats: function () {
        return {
          renderer: quality === 'static-fallback' || !motionEnabled ? 'static-css' : 'webgl',
          quality: quality,
          scaleFactor: scaleFactor,
          scale: currentScale,
          pixelWidth: canvas.width,
          pixelHeight: canvas.height,
          backingPixels: canvas.width * canvas.height,
          targetFPS: canAnimate() ? MAX_FPS : 0,
          phase: phase,
          speed: speed,
          glow: glow,
          mode: mode,
          motionEnabled: motionEnabled,
          reducedMotion: reducedMotion,
          visible: !isHidden(),
          draws: draws
        };
      },
      setMode: function (nextMode) {
        var normalized = String(nextMode || 'idle').toLowerCase();
        var next = stateTarget(normalized);
        mode = normalized in STATE_TARGETS ? normalized : 'idle';
        fromSpeed = speed;
        fromGlow = glow;
        toSpeed = next.speed;
        toGlow = next.glow;
        transitionElapsed = 0;
      },
      setMotionEnabled: function (flag) {
        motionEnabled = Boolean(flag);
        writeMotionPref(storage, motionEnabled);
        windowSumMs = 0;
        windowFrames = 0;
        applyState();
      },
      isMotionEnabled: function () {
        return motionEnabled;
      },
      setIntroTime: function (sec) {
        introSec = sec === null || sec === undefined ? null : Math.max(0, Number(sec) || 0);
        if (!reducedMotion && motionEnabled && quality !== 'static-fallback' && !isHidden()) {
          drawFrame();
          scheduleNext();
        }
      },
      resize: onResize,
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        stopLoop();
        if (doc && typeof doc.removeEventListener === 'function') {
          doc.removeEventListener('visibilitychange', onVisibility);
        }
        if (win && typeof win.removeEventListener === 'function') {
          win.removeEventListener('resize', onResize);
        }
        try {
          if (tex && gl.deleteTexture) gl.deleteTexture(tex);
          if (buf && gl.deleteBuffer) gl.deleteBuffer(buf);
          if (prog && gl.deleteProgram) gl.deleteProgram(prog);
          var ext = gl.getExtension && gl.getExtension('WEBGL_lose_context');
          if (ext && typeof ext.loseContext === 'function') ext.loseContext();
        } catch (_) {}
        if (typeof canvas.removeAttribute === 'function') canvas.removeAttribute('data-sky-fallback');
        if (canvas.parentNode && typeof canvas.parentNode.removeAttribute === 'function') canvas.parentNode.removeAttribute('data-sky-fallback');
        if (doc && doc.documentElement && typeof doc.documentElement.removeAttribute === 'function') doc.documentElement.removeAttribute('data-sky-active');
        canvas.hidden = false;
      }
    };
  }

  var sharedInstance = null;
  var sharedCanvas = null;

  function ensure(options) {
    if (sharedInstance) {
      if (options && options.introTime !== undefined && typeof sharedInstance.setIntroTime === 'function') {
        sharedInstance.setIntroTime(options.introTime);
      }
      return sharedInstance;
    }
    if (typeof document === 'undefined' || !document.body) return null;
    var existing = document.getElementById('ovSkyCanvas');
    if (!existing) {
      existing = document.createElement('canvas');
      existing.id = 'ovSkyCanvas';
      existing.className = 'ov-sky-canvas';
      existing.setAttribute('aria-hidden', 'true');
      document.body.insertBefore(existing, document.body.firstChild);
    }
    sharedCanvas = existing;
    sharedInstance = mount(existing, options || {});
    return sharedInstance;
  }

  function setModeGlobal(mode) {
    var inst = sharedInstance || ensure();
    if (inst && typeof inst.setMode === 'function') inst.setMode(mode);
  }

  function setMotionEnabledGlobal(enabled) {
    var store = typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
    writeMotionPref(store, Boolean(enabled));
    var inst = sharedInstance || ensure();
    if (inst && typeof inst.setMotionEnabled === 'function') inst.setMotionEnabled(Boolean(enabled));
  }

  function isMotionEnabledGlobal() {
    if (sharedInstance && typeof sharedInstance.isMotionEnabled === 'function') return sharedInstance.isMotionEnabled();
    var store = typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
    return readMotionPref(store);
  }

  return Object.freeze({
    version: VERSION,
    MAX_PIXELS: MAX_PIXELS,
    DEFAULT_SCALE: DEFAULT_SCALE,
    LOW_SCALE: LOW_SCALE,
    MAX_FPS: MAX_FPS,
    SLOW_FRAME_MS: SLOW_FRAME_MS,
    SLOW_WINDOW_MS: SLOW_WINDOW_MS,
    STORAGE_KEY: STORAGE_KEY,
    CONSTANTS: CONSTANTS,
    DISK_PROFILES: DISK_PROFILES,
    STATE_TARGETS: STATE_TARGETS,
    VERTEX: VERTEX,
    FRAGMENT: FRAGMENT,
    stateTarget: stateTarget,
    pixelBudget: pixelBudget,
    computeCover: computeCover,
    introCurve: introCurve,
    mount: mount,
    ensure: ensure,
    setMode: setModeGlobal,
    setMotionEnabled: setMotionEnabledGlobal,
    isMotionEnabled: isMotionEnabledGlobal,
    getShared: function () { return sharedInstance; },
    getSharedCanvas: function () { return sharedCanvas; }
  });
});
