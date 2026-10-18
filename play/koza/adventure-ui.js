'use strict';
/* Q2: the hero ability is automatic; the button/Space binding exists only in the ?manualAbility=1 A/B build */
if(!KozaAdventure.auto){$('ability').onclick=()=>KozaAdventure.ability();document.addEventListener('keydown',e=>{if(e.code==='Space'&&mode==='play'){e.preventDefault();KozaAdventure.ability();}});}
$('powerChoice').addEventListener('cancel',e=>e.preventDefault());
$('challengeOpen').onclick=()=>KozaAdventure.startChallenge();
$('feedbackSend').onclick=()=>{const rating=Number($('feedbackRating').value),text=$('feedbackText').value.trim().slice(0,500);if(!rating)return;KozaCloud.event('feedback',{rating,text});$('feedbackStatus').textContent='Teşekkürler. Görüşün kaydedilmek üzere alındı.';$('feedbackSend').disabled=true;};
