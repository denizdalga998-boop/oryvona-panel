'use strict';
// Gameplay collision shapes, derived from the drawn sizes. Bodies are circles
// that cover the creature's torso/head, never hair, leaves, fins, tails or wing
// tips, so KOZA stays slightly forgiving while visible body contact is consistent.
window.KozaHitbox=(()=>{
 const VISUAL=Object.freeze({hero:76,enemyScale:1.2,enemyBase:{hunter:48,default:42}});
 const BODY=Object.freeze({
  hero:.23,      // of the hero's drawn size (76 px -> 17.5 px body radius)
  enemy:.38,     // of an enemy's drawn size (50.4 px -> 19.2, hunter 57.6 -> 21.9)
  pickup:20      // orb collection stays generous (unchanged)
 });
 const heroBody=(size=VISUAL.hero)=>size*BODY.hero;
 const enemySize=kind=>(VISUAL.enemyBase[kind]||VISUAL.enemyBase.default)*VISUAL.enemyScale;
 const enemyBody=kind=>enemySize(kind)*BODY.enemy;
 // Boss effects are drawn relative to the guardian's fitted size; hit bands
 // follow the same factor so a larger screen does not shrink effective hits.
 const bossFx=b=>Math.max(.8,Math.min(1.35,(b?.size||166)/166));
 const boss=Object.freeze({
  bolt:b=>9.2*bossFx(b)+heroBody(),          // bolt core + hero body (was 24 px)
  ringBand:b=>7*bossFx(b)+heroBody()*.6,       // ring glow half-thickness (was 18/19 px)
  storm:b=>26*bossFx(b)+heroBody(),            // storm impact core (was 43 px)
  dive:b=>b.r+heroBody()*.7,                   // owl dive body (was r+12)
  body:b=>b.r+heroBody()*.8,                   // guardian body contact (was r+14)
  flame:o=>o.r+heroBody()*.5                   // dragon breath/flame bolts (was r+9)
 });
 return {VISUAL,BODY,heroBody,enemySize,enemyBody,bossFx,boss,
  // Minimum distance an entering enemy's first harmful position keeps from the hero.
  safeSpawnDistance:()=>Math.max(150,VISUAL.hero*2)};
})();
