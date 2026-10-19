(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OryvonaJarvisBrief = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const text = (x, n = 1200) => typeof x === 'string' ? x.trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, n) : '';
  const list = x => Array.isArray(x) ? x : [];
  function fold(x) { return text(x, 12000).toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim(); }
  const ALIASES = [ ['koza', /\bkoza\b/], ['charm-drop', /\bcharm[ -]?drop\b/], ['forge-run', /\bforge[ -]?run\b/], ['aeryo', /\baeryo\b/], ['tupsper', /\b(?:tuckspire|tupsper)\b/] ];
  function classify(input) {
    const value = fold(input).replace(/^(?:hey |merhaba |selam )?(?:argon|jarvis)\b[\s,]*/, '');
    // A mixed read/write utterance must remain with the existing authenticated
    // command path; the local summary must never swallow an intended mutation.
    if (/\b(?:duzelt\w*|yayinla\w*|baslat\w*|sil|silin|siler\w*|calistir\w*|ekle\w*|gelistir\w*|ilerlet\w*|iptal\w*|onayla\w*|degistir\w*|yukle\w*|birlestir\w*|gonder\w*|uret\w*|durdur\w*|guncelle\w*|duzenle\w*|ciz\w*|olustur\w*|kur|kaldir\w*|ac|kapat\w*|indir\w*|bitir\w*|yap|kaydet\w*|temizle\w*|incele\w*)\b|\b(?:test et|kontrol et|build al|apk (?:al|cikar|yap)|paketle\w*)\b/.test(value)) return { handled: false, kind: 'mutation', projectId: null };
    // Closed read vocabulary: a new imperative or an additional unknown clause
    // is not silently consumed as a summary. Existing command routing decides it.
    const readWords = new Set(('bugun bugunku gunluk ozet ozeti brief briefi neler ne oldu yaptin yaptik yaptigini yaptiklarini yapildi su anda an simdi oncelik oncelikli onceligi olan en onemli konu siradaki adim is yapmaliyim yapalim nedir durumda durumu durumunu durum nasil gidiyor son gelisme gelismeler gelismeleri sonuc sonucu sonuclari asamada studyo studyonun oyunlar oyunlarin sistem sistemin isler islerin sonuclanmis test testler testleri testin lutfen bana bize anlat soyle ver cikar getir goster gosterebilir misin gec gecer kisa bir ogrenmek istiyorum da de ta te in un nun nin icin hakkinda ile ilgili ozetle kisaca bugunden biliyor musun').split(' '));
    const residual = ALIASES.reduce((s, [, rx]) => s.replace(rx, ' '), value).trim();
    if (residual.split(/\s+/).some(word => word && !readWords.has(word))) return { handled: false, kind: 'unknown', projectId: null };
    const projects = ALIASES.filter(([, rx]) => rx.test(value)).map(([id]) => id);
    const daily = /\b(?:bugun|gunluk|bugunku)\b/.test(value) && /\b(?:ozet\w*|brief\w*|neler|ne oldu|ne yaptin|ne yapildi|ne yaptik)\b/.test(value);
    const priority = /\b(?:oncelik\w*|en onemli|siradaki (?:adim|is)|simdi ne yapmaliyim|simdi ne yapalim)\b/.test(value);
    const status = /\b(?:ne durumda|durum\w*|nasil gidiyor|son gelisme\w*|sonuc\w*|ne asamada)\b/.test(value);
    if (daily && !projects.length) return { handled: true, kind: 'daily', projectId: null };
    if (priority && projects.length <= 1) return { handled: true, kind: 'priority', projectId: projects[0] || null };
    if ((status || daily) && projects.length === 1) return { handled: true, kind: daily ? 'project-daily' : 'project-status', projectId: projects[0] };
    if (status && !projects.length && /\b(?:studyo|oyunlar|sistem|isler)\b/.test(value)) return { handled: true, kind: 'studio-status', projectId: null };
    return { handled: false, kind: 'unknown', projectId: null };
  }
  function actorName(actor) { const v = fold(actor); return /\bclaude\b/.test(v) ? 'Claude' : /\b(?:openai|codex|work)\b/.test(v) ? 'OpenAI' : /\b(?:gemini|jarvis)\b/.test(v) ? 'Argon işçisi' : v === 'deniz' ? 'Deniz' : 'işçi'; }
  function statusSentence(project) {
    const s = project.status || {}, counts = project.counts || {}, chunks = [];
    if (counts.active) chunks.push(`${counts.active} iş için çalışma bildirimi var`);
    else if (counts.queued) chunks.push(`${counts.queued} istek kuyrukta`);
    if (project.blocked) chunks.push('müdahale bekleyen bir engel var');
    if (s.taskTitle) chunks.push('gündem: ' + text(s.taskTitle, 200));
    else if (s.summary) chunks.push('son durum kaydı: ' + text(s.summary, 240));
    else chunks.push('zaman damgalı durum bilgisi alınamadı');
    if (s.stale) chunks.push(s.updatedAt ? 'bu durum kaydı eski, canlı kabul edilmedi' : 'durum kaydının zamanı doğrulanmadı');
    return project.name + ': ' + chunks.join('; ') + '.';
  }
  function dailySentence(project, complete) {
    const events = list(project.events).filter(e => e.today), runs = list(project.runs).filter(r => r.today), done = list(project.jobs).filter(j => j.verifiedCompletedToday), parts = [];
    if (done.length) parts.push(`${done.length} işin tamamlanması işçi makbuzuyla kaydedildi`);
    if (events.length) {
      const last = [...events].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
      const action = last.kind === 'claim' ? 'çalışmayı teslim alma' : last.kind === 'release' ? 'devir' : last.kind === 'note' ? 'not' : 'ilerleme';
      parts.push(`${events.length} olay kaydı var; son ${action} kaydını ${actorName(last.actor)} bıraktı`);
      if (last.title) parts.push('kayıt başlığı: ' + text(last.title, 150));
    }
    if (runs.length) {
      const passed = runs.filter(r => r.status === 'RECORDED_PASS').length;
      parts.push(`${runs.length} test koşusu kaydı var${passed ? `; ${passed} kayıtta gerekli test takımları PASS bildirilmiş` : ''}`);
    }
    if (!parts.length) parts.push(complete ? 'bugün için olay veya tamamlanma kaydı görünmüyor' : 'bugüne ait erişilebilir kayıt yok; geçmiş kapsamı eksik');
    if (project.blocked) parts.push('şu an engel çözümü bekliyor');
    else if ((project.counts || {}).active) parts.push('şu an işçi çalışma bildirimi var');
    return project.name + ': ' + parts.join('. ') + '.';
  }
  function coverageNote(snapshot) {
    const c = snapshot.coverage || {}, e = c.events || {}, r = c.runs || {}, notes = [];
    if (!e.todayComplete || !r.todayComplete) notes.push('Özet, erişebildiğim kayıtlarla sınırlı; günün tamamı doğrulanmış değil.');
    if (e.truncated || r.truncated) notes.push('Kayıt sınırına ulaşıldı; görünen sayı günün toplamı olmayabilir.');
    if (e.state === 'error' || r.state === 'error') notes.push('Geçmiş kaynağının bir bölümü şu anda alınamıyor.');
    if (snapshot.stale) notes.push('Son veri yenilemesi eski veya doğrulanmamış.');
    return notes.join(' ');
  }
  function prioritySentence(snapshot, projectId) {
    const priorities = list(snapshot.priorities).filter(p => !projectId || p.projectId === projectId), first = priorities[0];
    if (!first) return 'Şu an kayıtlarla desteklenen yeni bir öncelik çıkaramıyorum. Önce güncel durum ve kabul kapılarını yenileyelim.';
    return 'Şu an en önemli konu: ' + text(first.title, 200) + '. ' + text(first.body, 500);
  }
  function evidenceFor(snapshot, projects) {
    return { source: 'SCOPED_STUDIO_SNAPSHOT', revision: snapshot.revision || 0, loadedAt: snapshot.loadedAt || null,
      projectIds: projects.map(p => p.id), eventIds: projects.flatMap(p => list(p.events).filter(e => e.today).map(e => e.id)).slice(0, 60),
      runIds: projects.flatMap(p => list(p.runs).filter(r => r.today).map(r => r.id)).slice(0, 40),
      completionIds: projects.flatMap(p => list(p.jobs).filter(j => j.verifiedCompletedToday).map(j => j.id)).slice(0, 40),
      independentQa: false, modelCall: false, extraModelSpend: 0 };
  }
  function respond(input, snapshot, options) {
    const intent = classify(input); if (!intent.handled) return { ...intent, body: '', spokenText: '', evidence: null };
    snapshot = snapshot || {}; options = options || {};
    if (!snapshot.accountKey || snapshot.state === 'unauthenticated') {
      const body = 'Stüdyo verilerine erişmek için hesabınla giriş yapmalısın. Giriş yapılmadan oyunların güncel durumunu biliyormuş gibi yanıt vermem.';
      return { ...intent, body, spokenText: body, evidence: null };
    }
    const allProjects = list(snapshot.projects), projects = intent.projectId ? allProjects.filter(p => p.id === intent.projectId) : allProjects;
    let chunks = [];
    if (snapshot.state === 'demo') chunks.push('Bu ekran örnek veriler kullanıyor; canlı stüdyo özeti değil.');
    if (intent.kind === 'daily' || intent.kind === 'project-daily') {
      const complete = !!((snapshot.coverage || {}).events || {}).todayComplete;
      chunks.push('Efendim, bugün için kayıtlarda görünen tablo şöyle.');
      chunks.push(...projects.map(p => dailySentence(p, complete)));
      chunks.push(prioritySentence(snapshot, intent.projectId));
      chunks.push('Tamamlanma kaydı, ürünün veya telefon testinin kabul edildiği anlamına gelmez.');
    } else if (intent.kind === 'priority') chunks.push(prioritySentence(snapshot, intent.projectId));
    else if (!projects.length) chunks.push('Bu oyun için güncel durum kaydı alınamadı.');
    else {
      chunks.push(...projects.map(statusSentence));
      if (intent.projectId) {
        const release = projects[0].release || {}, gates = release.gates || {};
        if (release.version) chunks.push('Paket kaydındaki sürüm: ' + text(release.version, 160) + '.');
        chunks.push('Cihaz kabul kapısı: ' + text(gates.deviceQa || 'UNKNOWN', 180) + '.');
        if (release.qa && release.qa.recorded) chunks.push('Paket ve test bilgileri kayıtlı kanıttır; bu yanıtta yeni test çalıştırılmadı.');
      }
      chunks.push(prioritySentence(snapshot, intent.projectId));
    }
    const note = coverageNote(snapshot); if (note) chunks.push(note);
    const body = chunks.filter(Boolean).join('\n\n');
    return { ...intent, body, spokenText: body.replace(/\bUNKNOWN\b/g, 'bilinmiyor').replace(/\bNOT_RUN\b/g, 'çalıştırılmadı').replace(/\bPASS\b/g, 'geçti'), evidence: evidenceFor(snapshot, projects) };
  }
  return Object.freeze({ classify, respond, fold });
});
