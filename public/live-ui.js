/* Shared live controls. Deadlines are displayed here; only the server changes play. */
(() => {
  'use strict';
  const reactions = ['👏', '🔥', '🎉', '😂', '💪', '❤️']; // taste-skill-ignore: six reaction values explicitly requested by the user, rather than decorative UI labels.
  const soundLabels = { applause: 'Applauso', fanfare: 'Fanfara', drumroll: 'Rullo di tamburi', comic: 'Effetto comico' };
  const esc = value => String(value).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const icon = key => window.BuzzerUX?.icon(key) || '';
  let socket, role, state, live, offset = 0, tick, selectedPlayer, returnFocus, noticeTimeout, disconnected = false, viaUntil = 0, applauseCounts = '';
  const seen = new Set();
  const hostPulses = new Map();
  function paintHostPulses() {
    if (role !== 'host') return;
    for (const [pid, endsAt] of hostPulses) if (endsAt < Date.now()) hostPulses.delete(pid);
    document.querySelectorAll('#sq [data-id],#lsq [data-id]').forEach(row => row.classList.toggle('host-buzz-confirmed', hostPulses.has(row.dataset.id)));
  }
  const requestId = () => window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  const now = () => Date.now() + offset;
  const left = object => object ? Math.max(0, object.endsAt ? object.endsAt - now() : object.remainingMs || 0) : 0;
  const $ = id => document.getElementById(id);
  function text(id, value) { const el = $(id); if (el && el.textContent !== value) el.textContent = value; }
  function hidden(id, value) { const el = $(id); if (el && el.hidden !== !!value) el.hidden = !!value; }
  function html(id, value) { const el = $(id); if (el && el.innerHTML !== value) el.innerHTML = value; }
  function notify(value) {
    clearTimeout(noticeTimeout);
    text('live-notice', value);
    const notice = document.querySelector('.live-dialog-notice'); if (notice) notice.textContent = value;
    if (value && !disconnected) noticeTimeout = setTimeout(() => notify(''), 5500);
  }
  function command(type, data = {}) {
    window.BuzzerUX?.unlock();
    if (!socket?.connected) { notify('Connessione assente. Attendi il collegamento.'); return; }
    socket.timeout(4000).emit('live:act', { type, roundId: live?.roundId, requestId: requestId(), ...data }, (error, result) => {
      notify(error ? 'Conferma non ricevuta. Controlla lo stato prima di riprovare.' : result?.error || (result?.ok ? 'Comando eseguito.' : 'Comando non disponibile.'));
    });
  }
  function dialog(id, title, contents) {
    const element = document.createElement('dialog');
    element.id = id; element.className = 'live-dialog'; element.setAttribute('aria-labelledby', `${id}-title`);
    element.innerHTML = `<header><h2 id="${id}-title">${title}</h2><button type="button" data-close aria-label="Chiudi">${icon('close')} Chiudi</button></header>${contents}`;
    element.addEventListener('click', event => { if (event.target.closest('[data-close]')) element.close(); });
    element.addEventListener('close', () => {
      if (returnFocus?.isConnected) returnFocus.focus();
      else if (id === 'live-player-dialog' && selectedPlayer) document.querySelector(`[data-player-action="${selectedPlayer}"]`)?.focus();
      else $('live-modes')?.focus();
    });
    document.body.append(element); return element;
  }
  function openDialog(element) {
    if (element.open) return;
    returnFocus = document.activeElement; element.showModal();
  }
  function buildHost() {
    const toolbar = document.createElement('div'); toolbar.id = 'live-toolbar';
    toolbar.innerHTML = `<div class="live-wordmark">Buzzer <span>Regia</span></div><div class="live-quick"><button id="live-go">${icon('countdown')} Via 3–2–1</button><button id="live-pause">${icon('pause')} Pausa</button><button id="live-modes" aria-haspopup="dialog">${icon('more')} Modalità</button></div>`;
    $('stage').prepend(toolbar);
    $('live-go').onclick = () => command(live?.countdown ? 'countdown:cancel' : 'countdown:start');
    $('live-pause').onclick = () => command(live?.paused ? 'resume' : 'pause');
    const modes = dialog('live-mode-dialog', 'Modalità di gioco', `
      <p class="live-hint">Il server apre e chiude le prenotazioni. Duello, countdown e timer seguono lo stato della manche; l’applausometro si apre a prenotazioni bloccate.</p>
      <section><h3>${icon('duel')} Duello</h3><p>Solo le due squadre selezionate possono prenotarsi.</p><div class="live-fields"><label>Prima squadra<select id="duel-one"></select></label><label>Seconda squadra<select id="duel-two"></select></label></div><div class="live-buttons"><button id="duel-start">Avvia duello</button><button data-live="duel:end">Torna al gioco normale</button></div></section>
      <section><h3>${icon('shuffle')} Estrai una squadra</h3><label class="live-check"><input id="draw-exclude" type="checkbox" checked> Escludi le squadre già estratte</label><div class="live-buttons"><button id="draw-start">Estrai partecipante</button><button data-live="draw:reset">Azzera il giro</button><button data-live="draw:clear">Chiudi estrazione</button></div><p id="draw-history" class="live-hint"></p></section>
      <section><h3>${icon('timer')} Tempo per rispondere</h3><p>Avvia dopo una prenotazione accettata. Nessuna penalità automatica.</p><label>Durata<select id="timer-seconds"><option value="10">10 secondi</option><option value="20" selected>20 secondi</option><option value="30">30 secondi</option></select></label><div class="live-buttons"><button id="timer-start">Avvia timer</button><button id="timer-toggle">Pausa timer</button><button data-live="timer:reset">Reset timer</button></div></section>
      <section><h3>${icon('reaction')} Applausometro</h3><p>Una finestra di 8 secondi per le reazioni di tutti, separata dai punti.</p><div class="live-buttons"><button data-live="applause:start">Apri applausometro</button><button data-live="applause:stop">Concludi</button><button data-live="applause:clear">Chiudi riepilogo</button></div></section>
      <section><h3>${icon('countdown')} Via sincronizzato</h3><p>Il buzzer resta bloccato fino al VIA del server.</p><button data-live="countdown:cancel">Annulla conto alla rovescia</button></section>
      <section><h3>${icon('spotlight')} Spotlight</h3><p>Usa il menu di una squadra per evidenziarla per qualche secondo.</p><button data-live="spotlight:clear">Spegni spotlight</button></section>
      <section><h3>${icon('reset')} Manche</h3><p>La nuova manche chiude countdown, timer ed effetti correnti. I punti restano invariati.</p><div class="live-buttons"><button data-legacy="newround">Nuova manche</button><button data-legacy="undo">Annulla ultima azione</button></div></section>
      <p class="live-dialog-notice" role="status"></p>`);
    $('live-modes').onclick = () => { updateRoster(); openDialog(modes); updateControls(); };
    modes.addEventListener('click', event => { const button = event.target.closest('[data-live]'); if (button) command(button.dataset.live); });
    modes.addEventListener('click', event => {
      const button = event.target.closest('[data-legacy]');
      if (button && socket.connected) { socket.emit('act', { type: button.dataset.legacy }); notify('Richiesta inviata alla regia.'); }
    });
    $('duel-start').onclick = () => command('duel:start', { ids: [$('duel-one').value, $('duel-two').value] });
    $('draw-start').onclick = () => command('draw', { excludeDrawn: $('draw-exclude').checked });
    $('timer-start').onclick = () => command('timer:start', { seconds: Number($('timer-seconds').value) });
    $('timer-toggle').onclick = () => command(live?.timer?.status === 'running' ? 'timer:pause' : 'timer:resume');
    const actions = dialog('live-player-dialog', 'Azioni per la squadra', `<p class="live-private">Reazioni, suoni e messaggi arrivano soltanto al destinatario.</p>
      <section><h3>Reazioni</h3><div class="live-reactions">${reactions.map(value => `<button data-effect="reaction" data-value="${value}" aria-label="Invia ${value}">${value}</button>`).join('')}</div></section>
      <section><h3>${icon('speaker')} Effetti sonori</h3><div class="live-buttons">${Object.entries(soundLabels).map(([value, label]) => `<button data-effect="sound" data-value="${value}">${label}</button>`).join('')}</div></section>
      <section><h3>${icon('message')} Messaggi rapidi</h3><div class="live-buttons">${['Tocca a te!', 'Grande risposta!', 'Preparati!'].map(value => `<button data-effect="message" data-value="${value}">${value}</button>`).join('')}<button data-effect="presence" data-value="Ci sei?">Ci sei? / chiedi presenza</button></div></section>
      <section><h3>${icon('spotlight')} In evidenza</h3><button id="player-spotlight">Spotlight su host e TV</button><p class="live-hint">Lo spotlight è pubblico. Le altre azioni qui sopra sono private.</p></section>
      <section><h3>Gestione squadra</h3><div class="live-buttons"><button data-manage="kick">Espelli</button><button class="no" data-manage="ban">Banna dalla partita</button></div></section><p id="player-action-notice" role="status"></p>`);
    actions.addEventListener('click', event => {
      const button = event.target.closest('[data-effect]'); if (!button || !selectedPlayer) return;
      if (!socket.connected) { text('player-action-notice', 'Connessione assente.'); return; }
      window.BuzzerUX?.unlock();
      socket.timeout(4000).emit('host:effect', { roundId: live?.roundId, pid: selectedPlayer, kind: button.dataset.effect, value: button.dataset.value, requestId: requestId() }, (error, result) => {
        text('player-action-notice', error ? 'Conferma non ricevuta.' : result?.error || 'Inviato al destinatario.');
      });
    });
    actions.addEventListener('click', event => {
      const button = event.target.closest('[data-manage]'); if (!button || !selectedPlayer) return;
      const player = state.players.find(p => p.id === selectedPlayer);
      if (player && confirm(`${button.dataset.manage === 'ban' ? 'Bannare' : 'Espellere'} ${player.nick}?`)) {
        socket.emit('act', { type: button.dataset.manage, roundId: live?.roundId, id: selectedPlayer }); actions.close();
      }
    });
    $('player-spotlight').onclick = () => command('spotlight', { pid: selectedPlayer });
    socket.on('presence:confirmed', event => {
      if (!fresh(event)) return;
      notify(`${event.nick}: Eccomi! Presenza confermata.`);
      text('player-action-notice', `${event.nick}: Eccomi!`);
      window.BuzzerUX?.showEffect({ kind: 'message', value: `${event.nick}: Eccomi!`, expiresAt: Date.now() + 4000 });
    });
  }
  let rosterHash = '';
  function updateRoster() {
    if (role !== 'host' || !state) return;
    const roster = state.players.filter(p => p.st === 'ok' && p.on);
    const hash = JSON.stringify(roster.map(p => [p.id, p.nick]));
    if (hash !== rosterHash) {
      rosterHash = hash;
      ['duel-one', 'duel-two'].forEach((id, index) => {
        const select = $(id), value = select.value;
        select.innerHTML = roster.map(p => `<option value="${p.id}">${esc(p.nick)}</option>`).join('');
        select.value = roster.some(p => p.id === value) ? value : roster[index]?.id || '';
      });
    }
    if ($('live-player-dialog')?.open) {
      const player = state.players.find(p => p.id === selectedPlayer);
      text('live-player-dialog-title', `Azioni per ${player?.nick || 'squadra rimossa'}`);
      document.querySelectorAll('#live-player-dialog [data-effect],#player-spotlight').forEach(button => { button.disabled = !player?.on || player.st !== 'ok'; });
    }
  }
  function updateControls() {
    if (role !== 'host' || !state || !live) return;
    const blocked = live.paused || !!live.countdown || (!!live.applause && !live.applause.closed);
    document.querySelectorAll('#live-mode-dialog button:not([data-close]),#live-player-dialog [data-manage]').forEach(button => { button.disabled = false; });
    $('bNew').disabled = $('bUndo').disabled = blocked;
    document.querySelector('[data-legacy="undo"]').disabled = blocked;
    document.querySelectorAll('#cmd button,#fab button').forEach(button => { if (blocked) button.disabled = true; });
    $('live-go').disabled = !state.started || live.paused || (!live.countdown && (state.phase !== 'locked' || live.applause && !live.applause.closed));
    html('live-go', icon('countdown') + (live.countdown ? ' Annulla VIA' : ' Via 3–2–1'));
    $('live-pause').disabled = !state.started;
    html('live-pause', icon(live.paused ? 'play' : 'pause') + (live.paused ? ' Riprendi' : ' Pausa'));
    $('duel-start').disabled = live.paused || !!live.countdown || state.phase !== 'locked' || state.players.filter(p => p.st === 'ok' && p.on).length < 2;
    $('timer-start').disabled = live.paused || state.phase !== 'answering';
    $('timer-toggle').disabled = live.paused || !live.timer || live.timer.status === 'expired';
    text('timer-toggle', live.timer?.status === 'paused' ? 'Riprendi timer' : 'Pausa timer');
    text('draw-history', `${live.drawn?.length || 0} squadre già estratte in questo giro.`);
    if (live.paused) { text('bt', 'Partita in pausa'); text('bsm', 'Prenotazioni e timer sospesi'); }
    else if (live.countdown) { text('bsm', 'Via sincronizzato · prenotazioni bloccate'); }
  }
  function buildStrip() {
    const strip = document.createElement('section'); strip.id = 'live-strip'; strip.setAttribute('aria-label', 'Stato delle modalità');
    strip.innerHTML = `<div id="live-mode" class="live-mode">Gioco normale</div><div id="live-clock" class="live-clock" aria-live="off" hidden></div><div id="live-timer" class="live-timer" role="timer" hidden></div><div id="live-result" hidden></div><div id="live-applause" hidden><div id="applause-summary"></div>${role === 'player' ? `<div class="live-reactions">${reactions.map(value => `<button data-applaud="${value}" aria-label="Applaudi con ${value}">${value}</button>`).join('')}</div>` : ''}</div><div id="live-presence" hidden><span>L’host chiede: ci sei?</span><button id="presence-reply">Eccomi!</button></div><p id="live-notice" role="status"></p>`;
    if (role === 'host') $('live-toolbar').after(strip);
    else if (role === 'player') $('top').after(strip);
    else $('tv-top').after(strip);
    if (role === 'player') {
      $('presence-reply').onclick = () => {
        if (!state?.presence || !socket.connected) return;
        window.BuzzerUX?.unlock();
        socket.timeout(4000).emit('presence:reply', { id: state.presence.id }, (error, result) => {
          if (error || !result?.ok) return notify(result?.error || 'Conferma non ricevuta. Riprova.');
          $('live-presence').hidden = true; notify('Presenza confermata all’host.');
        });
      };
      let lastApplause = 0;
      strip.addEventListener('click', event => {
        const button = event.target.closest('[data-applaud]');
        if (!button || !live?.applause || Date.now() - lastApplause < 800 || !socket.connected) return;
        lastApplause = Date.now();
        socket.timeout(3000).emit('applause:react', { id: live.applause.id, value: button.dataset.applaud }, (error, result) => {
          notify(error ? 'Reazione non confermata.' : result?.error || 'Reazione inviata!');
        });
      });
    }
  }
  function fresh(event) {
    if (!event || (event.id && seen.has(event.id)) || (event.roundId && event.roundId !== live?.roundId) || event.expiresAt && event.expiresAt < now()) return false;
    if (event.id) { seen.add(event.id); if (seen.size > 200) seen.delete(seen.values().next().value); }
    return true;
  }
  function paintClock() {
    if (!live || document.hidden) return;
    const countdown = live.countdown;
    hidden('live-clock', !countdown && Date.now() >= viaUntil);
    if (countdown) {
      const remaining = live.paused ? countdown.remainingMs : left(countdown);
      const value = remaining > 0 ? String(Math.ceil(remaining / 1000)) : 'Attendi il VIA…';
      text('live-clock', `${live.paused ? 'Countdown sospeso · ' : 'Via tra '} ${value}`);
      if (role === 'host' && !live.paused) text('bt', value);
      if (role === 'tv' && !live.paused) text('tv-bt', value);
    }
    else if (Date.now() < viaUntil) text('live-clock', 'VIA!');
    const timer = live.timer;
    hidden('live-timer', !timer);
    if (timer) {
      const remaining = timer.status === 'running' && !live.paused ? left(timer) : timer.remainingMs;
      const expired = timer.status === 'expired';
      text('live-timer', expired ? 'Tempo scaduto' : `Tempo ${Math.ceil((remaining || 0) / 1000)}s${timer.status === 'paused' || live.paused ? ' · in pausa' : ''}`);
      $('live-timer').classList.toggle('expired', expired);
    }
    if (state?.presence) hidden('live-presence', state.presence.expiresAt <= now());
    if (live.draw) {
      const player = state.players?.find(p => p.id === live.draw.pid);
      const drawing = now() - live.draw.at < 700;
      $('live-result').classList.toggle('live-drawing', drawing);
      text('live-result', drawing ? 'Estrazione in corso…' : `Estratto: ${player?.nick || live.draw.nick || 'squadra selezionata'}`);
    }
    if (live.spotlight && live.spotlight.endsAt <= now()) document.querySelectorAll('.live-spotlight').forEach(el => el.classList.remove('live-spotlight'));
    const applause = live.applause;
    if (applause) {
      const total = Object.values(applause.counts || {}).reduce((sum, count) => sum + count, 0);
      const summary = reactions.filter(value => applause.counts?.[value]).map(value => `${value} ${applause.counts[value]}`).join('   ');
      text('applause-summary', `${applause.closed ? 'Applausometro concluso' : `Applausometro · ${Math.ceil(left(applause) / 1000)}s`} · ${total} reazioni${summary ? ' · ' + summary : ''}`);
    }
  }
  function receive(next) {
    const previousTimer = live?.timer, previousRound = live?.roundId, previousCountdown = live?.countdown, recovering = disconnected;
    state = next; live = next.live;
    if (!live) return;
    if (disconnected) { disconnected = false; notify('Connessione ripristinata.'); }
    else if (previousRound && previousRound !== live.roundId || previousTimer && !live.timer) notify('');
    if (!recovering && previousCountdown && !live.countdown && (next.mode === 'open' || next.phase === 'open')) viaUntil = Date.now() + 900;
    offset = live.serverNow - Date.now();
    window.BuzzerUX?.setState(live, next.mode || next.phase);
    if (!recovering && previousTimer && live.timer && previousTimer.id === live.timer.id && previousTimer.status !== 'expired' && live.timer.status === 'expired') {
      window.BuzzerUX?.play('expired');
      notify('Tempo scaduto. L’host decide come proseguire.');
    }
    const names = live.duel?.map(id => next.players?.find(p => p.id === id)?.nick || live.duelParticipants?.find(p => p.id === id)?.nick || (id === next.id ? next.nick : 'avversario')) || [];
    text('live-mode', live.paused ? 'Partita in pausa' : live.duel?.length ? `Duello · ${names.join(' / ')}${next.mode === 'spectator' ? ' · Spettatore' : ''}` : 'Gioco normale');
    $('live-result').hidden = !live.draw;
    $('live-applause').hidden = !live.applause;
    const nextCounts = JSON.stringify(live.applause?.counts || {});
    if (nextCounts !== applauseCounts) {
      applauseCounts = nextCounts;
      $('applause-summary').dataset.beat = $('applause-summary').dataset.beat === '1' ? '0' : '1';
    }
    document.querySelectorAll('[data-applaud]').forEach(button => { button.disabled = live.paused || live.applause?.closed || next.mode === 'pending'; });
    if (role === 'player') { $('live-presence').hidden = !next.presence; $('presence-reply').disabled = !socket.connected; }
    document.querySelectorAll('[data-id], [data-player-id]').forEach(el => {
      el.classList.toggle('live-spotlight', !!live.spotlight && live.spotlight.endsAt > now() && (el.dataset.id || el.dataset.playerId) === live.spotlight.pid);
    });
    if (role === 'host') { updateRoster(); updateControls(); }
    if (role === 'tv') {
      if (live.paused) { text('tv-bt', 'Partita in pausa'); text('tv-bsm', 'Prenotazioni e timer sospesi'); }
      else if (live.countdown) text('tv-bsm', 'Via sincronizzato · prenotazioni bloccate');
    }
    decorateControls();
    paintHostPulses();
    paintClock();
  }
  function decorateControls() {
    const controls = role === 'host' ? { bStart: 'play', bOpen: 'play', bLock: 'pause', bOk: 'check', bKo: 'close', bNew: 'reset', bUndo: 'reset', bReset: 'reset', bEnd: 'close' } : role === 'player' ? { chb: 'message' } : {};
    for (const [id, name] of Object.entries(controls)) {
      const button = $(id); if (!button || button.querySelector('.live-control-icon')) continue;
      const wrapper = document.createElement('span'); wrapper.className = 'live-control-icon'; wrapper.innerHTML = icon(name); wrapper.setAttribute('aria-hidden', 'true');
      button.prepend(wrapper);
    }
  }
  function attach(connection, kind) {
    socket = connection; role = kind;
    if (role === 'host') buildHost();
    buildStrip();
    decorateControls();
    socket.on(role === 'player' ? 'me' : 'state', receive);
    socket.on('disconnect', () => {
      disconnected = true;
      notify('Connessione persa. Riconnessione in corso…');
      document.querySelectorAll('#live-toolbar button,#live-mode-dialog button:not([data-close]),#live-player-dialog button:not([data-close]),[data-applaud],#presence-reply').forEach(button => { button.disabled = true; });
    });
    if (role === 'player') socket.on('effect', event => {
      if (!fresh(event)) return;
      if (event.kind === 'presence') { $('live-presence').hidden = false; return; }
      window.BuzzerUX?.showEffect(event);
    });
    if (role === 'host') {
      socket.on('buzz', event => {
        if (!fresh(event)) return;
        window.BuzzerUX?.play('buzzer', { channel: 'buzz' });
      });
      socket.on('reservation', event => {
        if (!fresh({ ...event, id: `reservation:${event.id}` })) return;
        if (event.pid) { hostPulses.set(event.pid, Date.now() + 900); paintHostPulses(); setTimeout(paintHostPulses, 920); }
      });
      socket.on('sfx', event => { if (typeof event === 'string') window.BuzzerUX?.play(event); else if (fresh(event)) window.BuzzerUX?.play(event.name); });
    }
    const restartClock = () => {
      clearInterval(tick); tick = undefined;
      if (!document.hidden) { paintClock(); tick = setInterval(paintClock, 200); }
    };
    document.addEventListener('visibilitychange', restartClock); restartClock();
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && $('big')) $('big').hidden = true; });
  }
  window.BuzzerLive = { attach, command, openParticipant(pid) {
    selectedPlayer = pid; text('player-action-notice', ''); updateRoster();
    const player = state?.players.find(p => p.id === pid);
    text('live-player-dialog-title', `Azioni per ${player?.nick || 'squadra'}`);
    openDialog($('live-player-dialog')); updateRoster();
  } };
})();
