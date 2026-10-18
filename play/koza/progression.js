'use strict';
window.KozaProgress=(()=>{
 const catalog={
  lumi:{name:'Lumi',kind:'Su ruhu',price:0,file:'lumi-soft-v10.png',trait:'Işık çekimi',forms:['Minik damla','Filiz yüzgeç','Mercan ruhu','Gelgit koruyucusu'],description:'Işık çağrısıyla 5 saniye boyunca parıltıları uzaktan çeker. Her yıldızda doğal çekim mesafesi artar.'},
  koru:{name:'Koru',kind:'Orman tilkisi',price:360,file:'koru-soft-v10.png',trait:'Çeviklik',forms:['Orman yavrusu','Kuyruk filizi','Dal boynuzu','Orman muhafızı'],description:'Atılma yeteneğiyle kısa süre korunarak hızlanır. Her yıldızda koşu hızı artar.'},
  pera:{name:'Pera',kind:'Gece kanadı',price:780,file:'pera-evolution.png',trait:'Toparlanma',forms:['Pofuduk yavru','Gece tüyü','Ay kanadı','Yıldız kelebeği'],description:'Kanat kalkanı bir darbeyi engeller. Her yıldızda hasar sonrası koruması uzar.'}
 };
 const bounds=[0,12,42,102],number=n=>Number.isFinite(Number(n))?Math.max(0,Math.floor(Number(n))):0;
 function stage(points){points=number(points);let star=0;while(star<3&&points>=bounds[star+1])star++;return {star,progress:star===3?0:points-bounds[star],required:star===3?0:bounds[star+1]-bounds[star],remaining:star===3?0:bounds[star+1]-points};}
 function migratePoints(n){n=number(n);const old=[0,10,30,70];let i=0;while(i<3&&n>=old[i+1])i++;return i===3?102:bounds[i]+Math.floor((n-old[i])/(old[i+1]-old[i])*(bounds[i+1]-bounds[i]));}
 function migrateV5(n){n=number(n);const old=[0,60,240,660];let i=0;while(i<3&&n>=old[i+1])i++;return i===3?102:bounds[i]+Math.floor((n-old[i])/(old[i+1]-old[i])*(bounds[i+1]-bounds[i]));}
 function normalize(raw){const a=raw&&typeof raw==='object'?raw:{};const pets={};
  for(const id of Object.keys(catalog)){const old=a.version>=3?a.pets?.[id]:null;if(id==='lumi'||old){pets[id]={name:typeof old?.name==='string'&&old.name.trim()?old.name.slice(0,18):id==='lumi'&&typeof a.name==='string'&&a.name.trim()?a.name.slice(0,18):catalog[id].name,points:a.version>=6?number(old?.points):a.version>=4?migrateV5(old?.points):migratePoints(old?old.points:id==='lumi'?a.xp:0)};}}
  for(const [id,pet]of Object.entries(pets))pet.mastery=pet.points>=102?KozaDepth.mastery(a.pets?.[id]?.mastery):KozaDepth.mastery(null);
  const campaign={garden:Array(20).fill(0),grove:Array(20).fill(0),selected:{garden:1,grove:1},groveUnlocked:false};
  if(a.version>=5&&a.campaign){for(const id of ['garden','grove']){let blocked=false;campaign[id]=campaign[id].map((_,i)=>{const v=a.campaign[id]?.[i];if(blocked||!Number.isInteger(v)||v<1||v>3){blocked=true;return 0;}return v;});const first=campaign[id].findIndex(x=>x===0);campaign.selected[id]=Math.max(1,Math.min(first<0?20:first+1,number(a.campaign.selected?.[id])||1));}campaign.groveUnlocked=campaign.garden.every(x=>x>0);}
  else campaign.groveUnlocked=false;
  return {version:6,records:KozaDepth.records(a.records),essence:number(a.essence),challenge:{best:Math.min(999,number(a.challenge?.best)),runs:number(a.challenge?.runs)},campaign,region:a.region==='grove'&&campaign.groveUnlocked?'grove':'garden',coins:number(a.coins),xp:number(a.xp),runs:number(a.runs),best:number(a.best),magnet:Math.min(5,number(a.magnet)),active:Object.hasOwn(pets,a.active)?a.active:'lumi',pets};
 }
 function buy(p,id){if(!Object.hasOwn(catalog,id)||p.pets[id]||p.coins<catalog[id].price)return false;p.coins-=catalog[id].price;p.pets[id]={name:catalog[id].name,points:0};p.active=id;return true;}
 function select(p,id){if(!Object.hasOwn(catalog,id)||!p.pets[id])return false;p.active=id;return true;}
 function feed(p){const pet=p.pets[p.active],s=stage(pet.points),cost=Math.min(6,s.remaining,p.essence);if(!cost||p.essence<cost)return null;p.essence-=cost;pet.points+=cost;return {cost,before:s.star,after:stage(pet.points).star};}
 function stats(p){const star=stage(p.pets[p.active].points).star;return {radius:40+p.magnet*10+(p.active==='lumi'?12+star*6:0),speed:235+(p.active==='koru'?star*15:0),protection:1.8+(p.active==='pera'?star*.3:0)};}
 return {catalog,stage,normalize,buy,select,feed,stats};
})();
