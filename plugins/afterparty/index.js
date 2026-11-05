'use strict';
const { Afterparty, clean } = require('./engine');
module.exports = function mountAfterparty(io, { password }) {
  const game = new Afterparty();
  const ns = io.of('/afterparty');
  const limits = new Map();
  function limit(key, max, windowMs) {
    const now = Date.now(); let bucket = limits.get(key);
    if (!bucket || now > bucket.until) { bucket = { n: 0, until: now + windowMs }; limits.set(key, bucket); }
    if (++bucket.n > max) throw new Error('Pausa tecnica: troppi tentativi. Riprova tra poco.');
  }
  function publish(code) {
    const room = game.rooms.get(code);
    const members = [...ns.sockets.values()].filter(socket => socket.data.ap?.code === code);
    const online = new Set(members.map(socket => socket.data.ap.pid));
    for (const socket of members) {
      if (!room) { socket.emit('expired'); socket.data.ap = null; continue; }
      try {
        const state = game.view(room, socket.data.ap.token);
        state.players = state.players.map(p => ({ ...p, online: online.has(p.id) }));
        socket.emit('state', state);
      } catch { socket.emit('expired'); socket.data.ap = null; }
    }
  }
  ns.on('connection', socket => {
    const ip = socket.handshake.address;
    const bind = (room, token, pid) => { const previous = socket.data.ap?.code; socket.data.ap = { code: room.code, token, pid }; if (previous && previous !== room.code) publish(previous); };
    function action(event, handler) {
      socket.on(event, (data, ack) => {
        if (typeof ack !== 'function') return;
        try {
          limit(socket.id, 40, 10000);
          const result = handler(data && typeof data === 'object' ? data : {});
          ack({ ok: true, ...result });
          if (socket.data.ap) publish(socket.data.ap.code);
        } catch (error) { ack({ ok: false, error: error.message }); }
      });
    }
    action('create', data => {
      limit(ip + ':create', 10, 60000);
      if (clean(data.password, 200).toUpperCase() !== password) throw new Error('Parola chiave host errata.');
      const room = game.create(); bind(room, room.host, null); return { code: room.code, token: room.host };
    });
    action('join', data => {
      limit(ip + ':join', 40, 60000);
      const room = game.room(data.code); const p = game.join(room, data.name); bind(room, p.token, p.id); return { code: room.code, token: p.token };
    });
    action('resume', data => {
      const room = game.room(data.code), me = game.identity(room, data.token); bind(room, data.token, me.id || null); return {};
    });
    action('leave', () => {
      const previous = socket.data.ap;
      socket.data.ap = null;
      if (previous) {
        const room = game.rooms.get(previous.code);
        // A player can free their seat before the match; active scores stay intact.
        if (room?.phase === 'lobby' && previous.pid) room.players = room.players.filter(p => p.id !== previous.pid);
        publish(previous.code);
      }
      return {};
    });
    action('remove', data => {
      if (!socket.data.ap) throw new Error('Entra prima in una stanza.');
      const { code, token } = socket.data.ap;
      const room = game.room(code);
      if (!game.identity(room, token).host || room.phase !== 'lobby') throw new Error('Solo la regia può rimuovere squadre in attesa.');
      room.players = room.players.filter(p => p.id !== data.player);
      return {};
    });
    for (const event of ['advance', 'submit', 'vote']) action(event, data => {
      if (!socket.data.ap) throw new Error('Entra prima in una stanza.');
      const { code, token } = socket.data.ap; const room = game.room(code);
      if (event === 'advance') {
        if (data.round !== room.round || data.phase !== room.phase) throw new Error('La fase è già cambiata. Guarda lo schermo aggiornato.');
        game.advance(room, token);
      }
      if (event === 'submit') game.submit(room, token, data.text, data.round);
      if (event === 'vote') game.vote(room, token, data.option, data.round);
      return {};
    });
    socket.on('disconnect', () => { limits.delete(socket.id); if (socket.data.ap) publish(socket.data.ap.code); });
  });
  const ticker = setInterval(() => {
    for (const code of game.tick()) publish(code);
    for (const [key, value] of limits) if (Date.now() > value.until) limits.delete(key);
  }, 500);
  ticker.unref();
  return { game, close: () => clearInterval(ticker) };
};
