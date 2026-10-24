const express = require('express'), http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { Server } = require('socket.io'), QR = require('qrcode');

const app = express(), srv = http.createServer(app);
const io = new Server(srv, { maxHttpBufferSize: 3e6 });
const PUB = path.join(__dirname, 'public');
app.use(express.static(PUB));

// Elenco file delle cartelle: aggiungi immagini e ricarica, nessun codice da toccare
const ls = (d, re) => { try { return fs.readdirSync(path.join(PUB, d)).filter(f => re.test(f)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })); } catch { return []; } };
const IMG = /\.(png|jpe?g|gif|webp|svg)$/i;
app.get('/api/anims', (q, r) => r.json(ls('assets/anim', IMG)));
app.get('/api/slides', (q, r) => r.json(ls('slides', IMG)));

const games = {};
const rid = n => crypto.randomBytes(n).toString('hex');
const mkCode = () => { let c; do c = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[crypto.randomInt(24)]).join(''); while (games[c]); return c; };

// phase: locked | open | answering   (ans = id di chi sta rispondendo)
const newGame = () => ({
  code: mkCode(), key: rid(4).toUpperCase(), players: {}, banned: [], phase: 'locked', ans: null,
  answered: new Set(), order: [], done: false, slide: null, chat: [], last: Date.now(),
  set: { approve: false, joinOpen: true, chat: true, pts: 1 }
});

const pub = p => ({ id: p.id, nick: p.nick, avatar: p.avatar, score: p.score, on: !!p.sid, st: p.st });
const elig = g => Object.values(g.players).some(p => p.st === 'ok' && p.sid && !g.answered.has(p.id));
const after = g => { if (elig(g)) g.phase = 'open'; else { g.phase = 'locked'; g.done = true; } };
const mode = (g, p) => p.st === 'pending' ? 'pending' : g.phase === 'locked' ? 'locked'
  : g.phase === 'answering' ? (g.ans === p.id ? 'answering' : 'waiting') : (g.answered.has(p.id) ? 'waiting' : 'open');

function sync(g) {
  g.last = Date.now();
  io.to('H' + g.code).emit('state', {
    code: g.code, phase: g.phase, ans: g.ans, order: g.order, answered: [...g.answered], slide: g.slide,
    set: g.set, players: Object.values(g.players).map(pub), banned: g.banned
  });
  const who = g.players[g.ans]?.nick || '';
  for (const p of Object.values(g.players)) if (p.sid)
    io.to(p.sid).emit('me', { id: p.id, mode: mode(g, p), score: p.score, nick: p.nick, avatar: p.avatar, who: g.ans === p.id ? '' : who, chat: g.set.chat });
}

function drop(g, id, ban) {
  const p = g.players[id]; if (!p) return;
  if (ban) g.banned.push({ id: p.id, nick: p.nick });
  if (p.sid) io.to(p.sid).emit(ban ? 'banned' : 'kicked');
  delete g.players[id]; g.answered.delete(id);
  if (g.ans === id) { g.ans = null; after(g); }
}

io.on('connection', s => {
  s.data = {};
  const G = () => s.data.host && games[s.data.code];
  const info = async (g, origin) => {
    const url = `${origin || ''}/player.html?c=${g.code}`;
    return { code: g.code, key: g.key, url, qr: await QR.toDataURL(url, { margin: 1, width: 400 }), hist: g.chat };
  };

  // ---------- HOST ----------
  s.on('host:create', async (d, cb) => {
    if (typeof cb !== 'function') return;
    const g = newGame(); games[g.code] = g;
    s.data = { host: true, code: g.code }; s.join('H' + g.code);
    cb(await info(g, d && d.origin)); sync(g);
  });
  s.on('host:join', async (d, cb) => {
    if (typeof cb !== 'function') return; d = d || {};
    const g = games[String(d.code || '').toUpperCase()];
    if (!g || g.key !== String(d.key || '').trim().toUpperCase()) return cb({ err: 'Codice o chiave host non validi' });
    s.data = { host: true, code: g.code }; s.join('H' + g.code);
    cb(await info(g, d.origin)); sync(g);
  });

  s.on('act', a => {
    const g = G(); if (!g || !a) return;
    const P = g.players[a.id];
    switch (a.type) {
      case 'open':
        if (g.phase !== 'locked') break;
        if (g.done) { g.answered.clear(); g.order = []; g.done = false; }
        if (elig(g)) g.phase = 'open';
        break;
      case 'lock': if (g.phase !== 'locked') { g.phase = 'locked'; g.ans = null; } break;
      case 'correct':
        if (g.phase === 'answering' && g.players[g.ans]) { g.players[g.ans].score += g.set.pts; g.ans = null; g.phase = 'locked'; g.done = true; }
        break;
      case 'wrong':
        if (g.phase === 'answering' && g.ans) { g.answered.add(g.ans); g.ans = null; after(g); }
        break;
      case 'newround': g.phase = 'locked'; g.ans = null; g.answered.clear(); g.order = []; g.done = false; break;
      case 'pts': if (P) P.score += Math.max(-99, Math.min(99, Number(a.v) || 0)); break;
      case 'kick': case 'reject': drop(g, a.id, false); break;
      case 'ban': drop(g, a.id, true); break;
      case 'unban': g.banned = g.banned.filter(b => b.id !== a.id); break;
      case 'approve': if (P) P.st = 'ok'; break;
      case 'set':
        if (['approve', 'joinOpen', 'chat'].includes(a.key)) g.set[a.key] = !!a.v;
        if (a.key === 'pts') g.set.pts = Math.max(1, Math.min(10, parseInt(a.v) || 1));
        break;
      case 'slide': g.slide = a.name && ls('slides', IMG).includes(a.name) ? a.name : null; break;
      case 'reset': Object.values(g.players).forEach(p => p.score = 0); break;
      case 'end': io.to('P' + g.code).emit('ended'); io.to('H' + g.code).emit('ended'); delete games[g.code]; return;
    }
    sync(g);
  });

  // ---------- GIOCATORI ----------
  s.on('join', (d, cb) => {
    if (typeof cb !== 'function') return; d = d || {};
    const g = games[String(d.code || '').toUpperCase()];
    if (!g) return cb({ err: 'Codice partita non trovato' });
    if (g.banned.some(b => b.id === d.pid)) return cb({ err: 'Sei stato bannato da questa partita' });
    let p = d.pid && g.players[d.pid];
    if (p && p.token === d.token) { p.sid = s.id; }
    else {
      const nick = String(d.nick || '').trim().slice(0, 16);
      if (!nick) return cb({ err: 'Scegli un nome per il gruppo' });
      if (g.banned.some(b => b.nick.toLowerCase() === nick.toLowerCase())) return cb({ err: 'Questo nome è bannato' });
      if (Object.values(g.players).some(x => x.nick.toLowerCase() === nick.toLowerCase())) return cb({ err: 'Nome già usato da un altro gruppo' });
      if (!g.set.joinOpen) return cb({ err: 'Gli ingressi sono chiusi' });
      if (typeof d.avatar !== 'string' || !d.avatar.startsWith('data:image/') || d.avatar.length > 400000) return cb({ err: 'Serve un selfie' });
      p = { id: rid(4), token: rid(12), nick, avatar: d.avatar, score: 0, st: g.set.approve ? 'pending' : 'ok', sid: s.id };
      g.players[p.id] = p;
    }
    s.data = { code: g.code, pid: p.id }; s.join('P' + g.code);
    cb({ code: g.code, pid: p.id, token: p.token, hist: g.chat }); sync(g);
  });

  s.on('buzz', () => {
    const g = games[s.data.code], p = g && g.players[s.data.pid];
    if (!p || mode(g, p) !== 'open') return;
    g.phase = 'answering'; g.ans = p.id; g.order.push({ id: p.id, t: Date.now() });
    sync(g); io.to('H' + g.code).emit('buzz');
  });

  // chat: giocatori e host
  s.on('chat', m => {
    const g = games[s.data.code]; if (!g || !m || !g.set.chat) return;
    let id = 'host', nick = 'Host';
    if (!s.data.host) { const p = g.players[s.data.pid]; if (!p || p.st !== 'ok') return; id = p.id; nick = p.nick; }
    const out = { id, nick, text: String(m.text || '').slice(0, 200), anim: ls('assets/anim', IMG).includes(m.anim) ? m.anim : null };
    if (!out.text && !out.anim) return;
    g.chat.push(out); if (g.chat.length > 40) g.chat.shift();
    io.to('P' + g.code).to('H' + g.code).emit('chat', out);
  });

  s.on('disconnect', () => {
    const g = games[s.data.code], p = g && g.players[s.data.pid];
    if (p && p.sid === s.id) { p.sid = null; sync(g); }
  });
});

// pulizia partite abbandonate (12 ore)
setInterval(() => { for (const c in games) if (Date.now() - games[c].last > 432e5) delete games[c]; }, 18e5);

srv.listen(process.env.PORT || 3000, () => console.log('Quiz in ascolto su porta', process.env.PORT || 3000));
