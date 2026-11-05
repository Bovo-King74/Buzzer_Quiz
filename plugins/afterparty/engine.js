'use strict';
const { randomBytes, randomInt, timingSafeEqual } = require('crypto');
const deck = require('./deck');
const id = () => randomBytes(18).toString('hex');
const clean = (s, max) => typeof s === 'string' ? s.normalize('NFKC').replace(/[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, max) : '';
const key = s => clean(s, 140).toLocaleLowerCase('it');
const shuffle = values => { const a = [...values]; for (let i = a.length - 1; i > 0; i--) { const j = randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fail = message => { throw new Error(message); };
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
class Afterparty {
  constructor({ now = Date.now } = {}) { this.rooms = new Map(); this.now = now; }
  create() {
    if (this.rooms.size >= 100) fail('Il dopogioco è pieno. Riprova più tardi.');
    let code; do { code = randomBytes(3).toString('hex').toUpperCase(); } while (this.rooms.has(code));
    const room = { code, host: id(), phase: 'lobby', players: [], round: 0, total: 5, deck: shuffle(deck), last: this.now(), deadline: 0, answers: {}, votes: {}, options: [], roster: [] };
    this.rooms.set(code, room); return room;
  }
  room(code) { return this.rooms.get(clean(code, 6).toUpperCase()) || fail('Stanza non trovata o scaduta.'); }
  identity(room, token) { if (equal(token, room.host)) return { host: true }; return room.players.find(p => equal(token, p.token)) || fail('Accesso scaduto. Rientra nella stanza.'); }
  join(room, name) {
    if (room.phase !== 'lobby') fail('La partita è già iniziata.');
    if (room.players.length >= 12) fail('La stanza ha già 12 squadre.');
    name = clean(name, 24); if (!name) fail('Scegli un nome per la squadra.');
    if (room.players.some(p => key(p.name) === key(name))) fail('Questo nome è già in uso.');
    const p = { id: id(), token: id(), name, score: 0 }; room.players.push(p); room.last = this.now(); return p;
  }
  advance(room, token) {
    if (!equal(token, room.host)) fail('Solo la regia può cambiare fase.');
    if (room.phase === 'lobby' || room.phase === 'reveal') {
      if (room.players.length < 2) fail('Servono almeno due squadre.');
      if (room.round >= room.total) { room.phase = 'final'; room.deadline = 0; return; }
      room.round++; room.card = room.deck[room.round - 1]; room.phase = 'write';
      room.roster = room.players.map(p => p.id); room.answers = {}; room.votes = {}; room.options = []; room.gains = {};
      room.deadline = this.now() + 60000;
    } else if (room.phase === 'write') this.ballot(room);
    else if (room.phase === 'vote') this.reveal(room);
    else fail('La partita è terminata. Crea una nuova stanza.');
    room.last = this.now();
  }
  submit(room, token, text, round) {
    const p = this.identity(room, token);
    if (room.phase !== 'write' || round !== room.round || this.now() >= room.deadline) fail('Il tempo per scrivere è finito.');
    if (!room.roster.includes(p.id)) fail('La regia non partecipa al bluff.');
    if (room.answers[p.id] !== undefined) fail('Hai già consegnato.');
    text = clean(text, 140); if (text.length < 3) fail('Scrivi almeno tre caratteri.');
    room.answers[p.id] = text;
    if (Object.keys(room.answers).length === room.roster.length) this.ballot(room);
  }
  ballot(room) {
    if (room.phase !== 'write') return;
    const map = new Map();
    const add = (text, owner, truth = false) => {
      const k = key(text); if (!map.has(k)) map.set(k, { id: id(), text, owners: [], truth });
      const item = map.get(k); if (owner) item.owners.push(owner);
    };
    add(room.card.truth, null, true);
    for (const [owner, text] of Object.entries(room.answers)) add(text, owner);
    for (const text of room.card.decoys) { if (map.size >= 4) break; add(text); }
    room.options = shuffle([...map.values()]); room.phase = 'vote'; room.deadline = this.now() + 30000;
  }
  vote(room, token, optionId, round) {
    const p = this.identity(room, token);
    if (room.phase !== 'vote' || round !== room.round || this.now() >= room.deadline) fail('Le votazioni sono chiuse.');
    if (!room.roster.includes(p.id)) fail('La regia non vota.');
    if (room.votes[p.id]) fail('Hai già votato.');
    const option = room.options.find(o => o.id === optionId);
    if (!option || option.owners.includes(p.id)) fail('Non puoi votare il tuo bluff.');
    room.votes[p.id] = option.id;
    if (Object.keys(room.votes).length === room.roster.length) this.reveal(room);
  }
  reveal(room) {
    if (room.phase !== 'vote') return;
    const gains = Object.fromEntries(room.players.map(p => [p.id, 0]));
    const truth = room.options.find(o => o.truth);
    for (const owner of truth.owners) gains[owner] += 1000; // matched the sealed answer
    for (const [voter, oid] of Object.entries(room.votes)) {
      const option = room.options.find(o => o.id === oid);
      if (option.truth) { if (!truth.owners.includes(voter)) gains[voter] += 1000; }
      else for (const owner of option.owners) gains[owner] += 500;
    }
    for (const p of room.players) p.score += gains[p.id];
    room.gains = gains; room.phase = 'reveal'; room.deadline = 0; room.last = this.now();
  }
  tick() {
    const changed = [];
    for (const [code, room] of this.rooms) {
      if (this.now() - room.last > 6 * 3600000) { this.rooms.delete(code); changed.push(code); continue; }
      if (room.deadline && this.now() >= room.deadline) {
        if (room.phase === 'write') this.ballot(room); else if (room.phase === 'vote') this.reveal(room);
        changed.push(code);
      }
    }
    return changed;
  }
  view(room, token) {
    const me = this.identity(room, token), reveal = ['reveal', 'final'].includes(room.phase);
    return { code: room.code, phase: room.phase, host: !!me.host, me: me.id || null, round: room.round, total: room.total, serverNow: this.now(), deadline: room.deadline,
      title: room.card?.title || '', prompt: room.card?.prompt || '',
      players: room.players.map(p => ({ id: p.id, name: p.name, score: p.score, gain: room.gains?.[p.id] || 0, ready: !!room.answers[p.id], voted: !!room.votes[p.id] })),
      submitted: !!room.answers[me.id], voted: !!room.votes[me.id],
      options: room.phase === 'write' ? [] : room.options.map(o => ({ id: o.id, text: o.text, own: o.owners.includes(me.id), ...(reveal ? { truth: o.truth, owners: o.owners, voters: Object.entries(room.votes).filter(([,v]) => v === o.id).map(([p]) => p) } : {}) })) };
  }
}
module.exports = { Afterparty, clean };
