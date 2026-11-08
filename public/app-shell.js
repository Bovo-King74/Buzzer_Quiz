/* Navigation belongs here; personal preferences and room authority stay separate. */
(() => {
  'use strict';
  let playerSocket, creating = false;
  const $ = id => document.getElementById(id);
  const read = key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
  function view(name) {
    document.body.dataset.view = name;
    if ($('start-menu')) $('start-menu').hidden = name !== 'menu';
    if ($('join')) $('join').hidden = name !== 'join';
    if ($('game')) $('game').hidden = name !== 'player';
    document.querySelector('.shell-home')?.setAttribute('aria-label', name === 'menu' ? 'Buzzer, menu iniziale' : 'Torna al menu iniziale');
    window.BuzzerVisuals?.refresh();
    document.dispatchEvent(new CustomEvent('buzzer:view', { detail: name }));
  }
  function playerRoute() {
    if (!$('start-menu')) return;
    const invitation = new URLSearchParams(location.search).get('c');
    if (location.hash === '#game' && read('qz')) view('player');
    else if (location.hash === '#join' || invitation && !location.hash) view('join');
    else view('menu');
  }
  function creationToken() {
    try {
      const saved = JSON.parse(sessionStorage.getItem('buzzer.pendingCreation') || 'null');
      if (saved && Date.now() - saved.at < 600000) return saved.id;
    } catch {}
    const bytes = new Uint8Array(16); crypto.getRandomValues(bytes);
    const id = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    try { sessionStorage.setItem('buzzer.pendingCreation', JSON.stringify({ id, at: Date.now() })); } catch {}
    return id;
  }
  function createRoom(socket, button, status, onCreated) {
    if (creating) return;
    if (!socket?.connected) { status.textContent = 'Connessione in corso. Attendi qualche istante e riprova.'; return; }
    creating = true; button.disabled = true; button.setAttribute('aria-busy', 'true');
    status.textContent = 'Creo la tua stanza…';
    socket.timeout(8000).emit('host:create', { origin: location.origin, requestId: creationToken() }, (error, result) => {
      creating = false; button.disabled = false; button.removeAttribute('aria-busy');
      if (error || result?.err) { status.textContent = result?.err || 'La conferma tarda ad arrivare. Riprova: recupererò la stessa stanza.'; return; }
      try { localStorage.setItem('hostGame', JSON.stringify({ code: result.code, key: result.key })); } catch {}
      try { sessionStorage.removeItem('buzzer.pendingCreation'); } catch {}
      status.textContent = `Stanza ${result.code} pronta.`;
      onCreated(result);
    });
  }
  function hostRoute() {
    if (!$('setup')) return;
    const resume = location.hash === '#resume';
    $('mkf').hidden = resume;
    const heading = document.querySelector('#setup>h1');
    if (heading) heading.textContent = resume ? 'Riprendi la regia.' : 'Si va in scena.';
  }
  function mount() {
    const header = document.createElement('header'); header.className = 'buzzer-shell';
    const left = document.createElement('div'); left.className = 'shell-left';
    const settings = $('ux-settings');
    if (settings) { settings.classList.add('buzzer-glass'); settings.dataset.glass = 'settings'; left.append(settings); }
    const home = document.createElement('a'); home.className = 'shell-home'; home.href = '/player.html#menu'; home.textContent = 'Buzzer';
    const profile = document.createElement('div'); profile.dataset.profileSlot = '';
    header.append(left, home, profile); document.body.prepend(header);
    window.BuzzerProfile?.mount(profile);
    document.dispatchEvent(new Event('buzzer:shell-ready'));
    document.querySelectorAll('.hostbtn').forEach(element => element.remove());
    if ($('menu-create')) $('menu-create').onclick = () => createRoom(playerSocket, $('menu-create'), $('menu-status'), () => location.assign('/host.html?created=1'));
    const invitation = new URLSearchParams(location.search).get('c');
    if (invitation) $('c') && ($('c').value = invitation.toUpperCase());
    if ($('start-menu')) playerRoute();
    else if ($('setup')) { view($('app').hidden ? 'host-setup' : 'host'); hostRoute(); }
  }
  window.addEventListener('hashchange', () => { playerRoute(); hostRoute(); });
  window.addEventListener('popstate', () => { playerRoute(); hostRoute(); });
  window.BuzzerShell = {
    attachPlayer(socket) { playerSocket = socket; },
    playerJoined() {
      if (document.body.dataset.view !== 'player') {
        const method = location.hash === '#join' ? 'pushState' : 'replaceState';
        history[method]({ view: 'player' }, '', `${location.pathname}${location.search}#game`);
      }
      view('player');
    },
    playerOut() { history.replaceState({ view: 'join' }, '', `${location.pathname}${location.search}#join`); view('join'); },
    hostEntered() { view('host'); },
    hostSetup() { view('host-setup'); hostRoute(); },
    createRoom
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
})();
