/* v22: local, versioned game builds + 4-dimensional acceptance gates + evidence. Never manufactures live QA or executes a game on the runner. */
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tr = () => (window.OryvonaPanel?.getContext().locale || document.documentElement.lang || 'tr').startsWith('tr');
  const text = (a,b) => tr() ? a : b;
  let games = [], selected = 'koza', tab = 'build', dialog = null, returnFocus = null, loadingTimer = null, pending = '', lastSignature = '';
  const context = () => window.OryvonaPanel?.getContext() || {};
  const game = () => games.find(g => g.id === (context().projectId || selected)) || games.find(g => g.id === selected);
  const size = bytes => Number.isFinite(bytes) ? `${(bytes / 1e6).toLocaleString(tr() ? 'tr' : 'en', {maximumFractionDigits:2})} MB` : '—';
  const statusName = s => ({SOURCE_PENDING:text('Kaynak bekleniyor','Source pending'),PARTIAL:text('Kısmi kanıt','Partial evidence'),RECORDED_PASS_WITH_LIMITS:text('C21 kabulü · sınırları var','C21 accepted · limits remain'),DEVICE_PENDING:text('Cihaz testi bekliyor','Device test pending'),OPEN:text('QA açık','QA open')})[s] || text('Doğrulanmamış','Unverified');
  const summary = id => ({
    koza:text('6 dalgalı K01 pilotu. Kayıtlı QA’da Koru örnekleme engeli var; dokunmatik ve fiziksel telefon kabulü tamamlanmadı.','Six-wave K01 pilot. Recorded QA has a Koru sampling blocker; touch and physical-phone acceptance are incomplete.'),
    'charm-drop':text('Kabul edilen oynanabilir sürüm C21. C22 görev olarak hazırlanmış; henüz bu sürüme uygulanmamış.','The accepted playable build is C21. C22 is prepared work, not an implemented release.'),
    aeryo:text('Gerçek 1.2.0 web oynatıcısı ve Android paket kayıtları. 300 bölüm; fiziksel telefon testi bekliyor.','Actual 1.2.0 web player and Android artifact records. 300 levels; physical-phone testing is pending.'),
    'forge-run':text('FR25J Android test paketi. WebGL çıktısı yok; gerçek build, sahne ve QA kanıtlarını aşağıdan inceleyebilirsin.','FR25J Android test package. No WebGL output exists; inspect the actual build, scenes and QA evidence below.'),
    tupsper:text('Tuckspire v0.26 (120 bölüm + 108 Serbest Kutu · games.oryvona.tuckspire). Kaynak kodu D:\\ORYVONA_MERKEZ\\Tuckspire altında aktif; kapalı test AAB paketi hazır.','Tuckspire v0.26 (120 levels + 108 Free Boxes · games.oryvona.tuckspire). Source active under D:\\ORYVONA_MERKEZ\\Tuckspire; closed test AAB package ready.')
  })[id] || '';
  function row(label, value) { return `<div class="lab-row"><span>${esc(label)}</span><strong>${esc(value ?? text('Bilinmiyor','Unknown'))}</strong></div>`; }
  function gateRow(g) {
    const raw = g.v22Gates;
    const gates = raw && {...raw, technical_qa:raw.technicalQa??raw.technical_qa, device_qa:raw.deviceQa??raw.device_qa, product_acceptance:raw.productAcceptance??raw.product_acceptance, recipe_id:raw.recipeId??raw.recipe_id, character_map_lock:raw.characterMapLock??raw.character_map_lock};
    if (!gates) return '';
    return row(text('Teknik QA','Technical QA'), gates.technical_qa)
      + row(text('Telefon / Cihaz Testi','Phone / Device QA'), gates.device_qa)
      + row(text('Ürün Kabulü','Product Acceptance'), gates.product_acceptance)
      + row(text('Yayın Kapısı','Publication Gate'), gates.publication)
      + (gates.recipe_id ? row(text('Build Tarifi','Build Recipe'), gates.recipe_id) : '')
      + row(text('Tasarım Koruma Kilidi','Design Lock'), gates.character_map_lock ? text('🔒 Karakter & Harita Kilitli','🔒 Character & Map Locked') : text('Standart','Standard'));
  }
  function details(g) {
    if (tab === 'content') {
      const l = g.levels || {};
      return row(text('Uygulanan bölüm / dalga','Implemented levels / waves'),l.implemented) + (l.planned != null ? row(text('Planlanan','Planned'),l.planned) : '') + (l.dailyBoards != null ? row(text('Günlük oyun tahtası','Daily boards'),l.dailyBoards) : '') + (l.secondsPerWave ? row(text('Dalga süresi','Wave duration'),`${l.secondsPerWave} s`) : '') + `<ul class="lab-scenes">${(g.scenes || []).map(s => `<li><b>${esc(s.name)}</b><small>${esc(s.status)}</small></li>`).join('')}</ul>`;
    }
    if (tab === 'qa') {
      const q = g.qa || {};
      const counts = [['codePassed','Kod','Code'],['browserPassed','Tarayıcı','Browser'],['naturalPassed','Oynanış','Gameplay'],['lifecyclePassed','Yaşam döngüsü','Lifecycle'],['lumiPassed','Lumi','Lumi'],['standardPassed','Standart kontrol','Standard checks'],['presentationChecksPassed','Sunum kontrolü','Presentation checks'],['customerChecksPassed','Müşteri kontrolü','Customer checks'],['contentChecksPassed','İçerik kontrolü','Content checks'],['androidArtifactChecksPassed','Paket kontrolü','Artifact checks']];
      return `<p class="lab-evidence-note">${text('Bunlar tarihli kaynak kanıtlarıdır. Yeni bir oynanış veya telefon testi yapılmış sayılmaz.','These are dated source records, not a new gameplay or phone test.')}</p>` + gateRow(g) + row(text('Kayıt tarihi','Evidence date'),q.observedAt) + row(text('Fiziksel telefon','Physical phone'),q.physicalPhone) + row(text('Dokunmatik','Touch'),q.touch || text('Yeni doğrulama yok','No fresh validation')) + counts.filter(([k]) => Number.isFinite(q[k])).map(([k,a,b])=>row(text(a,b),`${q[k]} ${text('kayıtlı başarılı kontrol','recorded passed checks')}`)).join('');
    }
    const hash = g.artifact?.sha256 || '';
    return row(text('Sürüm','Version'),g.version) + (g.versionCode != null ? row(text('Sürüm kodu','Version code'),g.versionCode) : '') + row(text('Oynatıcı / paket','Player / package'),g.runtime || g.platform) + row(text('Dosya boyutu','Artifact size'),size(g.artifact?.bytes)) + (hash ? `<div class="lab-row"><span>SHA-256</span><code title="${esc(hash)}">${esc(hash.slice(0,16))}…</code><button type="button" class="lab-copy" data-lab-copy="${esc(hash)}" aria-label="${text('SHA-256 kopyala','Copy SHA-256')}">${text('Kopyala','Copy')}</button></div>` : '') + gateRow(g);
  }
  function recentResult(g) {
    const r = window.OryvonaPanel?.getBuildValidation?.(g.id);
    if (!r) return `<p class="lab-note">${text('v22 hafif modu yalnız kök DURUM-KARTI.json şemasını ve alanlarını kontrol eder. Ağır kaynak/build taranmaz; oynanış, paket ve yayın testi yapılmaz.','v22 light mode checks only the root status-card schema and fields. It does not scan sources/builds or test gameplay, artifacts or publication.')}</p>`;
    const v = r.validation || r.result?.validation;
    const label = ({queued:text('Kuyrukta','Queued'),running:text('Doğrulanıyor','Validating'),done:text('Doğrulama tamamlandı','Validation completed'),failed:text('Doğrulama başarısız','Validation failed'),cancelled:text('İptal edildi','Cancelled')})[r.status] || r.status;
    const note = r.note || r.note_tr || r.result?.note_tr || '';
    const count = Number.isFinite(v?.checks?.total) ? `<p class="lab-count">${v.checks.passed}/${v.checks.total} ${v.scope==='status_card_validation_only'?text('durum kartı kontrolü','status-card checks'):text('kayıtlı dosya/paket kontrolü','recorded file/artifact checks')}</p>` : '';
    const checks = Array.isArray(v?.checks) ? v.checks : (Array.isArray(v?.results) ? v.results : []);
    return `<div class="lab-validation"><b>${esc(label)}</b>${count}${note ? `<p>${esc(note)}</p>` : ''}${checks.length ? `<details><summary>${text('Dosya kontrol ayrıntıları','File check details')} (${checks.length})</summary><ul>${checks.map(c=>`<li>${esc(c.name || c.id || c.label)} · ${esc(c.status || (c.ok === true ? 'PASS' : c.ok === false ? 'FAIL' : 'UNKNOWN'))}</li>`).join('')}</ul></details>` : ''}<small>${text('Bu kontrol oynanış kabulü değildir.','This check is not gameplay acceptance.')}</small></div>`;
  }
  function render() {
    if(document.body.classList.contains("oryvona-v26"))return;
    const visibleView=document.getElementById("view-tests");if(document.hidden||!visibleView||visibleView.hidden)return;
    const target = document.getElementById('testsBody');
    if (!target) return;
    let lab = document.getElementById('gameLab');
    if (!lab) { lab = document.createElement('section'); lab.id='gameLab'; lab.className='card game-lab'; lab.setAttribute('aria-label',text('Gerçek oyun test merkezi','Actual game test center')); target.before(lab); }
    const g = game(); if (!g) { lab.innerHTML=`<p>${text('Oyun sürüm kayıtları yükleniyor…','Loading game build records…')}</p>`; return; }
    const c=context(), latest=window.OryvonaPanel?.getBuildValidation?.(g.id), busy=pending===g.id||['queued','running'].includes(latest?.status), canValidate=c.authenticated && c.isOwner && !c.demo;
    lab.innerHTML=`<div class="lab-heading"><div><span class="lab-eyebrow">${text('OYUN TEST MERKEZİ','GAME TEST CENTER')}</span><h2>${esc(g.name)}</h2></div><span class="chip warn">${esc(statusName(g.qa?.status))}</span></div><p class="lab-summary">${esc(summary(g.id))}</p><div class="lab-actions"><button type="button" class="lab-primary" data-lab-play>${text('▶ Oyunu aç','▶ Open game')}</button><button type="button" class="lab-secondary" data-lab-validate ${!canValidate || busy?'disabled':''}>${pending===g.id?text('Gönderiliyor…','Sending…'):text('Durum kartını doğrula','Validate status card')}</button></div>${!canValidate?`<small class="lab-note">${text('Arka plan komutu için sahip hesabıyla canlı giriş yap.','Sign in live as the owner to send a background command.')}</small>`:''}<div class="lab-tabs" role="tablist" aria-label="${text('Sürüm ayrıntıları','Build details')}">${[['build','Sürüm','Build'],['content','İçerik','Content'],['qa','QA','QA']].map(([id,a,b])=>`<button type="button" role="tab" aria-selected="${tab===id}" data-lab-tab="${id}">${text(a,b)}</button>`).join('')}</div><div class="lab-details" role="tabpanel">${details(g)}</div><div class="lab-result" aria-live="polite">${recentResult(g)}</div><p id="labNotice" class="lab-notice" role="status"></p>`;
    syncHero(g);
  }
  function syncHero(g) {
    const a=document.getElementById('playNowBtn'); if(!a)return;
    a.href='#'; a.removeAttribute('target');a.removeAttribute('download');a.removeAttribute('aria-disabled');a.classList.remove('no-link');
    const title=document.getElementById('playBtnTitle'),sub=document.getElementById('playVerSub'),arrow=document.getElementById('playArr');
    if(title)title.textContent=text('Oyunu aç','Open game');
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
  async function openPlayer(g){
    const isAndroid=/android/i.test(navigator.userAgent);
    const links={
      'aeryo':isAndroid?'market://details?id=games.oryvona.aeryo':'https://play.google.com/apps/testing/games.oryvona.aeryo',
      'tupsper':isAndroid?'market://details?id=games.oryvona.tuckspire':'https://play.google.com/apps/testing/games.oryvona.tuckspire',
      'forge-run':isAndroid?'market://details?id=com.forgerun.dtslicetest':'https://play.google.com/apps/testing/com.forgerun.dtslicetest',
      'koza':'https://denizdalga998-boop.github.io/oryvona-panel/play/koza/k01.html?panel=1',
      'charm-drop':'https://denizdalga998-boop.github.io/oryvona-panel/play/charm-drop/index.html'
    };
    const target=links[g.id]||g.entry;
    if(target){window.open(target,target.startsWith('market:')?'_self':'_blank');}
  }
  document.addEventListener('click',async e=>{
    const hero=e.target.closest('#playNowBtn');if(hero && game()){e.preventDefault();e.stopImmediatePropagation();const g=game();openPlayer(g);return;}
    if(!e.target.closest('#gameLab'))return;
    const g=game();if(!g)return;
    if(e.target.closest('[data-lab-play]'))return openPlayer(g);
    const tabButton=e.target.closest('[data-lab-tab]');if(tabButton){tab=tabButton.dataset.labTab;render();document.querySelector(`[data-lab-tab="${tab}"]`)?.focus();return;}
    const copy=e.target.closest('[data-lab-copy]');if(copy){try{await navigator.clipboard.writeText(copy.dataset.labCopy);copy.textContent=text('Kopyalandı','Copied');}catch{document.getElementById('labNotice').textContent=text('Panoya erişim izni verilmedi.','Clipboard access was denied.');}return;}
    if(e.target.closest('[data-lab-validate]')){
      pending=g.id;render();
      try{const result=await window.OryvonaPanel.enqueueBuildValidation(g.id);pending='';render();document.getElementById('labNotice').textContent=result.ok?text('Kart kontrolü cihaz kuyruğuna kaydedildi. Teslim sonrası gerçek runner sonucu burada görünür.','Card check saved in the device queue. The actual runner result appears after delivery.'):result.error||text('Komut gönderilemedi.','The command could not be sent.');}catch(error){pending='';render();document.getElementById('labNotice').textContent=error.message;}
    }
  },true);
  addEventListener('popstate',()=>{if(dialog && !history.state?.oryvonaPlayer)stopPlayer();});
  document.addEventListener('oryvona:project-change',e=>{selected=e.detail?.id || selected;tab='build';render();});
  document.addEventListener('oryvona:view-change',event=>{if(event.detail?.view!=="tests")stopPlayer();else render();});document.addEventListener('oryvona:tests-rendered',render);document.addEventListener('oryvona:validation-change',render);
  document.addEventListener('oryvona:play-button-rendered',()=>{const g=game();if(g)syncHero(g);});
  addEventListener('pagehide',stopPlayer);
  setInterval(()=>{const testView=document.getElementById("view-tests");if(document.hidden||!testView||testView.hidden)return;const g=game();if(!g)return;const signature=JSON.stringify([context().projectId,context().locale,context().isOwner,context().authenticated,window.OryvonaPanel?.getBuildValidation?.(g.id)]);if(signature!==lastSignature){lastSignature=signature;render();}},2500);
  fetch('data/game-builds.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error(`HTTP ${r.status}`);return r.json();}).then(data=>{games=data.games || [];render();}).catch(()=>{const target=document.getElementById('testsBody');if(target){const warning=document.createElement('p');warning.className='lab-notice';warning.textContent=text('Sürüm kayıtları yüklenemedi. Bağlantını kontrol edip yenile.','Build records could not load. Check connectivity and refresh.');target.before(warning);}});
})();
