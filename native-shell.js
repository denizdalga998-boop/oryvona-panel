(() => {
  'use strict';
  const editable = node => node instanceof Element && !!node.closest('input,textarea,select,[contenteditable="true"],[data-native-context],.jw-root');
  document.addEventListener('contextmenu', event => { if (!editable(event.target)) event.preventDefault(); });
  document.addEventListener('selectstart', event => { if (!editable(event.target) && !event.target.closest?.('[data-selectable]')) event.preventDefault(); });
  let pressed = null;
  const releasePress = () => { pressed?.classList.remove('is-pressed'); pressed = null; };
  document.addEventListener('pointerdown', event => {
    releasePress();
    const target = event.target.closest?.('button,a,[role="button"]');
    if (!target || target.disabled || target.getAttribute('aria-disabled') === 'true') return;
    pressed = target; target.classList.add('is-pressed');
  }, { passive:true });
  for (const type of ['pointerup','pointercancel','dragstart']) document.addEventListener(type, releasePress, {passive:true});
  document.addEventListener('scroll', releasePress, {passive:true,capture:true});
  window.addEventListener('blur', releasePress);

  const updateViewport = () => {
    const viewport = window.visualViewport;
    document.documentElement.style.setProperty('--native-vh', (viewport?.height || innerHeight) + 'px');
    document.documentElement.style.setProperty('--native-vv-top', (viewport?.offsetTop || 0) + 'px');
  };
  updateViewport();
  window.addEventListener('resize', updateViewport, {passive:true});
  window.visualViewport?.addEventListener('resize', updateViewport, {passive:true});
  window.visualViewport?.addEventListener('scroll', updateViewport, {passive:true});

  let active = null, closing = false, afterClose = [], lock = null;
  const configs = new Map();
  const focusable = root => [...root.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')]
    .filter(el => !el.hidden && !el.closest('[hidden],[inert]') && el.getClientRects().length);
  function lockBackground(overlay) {
    const body = document.body;
    lock = { y:scrollY, styles:new Map(), elements:[] };
    for (const key of ['position','top','left','right','width','overflow']) lock.styles.set(key,[body.style.getPropertyValue(key),body.style.getPropertyPriority(key)]);
    for (const el of body.children) {
      if (el === overlay || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
      lock.elements.push({el,inert:el.inert,aria:el.getAttribute('aria-hidden')});
      el.inert = true; el.setAttribute('aria-hidden','true');
    }
    Object.assign(body.style,{position:'fixed',top:-lock.y+'px',left:'0',right:'0',width:'100%',overflow:'hidden'});
  }
  function unlockBackground() {
    if (!lock) return;
    const saved = lock; lock = null;
    for (const {el,inert,aria} of saved.elements) { el.inert = inert; if (aria === null) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden',aria); }
    for (const [key,[value,priority]] of saved.styles) { if (value) document.body.style.setProperty(key,value,priority); else document.body.style.removeProperty(key); }
    window.scrollTo({top:saved.y,behavior:'instant'});
  }
  function dismiss() {
    if (!active) return;
    const previous = active; active = null;
    previous.element.hidden = true; unlockBackground();
    previous.options.onClose?.();
    if (previous.returnFocus?.isConnected) previous.returnFocus.focus({preventScroll:true});
  }
  function show(id, options) {
    const element = document.getElementById(id);
    if (!element) return false;
    dismiss();
    active = {id,element,options,returnFocus:document.activeElement};
    element.hidden = false;
    options.onOpen?.();
    // Move focus before hiding its former ancestor from assistive technology.
    const initial = options.initialFocus ? element.querySelector(options.initialFocus) : null;
    (initial || focusable(element)[0] || element).focus({preventScroll:true});
    lockBackground(element);
    return true;
  }
  function flushAfterClose() {
    const callbacks = afterClose; afterClose = [];
    for (const callback of callbacks) callback();
  }
  const shell = {
    open(id, options={}) {
      if (active?.id === id) return;
      if (closing) { afterClose.push(()=>shell.open(id,options)); return; }
      configs.set(id,options);
      if (show(id,options)) history.pushState({...history.state,oryvonaOverlay:id},'');
    },
    close(id) {
      if (!active || active.id !== id) return;
      const ownsHistory = history.state?.oryvonaOverlay === id;
      dismiss();
      if (ownsHistory) { closing = true; history.back(); } else flushAfterClose();
    },
    isClosing:()=>closing,
    afterClose(callback) { if (closing) afterClose.push(callback); else callback(); },
    handlePopState(event) {
      if (closing) { closing = false; flushAfterClose(); return true; }
      const wanted = event.state?.oryvonaOverlay;
      if (active && wanted !== active.id) { dismiss(); return true; }
      if (wanted && configs.has(wanted)) { show(wanted,configs.get(wanted)); return true; }
      return false;
    },
    get activeOverlay(){return active?.id || null;}
  };
  window.OryvonaNativeShell = Object.freeze(shell);
  document.addEventListener('keydown', event => {
    if (!active || event.key !== 'Tab') return;
    const items = focusable(active.element), first=items[0],last=items[items.length-1];
    if (!first) { event.preventDefault();active.element.focus();return; }
    if (event.shiftKey && (document.activeElement === first || !active.element.contains(document.activeElement))) { event.preventDefault();last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !active.element.contains(document.activeElement))) { event.preventDefault();first.focus(); }
  });
  document.addEventListener('focusin', event => {
    if (active && !active.element.contains(event.target)) (focusable(active.element)[0] || active.element).focus({preventScroll:true});
  });
})();
