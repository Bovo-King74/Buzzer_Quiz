/* Shared personal preferences, small feedback and one reusable Web Audio graph. */
(() => {
  'use strict';
  const STORAGE = 'buzzer.preferences.v1';
  const defaults = Object.freeze({ theme: 'system', highContrast: false, textSize: 'normal', backgrounds: 'light', reduceTransparency: false, motion: 'system', focusMode: false, visualFeedback: true, sounds: true, buzzVolume: 65, effectsVolume: 45, receiveHostAudio: true });
  const options = { theme: ['system', 'light', 'dark'], textSize: ['normal', 'large'], backgrounds: ['off', 'light', 'full'], motion: ['system', 'reduce'] };
  const icons = new Set(['settings','contrast','text','sun','moon','speaker','muted','play','pause','timer','users','trophy','check','connection','shuffle','duel','spotlight','message','reaction','more','countdown','reset','close','focus','motion','background','volume']);
  const root = document.documentElement;
  const darkQuery = matchMedia('(prefers-color-scheme: dark)');
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const safeRead = () => { try { return JSON.parse(localStorage.getItem(STORAGE) || '{}'); } catch { return {}; } };
  function validate(raw) {
    const next = { ...defaults };
    if (!raw || typeof raw !== 'object') return next;
    for (const key of Object.keys(defaults)) {
      if (options[key]) { if (options[key].includes(raw[key])) next[key] = raw[key]; }
      else if (typeof defaults[key] === 'boolean') { if (typeof raw[key] === 'boolean') next[key] = raw[key]; }
      else if (typeof raw[key] === 'number' && Number.isFinite(raw[key])) next[key] = Math.max(0, Math.min(100, raw[key]));
    }
    return next;
  }
  let prefs = validate(safeRead()), dialog, trigger, ambient, toastRegion, lastFocus;
  let context = null, master, buzzGain, effectsGain, receivedGain, unlocked = false, unavailable = false;
  let live = null, currentMode = 'lobby', pulseTimeout;
  const activeVoices = new Set(), seen = new Set(), buffers = new Map(), files = new Map();
  const icon = name => icons.has(name) ? `<img class="ux-icon" src="/assets/icons8/${name}.png" width="20" height="20" alt="" aria-hidden="true" draggable="false">` : '';
  const now = () => Date.now() + (live ? live.serverNow - live._receivedAt : 0);
  function updateAudioLevels() {
    if (!context || !master) return;
    const t = context.currentTime;
    master.gain.setTargetAtTime(prefs.sounds ? 0.45 : 0, t, 0.015);
    buzzGain.gain.setTargetAtTime(prefs.buzzVolume / 100, t, 0.015);
    effectsGain.gain.setTargetAtTime(prefs.effectsVolume / 100, t, 0.015);
    receivedGain.gain.setTargetAtTime(prefs.receiveHostAudio ? prefs.effectsVolume / 100 : 0, t, 0.015);
  }
  function apply() {
    const d = root.dataset;
    d.uxTheme = prefs.theme === 'system' ? (darkQuery.matches ? 'dark' : 'light') : prefs.theme;
    d.uxContrast = String(prefs.highContrast);
    d.uxText = prefs.textSize;
    d.uxBackgrounds = prefs.backgrounds;
    d.uxTransparency = prefs.reduceTransparency ? 'reduce' : 'normal';
    d.uxMotion = motionQuery.matches || prefs.motion === 'reduce' ? 'reduce' : 'normal';
    d.uxFocus = String(prefs.focusMode);
    root.style.colorScheme = d.uxTheme;
    updateAudioLevels();
    if (dialog) for (const el of dialog.querySelectorAll('[data-pref]')) {
      const value = prefs[el.dataset.pref];
      if (el.type === 'checkbox') el.checked = value;
      else el.value = value;
      const output = dialog.querySelector(`[data-output="${el.dataset.pref}"]`);
      if (output) output.textContent = `${value}%`;
    }
    document.dispatchEvent(new CustomEvent('buzzer:preferences', { detail: { ...prefs } }));
  }
  function save() { try { localStorage.setItem(STORAGE, JSON.stringify(prefs)); } catch { /* Settings still work for this visit in private/restricted storage. */ } }
  function setPreference(key, value) { prefs = validate({ ...prefs, [key]: value }); save(); apply(); }
  for (const query of [darkQuery, motionQuery]) {
    if (query.addEventListener) query.addEventListener('change', apply);
    else if (query.addListener) query.addListener(apply);
  }
  addEventListener('storage', e => { if (e.key === STORAGE) { prefs = validate(safeRead()); apply(); } });
  apply();

  // Fetch media once, ahead of the first buzz. Decode after an explicit gesture unlocks audio.
  fetch('/api/sounds').then(r => r.ok ? r.json() : {}).then(async sources => {
    await Promise.allSettled(['buzzer','giusto','sbagliato'].filter(k => typeof sources[k] === 'string').map(async key => {
      const url = new URL(sources[key], location.origin);
      if (url.origin !== location.origin) return;
      const response = await fetch(url);
      if (response.ok) { files.set(key, await response.arrayBuffer()); if (context) await decodeFile(key); }
    }));
  }).catch(() => {});
  async function decodeFile(key) {
    if (!context || !files.has(key) || buffers.has(key)) return;
    try { buffers.set(key, await context.decodeAudioData(files.get(key).slice(0))); } catch { /* Synthesis remains available. */ }
  }
  function audioStatus() { return unavailable ? 'unavailable' : unlocked && context?.state === 'running' ? 'ready' : 'locked'; }
  function updateAudioStatus() {
    const el = document.getElementById('ux-audio-status');
    if (el) el.textContent = { unavailable: 'Audio non disponibile: il gioco continua con i feedback visivi.', ready: 'Audio pronto su questo dispositivo.', locked: 'Tocca “Prova audio” per attivare l’audio su questo dispositivo.' }[audioStatus()];
  }
  async function unlock() {
    if (unavailable) return false;
    try {
      if (!context) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) throw new Error('Audio unavailable');
        context = new AudioContextClass({ latencyHint: 'interactive' });
        master = context.createGain(); master.connect(context.destination);
        buzzGain = context.createGain(); buzzGain.connect(master);
        effectsGain = context.createGain(); effectsGain.connect(master);
        receivedGain = context.createGain(); receivedGain.connect(master);
        updateAudioLevels();
        for (const key of files.keys()) void decodeFile(key);
        context.addEventListener('statechange', updateAudioStatus);
      }
      if (context.state === 'suspended') await context.resume();
      unlocked = context.state === 'running';
      // A silent source in the gesture also unlocks older mobile WebKit implementations.
      if (unlocked) { const source = context.createBufferSource(); source.buffer = context.createBuffer(1, 1, context.sampleRate); source.connect(master); source.start(); }
      updateAudioStatus();
      return unlocked;
    } catch { unavailable = true; updateAudioStatus(); return false; }
  }
  for (const event of ['pointerdown','keydown']) document.addEventListener(event, e => {
    if (e.isTrusted && (!unlocked || context?.state === 'suspended')) void unlock();
  }, { capture: true, passive: true });

  function voice(name, destination) {
    // Bound overlap, keeping a player's tactile press independent from received effects.
    const channel = destination === buzzGain ? 'buzz' : 'effects';
    const same = [...activeVoices].filter(v => v.channel === channel);
    if (same.length >= (channel === 'buzz' ? 1 : 2)) same[0].stop();
    const nodes = new Set(); let stopped = false;
    const v = { channel, stop() { if (stopped) return; stopped = true; for (const n of nodes) { try { n.stop?.(); } catch {} try { n.disconnect(); } catch {} } activeVoices.delete(v); } };
    activeVoices.add(v);
    const start = context.currentTime + 0.003;
    function tone(frequency, at, duration, type = 'triangle', level = .35, endFrequency = frequency) {
      const osc = context.createOscillator(), gain = context.createGain();
      nodes.add(osc); nodes.add(gain); osc.type = type;
      osc.frequency.setValueAtTime(frequency, start + at);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + at + duration);
      gain.gain.setValueAtTime(0, start + at);
      gain.gain.linearRampToValueAtTime(level, start + at + .008);
      gain.gain.exponentialRampToValueAtTime(.001, start + at + duration);
      osc.connect(gain); gain.connect(destination); osc.start(start + at); osc.stop(start + at + duration + .02);
    }
    function noise(at, duration, level, frequency = 2400) {
      const buffer = context.createBuffer(1, Math.ceil(duration * context.sampleRate), context.sampleRate);
      const data = buffer.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const source = context.createBufferSource(), gain = context.createGain(), filter = context.createBiquadFilter();
      nodes.add(source); nodes.add(gain); nodes.add(filter); source.buffer = buffer;
      filter.type = 'bandpass'; filter.frequency.value = frequency;
      gain.gain.setValueAtTime(level, start + at); gain.gain.exponentialRampToValueAtTime(.001, start + at + duration);
      source.connect(filter); filter.connect(gain); gain.connect(destination); source.start(start + at);
    }
    let duration = .5;
    if (buffers.has(name)) {
      const source = context.createBufferSource(); nodes.add(source); source.buffer = buffers.get(name); source.connect(destination); source.start(start); duration = Math.min(5, source.buffer.duration);
      source.stop(start + duration);
    } else switch (name) {
      case 'press': tone(680, 0, .065, 'sine', .32, 520); duration = .1; break;
      case 'buzzer': tone(220, 0, .2, 'square', .2, 180); tone(330, .07, .18, 'triangle', .28); duration = .3; break;
      case 'giusto': tone(660, 0, .16); tone(990, .13, .25); break;
      case 'sbagliato': tone(240, 0, .32, 'triangle', .35, 120); break;
      case 'applause': for (let i = 0; i < 12; i++) noise(i * .06, .13, .6, 1800 + (i % 3) * 700); duration = .9; break;
      case 'fanfare': [523,659,784,1047].forEach((f,i) => tone(f, i * .13, i === 3 ? .35 : .16, 'triangle', .35)); duration = .85; break;
      case 'drumroll': for (let i = 0; i < 14; i++) { noise(i * .045, .055, .3 + i * .018, 1100); tone(110, i * .045, .06, 'triangle', .12); } duration = .8; break;
      case 'comic': tone(520, 0, .32, 'sine', .45, 85); tone(100, .27, .13, 'triangle', .24, 150); break;
      case 'expired': tone(440, 0, .12, 'sine', .3); tone(330, .17, .2, 'sine', .3); break;
      case 'test': tone(680, 0, .065, 'sine', .32, 520); tone(523, .2, .15); tone(784, .36, .22); duration = .7; break;
      default: activeVoices.delete(v); return false;
    }
    setTimeout(v.stop, (duration + .15) * 1000);
    return true;
  }
  function play(name, { channel = 'effects', received = false } = {}) {
    if (!prefs.sounds || (received && !prefs.receiveHostAudio) || !context || !unlocked || context.state !== 'running' || document.hidden) return false;
    const level = channel === 'buzz' ? prefs.buzzVolume : prefs.effectsVolume;
    if (!level) return false;
    try { return voice(name, channel === 'buzz' ? buzzGain : received ? receivedGain : effectsGain); } catch { return false; }
  }
  const soundNames = { applause: 'Applauso', fanfare: 'Fanfara', drumroll: 'Rullo di tamburi', comic: 'Effetto comico', buzzer: 'Prenotazione ricevuta', giusto: 'Risposta giusta', sbagliato: 'Risposta sbagliata', expired: 'Tempo scaduto' };
  function showEffect(event = {}) {
    if (!toastRegion || document.hidden) return null;
    if (event.id && seen.has(event.id)) return null;
    if (event.expiresAt && event.expiresAt <= now()) return null;
    if (event.roundId && live?.roundId && event.roundId !== live.roundId) return null;
    if (event.id) { seen.add(event.id); if (seen.size > 128) seen.delete(seen.values().next().value); }
    if (event.kind === 'sound') { window.BuzzerUX.play(event.value, { received: true }); if (!prefs.visualFeedback) return null; }
    const el = document.createElement('div'); el.className = 'ux-toast';
    el.dataset.kind = String(event.kind || 'message');
    const picture = document.createElement('span'); picture.className = 'ux-toast-symbol'; picture.setAttribute('aria-hidden', 'true');
    if (event.kind === 'reaction') picture.textContent = String(event.value || '').slice(0, 12);
    else picture.innerHTML = icon(event.kind === 'sound' ? 'speaker' : event.kind === 'presence' ? 'connection' : 'message');
    const text = document.createElement('span');
    text.textContent = event.kind === 'reaction' ? 'Una reazione dalla regia' : event.kind === 'sound' ? soundNames[event.value] || 'Effetto sonoro dalla regia' : String(event.value || 'Un messaggio dalla regia').slice(0, 200);
    if (event.kind === 'reaction') el.setAttribute('aria-label', `${String(event.value || '')} dalla regia`);
    el.append(picture, text);
    while (toastRegion.childElementCount >= 2) toastRegion.firstElementChild.remove();
    toastRegion.append(el);
    setTimeout(() => el.remove(), Math.min(4500, Math.max(1500, event.expiresAt ? event.expiresAt - now() : 3500)));
    return el;
  }
  function pulse() {
    root.dataset.uxPulse = 'true'; clearTimeout(pulseTimeout);
    pulseTimeout = setTimeout(() => { root.dataset.uxPulse = 'false'; }, 650);
  }
  function attachAmbient() {
    if (!ambient) return;
    const selectors = ['#zone','#banner','#tv-banner','#lobby .top','#tv-lobby','#setup','.join','#tv-join'];
    const target = selectors.map(s => document.querySelector(s)).find(el => el && el.getClientRects().length && !el.closest('[hidden]'));
    if (target && ambient.parentElement !== target) { target.classList.add('ux-ambient-host'); target.prepend(ambient); }
  }
  function setState(state, mode) {
    const changedRound = live && state && live.roundId !== state.roundId;
    live = state ? { ...state, _receivedAt: Date.now() } : null;
    currentMode = mode || (live?.paused ? 'paused' : live?.countdown ? 'countdown' : 'lobby');
    root.dataset.uxState = currentMode;
    if (changedRound && toastRegion) toastRegion.replaceChildren();
    attachAmbient();
  }
  function settings() {
    if (!dialog || dialog.open) return;
    lastFocus = document.activeElement;
    dialog.showModal(); updateAudioStatus();
    dialog.querySelector('button').focus();
  }
  function init() {
    ambient = document.createElement('div'); ambient.className = 'ux-ambient'; ambient.setAttribute('aria-hidden', 'true'); attachAmbient();
    toastRegion = document.createElement('div'); toastRegion.className = 'ux-toasts'; toastRegion.setAttribute('role','status'); toastRegion.setAttribute('aria-live','polite'); toastRegion.setAttribute('aria-atomic','false'); document.body.append(toastRegion);
    trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'ux-settings-trigger'; trigger.id = 'ux-settings'; trigger.innerHTML = `${icon('settings')}<span>Impostazioni</span>`; trigger.setAttribute('aria-haspopup','dialog'); trigger.setAttribute('aria-controls','ux-settings-dialog'); trigger.onclick = settings; document.body.append(trigger);
    // A visible link is present on every page using the free Icons8 PNGs.
    const credit = document.createElement('a'); credit.className = 'ux-icon-credit'; credit.href = 'https://icons8.it/icons/'; credit.target = '_blank'; credit.rel = 'noopener noreferrer'; credit.textContent = 'Icone Icons8'; document.body.append(credit);
    dialog = document.createElement('dialog'); dialog.id = 'ux-settings-dialog'; dialog.className = 'ux-settings'; dialog.setAttribute('aria-labelledby','ux-settings-title');
    const select = (key,label,values,ico) => `<label class="ux-setting"> <span>${icon(ico)}${label}</span><select data-pref="${key}">${values.map(([value,title]) => `<option value="${value}">${title}</option>`).join('')}</select></label>`;
    const toggle = (key,label,ico,help='') => `<label class="ux-setting ux-toggle"><span>${icon(ico)}<span>${label}${help ? `<small>${help}</small>` : ''}</span></span><input type="checkbox" data-pref="${key}"></label>`;
    const range = (key,label) => `<label class="ux-volume"><span>${label}<output data-output="${key}"></output></span><input type="range" data-pref="${key}" min="0" max="100" step="5"></label>`;
    dialog.innerHTML = `<header class="ux-settings-heading"><div><h2 id="ux-settings-title">Impostazioni</h2><p>Solo su questo dispositivo.</p></div><button type="button" id="ux-settings-close" aria-label="Chiudi impostazioni">${icon('close')}</button></header>
      <div class="ux-settings-body"><fieldset><legend>Aspetto e visibilità</legend>
      ${select('theme','Tema',[['system','Come il sistema'],['light','Chiaro'],['dark','Scuro']],'sun')}
      ${toggle('highContrast','Contrasto elevato','contrast')}
      ${select('textSize','Dimensione testo',[['normal','Normale'],['large','Grande']],'text')}
      ${select('backgrounds','Sfondi animati',[['off','Spenti'],['light','Leggeri'],['full','Completi']],'background')}
      ${toggle('reduceTransparency','Riduci trasparenze','contrast')}
      </fieldset><fieldset><legend>Accessibilità</legend>
      ${select('motion','Movimento',[['system','Segui il sistema'],['reduce','Riduci sempre']],'motion')}
      <p class="ux-settings-note">La riduzione del movimento del sistema viene sempre rispettata.</p>
      ${toggle('focusMode','Modalità concentrazione','focus','Mantiene stati, conferme e messaggi; nasconde le decorazioni.')}
      ${toggle('visualFeedback','Mostra anche i feedback sonori','check','Gli effetti ricevuti vengono indicati anche con un testo.')}
      </fieldset><fieldset><legend>Audio</legend>
      ${toggle('sounds','Suoni attivi','speaker')}
      ${range('buzzVolume','Volume del tuo buzz')}
      ${range('effectsVolume','Volume reazioni ed effetti')}
      ${toggle('receiveHostAudio','Suoni ricevuti dalla regia','volume')}
      <button type="button" class="ux-test-audio" id="ux-test-audio">${icon('play')} Prova audio</button>
      <p id="ux-audio-status" class="ux-settings-note" role="status"></p>
      </fieldset><p class="ux-settings-credit">Icone PNG iOS di <a href="https://icons8.it/icons/" target="_blank" rel="noopener noreferrer">Icons8</a>, usate con attribuzione. Nessun acquisto richiesto.</p></div>`;
    document.body.append(dialog);
    dialog.querySelector('#ux-settings-close').onclick = () => dialog.close();
    dialog.addEventListener('close', () => { const target = lastFocus?.isConnected ? lastFocus : trigger; target?.focus(); });
    dialog.addEventListener('click', e => { if (e.target === dialog) { const box = dialog.getBoundingClientRect(); if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) dialog.close(); } });
    dialog.addEventListener('input', e => {
      const el = e.target; if (!el.dataset.pref) return;
      setPreference(el.dataset.pref, el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value);
    });
    dialog.querySelector('#ux-test-audio').onclick = async () => {
      const ready = await unlock();
      if (ready && prefs.sounds) { window.BuzzerUX.play('press', { channel:'buzz' }); setTimeout(() => window.BuzzerUX.play('fanfare'), 200); }
      const status = dialog.querySelector('#ux-audio-status');
      if (!prefs.sounds) status.textContent = 'I suoni sono disattivati. Attiva “Suoni attivi” per ascoltare la prova.';
      else if (!prefs.buzzVolume && !prefs.effectsVolume) status.textContent = 'Entrambi i volumi sono a zero. Aumenta uno dei volumi per ascoltare la prova.';
      else updateAudioStatus();
    };
    // Native dialog supplies modal focus containment and Escape; keep a fallback Tab cycle explicit.
    dialog.addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;
      const focusable = [...dialog.querySelectorAll('button,input,select,a[href]')].filter(el => !el.disabled && el.getClientRects().length);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    apply(); updateAudioStatus();
  }
  function visibility() { root.dataset.uxHidden = String(document.hidden); if (document.hidden) { for (const v of activeVoices) v.stop(); toastRegion?.replaceChildren(); } else attachAmbient(); }
  document.addEventListener('visibilitychange', visibility); visibility();
  window.BuzzerUX = { icon, unlock, play, showEffect, pulse, setState, settings, getPreferences: () => ({ ...prefs }), audioStatus };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
