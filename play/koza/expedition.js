'use strict';
window.KozaExpedition=(()=>{
 const regions={garden:{name:'Ayışığı Bahçesi',description:'Ay ışığında parlayan su bahçeleri. Diken çemberleri, çapraz gölgeler ve parıltı adaları.',image:'garden-arena-v50.png'},grove:{name:'Rüzgâr Korusu',description:'Sisli yüksek korular. Kanatlı tohumlar, bulut çiçekleri ve fırtına muhafızları.',image:'grove-arena-v50.png'}};
 // name, objective, target, duration, hazard pattern, light layout
 const garden=[
 ['İlk Adım','gather',10,30,'drift','scatter'],['Parıltı Kıyısı','gather',14,32,'drift','clusters'],['İnce Akış','chain',4,32,'drift','trail'],['Sakin Sular','survive',8,35,'rain','scatter'],['Taş Geçidi','mixed',16,38,'cross','trail'],
 ['Yosun Adaları','gather',18,38,'sentry','clusters'],['Ay Halkası','chain',5,38,'sentry','ring'],['Diken Yağmuru','survive',10,40,'rain','scatter'],['İki Kıyı','gather',20,40,'cross','clusters'],['Bahçenin Kalbi','mixed',22,44,'sentry','ring'],
 ['Gümüş İz','chain',6,42,'zigzag','trail'],['Derin Havuz','gather',24,44,'sentry','ring'],['Kesişen Yollar','survive',12,44,'cross','scatter'],['Nilüfer Çemberi','chain',6,46,'rain','ring'],['Ay Tutulması','mixed',26,48,'zigzag','clusters'],
 ['Son Işıklar','gather',28,48,'cross','trail'],['Diken Labirenti','survive',14,48,'sentry','clusters'],['Kesintisiz Akış','chain',7,50,'zigzag','trail'],['Sessiz Nöbet','mixed',28,50,'rain','ring'],['Ay Kapısı','mixed',30,55,'cross','clusters']];
 const grove=[
 ['Esinti Eşiği','gather',16,36,'drift','trail'],['Rüzgâr Basamakları','chain',5,38,'rain','trail'],['İlk Takip','survive',10,40,'hunter','scatter'],['Sis Adaları','gather',20,40,'sentry','clusters'],['Kök Köprüsü','mixed',22,44,'cross','trail'],
 ['Dönen Yapraklar','chain',6,42,'zigzag','ring'],['Avcı Patikası','gather',24,44,'hunter','clusters'],['Karşı Akıntı','survive',12,44,'rain','trail'],['İkiz Esinti','chain',6,46,'cross','ring'],['Korunun Gözü','mixed',26,48,'hunter','scatter'],
 ['Fırtına İzi','gather',28,46,'zigzag','trail'],['Kadim Kökler','survive',14,48,'sentry','clusters'],['Yüksek Geçit','chain',7,48,'cross','trail'],['Yakın Takip','gather',30,50,'hunter','ring'],['Mor Ufuk','mixed',30,50,'rain','clusters'],
 ['Kırılan Rüzgâr','chain',8,50,'zigzag','trail'],['Üç Gölge','survive',16,52,'hunter','scatter'],['Son Sığınak','gather',32,52,'sentry','ring'],['Fırtına Çemberi','mixed',32,54,'cross','ring'],['Rüzgârın Kalbi','mixed',34,58,'hunter','trail']];
 const patternNames={drift:'Süzülen gölgeler',rain:'Yukarıdan inen dikenler',cross:'Çapraz geçişler',sentry:'Nişancı nöbetçiler',zigzag:'Zikzak gölgeler',hunter:'Hamleci avcılar'};
 // v5.13 pacing: stages grow gently across a region (duration up to +25%, light
 // targets up to +20%, chapter 1 unchanged) and escalate inside each tier (spawn
 // interval -3.5% and +2 speed per step, one extra enemy slot late in tiers 2-4).
 // Bosses, chain targets, rewards formula and the 20-stage structure are unchanged.
 function level(region,n){const rows=region==='grove'?grove:garden,index=Math.max(0,Math.min(19,Math.floor(n)-1)),r=rows[index],tier=Math.floor(index/5),id=(index+1)%5===0?'boss':r[1],step=index%5,grow=index/18;return {number:index+1,name:r[0],id,target:id==='boss'?0:id==='chain'?r[2]:Math.round(r[2]*(1+.2*grow)),duration:id==='boss'?(index===19?(region==='grove'?110:100):60+tier*10):Math.round(r[3]*(1+.25*grow)),boss:id==='boss',pattern:r[4],layout:r[5],comboTarget:id==='mixed'?4+tier:0,minLives:id==='survive'?2:1,interval:Math.max(1.25,(2.9-tier*.27-(region==='grove'?.25:0))*(1-.035*Math.min(3,step))),speed:36+tier*9+(region==='grove'?9:0)+2*Math.min(3,step),maxHazards:Math.min(8,4+tier+(region==='grove'?1:0)+(tier>=1&&step>=2&&id!=='boss'?1:0)),wind:0,shotSpeed:120+tier*15,fireDelay:2.5-tier*.15,chaseSpeed:68+tier*10,dashSpeed:190+tier*15,bonus:(region==='grove'?12:8)+tier*3,patternName:patternNames[r[4]]};}
 function unlocked(p,id){return id==='garden'||id==='grove'&&(p.campaign.garden.length===20&&p.campaign.garden.every(x=>x>0));}
 function next(p,id){const i=p.campaign[id].findIndex(x=>x===0);return i<0?20:i+1;}
 function available(p,id,n){return Object.hasOwn(regions,id)&&Number.isInteger(n)&&n>=1&&n<=20&&unlocked(p,id)&&n<=next(p,id);}
 function mission(p){const id=unlocked(p,p.region)?p.region:'garden';return level(id,p.campaign.selected[id]);}
 function goal(m,r){return m.id==='boss'?!!r.bossDone:m.id==='chain'?r.maxCombo>=m.target:m.id==='mixed'?r.score>=m.target&&r.maxCombo>=m.comboTarget:r.score>=m.target&&(m.id!=='survive'||r.lives>=m.minLives);}
 function completed(m,r){return r.survived&&r.lives>=m.minLives&&goal(m,r);}
 function description(m){return m.id==='boss'?'Koruyucunun saldırılarından kaç ve süre dolana kadar dayan. Altın ışıklar ödülünü büyütür.':m.id==='chain'?m.target+' parıltılık seri yap ve süreyi tamamla.':m.id==='mixed'?m.target+' parıltı topla, '+m.comboTarget+' seri yap ve süreyi tamamla.':m.id==='survive'?m.target+' parıltı topla ve en az 2 canla süreyi tamamla.':m.target+' parıltı topla ve süreyi tamamla.';}
 function settle(p,region,m,r){const won=completed(m,r),previous=p.campaign[region][m.number-1],stars=won?(r.lives>=3?3:r.lives>=2?2:1):0,first=won&&previous===0,base=Math.floor(r.score/3),bonus=won?(first?m.bonus:4+Math.floor((m.number-1)/5)*2):0;if(won){p.campaign[region][m.number-1]=Math.max(previous,stars);if(region==='garden'&&m.number===20)p.campaign.groveUnlocked=true;}return {won,stars,first,base,bonus,total:base+bonus,essence:won?2+stars:0};}
 return {regions,level,unlocked,next,available,mission,goal,completed,description,settle};
})();
