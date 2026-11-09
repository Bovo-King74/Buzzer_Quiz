'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http'), net = require('node:net'), crypto = require('node:crypto'), fs = require('node:fs'), path = require('node:path');
const client = require('../node_modules/socket.io/client-dist/socket.io.js');
const security = require('../lib/security'), { validateAvatar } = require('../lib/avatar');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const uri = (mime, bytes) => `data:image/${mime};base64,${bytes.toString('base64')}`;
const pngFixture = fs.readFileSync(path.join(__dirname, '../public/assets/icons8/settings.png'));
const jpegFixture = fs.readFileSync(path.join(__dirname, '../public/assets/anim/anim1.jpg'));
// Original 8x8 test image derived once from the project's settings icon; no encoder dependency at test time.
const webpFixture = Buffer.from('UklGRoAAAABXRUJQVlA4WAoAAAAQAAAABwAABwAAQUxQSEEAAAAAAAQAU1IABAAEYl5BQl1iBABdEysrFF0AU0ErQ0MsQlNSQStDQyxCUgBeFCsrFV4ABGFdQUFdYgQABABTUgAEAABWUDggGAAAADABAJ0BKggACAACADQlpAADcAD++/1QAA==', 'base64');
const hostile = { toString: null, valueOf: null };
function watch(socket, event) { const tracker = { last: null, all: [] }; socket.on(event, value => { tracker.last = value; tracker.all.push(value); }); return tracker; }
async function until(condition, name = 'condition') { const end = Date.now() + 5000; while (!condition()) { if (Date.now() > end) throw new Error('Timed out: ' + name); await pause(10); } }
async function serverFixture(t, additions = {}) {
  const reservation = net.createServer(); await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  const env = { ...process.env, PORT: String(port), HOST_PASS: 'SECURITY-TEST', AFTERPARTY_ENABLED: 'false', ...additions };
  if (additions.HOST_PASS === undefined && Object.hasOwn(additions, 'HOST_PASS')) delete env.HOST_PASS;
  const processHandle = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env, stdio: ['ignore', 'pipe', 'pipe'] });
  const sockets = []; let output = '';
  processHandle.stdout.on('data', data => { output += data; }); processHandle.stderr.on('data', data => { output += data; });
  t.after(async () => { for (const socket of sockets) socket.disconnect(); if (processHandle.exitCode === null) { processHandle.kill(); await new Promise(resolve => processHandle.once('exit', resolve)); } });
  await until(() => output.includes('Quiz in ascolto') || processHandle.exitCode !== null, 'server start'); assert.equal(processHandle.exitCode, null, output);
  const url = `http://127.0.0.1:${port}`;
  async function connect(namespace = '') {
    const socket = client(url + namespace, { transports: ['websocket'], forceNew: true, reconnection: false }); sockets.push(socket);
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); }); return socket;
  }
  const send = (socket, event, data = {}) => new Promise((resolve, reject) => socket.timeout(2500).emit(event, data, (error, result) => error ? reject(error) : resolve(result)));
  const create = async () => { const host = await connect(); const room = await send(host, 'host:create', { origin: url, requestId: crypto.randomBytes(16).toString('hex') }); assert.ok(room.key, JSON.stringify(room)); const state = watch(host, 'state'); return { host, room, state }; };
  return { url, port, connect, send, create, processHandle, output: () => output };
}
function upgrade(port, origin) {
  return new Promise((resolve, reject) => {
    const headers = { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64') };
    if (origin !== undefined) headers.Origin = origin;
    const req = http.request({ hostname: '127.0.0.1', port, path: '/socket.io/?EIO=4&transport=websocket', headers });
    req.on('upgrade', (response, socket) => { socket.destroy(); resolve({ status: response.statusCode, body: '' }); });
    req.on('response', response => { let body = ''; response.on('data', chunk => { body += chunk; }); response.once('end', () => resolve({ status: response.statusCode, body })); });
    req.on('error', reject); req.end();
  });
}

test('boundary primitives reject coercion and reserved IDs; origin policy matches exact origins', () => {
  assert.equal(security.text(hostile), ''); assert.equal(security.code(hostile), ''); assert.equal(security.playerId('__proto__'), '');
  assert.ok(Number.isNaN(security.number(hostile))); assert.equal(security.secretEqual('a'.repeat(64), hostile), false);
  assert.equal(security.creationToken('predictable-creation-id'), ''); assert.equal(security.creationToken('ab'.repeat(16)), 'ab'.repeat(16));
  const policy = security.originPolicy('https://wall.example');
  const request = origin => ({ headers: { host: 'quiz.example:443', 'x-forwarded-proto': 'https', ...(origin === undefined ? {} : { origin }) }, socket: {} });
  for (const origin of ['https://quiz.example', 'https://wall.example', undefined]) assert.ok(policy.allows(request(origin)));
  for (const origin of ['https://quiz.example.evil', 'https://quiz.example:444', 'http://quiz.example', 'null', hostile]) assert.equal(policy.allows(request(origin)), false);
  assert.equal(policy.publicOrigin(request('https://quiz.example'), 'javascript:alert(1)'), 'https://quiz.example');
});

test('raster avatars require real signatures, dimensions and bounded PNG data', () => {
  const png = validateAvatar(uri('png', pngFixture)), jpg = validateAvatar(uri('jpeg', jpegFixture)), webp = validateAvatar(uri('webp', webpFixture));
  assert.deepEqual([png.width, png.height], [100, 100]); assert.deepEqual([jpg.width, jpg.height], [315, 420]); assert.deepEqual([webp.width, webp.height], [8, 8]);
  for (const value of [hostile, uri('jpeg', Buffer.from('<svg onload="alert(1)"></svg>')), uri('jpeg', pngFixture), uri('png', jpegFixture), 'data:image/svg+xml;base64,PHN2Zy8+', uri('png', pngFixture.subarray(0, 33)), uri('png', Buffer.concat([pngFixture, Buffer.from('<html>')]))]) assert.equal(validateAvatar(value), null);
  const corrupt = Buffer.from(pngFixture); corrupt[corrupt.length - 15] ^= 1; assert.equal(validateAvatar(uri('png', corrupt)), null);
  const enormous = Buffer.from(webpFixture); // Extended WebP declares 24-bit width + 1 before compressed pixels.
  enormous.writeUIntLE(0xffffff, 24, 3); assert.equal(validateAvatar(uri('webp', enormous)), null);
  const largeJpeg = Buffer.from(jpegFixture);
  for (let n = 2; n < largeJpeg.length - 8; n++) if (largeJpeg[n] === 255 && [192,193,194].includes(largeJpeg[n + 1])) { largeJpeg.writeUInt16BE(65535, n + 7); break; }
  assert.equal(validateAvatar(uri('jpeg', largeJpeg)), null);
});

test('real WebSocket upgrades reject foreign origins and accept same-origin, explicit allowlist, originless clients', async t => {
  const fixture = await serverFixture(t, { BUZZER_ALLOWED_ORIGINS: 'https://wall.example' });
  assert.equal((await upgrade(fixture.port, fixture.url)).status, 101);
  assert.equal((await upgrade(fixture.port, 'https://wall.example')).status, 101);
  assert.equal((await upgrade(fixture.port)).status, 101);
  for (const foreign of ['https://evil.example', fixture.url.replace('127.0.0.1', '127.0.0.1.evil'), 'null']) {
    const denied = await upgrade(fixture.port, foreign);
    // Engine.IO's abortUpgrade() always writes HTTP 400, including its FORBIDDEN branch.
    assert.equal(denied.status, 400, foreign); assert.match(denied.body, /Forbidden/);
  }
  const polling = await fetch(fixture.url + '/socket.io/?EIO=4&transport=polling', { headers: { Origin: 'https://evil.example' } });
  assert.equal(polling.status, 403); assert.equal((await polling.json()).code, 4);
  const allowedPolling = await fetch(fixture.url + '/socket.io/?EIO=4&transport=polling', { headers: { Origin: 'https://wall.example' } });
  assert.equal(allowedPolling.status, 200); assert.equal(allowedPolling.headers.get('access-control-allow-origin'), 'https://wall.example');
});

test('malformed JSON cannot kill the server; IDs, avatars and QR origins remain validated', async t => {
  const f = await serverFixture(t), { host, room, state } = await f.create(), attacker = await f.connect();
  assert.match(room.key, /^[A-F0-9]{64}$/); assert.equal(f.output().includes(room.key), false);
  for (const event of ['host:join','tv:join','join']) {
    assert.ok((await f.send(attacker, event, { code: hostile, key: hostile, nick: hostile, pid: hostile })).err);
    assert.ok((await f.send(attacker, event, [])).err);
  }
  assert.ok((await f.send(attacker, 'host:create', { requestId: 'weak-token' })).err);
  assert.ok((await f.send(attacker, 'host:create', { requestId: hostile })).err);
  const p = await f.connect(), joined = await f.send(p, 'join', { code: room.code, nick: 'Payload UI', pid: null, token: null, avatar: null });
  assert.ok(joined.pid && joined.token); await until(() => state.last?.players.length === 1);
  assert.equal((await f.send(host, 'act', { type: 'pts', id: joined.pid, v: hostile })).ok, false);
  assert.equal((await f.send(host, 'act', { type: 'set', key: 'pts', v: hostile })).ok, false);
  assert.equal((await f.send(host, 'act', { type: 'set', key: 'joinOpen', v: hostile })).ok, false);
  assert.equal((await f.send(host, 'act', { type: 'kick', id: '__proto__' })).ok, false);
  assert.equal((await f.send(host, 'live:act', { type: 'spotlight', pid: hostile })).ok, false);
  p.emit('chat', { text: hostile }); host.emit('act', { type: 'pts', id: hostile, v: hostile });
  assert.equal((await (await fetch(f.url + '/healthz')).json()).ok, true); assert.equal(f.processHandle.exitCode, null);
  const tv = await f.connect(), info = await f.send(tv, 'tv:join', { code: room.code, origin: 'https://evil.example' });
  assert.ok(info.url.startsWith(f.url + '/player.html')); assert.equal(info.key, undefined);
  const rejected = await f.connect(); assert.ok((await f.send(rejected, 'join', { code: room.code, nick: 'No SVG', avatar: uri('jpeg', Buffer.from('<svg/>')) })).err);
  const photo = await f.connect(), photoCredentials = await f.send(photo, 'join', { code: room.code, nick: 'Foto valida', avatar: uri('png', pngFixture) });
  assert.ok(photoCredentials.pid);
  const image = await fetch(`${f.url}/avatar/${room.code}/${photoCredentials.pid}`); assert.match(image.headers.get('content-type'), /^image\/png/); assert.deepEqual(Buffer.from(await image.arrayBuffer()), pngFixture);
  const initials = await fetch(`${f.url}/avatar/${room.code}/${joined.pid}`); assert.match(initials.headers.get('content-type'), /^image\/svg\+xml/); assert.match(initials.headers.get('content-security-policy'), /sandbox/);
  assert.equal((await fetch(`${f.url}/avatar/${room.code}/__proto__`)).status, 404);
  assert.equal(state.last.players[0].score, 0); assert.equal(state.last.set.joinOpen, true); assert.equal(state.last.set.pts, 1);
});

test('lock/open preserves accepted order; undo reconciles removed players; obsolete commands and ACKs do not revive a round', async t => {
  const f = await serverFixture(t), { host, room, state } = await f.create(), a = await f.connect(), b = await f.connect(), c = await f.connect();
  const pa = await f.send(a, 'join', { code: room.code, nick: 'Alfa' }), pb = await f.send(b, 'join', { code: room.code, nick: 'Beta' }), pc = await f.send(c, 'join', { code: room.code, nick: 'Gamma' });
  const act = async (type, fields = {}) => { const reply = await f.send(host, 'act', { type, ...fields }); assert.ok(reply.ok, JSON.stringify(reply)); await pause(45); };
  await act('start'); await act('open'); let roundId = state.last.live.roundId;
  for (const socket of [a,b]) assert.ok((await f.send(socket, 'buzz', { roundId })).ok);
  await until(() => state.last.order.length === 2); await act('lock'); await act('open');
  assert.equal(state.last.phase, 'answering'); assert.equal(state.last.ans, pa.pid);
  assert.ok((await f.send(c, 'buzz', { roundId })).ok); await until(() => state.last.order.length === 3); assert.equal(state.last.ans, pa.pid);
  await act('lock'); await act('open'); assert.equal(state.last.phase, 'answering'); assert.equal(state.last.ans, pa.pid);
  await act('newround'); await act('open'); roundId = state.last.live.roundId;
  const accepted = await f.send(a, 'buzz', { roundId, requestId: 'accepted-once' }); assert.ok(accepted.ok); await until(() => state.last.ans === pa.pid);
  await act('correct', { roundId, ans: pa.pid }); await act('kick', { id: pa.pid }); await act('undo');
  assert.notEqual(state.last.phase, 'answering'); assert.equal(state.last.ans, null); assert.ok(state.last.order.every(item => item.id !== pa.pid));
  await act('newround'); const nextRound = state.last.live.roundId;
  assert.notEqual(nextRound, roundId);
  assert.equal((await f.send(host, 'act', { type: 'open', roundId })).ok, false);
  assert.equal((await f.send(host, 'live:act', { type: 'pause', roundId })).ok, false);
  assert.equal((await f.send(host, 'host:effect', { pid: pb.pid, kind: 'reaction', value: '👏', roundId })).ok, false);
  assert.equal((await f.send(a, 'buzz', { roundId, requestId: 'accepted-once' })).ok, false);
  const countdown = { type: 'countdown:start', requestId: 'countdown-once', roundId: nextRound };
  const one = await f.send(host, 'live:act', countdown), two = await f.send(host, 'live:act', countdown);
  assert.ok(one.ok); assert.deepEqual(two, one); // The command itself creates a new round; retry must still be idempotent.
  assert.ok((await f.send(host, 'live:act', { type: 'countdown:cancel' })).ok);
  await pause(45); assert.equal(state.last.live.roundId, one.live.roundId);
});

test('shared-network reconnects, final podium recovery and room/session authorization remain correct', async t => {
  const f = await serverFixture(t), { host, room, state } = await f.create(), player = await f.connect();
  const joined = await f.send(player, 'join', { code: room.code, nick: 'Rientri' }); assert.ok(joined.token);
  const attacker = await f.connect();
  for (let n = 0; n < 65; n++) assert.ok((await f.send(attacker, 'join', { code: 'XXXX', nick: 'err' })).err);
  for (let n = 0; n < 25; n++) assert.equal((await f.send(player, 'join', joined)).pid, joined.pid);
  for (let n = 0; n < 12; n++) assert.ok((await f.send(attacker, 'host:join', { code: room.code, key: 'wrong' })).err);
  const replacementHost = await f.connect(); assert.equal((await f.send(replacementHost, 'host:join', room)).code, room.code);
  const other = await f.create();
  assert.equal((await f.send(other.host, 'host:effect', { pid: joined.pid, kind: 'reaction', value: '👏' })).ok, false);
  const replacement = await f.connect(); assert.equal((await f.send(replacement, 'join', joined)).pid, joined.pid);
  assert.equal((await f.send(player, 'buzz', {})).ok, false); // Superseded socket lost its identity.
  const observer = await f.connect(), observed = watch(observer, 'state');
  await f.send(observer, 'tv:join', { code: room.code }); await pause(45); await f.send(observer, 'tv:join', { code: other.room.code }); await until(() => observed.last?.code === other.room.code);
  const before = observed.all.length; await f.send(host, 'act', { type: 'pts', id: joined.pid, v: 1 }); await pause(70);
  assert.equal(observed.all.length, before); // No packets from the old room after changing identity.
  const me = watch(replacement, 'me'), replayed = watch(replacement, 'effect');
  await f.send(host, 'act', { type: 'end' }); await until(() => state.last?.phase === 'locked');
  const endInfo = await f.send(replacement, 'join', joined); assert.ok(Array.isArray(endInfo.final)); assert.equal(endInfo.final[0].score, 1);
  await until(() => me.last?.id === joined.pid); assert.equal(replayed.all.length, 0);
  assert.ok((await f.send(attacker, 'join', { code: room.code, nick: 'Nuovo' })).err);
  assert.ok((await f.send(attacker, 'join', { ...joined, token: 'wrong' })).err);
  const finalHost = await f.send(replacementHost, 'host:join', room), finalTV = await f.send(observer, 'tv:join', { code: room.code });
  assert.deepEqual(finalHost.final, endInfo.final); assert.deepEqual(finalTV.final, endInfo.final); assert.equal(finalTV.key, undefined);
});

test('continuous valid changes publish snapshots during the stream instead of postponing them forever', async t => {
  const f = await serverFixture(t), { host, state } = await f.create(); await pause(50); state.all.length = 0;
  for (let index = 0; index < 20; index++) { host.emit('act', { type: 'set', key: 'chat', v: index % 2 === 0 }); await pause(15); }
  const during = state.all.length; assert.ok(during >= 3, `Only ${during} snapshots published during 300ms stream`);
  await until(() => state.last?.set.chat === false);
});

test('Afterparty requires explicit HOST_PASS; configured namespace remains isolated and malformed data is contained', async t => {
  const f = await serverFixture(t, { AFTERPARTY_ENABLED: 'true', HOST_PASS: undefined }), ap = await f.connect('/afterparty');
  const disabled = await f.send(ap, 'create', { password: 'KJB' }); assert.equal(disabled.ok, false); assert.match(disabled.error, /configurare HOST_PASS/);
  const quiz = await f.create(); assert.ok(quiz.room.key); // Public quiz creation is independent of Afterparty's password.
  assert.equal(f.output().includes(quiz.room.key), false);
  const configured = await serverFixture(t, { AFTERPARTY_ENABLED: 'true' }), host = await configured.connect('/afterparty'), outsider = await configured.connect('/afterparty'), main = await configured.connect();
  const room = await configured.send(host, 'create', { password: 'SECURITY-TEST' }); assert.ok(room.ok);
  assert.equal((await configured.send(outsider, 'resume', { code: hostile, token: hostile })).ok, false);
  assert.equal((await configured.send(outsider, 'advance', { phase: 'lobby', round: 0 })).ok, false);
  assert.equal((await configured.send(main, 'live:act', { type: 'pause' })).ok, false);
  assert.equal(configured.processHandle.exitCode, null); assert.equal(configured.output().includes('SECURITY-TEST'), false);
});

test('pending participants and unauthenticated TV cannot read room chat; approval restores authorized history', async t => {
  const f = await serverFixture(t), { host, room } = await f.create(), approved = await f.connect(), pending = await f.connect(), tv = await f.connect();
  const active = await f.send(approved, 'join', { code: room.code, nick: 'Ammesso' }); assert.ok(active.pid);
  await f.send(host, 'act', { type: 'set', key: 'approve', v: true });
  const approvedChat = watch(approved, 'chat'), pendingChat = watch(pending, 'chat'), tvChat = watch(tv, 'chat');
  host.emit('chat', { text: 'Contesto riservato alle squadre ammesse' }); await until(() => approvedChat.all.length === 1);
  const waiting = await f.send(pending, 'join', { code: room.code, nick: 'Da approvare' });
  assert.ok(waiting.pid); assert.deepEqual(waiting.hist, []);
  const wall = await f.send(tv, 'tv:join', { code: room.code }); assert.deepEqual(wall.hist, []);
  approved.emit('chat', { text: 'Secondo messaggio della squadra' }); await until(() => approvedChat.all.length === 2);
  assert.equal(pendingChat.all.length, 0); assert.equal(tvChat.all.length, 0);
  const history = watch(pending, 'chat:history');
  await f.send(host, 'act', { type: 'approve', id: waiting.pid }); await until(() => !!history.last);
  assert.equal(history.last.length, 2); assert.equal(history.last[0].text, 'Contesto riservato alle squadre ammesse');
  pending.emit('chat', { text: 'Ora posso partecipare' }); await until(() => pendingChat.all.length === 1);
  assert.equal(pendingChat.last.nick, 'Da approvare'); assert.equal(tvChat.all.length, 0);
});
