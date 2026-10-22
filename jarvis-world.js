/* ORYVONA v26 Argon World. Actual data brief + owner-bound queue, no SDK or implicit execution. */
(function(root,factory){'use strict';var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.OryvonaJarvisWorld=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
  var PROJECTS=Object.freeze([{id:'koza',label:'KOZA'},{id:'charm-drop',label:'Charm Drop'},{id:'forge-run',label:'Forge Run'},{id:'aeryo',label:'AERYO'},{id:'tupsper',label:'Tuckspire'},{id:'oryvona-panel',label:'Oryvona Panel'}]);
  var STATUS={queued:'Sırada',running:'Çalışıyor',blocked:'Engellendi',completed:'Tamamlandı',failed:'Başarısız',paused:'Duraklatıldı',cancelled:'İptal edildi',waiting_review:'İnceleme bekliyor'};
  var ICONS={plus:'M12 5v14M5 12h14',mic:'M9 5a3 3 0 016 0v7a3 3 0 01-6 0V5M5 10v2a7 7 0 0014 0v-2M12 19v3M9 22h6',up:'M12 19V5M5 12l7-7 7 7',chevron:'M6 9l6 6 6-6',activity:'M3 12h4l3-7 4 14 3-7h4',close:'M6 6l12 12M18 6L6 18',sound:'M11 5L6 9H3v6h3l5 4V5M15 8a6 6 0 010 8M18 5a10 10 0 010 14',mute:'M11 5L6 9H3v6h3l5 4V5M16 9l5 6M21 9l-5 6',brief:'M5 4h14v16H5V4M8 8h8M8 12h8M8 16h5'};
  function safeText(v,max){return String(v==null?'':v).slice(0,max||40000);}
  function uuid(crypto){if(crypto&&typeof crypto.randomUUID==='function')return crypto.randomUUID();if(crypto&&typeof crypto.getRandomValues==='function'){var a=new Uint8Array(16);crypto.getRandomValues(a);a[6]=(a[6]&15)|64;a[8]=(a[8]&63)|128;return Array.from(a,function(x){return x.toString(16).padStart(2,'0');}).join('').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,'$1-$2-$3-$4-$5');}throw new Error('Güvenilir komut kimliği üreticisi kullanılamıyor.');}
  function projectLabel(id,projects){var p=(projects||PROJECTS).find(function(x){return x.id===id;});return p?p.label:'Hedef doğrulanmadı';}
  function validProject(id,projects){return (projects||PROJECTS).some(function(p){return p.id===id;});}
  function cloneAttachments(items,maxCount){var cap=Number(maxCount)>0?Number(maxCount):4;return (Array.isArray(items)?items:[]).filter(function(a){return a&&typeof a.id==='string'&&a.id.length>0&&a.id.length<=250;}).map(function(a){return {id:a.id,name:safeText(a.name||'Görsel',180),mime:safeText(a.mime,100),size:Number.isFinite(a.size)?a.size:0,...(typeof a.previewUrl==='string'&&a.previewUrl?{previewUrl:a.previewUrl}:{})};}).slice(0,cap);}
  function cloneMessageAttachments(items){return (Array.isArray(items)?items:[]).filter(function(a){return a&&typeof a.name==='string'&&a.name.trim();}).map(function(a){return {name:safeText(a.name,120),mime:safeText(a.mime,80),size:Number.isFinite(a.size)?a.size:0};}).slice(0,4);}
  function formatAttachmentSize(bytes){var b=Number(bytes)||0;if(b<=0)return '';if(b<1024)return b+' B';if(b<1024*1024)return Math.max(1,Math.round(b/1024))+' KB';return (b/(1024*1024)).toFixed(1).replace(/\.0$/,'')+' MB';}
  function validateStudioProposal(action,result,expectedRequestId,projects){
    var UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    var validSource=result&&result.ok===true&&((result.provider==='groq'&&result.transport==='groq-api')||(['google','gemini'].includes(result.provider)&&result.transport==='google-ai-studio-api'));
    if(!action||!['create_worker_task','dispatch_studio_flow'].includes(action.tool)||!validSource||!UUID.test(expectedRequestId||'')||result.requestId!==expectedRequestId||action.sourceRequestId!==expectedRequestId)return null;
    var id=action.project==='tuckspire'?'tupsper':action.project;
    if(!validProject(id,projects)||typeof action.instruction!=='string'||!action.instruction.trim()||action.instruction.length>4000)return null;
    return Object.freeze({projectId:id,instruction:action.instruction,sourceRequestId:expectedRequestId,...(action.ownerApproved===true?{ownerApproved:true}:{})});
  }
  function voiceEvidenceSuffix(voiceMeta){
    if(!voiceMeta||typeof voiceMeta!=='object')return {voiceLabel:null,suffix:''};
    if(voiceMeta.provider==='android-tts'){
      var vName=safeText(voiceMeta.voiceName||'tr-TR',80),why=safeText(voiceMeta.fallbackReasonText||'Google TTS kotada',120);
      return {voiceLabel:'Türkçe Android sesi ('+vName+')',suffix:' · Ses: Türkçe Android TTS ('+vName+', '+why+').'};
    }
    if(voiceMeta.provider==='google-ai-studio'){
      var gName=safeText(voiceMeta.voiceName||'Charon',60),gTag=(voiceMeta.voiceSource==='google-cloud'?'Google Cloud TTS (':'Google TTS (')+gName+')';
      return {voiceLabel:gTag,suffix:' · Ses: '+gTag+'.'};
    }
    return {voiceLabel:null,suffix:''};
  }
  function nativeReplyOrigin(result,voiceMeta){
    if(!result||result.ok!==true)return null;
    var v=voiceEvidenceSuffix(voiceMeta);
    if(result.provider==='groq'&&result.transport==='groq-api'){
      return {kind:'model',provider:'Groq',model:safeText(result.model||'openai/gpt-oss-120b',100),modelVerified:result.model_verified===true,...(v.voiceLabel?{voiceLabel:v.voiceLabel}:{}),evidenceLabel:'Groq API yanıtında doğrulanan model (düşünme: düşük). Günlük sohbet Codex işçisine gönderilmez.'+v.suffix};
    }
    if(!['google','gemini'].includes(result.provider)||result.transport!=='google-ai-studio-api')return null;
    return {kind:'model',provider:'Google AI Studio',model:safeText(result.model||'Model yanıtı alınamadı',100),modelVerified:result.model_verified===true,...(v.voiceLabel?{voiceLabel:v.voiceLabel}:{}),evidenceLabel:'Google API yanıtında bildirilen model. Günlük sohbet Codex işçisine gönderilmez.'+v.suffix};
  }
  function hasUnverifiedExecutionClaim(text){
    var s=String(text||'');
    return /(?:işçi\S*|kuyru\S*|görev\S*|paket\S*|codex\S*|antigravity\S*).{0,48}(?:atad|atan|başlatt|başlatıyor|başladı|dağıtt|dağıtıldı|ilett|iletildi|gönderd|gönderildi|kaydett|kaydedildi|açtım|açıldı|tamamlad|tamamlandı|çalışıyor|kodluyor)|(?:başlattım|başlatıyorum|görev\s+dağıtıldı|görevi\s+dağıttım|görev\s+paketini\s+açtım|işçiler\s+çalışıyor|işçilere\s+ilettim|işçilere\s+dağıttım|kuyruğa\s+aldım|kuyruğa\s+ekledim|kuyruğa\s+kaydettim|atadım|tamamladım|testler\s+geçti)/i.test(s);
  }
  function hasVerifiedQueueReceipt(result){
    if(!result||result.ok!==true)return false;
    var UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    var r=result.workerReceipt||null;
    if(r&&r.accepted===true&&r.status==='durably_queued'&&UUID.test(r.requestId||r.commandId||'')&&UUID.test(r.flowId||''))return true;
    var actions=Array.isArray(result.actions)?result.actions:[];
    return actions.some(function(a){var ar=a&&(a.receipt||a);return a&&a.alreadyQueued===true&&ar&&ar.accepted===true&&ar.status==='durably_queued'&&UUID.test(ar.requestId||ar.commandId||'')&&UUID.test(ar.flowId||'');});
  }
  function isDesignCardText(text){
    var s=String(text||'');
    return /(?:Mekanik\s*&\s*Oynanış|Denge\s*&\s*Kurallar|Gereken\s+Depo\s+Varlıkları|İşçi\s+Görev\s+Dağılımı)/i.test(s);
  }
  function limitDailyReplySentences(text,maxSentences){
    var raw=String(text||'').trim();if(!raw)return '';
    if(isDesignCardText(raw))return raw;
    var normalized=raw.replace(/\s*\n+\s*/g,' ').replace(/\s{2,}/g,' ').trim();
    var limit=Math.max(1,Math.min(3,Number(maxSentences)||3)),sentences=[],current='';
    for(var i=0;i<normalized.length;i++){
      var ch=normalized[i];current+=ch;
      if(ch==='.'||ch==='!'||ch==='?'||ch==='…'){
        var next=normalized[i+1]||'',prev=normalized.slice(0,i);
        var isDecimal=ch==='.'&&/\d$/.test(prev)&&/^\d/.test(next);
        var isInitial=ch==='.'&&/(?:^|\s|\.)[A-ZÇĞİÖŞÜ]$/.test(prev);
        if(!isDecimal&&!isInitial&&(!next||/\s/.test(next))){
          while(i+1<normalized.length&&/[.!?…]/.test(normalized[i+1]))current+=normalized[++i];
          sentences.push(current.trim());current='';
          if(sentences.length>=limit)break;
        }
      }
    }
    if(current.trim()&&sentences.length<limit)sentences.push(current.trim());
    return sentences.slice(0,limit).join(' ').trim();
  }
  function sanitizeModelReplyText(result,userApproved){
    var raw=safeText(result&&(result.answer_tr||result.reply_tr)||'Yanıt alınamadı efendim.',2400);
    if(!result||result.ok!==true)return raw;
    var hasReceipt=hasVerifiedQueueReceipt(result);
    if(!hasReceipt&&hasUnverifiedExecutionClaim(raw)){
      return 'Kalıcı kuyruk onayı olmadan görev başlatıldı veya işçiler çalışıyor bilgisi verilemez. İsteğin için henüz doğrulanmış kuyruk kaydı yok.';
    }
    if(userApproved||hasReceipt){
      raw=raw
        .replace(/\s*(?:Efendim,\s*)?bu\s+tasarımı\s+onaylıyorsanız\s+['"’]?Evet,\s*kodla['"’]?\s+demeniz\s+halinde[^.!?\n]*[.!?]?/gi,'')
        .replace(/\s*Bunu\s+şimdi\s+düzeltelim\s+mi\s+efendim\?/gi,'')
        .replace(/\s*(?:Onaylıyor\s+musunuz|Onay\s+veriyor\s+musunuz|Ne\s+dersiniz,\s+başlayalım\s+mı)\s*(?:efendim)?\?/gi,'')
        .trim()||raw;
    }
    return limitDailyReplySentences(raw,3);
  }
  function DraftStore(projects){this.projects=projects||PROJECTS;this.items=new Map();}
  DraftStore.prototype.get=function(scope){var k=scope||'studio';if(scope&&!validProject(scope,this.projects))throw new Error('Geçersiz komut kapsamı.');if(!this.items.has(k))this.items.set(k,{text:'',attachments:[],version:0,pending:null,brainPending:null});return this.items.get(k);};
  DraftStore.prototype.update=function(scope,patch){var d=this.get(scope);if(Object.prototype.hasOwnProperty.call(patch,'text')){var next=safeText(patch.text);if(next!==d.text)d.brainPending=null;d.text=next;}if(Object.prototype.hasOwnProperty.call(patch,'attachments'))d.attachments=cloneAttachments(patch.attachments);d.version++;d.pending=null;return d;};
  function validateResolution(result,projects){if(!result||typeof result!=='object')return {status:'rejected',message:'Hedef doğrulanamadı.'};if(result.status==='ready'&&validProject(result.projectId,projects))return {status:'ready',projectId:result.projectId};if(result.status==='clarify')return {status:'clarify',question:safeText(result.question||'Bu komut hangi projeye ait?',400),candidates:(Array.isArray(result.candidates)?result.candidates:[]).filter(function(x){return validProject(typeof x==='string'?x:x.id,projects);}).map(function(x){return typeof x==='string'?x:x.id;})};return {status:'rejected',message:safeText(result.message||'Hedef doğrulanamadı. Lütfen proje seç.',400)};}
  function sourceLabel(origin){origin=origin||{};if(origin.kind==='native-ui')return 'Gemini normal sohbet · Ekran gözlemi';if(origin.kind==='user-input')return 'Sahip mesajı · Canlı beyne gönderildi';if(origin.kind==='pending-model')return safeText(origin.provider||'Groq',60)+' · Yanıt bekleniyor';if(origin.kind==='local')return 'Yerel durum kaydı · Model çağrısı yok';if(origin.kind==='preview')return 'Sentetik önizleme · Canlı sistem bağlı değil';if(origin.kind==='provider-error')return safeText(origin.provider||'Groq',60)+' · Sağlayıcı yanıt veremedi'+(Number.isSafeInteger(origin.httpStatus)?' (HTTP '+origin.httpStatus+')':'');if(origin.kind==='model'&&origin.provider&&origin.model)return safeText(origin.provider,60)+' · '+safeText(origin.model,100)+(origin.voiceLabel?' · '+safeText(origin.voiceLabel,80):'');return 'Kaynak doğrulanmadı';}
  function mount(root,options){
    options=options||{};if(!root||!root.ownerDocument)throw new Error('Argon için bağımsız DOM kökü gerekli.');
    if(root.childNodes.length)throw new Error('Argon kökü boş olmalı. Eski v22 düğümlerini değiştirmeyin.');
    var bridge=options.bridge;if(!bridge||typeof bridge.getSnapshot!=='function'||typeof bridge.subscribe!=='function'||typeof bridge.submitIntent!=='function')throw new Error('Güvenilir getSnapshot/subscribe/submitIntent köprüsü gerekli.');
    var doc=root.ownerDocument,win=doc.defaultView||globalThis,projects=(options.projects||PROJECTS).slice(),mode=options.mode==='preview'?'preview':'live',drafts=new DraftStore(projects),scope=null,snapshot={revision:-1,messages:[],jobs:[],connection:{status:'offline'}},destroyed=false,active=true,unsub=null,energy=null,listeners=[],nodesByKey=new Map(),busyScopes=new Set(),clarification=null,speechStop=null,speechStarting=false,speechEpoch=0,speechKind='speech',raf=0,measureTimer=0,saveTimers=new Map(),draftLoads=new Set(),activityVisible=options.showActivity===true,activityToggledByUser=false,lastRevision=-1,accountKey=null,accountEpoch=0,voice=options.voice||null,studioData=options.studioData||null,brief=options.brief||win.OryvonaJarvisBrief||null,voiceState={enabled:false,mode:'idle',audioLevel:null},voiceUnsub=null,dataUnsub=null,readMessages=[],readCounter=0,answerBusy=false,confirmBeforeQueue=options.confirmBeforeQueue!==false,pendingConfirm=null,activeEpoch=0;
    var approvalNow=typeof options.now==='function'?options.now:Date.now,APPROVAL_TTL=5*60*1000,outputPreferenceChosen=false,voiceSetupAttempt=0,pendingAudioReply=null;
    function clearConfirmation(){pendingConfirm=null;clarify.hidden=true;}
    function worldActive(){var view=doc.body&&doc.body.dataset&&doc.body.dataset.oryvonaView;return active&&!doc.hidden&&doc.visibilityState!=='hidden'&&(!view||view==='jarvis');}
    if(mode==='live'&&typeof bridge.getAccountKey!=='function')throw new Error('Hesap değişimlerini doğrulayan getAccountKey köprüsü gerekli.');
    function readAccountKey(){var key=typeof bridge.getAccountKey==='function'?bridge.getAccountKey():mode==='preview'?'synthetic-preview':null;return typeof key==='string'&&key.length?key:null;}
    accountKey=readAccountKey();
    function on(el,event,fn,opts){el.addEventListener(event,fn,opts);listeners.push(function(){el.removeEventListener(event,fn,opts);});}
    function dynamicOn(el,event,fn){el.addEventListener(event,fn);/* Removed dynamic nodes and handlers are garbage collected together. */}
    function el(tag,cls,text){var n=doc.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=safeText(text);return n;}
    function icon(name){var svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');var path=doc.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',ICONS[name]);svg.appendChild(path);return svg;}
    function btn(name,cls,title){var n=el('button',cls);n.type='button';n.setAttribute('aria-label',title);n.title=title;if(name)n.appendChild(icon(name));return n;}
    function setStatus(text,tone){status.textContent=safeText(text,500);status.dataset.tone=tone||'normal';}
    function label(id){return projectLabel(id,projects);}
    function isNearBottom(){return thread.scrollHeight-thread.scrollTop-thread.clientHeight<90;}
    function bottom(force){if(force)thread.scrollTop=thread.scrollHeight;}
    root.classList.add('jw-root');root.setAttribute('data-jarvis-world','v26');
    var shell=el('section','jw-shell');shell.setAttribute('aria-label','Argon · Oryvona komuta merkezi');
    var header=el('header','jw-header'),identity=el('div','jw-identity'),brand=el('p','jw-brand','ORYVONA GAMES'),title=el('h1','jw-title','Argon'),connection=el('div','jw-status'),dot=el('span','jw-status-dot'),connectionText=el('span','','Bağlantı doğrulanıyor');connection.append(dot,connectionText);identity.append(brand,title);
    var orbStage=el('div','jw-orb-stage'),energyBox=el('div','jw-energy'),canvas=el('canvas');canvas.setAttribute('aria-hidden','true');energyBox.appendChild(canvas);var orbLabel=el('p','jw-orb-label','Hazırım'),orbHint=el('p','jw-orb-hint','Stüdyonun gerçek durumunu sor.');orbStage.append(energyBox,orbLabel,orbHint);
    var activity=btn('activity','jw-activity-toggle','Aktif işleri göster');var activityCount=el('span','jw-activity-count','0'),activityLabel=el('span','','iş');activity.append(activityCount,activityLabel);activity.setAttribute('aria-expanded',String(activityVisible));var sound=btn('mute','jw-icon-button jw-output-toggle','Sesli yanıtı aç'),daily=btn('brief','jw-daily-brief','Günlük stüdyo özeti');daily.appendChild(el('span','','Günlük Özet'));sound.setAttribute('aria-pressed','false');header.append(identity,daily,sound,activity,connection);
    var banner=el('div','jw-banner',mode==='preview'?'TASARIM ÖNİZLEMESİ · Örnek kayıtlar sentetiktir. Gerçek ajana, ağa veya mikrofona bağlanmaz.':'');banner.hidden=mode!=='preview';
    var thread=el('div','jw-thread'),timeline=el('div','jw-timeline');thread.setAttribute('aria-label','Stüdyo konuşması ve iş geçmişi');thread.setAttribute('tabindex','0');thread.appendChild(timeline);
    var zone=el('footer','jw-composer-zone'),inner=el('div','jw-composer-inner'),context=el('div','jw-context-row'),scopeBtn=btn(null,'jw-scope-button','Komutun hedef projesini seç'),scopeText=el('span','','Tüm stüdyo');scopeBtn.append(scopeText,icon('chevron'));scopeBtn.setAttribute('aria-expanded','false');var contextHint=el('span','jw-context-hint','Her komut kendi projesinde çalışır');context.append(scopeBtn,contextHint);
    var scopeMenu=el('div','jw-scope-menu');scopeMenu.hidden=true;scopeMenu.setAttribute('aria-label','Komut hedefi');
    [{id:null,label:'Tüm stüdyo'}].concat(projects).forEach(function(p){var b=btn(null,'jw-scope-choice',p.label+' komut kapsamı');b.textContent=p.label;b.dataset.scope=p.id||'';b.setAttribute('aria-pressed',String(p.id===scope));on(b,'click',function(){selectScope(p.id);scopeMenu.hidden=true;scopeBtn.setAttribute('aria-expanded','false');input.focus();});scopeMenu.appendChild(b);});
    var clarify=el('div','jw-clarify');clarify.hidden=true;clarify.setAttribute('role','group');clarify.setAttribute('aria-label','Komut hedefini netleştir');
    var attachments=el('div','jw-attachments');attachments.setAttribute('aria-label','Bu komuta eklenen görseller');
    var attachMenu=el('div','jw-attach-menu');attachMenu.hidden=true;attachMenu.setAttribute('role','menu');attachMenu.setAttribute('aria-label','Ek türü seç');
    var attachImgBtn=btn(null,'jw-attach-choice jw-scope-choice','Fotoğraf veya ekran görüntüsü ekle');attachImgBtn.textContent='Fotoğraf / ekran görüntüsü';attachImgBtn.dataset.kind='image';
    var attachFileBtn=btn(null,'jw-attach-choice jw-scope-choice','PDF, metin veya kod dosyası ekle');attachFileBtn.textContent='Dosya (PDF, metin, kod)';attachFileBtn.dataset.kind='file';
    attachMenu.append(attachImgBtn,attachFileBtn);
    var form=el('form','jw-composer jw-composer-pill'),add=btn('plus','jw-icon-button','Görsel veya dosya ekle'),input=el('textarea','jw-input'),mic=btn('mic','jw-icon-button jw-mic','Sesle yaz'),send=btn('up','jw-icon-button jw-send','Komutu gönder');input.rows=1;input.placeholder='Bir sonraki adımı söyle…';input.setAttribute('aria-label','Argon komutu');input.setAttribute('enterkeyhint','send');input.setAttribute('autocomplete','off');input.setAttribute('spellcheck','true');send.type='submit';mic.setAttribute('aria-pressed','false');add.setAttribute('aria-expanded','false');form.append(add,input,mic,send);
    var status=el('div','jw-composer-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');/* Project routing is automatic; the old picker is deliberately not mounted. */inner.append(clarify,attachments,attachMenu,form,status);zone.appendChild(inner);shell.append(header,orbStage,banner,thread,zone);root.appendChild(shell);
    function draftKey(s){return s||'studio';}
    /* ARGON "önce onay al": a change request is summarised and queued only after an explicit Evet/Başla/Onaylıyorum (typed, spoken or tapped). */
    function foldTr(t){return String(t||'').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/ı/g,'i').replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();}
    function isYes(t){var f=foldTr(t);return f.split(' ').length<=4&&/^(?:evet|eet|basla|baslayalim|kodla|uygula|onayliyorum|onayladim|onayla|onay|tamam|olur|kabul|hadi basla|hadi kodla|tamam basla|tamam kodla|olur basla|olur kodla|evet basla|evet kodla|evet uygula|evet onayliyorum)(?: efendim)?$/.test(f);}
    function isNo(t){var f=foldTr(t);return f.split(' ').length<=4&&/^(?:hayir|vazgec|vazgectim|iptal|dur|bekle|gerek yok|simdi degil)(?: efendim)?$/.test(f);}
    function confirmQuestion(original){var target=original.scope?label(original.scope)+' için ':'';return 'Anladım. '+target+'“'+safeText(original.text,160)+'” isteğini izole işçiye göndereceğim. Bunu şimdi düzeltelim mi efendim?';}
    /* ===== ARGON canlı beyin: every message goes to the real model on DJ-KABIN (no pattern table). Its tool calls run here:
       set_argon_mode switches low/medium/high at once; dispatch is summarised by the model and queued only after Evet. ===== */
    var brainOn=options.brain!==false&&typeof bridge.askBrain==='function'&&confirmBeforeQueue;
    var MODE_TR={low:'düşük (hızlı)',medium:'orta (dengeli)',high:'yüksek (en derin)'};
    function readPref(k,d){try{var v=win.localStorage&&win.localStorage.getItem(k);return v||d;}catch(_e){return d;}}
    function writePref(k,v){try{if(win.localStorage)win.localStorage.setItem(k,v);}catch(_e){}}
    var argonMode=readPref('oryvona.argonMode','low');if(!MODE_TR[argonMode])argonMode='low';
    function persistedReadMessages(){
      return readMessages.filter(function(m){return m&&!m.pending&&typeof m.body==='string'&&m.body.trim();}).slice(-60).map(function(m){
        var atts=cloneMessageAttachments(m.attachments);
        return {id:m.id,...(m.requestId?{requestId:m.requestId}:{}),role:m.role,body:safeText(m.body,2400),...(atts.length?{attachments:atts}:{}),...(m.projectId?{projectId:m.projectId}:{}),...(m.failed?{failed:true}:{}),createdAt:m.createdAt||null,origin:m.origin||null};
      });
    }
    function mergeRestoredChat(items){
      if(!Array.isArray(items)||!items.length)return false;
      var existingIds=new Set(readMessages.map(function(m){return m.id;}));
      var existingReqRoles=new Set(readMessages.filter(function(m){return m&&m.requestId;}).map(function(m){return m.requestId+':'+m.role;}));
      var added=false;
      items.forEach(function(m){
        if(!m||typeof m.id!=='string'||typeof m.body!=='string'||!m.body.trim())return;
        var reqKey=m.requestId?m.requestId+':'+m.role:null;
        if(existingIds.has(m.id)||(reqKey&&existingReqRoles.has(reqKey)))return;
        existingIds.add(m.id);if(reqKey)existingReqRoles.add(reqKey);
        var atts=cloneMessageAttachments(m.attachments);
        readMessages.push({id:m.id,...(m.requestId?{requestId:m.requestId}:{}),role:m.role==='user'?'user':'assistant',body:safeText(m.body,2400),...(atts.length?{attachments:atts}:{}),...(m.projectId?{projectId:m.projectId}:{}),...(m.failed?{failed:true}:{}),createdAt:m.createdAt||new Date().toISOString(),origin:m.origin||{kind:'local',evidenceLabel:'Önceki oturumdan geri yüklendi.'}});
        added=true;
      });
      if(readMessages.length>80)readMessages=readMessages.slice(-80);
      return added;
    }
    // A saved hands-free preference never grants microphone access in this version.
    function conversationHistory(){
      var seen=new Set(),all=[];
      snapshot.messages.concat(readMessages).forEach(function(m,i){
        if(!m||m.pending||m.failed||typeof m.body!=='string'||!m.body.trim())return;
        var dedupKey=m.requestId?m.requestId+':'+m.role:m.id;
        if(dedupKey&&seen.has(dedupKey))return;
        if(dedupKey)seen.add(dedupKey);
        var c=m.createdAt,t=typeof c==='number'?c:Date.parse(c);
        all.push({m:m,i:i,t:Number.isFinite(t)?t:0});
      });
      all.sort(function(a,b){return a.t-b.t||a.i-b.i;});
      return all.slice(-12).map(function(x){return {role:x.m.role==='user'?'user':'assistant',text:safeText(x.m.body,1200)};});
    }
    async function brainTurn(textValue,version,sentAttachments){
      clearConfirmation();
      var owner=accountKey,ticket=accountEpoch,viewTicket=activeEpoch,askScope=scope,id='brain:'+owner+':'+(++readCounter),createdAt=new Date().toISOString(),d=drafts.get(askScope),persist=true,clearDraft=version>=0;
      var attList=cloneAttachments(sentAttachments,4),attIds=attList.map(function(a){return a.id;}),attMeta=cloneMessageAttachments(attList);
      var priorHistory=conversationHistory();
      var lastAssistantTurn=priorHistory.slice().reverse().find(function(h){return h.role==='assistant';});
      var approvalAskedPreviously=!!(lastAssistantTurn&&/(?:onaylıyorsanız|evet,\s*kodla|evet,\s*başla|düzeltelim\s+mi|onay\s+bekliyor|henüz\s+doğrulanmadı)/i.test(lastAssistantTurn.text));
      var userApprovedInTurn=isYes(textValue)||(approvalAskedPreviously&&/\b(?:evet|onayliyorum|tamam|hadi|kodla|basla|uygula)\b/.test(foldTr(textValue)));
      var turn=persist&&!attIds.length&&d.brainPending&&d.brainPending.text===textValue&&!d.brainPending.terminal?d.brainPending:{requestId:uuid(win.crypto),text:textValue,history:priorHistory,mode:argonMode,audioOutput:voiceState.enabled===true,...(attIds.length?{attachments:attIds}:{})};
      if(!turn.ttsRequestId)turn.ttsRequestId=uuid(win.crypto);
      answerBusy=true;syncComposer();
      if(persist){
        d.brainPending=turn;
        try{if(!bridge.drafts||typeof bridge.drafts.save!=='function')throw Error('Kalıcı sohbet kaydı kullanılamıyor.');await bridge.drafts.save(askScope,{text:d.text,attachments:cloneAttachments(d.attachments),brainPending:turn,chatHistory:persistedReadMessages(),accountKey:owner});}
        catch(_saveError){if(owns(owner,ticket)){if(clearDraft)recordSubmissionFailure(askScope,version,textValue,attList);answerBusy=false;syncComposer();setStatus('Mesaj kimliği cihazda saklanamadı. Hata sohbet akışında gösterildi; beyin çağrılmadı.','error');}return;}
        if(!owns(owner,ticket))return;if(!worldActive()||viewTicket!==activeEpoch){if(clearDraft)recordSubmissionFailure(askScope,version,textValue,attList);answerBusy=false;syncComposer();return;}
      }
      answerBusy=true;readMessages.push({id:id+':user',requestId:turn.requestId,role:'user',body:textValue,...(attMeta.length?{attachments:attMeta}:{}),createdAt:createdAt,origin:{kind:'user-input',evidenceLabel:'Canlı beyne gönderildi.'}},{id:id,requestId:turn.requestId,role:'assistant',body:'…',pending:true,createdAt:createdAt,origin:attIds.length?{kind:'pending-model',provider:'Google AI Studio',evidenceLabel:'Gemini ekli mesaj yanıtı hazırlanıyor; ağır işçi başlatılmaz.'}:{kind:'pending-model',provider:'Groq',evidenceLabel:'Groq (openai/gpt-oss-120b · düşünme: düşük) yanıtı hazırlanıyor; ağır işçi başlatılmaz.'}});if(readMessages.length>80)readMessages=readMessages.slice(-80);
      syncComposer();update(snapshot);bottom(true);setStatus(attIds.length?'Ekler yükleniyor ve Argon düşünüyor…':'Argon düşünüyor…');
      var res=null,body='',replyShown=false,speechResult=null,prepared=null,usedVoiceMeta=null;
      function showReply(value,voiceMeta){
        if(!owns(owner,ticket))return;
        if(voiceMeta&&typeof voiceMeta==='object')usedVoiceMeta=voiceMeta;
        var r=value||res||prepared;if(!r)return;
        body=sanitizeModelReplyText(r,userApprovedInTurn);
        var providerLabel=r&&({groq:'Groq',openai:'OpenAI Codex',claude:'Claude',gemini:'Gemini',google:'Google AI Studio'})[r.provider],modelLabel=typeof r.model==='string'?safeText(r.model,100):null;
        var httpStatus=Number.isSafeInteger(r.httpStatus)?r.httpStatus:Number.isSafeInteger(r.receipt&&r.receipt.httpStatus)?r.receipt.httpStatus:null;
        var failedOrigin=providerLabel||r.transport==='groq-api'||r.transport==='google-ai-studio-api'||(r.receipt&&r.receipt.modelCall===true)?{kind:'provider-error',provider:providerLabel||(r.transport==='google-ai-studio-api'?'Google AI Studio':'Groq'),...(httpStatus?{httpStatus:httpStatus}:{}),evidenceLabel:'Sağlayıcı çağrısı hata döndürdü; başka modele geçilmedi.'}:{kind:'unknown',evidenceLabel:'Yanıt alınamadı; aynı mesaj kimliği korunuyor.'};
        replyShown=true;
        readMessages=readMessages.map(function(m){
          if(m.id===id+':user')return Object.assign({},m,{failed:!r.ok});
          return m.id===id?{id:id,requestId:turn.requestId,role:'assistant',body:body,failed:!r.ok,createdAt:new Date().toISOString(),origin:nativeReplyOrigin(r,usedVoiceMeta)||(r.ok&&providerLabel&&modelLabel?{kind:'model',provider:providerLabel,model:modelLabel,evidenceLabel:'Yanıtta bildirilen sağlayıcı ve model; düşünme: yüksek'}:r.ok?{kind:'unknown',evidenceLabel:'Sağlayıcı / model kimliği doğrulanmadı.'}:failedOrigin)}:m;
        });
        queueSave(null);
        update(snapshot);bottom(true);
      }
      var revealPrepared=function(){if(prepared&&owns(owner,ticket))showReply(prepared);};pendingAudioReply=revealPrepared;
      try{res=await bridge.askBrain({requestId:turn.requestId,text:turn.text,history:turn.history,mode:turn.mode,...(typeof turn.audioOutput==='boolean'?{audioOutput:turn.audioOutput}:{}),...(attIds.length?{attachments:attIds}:{}),accountKey:owner,onTextReady:function(value){
        if(!owns(owner,ticket)||value.requestId!==turn.requestId||!((value.provider==='groq'&&value.transport==='groq-api')||(value.provider==='google'&&value.transport==='google-ai-studio-api'))||value.model_verified!==true)return;
        prepared=Object.assign({},value,{ok:true});
        if(!voiceState.enabled)revealPrepared();else if(worldActive()&&viewTicket===activeEpoch)setStatus('Yanıtın sesi hazırlanıyor…');
      }});}catch(_e){res={ok:false,answer_tr:prepared&&prepared.answer_tr||(_e&&typeof _e.code==='string'&&/^CHAT_ATTACHMENT_/.test(_e.code)&&typeof _e.message==='string'?_e.message:'İstek sonucu doğrulanamadı. Mesaj kimliği korundu; internet kesintisi olduğu kesinleştirilemedi.'),preparedText:!!prepared};}
      if(!owns(owner,ticket))return;
      if(nativeReplyOrigin(res)&&Array.isArray(res.project_catalog)){res.project_catalog.slice(0,128).forEach(function(p){if(p&&/^[a-z][a-z0-9-]{0,63}$/.test(p.id)&&!validProject(p.id,projects))projects.push({id:p.id,label:safeText(p.name||p.id,120)});});}
      if(res&&!res.ok&&res.terminal&&persist&&d.brainPending&&d.brainPending.requestId===turn.requestId){d.brainPending=Object.assign({},turn,{terminal:true});queueSave(askScope);}
      body=sanitizeModelReplyText(res,userApprovedInTurn);
      if(res&&res.ok&&d.brainPending&&d.brainPending.requestId===turn.requestId){d.brainPending=null;queueSave(askScope);}
      if(res&&res.ok&&worldActive()&&viewTicket===activeEpoch){if(clearDraft&&d.version===version&&!d.attachments.length){drafts.update(askScope,{text:''});queueSave(askScope);if(scope===askScope)renderDraft();}else if(!clearDraft&&d.brainPending&&d.brainPending.requestId===turn.requestId){d.brainPending=null;queueSave(askScope);}}
      if(res&&res.ok&&turn.audioOutput!==false&&worldActive()&&viewTicket===activeEpoch&&voice&&typeof voice.speak==='function'&&voiceState.enabled&&!replyShown){
        var stopWatching=null;
        try{
          var outputDisabled=new Promise(function(resolve){if(typeof voice.subscribe==='function')stopWatching=voice.subscribe(function(v){if(v&&v.enabled===false)resolve({ok:false,reason:'VOICE_DISABLED'});});});
          speechResult=await Promise.race([voice.speak({id:id,requestId:turn.ttsRequestId,text:body.slice(0,2400),audioB64:res.audio_b64||null,audio:res.audio||null,audioStatus:res.audio_status||null,accountKey:owner,serverAudioOnly:typeof turn.audioOutput==='boolean',onStart:function(voiceMeta){showReply(res,voiceMeta);}}),outputDisabled]);
        }catch(_speechError){speechResult={ok:false,reason:'AUDIO_UNAVAILABLE'};}
        finally{if(stopWatching)stopWatching();}
        if(!owns(owner,ticket))return;
      }
      // Muted replies and speech failures remain readable; successful speech reveals at playback.
      showReply(res,speechResult&&speechResult.ok===true?speechResult:usedVoiceMeta);if(pendingAudioReply===revealPrepared)pendingAudioReply=null;
      answerBusy=false;syncComposer();update(snapshot);bottom(true);
      if(speechResult&&speechResult.ok===true&&speechResult.provider==='android-tts'){
        setStatus('Telefonun Türkçe sesi ('+safeText(speechResult.voiceName||'tr-TR',80)+') kullanıldı · '+safeText(speechResult.fallbackReasonText||'Google TTS kotada',120)+'.');
      }else{
        setStatus(res&&res.ok?'':res&&res.preparedText?'Yanıt metni doğrulandı; sesin veya son teslimin durumu doğrulanamadı. Otomatik tekrar yapılmadı.':res&&res.terminal?'Önceki deneme sunucuda hata ile kapandı. Hata sohbet akışında gösteriliyor.':'Beyin yanıt veremedi. Mesajın ve hata bilgisi sohbet akışında gösteriliyor.',res&&res.ok?'normal':'error');
      }
      if(speechResult&&speechResult.ok!==true&&voiceState.enabled&&!/^(?:CANCELLED|VOICE_DISABLED|VOICE_NOT_ENABLED)$/.test(String(speechResult.reason||'')))setStatus(safeText(voiceState.error||'Ses oynatılamadı ('+String(speechResult.reason||'bilinmiyor')+'). Yazılı yanıt gösterildi.',500),'error');
      if(!worldActive()||viewTicket!==activeEpoch){clearConfirmation();return;}

      runBrainActions(res&&res.ok&&Array.isArray(res.actions)?res.actions:[],owner,ticket,turn.requestId,res,userApprovedInTurn);
    }
    function runBrainActions(actions,owner,ticket,sourceRequestId,brainResult,userApprovedInTurn){
      if(!owns(owner,ticket)||!worldActive())return;
      var proposals=actions.filter(function(a){return a&&['create_worker_task','dispatch_studio_flow'].includes(a.tool);});
      if(proposals.length>1){clearConfirmation();setStatus('Her işi ayrı mesajda iste; birden fazla görev otomatik gönderilmedi.','error');return;}
      if(!proposals.length)return;
      var action=proposals[0],proposal=validateStudioProposal(action,brainResult,sourceRequestId,projects);
      if(!proposal){clearConfirmation();setStatus('İş önerisinin Google API yanıtı ve kaynak mesajı doğrulanamadı. Yeni iş gönderilmedi.','error');return;}
      if(action.alreadyQueued===true){
        var receipt=action.receipt||action;
        var queueUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if(receipt.accepted===true&&receipt.status==='durably_queued'&&queueUuid.test(receipt.requestId||receipt.commandId||'')&&queueUuid.test(receipt.flowId||'')){
          setStatus('Görev kalıcı işçi kuyruğuna alındı · '+label(proposal.projectId)+'. Çalışma durumu gerçek iş kartında görünür.');
          if(typeof bridge.refresh==='function')bridge.refresh().catch(function(){});
        }else setStatus('Kuyruk onayı doğrulanmadı; işi yeniden göndermeden iş kayıtlarını kontrol et.','error');
        return;
      }
      if(proposal.ownerApproved===true||userApprovedInTurn===true){
        var targetDraft=drafts.get(proposal.projectId);
        dispatch({accountKey:owner,accountEpoch:ticket,scope:proposal.projectId,text:proposal.instruction,route:null,studioFlow:{schemaVersion:1,sourceRequestId:proposal.sourceRequestId},sourceRequestId:proposal.sourceRequestId,keepDraft:true,attachments:[],version:targetDraft.version},proposal.projectId);
        return;
      }
      askConfirm({accountKey:owner,accountEpoch:ticket,scope:proposal.projectId,target:proposal.projectId,text:proposal.instruction,route:null,studioFlow:{schemaVersion:1,sourceRequestId:proposal.sourceRequestId},sourceRequestId:proposal.sourceRequestId,attachments:[],version:drafts.get(proposal.projectId).version},{silent:true});
    }
    function askConfirm(original,opts){
      clearConfirmation();var silent=!!(opts&&opts.silent),issuedAt=approvalNow(),approvalId=uuid(win.crypto);
      var p=Object.assign({},original,{approvalId:approvalId,issuedAt:issuedAt,expiresAt:issuedAt+APPROVAL_TTL,text:safeText(original.text),attachments:cloneAttachments(original.attachments),route:original.route?Object.freeze(Object.assign({},original.route)):null});
      if(p.studioFlow)p.studioFlow=Object.freeze({schemaVersion:1,sourceRequestId:p.studioFlow.sourceRequestId});
      pendingConfirm=Object.freeze(p);
      if(!silent){drafts.update(p.scope,{text:'',attachments:[]});queueSave(p.scope);if(scope===p.scope)renderDraft();}
      var id='confirm:'+p.accountKey+':'+(++readCounter),createdAt=new Date().toISOString(),question=confirmQuestion(p);
      if(!silent)readMessages.push({id:id+':user',role:'user',body:p.text,createdAt:createdAt,projectId:p.scope||null,origin:{kind:'local',evidenceLabel:'Onay bekleniyor; iş emri henüz oluşturulmadı.'}},{id:id,role:'assistant',body:question,createdAt:createdAt,projectId:p.scope||null,origin:{kind:'local',evidenceLabel:'Onay sorusu. İş emri oluşturulmadı.'}});
      if(readMessages.length>80)readMessages=readMessages.slice(-80);queueSave(null);clarification=null;clarify.replaceChildren();clarify.title=question;
      clarify.appendChild(el('span','jw-clarify-label','Onay · 5 dakika'));
      clarify.appendChild(el('p','jw-approval-target','Hedef: '+label(p.scope)+(p.route?' · Bağımsız iki işçi kontrolü':'')));
      clarify.appendChild(el('p','jw-approval-instruction',p.text));
      var actions=el('div','jw-clarify-actions');actions.setAttribute('aria-label',question);var yes=btn(null,'','Evet, başla');yes.textContent='Evet, başla';var no=btn(null,'','Vazgeç');no.textContent='Vazgeç';
      dynamicOn(yes,'click',function(){resolveConfirm(true,approvalId);});dynamicOn(no,'click',function(){resolveConfirm(false,approvalId);});actions.append(yes,no);clarify.appendChild(actions);clarify.hidden=false;update(snapshot);bottom(true);setStatus('Yalnız yukarıdaki plan onaylanır. Onay 5 dakika geçerlidir. İş emri henüz oluşturulmadı.');
      if(!silent&&active&&voice&&typeof voice.speak==='function'&&voiceState.enabled)voice.speak({id:id,text:question,accountKey:p.accountKey});scheduleMeasure();
    }
    function resolveConfirm(approved,expectedApprovalId){
      var p=pendingConfirm;if(!p||expectedApprovalId!==p.approvalId)return;
      if(!owns(p.accountKey,p.accountEpoch)||!worldActive()){clearConfirmation();return;}
      if(approvalNow()<p.issuedAt||approvalNow()>=p.expiresAt){clearConfirmation();setStatus('Planın onay süresi doldu. İsteği yeniden gönder; iş emri oluşturulmadı.','error');return;}
      clearConfirmation();
      var replyDraft=drafts.get(scope);if(!replyDraft.attachments.length&&(isYes(replyDraft.text)||isNo(replyDraft.text))){drafts.update(scope,{text:''});queueSave(scope);renderDraft();}
      if(!approved){if(!p.target&&!drafts.get(p.scope).text.trim()){drafts.update(p.scope,{text:p.text,attachments:cloneAttachments(p.attachments)});queueSave(p.scope);if(scope===p.scope)renderDraft();}setStatus('Vazgeçildi. İş emri oluşturulmadı.');return;}
      var current=drafts.get(p.scope);if(!p.target&&(current.text.trim()||current.attachments.length)){setStatus('Taslak değişti. Eski plan onaylanmadı; güncel isteği yeniden gönder.','error');return;}
      if(p.target&&current.version!==p.version){setStatus('Hedef projenin taslağı değişti. Eski plan onaylanmadı; isteği yeniden gönder.','error');return;}
      if(!p.target)drafts.update(p.scope,{text:'',attachments:[]});var nd=drafts.get(p.scope);if(scope===p.scope&&!p.target)renderDraft();
      dispatch({accountKey:p.accountKey,accountEpoch:p.accountEpoch,scope:p.scope,text:p.text,route:p.route,studioFlow:p.studioFlow||null,sourceRequestId:p.sourceRequestId||null,approvalId:p.approvalId,keepDraft:!!p.target,attachments:cloneAttachments(p.attachments),version:nd.version},p.target);
    }
    /* ARGON KARA KUTU: a history question ("geçen hafta Forge Run'da ne olmuştu?", "daha önce nasıl çözmüştük?") is answered from DJ-KABIN's
       FTS5 archive: a few precise snippets, never the whole history in the chat, never a job. */
    function isHistoryQuestion(t){var f=foldTr(t);var cue=/\b(?:gecen|onceki|daha once|gecmis\w*|hatirl\w*|kara kutu\w*|arsiv\w*|ne zaman|cozmustuk|cozduk|cozulmustu|yapmistik|yapmistin|demistik|karar verdik|karar vermistik|ne olmustu|neydi)\b/.test(f);var question=/[?]/.test(t)||/\b(?:ne zaman|nasil|neydi|ne olmustu|hatirliyor musun|hatirla|ne yapmistik|ne demistik|kim)\b/.test(f);return cue&&question;}
    async function answerArchive(textValue,originalVersion){
      if(answerBusy)return;var owner=accountKey,ticket=accountEpoch,askScope=scope,answered=false,id='archive:'+owner+':'+(++readCounter),createdAt=new Date().toISOString();
      answerBusy=true;syncComposer();readMessages.push({id:id+':user',role:'user',body:textValue,createdAt:createdAt,origin:{kind:'local',evidenceLabel:'Geçmiş sorusu. İş emri oluşturulmadı.'}});update(snapshot);bottom(true);setStatus('Kara kutuda arıyorum…');
      try{var res=await bridge.askArchive({text:textValue,accountKey:owner});if(!owns(owner,ticket)||!active)return;
        var body=safeText(res&&res.answer_tr||'Kara kutudan yanıt alınamadı. İş emri oluşturulmadı.',1600);
        readMessages.push({id:id,role:'assistant',body:body,createdAt:new Date().toISOString(),origin:{kind:'local',evidenceLabel:'Kara kutu (SQLite FTS5 arşivi) · Model çağrısı yok · İş emri oluşturulmadı.'}});if(readMessages.length>80)readMessages=readMessages.slice(-80);
        var d=drafts.get(askScope);answered=!!(res&&res.ok);if(answered&&d.version===originalVersion&&!d.attachments.length){drafts.update(askScope,{text:''});queueSave(askScope);if(scope===askScope)renderDraft();}
        queueSave(null);
        if(voice&&typeof voice.speak==='function'&&voiceState.enabled)voice.speak({id:id,text:body.split('\n').slice(0,2).join(' ').slice(0,400),accountKey:owner});
        setStatus(res&&res.ok?'Kara kutudan yanıtlandı.':'Kara kutu yanıtı alınamadı; iş emri oluşturulmadı.',res&&res.ok?'normal':'error');
      }catch(_e){if(owns(owner,ticket))setStatus('Kara kutuya ulaşılamadı. İş emri oluşturulmadı.','error');}
      finally{if(owns(owner,ticket)){if(!answered)recordSubmissionFailure(askScope,originalVersion,textValue,[]);answerBusy=false;syncComposer();update(snapshot);bottom(true);}}
    }
    function resetAccount(nextKey){pendingAudioReply=null;pendingConfirm=null;accountKey=nextKey;accountEpoch++;lastRevision=-1;stopSpeech();if(voice&&typeof voice.cancel==='function')voice.cancel();readMessages=[];answerBusy=false;saveTimers.forEach(function(timer){win.clearTimeout(timer);});saveTimers.clear();draftLoads.clear();busyScopes.clear();drafts=new DraftStore(projects);scope=null;clarification=null;clarify.hidden=true;scopeMenu.hidden=true;scopeBtn.setAttribute('aria-expanded','false');attachMenu.hidden=true;add.setAttribute('aria-expanded','false');snapshot={messages:[],jobs:[],connection:{status:'unknown',submitAvailable:false}};nodesByKey.clear();timeline.replaceChildren();renderEmpty();renderDraft();connectionText.textContent='Oturum doğrulanıyor';activityCount.textContent='0';if(energy)energy.setState('offline');if(nextKey)loadDraft(null);setStatus('Hesap değişti. Önceki hesabın taslak ve komutları temizlendi.');}
    function owns(key,epoch){if(destroyed)return false;var current=readAccountKey();if(current!==accountKey)resetAccount(current);return !!key&&key===accountKey&&epoch===accountEpoch;}
    function queueSave(s){if(!bridge.drafts||typeof bridge.drafts.save!=='function')return;var key=accountKey,epoch=accountEpoch,k=draftKey(s);if(saveTimers.has(k))win.clearTimeout(saveTimers.get(k));saveTimers.set(k,win.setTimeout(function(){saveTimers.delete(k);if(!owns(key,epoch))return;var d=drafts.get(s);Promise.resolve(bridge.drafts.save(s,{text:d.text,attachments:cloneAttachments(d.attachments),brainPending:d.brainPending,...(k==='studio'?{chatHistory:persistedReadMessages()}:{}),accountKey:key})).catch(function(){if(owns(key,epoch)&&scope===s)setStatus('Taslak henüz kalıcı kayda alınamadı.','error');});},250));}
    async function loadDraft(s){if(!accountKey||!bridge.drafts||typeof bridge.drafts.load!=='function'||draftLoads.has(draftKey(s)))return;draftLoads.add(draftKey(s));var key=accountKey,epoch=accountEpoch,d=drafts.get(s),version=d.version;try{var restored=await bridge.drafts.load(s,{accountKey:key});if(!owns(key,epoch)||!restored)return;var chatRestored=s===null&&Array.isArray(restored.chatHistory)&&mergeRestoredChat(restored.chatHistory);if(d.version===version){d.text=safeText(restored.text);d.attachments=cloneAttachments(restored.attachments);d.brainPending=restored.brainPending||null;d.version++;if(scope===s)renderDraft();}if(chatRestored){update(snapshot);bottom(true);}}catch(_e){if(owns(key,epoch)&&scope===s)setStatus('Kaydedilmiş taslak yüklenemedi.','error');}}
    function autosize(){input.style.height='44px';input.style.height=Math.max(44,Math.min(120,input.scrollHeight))+'px';}
    function renderDraft(){var viewScope=scope,viewOwner=accountKey,viewEpoch=accountEpoch,d=drafts.get(scope);input.value=d.text;scopeText.textContent=scope?label(scope):'Tüm stüdyo';Array.from(scopeMenu.children).forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.scope===(scope||'')));});attachments.replaceChildren();d.attachments.forEach(function(a){var item=el('span','jw-attachment');if(a.previewUrl&&/^image\//i.test(a.mime||'')){var thumb=el('img','jw-attachment-thumb');thumb.src=a.previewUrl;thumb.alt=a.name||'Görsel';item.appendChild(thumb);}var name=el('span','jw-attachment-name',a.name),sizeText=formatAttachmentSize(a.size),sizeEl=sizeText?el('span','jw-attachment-size',sizeText):null,remove=btn(null,'','Eki kaldır: '+a.name);remove.textContent='×';dynamicOn(remove,'click',function(){if(scope!==viewScope||!owns(viewOwner,viewEpoch))return;var current=drafts.get(viewScope);drafts.update(viewScope,{attachments:current.attachments.filter(function(x){return x.id!==a.id;})});queueSave(scope);renderDraft();});item.appendChild(name);if(sizeEl)item.appendChild(sizeEl);item.appendChild(remove);attachments.appendChild(item);});syncComposer();autosize();}
    function isReadQuery(text){if(brief&&typeof brief.classify==='function')return brief.classify(text).handled===true;if(!brief||typeof brief.respond!=='function'||!studioData)return false;try{var data=studioData.getSnapshot();if(!data||data.accountKey!==accountKey)return false;var answer=brief.respond(text,data);return answer&&answer.handled===true;}catch(_e){return false;}}
    function syncComposer(){
      var d=drafts.get(scope),busy=busyScopes.has(draftKey(scope))||answerBusy;
      var liveVoiceAvailable=!!(voice&&typeof voice.startConversation==='function'&&voiceState.recognitionAvailable!==false&&voiceState.ttsAvailable!==false);
      var legacySpeechAvailable=!!(bridge.speech&&bridge.speech.available!==false&&typeof bridge.speech.start==='function')&&(!voice||voiceState.ttsAvailable!==false);
      var speechAvailable=liveVoiceAvailable||legacySpeechAvailable;
      var query=!d.attachments.length&&isReadQuery(d.text),hasText=!!(d.text.trim()||String(input.value||'').trim()||d.attachments.length);
      var speaking=voiceState.mode==='speaking',voiceLoading=voiceState.mode==='tts-loading'||voiceState.voicePending===true,listening=speechStarting||!!speechStop||voiceState.conversationActive===true||voiceState.mode==='listening';
      send.dataset.empty=String(!hasText);send.disabled=!accountKey||busy||(!brainOn&&!query&&snapshot.connection&&snapshot.connection.submitAvailable===false);
      input.disabled=busy;daily.disabled=!accountKey||answerBusy;
      var outputAvailable=voice&&voiceState.ttsAvailable!==false;
      sound.disabled=!outputAvailable;sound.setAttribute('aria-pressed',String(!!voiceState.enabled));
      sound.setAttribute('aria-label',voiceState.voiceSetupPending?'Erkek ses hazırlığını iptal et':voiceState.needsVoiceSetup?'Erkek sesi hazırla':voiceState.enabled?'Sesli yanıtı kapat':'Sesli yanıtı aç');
      sound.title=voiceState.notice||sound.getAttribute('aria-label');sound.replaceChildren(icon(voiceState.enabled?'sound':'mute'));
      var maxAtt=brainOn?4:3;
      add.disabled=!accountKey||busy||d.attachments.length>=maxAtt||snapshot.capabilities&&snapshot.capabilities.attachments===false||!bridge.attachments||typeof bridge.attachments.choose!=='function';
      if(add.disabled){attachMenu.hidden=true;add.setAttribute('aria-expanded','false');}
      add.title=snapshot.capabilities&&snapshot.capabilities.attachments===false?'Gizli görsel yükleme hazır değil. Metin emri gönderebilirsin.':d.attachments.length>=maxAtt?(brainOn?'Bir mesaja en fazla 4 ek eklenebilir':'Bir komuta en fazla 3 görsel eklenebilir'):'Görsel veya dosya ekle';
      mic.hidden=!speechAvailable&&mode!=='preview';mic.disabled=!accountKey||(!listening&&(busy||voiceLoading))||!speechAvailable;
      var micLabel=!speechAvailable?'Bu cihazda sesle yazma kullanılamıyor':busy&&!listening?'Yanıt bekleniyor; mikrofon kapalı':voiceLoading&&!listening?'Erkek ses hazırlanıyor; mikrofon kapalı':listening?(speechKind==='live'||voiceState.conversationActive===true?'Canlı ses görüşmesini durdur':'Dinlemeyi durdur'):speaking?'Argon konuşuyor; dokunursan susar ve seni dinler':'Konuşmak için mikrofona dokun';
      mic.title=micLabel;mic.setAttribute('aria-label',micLabel);mic.setAttribute('aria-pressed',String(listening));
      mic.dataset.state=busy&&!listening?'waiting':voiceLoading&&!listening?'voice-loading':speechStarting?'starting':listening?(speaking?'speaking':'listening'):speaking?'speaking':'idle';
      send.setAttribute('aria-label',busy?'Komut işleniyor':'Komutu gönder');syncEnergy();
    }
    function selectScope(next){if(next&&!validProject(next,projects))throw new Error('Geçersiz komut kapsamı.');stopSpeech();clearConfirmation();scope=next;clarification=null;clarify.hidden=true;renderDraft();loadDraft(next);setStatus('');/* No selected-game mutation, no global navigation event. */}
    function sourceDetails(message){var details=el('details','jw-source'),summary=el('summary','',sourceLabel(message.origin));details.appendChild(summary);if(message.createdAt){var date=new Date(message.createdAt);details.appendChild(el('p','',Number.isNaN(date.getTime())?'Zaman kaydı doğrulanmadı':date.toLocaleString('tr-TR')));}if(message.commandId)details.appendChild(el('p','','Komut: '+safeText(message.commandId,150)));if(message.origin&&message.origin.voiceLabel)details.appendChild(el('p','','Ses: '+safeText(message.origin.voiceLabel,150)));if(message.origin&&message.origin.evidenceLabel)details.appendChild(el('p','',message.origin.evidenceLabel));return details;}
    function renderMessage(message){var card=el('article','jw-message');card.dataset.role=message.role==='user'?'user':'assistant';card.dataset.messageId=safeText(message.id,150);var head=el('div','jw-message-head'),author=el('span','jw-author',message.role==='user'?'Deniz':message.role==='system'?'Sistem':'Argon');head.appendChild(author);if(message.projectId)head.appendChild(el('span','jw-project-label',label(message.projectId)));card.append(head,el('div','jw-message-body',message.body));if(Array.isArray(message.attachments)&&message.attachments.length){var attRow=el('div','jw-message-attachments');message.attachments.slice(0,4).forEach(function(a){if(a&&a.name)attRow.appendChild(el('span','jw-message-attachment','📎 '+safeText(a.name,120)));});if(attRow.childNodes.length)card.appendChild(attRow);}card.appendChild(sourceDetails(message));return card;}
    function field(labelText,value){var n=el('div','jw-job-field');n.append(el('span','',labelText),el('strong','',value));return n;}
    function renderJob(job){var cardOwner=accountKey,cardEpoch=accountEpoch,card=el('article','jw-job');card.dataset.jobId=safeText(job.id,150);var h=el('div','jw-job-head'),t=el('h3','jw-job-title',job.title||'Komut'),state=el('span','jw-job-state',STATUS[job.status]||'Durum doğrulanmadı');state.dataset.state=job.status||'unknown';h.append(t,state);var grid=el('div','jw-job-grid');grid.append(field('HEDEF',label(job.projectId)),field('UZMAN',job.expert||'Atama bekliyor'),field('İZOLE ALAN',job.workspaceLabel||'Doğrulanmadı'),field('CANLI DURUM',job.statusText||STATUS[job.status]||'Doğrulanmadı'));card.append(h,grid);if(job.workspacePath||job.id||job.blockReason){var details=el('details'),summary=el('summary','','İş ayrıntıları');details.append(summary,el('pre','','İş: '+safeText(job.id,150)+(job.workspacePath?'\nÇalışma alanı: '+safeText(job.workspacePath,500):'')+(job.blockReason?'\nBekleme nedeni: '+safeText(job.blockReason,700):'')));card.appendChild(details);}if(job.canCancel&&typeof bridge.cancelJob==='function'){var row=el('div','jw-job-actions'),cancel=btn(null,'jw-text-button','İşi durdur: '+(job.title||job.id));cancel.textContent='Durdur';dynamicOn(cancel,'click',async function(){if(!owns(cardOwner,cardEpoch))return;cancel.disabled=true;try{await bridge.cancelJob({jobId:job.id,accountKey:cardOwner});if(!owns(cardOwner,cardEpoch))return;setStatus('Durdurma isteği iletildi; işçi yanıtı bekleniyor.');}catch(_e){if(!owns(cardOwner,cardEpoch))return;setStatus('Durdurma isteği iletilemedi.','error');cancel.disabled=false;}});row.appendChild(cancel);card.appendChild(row);}return card;}
    function renderEmpty(){var box=el('div','jw-empty');box.append(el('span','jw-kicker','STÜDYO KOMUTA MERKEZİ'),el('h2','','Beş oyun. Tek net akış.'),el('p','','Ne değişeceğini söyle. Hedef, uzman ve doğrulanmış sonuç burada görünsün.'));var suggestions=el('div','jw-suggestions');['Forge Run ne durumda?','Bugün neler oldu?','Şu anda öncelikli olan ne?'].forEach(function(text){var b=btn(null,'jw-suggestion',text);b.textContent=text;dynamicOn(b,'click',function(){drafts.update(scope,{text:text});renderDraft();queueSave(scope);input.focus();});suggestions.appendChild(b);});box.appendChild(suggestions);timeline.appendChild(box);}
    function syncEnergy(){
      var running=snapshot.jobs.some(function(job){return job.status==='running';});
      var state=voiceState.mode==='speaking'?'speaking':answerBusy||voiceState.mode==='tts-loading'||voiceState.mode==='thinking'?'waiting':voiceState.mode==='listening'?'listening':speechStarting?'starting':running?'working':'idle';
      var labels={speaking:'Yanıtı okuyorum',waiting:'Yanıt bekleniyor',listening:'Dinliyorum',starting:'Mikrofon açılıyor',working:'İşler sürüyor',idle:'Hazır'};
      var hints={speaking:'Mikrofon kapalı. Yanıt sesli okunuyor.',waiting:'Mikrofon kapalı. Yanıt bekleniyor.',listening:'Konuşman bitince tek mesaj gönderilir. İptal etmek için yeniden dokun.',starting:'Mikrofon hazırlanıyor. İptal etmek için yeniden dokun.',working:'Gerçek işçi kayıtları takip ediliyor.',idle:'Konuşmak için mikrofon düğmesine dokun.'};
      orbLabel.textContent=labels[state];orbHint.textContent=voiceState.error||hints[state];orbStage.dataset.mode=state;
      if(energy){var energyState=state==='waiting'||state==='working'?'thinking':state==='starting'?'idle':state;if(!active)energyState='offline';try{energy.setState(energyState);energy.setActivities(snapshot.jobs.map(function(j){return {id:String(j.id),status:j.status==='waiting_review'?'paused':j.status,project:j.projectId};}).filter(function(j){return ['queued','running','blocked','completed','failed','paused','cancelled'].indexOf(j.status)!==-1;}));(state==='listening'||state==='speaking')&&energy.setAudioLevel(typeof voiceState.audioLevel==='number'?voiceState.audioLevel:null);}catch(_e){energy.setState('blocked');}}
    }
    function update(next){if(destroyed)return;next=next&&typeof next==='object'?next:{};var currentAccount=readAccountKey();if(currentAccount!==accountKey)resetAccount(currentAccount);if(Object.prototype.hasOwnProperty.call(next,'accountKey')&&next.accountKey!==accountKey)return;if(Number.isFinite(next.revision)){if(next.revision<lastRevision)return;lastRevision=next.revision;}snapshot={accountKey:accountKey,revision:next.revision,messages:Array.isArray(next.messages)?next.messages:[],jobs:Array.isArray(next.jobs)?next.jobs:[],connection:next.connection||{status:'offline'},capabilities:next.capabilities&&typeof next.capabilities==='object'?next.capabilities:{},energyState:next.energyState||'idle',audioLevel:next.audioLevel};
      if(!activityToggledByUser&&snapshot.jobs.length>0&&!activityVisible){activityVisible=true;activity.setAttribute('aria-expanded','true');activity.setAttribute('aria-label','Aktif işleri gizle');}
      if(!active)return;var follow=isNearBottom(),hadContent=nodesByKey.size>0;var c=snapshot.connection,connected=c.status==='connected';connection.dataset.status=c.status||'offline';connectionText.textContent=mode==='preview'?'Çevrimdışı tasarım önizlemesi':safeText(c.label||(connected?'Kontrol hattı bağlı':'Bağlantı doğrulanmadı'),160);var running=snapshot.jobs.filter(function(j){return ['queued','running','blocked','paused','waiting_review'].indexOf(j.status)!==-1;});activityCount.textContent=String(running.length);
      // Deduplicate server-restored chat turns against in-memory/local readMessages by requestId+role or id.
      var localReqRoles=new Set(readMessages.filter(function(m){return m&&m.requestId;}).map(function(m){return m.requestId+':'+m.role;}));
      var localIds=new Set(readMessages.map(function(m){return m&&m.id;}));
      var filteredSnapshotMessages=snapshot.messages.filter(function(m){
        if(!m)return false;
        if(localIds.has(m.id))return false;
        if(m.requestId&&localReqRoles.has(m.requestId+':'+m.role))return false;
        return true;
      });
      // Canonical history stays global. A per-command scope never filters prior messages.
      shell.dataset.conversation=String(filteredSnapshotMessages.length+readMessages.length>0);var merged=filteredSnapshotMessages.concat(readMessages).map(function(m,i){var c=m&&m.createdAt,t=typeof c==='number'?c:Date.parse(c);/* The outbox stamps epoch ms, local answers ISO text. */return {m:m,i:i,t:Number.isFinite(t)?t:null};});/* One conversation in time order: worker records and local answers interleave by their own timestamps. */merged.sort(function(a,b){return a.t!==null&&b.t!==null&&a.t!==b.t?a.t-b.t:a.i-b.i;});var entries=merged.slice(-120).map(function(x){return {key:'message:'+x.m.id,type:'message',value:x.m,t:x.t,i:x.i,k:0};});if(activityVisible)snapshot.jobs.slice(-40).forEach(function(j,n){var c=j&&j.createdAt,t=typeof c==='number'?c:Date.parse(c);entries.push({key:'job:'+j.id,type:'job',value:j,t:Number.isFinite(t)?t:null,i:100000+n,k:1});});
      /* A job card sits right under the request that created it, so the newest reply stays at the bottom. */entries.sort(function(a,b){if(a.t!==null&&b.t!==null&&a.t!==b.t)return a.t-b.t;if(a.t===null||b.t===null)return a.i-b.i;return a.k-b.k||a.i-b.i;});var records=entries.map(function(e){return {key:e.key,type:e.type,value:e.value};});
      if(records.length===0){if(nodesByKey.size||!timeline.querySelector('.jw-empty')){timeline.replaceChildren();nodesByKey.clear();renderEmpty();}}else{var empty=timeline.querySelector('.jw-empty');if(empty)empty.remove();var retained=new Set();records.forEach(function(r){retained.add(r.key);var signature=JSON.stringify(r.value),old=nodesByKey.get(r.key),n;if(old&&old.signature===signature)n=old.node;else{n=r.type==='message'?renderMessage(r.value):renderJob(r.value);if(old)old.node.replaceWith(n);else timeline.appendChild(n);nodesByKey.set(r.key,{node:n,signature:signature});}var wanted=timeline.children[records.indexOf(r)];if(wanted!==n)timeline.insertBefore(n,wanted||null);});nodesByKey.forEach(function(entry,key){if(!retained.has(key)){entry.node.remove();nodesByKey.delete(key);}});}
      syncEnergy();
      syncComposer();if(active)bottom(follow||!hadContent);
    }
    function showClarification(result,original){clarification={original:original,result:result};clarify.replaceChildren();clarify.title=result.question;clarify.appendChild(el('span','jw-clarify-label','Hedef?'));var actions=el('div','jw-clarify-actions');actions.setAttribute('aria-label',result.question);var candidates=result.candidates.length?result.candidates:projects.map(function(p){return p.id;});candidates.forEach(function(id){var choice=btn(null,'',label(id)+' için onayla');choice.textContent=label(id);dynamicOn(choice,'click',function(){clarify.hidden=true;clarification=null;dispatch(original,id);});actions.appendChild(choice);});clarify.appendChild(actions);clarify.hidden=false;setStatus('Proje adını yaz veya hedefe dokun.');scheduleMeasure();}
    async function dispatch(original,confirmedTarget){if(!owns(original.accountKey,original.accountEpoch))return;var sendScope=original.scope,key=draftKey(sendScope),d=drafts.get(sendScope);if(busyScopes.has(key))return;if(d.version!==original.version){setStatus('Taslak değişti. Güncel komutu yeniden gönder.');return;}busyScopes.add(key);if(scope===sendScope){syncComposer();setStatus('Komut hedefi doğrulanıyor…');}
      try{var resolution;if(confirmedTarget)resolution={status:'ready',projectId:confirmedTarget};else if(typeof bridge.resolveIntent==='function')resolution=validateResolution(await bridge.resolveIntent({scope:sendScope,text:original.text,attachments:original.attachments,accountKey:original.accountKey}),projects);else resolution={status:'clarify',question:'Komut hangi projede çalışsın?',candidates:sendScope?[sendScope]:projects.map(function(p){return p.id;})};if(!owns(original.accountKey,original.accountEpoch))return;if(d.version!==original.version){setStatus('Taslak değişti; önceki komut gönderilmedi.');return;}if(resolution.status==='clarify'){if(scope===sendScope)showClarification(resolution,original);return;}if(resolution.status!=='ready')throw new Error(resolution.message);if(sendScope&&resolution.projectId!==sendScope&&!confirmedTarget){if(scope!==sendScope)return;showClarification({question:'Komut metni seçili kapsamdan farklı bir projeyi işaret ediyor. Hedefi onayla.',candidates:[resolution.projectId,sendScope]},original);return;}
        var flowMeta=original.studioFlow?{studioFlow:{schemaVersion:1,sourceRequestId:original.studioFlow.sourceRequestId}}:{};
        var fingerprint=JSON.stringify({scope:sendScope,projectId:resolution.projectId,text:original.text,attachments:original.attachments,...(original.route?{route:original.route}:{}),...flowMeta});if(!d.pending||d.pending.fingerprint!==fingerprint)d.pending={id:original.approvalId||(typeof options.idFactory==='function'?options.idFactory():uuid(win.crypto)),fingerprint:fingerprint};var receipt=await bridge.submitIntent({accountKey:original.accountKey,id:d.pending.id,projectId:resolution.projectId,scope:sendScope,text:original.text,attachments:cloneAttachments(original.attachments),...(original.route?{route:original.route}:{}),...flowMeta,source:'jarvis-world-v23'});if(!owns(original.accountKey,original.accountEpoch))return;if(!receipt||receipt.accepted!==true||receipt.commandId!==d.pending.id||(receipt.projectId&&receipt.projectId!==resolution.projectId))throw new Error('Kalıcı kuyruk onayı alınamadı. Aynı komut kimliğiyle tekrar deneyebilirsin.');if(d.version===original.version&&!original.keepDraft){drafts.update(sendScope,{text:'',attachments:[]});queueSave(sendScope);}if(scope===sendScope){renderDraft();clarify.hidden=true;setStatus('Komut kaydedildi · '+label(resolution.projectId)+'. İşçi durumu komut kartında görünür.');}/* No optimistic "running" or fake assistant answer. */
      }catch(err){if(owns(original.accountKey,original.accountEpoch)){if(!original.keepDraft)recordSubmissionFailure(sendScope,original.version,original.text,original.attachments);if(scope===sendScope)setStatus(safeText(err&&err.message||'Komut kaydedilemedi. Yeniden dene.',500),'error');}}finally{if(owns(original.accountKey,original.accountEpoch)){busyScopes.delete(key);if(scope===sendScope)syncComposer();}}}
    async function answerRead(textValue,originalVersion,spoken){
      if(answerBusy)return true;var knownRead=isReadQuery(textValue);
      if(!knownRead&&!spoken)return false;
      if(!brief||!studioData||!accountKey){recordSubmissionFailure(scope,originalVersion,textValue,[]);setStatus('Bu soru için sahip hesabına ait stüdyo verisi gerekli. İş emri oluşturulmadı.','error');return true;}
      var owner=accountKey,ticket=accountEpoch,answerScope=scope,data,answer,answered=false;
      answerBusy=true;syncComposer();update(snapshot);
      try{
        data=studioData.getSnapshot();var loaded=data&&Date.parse(data.loadedAt),needsRefresh=!data||data.accountKey!==owner||data.state!=='ready'||data.stale===true||!Number.isFinite(loaded)||Date.now()-loaded>30000;
        if(needsRefresh&&typeof studioData.refresh==='function'){
          setStatus('Stüdyonun güncel kayıtları okunuyor…');
          try{await studioData.refresh();}catch(_e){/* A failed refresh may preserve an explicitly stale, owner-bound snapshot. */}
          if(!owns(owner,ticket)||!active)return true;data=studioData.getSnapshot();
        }
        if(!owns(owner,ticket)||!active)return true;
        if(!data||data.accountKey!==owner){setStatus('Bu hesaba ait güncel stüdyo kaydı alınamadı. İş emri oluşturulmadı.','error');return true;}
        try{answer=await Promise.resolve(brief.respond(textValue,data));}catch(_e){if(owns(owner,ticket)&&active)setStatus('Özet kaynağı şu anda kullanılamıyor. İş emri oluşturulmadı.','error');return true;}
        if(!owns(owner,ticket)||!active)return true;if(!answer||answer.handled!==true){setStatus('Bu soru kayıtlarla eşleştirilemedi. İş emri oluşturulmadı.');return true;}
        answered=true;var replyId='brief:'+owner+':'+(++readCounter),createdAt=new Date().toISOString();
        readMessages.push({id:replyId+':user',role:'user',body:textValue,createdAt:createdAt,origin:{kind:'local',evidenceLabel:'Salt okunur stüdyo sorusu. İş emri oluşturulmadı.'}},{id:replyId,role:'assistant',body:safeText(answer.body),createdAt:createdAt,projectId:answer.projectId||null,origin:{kind:'local',evidenceLabel:'Gerçek stüdyo kayıtlarından yönetici özeti. Model çağrısı yok.'}});if(readMessages.length>80)readMessages=readMessages.slice(-80);
        var d=drafts.get(answerScope);if(d.version===originalVersion&&!d.attachments.length){drafts.update(answerScope,{text:''});queueSave(answerScope);if(scope===answerScope)renderDraft();}
        queueSave(null);
        update(snapshot);bottom(true);if(voice&&typeof voice.speak==='function'&&voiceState.enabled&&owns(owner,ticket)&&active)voice.speak({id:replyId,text:answer.spokenText||answer.body,accountKey:owner});setStatus('Gerçek sistem kayıtlarından yanıtlandı.');return true;
      }catch(_e){if(owns(owner,ticket))setStatus('Stüdyo kaydı okunamadı. İş emri oluşturulmadı.','error');return true;}
      finally{if(owns(owner,ticket)){if(!answered)recordSubmissionFailure(answerScope,originalVersion,textValue,[]);answerBusy=false;syncComposer();update(snapshot);}}
    }
    /* Every tap on Gönder leaves a visible trace in the conversation, never only the small status line (hidden while the keyboard is open). */
    function localExchange(userText,replyText,evidence,version){var id='local:'+accountKey+':'+(++readCounter),createdAt=new Date().toISOString();readMessages.push({id:id+':user',role:'user',body:userText,createdAt:createdAt,origin:{kind:'local',evidenceLabel:evidence}},{id:id,role:'assistant',body:replyText,createdAt:createdAt,origin:{kind:'local',evidenceLabel:evidence}});if(readMessages.length>80)readMessages=readMessages.slice(-80);var d=drafts.get(scope);if(Number.isFinite(version)&&d.version===version&&!d.attachments.length){drafts.update(scope,{text:''});queueSave(scope);renderDraft();}queueSave(null);update(snapshot);bottom(true);setStatus('Yanıtlandı · İş emri oluşturulmadı.');}
    function isGreeting(t){var f=foldTr(t);return f.split(' ').length<=4&&/^(?:merhaba|selam|selamlar|hey|gunaydin|iyi aksamlar|iyi geceler|nasilsin|naber|argon|hey argon|merhaba argon|selam argon)\b/.test(f);}
    /* The box is the truth: Android voice typing / IME composition may not have produced an 'input' event yet, so the draft can lag. */
    function adoptBoxText(){var live=String(input.value||'');var dd=drafts.get(scope);if(live!==dd.text){drafts.update(scope,{text:live});queueSave(scope);}}
    function enableOutputFromSend(){if(voice&&(!outputPreferenceChosen||voiceState.enabled)){if(!outputPreferenceChosen)voice.setEnabled(true);if(typeof voice.unlockAudio==='function')Promise.resolve(voice.unlockAudio()).catch(function(){});}}
    function recordSubmissionFailure(targetScope,version,textValue,files){
      var id='submit-error:'+accountKey+':'+(++readCounter),createdAt=new Date().toISOString();
      var lastUser=readMessages.slice().reverse().find(function(m){return m.role==='user';});
      if(!lastUser||lastUser.body!==textValue)readMessages.push({id:id+':user',role:'user',body:textValue,attachments:cloneAttachments(files||[]),createdAt:createdAt,origin:{kind:'local',evidenceLabel:'Gönderim denemesi.'}});
      readMessages.push({id:id,role:'assistant',body:'İstek tamamlanamadı. Gönderdiğin mesaj sohbet akışında kaldı; giriş alanı temiz.',status:'failed',createdAt:createdAt,origin:{kind:'local',evidenceLabel:'Gönderim hatası · Giriş alanına geri yüklenmedi.'}});
      if(readMessages.length>80)readMessages=readMessages.slice(-80);queueSave(null);update(snapshot);bottom(true);
    }
    async function submit(fromSpeech){
      if(fromSpeech!==true)enableOutputFromSend();adoptBoxText();
      var key=readAccountKey();if(key!==accountKey)resetAccount(key);
      if(!accountKey){setStatus('Önce sahip hesabıyla giriş yapmalısın. İş emri oluşturulmadı.','error');return;}
      if(answerBusy){setStatus('Önceki yanıt hazırlanıyor; bir saniye sonra tekrar gönder.');return;}
      var owner=accountKey,ticket=accountEpoch,submitScope=scope,d=drafts.get(submitScope);
      if(!d.text.trim()&&!d.attachments.length)return;
      stopSpeech();var textValue=d.text.trim(),sentAttachments=cloneAttachments(d.attachments),pendingTurn=d.brainPending;
      // Confirmations keep their existing target/version authorization; no async wait precedes clearing.
      if(pendingConfirm&&pendingConfirm.accountKey===owner&&(isYes(textValue)||isNo(textValue))){input.value='';resolveConfirm(isYes(textValue),pendingConfirm.approvalId);return;}
      input.value='';drafts.update(submitScope,{text:'',attachments:[]});
      if(pendingTurn&&pendingTurn.text===textValue)d.brainPending=pendingTurn;
      var version=d.version;queueSave(submitScope);renderDraft();autosize();syncComposer();
      if(pendingConfirm)clearConfirmation();
      if(brainOn){brainTurn(textValue||'Bu eki incele.',version,sentAttachments);return;}
      if(sentAttachments.length&&isReadQuery(textValue)){recordSubmissionFailure(submitScope,version,textValue,sentAttachments);setStatus('Bu soru sistem verisini okur. Ekli görselleri kaldırıp yeniden sor; iş emri oluşturulmadı.');return;}
      if(!sentAttachments.length&&await answerRead(textValue,version,false))return;
      if(!owns(owner,ticket)||scope!==submitScope||d.version!==version)return;
      if(!sentAttachments.length&&typeof bridge.askArchive==='function'&&isHistoryQuestion(textValue)){answerArchive(textValue,version);return;}
      if(!sentAttachments.length&&isGreeting(textValue)){localExchange(textValue,'Buradayım efendim. Bir oyunun durumunu sorabilir (“Forge Run ne durumda?”), günlük özeti isteyebilir ya da yapılacak değişikliği yazabilirsin; göndermeden önce sana onaylatırım.','Selamlaşma · Model çağrısı yok · İş emri oluşturulmadı.',version);return;}
      var unknownKind=brief&&typeof brief.classify==='function'&&brief.classify(textValue).kind==='unknown';var folded=textValue.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');var looksQuestion=(/[?]/.test(textValue)||/\b(?:nasil|neden|nedir|nerede|kim|ne durumda|mi|midir|musun)\b/.test(folded))&&!/\b(?:duzelt\w*|ekle\w*|gelistir\w*|baslat\w*|degistir\w*|uret\w*|planla\w*|yayinla\w*|sil|test et|calistir\w*|paketle\w*|ilerlet\w*|guncelle\w*)\b/.test(folded);
      /* Without confirm-first the v26 contract keeps unmatched text out of the queue. With confirm-first an unmatched statement
         ("KOZA'da kamera titriyor") becomes a change request that is only queued after an explicit Evet; unmatched questions get a visible reply. */
      if(unknownKind&&!confirmBeforeQueue){recordSubmissionFailure(submitScope,version,textValue,sentAttachments);setStatus('Bunu kayıt sorusu veya açık bir değişiklik emri olarak eşleştiremedim. Yapılacak değişikliği açıkça yaz; iş emri oluşturulmadı.');return;}
      if(looksQuestion){if(confirmBeforeQueue){localExchange(textValue,'Bu soruyu stüdyo kayıtlarıyla eşleştiremedim efendim. Bir oyunun durumunu, günlük özeti, önceliği ya da geçmişte nasıl çözdüğümüzü sorabilirsin. İş emri oluşturulmadı.','Eşleşmeyen soru · Model çağrısı yok · İş emri oluşturulmadı.',version);return;}recordSubmissionFailure(submitScope,version,textValue,sentAttachments);setStatus('Bu soruyu sistem kayıtlarıyla eşleştiremedim. Günlük özet, öncelik veya bir oyunun durumunu sorabilirsin. İş emri oluşturulmadı.');return;}var request={accountKey:owner,accountEpoch:ticket,scope:submitScope,text:textValue,attachments:sentAttachments,version:version};if(confirmBeforeQueue){askConfirm(request);return;}dispatch(request);}
    function flushDrafts(){if(readAccountKey()!==accountKey){saveTimers.forEach(function(timer){win.clearTimeout(timer);});saveTimers.clear();return;}if(bridge.drafts&&typeof bridge.drafts.save==='function'&&accountKey&&!saveTimers.has('studio'))saveTimers.set('studio',0);saveTimers.forEach(function(timer,key){if(timer)win.clearTimeout(timer);var targetScope=key==='studio'?null:key,d=drafts.get(targetScope);try{Promise.resolve(bridge.drafts.save(targetScope,{text:d.text,attachments:cloneAttachments(d.attachments),brainPending:d.brainPending,...(key==='studio'?{chatHistory:persistedReadMessages()}:{}),accountKey:accountKey})).catch(function(){});}catch(_e){}});saveTimers.clear();}
    function stopSpeech(){speechEpoch++;speechStarting=false;if(voice&&typeof voice.stopListening==='function')voice.stopListening();if(speechStop){try{speechStop();}catch(_e){}speechStop=null;}mic.setAttribute('aria-pressed','false');syncComposer();}
    var touchSentAt=0;
    on(form,'submit',function(e){e.preventDefault();if(Date.now()-touchSentAt<800)return;/* Close the phone keyboard so the reply and the Evet/Vazgeç buttons are not squeezed out of view. */if(win.matchMedia&&win.matchMedia('(pointer: coarse)').matches)input.blur();submit();});
    /* Phone: a tap on Gönder while the keyboard is open used to blur the box first; the keyboard closed, the layout jumped and the
       click landed elsewhere. touchstart is cancelled (focus and layout stay put) and the send happens on touchend, on the button. */
    on(send,'touchstart',function(e){if(e.cancelable)e.preventDefault();},{passive:false});
    on(send,'touchend',function(e){if(e.cancelable)e.preventDefault();var t=e.changedTouches&&e.changedTouches[0],r=send.getBoundingClientRect();if(t&&(t.clientX<r.left-24||t.clientX>r.right+24||t.clientY<r.top-24||t.clientY>r.bottom+24))return;touchSentAt=Date.now();submit().then(function(){if(win.matchMedia&&win.matchMedia('(pointer: coarse)').matches)input.blur();});},{passive:false});
    function boxChanged(){stopSpeech();drafts.update(scope,{text:input.value});clarify.hidden=true;queueSave(scope);autosize();syncComposer();}
    on(input,'input',boxChanged);on(input,'compositionend',boxChanged);on(input,'change',boxChanged);/* The phone keyboard shows a Gönder key (enterkeyhint="send"): it must send, not add a new line. Shift+Enter keeps a line break on
   desktop. Some Android keyboards deliver the key only as an insertLineBreak/insertParagraph input, so both paths submit. */
    function keyboardSend(e){e.preventDefault();if(win.matchMedia&&win.matchMedia('(pointer: coarse)').matches)input.blur();submit();}
    on(input,'keydown',function(e){if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229)keyboardSend(e);});
    on(input,'beforeinput',function(e){if((e.inputType==='insertLineBreak'||e.inputType==='insertParagraph')&&!e.isComposing&&win.matchMedia&&win.matchMedia('(pointer: coarse)').matches)keyboardSend(e);});on(scopeBtn,'click',function(){scopeMenu.hidden=!scopeMenu.hidden;scopeBtn.setAttribute('aria-expanded',String(!scopeMenu.hidden));});
    async function pickAttachments(kind){
      attachMenu.hidden=true;add.setAttribute('aria-expanded','false');
      if(add.disabled||snapshot.capabilities&&snapshot.capabilities.attachments===false)return;
      var chosenScope=scope,owner=accountKey,epoch=accountEpoch,maxAllowed=brainOn?4:3,remaining=maxAllowed-drafts.get(chosenScope).attachments.length;
      if(remaining<=0)return;
      try{
        var chooseOpts={scope:chosenScope,maxFiles:remaining,accountKey:owner};
        if(kind)chooseOpts.kind=kind;
        var picked=await bridge.attachments.choose(chooseOpts);
        if(!owns(owner,epoch))return;
        var target=drafts.get(chosenScope);
        drafts.update(chosenScope,{attachments:cloneAttachments(target.attachments.concat(cloneAttachments(picked,maxAllowed)),maxAllowed)});
        queueSave(chosenScope);if(scope===chosenScope)renderDraft();
      }catch(err){if(owns(owner,epoch)&&scope===chosenScope)setStatus(err&&err.message||'Görsel eklenemedi.','error');}
    }
    on(attachImgBtn,'click',function(){pickAttachments('image');});
    on(attachFileBtn,'click',function(){pickAttachments('file');});
    on(add,'click',function(){if(add.disabled||snapshot.capabilities&&snapshot.capabilities.attachments===false)return;if(brainOn){attachMenu.hidden=!attachMenu.hidden;add.setAttribute('aria-expanded',String(!attachMenu.hidden));return;}pickAttachments();});
    on(sound,'click',function(){
      if(!voice)return;
      outputPreferenceChosen=true;var enableOutput=!voiceState.enabled;if(!enableOutput)stopSpeech();voice.setEnabled(enableOutput);
    });on(daily,'click',function(){enableOutputFromSend();if(!accountKey||answerBusy)return;stopSpeech();if(brainOn){brainTurn('Bugün stüdyoda neler oldu? Kısaca özetle.',-1);return;}answerRead('Bugün neler oldu?',-1,false);});
    /* Microphone engine choice. 'speech' (default) = phone recognizer + Groq text brain; 'live' = Gemini Live audio session.
       options.voiceMode wins; otherwise the per-device setting localStorage['oryvona.argon.voiceMode'] ('live' | 'speech'). */
    function liveVoicePreferred(){if(options.voiceMode==='live')return true;if(options.voiceMode==='speech')return false;try{return !!(win.localStorage&&win.localStorage.getItem('oryvona.argon.voiceMode')==='live');}catch(_e){return false;}}
    on(mic,'click',function(){
      if(destroyed||!worldActive()||!accountKey)return;
      if(speechStop||speechStarting||voiceState.conversationActive){var wasLive=speechKind==='live'||voiceState.conversationActive===true;stopSpeech();setStatus(wasLive?'Canlı ses görüşmesi durduruldu.':'Dinleme durduruldu. Söylediğin kısım taslakta duruyor.');return;}
      if(answerBusy||busyScopes.has(draftKey(scope)))return;
      var canUseLiveVoice=!!(voice&&typeof voice.startConversation==='function'&&voiceState.recognitionAvailable!==false&&voiceState.ttsAvailable!==false);
      var canUseLegacySpeech=!!(bridge.speech&&bridge.speech.available!==false&&typeof bridge.speech.start==='function')&&(!voice||voiceState.ttsAvailable!==false);
      if(!canUseLiveVoice&&!canUseLegacySpeech){setStatus('Bu cihazda sesle yazma kullanılamıyor.','error');return;}
      enableOutputFromSend();
      var owner=accountKey,ticket=accountEpoch,viewTicket=activeEpoch,captureTicket=++speechEpoch,captureScope=scope,baseText=drafts.get(scope).text.trim(),finalText='',finished=false;
      function valid(){return !finished&&captureTicket===speechEpoch&&owns(owner,ticket)&&worldActive()&&viewTicket===activeEpoch&&scope===captureScope;}
      /* v1.0: the phone's own speech recognizer is the default microphone (tap → speak → sent → Groq reply → Charon or phone voice).
         Gemini Live stays available but only runs when the phone has no recognizer or Deniz explicitly selects it (voiceMode 'live'). */
      var useLiveVoice=canUseLiveVoice&&(!canUseLegacySpeech||liveVoicePreferred());
      speechKind=useLiveVoice?'live':'speech';
      if(useLiveVoice){
        var liveTurns=new Map(),activeLiveTurnId='1';
        var liveModelName=(options.geminiClient&&options.geminiClient.LIVE_MODEL)||(win.OryvonaStudioGemini&&win.OryvonaStudioGemini.LIVE_MODEL)||'gemini-3.8-live';
        function ensureLiveTurn(turnId){
          var key=String(turnId||activeLiveTurnId||'1');activeLiveTurnId=key;
          if(!liveTurns.has(key)){
            var nowIso=new Date().toISOString();
            liveTurns.set(key,{turnId:key,userMsgId:'live:'+owner+':'+captureTicket+':turn-'+key+':user',assistantMsgId:'live:'+owner+':'+captureTicket+':turn-'+key+':assistant',userText:'',rawReplyText:'',replyText:'',finalUser:false,finalReply:false,interrupted:false,taskReceipt:null,confirmHandled:false,createdAtUser:nowIso,createdAtAssistant:nowIso});
          }
          return liveTurns.get(key);
        }
        function upsertLiveMessage(msg,persistNow){
          var found=false;
          readMessages=readMessages.map(function(m){if(m&&m.id===msg.id){found=true;return Object.assign({},m,msg);}return m;});
          if(!found){readMessages.push(msg);if(readMessages.length>80)readMessages=readMessages.slice(-80);}
          if(persistNow)queueSave(null);
          update(snapshot);bottom(true);
        }
        function renderLiveReply(t,persistNow){
          if(!t||!t.rawReplyText)return;
          t.replyText=sanitizeModelReplyText({ok:true,answer_tr:t.rawReplyText,workerReceipt:t.taskReceipt},!!t.taskReceipt);
          var voiceTag='Gemini Live (Charon)'+(t.interrupted?' · Kesildi':'');
          upsertLiveMessage({
            id:t.assistantMsgId,
            role:'assistant',
            body:t.replyText,
            pending:!t.finalReply,
            createdAt:t.createdAtAssistant,
            origin:{
              kind:'model',
              provider:'Google AI Studio',
              model:liveModelName,
              modelVerified:true,
              voiceLabel:voiceTag,
              evidenceLabel:t.interrupted?'Gemini Live sesli yanıtı kullanıcı araya girdiği için kesildi.':'Gemini Live gerçek zamanlı sesli yanıt dökümü (Charon). İkinci kez TTS çağrılmaz.'
            }
          },persistNow);
        }
        function handleLiveTranscript(text,meta){
          if(!valid())return;
          var clean=safeText(text,2000).trim();if(!clean)return;
          var isFinal=!!(meta&&meta.final);
          var t=ensureLiveTurn(meta&&meta.turnId);
          t.userText=clean;t.finalUser=isFinal;
          if(isFinal&&!t.confirmHandled&&pendingConfirm&&pendingConfirm.accountKey===owner&&(isYes(clean)||isNo(clean))){
            t.confirmHandled=true;resolveConfirm(isYes(clean),pendingConfirm.approvalId);return;
          }
          upsertLiveMessage({
            id:t.userMsgId,
            role:'user',
            body:clean,
            pending:!isFinal,
            createdAt:t.createdAtUser,
            origin:{kind:'user-input',evidenceLabel:isFinal?'Gemini Live sesli mesajı.':'Gemini Live mikrofon dinleniyor…'}
          },isFinal);
          setStatus(isFinal?'Gemini Live yanıtlıyor…':'Dinliyorum: '+safeText(clean,80));
        }
        speechStarting=true;syncComposer();setStatus('Gemini Live bağlantısı kuruluyor…');
        Promise.resolve().then(function(){
          return voice.startConversation({
            onTranscript:handleLiveTranscript,
            onResult:function(result){if(result)handleLiveTranscript(result.text,{final:result.final===true,turnId:result.turnId||activeLiveTurnId});},
            onReply:function(text,meta){
              if(!valid())return;
              var t=ensureLiveTurn(meta&&meta.turnId);
              if(t.interrupted&&!(meta&&meta.interrupted))return;
              var raw=safeText(text,2400).trim();if(!raw)return;
              var isFinal=!!(meta&&meta.final),isInterrupted=!!(meta&&meta.interrupted);
              if(isInterrupted)t.interrupted=true;
              t.rawReplyText=raw;t.finalReply=isFinal||isInterrupted;
              renderLiveReply(t,t.finalReply);
            },
            onInterrupted:function(meta){
              if(!valid())return;
              var t=ensureLiveTurn(meta&&meta.turnId||activeLiveTurnId);
              t.interrupted=true;t.finalReply=true;
              renderLiveReply(t,true);
              setStatus('Araya girdin; önceki yanıt durduruldu, Argon seni dinliyor.');
            },
            onTask:function(receipt){
              if(!valid())return;
              var queueUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
              var verified=!!(receipt&&receipt.accepted===true&&receipt.status==='durably_queued'&&queueUuid.test(receipt.requestId||receipt.commandId||'')&&queueUuid.test(receipt.flowId||''));
              var t=ensureLiveTurn(activeLiveTurnId);
              if(verified){
                t.taskReceipt=receipt;renderLiveReply(t,true);
                setStatus('Görev kalıcı işçi kuyruğuna alındı (#'+String(receipt.requestId||receipt.commandId).slice(0,8)+'). Çalışma durumu gerçek iş kartında görünür.');
                if(typeof bridge.refresh==='function')Promise.resolve(bridge.refresh()).catch(function(){});
              }else{
                setStatus('Kalıcı kuyruk kaydı doğrulanmadı; görev başlatılmadı.','error');
              }
            },
            onEnd:function(){
              if(!valid())return;
              finished=true;speechStarting=false;speechStop=null;syncComposer();
              setStatus('Canlı ses bağlantısı kapandı.');
            }
          });
        }).then(function(session){
          if(!valid()){if(session&&typeof session.stop==='function')session.stop();return;}
          if(!session||session.ok===false){
            finished=true;speechStarting=false;speechStop=null;syncComposer();
            setStatus(voiceState.error||'Gemini Live canlı ses açılamadı. Yazarak devam edebilirsin.','error');
            return;
          }
          speechStarting=false;speechStop=typeof session.stop==='function'?session.stop:function(){if(voice&&typeof voice.stopListening==='function')voice.stopListening();};
          syncComposer();setStatus('Canlı Argon açık (Gemini Live · Charon). Konuşabilirsin; bitirmek için mikrofona dokun.');
        }).catch(function(error){
          if(valid()){finished=true;speechStarting=false;speechStop=null;syncComposer();setStatus(error&&error.message||'Gemini Live açılamadı. Yazarak devam edebilirsin.','error');}
        });
        return;
      }
      if(voice&&typeof voice.cancel==='function')voice.cancel();
      speechStarting=true;syncComposer();setStatus('Dinliyorum. Konuşman bitince mesajın gönderilecek.');
      try{
        var capture=bridge.speech.start({
          onStart:function(){if(valid())setStatus('Dinliyorum. Konuşman bitince mesajın gönderilecek.');},
          onResult:function(result){
            if(!valid()||!result)return;var text=safeText(result.text,4000).trim();
            finalText=result.final===true?text:'';
            drafts.update(captureScope,{text:[baseText,text].filter(Boolean).join(' ')});renderDraft();queueSave(captureScope);
          },
          onError:function(error){if(!valid())return;finished=true;stopSpeech();setStatus(error&&error.message||'Sesle yazma tamamlanamadı. Mesajın taslakta korunuyor.','error');},
          onEnd:function(){
            if(!valid())return;finished=true;speechStarting=false;speechStop=null;syncComposer();
            if(finalText){setStatus('Konuşman gönderiliyor…');submit(true);}
            else setStatus('Konuşma algılanmadı. Yeniden deneyebilir veya mesajını yazabilirsin.');
          }
        });
        if(!valid()){if(!finished&&capture&&typeof capture.stop==='function')capture.stop();return;}
        if(!capture||typeof capture.stop!=='function')throw new Error('Sesle yazma başlatılamadı.');
        speechStarting=false;speechStop=capture.stop;syncComposer();
      }catch(error){if(valid()){finished=true;speechStarting=false;speechStop=null;syncComposer();setStatus(error&&error.message||'Sesle yazma açılamadı. Yazarak devam edebilirsin.','error');}}
    });
    on(activity,'click',function(){activityToggledByUser=true;activityVisible=!activityVisible;activity.setAttribute('aria-expanded',String(activityVisible));activity.setAttribute('aria-label',activityVisible?'Aktif işleri gizle':'Aktif işleri göster');update(snapshot);if(activityVisible)bottom(true);});
    function measure(){if(raf){win.cancelAnimationFrame(raf);raf=0;}if(measureTimer){win.clearTimeout(measureTimer);measureTimer=0;}if(destroyed||!active)return;var vv=win.visualViewport,rect=root.getBoundingClientRect();/* A hidden root reports top 0: measuring it would push the composer under the navigation bar. */if(root.hidden||!root.getClientRects().length)return;var viewportTop=vv?vv.offsetTop:0,viewportBottom=viewportTop+(vv?vv.height:win.innerHeight),nav=doc.querySelector('.tabs'),navRect=nav&&!nav.hidden&&nav.getClientRects().length?nav.getBoundingClientRect():null,rawInset=typeof options.bottomInset==='function'?options.bottomInset():options.bottomInset,cssInset=parseFloat(win.getComputedStyle(doc.documentElement).getPropertyValue('--bottom-nav-h'))||0,inset=Number.isFinite(rawInset)?Math.max(0,rawInset):cssInset,lower=viewportBottom-inset;if(navRect&&navRect.bottom>viewportTop&&navRect.top<viewportBottom)lower=Math.min(lower,navRect.top);var height=Math.max(1,Math.floor(lower-Math.max(viewportTop,rect.top)));root.style.setProperty('--jw-shell-height',height+'px');shell.dataset.compact=String(height<420);shell.dataset.tight=String(height<250);shell.dataset.ultra=String(height<180);shell.dataset.micro=String(height<92);}
    /* Layout must not depend on a painted frame alone (throttled WebView, background tab): a short timer backs the frame. */
    function scheduleMeasure(){if(raf||measureTimer)return;raf=win.requestAnimationFrame(measure);measureTimer=win.setTimeout(measure,80);}
    if(typeof doc.addEventListener==='function'){on(doc,'oryvona:view-change',function(event){if(event.detail&&event.detail.view!=='jarvis'){activeEpoch++;clearConfirmation();stopSpeech();if(voice&&typeof voice.cancel==='function')voice.cancel();}});on(doc,'visibilitychange',function(){if(doc.hidden||doc.visibilityState==='hidden'){activeEpoch++;clearConfirmation();stopSpeech();if(voice&&typeof voice.cancel==='function')voice.cancel();flushDrafts();}else if(active){draftLoads.delete('studio');loadDraft(null);if(typeof bridge.refresh==='function')Promise.resolve(bridge.refresh()).catch(function(){});}});}
    on(win,'resize',scheduleMeasure);on(win,'pagehide',flushDrafts);if(win.visualViewport){on(win.visualViewport,'resize',scheduleMeasure);on(win.visualViewport,'scroll',scheduleMeasure);}on(input,'focus',scheduleMeasure);if(win.ResizeObserver){var layoutObserver=new win.ResizeObserver(scheduleMeasure);layoutObserver.observe(header);var measuredNav=doc.querySelector('.tabs');if(measuredNav)layoutObserver.observe(measuredNav);listeners.push(function(){layoutObserver.disconnect();});}
    if(voice&&typeof voice.subscribe==='function')voiceUnsub=voice.subscribe(function(next){
      if(destroyed)return;if(readAccountKey()!==accountKey){resetAccount(readAccountKey());return;}
      var previous=voiceState;voiceState=next||{enabled:false,mode:'idle'};if(!voiceState.enabled&&pendingAudioReply)pendingAudioReply();
      var changed=previous.mode!==voiceState.mode||previous.enabled!==voiceState.enabled||previous.ttsAvailable!==voiceState.ttsAvailable||previous.recognitionAvailable!==voiceState.recognitionAvailable||previous.notice!==voiceState.notice||previous.error!==voiceState.error||previous.needsVoiceSetup!==voiceState.needsVoiceSetup||previous.voiceSetupPending!==voiceState.voiceSetupPending||previous.voicePending!==voiceState.voicePending||previous.voiceName!==voiceState.voiceName||previous.voiceProvider!==voiceState.voiceProvider;
      if(changed){syncComposer();syncEnergy();if(voiceState.error&&voiceState.error!==previous.error)setStatus(safeText(voiceState.error,500),'error');else if(voiceState.mode==='tts-loading'||voiceState.voiceSetupPending)setStatus(safeText(voiceState.notice,500));else if(previous.mode==='tts-loading'&&!answerBusy)setStatus('');}
      else if(active&&energy&&(voiceState.mode==='listening'||voiceState.mode==='speaking')){try{energy.setAudioLevel(typeof voiceState.audioLevel==='number'?voiceState.audioLevel:null);}catch(_e){/* A stale meter event is never a conversation redraw. */}}
    });if(studioData&&typeof studioData.subscribe==='function')dataUnsub=studioData.subscribe(function(){if(!destroyed)syncComposer();});
    if(win.JarvisEnergyCore&&typeof win.JarvisEnergyCore.mount==='function')energy=win.JarvisEnergyCore.mount(canvas,{state:'idle'});else canvas.hidden=true;
    unsub=bridge.subscribe(update);Promise.resolve(bridge.getSnapshot()).then(update).catch(function(){if(lastRevision<0)update({connection:{status:'offline',label:'Kontrol hattına ulaşılamıyor'},messages:[],jobs:[]});});renderDraft();loadDraft(null);measure();
    return {setActive:function(value){var next=!!value;if(next!==active)activeEpoch++;active=next;root.hidden=!active;if(!active){clearConfirmation();stopSpeech();if(voice&&typeof voice.cancel==='function')voice.cancel();if(energy)energy.setState('offline');}else{scheduleMeasure();update(snapshot);}},refresh:function(){return Promise.resolve(bridge.getSnapshot()).then(update);},selectScope:selectScope,destroy:function(){if(destroyed)return;flushDrafts();destroyed=true;stopSpeech();if(voice&&typeof voice.cancel==='function')voice.cancel();if(typeof voiceUnsub==='function')voiceUnsub();if(typeof dataUnsub==='function')dataUnsub();if(typeof unsub==='function')unsub();listeners.forEach(function(off){off();});saveTimers.forEach(function(timer){win.clearTimeout(timer);});if(raf)win.cancelAnimationFrame(raf);if(measureTimer)win.clearTimeout(measureTimer);if(energy)energy.destroy();root.replaceChildren();root.classList.remove('jw-root');root.removeAttribute('data-jarvis-world');root.style.removeProperty('--jw-shell-height');}};
  }
  return Object.freeze({mount:mount,PROJECTS:PROJECTS,_test:Object.freeze({DraftStore:DraftStore,validateResolution:validateResolution,sourceLabel:sourceLabel,cloneAttachments:cloneAttachments,uuid:uuid,validateStudioProposal:validateStudioProposal,nativeReplyOrigin:nativeReplyOrigin,limitDailyReplySentences:limitDailyReplySentences,hasUnverifiedExecutionClaim:hasUnverifiedExecutionClaim})});
});
