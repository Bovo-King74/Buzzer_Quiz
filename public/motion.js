/* Shared presentation only. All game decisions and emission timing stay with Socket.IO. */
(() => {
  'use strict';
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.uxMotion === 'reduce' || document.documentElement.dataset.uxFocus === 'true';
  const active = new Map();
  function animate(element, frames, options = {}) {
    if (!element || reduced() || document.hidden || !element.getClientRects().length) return;
    active.get(element)?.cancel();
    const animation = element.animate(frames, {duration:320,easing:'cubic-bezier(.22,1,.36,1)',...options});
    active.set(element, animation);
    const cleanup = () => { if (active.get(element) === animation) active.delete(element); };
    animation.onfinish = cleanup; animation.oncancel = cleanup;
    return animation;
  }
  // Patch retained descendants as well: controls keep focus through score and roster updates.
  function patch(current, next) {
    if (current.nodeType !== next.nodeType || current.nodeName !== next.nodeName) { current.replaceWith(next.cloneNode(true)); return; }
    if (current.nodeType === Node.TEXT_NODE) { if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue; return; }
    if (current.nodeType !== Node.ELEMENT_NODE) return;
    const scoreChanged = current.matches('.sc') && current.textContent !== next.textContent;
    for (const attr of [...current.attributes]) if (!next.hasAttribute(attr.name)) current.removeAttribute(attr.name);
    for (const attr of next.attributes) if (current.getAttribute(attr.name) !== attr.value) current.setAttribute(attr.name, attr.value);
    const previous = [...current.childNodes], incoming = [...next.childNodes];
    incoming.forEach((node,i) => previous[i] ? patch(previous[i],node) : current.append(node.cloneNode(true)));
    previous.slice(incoming.length).forEach(node => node.remove());
    if (scoreChanged) animate(current,[{transform:'translateY(-5px)',opacity:.4},{transform:'translateY(0)',opacity:1}]);
  }
  function reconcile(container, markup) {
    const template = document.createElement('template'); template.innerHTML = markup;
    const old = new Map([...container.children].filter(n => n.dataset.id).map(n => [n.dataset.id,n]));
    const positions = new Map([...old].map(([id,node]) => [id,node.getBoundingClientRect()]));
    for (const node of old.values()) active.get(node)?.cancel();
    const focused = document.activeElement;
    const next = [...template.content.children];
    next.forEach((node,index) => {
      const existing = node.dataset.id && old.get(node.dataset.id);
      if (existing) {
        patch(existing,node); old.delete(node.dataset.id);
        if (container.children[index] !== existing) container.insertBefore(existing,container.children[index] || null);
      } else container.insertBefore(node,container.children[index] || null);
    });
    while (container.children.length > next.length) {
      const removed = container.lastElementChild;
      if (removed.contains(focused)) container.setAttribute('tabindex','-1');
      removed.remove();
    }
    if (focused?.isConnected && document.activeElement !== focused) focused.focus({preventScroll:true});
    else if (focused && !focused.isConnected) container.focus({preventScroll:true});
    [...container.children].forEach(node => {
      if (!node.dataset.id) return;
      const before = positions.get(node.dataset.id), after = node.getBoundingClientRect();
      if (!before) animate(node,[{transform:'translateY(12px)',opacity:0},{transform:'translateY(0)',opacity:1}],{duration:380});
      else if (Math.abs(before.y-after.y)>1) animate(node,[{transform:`translateY(${before.y-after.y}px)`},{transform:'translateY(0)'}]);
    });
  }
  function init() {
    // Native dialog handles focus, Escape and immediate cancellation. Discrete CSS
    // exits keep it visible without delaying close(), camera cleanup or reopening.
    const origins = new WeakMap();
    function opening(dialog) {
      if (!dialog.open) return;
      const trigger = origins.get(dialog) || document.activeElement;
      if (trigger && !dialog.contains(trigger)) {
        const r = trigger.getBoundingClientRect(), d = dialog.getBoundingClientRect();
        dialog.style.setProperty('--panel-origin', `${Math.max(0,Math.min(d.width,r.x+r.width/2-d.x))}px 0px`);
        trigger.setAttribute('aria-expanded','true');
      }
    }
    document.addEventListener('click', event => {
      const trigger = event.target.closest('[aria-haspopup="dialog"]');
      if (trigger) {
        const dialog = document.getElementById(trigger.getAttribute('aria-controls'));
        if (dialog) { origins.set(dialog,trigger); if(dialog.open) opening(dialog); }
      }
    },true);
    const watch = dialog => {
      if (dialog.dataset.motionReady) return; dialog.dataset.motionReady = 'true';
      dialog.addEventListener('beforetoggle',event => { if(event.newState === 'open') origins.set(dialog,document.activeElement); });
      const observer = new MutationObserver(() => opening(dialog)); observer.observe(dialog,{attributes:true,attributeFilter:['open']});
      dialog.addEventListener('close',()=>origins.get(dialog)?.setAttribute('aria-expanded','false'));
    };
    document.querySelectorAll('dialog').forEach(watch);
    new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
      if(node.nodeType!==1) return; if(node.matches('dialog')) watch(node); node.querySelectorAll('dialog').forEach(watch);
    }))).observe(document.body,{childList:true});
    document.addEventListener('buzzer:view', event => {
      const selectors={menu:'.menu-copy',join:'#joinform',player:'#top',host:'#live-toolbar','host-setup':'#setup'};
      animate(document.querySelector(selectors[event.detail]),[{opacity:0,transform:'translateY(14px)'},{opacity:1,transform:'translateY(0)'}],{duration:420});
    });
    const stop = () => { for (const animation of active.values()) animation.cancel(); active.clear(); };
    document.addEventListener('visibilitychange', () => { if(document.hidden) stop(); });
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => { if (reduced()) stop(); });
    new MutationObserver(() => { if (reduced()) stop(); }).observe(document.documentElement,{attributes:true,attributeFilter:['data-ux-motion','data-ux-focus']});
    addEventListener('pagehide', stop);
  }
  window.BuzzerMotion = { reconcile, animate };
  document.addEventListener('DOMContentLoaded',init,{once:true});
})();
