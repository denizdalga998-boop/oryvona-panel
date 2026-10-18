'use strict';
window.KozaSaveStore=(()=>{
 const key='koza-v1',backupKey=key+'-backup',damagedKey=key+'-damaged',recoveryKey=key+'-recovery';
 let recovery='none',backupOK=true;
 function parse(raw){
  if(raw===null)return null;
  const value=JSON.parse(raw);
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid save');
  if(value.version!==undefined&&(!Number.isInteger(value.version)||value.version<1||value.version>6))throw Error('Unsupported save version');
  return value;
 }
 function load(normalize){
  recovery='none';backupOK=true;
  let raw;
  try{raw=localStorage.getItem(key);}catch{recovery='unavailable';return normalize({});}
  try{
   const primary=parse(raw);
   if(primary){
    try{if(localStorage.getItem(recoveryKey)==='backup')recovery='backup';}catch{recovery='backup';}
    return normalize(primary);
   }
  }catch{recovery='unavailable';}
  try{
   const backup=parse(localStorage.getItem(backupKey));
   if(backup){recovery='backup';return normalize(backup);}
  }catch{backupOK=false;recovery='unavailable';}
  try{
   const pending=JSON.parse(localStorage.getItem('koza-sync')||'null')?.pending;
   if(pending){const queued=parse(JSON.stringify(pending));recovery='backup';return normalize(queued);}
  }catch{}
  return normalize({});
 }
 function acknowledge(){
  recovery='none';
  try{localStorage.removeItem(recoveryKey);}catch{}
 }
 function preserve(raw){
  const damaged=localStorage.getItem(damagedKey);
  if(damaged!==null&&damaged!==raw)throw Error('Recovery archive already occupied');
  if(damaged===null)localStorage.setItem(damagedKey,raw);
 }
 function write(profile,{replaceDamaged=false}={}){
  if(recovery==='unavailable'&&!replaceDamaged)return false;
  try{
   const raw=localStorage.getItem(key),next=JSON.stringify(profile);
   let previous=null;
   try{previous=parse(raw);}catch{
    // Keep the original bytes before any recovery can replace the primary save.
    preserve(raw);
   }
   if(raw===null){const backup=localStorage.getItem(backupKey);try{parse(backup);}catch{preserve(backup);}}
   if(recovery==='backup'&&!replaceDamaged)localStorage.setItem(recoveryKey,'backup');
   localStorage.setItem(key,next);
   backupOK=true;
   try{
    const backup=localStorage.getItem(backupKey);
    let validBackup=false;try{validBackup=!!parse(backup);}catch{}
    if(previous&&raw!==next)localStorage.setItem(backupKey,raw);
    else if(!validBackup)localStorage.setItem(backupKey,next);
   }catch{backupOK=false;}
   try{localStorage.setItem('koza-lastsave',new Date().toISOString());}catch{}
   if(replaceDamaged)acknowledge();
   return true;
  }catch{return false;}
 }
 return {load,write,acknowledge,get recovery(){return recovery;},get canSync(){return recovery!=='unavailable';},get backupOK(){return backupOK;}};
})();
