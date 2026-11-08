'use strict';
// Read-only product audit: reproduces existing defects against a disposable localhost server.
// It deliberately asserts the observed failures, rather than pretending they are acceptance tests.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const client = require('../node_modules/socket.io/client-dist/socket.io.js');
const port = 3143;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const evidence = [];
function record(id, actual) { evidence.push({ id, actual }); console.log(JSON.stringify({ id, actual })); }
(async () => {
  const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  // Exercise the exact sync() source under a deterministic clock: a valid update every 25 ms.
  const syncBody = source.slice(source.indexOf('const syncDebounce ='), source.indexOf('function _syncNow'));
  let time = 0, nextId = 0, publications = 0;
  const timers = new Map();
  const context = { setTimeout(fn, delay) { const key = ++nextId; timers.set(key, { fn, at: time + delay }); return key; }, clearTimeout(key) { timers.delete(key); }, _syncNow() { publications++; } };
  vm.createContext(context); vm.runInContext(syncBody + '\nthis.auditSync = sync;', context);
  for (let n = 0; n < 320; n++) { time = n * 25; for (const [key, timer] of timers) if (timer.at <= time) { timers.delete(key); timer.fn(); } context.auditSync({ code: 'AUDT' }); }
  assert.equal(publications, 0);
  time += 31; for (const timer of timers.values()) if (timer.at <= time) timer.fn();
  assert.equal(publications, 1);
  record('RT-05', { updateIntervalMs: 25, windowMs: 8000, snapshotsDuringWindow: 0, snapshotsAfterQuietPeriod: publications, kind: 'deterministic execution of actual sync() source; no load benchmark' });

  const server = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, HOST_PASS: 'AUDIT', PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  const clients = []; let stdout = '', stderr = '';
  server.stdout.on('data', b => { stdout += b; }); server.stderr.on('data', b => { stderr += b; });
  try {
    const stop = Date.now() + 5000;
    while (!stdout.includes('Quiz in ascolto')) { if (server.exitCode !== null || Date.now() > stop) throw new Error(stdout + stderr); await wait(10); }
    const connect = async (ns = '') => { const c = client(`http://127.0.0.1:${port}${ns}`, { transports: ['websocket'], forceNew: true, reconnection: false }); clients.push(c); await new Promise((resolve, reject) => { c.once('connect', resolve); c.once('connect_error', reject); }); return c; };
    const send = (socket, event, data = {}) => new Promise((resolve, reject) => socket.timeout(2500).emit(event, data, (err, r) => err ? reject(err) : resolve(r)));
    const host = await connect(), a = await connect(), b = await connect(), c = await connect();
    const room = await send(host, 'host:create'); assert.ok(room.key);
    let state; host.on('state', x => { state = x; });
    const pa = await send(a, 'join', { code: room.code, nick: 'Alfa' }), pb = await send(b, 'join', { code: room.code, nick: 'Beta' }), pc = await send(c, 'join', { code: room.code, nick: 'Gamma' });
    const act = async (type, extra = {}) => { host.emit('act', { type, ...extra }); await wait(80); };
    await act('start'); await act('open');
    for (const socket of [a, b, c]) assert.ok((await send(socket, 'buzz', { roundId: state.live.roundId })).ok);
    await act('lock'); await act('open');
    assert.equal(state.phase, 'locked'); assert.equal(state.ans, null); assert.equal(state.order.length, 3);
    record('RT-01a', { phaseAfterReopen: state.phase, activeAnswer: state.ans, queueLength: state.order.length, allPlayersAlreadyQueued: true });
    await act('newround'); await act('open');
    for (const socket of [a, b]) assert.ok((await send(socket, 'buzz', { roundId: state.live.roundId })).ok);
    await act('lock'); await act('open'); assert.equal(state.phase, 'open');
    assert.ok((await send(c, 'buzz', { roundId: state.live.roundId })).ok); await wait(80);
    assert.equal(state.ans, pc.pid); assert.equal(state.order[0].id, pa.pid); assert.equal(state.order[2].id, state.ans);
    record('RT-01b', { queueNames: state.order.map(o => state.players.find(p => p.id === o.id).nick), activeAnswerName: state.players.find(p => p.id === state.ans).nick, activeAnswerQueuePosition: 3 });
    await act('newround'); await act('open'); assert.ok((await send(a, 'buzz', { roundId: state.live.roundId })).ok);
    await act('correct'); await act('kick', { id: pa.pid }); await act('undo');
    assert.equal(state.phase, 'answering'); assert.equal(state.ans, pa.pid); assert.equal(state.players.some(p => p.id === state.ans), false);
    record('RT-02', { phase: state.phase, activeAnswerExists: state.players.some(p => p.id === state.ans), remainingPlayers: state.players.map(p => p.nick) });
    await act('newround');
    // Resume during final: the state exists, but current UI entry handlers ignore info.final.
    let receivedFinal = false; host.once('final', () => { receivedFinal = true; });
    await act('end'); assert.ok(receivedFinal);
    const returnedHost = await connect(), returnedTv = await connect(), returnedPlayer = await connect();
    let resumedHostFinalEvent = false, resumedTvFinalEvent = false;
    returnedHost.on('final', () => { resumedHostFinalEvent = true; }); returnedTv.on('final', () => { resumedTvFinalEvent = true; });
    const resumedHostInfo = await send(returnedHost, 'host:join', room), resumedTvInfo = await send(returnedTv, 'tv:join', { code: room.code });
    const resumedPlayerInfo = await send(returnedPlayer, 'join', pb); await wait(80);
    assert.ok(resumedHostInfo.final && resumedTvInfo.final); assert.equal(resumedHostFinalEvent, false); assert.equal(resumedTvFinalEvent, false); assert.equal(resumedPlayerInfo.err, 'La partita è terminata');
    record('RT-03', { hostInfoHasFinal: true, tvInfoHasFinal: true, hostReceivedFinalEvent: resumedHostFinalEvent, tvReceivedFinalEvent: resumedTvFinalEvent, playerReconnectError: resumedPlayerInfo.err });
    // The rate limiter runs before identity/room checks. Requests in a shared network consume one budget.
    const rateResults = [];
    for (let n = 0; n < 12; n++) rateResults.push(await send(b, 'join', pb));
    const rateIndex = rateResults.findIndex(r => /Troppi tentativi/.test(r.err || ''));
    assert.ok(rateIndex >= 0);
    record('RT-04', { totalJoinRequestsBeforeLoop: 4, firstRateLimitedRequestOverall: 4 + rateIndex + 1, error: rateResults[rateIndex].err, key: 'all localhost sockets share handshake.address' });
    // Afterparty state/round guards: verify paths without production mutations.
    const apHost = await connect('/afterparty'), apA = await connect('/afterparty'), apB = await connect('/afterparty');
    const apRoom = await send(apHost, 'create', { password: 'AUDIT' });
    assert.ok((await send(apA, 'join', { code: apRoom.code, name: 'Uno' })).ok); assert.ok((await send(apB, 'join', { code: apRoom.code, name: 'Due' })).ok);
    assert.equal((await send(apA, 'advance', { round: 0, phase: 'lobby' })).ok, false);
    assert.ok((await send(apHost, 'advance', { round: 0, phase: 'lobby' })).ok);
    assert.equal((await send(apHost, 'advance', { round: 0, phase: 'lobby' })).ok, false);
    record('AF-control', { playerCannotAdvance: true, duplicateStaleAdvanceRejected: true });
    // A plain JSON value at the trust boundary crashes main-namespace tv:join; reproduce last.
    const attacker = await connect();
    attacker.emit('tv:join', { code: { toString: null, valueOf: null } }, () => {});
    const crashStop = Date.now() + 3000;
    while (server.exitCode === null && Date.now() < crashStop) await wait(10);
    assert.equal(server.exitCode, 1); assert.match(stderr, /Cannot convert object to primitive value/);
    record('RT-06', { serverExitCode: server.exitCode, exception: stderr.split('\n').filter(l => /TypeError|server.js:/.test(l)).slice(0, 3) });
  } finally {
    for (const c of clients) c.disconnect();
    if (server.exitCode === null) { server.kill(); await new Promise(resolve => server.once('exit', resolve)); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
