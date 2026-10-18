'use strict';
window.KozaEntrance=(()=>{
 let age=0,duration=1.25,active=false;
 const panel=document.getElementById('entrance');
 function cancel(){active=false;panel.hidden=true;document.body.classList.remove('entering-game');}
 function start(m,reduced){age=0;duration=reduced?.8:1.25;active=true;panel.hidden=false;panel.style.backgroundColor=reduced?'#073c4999':'#073c49';panel.style.opacity='1';document.getElementById('entranceChapter').textContent='BÖLÜM '+m.number+' · '+m.name;document.getElementById('entranceTitle').textContent='Hazır';document.getElementById('entranceGoal').textContent=Expedition.description(m);document.body.classList.add('entering-game');}
 function tick(dt){if(!active)return;age+=dt;const progress=age/duration;panel.style.backgroundColor='rgba(7,60,73,'+Math.max(.24,1-progress*2.4)+')';panel.style.opacity=String(Math.min(1,(1-progress)/.13));if(progress>=.48)document.getElementById('entranceTitle').textContent='Başla!';if(age>=duration){cancel();window.KozaAudio.setMode('play');}}
 return {start,tick,cancel,get active(){return active;}};
})();
