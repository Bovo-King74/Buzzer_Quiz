'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Afterparty } = require('../plugins/afterparty/engine');
function setup() {
  let now = 100000; const game = new Afterparty({ now: () => now }); const room = game.create();
  const a = game.join(room, 'Primi'), b = game.join(room, 'Secondi'), c = game.join(room, 'Terzi');
  return { game, room, a, b, c, later: ms => { now += ms; game.tick(); } };
}
test('namespace model: credentials and sealed answers never leave the server', () => {
  const {game,room,a} = setup(); game.advance(room, room.host);
  const view = JSON.stringify(game.view(room,a.token));
  for (const secret of [room.host,a.token,room.card.truth,'"deck"']) assert.ok(!view.includes(secret));
  assert.deepEqual(game.view(room,a.token).options, []);
  assert.throws(()=>game.advance(room,a.token),/Solo/);
  assert.throws(()=>game.identity(room,'bad'),/Accesso/);
});
test('cannot join a started game, duplicate names, or start alone', () => {
  const game = new Afterparty(), room = game.create(); game.join(room, 'Amici');
  assert.throws(()=>game.join(room,' amici '),/uso/);
  assert.throws(()=>game.advance(room,room.host),/due/);
  game.join(room,'Altri'); game.advance(room,room.host);
  assert.throws(()=>game.join(room,'Ritardatari'),/iniziata/);
});
test('one submission, one vote, no own votes; truth and bluff scores are exact', () => {
  const {game,room,a,b,c} = setup(); game.advance(room,room.host);
  game.submit(room,a.token,'Le patate avevano scioperato',1);
  assert.throws(()=>game.submit(room,a.token,'Altra',1),/consegnato/);
  game.submit(room,b.token,'Il gatto era in ferie',1); game.submit(room,c.token,'Piovevano monete',1);
  assert.equal(room.phase,'vote');
  const truth = room.options.find(o=>o.truth), fake = room.options.find(o=>o.owners.includes(a.id));
  const view = game.view(room,b.token);
  assert.ok(view.options.every(o=>!('truth' in o) && !('owners' in o) && !('voters' in o)));
  assert.throws(()=>game.vote(room,a.token,fake.id,1),/tuo/);
  game.vote(room,a.token,truth.id,1); game.vote(room,b.token,fake.id,1);
  assert.throws(()=>game.vote(room,b.token,truth.id,1),/già/);
  game.vote(room,c.token,fake.id,1);
  assert.equal(room.phase,'reveal'); assert.equal(a.score,2000); assert.equal(b.score,0);
  game.reveal(room); assert.equal(a.score,2000);
});
test('duplicate bluffs merge, and matching the truth grants exactly 1000', () => {
  const {game,room,a,b,c} = setup(); game.advance(room,room.host);
  game.submit(room,a.token,'Una scusa incredibile',1); game.submit(room,b.token,'UNA SCUSA INCREDIBILE',1); game.submit(room,c.token,room.card.truth,1);
  const merged = room.options.find(o=>o.owners.includes(a.id)); assert.equal(merged.owners.length,2);
  game.vote(room,c.token,merged.id,1); game.advance(room,room.host);
  assert.equal(a.score,500); assert.equal(b.score,500); assert.equal(c.score,1000);
});
test('deadlines progress without submissions and reject late or stale commands', () => {
  const {game,room,a,later} = setup(); game.advance(room,room.host); later(60000);
  assert.equal(room.phase,'vote'); assert.ok(room.options.length>=4);
  assert.throws(()=>game.submit(room,a.token,'Troppo tardi',1),/finito/);
  later(30000); assert.equal(room.phase,'reveal');
  game.advance(room,room.host); assert.equal(room.round,2);
  assert.throws(()=>game.submit(room,a.token,'Vecchio round',1),/finito/);
});
test('five rounds finish; abandoned rooms expire', () => {
  const {game,room,later} = setup();
  for(let i=1;i<=5;i++){game.advance(room,room.host);later(60000);later(30000);assert.equal(room.round,i);}
  game.advance(room,room.host);assert.equal(room.phase,'final');
  assert.throws(()=>game.advance(room,room.host),/terminata/);
  later(6*3600000+1); assert.throws(()=>game.room(room.code),/scaduta/);
});
test('independent rooms do not share data and rooms are capped', () => {
  const {game,room,a} = setup();const other=game.create();
  assert.throws(()=>game.identity(other,a.token),/Accesso/);
  game.advance(room,room.host);assert.equal(other.phase,'lobby');
  for(let i=game.rooms.size;i<100;i++)game.create();assert.throws(()=>game.create(),/pieno/);
});
test('malformed input cannot break state and Unicode names are normalized', () => {
  const game = new Afterparty(),room=game.create();assert.throws(()=>game.join(room,{}),/nome/);
  const p=game.join(room,'Ａｍｉｃｉ\u200b');assert.equal(p.name,'Amici');
  assert.throws(()=>game.identity(room,null),/Accesso/);
});
