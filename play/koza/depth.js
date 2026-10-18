'use strict';
window.KozaDepth=(()=>{
 const options={
 lumi:[{id:'focus',name:'Uzun çağrı',text:'Işık çağrısı 5 yerine 7 saniye sürer.',icon:'magnet'},{id:'flow',name:'Sık çağrı',text:'Işık çağrısı 12 yerine 9 saniyede hazır olur.',icon:'slow'}],
 koru:[{id:'focus',name:'Uzun atılma',text:'Atılma mesafesi %40 artar.',icon:'dash'},{id:'flow',name:'Çevik dönüş',text:'Atılma 8 yerine 6 saniyede hazır olur.',icon:'slow'}],
 pera:[{id:'focus',name:'Kalıcı koruma',text:'Kalkanın etkin kalma süresi 5 yerine 8 saniye olur; bir darbe engeller.',icon:'shield'},{id:'flow',name:'Yenilenen kanat',text:'Kanat kalkanı 14 yerine 11 saniyede hazır olur.',icon:'wing'}]};
 function mastery(raw){const unlocked=Array.isArray(raw?.unlocked)?[...new Set(raw.unlocked.filter(k=>['focus','flow'].includes(k)))]:[];return {unlocked,active:unlocked.includes(raw?.active)?raw.active:''};}
 function records(raw){const out={};for(const [key,r]of Object.entries(raw||{})){if(!/^(garden|grove)-(?:[1-9]|1[0-9]|20)$/.test(key)||!r||typeof r!=='object')continue;out[key]={};for(const k of ['bestScore','bestCombo','clears','flawless','attempts'])out[key][k]=Number.isSafeInteger(r[k])?Math.max(0,Math.min(1e9,r[k])):0;}return out;}
 function active(p){const pet=p.pets[p.active];return pet.points>=102?mastery(pet.mastery).active:'';}
 function unlock(p,key){const pet=p.pets[p.active];if(pet.points<102||!['focus','flow'].includes(key))return false;const m=mastery(pet.mastery);if(!m.unlocked.includes(key)){if(p.essence<40)return false;p.essence-=40;m.unlocked.push(key);}m.active=key;pet.mastery=m;return true;}
 function record(p,region,n,result){p.records=records(p.records);const key=region+'-'+n,previous=p.records[key]||{bestScore:0,bestCombo:0,clears:0,flawless:0,attempts:0},r={...previous,attempts:previous.attempts+1};if(result.won){r.clears++;r.bestScore=Math.max(r.bestScore,result.score);r.bestCombo=Math.max(r.bestCombo,result.combo);if(result.hits===0)r.flawless++;}p.records[key]=r;return {previous,current:r,newScore:result.won&&previous.clears>0&&result.score>previous.bestScore,newCombo:result.won&&previous.clears>0&&result.combo>previous.bestCombo,flawless:result.won&&result.hits===0};}
 function phase(elapsed,duration){return elapsed/duration<.3?0:elapsed/duration<.72?1:2;}
 function pattern(m,elapsed,serial,region){const part=phase(elapsed,m.duration);if(region==='garden'&&m.number===1)return 'drift';if(!part)return m.pattern;const pool=m.number<=3?['drift','cross']:m.number<6?['rain','cross']:['cross','sentry',...(region==='grove'||m.number>=12?['hunter']:['zigzag'])];return serial%2===0?m.pattern:pool[(serial+part)%pool.length];}
 return {options,mastery,records,active,unlock,record,phase,pattern};
})();
