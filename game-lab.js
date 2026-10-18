/* v19: local, versioned game builds + evidence. Never manufactures live QA or executes a game on the runner. */
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tr = () => (window.OryvonaPanel?.getContext().locale || document.documentElement.lang || 'tr').startsWith('tr');
  const text = (a,b) => tr() ? a : b;
  let games = [], selected = 'koza', tab = 'build', dialog = null, returnFocus = null, loadingTimer = null, pending = '', lastSignature = '';
  const context = () => window.OryvonaPanel?.getContext() || {};
  const game = () => games.find(g => g.id === (context().projectId || selected)) || games.find(g => g.id === selected);
  const size = bytes => Number.isFinite(bytes) ? `${(bytes / 1e6).toLocaleString(tr() ? 'tr' : 'en', {maximumFractionDigits:2})} MB` : '—';
  const statusName = s => ({PARTIAL:text('Kısmi kanıt','Partial evidence'),RECORDED_PASS_WITH_LIMITS:text('C21 kabulü · sınırları var','C21 accepted · limits remain'),DEVICE_PENDING:text('Cihaz testi bekliyor','Device test pending'),OPEN:text('QA açık','QA open')})[s] || text('Doğrulanmamış','Unverified');
  const summary = id => ({
    koza:text('6 dalgalı K01 pilotu. Kayıtlı QA’da Koru örnekleme engeli var; dokunmatik ve fiziksel telefon kabulü tamamlanmadı.','Six-wave K01 pilot. Recorded QA has a Koru sampling blocker; touch and physical-phone acceptance are incomplete.'),
    'charm-drop':text('Kabul edilen oynanabilir sürüm C21. C22 görev olarak hazırlanmış; henüz bu sürüme uygulanmamış.','The accepted playable build is C21. C22 is prepared work, not an implemented release.'),
    aeryo:text('Gerçek 1.2.0 web oynatıcısı ve Android paket kayıtları. 300 bölüm; fiziksel telefon testi bekliyor.','Actual 1.2.0 web player and Android artifact records. 300 levels; physical-phone testing is pending.'),
    'forge-run':text('FR25J Android test paketi. WebGL çıktısı yok; gerçek build, sahne ve QA kanıtlarını aşağıdan inceleyebilirsin.','FR25J Android test package. No WebGL output exists; inspect the actual build, scenes and QA evidence below.')
  })[id] || '';
  function row(label, value) { return `<div class="lab-row"><span>${esc(label)}</span><strong>${esc(value ?? text('Bilinmiyor','Unknown'))}</strong></div>`; }
  function details(g) {
    if (tab === 'content') {
      const l = g.levels || {};
      return row(text('Uygulanan bölüm / dalga','Implemented levels / waves'),l.implemented) + (l.planned != null ? row(text('Planlanan','Planned'),l.planned) : '') + (l.dailyBoards != null ? row(text('Günlük oyun tahtası','Daily boards'),l.dailyBoards) : '') + (l.secondsPerWave ? row(text('Dalga süresi','Wave duration'),`${l.secondsPerWave} s`) : '') + `<ul class="lab-scenes">${(g.scenes || []).map(s => `<li><b>${esc(s.name)}</b><small>${esc(s.status)}</small></li>`).join('')}</ul>`;
    }
    if (tab === 'qa') {
      const q = g.qa || {};
      const counts = [['codePassed','Kod','Code'],['browserPassed','Tarayıcı','Browser'],['naturalPassed','Oynanış','Gameplay'],['lifecyclePassed','Yaşam döngüsü','Lifecycle'],['lumiPassed','Lumi','Lumi'],['standardPassed','Standart kontrol','Standard checks'],['presentationChecksPassed','Sunum kontrolü','Presentation checks'],['customerChecksPassed','Müşteri kontrolü','Customer checks'],['contentChecksPassed','İçerik kontrolü','Content checks'],['androidArtifactChecksPassed','Paket kontrolü','Artifact checks']];
      return `<p class="lab-evidence-note">${text('Bunlar tarihli kaynak kanıtlarıdır. Yeni bir oynanış veya telefon testi yapılmış sayılmaz.','These are dated source records, not a new gameplay or phone test.')}</p>` + row(text('Kayıt tarihi','Evidence date'),q.observedAt) + row(text('Fiziksel telefon','Physical phone'),q.physicalPhone) + row(text('Dokunmatik','Touch'),q.touch || text('Yeni doğrulama yok','No fresh validation')) + counts.filter(([k]) => Number.isFinite(q[k])).map(([k,a,b])=>row(text(a,b),`${q[k]} ${text('kayıtlı başarılı kontrol','recorded passed checks')}`)).join('');
    }
    const hash = g.artifact?.sha256 || '';
    return row(text('Sürüm','Version'),g.version) + (g.versionCode != null ? row(text('Sürüm kodu','Version code'),g.versionCode) : '') + row(text('Oynatıcı / paket','Player / package'),g.runtime || g.platform) + row(text('Dosya boyutu','Artifact size'),size(g.artifact?.bytes)) + (hash ? `<div class="lab-row"><span>SHA-256</span><code title="${esc(hash)}">${esc(hash.slice(0,16))}…</code><button type="button" class="lab-copy" data-lab-copy="${esc(hash)}" aria-label="${text('SHA-256 kopyala','Copy SHA-256')}">${text('Kopyala','Copy')}</button></div>` : '');
  }
  function recentResult(g) {
    const r = window.OryvonaPanel?.getBuildValidation?.(g.id);
    if (!r) return `<p class="lab-note">${text('Yeni dosya/sürüm kontrolü için arka plan doğrulamasını kullan. Oynanış ve ses başlatılmaz.','Use background validation for a fresh file/version check. It launches no gameplay or audio.')}</p>`;
    const v = r.validation || r.result?.validation;
    const label = ({queued:text('Kuyrukta','Queued'),running:text('Doğrulanıyor','Validating'),done:text('Doğrulama tamamlandı','Validation completed'),failed:text('Doğrulama başarısız','Validation failed'),cancelled:text('İptal edildi','Cancelled')})[r.status] || r.status;
    const note = r.note || r.note_tr || r.result?.note_tr || '';
    const count = Number.isFinite(v?.checks?.total) ? `<p class="lab-count">${v.checks.passed}/${v.checks.total} ${text('dosya/paket kontrolü','file/artifact checks')}</p>` : '';
    const checks = Array.isArray(v?.checks) ? v.checks : (Array.isArray(v?.results) ? v.results : []);
    return `<div class="lab-validation"><b>${esc(label)}</b>${count}${note ? `<p>${esc(note)}</p>` : ''}${checks.length ? `<details><summary>${text('Dosya kontrol ayrıntıları','File check details')} (${checks.length})</summary><ul>${checks.map(c=>`<li>${esc(c.name || c.id || c.label)} · ${esc(c.status || (c.ok === true ? 'PASS' : c.ok === false ? 'FAIL' : 'UNKNOWN'))}</li>`).join('')}</ul></details>` : ''}<small>${text('Bu kontrol oynanış kabulü değildir.','This check is not gameplay acceptance.')}</small></div>`;
  }
  function render() {
    const target = document.getElementById('testsBody');
    if (!target) return;
    let lab = document.getElementById('gameLab');
    if (!lab) { lab = document.createElement('section'); lab.id='gameLab'; lab.className='card game-lab'; lab.setAttribute('aria-label',text('Gerçek oyun test merkezi','Actual game test center')); target.before(lab); }
    const g = game(); if (!g) { lab.innerHTML=`<p>${text('Oyun sürüm kayıtları yükleniyor…','Loading game build records…')}</p>`; return; }
    const c=context(), latest=window.OryvonaPanel?.getBuildValidation?.(g.id), busy=pending===g.id||['queued','running'].includes(latest?.status), canValidate=c.authenticated && c.isOwner && !c.demo;
    lab.innerHTML=`<div class="lab-heading"><div><span class="lab-eyebrow">${text('OYUN TEST MERKEZİ','GAME TEST CENTER')}</span><h2>${esc(g.name)}</h2></div><span class="chip warn">${esc(statusName(g.qa?.status))}</span></div><p class="lab-summary">${esc(summary(g.id))}</p><div class="lab-actions">${g.entry?`<button type="button" class="lab-primary" data-lab-play>${text('▶ Uygulama içinde oyna','▶ Play in app')}</button>`:`<span class="lab-no-web">${text('Android build incelemesi','Android build inspection')}</span>`}<button type="button" class="lab-secondary" data-lab-validate ${!canValidate || busy?'disabled':''}>${pending===g.id?text('Gönderiliyor…','Sending…'):text('Sessiz doğrulama','Silent validation')}</button></div>${!canValidate?`<small class="lab-note">${text('Arka plan komutu için sahip hesabıyla canlı giriş yap.','Sign in live as the owner to send a background command.')}</small>`:''}<div class="lab-tabs" role="tablist" aria-label="${text('Sürüm ayrıntıları','Build details')}">${[['build','Sürüm','Build'],['content','İçerik','Content'],['qa','QA','QA']].map(([id,a,b])=>`<button type="button" role="tab" aria-selected="${tab===id}" data-lab-tab="${id}">${text(a,b)}</button>`).join('')}</div><div class="lab-details" role="tabpanel">${details(g)}</div><div class="lab-result" aria-live="polite">${recentResult(g)}</div><p id="labNotice" class="lab-notice" role="status"></p>`;
    syncHero(g);
  }
  function syncHero(g) {
    const a=document.getElementById('playNowBtn'); if(!a)return;
    a.href='#'; a.removeAttribute('target');a.removeAttribute('download');a.removeAttribute('aria-disabled');a.classList.remove('no-link');
    const title=document.getElementById('playBtnTitle'),sub=document.getElementById('playVerSub'),arrow=document.getElementById('playArr');
    if(title)title.textContent=g.entry?text('Uygulama içinde oyna','Play in app'):text('Test ve sürüm incele','Inspect test build');
    if(sub)sub.textContent=g.version;if(arrow)arrow.textContent='›';
  }
  function stopPlayer() {
    clearTimeout(loadingTimer);
    if(!dialog)return;
    const frame=dialog.querySelector('iframe');if(frame){frame.src='about:blank';frame.remove();}
    dialog.close();dialog.remove();dialog=null;document.body.classList.remove('game-player-open');
    returnFocus?.focus?.();returnFocus=null;
  }
  function closePlayer() { if(history.state?.oryvonaPlayer)history.back();else stopPlayer(); }
  async function openPlayer(g) {
    if(!g?.entry)return window.OryvonaPanel?.openTests?.(g?.id);
    if(dialog)return;
    const url=new URL(g.entry,document.baseURI),scope=new URL('./',document.baseURI);
    if(url.origin!==location.origin || !url.pathname.startsWith(scope.pathname+'play/'))return;
    returnFocus=document.activeElement;
    dialog=document.createElement('dialog');dialog.id='gamePlayer';dialog.className='game-player';dialog.setAttribute('aria-label',`${g.name} ${text('test oynatıcısı','test player')}`);
    dialog.innerHTML=`<header><button type="button" data-player-back aria-label="${text('Panele geri dön','Back to panel')}">‹ ${text('Panel','Panel')}</button><div><b>${esc(g.name)}</b><small>${esc(g.version)}</small></div><span class="lab-live-dot" aria-hidden="true"></span></header><div class="player-stage"><p class="player-loading" role="status">${text('Gerçek oyun yükleniyor…','Loading the actual game…')}</p></div>`;
    document.body.append(dialog);document.body.classList.add('game-player-open');dialog.showModal();
    history.pushState({...history.state,oryvonaPlayer:g.id},'',location.href);
    dialog.querySelector('[data-player-back]').addEventListener('click',closePlayer);
    dialog.addEventListener('cancel',e=>{e.preventDefault();closePlayer();});
    const currentDialog=dialog;
    try {
      if(dialog!==currentDialog)return;
      const frame=document.createElement('iframe');frame.title=`${g.name} ${text('oyun testi','game test')}`;
      frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-pointer-lock');frame.setAttribute('allow',"fullscreen 'none'; gamepad");
      frame.addEventListener('load',()=>{
        if(dialog!==currentDialog)return;
        try{if(new URL(frame.contentWindow.location.href).pathname!==url.pathname)return;}catch{return;}
        clearTimeout(loadingTimer);dialog.querySelector('.player-loading')?.remove();
        try{const doc=frame.contentDocument;const style=doc.createElement('style');style.textContent='html,body{overscroll-behavior:none;overflow-x:hidden}*{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}input,textarea{-webkit-user-select:text;user-select:text;-webkit-touch-callout:default}';doc.head.append(style);doc.addEventListener('contextmenu',e=>{if(!e.target.closest('input,textarea'))e.preventDefault();});doc.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closePlayer();}},true);}catch{}
      });
      frame.src=url.href;dialog.querySelector('.player-stage').append(frame);
      loadingTimer=setTimeout(()=>{if(dialog===currentDialog){const loading=dialog.querySelector('.player-loading');if(loading)loading.textContent=text('Yükleme sürüyor. Bağlantını kontrol edebilir veya panele dönebilirsin.','Still loading. Check connectivity or return to the panel.');}},25000);
    }catch(error){if(dialog===currentDialog)dialog.querySelector('.player-loading').textContent=text('Oyun dosyası yüklenemedi. Panele dönüp yeniden deneyebilirsin.','The game file could not load. Return to the panel and retry.')+` (${error.message})`;}
  }
  document.addEventListener('click',async e=>{
    const hero=e.target.closest('#playNowBtn');if(hero && game()){e.preventDefault();e.stopImmediatePropagation();const g=game();if(g.entry)openPlayer(g);else window.OryvonaPanel?.openTests?.(g.id);return;}
    if(!e.target.closest('#gameLab'))return;
    const g=game();if(!g)return;
    if(e.target.closest('[data-lab-play]'))return openPlayer(g);
    const tabButton=e.target.closest('[data-lab-tab]');if(tabButton){tab=tabButton.dataset.labTab;render();document.querySelector(`[data-lab-tab="${tab}"]`)?.focus();return;}
    const copy=e.target.closest('[data-lab-copy]');if(copy){try{await navigator.clipboard.writeText(copy.dataset.labCopy);copy.textContent=text('Kopyalandı','Copied');}catch{document.getElementById('labNotice').textContent=text('Panoya erişim izni verilmedi.','Clipboard access was denied.');}return;}
    if(e.target.closest('[data-lab-validate]')){
      pending=g.id;render();
      try{const result=await window.OryvonaPanel.enqueueBuildValidation(g.id);pending='';render();document.getElementById('labNotice').textContent=result.ok?text('İstek kuyruğa alındı. Gerçek runner sonucu burada görünecek.','Queued. The actual runner result will appear here.'):result.error||text('Komut gönderilemedi.','The command could not be sent.');}catch(error){pending='';render();document.getElementById('labNotice').textContent=error.message;}
    }
  },true);
  addEventListener('popstate',()=>{if(dialog && !history.state?.oryvonaPlayer)stopPlayer();});
  document.addEventListener('oryvona:project-change',e=>{selected=e.detail?.id || selected;tab='build';render();});
  document.addEventListener('oryvona:view-change',render);document.addEventListener('oryvona:tests-rendered',render);document.addEventListener('oryvona:validation-change',render);
  document.addEventListener('oryvona:play-button-rendered',()=>{const g=game();if(g)syncHero(g);});
  addEventListener('pagehide',stopPlayer);
  setInterval(()=>{const g=game();if(!g)return;const signature=JSON.stringify([context().projectId,context().locale,context().isOwner,context().authenticated,window.OryvonaPanel?.getBuildValidation?.(g.id)]);if(signature!==lastSignature){lastSignature=signature;render();}},2500);
  fetch('data/game-builds.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error(`HTTP ${r.status}`);return r.json();}).then(data=>{games=data.games || [];render();}).catch(()=>{const target=document.getElementById('testsBody');if(target){const warning=document.createElement('p');warning.className='lab-notice';warning.textContent=text('Sürüm kayıtları yüklenemedi. Bağlantını kontrol edip yenile.','Build records could not load. Check connectivity and refresh.');target.before(warning);}});
})();
