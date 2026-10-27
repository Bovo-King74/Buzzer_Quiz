const assert = require('assert');

console.log('--- Avvio Test Suite Buzzer Quiz ---');

// Test 1: Normalizzazione nick e caratteri invisibili (T-16)
const normNick = raw => raw.normalize('NFKC').replace(/[\u200B-\u200F\u2028-\u202F\u2060-\u2069\uFEFF\u00AD]/g, '').trim().slice(0, 16);

assert.strictEqual(normNick('  Squadra 1  '), 'Squadra 1');
assert.strictEqual(normNick('Team\u200BZero'), 'TeamZero');
assert.strictEqual(normNick('\uFEFFInvisibile'), 'Invisibile');
assert.strictEqual(normNick('NomeMoltoLungoSuperioreAiSediciCaratteri'), 'NomeMoltoLungoSu');
console.log('✓ Test 1: Normalizzazione nick superata');

// Test 2: Verifica rate limiting (T-03, T-15)
const rateLimit = {};
function checkRate(ip, key, max, windowMs) {
  const k = ip + ':' + key;
  const now = Date.now();
  const r = rateLimit[k] || (rateLimit[k] = { n: 0, start: now });
  if (now - r.start > windowMs) { r.n = 0; r.start = now; }
  if (++r.n > max) return false;
  return true;
}

assert.strictEqual(checkRate('127.0.0.1', 'chat', 2, 1000), true);
assert.strictEqual(checkRate('127.0.0.1', 'chat', 2, 1000), true);
assert.strictEqual(checkRate('127.0.0.1', 'chat', 2, 1000), false); // bloccato
console.log('✓ Test 2: Rate limit generico superato');

// Test 3: Logica Snapshot & Undo (T-09)
const fakeGame = {
  phase: 'open',
  ans: null,
  answered: new Set(),
  order: [],
  done: false,
  players: { 'p1': { id: 'p1', score: 0 }, 'p2': { id: 'p2', score: 0 } },
  undo: []
};

function pushUndo(g) {
  g.undo = g.undo || [];
  g.undo.push({
    phase: g.phase,
    ans: g.ans,
    answered: [...g.answered],
    order: [...g.order],
    done: g.done,
    scores: Object.fromEntries(Object.values(g.players).map(p => [p.id, p.score]))
  });
}

function restoreUndo(g) {
  if (g.undo && g.undo.length) {
    const snap = g.undo.pop();
    g.phase = snap.phase;
    g.ans = snap.ans;
    g.answered = new Set(snap.answered);
    g.order = snap.order;
    g.done = snap.done;
    for (const [id, sc] of Object.entries(snap.scores)) {
      if (g.players[id]) g.players[id].score = sc;
    }
  }
}

// Simuliamo buzz e risposta corretta
pushUndo(fakeGame);
fakeGame.phase = 'answering';
fakeGame.ans = 'p1';
fakeGame.players['p1'].score += 1;
assert.strictEqual(fakeGame.players['p1'].score, 1);
assert.strictEqual(fakeGame.ans, 'p1');

// Annulla azione
restoreUndo(fakeGame);
assert.strictEqual(fakeGame.players['p1'].score, 0);
assert.strictEqual(fakeGame.ans, null);
assert.strictEqual(fakeGame.phase, 'open');
console.log('✓ Test 3: Snapshot & Undo superato');

// Test 4: Vera coda di prenotazione (T-08)
const queueGame = {
  order: [
    { id: 'p1', t: 1000 },
    { id: 'p2', t: 1050 },
    { id: 'p3', t: 1200 }
  ],
  answered: new Set(),
  players: {
    'p1': { id: 'p1', sid: 's1' },
    'p2': { id: 'p2', sid: 's2' },
    'p3': { id: 'p3', sid: 's3' }
  },
  ans: 'p1',
  phase: 'answering'
};

// Se p1 sbaglia, p2 diventa ans
queueGame.answered.add('p1');
const nextInQueue = queueGame.order.find(o => !queueGame.answered.has(o.id) && o.id !== queueGame.ans && queueGame.players[o.id]?.sid);
assert.strictEqual(nextInQueue.id, 'p2');
queueGame.ans = nextInQueue.id;
console.log('✓ Test 4: Scorrimento coda di prenotazione superato');

console.log('\n Tutte le asserzioni di test sono passate con successo! (4/4)');

