/* ORYVONA v1.8 — "Kara delik": the living heart of Argon and of the Stüdyo hero.
   One WebGL fragment shader paints the brand's black hole: a sky of stars bent by gravity, a thick accretion ring in
   white, lilac and violet that streams around the event horizon (inner edge faster), the logo's diagonal slash as a
   crackling jet that cuts the ring in two, a thin photon ring at the edge of the dark, matter spiralling in and the
   studio's active jobs in orbit. It follows Argon:
     idle      — slow, calm drift
     listening — matter falls in faster and waves run INTO the hole
     thinking  — the ring races and two hot arcs orbit the inner edge
     speaking  — gravitational waves ripple OUT with the voice; the photon ring pulses
   Every change glides instead of jumping (rotation, infall and waves are integrated on the CPU, so speed changes never
   make the texture jump). Layout comes from CSS custom properties on the canvas (--bh-x, --bh-y, --bh-r, --bh-dim,
   --bh-fade, --bh-stars, --bh-haze), so the same renderer is the sky behind the conversation and a small hero on the
   Stüdyo page (there a low haze and a wide edge fade let the picture melt into the page without a visible box).
   Budget rules: draws only while visible, 30 fps when calm and 60 fps when Argon is active, lowers its resolution on a
   slow phone, shows a still frame for reduced motion and when Argon is in the background. Without WebGL the brand mark
   is shown instead (data-energy-fallback). No network, no audio. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JarvisEnergyCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var mounts = new WeakMap();
  var MODES = Object.freeze(['idle', 'listening', 'thinking', 'speaking']);
  var STATES = Object.freeze(MODES.concat(['orchestrating', 'success', 'blocked', 'offline']));
  var JOB_STATES = Object.freeze(['queued', 'running', 'blocked', 'completed', 'failed', 'paused', 'cancelled']);
  // How each mode feels. spin: ring rotation (rad/s at radius 1), inflow: infall rate, wave: ripple amount and
  // direction (+ out, - in), lift: how much an active Argon brightens a dimmed background. fps 0 = settle, then still.
  var MOOD = Object.freeze({
    idle:      Object.freeze({ spin: 0.16, energy: 0.30, slash: 0.78, inflow: 0.55, think: 0, wave: 0, dir: 1, lift: 0, mono: 0, fps: 30 }),
    listening: Object.freeze({ spin: 0.24, energy: 0.62, slash: 0.88, inflow: 1.60, think: 0, wave: 0.55, dir: -1, lift: 0.30, mono: 0, fps: 60 }),
    thinking:  Object.freeze({ spin: 0.52, energy: 0.82, slash: 1.00, inflow: 0.95, think: 1, wave: 0, dir: 1, lift: 0.40, mono: 0, fps: 60 }),
    speaking:  Object.freeze({ spin: 0.28, energy: 0.72, slash: 0.94, inflow: 0.80, think: 0, wave: 1, dir: 1, lift: 0.40, mono: 0, fps: 60 }),
    blocked:   Object.freeze({ spin: 0.05, energy: 0.18, slash: 0.32, inflow: 0.20, think: 0, wave: 0, dir: 1, lift: 0, mono: 0.55, fps: 0 }),
    offline:   Object.freeze({ spin: 0.04, energy: 0.14, slash: 0.28, inflow: 0.15, think: 0, wave: 0, dir: 1, lift: 0, mono: 0.70, fps: 0 })
  });
  var MAX_JOBS = 8, MAX_SPARKS = 12;

  function normaliseState(state) {
    if (typeof state !== 'string' || STATES.indexOf(state) === -1) throw new TypeError('Unknown Jarvis energy state');
    return state;
  }
  function modeOf(state) { return state === 'orchestrating' ? 'thinking' : state === 'success' ? 'idle' : state; }
  function clampAudioLevel(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError('Audio level must be a finite number');
    return Math.max(0, Math.min(1, value));
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
  function targetFPS(state) { return MOOD[modeOf(normaliseState(state))].fps; }
  // Backing store: about 0.6 device pixels per CSS pixel on dense screens (the picture is soft light), never more
  // than ~460k pixels.
  function pixelBudget(width, height, ratio, quality) {
    var w = Number.isFinite(width) && width > 0 ? Math.min(width, 2400) : 300;
    var h = Number.isFinite(height) && height > 0 ? Math.min(height, 2400) : 300;
    var dpr = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
    var q = Number.isFinite(quality) ? quality : 1;
    var scale = Math.max(0.5, Math.min(1.5, dpr * 0.62)) * q;
    if (w * h * scale * scale > 460000) scale = Math.sqrt(460000 / (w * h));
    return { width: w, height: h, scale: scale, pixelWidth: Math.max(1, Math.round(w * scale)), pixelHeight: Math.max(1, Math.round(h * scale)) };
  }
  function parseLength(value, whole, fallback) {
    var text = String(value || '').trim();
    var m = /^(-?\d+(?:\.\d+)?)(%|px)?$/.exec(text);
    if (!m) return fallback;
    var n = parseFloat(m[1]);
    return m[2] === '%' ? n / 100 * whole : n;
  }
  function smooth(edge0, edge1, x) { var k = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0))); return k * k * (3 - 2 * k); }
  function fract(x) { return x - Math.floor(x); }
  // Fixed per-spark seeds (deterministic, so a still frame is always the same picture).
  var SPARK_SEEDS = (function () {
    var out = [], s = 0x9e3779b9;
    function rnd() { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }
    for (var i = 0; i < MAX_SPARKS; i += 1) out.push([rnd(), rnd(), rnd()]);
    return out;
  })();

  var VERTEX = 'attribute vec2 aPos;void main(){gl_Position=vec4(aPos,0.0,1.0);}';
  // Uniforms are packed into vec4s so even a GPU with the WebGL minimum of 16 uniform vectors can run it
  // (the spark and satellite counts shrink there).
  //   uGeo: centre x, centre y (backing pixels, y up), radius, edge fade   uA: time, rotation, energy, voice level
  //   uB: slash, thinking, wave amount, wave phase                        uC: mono, dim, stars, haze
  //   uSparks[i]: head x, head y (ring units), intensity, tail length     uJobs[i]: angle, orbit radius, status, on
  function fragmentSource(sparks, jobs) {
    return [
      '#ifdef GL_FRAGMENT_PRECISION_HIGH',
      'precision highp float;',
      '#else',
      'precision mediump float;',
      '#endif',
      'uniform vec2 uRes;uniform vec4 uGeo;uniform vec4 uA;uniform vec4 uB;uniform vec4 uC;',
      'uniform vec4 uSparks[' + sparks + '];uniform vec4 uJobs[' + jobs + '];',
      'float hash21(vec2 p){p=fract(p*vec2(234.34,435.345));p+=dot(p,p+34.23);return fract(p.x*p.y);}',
      'float vnoise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*(3.0-2.0*f);',
      '  return mix(mix(hash21(i),hash21(i+vec2(1.0,0.0)),u.x),mix(hash21(i+vec2(0.0,1.0)),hash21(i+vec2(1.0,1.0)),u.x),u.y);}',
      'float fbm(vec2 p){float s=0.0;float a=0.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);for(int i=0;i<4;i++){s+=a*vnoise(p);p=m*p;a*=0.5;}return s/0.9375;}',
      'float fbm2(vec2 p){float s=0.5*vnoise(p);p=mat2(1.6,1.2,-1.2,1.6)*p;s+=0.25*vnoise(p);return s/0.75;}',
      // Squares as x*x: GLSL pow(x,y) is undefined for x<0 and some phone GPUs return NaN (black specks) there.
      'float sq(float x){return x*x;}',
      // atan(0,0) is undefined too: the exact centre pixel gets a defined angle.
      'float angle(vec2 v){return atan(v.y,abs(v.x)+abs(v.y)<1e-6?1.0:v.x);}',
      // A comet on the ring: d>0 is behind the head (long tail), d<0 ahead of it (quick soft edge).
      'float arcGlow(float d){return d>=0.0?exp(-d*1.7):exp(-d*d*160.0);}',
      // One candidate star per cell, sized in real pixels, so lensing stretches the stars near the hole into arcs.
      'vec3 starLayer(vec2 px,float cell,float density,float size,float seed,float t){',
      '  vec2 g=px/cell;vec2 id=floor(g);vec2 f=fract(g);float h=hash21(id+seed);if(h>density)return vec3(0.0);',
      '  vec2 pos=vec2(hash21(id+seed+11.7),hash21(id+seed+37.1))*0.8+0.1;float d=length((f-pos)*cell);',
      '  float mag=hash21(id+seed+5.3);float tw=0.72+0.28*sin(t*(0.7+1.9*mag)+mag*50.0);',
      '  vec3 tint=mix(vec3(0.74,0.78,1.0),vec3(1.0,0.84,1.0),hash21(id+seed+2.9));',
      '  return tint*exp(-d*d/(size*size))*(0.30+1.35*mag*mag)*tw;}',
      'void main(){',
      '  vec2 frag=gl_FragCoord.xy;vec2 p=(frag-uGeo.xy)/uGeo.z;float r=length(p);float th=angle(p);',
      '  float t=uA.x;float energy=uA.z;float level=uA.w;vec3 col=vec3(0.0);',
      // Gravitational waves: out while Argon speaks, in while it listens (the phase carries the direction).
      '  float wv=uB.z*smoothstep(0.92,1.25,r)*exp(-max(r-1.15,0.0)*1.8);float ripple=sin((r-uB.w)*15.0);',
      // Lensing of the sky (point lens, Einstein radius 1.32 ring units); the waves make it shimmer.
      '  float E=1.32;vec2 q=p*(1.0-(E*E)/max(r*r,0.03))+p/max(r,0.001)*ripple*wv*0.018;vec2 qpx=q*uGeo.z;',
      '  float neb=fbm2(q*0.55+vec2(t*0.004,-t*0.003));',
      '  col+=mix(vec3(0.10,0.035,0.22),vec3(0.25,0.06,0.30),neb)*neb*neb*0.55*uC.w;',
      '  col+=(starLayer(qpx,11.0,0.20,0.72,1.0,t)+starLayer(qpx+77.0,29.0,0.34,1.10,9.0,t)*1.25)*uC.z;',
      // Bloom around the ring, a wide violet haze and the wave crests.
      '  col+=vec3(0.62,0.22,1.0)*exp(-max(r-1.0,0.0)*4.2)*smoothstep(0.66,0.98,r)*(0.20+0.14*energy+0.10*level);',
      '  col+=vec3(0.30,0.08,0.62)*exp(-max(r-1.0,0.0)*1.1)*0.075*uC.w;',
      '  col+=vec3(0.62,0.32,1.0)*pow(max(ripple,0.0),10.0)*wv*0.24;',
      // The accretion ring, cut by the slash like the logo: the upper-left half is thick and white-hot and pours into
      // the cut; the lower-right half is thinner, violet-blue, and keeps a dark gap from it. Fine filaments stream
      // around (two crossfaded layers keep the differential rotation from shearing forever).
      '  vec2 sd=vec2(0.6025,0.7981);vec2 sn=vec2(-sd.y,sd.x);float dn=dot(p,sn)-0.045;float side=dn>=0.0?1.0:-1.0;float cut=abs(dn);',
      '  vec2 pr=p-sd*side*0.018;float rr=length(pr);float tr=angle(pr);',
      '  float dop=0.5+0.5*cos(tr-2.40);float outerR=0.905+0.14*dop;float u=(rr-0.685)/(outerR-0.685);',
      '  vec3 HOT=vec3(3.2,2.75,3.2);',
      '  if(u>-0.1&&u<1.9){',
      '    float kep=1.0/pow(max(rr,0.6),1.5);float P=4.0;float r1=mod(uA.y,P);float r2=mod(uA.y+0.5*P,P);float wgt=abs(r1/P*2.0-1.0);',
      '    float a1=tr+r1*kep;float a2=tr+r2*kep;vec2 c1=vec2(cos(a1),sin(a1))*2.1;vec2 c2=vec2(cos(a2),sin(a2))*2.1;',
      '    vec2 k=vec2(rr*31.0,rr*23.0);',
      '    float n=mix(fbm(c1+k),fbm(c2+k+17.0),wgt);float ridge=1.0-abs(2.0*n-1.0);ridge=ridge*ridge*ridge;',
      '    float coarse=mix(fbm2(c1*0.6+rr*4.0+5.0),fbm2(c2*0.6+rr*4.0+29.0),wgt);',
      '    float band=smoothstep(0.0,0.05,u)*(1.0-smoothstep(0.70,1.04,u));float edge=exp(-sq(u/0.11));',
      '    float heat=clamp((1.0-u)*(0.30+0.52*dop)+0.50*ridge*(0.45+0.55*dop)+0.22*(coarse-0.5)+0.30*edge-0.04,0.0,1.0);',
      '    vec3 VIO=vec3(0.50,0.20,3.0);vec3 LIL=vec3(0.95,0.72,3.1);vec3 MAG=vec3(1.15,0.16,3.0);',
      '    vec3 rc=mix(mix(VIO,LIL,clamp(heat*2.0,0.0,1.0)),HOT,clamp(heat*2.0-1.0,0.0,1.0));',
      '    float bright=band*(0.30+0.70*(0.35+0.65*ridge)*(0.75+0.5*coarse))*mix(0.55,1.25,dop)*(0.85+0.35*energy+0.35*level);',
      '    float rim=exp(-sq((u-0.95)/0.09))*(0.55+0.45*coarse);float halo=exp(-max(u-0.95,0.0)*5.5)*smoothstep(0.55,0.95,u);',
      '    float gap=side>0.0?0.30+0.70*smoothstep(0.0,0.024,cut):smoothstep(0.03,0.072,cut);',
      '    vec3 ring=rc*bright+MAG*rim*(0.32+0.30*dop)+vec3(0.32,0.03,0.58)*halo*0.85;',
      '    if(side>0.0)ring+=vec3(1.6,1.0,3.0)*exp(-cut/0.03)*band*0.45;',
      // Thinking: two hot arcs race around the inner edge with the flow.
      '    if(uB.y>0.01){float hd=-t*2.3;float d1=mod(tr-hd+3.1415927,6.2831853)-3.1415927;float d2=mod(tr-hd,6.2831853)-3.1415927;',
      '      ring+=HOT*(arcGlow(d1)+arcGlow(d2))*exp(-sq((u-0.20)/0.17))*uB.y*0.6;}',
      '    col+=ring*gap;',
      '  }',
      '  col+=vec3(0.75,0.55,1.0)*uB.y*(0.5+0.5*sin(t*4.2))*exp(-sq((r-0.76)/0.09))*0.28;',
      // The event horizon swallows everything behind it.
      '  float horizon=smoothstep(0.655,0.688,r);col*=horizon;float alpha=1.0-horizon;',
      // Photon ring: thin and bright on the hot side; it answers the voice.
      '  float pr0=0.688+0.004*sin(th*3.0+t*0.9);float photon=exp(-sq((r-pr0)/0.0085));',
      '  float pulse=1.0+1.2*level+uB.y*0.45*(0.5+0.5*sin(t*6.0));',
      '  float pd=0.5+0.5*cos(th-2.4);col+=mix(vec3(0.55,0.42,1.6),vec3(1.25,1.12,1.3),pd)*photon*(0.70+0.40*pd)*pulse;',
      // The slash of the logo: a tapered blade of light with a wandering electric core, a second strand that splits
      // off and rejoins, sparks running along it, brightest where it crosses the ring.
      '  float s=dot(p,sd);float L=s>0.0?1.78:1.52;float env=clamp(1.0-sq(s/L),0.0,1.0);',
      '  if(env>0.0&&cut<0.6&&uB.x>0.01){',
      '    float wander=0.25+0.75*(1.0-env);',
      '    float j=(vnoise(vec2(s*5.0-t*0.9,3.1))-0.5)*0.034+(vnoise(vec2(s*14.0+t*2.3,7.7))-0.5)*0.016+(vnoise(vec2(s*41.0-t*5.9,1.3))-0.5)*0.007;',
      '    float dl=dn-j*wander;float dd=abs(dl);float w=0.0028+0.0080*env;float core=exp(-dd*dd/(w*w));',
      '    float split=smoothstep(0.50,0.80,vnoise(vec2(s*2.6-t*0.7,5.0)));float j2=(vnoise(vec2(s*8.0+t*1.6,11.0))-0.5)*0.07*split;',
      '    float strand=exp(-sq((dl-j2)/(w*0.6)))*split;',
      '    float glow=exp(-dd/(0.012+0.024*env));float wide=exp(-dd/0.10);',
      '    float xr=smoothstep(0.58,0.70,abs(s))*(1.0-smoothstep(0.96,1.12,abs(s)));',
      '    float spark=smoothstep(0.80,1.0,vnoise(vec2(s*36.0-t*9.0,floor(t*14.0))))*exp(-dd/0.018);',
      '    float flick=0.86+0.14*sin(t*17.0+s*9.0)*sin(t*7.3);',
      '    vec3 sc=vec3(3.1,2.9,3.2)*(core*1.2+strand*0.65)+vec3(1.0,0.42,3.1)*glow*(0.48+0.60*xr)+vec3(0.45,0.12,1.4)*wide*(0.22+0.55*xr)+vec3(2.2,1.6,3.1)*spark*0.8+HOT*exp(-dd/0.03)*xr*0.35;',
      '    col+=sc*uB.x*env*flick*(0.80+0.35*energy+0.25*level);',
      '  }',
      // Matter spiralling in (positions come from the CPU): a soft head with a short tail along its path.
      '  if(r<2.4){for(int i=0;i<' + sparks + ';i++){vec4 sp=uSparks[i];vec2 pa=p-sp.xy;if(sp.z<0.004||dot(pa,pa)>0.04)continue;',
      '    vec2 h=sp.xy;float hl=max(length(h),0.001);vec2 vel=normalize(vec2(h.y,-h.x)/hl*0.9-h/hl*0.45);',
      '    vec2 ba=-vel*sp.w;float hh=clamp(dot(pa,ba)/max(dot(ba,ba),0.00001),0.0,1.0);vec2 dv=pa-ba*hh;',
      '    col+=vec3(0.92,0.76,1.0)*exp(-dot(dv,dv)/0.00022)*(1.0-0.75*hh)*sp.z;}}',
      // Active jobs orbit the hole (running: lavender, completed: green, failed/blocked: red, waiting: grey).
      '  for(int j=0;j<' + jobs + ';j++){vec4 jb=uJobs[j];if(jb.w<0.5)continue;float a=jb.x-t*0.22/(jb.y*jb.y);',
      '    vec2 dv=p-jb.y*vec2(cos(a),sin(a)*0.92);float d2=dot(dv,dv);if(d2>0.25)continue;',
      '    vec3 c=jb.z<0.5?vec3(0.86,0.76,1.0):jb.z<1.5?vec3(0.55,1.0,0.78):jb.z<2.5?vec3(1.0,0.48,0.55):vec3(0.62,0.58,0.78);',
      '    col+=c*(exp(-d2/0.0009)*1.3+exp(-sqrt(d2)/0.07)*0.12);}',
      // Tone, mood, edge fade; premultiplied alpha so light adds over the page while the horizon stays black.
      '  float dim=uC.y;col=vec3(1.0)-exp(-col*mix(vec3(1.0),vec3(0.42,0.30,0.85),dim)*1.25*(1.0-0.55*dim));',
      '  float lum=dot(col,vec3(0.299,0.587,0.114));col=mix(col,vec3(lum)*vec3(0.85,0.80,1.0),uC.x);',
      '  col*=1.0-0.50*dim;float a2=clamp(max(alpha,max(col.r,max(col.g,col.b))*1.15),0.0,1.0);',
      '  if(uGeo.w>0.0){vec2 e=min(frag,uRes-frag);float ed=smoothstep(0.0,uGeo.w,min(e.x,e.y));col*=ed;a2*=ed;}',
      '  col=min(col+(hash21(frag+fract(t))-0.5)/255.0,vec3(a2));',
      '  gl_FragColor=vec4(max(col,0.0),a2);',
      '}'
    ].join('\n');
  }
  var FRAGMENT = fragmentSource(MAX_SPARKS, MAX_JOBS);

  function mount(canvas, options) {
    options = options || {};
    if (!canvas || typeof canvas.getContext !== 'function' || typeof canvas.getBoundingClientRect !== 'function') throw new TypeError('mount expects a canvas element');
    if (mounts.has(canvas)) throw new Error('Canvas already has a mounted Jarvis energy core');
    if (options.reducedMotion !== undefined && typeof options.reducedMotion !== 'boolean') throw new TypeError('reducedMotion must be boolean');
    var state = normaliseState(options.state === undefined ? options.mode === undefined ? 'idle' : options.mode : options.state);
    var mode = modeOf(state);
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
    var styleOf = runtime.getComputedStyle || view.getComputedStyle && view.getComputedStyle.bind(view);
    if (!raf || !caf || !timer || !clearTimer) throw new Error('Animation and timer APIs unavailable');
    var media = matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    var reducedByOS = !!(media && media.matches);
    var forcedReduced = options.reducedMotion === true;
    var destroyed = false, visible = true, frameId = null, resizeTimer = null, resizeObserver = null, intersectionObserver = null;
    var size = null, quality = 1, jobs = [], marks = [], level = null;
    var startedAt = now(), lastDraw = -Infinity, lastStep = null, settleUntil = 0;
    var frames = 0, totalDrawMS = 0, maxDrawMS = 0, slowStreak = 0, fastStreak = 0, intervalSum = 0, intervalCount = 0;
    var gl = null, program = null, buffer = null, loc = null, contextLost = false, fallback = false;
    var sparkCount = MAX_SPARKS, jobCount = MAX_JOBS;
    var oldAria = canvas.getAttribute('aria-hidden'), oldState = canvas.getAttribute('data-energy-state'), oldMode = canvas.getAttribute('data-energy-mode');
    // Eased values (current) and the values they move toward (target).
    var start = MOOD[mode];
    var cur = { spin: start.spin, energy: start.energy, slash: start.slash, inflow: start.inflow, think: start.think, wave: start.wave, lift: start.lift, mono: start.mono,
      level: 0, x: null, y: null, r: null, dim: 0, fade: 0, stars: 1, haze: 1 };
    var scene = { x: null, y: null, r: null, dim: 0, fade: 0, stars: 1, haze: 1 };
    // Integrated phases: speed changes alter how fast they advance, never where they are.
    var clock = 0, rotation = 0, infall = 0, wavePhase = 0;
    var jobData = new Float32Array(MAX_JOBS * 4), sparkData = new Float32Array(MAX_SPARKS * 4);
    canvas.setAttribute('aria-hidden', 'true');
    canvas.setAttribute('data-energy-state', state);
    canvas.setAttribute('data-energy-mode', mode);

    function reduced() { return forcedReduced || reducedByOS; }
    function drawable() { return !destroyed && !fallback && !contextLost && visible && !(doc && doc.hidden) && size && size.width > 2 && size.height > 2; }
    function stopFrame() { if (frameId !== null) { caf(frameId); frameId = null; } }
    function compile(type, source) {
      var shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { var info = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error('Shader: ' + String(info || '').slice(0, 200)); }
      return shader;
    }
    function setupGL() {
      var attributes = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'low-power' };
      gl = canvas.getContext('webgl', attributes) || canvas.getContext('experimental-webgl', attributes);
      if (!gl) throw new Error('WebGL unavailable');
      var limit = Number(gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS)) || 16;
      sparkCount = limit >= 64 ? MAX_SPARKS : 4; jobCount = limit >= 64 ? MAX_JOBS : 4;
      var vs = compile(gl.VERTEX_SHADER, VERTEX), fs = compile(gl.FRAGMENT_SHADER, fragmentSource(sparkCount, jobCount));
      program = gl.createProgram(); gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Shader link failed');
      gl.deleteShader(vs); gl.deleteShader(fs);
      gl.useProgram(program);
      buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);   // one full-screen triangle
      var aPos = gl.getAttribLocation(program, 'aPos'); gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      loc = {};
      ['uRes', 'uGeo', 'uA', 'uB', 'uC'].forEach(function (name) { loc[name] = gl.getUniformLocation(program, name); });
      loc.uSparks = gl.getUniformLocation(program, 'uSparks[0]');
      loc.uJobs = gl.getUniformLocation(program, 'uJobs[0]');
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
    }
    function useFallback() {
      fallback = true; stopFrame();
      canvas.setAttribute('data-energy-fallback', 'mark');
      if (canvas.parentNode && canvas.parentNode.setAttribute) canvas.parentNode.setAttribute('data-energy-fallback', 'mark');
    }
    // Where the hole sits and how big it is: read from CSS so each screen and mode can place it.
    function readScene() {
      if (!size) return;
      var cs = null; try { cs = styleOf ? styleOf(canvas) : null; } catch (_) { cs = null; }
      var get = function (name) { return cs && typeof cs.getPropertyValue === 'function' ? cs.getPropertyValue(name) : ''; };
      var w = size.width, h = size.height;
      scene.x = parseLength(get('--bh-x'), w, w * 0.5);
      scene.y = parseLength(get('--bh-y'), h, h * 0.45);
      scene.r = Math.max(12, parseLength(get('--bh-r'), Math.min(w, h), Math.min(w, h) * 0.28));
      var dim = parseFloat(get('--bh-dim')); scene.dim = Number.isFinite(dim) ? Math.max(0, Math.min(0.9, dim)) : 0;
      var fade = parseLength(get('--bh-fade'), Math.min(w, h), 0); scene.fade = Math.max(0, fade);
      var stars = parseFloat(get('--bh-stars')); scene.stars = Number.isFinite(stars) ? Math.max(0, Math.min(1.5, stars)) : 1;
      var haze = parseFloat(get('--bh-haze')); scene.haze = Number.isFinite(haze) ? Math.max(0, Math.min(1.5, haze)) : 1;
      if (cur.x === null) { cur.x = scene.x; cur.y = scene.y; cur.r = scene.r; cur.dim = scene.dim; cur.fade = scene.fade; cur.stars = scene.stars; cur.haze = scene.haze; }
    }
    function resize() {
      if (destroyed || fallback) return;
      var rect = canvas.getBoundingClientRect();
      var ratio = runtime.devicePixelRatio === undefined ? view.devicePixelRatio : runtime.devicePixelRatio;
      size = pixelBudget(rect.width, rect.height, ratio, quality);
      if (canvas.width !== size.pixelWidth) canvas.width = size.pixelWidth;
      if (canvas.height !== size.pixelHeight) canvas.height = size.pixelHeight;
      var oldX = cur.x;
      readScene();
      if (oldX !== null && rect.width > 0) { cur.x = scene.x; cur.y = scene.y; cur.r = scene.r; }   // a resize jumps, a mode change glides
      refresh();
    }
    function queueResize() {
      if (resizeTimer !== null) clearTimer(resizeTimer);
      resizeTimer = timer(function () { resizeTimer = null; resize(); }, 80);
    }
    function moodTarget() { return MOOD[mode] || MOOD.idle; }
    function ease(dt) {
      var m = moodTarget(), k = 1 - Math.exp(-dt / 0.35), ks = 1 - Math.exp(-dt / 0.65);
      cur.spin += (m.spin - cur.spin) * k; cur.energy += (m.energy - cur.energy) * k; cur.slash += (m.slash - cur.slash) * k;
      cur.inflow += (m.inflow - cur.inflow) * k; cur.think += (m.think - cur.think) * k; cur.mono += (m.mono - cur.mono) * k;
      cur.wave += (m.wave - cur.wave) * k; cur.lift += (m.lift - cur.lift) * k;
      var targetLevel = level;
      if (targetLevel === null) targetLevel = mode === 'speaking' && !reduced() ? 0.35 + 0.30 * Math.abs(Math.sin(clock * 5.7)) * (0.6 + 0.4 * Math.sin(clock * 1.9)) : 0;
      cur.level += (targetLevel - cur.level) * (1 - Math.exp(-dt / 0.12));
      if (scene.x !== null) {
        cur.x += (scene.x - cur.x) * ks; cur.y += (scene.y - cur.y) * ks; cur.r += (scene.r - cur.r) * ks;
        cur.dim += (scene.dim - cur.dim) * ks; cur.fade += (scene.fade - cur.fade) * ks; cur.stars += (scene.stars - cur.stars) * ks; cur.haze += (scene.haze - cur.haze) * ks;
      }
    }
    function advance(dt) {
      clock += dt * (0.55 + cur.spin * 2.4);
      rotation += dt * cur.spin;
      infall += dt * cur.inflow;
      wavePhase += dt * moodTarget().dir * (0.32 + 0.55 * cur.level);
    }
    function settled() {
      var m = moodTarget();
      return Math.abs(m.spin - cur.spin) < 0.01 && Math.abs(m.energy - cur.energy) < 0.01 && Math.abs(m.mono - cur.mono) < 0.01 &&
        Math.abs(m.slash - cur.slash) < 0.01 && Math.abs(m.wave - cur.wave) < 0.01 && Math.abs(m.lift - cur.lift) < 0.01 &&
        Math.abs((scene.y || 0) - (cur.y || 0)) < 0.5 && Math.abs((scene.r || 0) - (cur.r || 0)) < 0.5 && Math.abs(scene.dim - cur.dim) < 0.01;
    }
    function jobUniforms() {
      var data = new Float32Array(MAX_JOBS * 4);
      marks.slice(0, jobCount).forEach(function (job, i) {
        var code = job.status === 'running' ? 0 : job.status === 'completed' ? 1 : job.status === 'failed' || job.status === 'blocked' ? 2 : 3;
        data[i * 4] = i * 2.399963 + (job.id.length % 7) * 0.3;   // golden-angle spread, stable per job
        data[i * 4 + 1] = 1.55 + (i % 4) * 0.13;
        data[i * 4 + 2] = code;
        data[i * 4 + 3] = 1;
      });
      return data;
    }
    // Sparks fall from radius 2.1 to the ring along a clockwise spiral, faster as they get close.
    function sparkUniforms() {
      for (var i = 0; i < MAX_SPARKS; i += 1) {
        var o = i * 4, seed = SPARK_SEEDS[i];
        if (i >= sparkCount) { sparkData[o + 2] = 0; continue; }
        var life = fract(infall * (0.06 + 0.08 * seed[0]) + seed[1]);
        var radius = 2.1 + (0.70 - 2.1) * life * life;
        var angle = seed[2] * 6.2831853 - (2.1 - radius) * 2.0 - rotation * 0.9;
        sparkData[o] = radius * Math.cos(angle);
        sparkData[o + 1] = radius * Math.sin(angle);
        sparkData[o + 2] = smooth(0, 0.18, life) * (1 - smooth(0.82, 1, life)) * (0.55 + 0.7 * seed[0]) * (0.6 + 0.6 * cur.energy);
        sparkData[o + 3] = 0.02 + 0.10 * life;
      }
      return sparkData;
    }
    function render(timestamp) {
      if (!gl || !size) return;
      var started = now();
      var dt = lastStep === null ? 1 / 60 : Math.min(0.1, Math.max(0, (timestamp - lastStep) / 1000));
      lastStep = timestamp;
      if (reduced()) {
        ease(1);
        if (clock === 0) { clock = 11.0; rotation = 1.3; infall = 3.0; }   // a pleasant still moment
      } else {
        ease(dt);
        advance(dt);
      }
      var s = size.scale, H = size.pixelHeight;
      gl.viewport(0, 0, size.pixelWidth, H);
      gl.uniform2f(loc.uRes, size.pixelWidth, H);
      gl.uniform4f(loc.uGeo, cur.x * s, H - cur.y * s, cur.r * s, cur.fade * s);
      gl.uniform4f(loc.uA, clock % 3600, rotation % 3600, cur.energy, cur.level);
      gl.uniform4f(loc.uB, cur.slash, cur.think, cur.wave * (0.5 + 0.7 * cur.level), wavePhase % 3600);
      gl.uniform4f(loc.uC, cur.mono, cur.dim * (1 - cur.lift), cur.stars, cur.haze);
      gl.uniform4fv(loc.uSparks, sparkUniforms().subarray(0, sparkCount * 4));
      gl.uniform4fv(loc.uJobs, jobData.subarray(0, jobCount * 4));
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      var spent = now() - started;
      frames += 1; totalDrawMS += spent; if (spent > maxDrawMS) maxDrawMS = spent;
    }
    // A slow phone shows up as late frames: step the resolution down (and back up when there is room).
    function adapt(interval) {
      var budget = 1000 / Math.max(1, moodTarget().fps || 30);
      intervalSum += interval; intervalCount += 1;
      if (intervalCount < 20) return;
      var average = intervalSum / intervalCount; intervalSum = 0; intervalCount = 0;
      if (average > budget * 1.45) { slowStreak += 1; fastStreak = 0; } else if (average < budget * 1.12) { fastStreak += 1; slowStreak = 0; } else { slowStreak = 0; fastStreak = 0; }
      if (slowStreak >= 2 && quality > 0.55) { quality = Math.max(0.55, quality * 0.82); slowStreak = 0; resize(); }
      else if (fastStreak >= 6 && quality < 1) { quality = Math.min(1, quality * 1.12); fastStreak = 0; resize(); }
    }
    function frame(timestamp) {
      frameId = null;
      if (!drawable()) return;
      var fps = moodTarget().fps;
      var still = reduced() || (fps === 0 && timestamp > settleUntil && settled());
      var interval = 1000 / (fps || 30);
      var difference = timestamp - lastDraw;
      if (difference >= interval - 1.5) {
        if (lastDraw > 0 && difference < 1000) adapt(difference);
        render(timestamp);
        lastDraw = timestamp;
      }
      if (!still) frameId = raf(frame);
    }
    function refresh() {
      stopFrame();
      if (!drawable()) return;
      var timestamp = now();
      lastStep = null;
      render(timestamp);
      lastDraw = timestamp;
      settleUntil = timestamp + 1200;
      if (!reduced()) frameId = raf(frame);
    }
    function visibilityChanged() { refresh(); }
    function motionChanged(event) { reducedByOS = !!event.matches; refresh(); }
    function contextLostHandler(event) { if (event && event.preventDefault) event.preventDefault(); contextLost = true; stopFrame(); }
    function contextRestoredHandler() { contextLost = false; try { setupGL(); jobData = jobUniforms(); refresh(); } catch (_) { useFallback(); } }
    function alive() { if (destroyed) throw new Error('Jarvis energy core has been destroyed'); }
    function setState(next) {
      alive();
      var nextState = normaliseState(next);
      if (nextState === state) return;
      state = nextState;
      var nextMode = modeOf(nextState);
      if (nextMode !== mode) { mode = nextMode; level = null; }   // never carry a listening measurement into speech
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
      // Running jobs first; at most eight satellites, and a queued job is never shown as running.
      marks = jobs.filter(function (job) { return job.status === 'running'; }).concat(jobs.filter(function (job) { return job.status !== 'running'; })).slice(0, MAX_JOBS);
      jobData = jobUniforms();
      if (frameId === null) refresh();
    }
    function refreshScene() { alive(); readScene(); if (frameId === null) refresh(); }
    function getStats() {
      return Object.freeze({ state: state, mode: mode, destroyed: destroyed, renderer: fallback ? 'fallback-mark' : contextLost ? 'webgl-context-lost' : 'webgl',
        visible: drawable(), reducedMotion: reduced(), targetFPS: reduced() ? 0 : MOOD[mode].fps, frames: frames,
        averageDrawMS: frames ? totalDrawMS / frames : null, maxDrawMS: frames ? maxDrawMS : null, quality: quality,
        backingPixels: size ? size.pixelWidth * size.pixelHeight : 0, scale: size ? size.scale : null,
        scene: Object.freeze({ x: scene.x, y: scene.y, r: scene.r, dim: scene.dim }),
        activities: jobs.length, visibleActivityMarks: Math.min(marks.length, jobCount), audioLevelKnown: level !== null, uptimeMS: now() - startedAt });
    }
    function restore(attribute, value) { if (value === null) canvas.removeAttribute(attribute); else canvas.setAttribute(attribute, value); }
    function destroy() {
      if (destroyed) return;
      destroyed = true;
      stopFrame();
      if (resizeTimer !== null) { clearTimer(resizeTimer); resizeTimer = null; }
      if (resizeObserver) resizeObserver.disconnect();
      if (intersectionObserver) intersectionObserver.disconnect();
      if (doc) doc.removeEventListener('visibilitychange', visibilityChanged);
      if (view.removeEventListener) view.removeEventListener('resize', queueResize);
      if (media && media.removeEventListener) media.removeEventListener('change', motionChanged);
      else if (media && media.removeListener) media.removeListener(motionChanged);
      canvas.removeEventListener('webglcontextlost', contextLostHandler);
      canvas.removeEventListener('webglcontextrestored', contextRestoredHandler);
      if (gl && !contextLost) {
        try { gl.deleteBuffer(buffer); gl.deleteProgram(program); var lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); } catch (_) { /* already gone */ }
      }
      gl = null; program = null; buffer = null;
      restore('aria-hidden', oldAria); restore('data-energy-state', oldState); restore('data-energy-mode', oldMode);
      canvas.removeAttribute('data-energy-fallback');
      if (canvas.parentNode && canvas.parentNode.removeAttribute) canvas.parentNode.removeAttribute('data-energy-fallback');
      jobs = []; marks = [];
      mounts.delete(canvas);
    }
    try { setupGL(); } catch (_) { useFallback(); }
    if (doc) doc.addEventListener('visibilitychange', visibilityChanged);
    if (view.addEventListener) view.addEventListener('resize', queueResize, { passive: true });
    if (media && media.addEventListener) media.addEventListener('change', motionChanged);
    else if (media && media.addListener) media.addListener(motionChanged);
    canvas.addEventListener('webglcontextlost', contextLostHandler);
    canvas.addEventListener('webglcontextrestored', contextRestoredHandler);
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
    var controller = Object.freeze({ setState: setState, setMode: setState, setAudioLevel: setAudioLevel, setActivities: setActivities,
      refreshScene: refreshScene, getStats: getStats, destroy: destroy });
    mounts.set(canvas, controller);
    return controller;
  }
  return Object.freeze({ version: '27.0.0', MODES: MODES, STATES: STATES, JOB_STATES: JOB_STATES, mount: mount,
    normaliseState: normaliseState, normaliseActivities: normaliseActivities, clampAudioLevel: clampAudioLevel,
    pixelBudget: pixelBudget, targetFPS: targetFPS, modeOf: modeOf, FRAGMENT: FRAGMENT, fragmentSource: fragmentSource });
});
