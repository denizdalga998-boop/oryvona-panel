'use strict';
window.KozaRunFlow=(()=>{
 // A floating stick keeps travelling while the finger rests off its centre.
 function stickStart(x,y){return {sx:x,sy:y,x,y,dx:0,dy:0,amount:0};}
 function stickMove(s,x,y,sensitivity=1){
  const reach=42/Math.max(.6,Math.min(1.6,sensitivity)),dead=5;
  let dx=x-s.sx,dy=y-s.sy,d=Math.hypot(dx,dy);
  if(d>reach){s.sx=x-dx/d*reach;s.sy=y-dy/d*reach;d=reach;dx=x-s.sx;dy=y-s.sy;}
  s.x=x;s.y=y;s.amount=Math.max(0,Math.min(1,(d-dead)/(reach-dead)));
  s.dx=d?dx/d:0;s.dy=d?dy/d:0;return s;
 }
 function input(s,keys){
  if(s)return {dx:s.dx*s.amount,dy:s.dy*s.amount};
  const dx=(keys.ArrowRight||keys.d?1:0)-(keys.ArrowLeft||keys.a?1:0),dy=(keys.ArrowDown||keys.s?1:0)-(keys.ArrowUp||keys.w?1:0),d=Math.hypot(dx,dy);
  return {dx:d?dx/d:0,dy:d?dy/d:0};
 }
 // Relative swept collision catches a moving hero crossing a moving hazard.
 function contact(a0,a1,b0,b1,r){
  // v5.15: under the shared 52° camera a world circle is an ellipse on screen;
  // screen-y separation is stretched back to world distance (1 when inactive).
  const q=typeof window!=='undefined'&&window.KozaCamera?.ySquash?window.KozaCamera.ySquash():1;
  const x=a0.x-b0.x,y=(a0.y-b0.y)/q,dx=a1.x-b1.x-x,dy=(a1.y-b1.y)/q-y;
  const t=Math.max(0,Math.min(1,-(x*dx+y*dy)/(dx*dx+dy*dy||1)));
  return Math.hypot(x+dx*t,y+dy*t)<r;
 }
 const combinations=[
  {id:'light-trail',keys:['magnet','swift'],name:'Işık izi',description:'Seriyi sürdürme süren 2,7 yerine 4 saniye olur.'},
  {id:'safe-return',keys:['shield','slow'],name:'Güvenli dönüş',description:'Kalkan bir darbeyi engellediğinde 1,5 saniye korunursun.'}
 ];
 const roles={shield:'KORUNMA',magnet:'TOPLAMA',slow:'KONTROL',swift:'HAREKET',heal:'İYİLEŞME',bloom:'GELİŞİM'};
 function synergy(picks){return combinations.find(c=>c.keys.every(k=>picks.includes(k)))||null;}
 function complement(picks){return combinations.find(c=>c.keys.some(k=>picks.includes(k)))?.keys.find(k=>!picks.includes(k));}
 function rhythm(m,elapsed,s){
  if(m.boss)return {spawn:false,label:'Koruyucu karşılaşması',factor:1};
  if(s.relief>0)return {spawn:false,label:'Nefes arası · Işıkları topla',factor:1};
  const phase=KozaDepth.phase(elapsed,m.duration);
  return {spawn:elapsed>3,label:phase===2?'Son dalga':phase===1?'Akış hızlanıyor':'Işıkları topla',factor:phase===2?.85:phase===0?1.15:1};
 }
 function bossCue(b,lights){
  if(!b)return '';
  if(b.ending)return 'Dayan…';
  if(b.charge>0)return 'Hazırlanıyor · Uzaklaş';
  if(b.action>0)return 'Saldırı · Boşluğu bul';
  return lights.some(o=>o.bossMark)?'Altın ışık · isteğe bağlı ödül':'Yeni saldırıya hazırlan';
 }
 function resultTip(m,s,r){
  if(r.lives<=0)return 'Canların tükendi. '+(m.boss?'Hazırlıkta uzaklaş, boşluğa geç; yakındaki altın ışık risklidir.':'Yeteneğin dolunca kendiliğinden devreye girer; açık alana yönel.');
  if(m.boss)return 'Süre dolana kadar dayanmalısın. Hazırlık telegrafını gör, boşluğa geç; altın ışıklar isteğe bağlı ödüldür.';
  if(m.id==='survive'&&r.lives<2)return 'Bu bölüm için en az 2 can gerekli. Can filizi veya Işık zırhını seç.';
  if((m.id==='chain'||m.id==='mixed')&&r.maxCombo<(m.comboTarget||m.target))return 'En uzun serin '+r.maxCombo+' / '+(m.comboTarget||m.target)+'. Yakın ışıkları peş peşe topla; seri göstergesini izle.';
  if(r.score<m.target)return (m.target-r.score)+' parıltı eksik kaldı. Işık çekimi, uzaktaki parıltılara ulaşmanı kolaylaştırır.';
  return 'Hedef hazırdı. Bölümün açılması için süreyi de tamamlamalısın.';
 }
 function choiceSchedule(m){
  if(m.boss)return {limit:2,at:[6,Math.max(14,m.duration*.5)]}; /* Q3: second guardian card by the encounter clock */
  if(m.duration<=40)return {limit:1,at:[Math.min(10,m.duration*.3)]};
  return {limit:2,at:[Math.min(12,m.duration*.25),Math.min(m.duration*.55,m.duration-16)]};
 }
 function choiceDue(m,s,elapsed){
  const plan=choiceSchedule(m);
  if(s.choiceCount>=plan.limit)return false;
  if(m.boss&&(!s.boss||s.bossEnding))return false;
  return elapsed>=plan.at[s.choiceCount];
 }
 function abilityStatus(hero,s){
  const remaining=hero==='lumi'?s.magnet:hero==='pera'?s.shield:(s.flow||0);
  const phase=remaining>0?'active':s.cooldown>0?'cooldown':'ready';
  const seconds=phase==='active'?remaining:phase==='cooldown'?s.cooldown:0;
  const ratio=phase==='active'?remaining/(s.effectDuration||remaining):phase==='cooldown'?1-s.cooldown/(s.cooldownDuration||s.cooldown):1;
  return {phase,seconds,ratio:Math.max(0,Math.min(1,ratio))};
 }
 // This displays the existing 3-to-1 conversion; it never adds another reward.
 function bonus(score,startScore){return {earned:Math.max(0,Math.floor(score/3)-Math.floor(startScore/3)),pips:score%3};}
 const skills=[{name:'Işık yaylımı',icon:'light'},{name:'Zehir yaylımı',icon:'sprout'},{name:'Dalış',icon:'wing'},{name:'Uçuş alevi',icon:'dash'}];
 function bossPreview(level,region){const spec=KozaBossPatterns.spec(level,region);return {...spec,skill:skills[spec.index]};}
 function portrait(index,region='garden'){
  const asset=window.KozaAssets?.bossFor(region,index);
  if(asset)return '<span class="boss-art-window" aria-hidden="true"><img src="'+asset.portrait+'" alt="" loading="lazy" decoding="async" onerror="this.hidden=true"></span>';
  const [x,y,w,h]=KozaGroveAtlas.rects[4+index],scale=Math.min(76/w,84/h);
  return '<span class="boss-art-window" aria-hidden="true"><span style="width:'+w*scale+'px;height:'+h*scale+'px;background-image:url(grove-bosses-v31.png);background-size:'+KozaGroveAtlas.width*scale+'px '+KozaGroveAtlas.height*scale+'px;background-position:-'+x*scale+'px -'+y*scale+'px"></span></span>';
 }

 return {stickStart,stickMove,input,contact,synergy,complement,roles,rhythm,bossCue,resultTip,choiceSchedule,choiceDue,abilityStatus,bonus,bossPreview,portrait};
})();
