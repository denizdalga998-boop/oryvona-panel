/* Shared home/Test launch and Back boundary. No model calls or automatic store/download fallbacks. */
(function (win) {
  'use strict';
  var doc = win.document, config = null, player = null, returnFocus = null, previousState = null, playerOwner = null;
  var BASE = 'https://denizdalga998-boop.github.io/oryvona-panel/';
  var WEB = {koza:'play/koza/k01.html?panel=1','charm-drop':'play/charm-drop/index.html'};
  var NATIVE = ['forge-run','aeryo','tupsper'];
  var NAMES = {koza:'KOZA','charm-drop':'Charm Drop','forge-run':'Forge Run',aeryo:'AERYO',tupsper:'Tuckspire'};
  function notice(message) {
    var target = doc.getElementById('gameLaunchStatus');
    if (!target) {
      target = doc.createElement('p'); target.id = 'gameLaunchStatus'; target.setAttribute('role','status'); target.setAttribute('aria-live','polite');
      Object.assign(target.style,{position:'fixed',left:'16px',right:'16px',top:'16px',zIndex:'100001',background:'#10263b',color:'#edf7ff',padding:'14px',borderRadius:'12px'});
      var close = doc.createElement('button'); close.type='button';close.textContent='Kapat';close.addEventListener('click',function(){target.hidden=true;});
      target.append(doc.createElement('span'),close);doc.body.append(target);
    }
    target.firstChild.textContent=message+' '; target.hidden=false;
  }
  function close(owner) {
    if (!player || (owner && playerOwner!==owner)) return false;
    var old=player; player=null;playerOwner=null;
    var frame=old.querySelector('iframe');if(frame){frame.src='about:blank';frame.remove();}
    old.close();old.remove();doc.body.classList.remove('game-player-open');
    if(win.history.state && win.history.state.oryvonaPlayer)win.history.replaceState(previousState,'',win.location.href);
    previousState=null;
    if(returnFocus && returnFocus.isConnected!==false)returnFocus.focus({preventScroll:true});returnFocus=null;
    return true;
  }
  function requestClose() {
    if(!win.ArgonNative && win.history.state && win.history.state.oryvonaPlayer)win.history.back();
    else close();
  }
  async function open(game) {
    var id=game && game.id;
    if(NATIVE.indexOf(id)>=0){
      var result;
      try{result=win.ArgonNative ? await win.ArgonNative.launchGame(id) : {status:'native_required'};}
      catch(_){result={status:'launch_failed'};}
      var messages={not_installed:'bu telefonda kurulu değil veya başlatılabilir durumda değil.',not_allowed:'izin verilen oyunlar arasında değil.',native_required:'yerel uygulamasını açmak için Argon Android APK’sını kullanın.',native_not_ready:'başlatıcısı henüz hazır değil. Birkaç saniye sonra yeniden deneyin.',timeout:'başlatma sonucu doğrulanamadı. Yeniden denemeden önce telefonu kontrol edin.',launch_denied:'Android tarafından başlatılamadı.',launch_failed:'başlatılamadı.'};
      if(result.status!=='launched')notice((NAMES[id]||id)+' '+(messages[result.status]||'başlatma sonucu doğrulanamadı.'));
      return result;
    }
    // Only the two known web games are opened, at the existing network origin, never under /oryvona-apk/.
    if(!Object.prototype.hasOwnProperty.call(WEB,id))return {status:'not_allowed'};
    close();returnFocus=doc.activeElement;
    var dialog=doc.createElement('dialog');dialog.id='gamePlayer';dialog.className='game-player sv-game-window';
    dialog.setAttribute('aria-label',NAMES[id]+' oyun testi');
    Object.assign(dialog.style,{display:'flex',flexDirection:'column',animation:'none'});
    var head=doc.createElement('header');head.className='sv-game-head';
    var back=doc.createElement('button');back.type='button';back.className='sv-button sv-game-close';back.textContent='‹ STÜDYOYA DÖN';
    back.addEventListener('click',requestClose);head.append(back);
    var frame=doc.createElement('iframe');frame.title=NAMES[id]+' oyun testi';frame.className='sv-game-frame';
    // Opaque game origin cannot access the privileged main-document port or owner storage.
    frame.setAttribute('sandbox','allow-scripts allow-pointer-lock');frame.setAttribute('referrerpolicy','no-referrer');frame.setAttribute('allow',"fullscreen 'none'");
    frame.style.setProperty('height','0','important');frame.style.setProperty('flex','1 1 0');frame.style.setProperty('min-height','0');
    frame.src=new URL(WEB[id],BASE).href;
    dialog.append(head,frame);doc.body.append(dialog);player=dialog;playerOwner=game.owner||null;doc.body.classList.add('game-player-open');
    dialog.addEventListener('cancel',function(e){e.preventDefault();requestClose();});
    dialog.addEventListener('oryvona:player-back',function(){close();});
    previousState=win.history.state;
    if(!win.ArgonNative)win.history.pushState(Object.assign({},previousState,{oryvonaPlayer:id}),'',win.location.href);
    dialog.showModal();back.focus();return {status:'opened',gameId:id};
  }
  function handleBack(event) {
    if(close())return 'handled';
    if(win.OryvonaNativeShell){
      if(event && win.OryvonaNativeShell.handlePopState(event))return 'handled';
      if(win.OryvonaNativeShell.dismissActive())return 'handled';
    }
    var modal=doc.querySelector('dialog[open], .modal-backdrop:not([hidden]), #linkModal:not([hidden])');
    if(modal){modal.hidden=true;if(typeof modal.close==='function')modal.close();return 'handled';}
    if(!config)return 'unavailable';
    if(config.getView()!=='home'){config.goHome();return 'handled';}
    return 'home'; // Android requests explicit exit confirmation. Browser PWA retains its guard.
  }
  var WEB_BUILD='Argon v1.5 stabil (2026-10-23)';
  function renderVersion() {
    var target=doc.getElementById('verInfo');if(!target)return;
    var info=win.ArgonNative && win.ArgonNative.getAppInfo();
    // WEB_BUILD tells Deniz which published web build the app is really running (the APK only carries the native bridge).
    target.textContent=info && info.versionCode ? 'APK '+info.versionName+' ('+info.versionCode+') · Paketlenen arayüz: '+(info.shell && info.shell.uiVersion || 'doğrulanamadı')+' · '+info.shellMode+' · Web arayüzü: '+WEB_BUILD : 'Web arayüzü: '+WEB_BUILD+' · APK bilgisi yok';
    if(info && info.shell && info.shell.snapshotSha256)target.title='Paketlenen kabuk SHA-256: '+info.shell.snapshotSha256;
  }
  win.OryvonaGameNavigation=Object.freeze({open:open,close:close,handleBack:handleBack,renderVersion:renderVersion,configure:function(value){config=value;renderVersion();}});
  win.addEventListener('pagehide',function(){close();});
})(window);
