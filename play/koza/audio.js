'use strict';
// Original 8-bar ambient miniature: gentle pentatonic bells over slow pads.
window.KozaAudio=(()=>{
 let context,bus,timer=null,next=0,beat=0,enabled=true,started=false,generation=0,musicMode='home',musicVolume=.7,effectVolume=.9;
 const voices=new Set();
 const melody=[72,null,76,79,null,76,74,null,72,null,69,72,null,76,null,74,77,null,81,79,null,77,76,null,74,null,71,67,null,71,null,72];
 const chords=[[48,55,64],[45,52,60],[53,60,69],[43,50,59]];
 function ensure(){if(!context){const C=window.AudioContext||window.webkitAudioContext;if(!C)return false;context=new C();bus=context.createGain();bus.gain.value=.48*musicVolume;bus.connect(context.destination);}return true;}
 function note(midi,at,duration,volume,type='sine',attack=.03){
  const o=context.createOscillator(),g=context.createGain();o.type=type;o.frequency.value=440*Math.pow(2,(midi-69)/12);
  g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(volume,at+attack);g.gain.exponentialRampToValueAtTime(.0001,at+duration);
  o.connect(g);g.connect(bus);voices.add(o);o.kozaGain=g;o.onended=()=>{voices.delete(o);o.disconnect();g.disconnect();};o.start(at);o.stop(at+duration+.05);
 }
 function schedule(){if(!enabled||document.hidden)return;const active=musicMode==='play',choosing=musicMode==='choice',step=active?.25:choosing?.6:.75;while(next<context.currentTime+.3){const i=beat%32,chord=chords[Math.floor(i/8)];if(i%8===0)chord.forEach(m=>note(m,next,active?2.5:6.6,.023,'sine',active?.16:.8));if(active){const arp=[0,1,2,1,0,2,1,2];note(chord[arp[i%8]]+12,next,.55,.046,'triangle',.012);if(i%4===0)note(chord[0]-12,next,.19,.085,'sine',.008);if(i%4===2)note(91,next,.065,.013,'triangle',.005);if(i%2===0&&melody[i]!==null)note(melody[i],next,.8,.024);}else if(choosing){const tones=[76,79,83,86,83,79,74,79];if(i%2===0)note(tones[(i/2)%8],next,2.4,.034,'sine',.12);if(i%8===4)note(chord[1]+24,next,3.2,.016,'triangle',.3);}else if(melody[i]!==null)note(melody[i],next,2.2,.048);beat++;next+=step;}}
 function setMode(value){const nextMode=['play','choice'].includes(value)?value:'home';if(nextMode===musicMode)return;const running=timer!==null;generation++;if(timer!==null){clearInterval(timer);timer=null;}if(context){const at=context.currentTime;for(const o of voices){try{o.kozaGain.gain.cancelScheduledValues(at);o.kozaGain.gain.setTargetAtTime(.0001,at,.09);o.stop(at+.4);}catch{}}}musicMode=nextMode;beat=0;if(bus&&context){bus.gain.cancelScheduledValues(context.currentTime);bus.gain.setTargetAtTime(.48*musicVolume*(nextMode==='choice'?.6:1),context.currentTime,.12);}if(running)start();} // Q2: music eases back while a card is chosen
 async function start(){if(!enabled||document.hidden)return;started=true;const ticket=generation;try{if(!ensure())return;await context.resume();if(ticket!==generation||!enabled||document.hidden||timer!==null)return;next=context.currentTime+.06;schedule();timer=setInterval(schedule,160);}catch{}}
 function stop(){generation++;if(timer!==null){clearInterval(timer);timer=null;}for(const o of voices){try{o.stop();}catch{}}voices.clear();}
 function setEnabled(value){const nextValue=!!value;if(enabled===nextValue)return;enabled=nextValue;if(enabled)start();else stop();}
 function setVolumes(music,effects){musicVolume=Math.max(0,Math.min(1,music/100));effectVolume=Math.max(0,Math.min(1,effects/100));if(bus){bus.gain.cancelScheduledValues(context.currentTime);bus.gain.setTargetAtTime(.48*musicVolume*(musicMode==='choice'?.6:1),context.currentTime,.06);}if(fxBus)fxBus.gain.setTargetAtTime(effectVolume,context.currentTime,.04);}
 // QUALITY PASS q1: named, restrained sound cues. All synthesized (no samples), one effects bus (effectVolume) into a
 // soft limiter; master mute / hidden tab respected; each cue has a minimum gap so chained pickups or a duplicated event
 // can never stack into a loud burst; at most ~10 live effect voices.
 let fxBus=null,limiter=null,noiseBuf=null,fxVoices=0;const lastCue=new Map();
 function fxReady(){if(!enabled||effectVolume===0||document.hidden)return false;if(!ensure())return false;context.resume().catch(()=>{});
  if(!fxBus){limiter=context.createDynamicsCompressor();limiter.threshold.value=-14;limiter.knee.value=10;limiter.ratio.value=6;limiter.attack.value=.004;limiter.release.value=.18;fxBus=context.createGain();fxBus.gain.value=effectVolume;fxBus.connect(limiter);limiter.connect(context.destination);}
  return true;}
 function osc(type,f0,f1,at,dur,peak,attack=.006){if(fxVoices>10)return;const o=context.createOscillator(),g=context.createGain();o.type=type;o.frequency.setValueAtTime(f0,at);if(f1&&f1!==f0)o.frequency.exponentialRampToValueAtTime(f1,at+dur);
  g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(peak,at+attack);g.gain.exponentialRampToValueAtTime(.0001,at+dur);o.connect(g);g.connect(fxBus);fxVoices++;o.onended=()=>{fxVoices--;o.disconnect();g.disconnect();};o.start(at);o.stop(at+dur+.03);}
 function noise(at,dur,peak,freq,q=.8,type='bandpass',sweep=0){if(fxVoices>10)return;
  if(!noiseBuf){noiseBuf=context.createBuffer(1,Math.floor(context.sampleRate*.5),context.sampleRate);const d=noiseBuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;}
  const n=context.createBufferSource(),f=context.createBiquadFilter(),g=context.createGain();n.buffer=noiseBuf;f.type=type;f.frequency.setValueAtTime(freq,at);if(sweep)f.frequency.exponentialRampToValueAtTime(sweep,at+dur);f.Q.value=q;
  g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(peak,at+Math.min(.03,dur*.3));g.gain.exponentialRampToValueAtTime(.0001,at+dur);n.connect(f);f.connect(g);g.connect(fxBus);fxVoices++;n.onended=()=>{fxVoices--;n.disconnect();f.disconnect();g.disconnect();};n.start(at);n.stop(at+dur+.03);}
 const hz=m=>440*Math.pow(2,(m-69)/12);
 // name: [minimum gap in seconds, player(t, opts)]
 const PENTA=[72,74,76,79,81,84,86,88];let highUntil=0;const high=t=>{highUntil=t+.45;};
 const CUES={
  // Q2: pickup ladder stays inside the music's C-major pentatonic and never climbs forever (steps 0-7, then 5-7 cycle);
  // quieter for ~0.45 s after a high-priority cue (damage / impact / wind-up / shield) so danger stays audible.
  pickup:[.045,(t,o)=>{const k=o.step||0,m=PENTA[k<8?k:5+(k%3)],d=t<highUntil?.35:1;osc('sine',hz(m),hz(m)*1.03,t,.09,.05*d);osc('triangle',hz(m+12),0,t+.01,.06,.012*d);}],
  bossMark:[.12,t=>{osc('sine',hz(84),0,t,.28,.06);osc('sine',hz(91),0,t+.05,.3,.035);osc('triangle',hz(72),hz(74),t,.2,.03);}],
  special:[.2,t=>{[88,91,95].forEach((m,i)=>osc('sine',hz(m),0,t+i*.045,.22,.03));}],
  specialTake:[.2,t=>{osc('sine',hz(86),hz(93),t,.16,.05);noise(t,.12,.012,6000,.7,'highpass');}],
  upgrade:[.25,t=>{[72,76,79,84].forEach((m,i)=>osc('triangle',hz(m),0,t+i*.06,.24,.04));osc('sine',hz(96),0,t+.22,.35,.015);}],
  damage:[.25,t=>{high(t);osc('triangle',220,90,t,.22,.09,.004);osc('sine',110,55,t,.26,.08,.004);noise(t,.12,.03,900,.9,'lowpass',300);}],
  shield:[.2,t=>{high(t);osc('sine',hz(81),hz(88),t,.2,.05);osc('sine',hz(93),0,t+.02,.28,.02);noise(t,.16,.014,5000,1.2,'bandpass',8000);}],
  shieldReady:[.4,t=>{osc('sine',hz(81),0,t,.14,.025);osc('sine',hz(88),0,t+.07,.2,.025);}],
  ability:[.3,t=>{osc('sine',hz(74),hz(86),t,.22,.05);noise(t,.22,.012,1800,1.4,'bandpass',5200);}],
  abilityReady:[.5,t=>{osc('sine',hz(86),0,t,.09,.025);}],
  goal:[.5,t=>{[79,84,88].forEach((m,i)=>osc('sine',hz(m),0,t+i*.07,.26,.035));}],
  victory:[.8,t=>{[72,76,79,84,88].forEach((m,i)=>osc('triangle',hz(m),0,t+i*.085,.42,.04));osc('sine',hz(60),0,t,.8,.03,.05);}],
  defeat:[.8,t=>{[67,63,60].forEach((m,i)=>osc('sine',hz(m),hz(m)*.985,t+i*.16,.42,.04,.02));}],
  windup:[.3,(t,o)=>{high(t);const f=o.base||110;osc('sine',f,f*1.5,t,.42,.035,.18);noise(t,.4,.008,400,1,'bandpass',1400);}],
  release:[.12,(t,o)=>{noise(t,.2,.03,o.fire?700:2400,.9,'bandpass',o.fire?300:900);osc('triangle',o.fire?160:300,o.fire?90:180,t,.16,.03);}],
  impact:[.2,t=>{high(t);osc('sine',90,42,t,.3,.1,.003);noise(t,.18,.04,600,.7,'lowpass',120);}],
  ui:[.05,(t,o)=>{const f=o.f||600;osc('sine',f,f*1.25,t,.08,.035);}],
  buy:[.3,t=>{osc('sine',hz(76),0,t,.14,.04);osc('sine',hz(83),0,t+.07,.22,.04);}],
  start:[.5,t=>{osc('sine',hz(67),hz(74),t,.22,.035,.03);}],
  // Q2 identity motifs (synthesized, original): one per hero ability, and separate progress / evolve / card / heal cues.
  abilityLumi:[.3,t=>{osc('sine',hz(88),hz(91),t,.16,.04);osc('sine',hz(95),0,t+.06,.2,.022);noise(t,.18,.008,7000,.8,'highpass');}],
  abilityKoru:[.3,t=>{noise(t,.42,.022,500,.9,'bandpass',1800);osc('sine',hz(67),hz(74),t+.03,.3,.016,.08);}], /* Q3 Rüzgâr Akışı: a soft wind swell, no dash hit */
 goldLight:[.06,(t,o)=>{const d=t<highUntil?.4:1;osc('sine',hz(o.risky?86:84),0,t,.18,.045*d);osc('sine',hz(o.risky?93:91),0,t+.04,.22,.024*d);}],
 bossPhase:[1,t=>{high(t);osc('sine',hz(48),hz(50),t,.7,.05,.12);osc('triangle',hz(60),hz(63),t+.05,.5,.02,.1);noise(t,.5,.008,300,1,'lowpass',900);}],
 bossClear:[2,t=>{high(t);[67,71,74,79].forEach((m,i)=>osc('sine',hz(m),0,t+i*.11,.7,.035,.02));osc('triangle',hz(55),0,t,1.1,.025,.08);noise(t+.05,.6,.006,5000,.7,'highpass');}],
  abilityPera:[.3,t=>{osc('sine',hz(76),0,t,.34,.03,.05);osc('sine',hz(83),0,t+.05,.32,.022,.05);noise(t,.3,.006,4200,2,'bandpass');}],
  heal:[.4,t=>{osc('sine',hz(76),0,t,.18,.035,.02);osc('sine',hz(81),0,t+.1,.26,.035,.02);}],
  lowHp:[.8,t=>{high(t);osc('sine',hz(62),hz(60),t,.36,.05,.01);}],
  feed:[.12,t=>{osc('sine',hz(84),0,t,.14,.03);}],
  evolve:[1,t=>{[76,81,84,88,93].forEach((m,i)=>osc('triangle',hz(m),0,t+i*.07,.5,.035));osc('sine',hz(64),0,t,.9,.025,.08);noise(t+.3,.5,.006,6000,.8,'highpass');}],
  pick:[.15,t=>{osc('sine',hz(81),hz(86),t,.12,.04);osc('triangle',hz(93),0,t+.05,.12,.012);}],
  choiceOpen:[.4,t=>{osc('sine',hz(79),0,t,.28,.022,.04);osc('sine',hz(86),0,t+.09,.3,.02,.04);}]
 };
 const cueLog=[];
 function cue(name,opts={}){const c=CUES[name];if(!c||!fxReady())return false;try{const t=context.currentTime;if(t-(lastCue.get(name)??-9)<c[0])return false;lastCue.set(name,t);cueLog.push(name);if(cueLog.length>64)cueLog.shift();c[1](t+.005,opts);return true;}catch{return false;}}
 function effect(freq=600,duration=.09){if(!fxReady())return;try{osc('sine',freq,freq*1.35,context.currentTime,duration,.055);}catch{}}
 return {start,stop,setEnabled,setMode,setVolumes,effect,cue,cues:Object.keys(CUES),get cueLog(){return cueLog.slice();},get started(){return started;}};
})();
