/* v23 UI lifecycle only. No model calls and no legacy command fallback. */
(() => {
  'use strict';
  let ui = null, bridge = null, mountedKey = null, disposed = false;
  const root = document.getElementById('jarvisWorld');
  const legacy = document.getElementById('jarvisLegacySurface');
  const notice = document.getElementById('jarvisV23BootMessage');
  if (!root) return;
  const host = () => window.OryvonaStudioHost;
  function hostContext() { return host()?.context?.() || {}; }
  function active() { return hostContext().view === 'jarvis'; }
  function accountKey() { const c = hostContext(); return [c.userId || '', !!c.authenticated, !!c.isOwner, !!c.demo].join('|'); }
  function bottomInset() {
    const nav = document.querySelector('.tabs');
    if (!nav || nav.hidden || !nav.getClientRects().length) return 0;
    const vv = window.visualViewport;
    const lower = vv ? vv.offsetTop + vv.height : window.innerHeight;
    const rect = nav.getBoundingClientRect();
    return Math.max(0, Math.min(rect.height, lower - rect.top));
  }
  function disposeMount() {
    if (ui) ui.destroy();
    if (bridge) bridge.dispose();
    ui = bridge = null; mountedKey = null;
    root.replaceChildren();
  }
  function sync() {
    if (disposed) return;
    const on = active();
    document.body.classList.toggle('oryvona-jarvis-world', on);
    if (!host() || !window.OryvonaJarvisBridge || !window.OryvonaJarvisWorld) {
      if (notice) { notice.hidden = !on; notice.textContent = 'Jarvis bileşenleri yüklenemedi. Sayfayı yenile; hiçbir emir eski kuyruğa gönderilmedi.'; }
      return;
    }
    try {
      const key = accountKey();
      if (mountedKey !== key || !ui) {
        disposeMount();
        bridge = window.OryvonaJarvisBridge.create(host());
        ui = window.OryvonaJarvisWorld.mount(root, { bridge, mode: 'live', showActivity: true, bottomInset });
        mountedKey = key;
      }
      window.__oryvonaJarvisV23Mounted = true;
      if (legacy) legacy.hidden = true;
      if (notice) notice.hidden = true;
      ui.setActive(on);
      // New bridge owns only its typed inbox; this never calls legacy dispatchJarvisCommand.
      if (on) bridge.refresh().catch(() => {});
    } catch (_error) {
      disposeMount();
      if (notice) { notice.hidden = !on; notice.textContent = 'Jarvis güvenli başlatılamadı. Metin gönderilmedi; sayfayı yenileyebilirsin.'; }
    }
  }
  document.addEventListener('oryvona:view-change', sync);
  document.addEventListener('oryvona:studio-context-change', sync);
  document.addEventListener('oryvona:ready', sync);
  function onRefreshClick(event) {
    if (active() && event.target.closest?.('#refreshBtn') && bridge) {
      event.preventDefault(); event.stopImmediatePropagation(); bridge.refresh().catch(() => {});
    }
  }
  document.addEventListener('click', onRefreshClick, true);
  // pagehide can enter the browser's back/forward cache. Keep the document mount;
  // UI handles speech/draft lifecycle, while visibility suspends effect drawing.
  window.addEventListener('pageshow', sync);
  window.OryvonaJarvisV23Lifecycle = Object.freeze({ refresh: sync, destroy() {
    disposed = true; disposeMount(); document.body.classList.remove('oryvona-jarvis-world');
    document.removeEventListener('oryvona:view-change', sync);
    document.removeEventListener('oryvona:studio-context-change', sync);
    document.removeEventListener('oryvona:ready', sync);
    document.removeEventListener('click', onRefreshClick, true);
    window.removeEventListener('pageshow', sync);
  } });
  sync();
})();
