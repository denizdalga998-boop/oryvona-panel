// v22: durable commands live in IndexedDB. Shell updates never erase that queue or existing game caches.
const CACHE = 'oryvona-panel-v26-argon-sohbet-20261026-r7';
// Game payloads did not change in v22: retain the v20 on-demand cache instead of forcing a download.
const GAME_CACHE = 'oryvona-games-v20';
const SCOPE = new URL('./', self.registration.scope);
const SHELL = ["./argon-native.js?v=20261021-web1","./studio-bootstrap.js?v=20261021-personal2","./personal-access.js?v=20261021-session1","./game-navigation.js?v=20261021-v19","./","./badge-192.png","./badge-96.png","./command-outbox.js?v=20261020-gemini1","./config.js?v=20261021-argon3","./data/game-builds.json","./data/vault-manifest.json","./game-lab.css?v=20261020-gemini1","./game-lab.js?v=20261021-android1","./icon-192.png","./icon-512-maskable.png","./icon-512.png","./index.html","./jarvis-bridge.js?v=20261021-v21","./jarvis-brief.js?v=20261020-gemini1","./jarvis-energy.js?v=20261021-v19","./jarvis-v23-shell.css?v=20261021-v18","./jarvis-voice.js?v=20261021-sync2","./jarvis-world.css?v=20261021-v18","./jarvis-world.js?v=20261021-v26","./logo.png","./logo.webp","./manifest.json","./mark.png","./native-shell.css?v=20261020-gemini1","./native-shell.js?v=20261021-android1","./studio-data-v26.js?v=20261021-v20","./studio-decisions-v26.js?v=20261020-gemini1","./studio-facade-v26.js?v=20261021-personal2","./studio-integration-v26.css?v=20261021-v18","./studio-v26-bootstrap.js?v=20261021-personal3","./studio-v26.css?v=20261021-v19","./studio-world-v26.js?v=20261021-v20","./supabase-host-port.js?v=20261021-v21","./vendor/supabase-2.45.4.min.js?v=20261020-gemini1","./studio-flow.js?v=20261026-argon-canli1","./studio-flow-bootstrap.js?v=20261026-independent-workers2","./studio-flow.css?v=20261026-independent-workers2","./studio-gemini-client.js?v=20261021-v20"];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
// Activation removes only panel shell caches; consent-loaded oryvona-m2-model- caches and game caches remain intact.
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('oryvona-panel-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
async function remember(cacheName,request,response){
  if(!response.ok || response.type==='opaque')return;
  try{const cache=await caches.open(cacheName);await cache.put(request,response);if(cacheName===GAME_CACHE){const keys=await cache.keys();if(keys.length>256)await Promise.all(keys.slice(0,keys.length-256).map(key=>cache.delete(key)));}}catch{/* Quota/storage denial must never prevent online play. */}
}
self.addEventListener('fetch',event=>{
  const {request}=event,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==SCOPE.origin||!url.pathname.startsWith(SCOPE.pathname)||request.headers.has('range')||url.pathname.endsWith('/sw.js'))return;
  const game=url.pathname.startsWith(SCOPE.pathname+'play/');
  const navigation=request.mode==='navigate';
  event.respondWith((async()=>{
    const cache=await caches.open(game?GAME_CACHE:CACHE);
    if(game&&!navigation){const hit=await cache.match(request);if(hit)return hit;}
    try{const response=await fetch(request);if(response.ok)event.waitUntil(remember(game?GAME_CACHE:CACHE,request,response.clone()));return response;}
    catch{
      const hit=await cache.match(request);if(hit)return hit;
      if(!game&&navigation&&(url.pathname===SCOPE.pathname||url.pathname===SCOPE.pathname+'index.html')){const shell=await cache.match(new URL('index.html',SCOPE));if(shell)return shell;}
      if(game&&navigation)return new Response('<!doctype html><html lang="tr"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Oyun çevrimdışı hazır değil</title><body style="background:#10101d;color:#eee;font:16px/1.6 system-ui;padding:24px"><h1>Bağlantı gerekli</h1><p>Bu oyun henüz bu cihazda önbelleğe alınmadı. Üstteki Panel düğmesiyle geri dönüp bağlantı geldiğinde yeniden dene.</p></body></html>',{status:503,headers:{'Content-Type':'text/html; charset=utf-8'}});
      return new Response('',{status:503,statusText:'Offline asset unavailable'});
    }
  })());
});
self.addEventListener('push',event=>{
  let data={};try{data=event.data?event.data.json():{};}catch{data={body:event.data?.text()||''};}
  event.waitUntil(self.registration.showNotification(data.title||'Oryvona Games Paneli',{body:data.body||'',icon:'./icon-192.png',badge:'./badge-96.png',tag:data.tag||'oryvona',renotify:!!data.tag,data:{url:data.url||'./'}}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();let url;try{url=new URL(event.notification.data?.url||'./',SCOPE);}catch{url=SCOPE;}
  if(url.origin!==SCOPE.origin||!url.pathname.startsWith(SCOPE.pathname))url=SCOPE;
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async list=>{for(const client of list){if(client.url.startsWith(SCOPE.href)&&'focus'in client){if(client.navigate)await client.navigate(url.href);return client.focus();}}return self.clients.openWindow(url.href);}));
});
