/* ORYVONA v1.9 — "Kara delik": the living heart of Argon, the sky behind the Stüdyo and the opening flight.
   A real-time ray tracer: every pixel's light ray is bent by the hole's gravity (Schwarzschild geodesic, horizon = 1),
   so the far side of the accretion disk rises over the shadow as an arc, a thin photon ring hugs the dark and the
   stars behind are lensed. The disk is a cloud of lilac, violet and white gas that orbits faster near the hole (inner
   edge faster), curdled into strands and dark dust lanes, with a soft haze above and below and the approaching side
   brighter. It follows Argon:
     idle      — slow, calm drift
     listening — matter falls in faster and waves run INTO the hole
     thinking  — the gas races and two hot arcs orbit the inner edge
     speaking  — gravitational waves ripple OUT with the voice; the photon ring pulses
   Every change glides instead of jumping (rotation, infall and waves are integrated on the CPU). Layout comes from CSS
   custom properties on the canvas: --bh-x, --bh-y (where the hole sits), --bh-r (scale), --bh-tilt (screen roll, deg),
   --bh-incl (0 = seen from above, 88 = edge-on), --bh-dist (camera distance), --bh-dim, --bh-fade, --bh-stars, --bh-haze.
   setCamera() lets a script fly the camera (the opening title).
   Budget rules: draws only while visible and not behind the opening title, 30 fps, at most ~300k pixels, lowers its
   resolution further on a slow phone, a still frame for reduced motion and when Argon is in the background. Without
   WebGL the brand mark is shown instead (data-energy-fallback). No network, no audio. */
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
    listening: Object.freeze({ spin: 0.24, energy: 0.62, slash: 0.88, inflow: 1.60, think: 0, wave: 0.55, dir: -1, lift: 0.30, mono: 0, fps: 30 }),
    thinking:  Object.freeze({ spin: 0.52, energy: 0.82, slash: 1.00, inflow: 0.95, think: 1, wave: 0, dir: 1, lift: 0.40, mono: 0, fps: 30 }),
    speaking:  Object.freeze({ spin: 0.28, energy: 0.72, slash: 0.94, inflow: 0.80, think: 0, wave: 1, dir: 1, lift: 0.40, mono: 0, fps: 30 }),
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
  // Backing store: about 0.55 device pixels per CSS pixel on dense screens, never more than ~300k pixels (every pixel
  // traces a ray).
  function pixelBudget(width, height, ratio, quality) {
    var w = Number.isFinite(width) && width > 0 ? Math.min(width, 2400) : 300;
    var h = Number.isFinite(height) && height > 0 ? Math.min(height, 2400) : 300;
    var dpr = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
    var q = Number.isFinite(quality) ? quality : 1;
    var scale = Math.max(0.5, Math.min(1.5, dpr * 0.55)) * q;
    if (w * h * scale * scale > 300000) scale = Math.sqrt(300000 / (w * h)) * Math.min(1, q);
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
      'uniform vec2 uRes;uniform vec4 uGeo;uniform vec4 uA;uniform vec4 uB;uniform vec4 uC;uniform vec4 uD;',
      'uniform vec4 uSparks[' + sparks + '];uniform vec4 uJobs[' + jobs + '];',
      'float hash21(vec2 p){p=fract(p*vec2(234.34,435.345));p+=dot(p,p+34.23);return fract(p.x*p.y);}',
      'float hash31(vec3 p){p=fract(p*0.1031);p+=dot(p,p.zyx+31.32);return fract((p.x+p.y)*p.z);}',
      'float noise3(vec3 x){vec3 i=floor(x);vec3 f=fract(x);f=f*f*(3.0-2.0*f);',
      '  return mix(mix(mix(hash31(i),hash31(i+vec3(1.0,0.0,0.0)),f.x),mix(hash31(i+vec3(0.0,1.0,0.0)),hash31(i+vec3(1.0,1.0,0.0)),f.x),f.y),',
      '    mix(mix(hash31(i+vec3(0.0,0.0,1.0)),hash31(i+vec3(1.0,0.0,1.0)),f.x),mix(hash31(i+vec3(0.0,1.0,1.0)),hash31(i+vec3(1.0,1.0,1.0)),f.x),f.y),f.z);}',
      'float fbm3(vec3 p){float s=0.0;float a=0.5;for(int i=0;i<5;i++){s+=a*noise3(p);p=p*2.02+vec3(1.7,9.2,3.1);a*=0.5;}return s/0.96875;}',
      'float fbm3l(vec3 p){float s=0.5*noise3(p);p=p*2.02+vec3(1.7,9.2,3.1);s+=0.25*noise3(p);p=p*2.02+vec3(1.7,9.2,3.1);s+=0.125*noise3(p);return s/0.875;}',
      'float sq(float x){return x*x;}',
      'float angle(vec2 v){return atan(v.y,abs(v.x)+abs(v.y)<1e-6?1.0:v.x);}',
      'float arcGlow(float d){return d>=0.0?exp(-d*1.7):exp(-d*d*160.0);}',
      // Gas of the accretion disk at a point of the disk plane (r in Schwarzschild radii, horizon 1, inner edge 2.3):
      // streaks that orbit faster inside (two crossfaded Keplerian layers so the shear never winds up), curdled into
      // clouds by a domain warp; white-hot at the inner edge, lilac, violet and deep indigo outside. a = opacity.
      'vec4 gas(vec3 P,vec3 dir,float rot,float t,float energy,float level,float think){',
      '  float r=length(P.xz);if(r<2.05||r>24.0)return vec4(0.0);',
      '  float phi=atan(P.z,P.x);float kep=7.0/(r*sqrt(r));float Pd=9.0;float r1=mod(rot,Pd);float r2=mod(rot+0.5*Pd,Pd);float w=abs(r1/Pd*2.0-1.0);',
      '  float lr=log(r);float a1=phi+r1*kep;float a2=phi+r2*kep;',
      '  float ca1=cos(a1),sa1=sin(a1),ca2=cos(a2),sa2=sin(a2);',
      '  float c1=fbm3l(vec3(ca1*0.9,sa1*0.9,lr*2.6));float c2=fbm3l(vec3(ca2*0.9,sa2*0.9,lr*2.6+5.1));',
      '  float s1=fbm3(vec3(ca1*3.6,sa1*3.6,lr*21.0)+vec3(c1*2.4,-c1*1.8,c1*4.0));float s2=fbm3(vec3(ca2*3.6,sa2*3.6,lr*21.0+3.7)+vec3(c2*2.4,-c2*1.8,c2*4.0));',
      '  float cl=mix(c1,c2,w);float st=mix(s1,s2,w);',
      '  float inner=smoothstep(2.05,2.5,r);float outer=1.0-smoothstep(7.0,24.0,r);',
      '  float cloud=smoothstep(0.28,0.72,cl)*(0.30+0.95*smoothstep(0.32,0.80,st))+0.35*smoothstep(0.50,0.90,st);',
      '  float T=exp(-(r-2.3)*0.28);',
      '  float rim=exp(-(r-2.2)*3.2)*inner;',
      '  float dens=inner*outer*(cloud*(0.45+1.70*T)*(0.55+0.9*st)+rim*1.1);',
      '  if(think>0.01){float hd=-t*2.3;float d1=mod(phi-hd+3.1415927,6.2831853)-3.1415927;float d2=mod(phi-hd,6.2831853)-3.1415927;',
      '    dens+=(arcGlow(d1)+arcGlow(d2))*exp(-sq((r-2.7)/0.45))*think*0.9;}',
      '  vec3 deep=vec3(0.07,0.035,0.15);vec3 vio=vec3(0.44,0.33,0.82);vec3 lil=vec3(1.30,1.20,1.75);vec3 hot=vec3(3.2,3.1,3.45);',
      '  float h=clamp(T*0.75+sq(st)*0.95+rim*0.5-0.18,0.0,1.0);',
      '  vec3 c=mix(mix(deep,vio,smoothstep(0.0,0.35,h)),mix(lil,hot,smoothstep(0.72,1.0,h)),smoothstep(0.35,0.72,h));',
      // Embers: tiny hot sparks caught in the gas.
      '  vec2 eg=vec2(a1*40.0,lr*60.0);float eh=hash21(floor(eg));vec2 ef=fract(eg)-0.5;float ember=step(0.985,eh)*exp(-dot(ef,ef)*30.0)*outer*inner;',
      '  c+=vec3(1.6,0.55,1.4)*ember*3.0;',
      '  vec3 v=normalize(vec3(-P.z,0.0,P.x))*sqrt(0.5/r);float dop=clamp(1.0+dot(v,-dir)*1.1,0.35,1.8);',
      '  float dark=smoothstep(0.56,0.30,st)*smoothstep(0.26,0.58,cl);float glow=dens*(1.0-0.88*dark)*dop*dop*dop*(1.25+0.35*energy+0.30*level);',
      '  return vec4(c*glow,clamp(dens*1.35+dark*0.5*inner*outer,0.0,1.0));}',
      // One candidate star per cell, sized in real pixels, so lensing stretches the stars near the hole into arcs.
      'vec3 starLayer(vec2 px,float cell,float density,float size,float seed,float t){',
      '  vec2 g=px/cell;vec2 id=floor(g);vec2 f=fract(g);float h=hash21(id+seed);if(h>density)return vec3(0.0);',
      '  vec2 pos=vec2(hash21(id+seed+11.7),hash21(id+seed+37.1))*0.8+0.1;float d=length((f-pos)*cell);',
      '  float mag=hash21(id+seed+5.3);float tw=0.72+0.28*sin(t*(0.7+1.9*mag)+mag*50.0);',
      '  vec3 tint=mix(vec3(0.74,0.78,1.0),vec3(1.0,0.84,1.0),hash21(id+seed+2.9));',
      '  return tint*exp(-d*d/(size*size))*(0.30+1.35*mag*mag)*tw;}',
      'void main(){',
      '  vec2 frag=gl_FragCoord.xy;vec2 p=(frag-uGeo.xy)/uGeo.z;float pr=length(p);',
      '  float t=uA.x;float energy=uA.z;float level=uA.w;',
      // Camera: distance uD.w (Schwarzschild radii), elevation above the disk uD.z, screen roll uD.xy.
      '  float D=uD.w;float el=uD.z;vec2 sp=vec2(uD.x*p.x-uD.y*p.y,uD.y*p.x+uD.x*p.y);',
      '  vec3 cam=vec3(0.0,D*sin(el),-D*cos(el));vec3 fw=-cam/D;vec3 rt=normalize(cross(vec3(0.0,1.0,0.0),fw));vec3 upv=cross(fw,rt);',
      // Gravitational waves bend the view a touch (out while Argon speaks, in while it listens).
      '  float wv=uB.z*smoothstep(0.55,0.95,pr)*exp(-max(pr-0.9,0.0)*1.8);float ripple=sin((pr-uB.w)*15.0);',
      '  float F=0.2778;vec3 dir=normalize(fw+(rt*sp.x+upv*sp.y)*F*(1.0+ripple*wv*0.012));',
      '  vec3 pos=cam;vec3 hv=cross(pos,dir);float h2=dot(hv,hv);',
      '  vec3 col=vec3(0.0);float A=0.0;float hit=0.0;float ring=0.0;vec3 halo=vec3(0.0);vec4 hp=vec4(0.0);',
      '  for(int i=0;i<110;i++){',
      '    float r2=dot(pos,pos);float r=sqrt(r2);',
      '    if(r<1.0){hit=1.0;break;}',
      '    if(r>D+4.0&&dot(pos,dir)>0.0)break;',
      '    float hz=0.22+r*0.075;float vy=exp(-sq(pos.y/hz));',
      '    float dt=clamp((r-1.0)*0.085,0.035,1.6);if(vy>0.05&&r<16.0)dt=min(dt,0.32);',
      '    vec3 prev=pos;',
      '    dir+=-1.5*h2*pos/(r2*r2*r)*dt;pos+=dir*dt;',
      '    ring+=exp(-sq((r-1.5)/0.045))*dt;',
      '    if(vy>0.02&&r>2.0&&r<20.0){float ro=smoothstep(2.0,2.8,r)*(1.0-smoothstep(5.0,20.0,r));',
      '      float hw=(1.0-A)*vy*ro*dt;hp+=vec4(pos,1.0)*hw;',
      '      halo+=hw*mix(vec3(0.30,0.20,0.62),vec3(1.0,0.92,1.4),exp(-(r-2.3)*0.30));}',
      '    if(prev.y*pos.y<0.0){float k=prev.y/(prev.y-pos.y);vec3 X=mix(prev,pos,k);',
      '      vec4 g=gas(X,normalize(dir),uA.y,t,energy,level,uB.y);col+=(1.0-A)*g.rgb;A+=(1.0-A)*g.a;if(A>0.985)break;}',
      '  }',
      '  dir=normalize(dir);',
      // The haze above and below the disk is curdled once per pixel, at the middle of the haze the ray went through.
      '  if(hp.w>0.0005){vec3 cq=hp.xyz/hp.w;cq=vec3(cq.x*0.8,cq.y*2.4,cq.z*0.8)+vec3(0.0,uA.y*0.08,0.0);float cn=noise3(cq)*0.6+noise3(cq*2.7+4.1)*0.4;halo*=sq(sq(cn))*5.0;}',
      '  col+=halo*0.13*(0.8+0.4*energy);',
      '  float pulse=1.0+1.2*level+uB.y*0.45*(0.5+0.5*sin(t*6.0));',
      '  col+=vec3(1.0,0.86,1.55)*min(ring,6.0)*0.42*pulse*(1.0-A);',
      // Sky: where the light ray finally escaped to, so stars and the faint nebula are lensed for real.
      '  float vis=(1.0-hit)*(1.0-A);',
      '  if(vis>0.01){float fz=max(dot(dir,fw),0.08);vec2 sk=vec2(dot(dir,rt),dot(dir,upv))/fz/F*uGeo.z;',
      '    float neb=fbm3l(dir*2.2+vec3(t*0.002,0.0,0.0));',
      '    vec3 sky=mix(vec3(0.09,0.03,0.20),vec3(0.26,0.08,0.34),neb)*neb*neb*0.75*uC.w;',
      '    sky+=(starLayer(sk,11.0,0.18,0.62,1.0,t)+starLayer(sk+77.0,29.0,0.30,0.95,9.0,t)*1.2)*uC.z*(0.25+0.75*smoothstep(0.7,1.7,pr));',
      '    col+=sky*vis;}',
      '  col+=vec3(0.62,0.32,1.0)*pow(max(ripple,0.0),10.0)*wv*0.18;',
      '  float alpha=max(hit*(1.0-A),0.0);',
      // Matter spiralling in (positions come from the CPU): a soft head with a short tail along its path.
      '  vec2 po=p*1.55;float r=length(po);',
      '  if(r<2.4){for(int i=0;i<' + sparks + ';i++){vec4 sk4=uSparks[i];vec2 pa=po-sk4.xy;if(sk4.z<0.004||dot(pa,pa)>0.04)continue;',
      '    vec2 hh2=sk4.xy;float hl=max(length(hh2),0.001);vec2 vel=normalize(vec2(hh2.y,-hh2.x)/hl*0.9-hh2/hl*0.45);',
      '    vec2 ba=-vel*sk4.w;float hh=clamp(dot(pa,ba)/max(dot(ba,ba),0.00001),0.0,1.0);vec2 dv=pa-ba*hh;',
      '    col+=vec3(0.92,0.76,1.0)*exp(-dot(dv,dv)/0.00022)*(1.0-0.75*hh)*sk4.z*(1.0-hit);}}',
      // Active jobs orbit the hole (running: lavender, completed: green, failed/blocked: red, waiting: grey).
      '  for(int j=0;j<' + jobs + ';j++){vec4 jb=uJobs[j];if(jb.w<0.5)continue;float a=jb.x-t*0.22/(jb.y*jb.y);',
      '    vec2 dv=po-jb.y*vec2(cos(a),sin(a)*0.92);float d2=dot(dv,dv);if(d2>0.25)continue;',
      '    vec3 c=jb.z<0.5?vec3(0.86,0.76,1.0):jb.z<1.5?vec3(0.55,1.0,0.78):jb.z<2.5?vec3(1.0,0.48,0.55):vec3(0.62,0.58,0.78);',
      '    col+=c*(exp(-d2/0.0009)*1.3+exp(-sqrt(d2)/0.07)*0.12);}',
      // Tone, mood, edge fade; premultiplied alpha so light adds over the page while the horizon stays black.
      '  float dim=uC.y;col=vec3(1.0)-exp(-col*mix(vec3(1.0),vec3(0.42,0.30,0.85),dim)*1.15*(1.0-0.55*dim));',
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
    if (options.fps !== undefined && (typeof options.fps !== 'number' || !(options.fps >= 1 && options.fps <= 60))) throw new TypeError('fps must be 1-60');
    var fixedFPS = options.fps || 0, ownsIntro = options.intro === true;
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
      level: 0, x: null, y: null, r: null, dim: 0, fade: 0, stars: 1, haze: 1, tilt: -24, incl: 76, dist: 26 };
    var scene = { x: null, y: null, r: null, dim: 0, fade: 0, stars: 1, haze: 1, tilt: -24, incl: 76, dist: 26 };
    var camera = null;   // setCamera(): a scripted camera (the opening flight) overrides the CSS angles without easing
    // Integrated phases: speed changes alter how fast they advance, never where they are.
    var clock = 0, rotation = 0, infall = 0, wavePhase = 0;
    var jobData = new Float32Array(MAX_JOBS * 4), sparkData = new Float32Array(MAX_SPARKS * 4);
    canvas.setAttribute('aria-hidden', 'true');
    canvas.setAttribute('data-energy-state', state);
    canvas.setAttribute('data-energy-mode', mode);

    function reduced() { return forcedReduced || reducedByOS; }
    // While the opening title flies its own camera (html[data-ov-intro]), the page's skies wait underneath it.
    function behindIntro() { return !ownsIntro && !!(doc && doc.documentElement && doc.documentElement.hasAttribute && doc.documentElement.hasAttribute('data-ov-intro')); }
    function fpsNow() { return fixedFPS || moodTarget().fps; }
    function drawable() { return !destroyed && !fallback && !contextLost && visible && !behindIntro() && !(doc && doc.hidden) && size && size.width > 2 && size.height > 2; }
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
      ['uRes', 'uGeo', 'uA', 'uB', 'uC', 'uD'].forEach(function (name) { loc[name] = gl.getUniformLocation(program, name); });
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
      var tilt = parseFloat(get('--bh-tilt')); scene.tilt = Number.isFinite(tilt) ? Math.max(-90, Math.min(90, tilt)) : -24;
      var incl = parseFloat(get('--bh-incl')); scene.incl = Number.isFinite(incl) ? Math.max(0, Math.min(86, incl)) : 76;
      var dist = parseFloat(get('--bh-dist')); scene.dist = Number.isFinite(dist) ? Math.max(3, Math.min(120, dist)) : 26;
      if (cur.x === null) { cur.x = scene.x; cur.y = scene.y; cur.r = scene.r; cur.dim = scene.dim; cur.fade = scene.fade; cur.stars = scene.stars; cur.haze = scene.haze; cur.tilt = scene.tilt; cur.incl = scene.incl; cur.dist = scene.dist; }
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
        cur.dim += (scene.dim - cur.dim) * ks; cur.fade += (scene.fade - cur.fade) * ks; cur.stars += (scene.stars - cur.stars) * ks; cur.haze += (scene.haze - cur.haze) * ks; cur.tilt += (scene.tilt - cur.tilt) * ks; cur.incl += (scene.incl - cur.incl) * ks; cur.dist += (scene.dist - cur.dist) * ks;
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
      // The camera drifts a few degrees around its CSS angle, so the disk slowly turns in space.
      var tilt = camera ? camera.tilt : cur.tilt + 3.5 * Math.sin(clock * 0.021), incl = camera ? camera.incl : cur.incl + 2.5 * Math.sin(clock * 0.017 + 1.3);
      var roll = tilt * Math.PI / 180, elevation = (90 - Math.max(0, Math.min(88, incl))) * Math.PI / 180;
      gl.uniform4f(loc.uD, Math.cos(roll), Math.sin(roll), elevation, camera ? camera.dist : cur.dist);
      gl.uniform4fv(loc.uSparks, sparkUniforms().subarray(0, sparkCount * 4));
      gl.uniform4fv(loc.uJobs, jobData.subarray(0, jobCount * 4));
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      var spent = now() - started;
      frames += 1; totalDrawMS += spent; if (spent > maxDrawMS) maxDrawMS = spent;
    }
    // A slow phone shows up as late frames: step the resolution down (and back up when there is room).
    function adapt(interval) {
      var budget = 1000 / Math.max(1, fpsNow() || 30);
      intervalSum += interval; intervalCount += 1;
      if (intervalCount < 20) return;
      var average = intervalSum / intervalCount; intervalSum = 0; intervalCount = 0;
      if (average > budget * 1.45) { slowStreak += 1; fastStreak = 0; } else if (average < budget * 1.12) { fastStreak += 1; slowStreak = 0; } else { slowStreak = 0; fastStreak = 0; }
      if (slowStreak >= 2 && quality > 0.45) { quality = Math.max(0.45, quality * 0.82); slowStreak = 0; resize(); }
      else if (fastStreak >= 6 && quality < 1) { quality = Math.min(1, quality * 1.12); fastStreak = 0; resize(); }
    }
    function frame(timestamp) {
      frameId = null;
      if (!drawable()) return;
      var fps = fpsNow();
      var still = reduced() || (fps === 0 && timestamp > settleUntil && settled() && !camera);
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
    // A scripted camera ({tilt, incl, dist}) replaces the CSS angles at once; null hands the camera back to CSS.
    function setCamera(next) {
      alive();
      if (next === null) { camera = null; return; }
      if (!next || typeof next !== 'object' || ![next.tilt, next.incl, next.dist].every(Number.isFinite)) throw new TypeError('Camera needs finite tilt, incl and dist');
      camera = { tilt: Math.max(-180, Math.min(180, next.tilt)), incl: Math.max(0, Math.min(88, next.incl)), dist: Math.max(1.2, Math.min(400, next.dist)) };
      if (frameId === null) refresh();
    }
    function getStats() {
      return Object.freeze({ state: state, mode: mode, destroyed: destroyed, renderer: fallback ? 'fallback-mark' : contextLost ? 'webgl-context-lost' : 'webgl',
        visible: drawable(), reducedMotion: reduced(), targetFPS: reduced() ? 0 : fixedFPS || MOOD[mode].fps, frames: frames,
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
      if (doc) { doc.removeEventListener('visibilitychange', visibilityChanged); doc.removeEventListener('ov-intro-end', visibilityChanged); }
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
    if (doc) { doc.addEventListener('visibilitychange', visibilityChanged); doc.addEventListener('ov-intro-end', visibilityChanged); }
    if (view.addEventListener) view.addEventListener('resize', queueResize, { passive: true });
    if (media && media.addEventListener) media.addEventListener('change', motionChanged);
    else if (media && media.addListener) media.addListener(motionChanged);
    canvas.addEventListener('webglcontextlost', contextLostHandler);
    canvas.addEventListener('webglcontextrestored', contextRestoredHandler);
    if (Resize) { resizeObserver = new Resize(queueResize); resizeObserver.observe(canvas); }
    if (Intersect) {
      intersectionObserver = new Intersect(function (entries) {
        if (destroyed) return;
        // One batch can hold several entries for this canvas (hidden, then shown): the newest one is the truth.
        for (var i = 0; i < entries.length; i += 1) if (entries[i].target === canvas) visible = entries[i].isIntersecting;
        refresh();
      }, { threshold: 0 });
      intersectionObserver.observe(canvas);
    }
    resize();
    var controller = Object.freeze({ setState: setState, setMode: setState, setAudioLevel: setAudioLevel, setActivities: setActivities,
      refreshScene: refreshScene, setCamera: setCamera, getStats: getStats, destroy: destroy });
    mounts.set(canvas, controller);
    return controller;
  }
  return Object.freeze({ version: '28.0.0', MODES: MODES, STATES: STATES, JOB_STATES: JOB_STATES, mount: mount,
    normaliseState: normaliseState, normaliseActivities: normaliseActivities, clampAudioLevel: clampAudioLevel,
    pixelBudget: pixelBudget, targetFPS: targetFPS, modeOf: modeOf, FRAGMENT: FRAGMENT, fragmentSource: fragmentSource });
});
