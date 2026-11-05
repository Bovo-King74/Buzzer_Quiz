'use strict';
const crypto = require('crypto');
const REACTIONS = ['👏', '🔥', '🎉', '😂', '💪', '❤️'];
const SOUNDS = ['applause', 'fanfare', 'drumroll', 'comic'];
const MESSAGES = ['Tocca a te!', 'Grande risposta!', 'Preparati!', 'Ci sei?'];
const id = () => crypto.randomBytes(8).toString('hex');
const fail = error => ({ ok: false, error });
const ok = extra => ({ ok: true, ...extra });
const eligible = (g, p) => !!(p && p.st === 'ok' && p.sid && (!g.live.duel.length || g.live.duel.includes(p.id)));
function init() {
  return { roundId: id(), paused: false, countdown: null, duel: [], draw: null, drawn: [], timer: null, applause: null, spotlight: null };
}
function remaining(item, now) { return item.endsAt ? Math.max(0, item.endsAt - now) : item.remainingMs; }
function view(g, now = Date.now()) {
  const l = g.live;
  const timed = item => item ? { ...item, remainingMs: remaining(item, now) } : null;
  return { ...l, serverNow: now, duelParticipants: l.duel.map(pid => ({ id: pid, nick: g.players[pid]?.nick || 'Partecipante rimosso' })), countdown: timed(l.countdown), timer: timed(l.timer), applause: timed(l.applause) };
}
function clearRound(g) {
  g.phase = 'locked'; g.ans = null; g.answered.clear(); g.order = []; g.done = false;
  g.live.roundId = id(); g.live.countdown = null; g.live.timer = null; g.live.applause = null;
  g.live.spotlight = null; g.live.draw = null;
  for (const p of Object.values(g.players)) p.presence = null;
  // Snapshots from an earlier round must not restore its stale queue.
  g.undo = [];
}
function advance(g, now = Date.now()) {
  const l = g.live; let changed = false;
  if (l.spotlight && l.spotlight.endsAt <= now) { l.spotlight = null; changed = true; }
  for (const p of Object.values(g.players)) {
    if (p.presence && p.presence.expiresAt <= now) { p.presence = null; changed = true; }
  }
  if (g.ending || l.paused) return changed;
  if (l.countdown && l.countdown.endsAt <= now) {
    l.countdown = null;
    // Disconnections during countdown cannot open a round without an eligible player.
    g.phase = Object.values(g.players).some(p => eligible(g, p)) ? 'open' : 'locked'; changed = true;
  }
  if (l.timer?.status === 'running' && l.timer.endsAt <= now) {
    l.timer = { ...l.timer, endsAt: null, remainingMs: 0, status: 'expired' }; changed = true;
  }
  if (l.applause && !l.applause.closed && l.applause.endsAt <= now) {
    l.applause = { ...l.applause, endsAt: null, remainingMs: 0, closed: true }; changed = true;
  }
  return changed;
}
function action(g, a, now = Date.now()) {
  const l = g.live, type = a.type;
  if (g.ending) return fail('La partita è terminata');
  advance(g, now);
  if (!g.started) return fail('Avvia prima la partita');
  if (l.paused && !['resume', 'countdown:cancel', 'duel:end', 'timer:reset', 'applause:stop', 'applause:clear', 'draw:clear', 'spotlight:clear'].includes(type)) return fail('Riprendi prima la partita');
  const idle = () => g.phase === 'locked' && !l.countdown && !(l.applause && !l.applause.closed);
  switch (type) {
    case 'countdown:start':
      if (!idle()) return fail('Blocca la manche e chiudi le altre modalità prima del via');
      if (!Object.values(g.players).some(p => eligible(g, p))) return fail('Nessun partecipante idoneo connesso');
      clearRound(g); l.countdown = { id: id(), endsAt: now + 3000, remainingMs: 3000 }; break;
    case 'countdown:cancel':
      if (!l.countdown) return fail('Nessun conto alla rovescia da annullare');
      l.countdown = null; g.phase = 'locked'; break;
    case 'duel:start': {
      if (!idle()) return fail('Blocca la manche prima del duello');
      const ids = Array.isArray(a.ids) ? [...new Set(a.ids)] : [];
      if (ids.length !== 2 || ids.some(pid => !g.players[pid] || g.players[pid].st !== 'ok' || !g.players[pid].sid)) return fail('Scegli due partecipanti connessi');
      clearRound(g); l.duel = ids; break;
    }
    case 'duel:end':
      if (l.applause && !l.applause.closed) return fail('Chiudi prima l’applausometro');
      clearRound(g); l.duel = []; break;
    case 'draw': {
      if (!idle()) return fail('Blocca la manche prima dell’estrazione');
      const pool = Object.values(g.players).filter(p => eligible(g, p) && (!a.excludeDrawn || !l.drawn.includes(p.id)));
      if (!pool.length) return fail('Nessun partecipante da estrarre: azzera il giro');
      const p = pool[crypto.randomInt(pool.length)];
      l.draw = { id: id(), pid: p.id, nick: p.nick, at: now }; if (!l.drawn.includes(p.id)) l.drawn.push(p.id); break;
    }
    case 'draw:reset': l.drawn = []; l.draw = null; break;
    case 'draw:clear': l.draw = null; break;
    case 'timer:start': {
      if (g.phase !== 'answering' || !g.ans || l.countdown || (l.applause && !l.applause.closed)) return fail('Il timer richiede una prenotazione accettata');
      const seconds = Number(a.seconds);
      if (![10, 20, 30].includes(seconds)) return fail('Scegli 10, 20 o 30 secondi');
      const durationMs = seconds * 1000;
      l.timer = { id: id(), pid: g.ans, status: 'running', endsAt: now + durationMs, remainingMs: durationMs, durationMs }; break;
    }
    case 'timer:pause':
      if (l.timer?.status !== 'running') return fail('Nessun timer in corso');
      l.timer = { ...l.timer, status: 'paused', remainingMs: remaining(l.timer, now), endsAt: null }; break;
    case 'timer:resume':
      if (l.timer?.status !== 'paused' || l.timer.pid !== g.ans) return fail('Nessun timer da riprendere');
      l.timer = { ...l.timer, status: 'running', endsAt: now + l.timer.remainingMs }; break;
    case 'timer:reset': l.timer = null; break;
    case 'applause:start':
      if (!idle() || l.duel.length) return fail('Blocca la manche e termina il duello prima dell’applausometro');
      l.applause = { id: id(), endsAt: now + 8000, remainingMs: 8000, counts: Object.fromEntries(REACTIONS.map(v => [v, 0])), closed: false }; break;
    case 'applause:stop':
      if (l.applause) l.applause = { ...l.applause, closed: true, endsAt: null, remainingMs: 0 }; break;
    case 'applause:clear': l.applause = null; break;
    case 'pause':
      if (l.paused) return ok();
      l.paused = true;
      for (const item of [l.countdown, l.timer?.status === 'running' ? l.timer : null, l.applause && !l.applause.closed ? l.applause : null]) {
        if (item) { item.remainingMs = remaining(item, now); item.endsAt = null; }
      }
      break;
    case 'resume':
      if (!l.paused) return ok();
      l.paused = false;
      for (const item of [l.countdown, l.timer?.status === 'running' ? l.timer : null, l.applause && !l.applause.closed ? l.applause : null]) {
        if (item) item.endsAt = now + item.remainingMs;
      }
      break;
    case 'spotlight': {
      const p = g.players[a.pid];
      if (!p || p.st !== 'ok' || !p.sid) return fail('Partecipante non connesso');
      l.spotlight = { id: id(), pid: p.id, endsAt: now + 6000 }; break;
    }
    case 'spotlight:clear': l.spotlight = null; break;
    default: return fail('Comando non valido');
  }
  return ok({ live: view(g, now) });
}
function mode(g, p) {
  if (p.st === 'pending') return 'pending';
  if (!g.started) return 'lobby';
  if (g.live.paused) return 'paused';
  if (g.live.duel.length && !g.live.duel.includes(p.id)) return 'spectator';
  if (g.live.countdown) return 'countdown';
  if (g.phase === 'locked' || g.ending || (g.live.applause && !g.live.applause.closed)) return 'locked';
  if (g.ans === p.id) return 'answering';
  if (g.answered.has(p.id)) return 'waiting';
  if (g.order.some(o => o.id === p.id)) return 'queued';
  return 'open';
}
module.exports = { init, view, clearRound, advance, action, mode, eligible, REACTIONS, SOUNDS, MESSAGES, id, fail, ok };
