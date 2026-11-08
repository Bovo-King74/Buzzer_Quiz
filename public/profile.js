/* A personal profile belongs to this browser, independently of any quiz team. */
(() => {
  'use strict';
  if (window.BuzzerProfile) return;
  const KEY = 'buzzer.profile.v1', MAX_NAME = 32, MAX_FILE = 8 * 1024 * 1024, MAX_AVATAR = 100 * 1024, SIZE = 240;
  const DEFAULT_NAME = 'Il tuo profilo';
  const cleanName = value => typeof value === 'string' ? Array.from(value.normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202f\u2060-\u206f\ufeff]/g, '').replace(/\s+/g, ' ').trim()).slice(0, MAX_NAME).join('') : '';
  function safeAvatar(value) {
    if (typeof value !== 'string' || value.length > Math.ceil(MAX_AVATAR * 4 / 3) + 32 || !/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(value)) return '';
    return value;
  }
  function read() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY) || '{}');
      if (data && data.version === 1) return { name: cleanName(data.name) || DEFAULT_NAME, avatar: safeAvatar(data.avatar) };
    } catch { /* A corrupt or unavailable storage must never stop a game. */ }
    return { name: DEFAULT_NAME, avatar: '' };
  }
  let profile = read(), draft, dialog, lastFocus, statusTimer;
  let imageSource = null, releaseSource = null, crop = { zoom: 1, x: 50, y: 50 };
  let cameraStream = null, cameraShot = null, cameraCrop, cameraState = 'off', cameraEpoch = 0, fileEpoch = 0;
  const $ = id => document.getElementById(id);
  const clone = value => ({ name: value.name, avatar: value.avatar });
  const initials = name => name === DEFAULT_NAME ? 'TU' : name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => Array.from(word)[0] || '').join('').toLocaleUpperCase() || 'TU';
  const icon = name => window.BuzzerUX?.icon(name) || '';
  const note = (message = '', error = false) => { if (!$('profile-notice')) return; $('profile-notice').textContent = message; $('profile-notice').dataset.error = String(error); };
  function updateHeaders() {
    for (const button of document.querySelectorAll('[data-personal-profile]')) {
      const avatar = button.querySelector('.buzzer-profile-avatar'), name = button.querySelector('.buzzer-profile-name');
      if (!avatar || !name) continue;
      avatar.replaceChildren();
      if (profile.avatar) { const image = document.createElement('img'); image.src = profile.avatar; image.alt = ''; image.width = 36; image.height = 36; image.draggable = false; image.onerror = () => { avatar.textContent = initials(profile.name); }; avatar.append(image); }
      else avatar.textContent = initials(profile.name);
      name.textContent = profile.name;
      button.setAttribute('aria-label', `Apri il profilo personale: ${profile.name}`);
      button.title = `Profilo personale · ${profile.name}`;
    }
  }
  function mount(slot) {
    if (typeof slot === 'string') slot = document.querySelector(slot);
    if (!slot?.append) return null;
    let button = slot.querySelector('[data-personal-profile]');
    if (!button) {
      button = document.createElement('button'); button.type = 'button'; button.className = 'buzzer-profile-trigger'; button.dataset.personalProfile = '';
      button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-controls', 'buzzer-profile-dialog');
      const avatar = document.createElement('span'); avatar.className = 'buzzer-profile-avatar'; avatar.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span'); name.className = 'buzzer-profile-name';
      button.append(avatar, name); button.addEventListener('click', open); slot.append(button);
    }
    updateHeaders(); return button;
  }
  function mountAll() { document.querySelectorAll('[data-profile-slot]').forEach(mount); }
  function discardImage() { releaseSource?.(); imageSource = null; releaseSource = null; crop = { zoom: 1, x: 50, y: 50 }; }
  function setImage(source, release) { discardImage(); imageSource = source; releaseSource = release || null; }
  function jpeg(canvas) {
    for (const quality of [.88, .78, .66, .52, .4]) {
      const data = canvas.toDataURL('image/jpeg', quality);
      if ((data.length - data.indexOf(',') - 1) * .75 <= MAX_AVATAR) return data;
    }
    throw new Error('Questa foto non può essere salvata. Prova un’altra immagine.');
  }
  function drawCrop(canvas, source, values) {
    canvas.width = SIZE; canvas.height = SIZE;
    const width = source.naturalWidth || source.videoWidth || source.width, height = source.naturalHeight || source.videoHeight || source.height;
    if (!width || !height) throw new Error('Immagine non disponibile.');
    const side = Math.min(width, height) / values.zoom;
    const x = (width - side) * values.x / 100, y = (height - side) * values.y / 100;
    const context = canvas.getContext('2d'); if (!context) throw new Error('Anteprima non disponibile in questo browser.');
    context.fillStyle = '#e8ede6'; context.fillRect(0, 0, SIZE, SIZE);
    context.drawImage(source, x, y, side, side, 0, 0, SIZE, SIZE);
  }
  function renderPreview() {
    if (!draft || !$('profile-avatar-canvas')) return;
    const source = cameraShot || imageSource, values = cameraShot ? cameraCrop : crop;
    const canvas = $('profile-avatar-canvas'), image = $('profile-avatar-image'), fallback = $('profile-avatar-initials');
    canvas.hidden = !source; image.hidden = !!source || !draft.avatar; fallback.hidden = !!source || !!draft.avatar;
    fallback.textContent = initials(cleanName($('profile-name').value) || DEFAULT_NAME);
    if (source) {
      try { drawCrop(canvas, source, values); if (!cameraShot) draft.avatar = jpeg(canvas); }
      catch (error) { note(error.message, true); return; }
    } else if (draft.avatar) image.src = draft.avatar;
    const controls = $('profile-crop'); controls.hidden = !source;
    for (const key of ['zoom','x','y']) {
      const input = $(`profile-crop-${key}`); input.value = values[key];
      const output = $(`profile-crop-${key}-value`); output.textContent = key === 'zoom' ? `${Number(values[key]).toFixed(1)}×` : `${Math.round(values[key])}%`;
    }
    $('profile-remove-photo').disabled = (!source && !draft.avatar) || cameraState !== 'off';
  }
  function updateCameraUI() {
    if (!dialog) return;
    const requesting = cameraState === 'requesting', live = cameraState === 'live', captured = cameraState === 'captured';
    $('profile-camera-panel').hidden = cameraState === 'off';
    $('profile-camera-video').hidden = !live;
    $('profile-camera-still').hidden = !captured;
    $('profile-camera-capture').hidden = !live;
    $('profile-camera-retake').hidden = !captured;
    $('profile-camera-confirm').hidden = !captured;
    $('profile-camera-start').disabled = requesting;
    $('profile-camera-cancel').textContent = requesting ? 'Annulla richiesta' : 'Annulla selfie';
    $('profile-camera-status').textContent = requesting ? 'Attendo il permesso per la fotocamera…' : live ? 'Inquadra il viso e scatta. La foto resta su questo dispositivo.' : captured ? 'Controlla il ritaglio circolare, poi conferma il selfie.' : '';
    $('profile-save').disabled = cameraState !== 'off';
  }
  function stopTracks() {
    cameraEpoch++;
    if (cameraStream) for (const track of cameraStream.getTracks()) { track.onended = null; track.stop(); }
    cameraStream = null;
    const video = $('profile-camera-video'); if (video) { video.pause(); video.srcObject = null; }
  }
  function cancelCamera({ keepShot = false } = {}) {
    stopTracks();
    if (!keepShot || !cameraShot) { cameraShot = null; cameraState = 'off'; } else cameraState = 'captured';
    updateCameraUI(); renderPreview();
  }
  async function startCamera() {
    note();
    cancelCamera();
    if (!navigator.mediaDevices?.getUserMedia) { note('Fotocamera non disponibile qui. Puoi scegliere una foto dalla galleria.', true); return; }
    if (!window.isSecureContext) { note('La fotocamera richiede HTTPS o localhost. Puoi usare la galleria.', true); return; }
    const epoch = ++cameraEpoch;
    cameraState = 'requesting'; updateCameraUI();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'user' }, width: { ideal: 720 }, height: { ideal: 720 } }, audio: false });
      if (epoch !== cameraEpoch || !dialog.open || document.hidden) { for (const track of stream.getTracks()) track.stop(); return; }
      cameraStream = stream;
      const video = $('profile-camera-video'); video.srcObject = stream;
      cameraState = 'live'; updateCameraUI();
      await video.play();
      if (epoch !== cameraEpoch) return;
      for (const track of stream.getVideoTracks()) track.onended = () => { if (cameraState !== 'off') { cancelCamera({ keepShot: true }); note('La fotocamera si è fermata. Puoi riaprirla oppure scegliere una foto.'); } };
      $('profile-camera-capture').focus();
    } catch (error) {
      if (epoch !== cameraEpoch || !dialog.open) return;
      cancelCamera();
      const messages = { NotAllowedError: 'Permesso fotocamera negato. Puoi riabilitarlo nel browser oppure usare la galleria.', NotFoundError: 'Nessuna fotocamera trovata. Puoi scegliere una foto dalla galleria.', NotReadableError: 'La fotocamera è occupata. Chiudi l’app che la usa oppure scegli una foto.' };
      note(messages[error.name] || 'Non riesco ad aprire la fotocamera. La galleria resta disponibile.', true);
      $('profile-gallery-button').focus();
    }
  }
  function capture() {
    const video = $('profile-camera-video');
    if (cameraState !== 'live' || !video.videoWidth || !video.videoHeight) { note('Attendi un istante: la fotocamera si sta preparando.'); return; }
    try {
      const snapshot = document.createElement('canvas'), scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
      snapshot.width = Math.max(1, Math.round(video.videoWidth * scale)); snapshot.height = Math.max(1, Math.round(video.videoHeight * scale));
      const context = snapshot.getContext('2d'); if (!context) throw new Error();
      // Save the same front-camera mirror the person sees in the live preview.
      context.translate(snapshot.width, 0); context.scale(-1, 1); context.drawImage(video, 0, 0, snapshot.width, snapshot.height);
      cameraShot = snapshot; cameraCrop = { zoom: 1, x: 50, y: 50 };
      const still = $('profile-camera-still'); still.width = snapshot.width; still.height = snapshot.height; still.getContext('2d').drawImage(snapshot, 0, 0);
      cameraState = 'captured'; updateCameraUI(); renderPreview(); $('profile-camera-confirm').focus();
    } catch { note('Non riesco a scattare. Riprova oppure scegli una foto dalla galleria.', true); }
  }
  async function retake() {
    cameraShot = null;
    if (!cameraStream?.getVideoTracks().some(track => track.readyState === 'live')) { await startCamera(); return; }
    cameraState = 'live'; updateCameraUI(); renderPreview();
    try { await $('profile-camera-video').play(); $('profile-camera-capture').focus(); } catch { cancelCamera(); note('Fotocamera non disponibile. Prova a riaprirla oppure usa la galleria.', true); }
  }
  function confirmCamera() {
    if (!cameraShot) return;
    const source = cameraShot, values = { ...cameraCrop };
    cameraShot = null; setImage(source); crop = values;
    cancelCamera(); renderPreview(); note('Selfie pronto. Premi “Salva profilo” per conservarlo.');
    $('profile-save').focus();
  }
  async function fromFile(file) {
    if (!file) return;
    const epoch = ++fileEpoch;
    note();
    if (!file.size || file.size > MAX_FILE) { note('Scegli una foto fino a 8 MB.', true); return; }
    if (file.type && !['image/jpeg','image/png','image/webp'].includes(file.type)) { note('Usa una foto JPG, PNG o WebP.', true); return; }
    let release, source;
    try {
      const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      const supported = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 || bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 || String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
      if (!supported) throw new Error('Usa una foto JPG, PNG o WebP valida.');
      if (typeof createImageBitmap === 'function') {
        try { source = await createImageBitmap(file, { imageOrientation: 'from-image' }); release = () => source.close(); } catch { /* Older WebKit can decode through Image below. */ }
      }
      if (!source) {
        const url = URL.createObjectURL(file); release = () => URL.revokeObjectURL(url);
        source = new Image(); source.src = url;
        try { await source.decode(); } catch { release(); throw new Error('Non riesco a leggere questa foto. Prova un altro file.'); }
      }
      if (epoch !== fileEpoch || !dialog.open) { release?.(); return; }
      cancelCamera(); setImage(source, release); renderPreview();
      note('Foto pronta. Regola il ritaglio e premi “Salva profilo”.');
      $('profile-save').focus();
    } catch (error) { release?.(); if (epoch === fileEpoch && dialog.open) note(error.message || 'Foto non leggibile. Prova un altro file.', true); }
  }
  function announce(message) {
    let status = $('buzzer-profile-saved');
    if (!status) { status = document.createElement('div'); status.id = 'buzzer-profile-saved'; status.className = 'buzzer-profile-saved'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); document.body.append(status); }
    status.textContent = message; status.hidden = false; clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { status.hidden = true; status.textContent = ''; }, 4500);
  }
  function save(event) {
    event.preventDefault();
    if (cameraState !== 'off') { note('Conferma o annulla il selfie prima di salvare.'); return; }
    const name = cleanName($('profile-name').value);
    if (!name) { note('Scrivi il nome del tuo profilo.', true); $('profile-name').focus(); return; }
    const next = { name, avatar: safeAvatar(draft.avatar) };
    let permanent = true;
    try { localStorage.setItem(KEY, JSON.stringify({ version: 1, ...next })); } catch { permanent = false; }
    profile = next; updateHeaders();
    document.dispatchEvent(new CustomEvent('buzzer:profilechange', { detail: clone(profile) }));
    dialog.close('saved');
    announce(permanent ? 'Profilo aggiornato' : 'Profilo aggiornato per questa visita. Il browser non consente il salvataggio permanente.');
  }
  function ensureDialog() {
    if (dialog || !document.body) return;
    dialog = document.createElement('dialog'); dialog.id = 'buzzer-profile-dialog'; dialog.className = 'buzzer-profile-dialog buzzer-glass'; dialog.dataset.glass = 'profile';
    dialog.setAttribute('aria-labelledby', 'profile-title'); dialog.setAttribute('aria-describedby', 'profile-description');
    dialog.innerHTML = `<form id="buzzer-profile-form" novalidate><header class="profile-heading"><div><h2 id="profile-title">Il tuo profilo</h2><p id="profile-description">Personale, salvato su questo dispositivo.</p></div><button type="button" id="profile-close" aria-label="Chiudi profilo">${icon('close') || '×'}</button></header>
      <div class="profile-body"><p class="profile-explanation">È separato dal nome e dal selfie della squadra.</p>
      <div class="profile-preview" aria-label="Anteprima dell’avatar personale"><canvas id="profile-avatar-canvas" width="240" height="240" hidden aria-hidden="true"></canvas><img id="profile-avatar-image" alt="" width="120" height="120" hidden><span id="profile-avatar-initials" aria-hidden="true">TU</span></div>
      <label class="profile-name-label" for="profile-name">Il tuo nome<input id="profile-name" type="text" maxlength="32" autocomplete="nickname" placeholder="Come ti chiami?" aria-describedby="profile-name-help" required></label><p id="profile-name-help" class="profile-help">Fino a 32 caratteri. Non cambia il nome della squadra.</p>
      <div class="profile-photo-actions"><button type="button" id="profile-camera-start">Scatta un selfie</button><button type="button" id="profile-gallery-button">Scegli dalla galleria</button></div><input id="profile-gallery" type="file" accept="image/jpeg,image/png,image/webp" hidden><p class="profile-help">JPG, PNG o WebP, fino a 8 MB. La foto viene ritagliata e ridotta sul dispositivo.</p>
      <section id="profile-camera-panel" class="profile-camera" aria-label="Scatta il tuo selfie" hidden><p id="profile-camera-status" role="status"></p><video id="profile-camera-video" autoplay playsinline muted hidden></video><canvas id="profile-camera-still" hidden aria-label="Foto appena scattata"></canvas><div class="profile-camera-actions"><button type="button" id="profile-camera-capture" hidden>Scatta</button><button type="button" id="profile-camera-retake" hidden>Rifai</button><button type="button" id="profile-camera-confirm" hidden>Conferma selfie</button><button type="button" id="profile-camera-cancel">Annulla selfie</button></div></section>
      <fieldset id="profile-crop" class="profile-crop" hidden><legend>Ritaglio dell’avatar</legend><p class="profile-help">Il cerchio mostra la foto esatta che apparirà nel profilo.</p><label for="profile-crop-zoom">Zoom <output id="profile-crop-zoom-value">1.0×</output></label><input id="profile-crop-zoom" type="range" min="1" max="3" step="0.1" value="1"><label for="profile-crop-x">Posizione orizzontale <output id="profile-crop-x-value">50%</output></label><input id="profile-crop-x" type="range" min="0" max="100" step="1" value="50"><label for="profile-crop-y">Posizione verticale <output id="profile-crop-y-value">50%</output></label><input id="profile-crop-y" type="range" min="0" max="100" step="1" value="50"></fieldset>
      <button type="button" class="profile-remove" id="profile-remove-photo">Rimuovi foto</button><p id="profile-notice" class="profile-notice" role="status" aria-live="polite"></p></div>
      <footer class="profile-footer"><button type="button" id="profile-cancel">Annulla</button><button type="submit" id="profile-save">Salva profilo</button></footer></form>`;
    document.body.append(dialog);
    $('buzzer-profile-form').addEventListener('submit', save);
    for (const id of ['profile-close','profile-cancel']) $(id).addEventListener('click', () => dialog.close('cancelled'));
    $('profile-camera-start').addEventListener('click', startCamera);
    $('profile-gallery-button').addEventListener('click', () => { cancelCamera(); $('profile-gallery').value = ''; $('profile-gallery').click(); });
    $('profile-gallery').addEventListener('change', event => { void fromFile(event.target.files?.[0]); });
    $('profile-camera-capture').addEventListener('click', capture); $('profile-camera-retake').addEventListener('click', retake); $('profile-camera-confirm').addEventListener('click', confirmCamera);
    $('profile-camera-cancel').addEventListener('click', () => { cancelCamera(); note('Selfie annullato. Il profilo non è stato modificato.'); $('profile-camera-start').focus(); });
    $('profile-name').addEventListener('input', () => { if (draft) draft.name = $('profile-name').value; renderPreview(); });
    $('profile-remove-photo').addEventListener('click', () => { discardImage(); draft.avatar = ''; renderPreview(); note('Foto rimossa dall’anteprima. Premi “Salva profilo” per confermare.'); });
    for (const key of ['zoom','x','y']) $(`profile-crop-${key}`).addEventListener('input', event => { (cameraShot ? cameraCrop : crop)[key] = Number(event.target.value); renderPreview(); });
    dialog.addEventListener('cancel', () => cancelCamera());
    dialog.addEventListener('close', () => {
      fileEpoch++; cancelCamera(); discardImage(); draft = null; $('profile-gallery').value = '';
      const target = lastFocus?.isConnected ? lastFocus : document.querySelector('[data-personal-profile]'); target?.focus();
    });
    dialog.addEventListener('click', event => { if (event.target !== dialog) return; const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close('cancelled'); });
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const controls = [...dialog.querySelectorAll('button,input,a[href],select,textarea')].filter(el => !el.disabled && el.getClientRects().length);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
    document.dispatchEvent(new CustomEvent('buzzer:profile-ready', { detail: { dialog } }));
  }
  function open() {
    ensureDialog(); if (!dialog || dialog.open) return;
    lastFocus = document.activeElement; draft = clone(profile); discardImage(); cameraShot = null; cameraState = 'off';
    $('profile-name').value = profile.name === DEFAULT_NAME ? '' : profile.name; note(); updateCameraUI(); renderPreview();
    dialog.showModal(); $('profile-name').focus(); window.BuzzerVisuals?.refresh();
  }
  document.addEventListener('buzzer:shell-ready', mountAll);
  addEventListener('storage', event => { if (event.key === KEY) { profile = read(); updateHeaders(); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden && cameraState !== 'off') { cancelCamera({ keepShot: true }); if (dialog?.open) note(cameraShot ? 'Fotocamera spenta. Puoi confermare la foto già scattata.' : 'Fotocamera spenta mentre la pagina non è visibile. Riaprila per scattare.'); } });
  addEventListener('pagehide', stopTracks); addEventListener('beforeunload', stopTracks);
  addEventListener('pageshow', () => { if (cameraState === 'live' && !cameraStream) cancelCamera({ keepShot: true }); });
  window.BuzzerProfile = { mount, open, getProfile: () => clone(profile) };
  const init = () => { ensureDialog(); mountAll(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
