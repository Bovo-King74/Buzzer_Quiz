(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const storageKey = 'buzzer.afterparty.session.v1';
  let credentials = null, state = null, renderKey = '', skew = 0, busy = false;
  try { credentials = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch {}
  const socket = io('/afterparty');
  const error = message => { $('#error').textContent = message || ''; };
  function save(value) { credentials = value; try { if (value) sessionStorage.setItem(storageKey, JSON.stringify(value)); else sessionStorage.removeItem(storageKey); } catch {} }
  function request(event, data = {}) {
    return new Promise((resolve, reject) => {
      if (!socket.connected) return reject(new Error('Connessione assente. Aspetta il rientro in sala.'));
      socket.timeout(7000).emit(event, data, (timeout, result) => {
        if (timeout) return reject(new Error('Risposta lenta. Attendi lo stato aggiornato prima di riprovare.'));
        if (!result?.ok) return reject(new Error(result?.error || 'Qualcosa non è andato. Riprova.'));
        resolve(result);
      });
    });
  }
  async function run(fn) { if (busy) return; busy = true; error(''); try { await fn(); } catch (e) { error(e.message); } finally { busy = false; } }
  const incomingCode = new URLSearchParams(location.search).get('c');
  if (incomingCode) {
    $('#code').value = incomingCode.toUpperCase();
    $('#entry').classList.add('invited');
    $('.pitch h1').textContent = 'Siete dei nostri.';
    $('.pitch h1 + p').textContent = 'Scegli un nome per la squadra. La vostra versione dei fatti ci interessa parecchio.';
    if (credentials?.code !== incomingCode.toUpperCase()) save(null);
  }
  socket.on('connect', () => {
    $('#connection').textContent = 'Connesso'; $('#connection').className = 'online';
    if (credentials) request('resume', credentials).catch(e => { save(null); reset(); error(e.message); });
  });
  socket.on('disconnect', () => { $('#connection').className = ''; $('#connection').textContent = 'Connessione persa. Rientro automatico in corso…'; });
  socket.on('connect_error', () => { $('#connection').className = ''; $('#connection').textContent = 'Afterparty non raggiungibile. Riprovo…'; });
  socket.on('expired', () => { save(null); reset(); error('Accesso terminato: stanza scaduta, server riavviato o squadra rimossa. Puoi rientrare se la sala è ancora aperta.'); });
  $('#join-form').addEventListener('submit', e => { e.preventDefault(); run(async () => { const r = await request('join', { code: $('#code').value, name: $('#name').value }); save({ code: r.code, token: r.token }); }); });
  $('#create-form').addEventListener('submit', e => { e.preventDefault(); run(async () => { const r = await request('create', { password: $('#password').value }); save({ code: r.code, token: r.token }); $('#password').value = ''; }); });
  function reset() { state = null; renderKey = ''; $('#room').hidden = true; $('#entry').hidden = false; }
  $('#leave').onclick = () => {
    if (!confirm('Uscire cancella l’accesso salvato in questa scheda. La stanza continua per gli altri. Vuoi uscire?')) return;
    run(async () => { await request('leave'); save(null); reset(); });
  };
  const phases = { lobby: 'La banda si riunisce.', write: 'Sparate una bugia.', vote: 'Chi vi sta fregando?', reveal: 'Apriamo la busta.', final: 'Bravi. Non ci fidiamo più.' };
  const playerName = id => state.players.find(p => p.id === id)?.name || 'Archivio';
  function timer() {
    const el = $('#clock'); if (!el || !state) return;
    el.textContent = `${Math.max(0, Math.ceil((state.deadline - (Date.now() + skew)) / 1000))} s`;
  }
  setInterval(timer, 250);
  function action(label) { return state.host ? `<div class="controls"><button data-action="advance">${label}</button></div>` : ''; }
  function renderStage() {
    const s = state, head = `<div class="timer"><span>Round ${s.round} di ${s.total}</span>${s.deadline ? '<strong id="clock" aria-label="Tempo rimanente"></strong>' : ''}</div>`;
    if (s.phase === 'lobby') {
      const link = `${location.origin}/afterparty/?c=${s.code}`;
      return `<div class="stage-card"><h2>Prima gli amici.<br>Poi le bugie.</h2><p>Invita da 2 a 12 squadre. La regia resta su questo schermo; ogni squadra entra dal proprio telefono.</p><div class="share"><img src="/afterparty/qr/${s.code}" alt="QR per entrare nella stanza" width="160" height="160"><div><div class="big-code">${s.code}</div><a href="${esc(link)}">${esc(link)}</a><button class="quiet" data-action="copy">Copia invito</button></div></div><p id="progress" class="notice"></p>${action('Cominciamo')}${!s.host ? '<p>La regia avvierà la partita. Tenete pronta una faccia credibile.</p>' : ''}</div>`;
    }
    if (s.phase === 'final') {
      const best = Math.max(...s.players.map(p => p.score));
      const names = s.players.filter(p => p.score === best).map(p => esc(p.name));
      return `<div class="stage-card"><h2>${names.length > 1 ? 'Complici a pari merito.' : 'La faccia più credibile.'}</h2><p class="winners">${names.join(' & ')}</p><p>${best.toLocaleString('it')} punti. Un talento discutibile, ma pur sempre un talento.</p><p>La classifica resta qui finché la stanza è disponibile. Per un’altra partita, esci e crea una nuova stanza.</p><button class="quiet" data-action="export">Scarica il riepilogo</button></div>`;
    }
    const prompt = `${head}<h2>${esc(s.title)}</h2><p class="question">${esc(s.prompt)}</p><p class="fine">Storia inventata · risposta sigillata nell’archivio</p><p id="progress" class="notice"></p>`;
    if (s.phase === 'write') return `<div class="stage-card">${prompt}${s.host ? '<p>Non suggerire. La tua faccia da poker è già un indizio.</p>' : s.submitted ? '<p>Bluff consegnato. Ora comportati come se fosse cultura generale.</p>' : '<form id="bluff-form"><label>La vostra versione dei fatti<textarea id="bluff" minlength="3" maxlength="140" required placeholder="Una frase breve. Più sembra normale, peggio è."></textarea></label><button>Sigilla il bluff</button><small>Una sola consegna. Massimo 140 caratteri.</small></form>'}${action('Chiudi la scrittura')}</div>`;
    const options = s.options.map(o => {
      if (s.phase === 'vote') return `<button class="option" data-vote="${o.id}" ${s.host || s.voted || o.own ? 'disabled' : ''}>${esc(o.text)}${o.own ? '<small>La vostra risposta: non votabile</small>' : ''}</button>`;
      const authors = o.owners.map(playerName).map(esc).join(', ');
      const voters = o.voters.map(playerName).map(esc).join(', ');
      return `<div class="option ${o.truth ? 'correct' : ''}"><strong>${o.truth ? 'La risposta della busta' : authors ? `Bluff di ${authors}` : 'Esca dell’archivio'}</strong><p>${esc(o.text)}</p><small>${voters ? `Ci hanno creduto: ${voters}` : 'Nessun voto'}${o.truth && authors ? ` · Indovinata scrivendo da: ${authors}` : ''}</small></div>`;
    }).join('');
    return `<div class="stage-card">${prompt}${s.voted && s.phase === 'vote' ? '<p>Voto sigillato. Se è una figuraccia, almeno è anonima. Per ora.</p>' : ''}<div class="options">${options}</div>${action(s.phase === 'vote' ? 'Svela la risposta' : s.round === s.total ? 'Classifica finale' : 'Prossimo round')}</div>`;
  }
  socket.on('state', next => {
    state = next; skew = next.serverNow - Date.now();
    $('#entry').hidden = true; $('#room').hidden = false;
    $('#role').textContent = next.host ? 'Regia della serata' : `In gioco · ${playerName(next.me)}`;
    $('#room-title').textContent = phases[next.phase]; $('#room-code').textContent = next.code;
    $('#count').textContent = `${next.players.length} squadre · ${next.players.filter(p => p.online).length} connesse`;
    $('#players').innerHTML = [...next.players].sort((a,b) => b.score - a.score).map(p => `<li><span>${esc(p.name)}${p.id === next.me ? ' (voi)' : ''}<small>${p.online ? 'Online' : 'Non connessa'}${next.phase === 'write' && p.ready ? ' · consegnato' : ''}${next.phase === 'vote' && p.voted ? ' · votato' : ''}</small></span><b>${p.score.toLocaleString('it')}${next.phase === 'reveal' ? `<small class="gain">+${p.gain}</small>` : ''}</b>${next.host && next.phase === 'lobby' ? `<button class="remove" data-remove="${p.id}" aria-label="Rimuovi ${esc(p.name)}">Rimuovi</button>` : ''}</li>`).join('');
    const key = [next.code, next.phase, next.round, next.submitted, next.voted, next.host].join(':');
    if (key !== renderKey) { const was = renderKey; renderKey = key; $('#stage').innerHTML = renderStage(); if (was) $('#room-title').focus({ preventScroll: true }); }
    const progress = $('#progress');
    if (progress) progress.textContent = next.phase === 'lobby' ? `${next.players.length} squadre in sala. Ne servono almeno 2.` : next.phase === 'write' ? `${next.players.filter(p=>p.ready).length}/${next.players.length} bluff consegnati` : next.phase === 'vote' ? `${next.players.filter(p=>p.voted).length}/${next.players.length} voti sigillati` : '1.000 punti per la busta. 500 per ogni amico ingannato.';
    const start = $('[data-action="advance"]'); if (start) start.disabled = next.phase === 'lobby' && next.players.length < 2;
    timer();
  });
  $('#players').addEventListener('click', e => {
    const button = e.target.closest('[data-remove]');
    if (button && confirm('Rimuovere questa squadra dalla sala d’attesa? Potrà rientrare con il codice.')) run(() => request('remove', { player: button.dataset.remove }));
  });
  $('#stage').addEventListener('submit', e => { if (e.target.id !== 'bluff-form') return; e.preventDefault(); const text = $('#bluff').value; run(() => request('submit', { text, round: state.round })); });
  $('#stage').addEventListener('click', e => {
    const vote = e.target.closest('[data-vote]'); if (vote && !vote.disabled) { run(() => request('vote', { option: vote.dataset.vote, round: state.round })); return; }
    const button = e.target.closest('[data-action]'); if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (action === 'advance') {
      if (['write','vote'].includes(state.phase) && !confirm('Chiudere ora questa fase? Chi non ha consegnato non potrà più farlo.')) return;
      run(() => request('advance', { round: state.round, phase: state.phase }));
    }
    if (action === 'copy') run(async () => { await navigator.clipboard.writeText(`${location.origin}/afterparty/?c=${state.code}`); button.textContent = 'Invito copiato'; });
    if (action === 'export') {
      const text = `AFTERPARTY · ${state.code}\n` + [...state.players].sort((a,b)=>b.score-a.score).map((p,i)=>`${i+1}. ${p.name}: ${p.score} punti`).join('\n');
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = 'afterparty-classifica.txt'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
  });
})();
