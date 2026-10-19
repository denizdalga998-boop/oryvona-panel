/* ARGON voice audition V1. A fixed sound sample, never a chat reply or command. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.OryvonaVoiceAudition = api;
    function boot() {
      if (!root.__oryvonaVoiceAudition) root.__oryvonaVoiceAudition = api.create({ window: root, document: root.document });
    }
    if (root.document && root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', boot, { once: true });
    else if (root.document) boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var VERSION = 'm2-v1';
  var SAMPLE_TEXT = 'Merhaba Deniz. Ben Argon. Bu bir erkek ses denemesidir. Bu sesi duyuyorsan uygulamanın web güncellemesi telefonuna ulaşmış demektir.';
  var SAMPLE_PATH = './voice/argon-m2-v1.wav?v=1';
  function create(options) {
    options = options || {};
    var win = options.window, doc = options.document || win && win.document;
    if (!win || !doc) throw new TypeError('A window and document are required');
    var target = null, card = null, button = null, status = null, audio = null;
    var epoch = 0, destroyed = false, observer = null, observing = false, scanTimer = null, startupTimer = null;
    var removers = [];
    function on(node, name, fn, capture) {
      node.addEventListener(name, fn, capture);
      removers.push(function () { node.removeEventListener(name, fn, capture); });
    }
    function visible(node) {
      if (!node || doc.hidden === true || node.isConnected === false) return false;
      for (var current = node; current && current !== doc; current = current.parentElement) {
        if (current.hidden || current.getAttribute && current.getAttribute('aria-hidden') === 'true') return false;
        if (typeof win.getComputedStyle === 'function') {
          var computed = win.getComputedStyle(current);
          if (computed && (computed.display === 'none' || computed.visibility === 'hidden')) return false;
        }
      }
      return true;
    }
    function dispatch(active) {
      var event, detail = { active: active, version: VERSION, cancelled: false };
      try { event = new win.CustomEvent('oryvona:voice-audition', { detail: detail }); }
      catch (_) { event = doc.createEvent('CustomEvent'); event.initCustomEvent('oryvona:voice-audition', false, false, detail); }
      doc.dispatchEvent(event);
      return detail.cancelled === true;
    }
    function setStatus(message) { if (status) status.textContent = message; }
    function stop(message) {
      epoch += 1;
      if (startupTimer !== null) { win.clearTimeout(startupTimer); startupTimer = null; }
      var current = audio; audio = null;
      if (current) {
        current.onplaying = current.onended = current.onerror = null;
        try { current.pause(); } catch (_) {}
        try { current.currentTime = 0; } catch (_) {}
        try { current.removeAttribute('src'); current.load(); } catch (_) {}
        dispatch(false);
      }
      if (button) { button.textContent = 'Dinle'; button.setAttribute('aria-pressed', 'false'); }
      if (message) setStatus(message);
    }
    function play() {
      if (destroyed || !visible(target)) return;
      if (audio) { stop('Deneme durduruldu. Sohbet sesi henüz değiştirilmedi.'); return; }
      if (typeof win.Audio !== 'function') { setStatus('Bu cihaz ses örneğini oynatamıyor.'); return; }
      var url;
      try {
        url = new win.URL(SAMPLE_PATH, doc.baseURI || win.location.href);
        if (url.origin !== win.location.origin) throw new Error('Voice sample must be same-origin');
      } catch (_) { setStatus('Ses örneğinin adresi doğrulanamadı.'); return; }
      /* This synchronously cancels the old voice AND continuous recognition before any sound starts. */
      if (!dispatch(true)) { setStatus('Ses güncellemesi eksik yüklendi. Uygulamayı tamamen kapatıp yeniden aç.'); return; }
      var current, ticket = ++epoch;
      try { current = new win.Audio(url.href); }
      catch (_) { dispatch(false); setStatus('Ses örneği başlatılamadı.'); return; }
      audio = current;
      current.preload = 'none';
      current.setAttribute('playsinline', '');
      button.textContent = 'Durdur'; button.setAttribute('aria-pressed', 'true');
      setStatus('Ses örneği yükleniyor…');
      function valid() { return !destroyed && ticket === epoch && audio === current && visible(target); }
      current.onplaying = function () {
        if (!valid()) return;
        if (startupTimer !== null) { win.clearTimeout(startupTimer); startupTimer = null; }
        setStatus('Güncelleme V1 geldi. Erkek ses örneği çalıyor.');
      };
      current.onended = function () { if (valid()) stop('Deneme bitti. Sohbet sesi henüz değiştirilmedi.'); };
      current.onerror = function () { if (valid()) stop('Ses örneği yüklenemedi. İnternet bağlantısını kontrol edip yeniden dene.'); };
      /* A startup deadline only; playback length is always controlled by the real media ended event. */
      startupTimer = win.setTimeout(function () { if (valid()) stop('Ses örneği başlayamadı. Yeniden Dinle düğmesine dokun.'); }, 15000);
      try {
        var result = current.play();
        if (result && typeof result.catch === 'function') result.catch(function () {
          if (valid()) stop('Ses oynatma izni verilmedi. Yeniden Dinle düğmesine dokun.');
        });
      } catch (_) { if (valid()) stop('Ses örneği başlatılamadı. Yeniden dene.'); }
    }
    function node(tag, text) { var item = doc.createElement(tag); if (text !== undefined) item.textContent = text; return item; }
    function unmount() {
      stop();
      if (button) button.removeEventListener('click', play);
      if (card && card.parentNode) card.parentNode.removeChild(card);
      target = card = button = status = null;
    }
    function mount(root, header) {
      target = root;
      card = node('section'); card.setAttribute('data-argon-voice-audition', VERSION); card.setAttribute('aria-label', 'Erkek ses denemesi V1');
      Object.assign(card.style, { gridColumn: '1 / -1', flexBasis: '100%', minWidth: '0', marginTop: '6px', padding: '10px', border: '1px solid #2b6682', borderRadius: '12px', background: '#0b2034', color: '#dceefa', fontSize: '11px', lineHeight: '1.45', overflowWrap: 'anywhere' });
      var row = node('div'), title = node('strong', 'Erkek ses denemesi · V1');
      Object.assign(row.style, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', minWidth: '0' });
      button = node('button', 'Dinle'); button.type = 'button'; button.setAttribute('aria-pressed', 'false');
      Object.assign(button.style, { minHeight: '44px', flexShrink: '0', padding: '0 16px', border: '1px solid #51c8ed', borderRadius: '22px', background: '#10364b', color: '#dffaff', fontSize: '12px', cursor: 'pointer' });
      button.addEventListener('click', play); row.appendChild(title); row.appendChild(button);
      var copy = node('p', '“' + SAMPLE_TEXT + '”'); Object.assign(copy.style, { margin: '6px 0', color: '#b9d1df' });
      var note = node('p', 'Bu yalnız ses örneği; sohbet sesi ayrıca bağlanacak.'); Object.assign(note.style, { margin: '4px 0', color: '#8db5cc' });
      status = node('p', 'V1 görünüyorsa yeni web kodu telefonuna ulaştı.'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); Object.assign(status.style, { margin: '4px 0 0', color: '#72dfef' });
      card.appendChild(row); card.appendChild(copy); card.appendChild(note); card.appendChild(status); header.appendChild(card);
    }
    function scan() {
      scanTimer = null;
      if (destroyed || doc.hidden === true) { unmount(); return; }
      var roots = doc.querySelectorAll('[data-jarvis-world]'), root = null, header = null;
      for (var i = 0; i < roots.length; i++) {
        var h = roots[i].querySelector('.jw-header');
        if (h && visible(roots[i]) && visible(h)) { root = roots[i]; header = h; break; }
      }
      if (target === root && card && card.parentNode === header) return;
      unmount();
      if (root) mount(root, header);
    }
    function scheduleScan() {
      if (destroyed || doc.hidden === true || scanTimer !== null) return;
      scanTimer = win.setTimeout(scan, 0);
    }
    function contains(parent, child) {
      for (var current = child; current; current = current.parentElement) if (current === parent) return true;
      return false;
    }
    function lifecycleNode(item) {
      if (!item || typeof item.getAttribute !== 'function') return false;
      if (item.getAttribute('data-jarvis-world') !== null || /(?:^|\s)jw-header(?:\s|$)/.test(item.getAttribute('class') || '')) return true;
      return typeof item.querySelector === 'function' && !!(item.querySelector('[data-jarvis-world]') || item.querySelector('.jw-header'));
    }
    function changed(records) {
      for (var i = 0; records && i < records.length; i++) {
        var record = records[i], item = record.target;
        /* Orb/canvas animations, chat text and our own status must not cause document scans. */
        if (card && contains(card, item)) continue;
        if (record.type === 'attributes') {
          if (target && (contains(item, target) || card && item === card.parentNode)) { scheduleScan(); return; }
          if (!target && lifecycleNode(item)) { scheduleScan(); return; }
        } else if (record.type === 'childList') {
          var nodes = Array.prototype.slice.call(record.addedNodes || []).concat(Array.prototype.slice.call(record.removedNodes || []));
          for (var j = 0; j < nodes.length; j++) {
            if (lifecycleNode(nodes[j]) || target && contains(nodes[j], target) || card && (nodes[j] === card || contains(nodes[j], card.parentNode))) { scheduleScan(); return; }
          }
        }
      }
    }
    function observe() {
      if (destroyed || doc.hidden === true || observing || typeof win.MutationObserver !== 'function') return;
      if (!observer) observer = new win.MutationObserver(changed);
      observer.observe(doc.documentElement || doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'class', 'style'] });
      observing = true;
    }
    function suspend() {
      if (observer) observer.disconnect(); observing = false;
      if (scanTimer !== null) { win.clearTimeout(scanTimer); scanTimer = null; }
      unmount();
    }
    function resume() { if (!destroyed && doc.hidden !== true) { observe(); scan(); } }
    on(doc, 'visibilitychange', function () { if (doc.hidden === true) suspend(); else resume(); });
    on(win, 'pagehide', suspend); on(win, 'pageshow', resume); on(win, 'focus', resume);
    on(doc, 'oryvona:studio-context-change', scheduleScan); on(doc, 'click', scheduleScan, true);
    resume();
    return Object.freeze({
      version: VERSION,
      refresh: scan,
      stop: function () { stop('Deneme durduruldu. Sohbet sesi henüz değiştirilmedi.'); },
      destroy: function () { if (destroyed) return; destroyed = true; suspend(); removers.forEach(function (remove) { remove(); }); removers.length = 0; }
    });
  }
  return Object.freeze({ create: create, VERSION: VERSION, SAMPLE_TEXT: SAMPLE_TEXT, SAMPLE_PATH: SAMPLE_PATH });
});
