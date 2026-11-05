const express = require('express'), http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { Server } = require('socket.io'), QR = require('qrcode');
const liveGame = require('./lib/live-game');

const app = express(), srv = http.createServer(app);
app.set('trust proxy', 1);
app.disable('x-powered-by');

const io = new Server(srv, {
  maxHttpBufferSize: 512 * 1024,
  pingInterval: 10000,
  pingTimeout: 10000
  // Rejoin from current snapshots; never replay old private effects or audio packets.
});
const PUB = path.join(__dirname, 'public');

// Security headers
app.use((q, r, next) => {
  r.setHeader('X-Content-Type-Options', 'nosniff');
  r.setHeader('X-Frame-Options', 'DENY');
  next();
});

// Routing
app.get('/', (q, r) => r.redirect('/player.html'));
app.get('/host', (q, r) => r.redirect('/host.html'));
app.get('/tv', (q, r) => r.redirect('/tv.html'));
app.get('/healthz', (q, r) => r.json({ ok: true, games: Object.keys(games).length, uptime: process.uptime() }));

// Endpoint avatar ottimizzato con cache HTTP (T-02)
app.get('/avatar/:code/:pid', (q, r) => {
  const g = games[String(q.params.code).toUpperCase()];
  const p = g && g.players[q.params.pid];
  if (!p || !p.avatarData) return r.status(404).send('Not found');
  r.setHeader('Cache-Control', 'public, max-age=86400, immutable');
  if (p.avatarData.startsWith('data:image/svg+xml')) {
    const svg = decodeURIComponent(p.avatarData.split(',')[1]);
    r.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    return r.send(svg);
  } else if (p.avatarData.startsWith('data:image/')) {
    const parts = p.avatarData.split(',');
    const mime = parts[0].match(/:(.*?);/)[1];
    const buf = Buffer.from(parts[1], 'base64');
    r.setHeader('Content-Type', mime);
    return r.send(buf);
  }
  r.status(404).send('Not found');
});

app.use(express.static(PUB, {
  maxAge: '1h',
  setHeaders(res, filePath) {
    // Revalidate the app shell after deployments; keep media files cached.
    if (/\.(html|css|js)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// Elenco degli adesivi chat
const ls = (d, re) => { try { return fs.readdirSync(path.join(PUB, d)).filter(f => re.test(f)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })); } catch { return []; } };
const IMG = /\.(png|jpe?g|gif|webp|svg)$/i;

let stickerCache = null;
let stickerCacheTime = 0;
function getStickers() {
  const now = Date.now();
  if (!stickerCache || now - stickerCacheTime > 60000) {
    stickerCache = ls('assets/anim', IMG);
    stickerCacheTime = now;
  }
  return stickerCache;
}

app.get('/api/anims', (q, r) => r.json(getStickers()));

// Suoni personalizzati
const AUD = /\.(mp3|wav|ogg|m4a|aac)$/i;
app.get('/api/sounds', (q, r) => {
  const o = {};
  for (const f of ls('sounds', AUD)) { const k = f.split('.')[0].toLowerCase(); if (['buzzer', 'giusto', 'sbagliato'].includes(k) && !o[k]) o[k] = 'sounds/' + encodeURIComponent(f); }
  r.set('Cache-Control', 'no-store').json(o);
});

// Parola chiave per creare una stanza
let HOST_PASS;
if (process.env.HOST_PASS) {
  HOST_PASS = String(process.env.HOST_PASS).toUpperCase();
} else {
  HOST_PASS = 'KJB';
}

const fails = {};
const ipOf = s => s.handshake.address;
const passCheck = (s, v) => {
  const f = fails[ipOf(s)] || (fails[ipOf(s)] = { n: 0, until: 0 });
  if (Date.now() < f.until) return 'wait';
  if (String(v || '').trim().toUpperCase() === HOST_PASS) { f.n = 0; return 'ok'; }
  if (++f.n >= 5) { f.n = 0; f.until = Date.now() + 6e4; }
  return 'no';
};

// Rate limiter generico per IP
const rateLimit = {};
function checkRate(ip, key, max, windowMs) {
  const k = ip + ':' + key;
  const now = Date.now();
  const r = rateLimit[k] || (rateLimit[k] = { n: 0, start: now });
  if (now - r.start > windowMs) { r.n = 0; r.start = now; }
  if (++r.n > max) return false;
  return true;
}

// Normalizzazione nomi
const normNick = raw => raw.normalize('NFKC').replace(/[\u200B-\u200F\u2028-\u202F\u2060-\u2069\uFEFF\u00AD]/g, '').trim().slice(0, 16);

// Avatar di ripiego
const xml = t => t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const letterAvatar = nick => {
  const ch = (Array.from(nick)[0] || '?').toUpperCase(), bgs = ['#ffe500', '#ff2fa0', '#00c9b7', '#fffdf5'];
  let h = 0; for (const c of nick) h = (h * 31 + c.codePointAt(0)) >>> 0;
  const bg = bgs[h % bgs.length], fg = bg === '#ff2fa0' ? '#ffffff' : '#000000';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${bg}"/><text x="50" y="72" text-anchor="middle" font-family="Impact,Arial Black,sans-serif" font-weight="900" font-size="64" fill="${fg}">${xml(ch)}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
};
const IMG_URI = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/]+=*$/;

const games = Object.create(null);
const rid = n => crypto.randomBytes(n).toString('hex');
const mkCode = () => { let c; do c = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[crypto.randomInt(24)]).join(''); while (games[c]); return c; };

// phase: locked | open | answering   (ans = id di chi sta rispondendo)
const newGame = (creatorIp) => ({
  code: mkCode(), key: rid(4).toUpperCase(), players: Object.create(null), banned: [], phase: 'locked', ans: null, started: false,
  answered: new Set(), order: [], done: false, chat: [], last: Date.now(),
  set: { approve: false, joinOpen: true, chat: true, pts: 1, autoReopen: true },
  creatorIp, undo: [], live: liveGame.init(), ending: false
});

const pub = p => ({ id: p.id, nick: p.nick, avatar: p.avatar, score: p.score, on: !!p.sid, st: p.st });
const elig = g => Object.values(g.players).some(p => liveGame.eligible(g, p) && !g.answered.has(p.id) && !g.order.some(o => o.id === p.id));
const after = g => {
  if (g.set.autoReopen && elig(g)) g.phase = 'open';
  else { g.phase = 'locked'; if (!elig(g)) g.done = true; }
};
const mode = liveGame.mode;

// Snapshot per Annulla (T-09)
function pushUndo(g) {
  g.undo = g.undo || [];
  g.undo.push({
    phase: g.phase,
    ans: g.ans,
    answered: [...g.answered],
    order: [...g.order],
    done: g.done,
    roundId: g.live.roundId,
    scores: Object.fromEntries(Object.values(g.players).map(p => [p.id, p.score]))
  });
  if (g.undo.length > 10) g.undo.shift();
}

// Debounce sync (T-02)
const syncDebounce = {};
function sync(g) {
  if (syncDebounce[g.code]) clearTimeout(syncDebounce[g.code]);
  syncDebounce[g.code] = setTimeout(() => {
    delete syncDebounce[g.code];
    _syncNow(g);
  }, 30);
}

function _syncNow(g) {
  if (games[g.code] !== g) return;
  liveGame.advance(g);
  const live = liveGame.view(g);
  g.last = Date.now();
  const sorted = Object.values(g.players).filter(x => x.st === 'ok').sort((a, b) => b.score - a.score);
  const total = sorted.length;
  io.to('H' + g.code).emit('state', {
    code: g.code, started: g.started, phase: g.phase, ans: g.ans, order: g.order, answered: [...g.answered],
    live, set: g.set, players: Object.values(g.players).map(pub), banned: g.banned
  });
  const who = g.players[g.ans]?.nick || '';
  for (const p of Object.values(g.players)) {
    if (p.sid) {
      const rank = sorted.findIndex(x => x.id === p.id) + 1;
      io.to(p.sid).emit('me', {
        id: p.id, mode: mode(g, p), score: p.score, nick: p.nick, avatar: p.avatar,
        who: g.ans === p.id ? '' : who, chat: g.set.chat, rank, total, live,
        queued: g.order.some(o => o.id === p.id), position: g.order.findIndex(o => o.id === p.id) + 1,
        presence: p.presence || null
      });
    }
  }
}

function drop(g, id, ban) {
  const p = g.players[id]; if (!p) return;
  if (ban) g.banned.push({ id: p.id, nick: p.nick });
  if (p.sid) io.to(p.sid).emit(ban ? 'banned' : 'kicked');
  if (p.sid) { const socket = io.sockets.sockets.get(p.sid); if (socket) { socket.leave('P' + g.code); socket.data = {}; } }
  delete g.players[id]; g.answered.delete(id);
  g.order = g.order.filter(o => o.id !== id);
  if (g.live.spotlight?.pid === id) g.live.spotlight = null;
  if (g.live.timer?.pid === id) g.live.timer = null;
  if (g.live.duel.includes(id)) { g.live.duel = []; liveGame.clearRound(g); }
  if (g.ans === id) {
    const next = g.order.find(o => !g.answered.has(o.id) && liveGame.eligible(g, g.players[o.id]));
    g.live.timer = null;
    if (next) {
      g.ans = next.id; g.phase = 'answering';
      io.to('H' + g.code).emit('buzz', { id: rid(8), roundId: g.live.roundId });
    } else { g.ans = null; after(g); }
  }
}

const reserved = ['host', 'admin', 'moderatore', 'sistema'];

io.on('connection', s => {
  s.data = {};
  const G = () => s.data.host && games[s.data.code];
  const info = async (g, origin, host = true) => {
    const url = `${origin || ''}/player.html?c=${g.code}`;
    return { code: g.code, ...(host ? { key: g.key } : {}), url, qr: await QR.toDataURL(url, { margin: 1, width: 400 }), hist: g.chat, final: g.final || null };
  };

  const leaveIdentity = () => {
    const previous = games[s.data.code], player = previous && previous.players[s.data.pid];
    if (player?.sid === s.id) { player.sid = null; sync(previous); }
    if (s.data.code) { s.leave('H' + s.data.code); s.leave('P' + s.data.code); }
    s.data = {};
  };
  const playerIdentity = () => {
    const g = games[s.data.code], p = g && g.players[s.data.pid];
    return p && p.sid === s.id && p.st === 'ok' ? { g, p } : {};
  };
  const answer = (cb, result) => { if (typeof cb === 'function') cb(result); };
  const request = (event, d, cb, fn) => {
    d = d && typeof d === 'object' ? d : {};
    const cache = s.data.requests || (s.data.requests = new Map());
    const requestId = typeof d.requestId === 'string' ? d.requestId.slice(0, 80) : '';
    const key = event + ':' + requestId;
    if (requestId && cache.has(key)) return answer(cb, cache.get(key));
    let result;
    try { result = fn(d); } catch { result = liveGame.fail('Richiesta non valida'); }
    if (requestId) { cache.set(key, result); if (cache.size > 100) cache.delete(cache.keys().next().value); }
    answer(cb, result);
  };

  // ---------- HOST ----------
  s.on('host:create', async (d, cb) => {
    if (typeof cb !== 'function') return;
    const ip = ipOf(s);
    if (!checkRate(ip, 'host:create', 5, 60000)) return cb({ err: 'Troppe stanze create, riprova tra un minuto' });
    const pc = passCheck(s, d && d.pass);
    if (pc !== 'ok') return cb({ err: pc === 'wait' ? 'Troppi tentativi, riprova tra un minuto' : 'Parola chiave errata' });
    const roomCount = Object.values(games).filter(g => g.creatorIp === ip).length;
    if (roomCount >= 3) return cb({ err: 'Troppe stanze create. Chiudi una stanza prima di crearne una nuova.' });
    const g = newGame(ip); games[g.code] = g;
    leaveIdentity();
    s.data = { host: true, code: g.code }; s.join('H' + g.code);
    cb(await info(g, d && d.origin)); sync(g);
  });

  s.on('host:join', async (d, cb) => {
    if (typeof cb !== 'function') return; d = d || {};
    const ip = ipOf(s);
    if (!checkRate(ip, 'host:join', 10, 60000)) return cb({ err: 'Troppi tentativi, riprova tra un minuto' });
    const g = games[String(d.code || '').toUpperCase()];
    if (!g || g.key !== String(d.key || '').trim().toUpperCase()) return cb({ err: 'Codice o chiave host non validi' });
    leaveIdentity();
    s.data = { host: true, code: g.code }; s.join('H' + g.code);
    cb(await info(g, d.origin)); sync(g);
  });

  // ---------- TV / PROIETTORE ----------
  s.on('tv:join', async (d, cb) => {
    if (typeof cb !== 'function') return;
    const g = games[String(d && d.code || '').toUpperCase()];
    if (!g) return cb({ err: 'Codice partita non trovato' });
    leaveIdentity();
    s.data = { tv: true, code: g.code };
    s.join('H' + g.code);
    cb(await info(g, d && d.origin, false));
    sync(g);
  });

  s.on('act', a => {
    const g = G(); if (!g || !a || typeof a !== 'object' || g.ending) return;
    liveGame.advance(g);
    if ((g.live.paused || g.live.countdown || (g.live.applause && !g.live.applause.closed)) && !['kick', 'ban', 'reject', 'approve', 'unban', 'set', 'end', 'newround'].includes(a.type)) return;
    const P = g.players[a.id];
    switch (a.type) {
      case 'start': g.started = true; break;
      case 'open':
        if (g.phase !== 'locked' || !g.started) break;
        if (g.done) liveGame.clearRound(g);
        if (elig(g)) g.phase = 'open';
        break;
      case 'lock': if (g.phase !== 'locked') { g.phase = 'locked'; g.ans = null; g.live.timer = null; } break;
      case 'correct':
        if (g.phase === 'answering' && g.players[g.ans]) {
          pushUndo(g);
          g.players[g.ans].score += g.set.pts;
          g.ans = null;
          g.phase = 'locked';
          g.done = true;
          g.live.timer = null;
          io.to('H' + g.code).emit('sfx', { id: rid(8), roundId: g.live.roundId, name: 'giusto' });
        }
        break;
      case 'wrong':
        if (g.phase === 'answering' && g.ans) {
          pushUndo(g);
          g.live.timer = null;
          g.answered.add(g.ans);
          const next = g.order.find(o => !g.answered.has(o.id) && o.id !== g.ans && g.players[o.id]?.sid);
          if (next) {
            g.ans = next.id;
            g.phase = 'answering';
            io.to('H' + g.code).emit('buzz', { id: rid(8), roundId: g.live.roundId });
          } else {
            g.ans = null;
            after(g);
          }
          io.to('H' + g.code).emit('sfx', { id: rid(8), roundId: g.live.roundId, name: 'sbagliato' });
        }
        break;
      case 'undo':
        if (g.undo && g.undo.length) {
          const snap = g.undo.pop();
          if (snap.roundId !== g.live.roundId) break;
          g.live.timer = null;
          g.phase = snap.phase;
          g.ans = snap.ans;
          g.answered = new Set(snap.answered);
          g.order = snap.order;
          g.done = snap.done;
          for (const [id, sc] of Object.entries(snap.scores)) {
            if (g.players[id]) g.players[id].score = sc;
          }
        }
        break;
      case 'newround': g.live.paused = false; liveGame.clearRound(g); break;
      case 'pts':
        if (P) {
          pushUndo(g);
          P.score += Math.max(-99, Math.min(99, Number(a.v) || 0));
        }
        break;
      case 'kick': case 'reject': drop(g, a.id, false); break;
      case 'ban': drop(g, a.id, true); break;
      case 'unban': g.banned = g.banned.filter(b => b.id !== a.id); break;
      case 'approve': if (P) P.st = 'ok'; break;
      case 'set':
        if (['approve', 'joinOpen', 'chat', 'autoReopen'].includes(a.key)) g.set[a.key] = !!a.v;
        if (a.key === 'pts') g.set.pts = Math.max(1, Math.min(10, parseInt(a.v) || 1));
        break;
      case 'reset':
        pushUndo(g);
        Object.values(g.players).forEach(p => p.score = 0);
        break;
      case 'end': {
        g.ending = true; g.phase = 'locked'; g.live.paused = false;
        g.live.countdown = null; g.live.timer = null; g.live.applause = null;
        const sorted = Object.values(g.players).filter(x => x.st === 'ok').sort((a, b) => b.score - a.score);
        const final = sorted.map((p, i) => ({ rank: i + 1, nick: p.nick, score: p.score, avatar: p.avatar }));
        g.final = final;
        sync(g);
        io.to('P' + g.code).emit('final', final);
        io.to('H' + g.code).emit('final', final);
        setTimeout(() => {
          io.to('P' + g.code).emit('ended');
          io.to('H' + g.code).emit('ended');
          delete games[g.code];
        }, 12000);
        return;
      }
    }
    sync(g);
  });

  // ---------- GIOCATORI ----------
  s.on('join', (d, cb) => {
    if (typeof cb !== 'function') return; d = d || {};
    const ip = ipOf(s);
    if (!checkRate(ip, 'join', 15, 60000)) return cb({ err: 'Troppi tentativi, riprova tra un minuto' });
    const g = games[String(d.code || '').toUpperCase()];
    if (!g) return cb({ err: 'Codice partita non trovato' });
    if (g.ending) return cb({ err: 'La partita è terminata' });
    if (g.banned.some(b => b.id === d.pid)) return cb({ err: 'Sei stato bannato da questa partita' });
    let p = d.pid && g.players[d.pid];
    if (p && p.token !== d.token) return cb({ err: 'Credenziali non valide: chiedi all’host di liberare il posto' });
    if (p && p.token === d.token) {
      if (p.sid && p.sid !== s.id) {
        const old = io.sockets.sockets.get(p.sid);
        if (old) { old.leave('P' + g.code); old.data = {}; old.emit('session:replaced'); }
      }
    }
    else {
      // Idempotenza per stesso socket
      if (!p) {
        const existing = Object.values(g.players).find(x => x.sid === s.id);
        if (existing) { p = existing; }
      }
      if (!p) {
        const nick = normNick(String(d.nick || ''));
        if (!nick) return cb({ err: 'Scegli un nome per il gruppo' });
        if (reserved.includes(nick.toLowerCase())) return cb({ err: 'Questo nome è riservato' });
        if (g.banned.some(b => b.nick.toLowerCase() === nick.toLowerCase())) return cb({ err: 'Questo nome è bannato' });
        if (Object.values(g.players).some(x => x.nick.toLowerCase() === nick.toLowerCase())) return cb({ err: 'Nome già usato da un altro gruppo (chiedi all’host di liberarlo se ti sei disconnesso)' });
        if (!g.set.joinOpen) return cb({ err: 'Gli ingressi sono chiusi' });
        let avatarData = d.avatar;
        if (avatarData) {
          if (typeof avatarData !== 'string' || avatarData.length > 400000 || !IMG_URI.test(avatarData)) return cb({ err: 'Immagine non valida, riprova o entra senza' });
          if (avatarData.length > 140000) return cb({ err: 'Immagine troppo grande, riprova con una foto più piccola' });
        } else {
          avatarData = letterAvatar(nick);
        }
        const pid = rid(4);
        p = {
          id: pid,
          token: rid(12),
          nick,
          avatarData,
          avatar: `/avatar/${g.code}/${pid}`,
          score: 0,
          st: g.set.approve ? 'pending' : 'ok',
          sid: s.id
        };
        g.players[p.id] = p;
      }
    }
    leaveIdentity();
    p.sid = s.id;
    s.data = { code: g.code, pid: p.id }; s.join('P' + g.code);
    cb({ code: g.code, pid: p.id, token: p.token, hist: g.chat }); sync(g);
  });

  // A press is acknowledged independently of the host sound. Server order never waits on effects.
  s.on('buzz', (d, cb) => {
    if (typeof d === 'function') { cb = d; d = {}; }
    request('buzz', d, cb, input => {
      const { g, p } = playerIdentity();
      if (!g || !p) return liveGame.fail('Non sei connesso alla stanza');
      if (liveGame.advance(g)) sync(g);
      if (input.roundId && input.roundId !== g.live.roundId) return liveGame.fail('Questa manche è terminata');
      if (!g.started || g.ending || g.live.paused || g.live.countdown || g.phase === 'locked' || (g.live.applause && !g.live.applause.closed)) return liveGame.fail(g.live.paused ? 'Partita in pausa' : 'Le prenotazioni sono chiuse');
      if (!liveGame.eligible(g, p)) return liveGame.fail('In questo duello sei spettatore');
      if (g.answered.has(p.id) || g.order.some(o => o.id === p.id)) return liveGame.fail('Hai già prenotato in questa manche');
      const eventId = rid(8);
      g.order.push({ id: p.id, t: Date.now(), eventId });
      if (!g.ans) {
        g.phase = 'answering'; g.ans = p.id;
        io.to('H' + g.code).emit('buzz', { id: eventId, roundId: g.live.roundId });
      }
      sync(g);
      return liveGame.ok({ roundId: g.live.roundId, position: g.order.length, eventId });
    });
  });

  s.on('live:act', (d, cb) => request('live:act', d, cb, input => {
    const g = G(); if (!g) return liveGame.fail('Comando riservato all’host');
    if (liveGame.advance(g)) sync(g);
    if (!checkRate(s.id, 'live', 30, 1000)) return liveGame.fail('Troppi comandi, attendi un momento');
    const result = liveGame.action(g, input); if (result.ok) sync(g); return result;
  }));

  s.on('host:effect', (d, cb) => request('host:effect', d, cb, input => {
    const g = G(); if (!g || g.ending) return liveGame.fail('Comando riservato all’host');
    const p = g.players[input.pid];
    if (!p || p.st !== 'ok' || !p.sid) return liveGame.fail('Il destinatario non è connesso');
    if (!['reaction', 'sound', 'message', 'presence'].includes(input.kind)) return liveGame.fail('Effetto non valido');
    if (input.kind === 'reaction' && !liveGame.REACTIONS.includes(input.value)) return liveGame.fail('Reazione non valida');
    if (input.kind === 'sound' && !liveGame.SOUNDS.includes(input.value)) return liveGame.fail('Suono non valido');
    if (input.kind === 'message' && !liveGame.MESSAGES.includes(input.value)) return liveGame.fail('Messaggio non valido');
    const now = Date.now();
    if (p.effectAfter > now || (input.kind === 'sound' && p.soundAfter > now)) return liveGame.fail('Attendi prima di inviare un altro effetto a questa squadra');
    if (!checkRate(g.code, 'effect', 12, 5000)) return liveGame.fail('Troppi effetti nella stanza, attendi');
    const effect = { id: rid(8), roundId: g.live.roundId, kind: input.kind, value: input.kind === 'presence' ? 'Ci sei?' : input.value, expiresAt: now + (input.kind === 'presence' ? 15000 : 4000), pid: p.id };
    p.effectAfter = now + 700;
    if (input.kind === 'sound') p.soundAfter = now + 3000;
    if (input.kind === 'presence') { p.presence = { id: effect.id, expiresAt: effect.expiresAt }; sync(g); }
    io.to(p.sid).emit('effect', effect);
    return liveGame.ok({ id: effect.id });
  }));

  s.on('presence:reply', (d, cb) => request('presence:reply', d, cb, input => {
    const { g, p } = playerIdentity();
    if (!p || !p.presence || p.presence.id !== input.id || p.presence.expiresAt < Date.now()) return liveGame.fail('Richiesta di presenza scaduta');
    const confirmation = { id: input.id, pid: p.id, nick: p.nick };
    p.presence = null; sync(g);
    // TV clients must not receive these private confirmations.
    for (const socket of io.sockets.sockets.values()) if (socket.data.host && socket.data.code === g.code) socket.emit('presence:confirmed', confirmation);
    return liveGame.ok();
  }));

  s.on('applause:react', (d, cb) => request('applause:react', d, cb, input => {
    const { g, p } = playerIdentity();
    if (!p) return liveGame.fail('Non sei connesso alla stanza');
    if (liveGame.advance(g)) sync(g);
    const a = g.live.applause;
    if (g.live.paused || !a || a.closed || a.id !== input.id) return liveGame.fail('L’applausometro è chiuso');
    if (!liveGame.REACTIONS.includes(input.value)) return liveGame.fail('Reazione non valida');
    const now = Date.now();
    if (p.applauseAfter > now) return liveGame.fail('Un applauso alla volta');
    p.applauseAfter = now + 650;
    a.counts[input.value]++; sync(g); return liveGame.ok();
  }));

  // chat: giocatori e host
  s.on('chat', m => {
    const now = Date.now();
    if (s.data._lastChat && now - s.data._lastChat < 1000) return;
    s.data._lastChat = now;
    const g = games[s.data.code]; if (!g || !m || !g.set.chat || g.ending) return;
    let id = 'host', nick = 'Host';
    if (!s.data.host) { const p = g.players[s.data.pid]; if (!p || p.st !== 'ok' || p.sid !== s.id) return; id = p.id; nick = p.nick; }
    const out = { id, nick, text: String(m.text || '').slice(0, 200), anim: getStickers().includes(m.anim) ? m.anim : null };
    if (!out.text && !out.anim) return;
    g.chat.push(out); if (g.chat.length > 40) g.chat.shift();
    io.to('P' + g.code).to('H' + g.code).emit('chat', out);
  });

  s.on('disconnect', () => {
    const g = games[s.data.code], p = g && g.players[s.data.pid];
    if (p && p.sid === s.id) { p.sid = null; sync(g); }
  });
});

setInterval(() => {
  for (const g of Object.values(games)) if (liveGame.advance(g)) sync(g);
}, 50).unref();

// pulizia partite abbandonate (12 ore)
setInterval(() => { for (const c in games) if (Date.now() - games[c].last > 432e5) delete games[c]; }, 18e5);

// pulizia mappe fails e rateLimit (ogni 10 minuti)
setInterval(() => {
  const now = Date.now();
  for (const k in fails) if (now > fails[k].until + 120000) delete fails[k];
  for (const k in rateLimit) if (now - rateLimit[k].start > 120000) delete rateLimit[k];
}, 600000);

// Optional isolated add-on: no access to the quiz rooms or events.
if (process.env.AFTERPARTY_ENABLED !== 'false') {
  require('./plugins/afterparty')(io, { password: HOST_PASS });
  app.get('/afterparty/qr/:code', async (req, res) => {
    if (!/^[A-F0-9]{6}$/.test(req.params.code)) return res.sendStatus(400);
    try {
      const url = `${req.protocol}://${req.get('host')}/afterparty/?c=${req.params.code}`;
      res.type('png').send(await QR.toBuffer(url, { width: 240, margin: 2 }));
    } catch { res.sendStatus(500); }
  });
}

srv.listen(process.env.PORT || 3000, () => console.log('Quiz in ascolto su porta', process.env.PORT || 3000));
