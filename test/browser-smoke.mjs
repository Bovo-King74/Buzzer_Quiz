// Real Chrome smoke test, isolated host/player/TV contexts, no npm dependencies.
// Requires Node 22+ and Chrome/Chromium. Run: node test/browser-smoke.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const port = Number(process.env.BROWSER_TEST_PORT || 3137);
const base = process.env.BROWSER_TEST_URL || `http://127.0.0.1:${port}`;
const out = resolve(process.env.BROWSER_TEST_OUT || '.taste-skill/browser');
const baseline = process.argv.includes('--baseline');
const capture = process.argv.includes('--capture');
const chrome = process.env.CHROME_PATH || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
].find(existsSync);
if (!chrome) throw new Error('Set CHROME_PATH to an installed Chrome/Chromium executable.');
if (typeof WebSocket === 'undefined') throw new Error('This optional browser check requires Node 22+.');

class CDP {
  static async launch() {
    const profile = mkdtempSync(join(tmpdir(), 'buzzer-browser-'));
    const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
      '--no-first-run', '--no-default-browser-check', '--mute-audio', '--hide-scrollbars',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows', '--force-color-profile=srgb', 'about:blank'], {stdio:['ignore','ignore','pipe']});
    let stderr = '';
    const endpoint = await new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error(`Chrome startup timeout: ${stderr.slice(-500)}`)), 15000);
      proc.stderr.on('data', d => { stderr += d; const m = stderr.match(/DevTools listening on (ws:\/\/\S+)/); if (m) {clearTimeout(timer);res(m[1]);} });
      proc.once('exit', code => {clearTimeout(timer);rej(new Error(`Chrome exited ${code}: ${stderr.slice(-500)}`));});
    });
    const browser = new CDP(); browser.proc = proc; browser.profile = profile;
    browser.seq = 0; browser.pending = new Map(); browser.listeners = new Map();
    browser.ws = new WebSocket(endpoint);
    await new Promise((res, rej) => {browser.ws.onopen=res; browser.ws.onerror=rej;});
    browser.ws.onmessage = ({data}) => {
      const m = JSON.parse(String(data));
      if (m.id && browser.pending.has(m.id)) {
        const p=browser.pending.get(m.id);browser.pending.delete(m.id);clearTimeout(p.timer);
        if(m.error)p.reject(new Error(m.error.message));else p.resolve(m.result);
      } else if(m.method) for(const fn of browser.listeners.get(`${m.sessionId || ''}:${m.method}`)||[]) fn(m.params);
    };
    return browser;
  }
  send(method, params={}, sessionId) {
    const id=++this.seq;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`CDP timeout ${method}`));},15000);
      this.pending.set(id,{resolve,reject,timer});this.ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
    });
  }
  on(sessionId,method,fn){const k=`${sessionId || ''}:${method}`;if(!this.listeners.has(k))this.listeners.set(k,[]);this.listeners.get(k).push(fn);}
  async page(width=390,height=844,reduced=false){
    const {browserContextId}=await this.send('Target.createBrowserContext');
    const {targetId}=await this.send('Target.createTarget',{url:'about:blank',browserContextId});
    const {sessionId}=await this.send('Target.attachToTarget',{targetId,flatten:true});
    const b=this;
    const p={errors:[],width,height,send:(m,a={})=>b.send(m,a,sessionId)};
    b.on(sessionId,'Runtime.exceptionThrown',e=>p.errors.push(e.exceptionDetails?.exception?.description||e.exceptionDetails?.text));
    await p.send('Page.enable');await p.send('Runtime.enable');
    await p.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
    if(reduced)await p.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    p.eval=async expression=>{const r=await p.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;};
    p.goto=async path=>{await p.send('Page.navigate',{url:base+path});await wait(p,'document.readyState === "complete"');await sleep(200);};
    p.fill=async(selector,value)=>{await p.eval(`document.querySelector(${JSON.stringify(selector)}).focus()`);await p.send('Input.insertText',{text:value});};
    p.click=async selector=>{
      const r=await p.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,disabled:e.disabled};})()`);
      assert.notEqual(r.disabled,true,`Button unexpectedly disabled: ${selector}`);
      await p.send('Input.dispatchMouseEvent',{type:'mousePressed',x:r.x,y:r.y,button:'left',clickCount:1});
      await p.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:r.x,y:r.y,button:'left',clickCount:1});
    };
    p.key=async(key,code=key)=>{await p.send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:key==='Escape'?27:key==='Tab'?9:key==='Enter'?13:key===' '?32:0});await p.send('Input.dispatchKeyEvent',{type:'keyUp',key,code});};
    p.shot=async name=>{const {data}=await p.send('Page.captureScreenshot',{format:'jpeg',quality:80});writeFileSync(join(out,`${name}.jpg`),Buffer.from(data,'base64'));};
    return p;
  }
  async close(){try{await this.send('Browser.close');}catch{}try{this.ws.close();this.proc.kill();}catch{}await sleep(200);rmSync(this.profile,{recursive:true,force:true});}
}
async function wait(p,expression,timeout=6000){const started=Date.now();let last;while(Date.now()-started<timeout){try{last=await p.eval(expression);if(last)return last;}catch{}await sleep(50);}throw new Error(`Browser wait timed out: ${expression}; last=${JSON.stringify(last)}`);}
const emit=(p,event,data)=>p.eval(`new Promise((resolve,reject)=>s.timeout(2500).emit(${JSON.stringify(event)},${JSON.stringify(data)},(error,result)=>error?reject(error):resolve(result)))`);
let serial=0;
const live=(p,type,data={})=>emit(p,'live:act',{type,requestId:`browser-${++serial}`,...data});
const setPref=(p,key,value)=>p.eval(`(()=>{const el=document.querySelector('[data-pref="'+${JSON.stringify(key)}+'"]');if(!el)throw Error('Missing preference '+${JSON.stringify(key)});if(el.type==='checkbox')el.checked=${JSON.stringify(value)};else el.value=${JSON.stringify(String(value))};el.dispatchEvent(new Event('input',{bubbles:true}));return BuzzerUX.getPreferences();})()`);
const checks=[];
function passed(name){checks.push(name);console.log(`✓ ${name}`);}

let server,browser;
try{
  mkdirSync(out,{recursive:true});
  if(!process.env.BROWSER_TEST_URL){
    server=spawn(process.execPath,['server.js'],{cwd:resolve('.'),env:{...process.env,PORT:String(port),HOST_PASS:'BROWSER',AFTERPARTY_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
    let logs='';server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);
    const started=Date.now();let healthy=false;while(Date.now()-started<6000){try{healthy=(await fetch(base+'/healthz')).ok;if(healthy)break;}catch{}await sleep(100);}
    if(!healthy)throw new Error('Local test server unavailable: '+logs);
  }
  browser=await CDP.launch();
  const host=await browser.page(1440,900),a=await browser.page(),b=await browser.page(),tv=await browser.page(1280,800);
  await host.goto('/host.html');await wait(host,'s.connected && !document.querySelector("#setup").hidden');
  assert.equal(await host.eval('document.querySelector("#pw")'),null);
  await host.shot('host-create-desktop');
  await host.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.ok(await host.eval('document.documentElement.scrollWidth<=innerWidth+1'));
  await host.shot('host-create-mobile');
  await host.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await host.click('#mk');
  await wait(host,'typeof ST !== "undefined" && ST && !document.querySelector("#app").hidden');
  const room=await host.eval('cred');
  for(const [p,nick] of [[a,'Le Volpi'],[b,'I Fulmini']]){
    await p.goto('/player.html?c='+room.code);await wait(p,'s.connected');await p.fill('#n',nick);await p.click('#go');await wait(p,'me.id && !document.querySelector("#game").hidden');
  }
  await tv.goto('/tv.html?c='+room.code);await wait(tv,'ST && ST.players.length===2');
  await host.shot('host-lobby-desktop');await a.shot('player-lobby-mobile');
  if(baseline || capture){
    passed('Host + due partecipanti + TV');await host.click('#bStart');await wait(a,'me.mode==="locked"');await host.click('#bOpen');await wait(a,'me.mode==="open"');await a.shot('player-open-mobile');await host.shot('host-open-desktop');
    if(capture)for(const width of [1440,768,390])for(const [name,p] of [['host',host],['player',a],['tv',tv]]){
      const height=width===1440?900:width===768?1024:844;
      await p.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});await sleep(200);
      assert.ok(await p.eval('document.documentElement.scrollWidth<=innerWidth+1'),`${name}: horizontal overflow at ${width}px`);
      if(name==='tv' && width===768)assert.equal(await p.eval('[...document.querySelectorAll("#tv-leaderboard .nm")].some(el=>el.scrollWidth>el.clientWidth)'),false,'TV tablet team names truncated');
      await p.shot(`${name}-game-${width}`);
    }
    if(capture){
      for(const width of [1440,390]){
        await host.send('Emulation.setDeviceMetricsOverride',{width,height:width===1440?900:844,deviceScaleFactor:1,mobile:width<600});
        await host.click('#live-modes');await wait(host,'document.querySelector("#live-mode-dialog").open');await host.shot(`host-modes-${width}`);await host.key('Escape');
        const pid=await a.eval('me.id');await host.click(`#sq [data-player-action="${pid}"]`);await wait(host,'document.querySelector("#live-player-dialog").open');await host.shot(`host-actions-${width}`);await host.key('Escape');
      }
      for(const theme of ['light','dark']){await setPref(a,'theme',theme);await sleep(250);await a.shot(`player-${theme}-mobile`);}
      await a.click('#ux-settings');await a.shot('settings-mobile');await a.key('Escape');
      const login=await browser.page();await login.goto('/host.html');await wait(login,'!document.querySelector("#setup").hidden');
      assert.equal(await login.eval(`(()=>{const a=document.querySelector('#ux-settings').getBoundingClientRect();return ['#jn','#mk','.hostbtn'].some(selector=>{const b=document.querySelector(selector).getBoundingClientRect();return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;});})()`),false,'Host login settings overlap another action');await login.shot('host-login-mobile');
    }
  }
  else{
    await host.click('#bStart');await wait(a,'me.mode==="locked"');
    const ids=[await a.eval('me.id'),await b.eval('me.id')];
    passed('Ingresso da form reali, host + due partecipanti + TV isolati');
    // Test event and audio delivery without claiming to hear physical speakers.
    for(const p of [host,a,b])await p.eval(`window.__heard=[];window.__effects=[];const original=BuzzerUX.play;BuzzerUX.play=function(name,options){__heard.push({name,options});return original.call(this,name,options);};s.on('effect',e=>__effects.push(e));undefined;`);
    await host.click('#bOpen');await wait(a,'me.mode==="open"');
    await Promise.all([a.click('#bz'),b.click('#bz')]);await wait(host,'ST.order.length===2');
    const order=await host.eval('ST.order.map(o=>o.id)');assert.equal(new Set(order).size,2);assert.deepEqual(new Set(order),new Set(ids));
    assert.equal(await host.eval('ST.ans'),order[0]);
    await wait(a,'me.queued');await wait(b,'me.queued');
    assert.equal(await host.eval('__heard.filter(x=>x.name==="buzzer").length'),1);
    for(const p of [a,b]){assert.equal(await p.eval('__heard.filter(x=>x.name==="press").length'),1);assert.equal(await p.eval('__heard.filter(x=>x.name==="buzzer").length'),0);}
    passed('Buzz simultanei: coda unica, conferma server, audio locale distinto senza eco');
    await host.click('#bKo');await wait(host,`ST.ans===${JSON.stringify(order[1])}`);await host.click('#bOk');await wait(host,'ST.phase==="locked"');
    assert.equal(await host.eval(`ST.players.find(p=>p.id===${JSON.stringify(order[1])}).score`),1);await host.click('#bUndo');await wait(host,'ST.phase==="answering"');
    assert.equal(await host.eval(`ST.players.find(p=>p.id===${JSON.stringify(order[1])}).score`),0);passed('Coda, punteggio e Annulla preesistenti');
    await host.click('#bNew');await wait(host,'ST.phase==="locked" && ST.order.length===0');
    await host.click(`#sq [data-player-action="${ids[0]}"]`);await wait(host,'document.querySelector("#live-player-dialog").open');
    assert.ok((await host.eval('document.querySelector("#live-player-dialog-title").textContent')).includes('Le Volpi'));
    await host.click('[data-effect="reaction"][data-value="👏"]');await wait(a,'__effects.length===1');await sleep(150);assert.equal(await b.eval('__effects.length'),0);assert.equal(await tv.eval('document.body.textContent.includes("👏")'),false);
    passed('Reazione privata ricevuta soltanto dal destinatario');
    await sleep(1100);await host.click('[data-effect="presence"]');await wait(a,'me.presence');
    await host.eval('window.__presence=[];s.on("presence:confirmed",e=>__presence.push(e));undefined');
    await a.click('#presence-reply');await wait(host,'__presence.length===1');await host.click('#player-spotlight');
    await wait(host,`document.querySelector('#sq [data-id="${ids[0]}"]').classList.contains('live-spotlight')`);
    await wait(tv,`document.querySelector('[data-player-id="${ids[0]}"]').classList.contains('live-spotlight')`);
    await host.key('Escape');passed('Presenza dai pulsanti reali e spotlight sulla squadra corretta in host e TV');
    await host.click('#live-go');await wait(a,'me.mode==="countdown"');
    assert.equal(await a.eval('document.querySelector("#bz").disabled'),true);await sleep(450);await host.click('#live-pause');await wait(a,'me.mode==="paused"');
    const paused=await host.eval('ST.live.countdown.remainingMs');await sleep(400);await host.click('#live-pause');await wait(a,'me.mode==="countdown"');
    assert.ok(await host.eval('ST.live.countdown.endsAt-ST.live.serverNow')>=paused-200);await wait(a,'me.mode==="open"',6000);passed('Countdown server e pausa/ripresa della scadenza condivisa');
    await host.click('#bLock');await wait(host,'ST.phase==="locked"');await host.click('#live-modes');await wait(host,'document.querySelector("#live-mode-dialog").open');
    await host.eval(`document.querySelector('#duel-one').value=${JSON.stringify(ids[0])};document.querySelector('#duel-two').value=${JSON.stringify(ids[1])};`);
    await host.click('#duel-start');await wait(a,'me.live.duel.length===2');await host.key('Escape');
    const spectator=await browser.page();await spectator.goto('/player.html?c='+room.code);await spectator.fill('#n','Gli Orsi');await spectator.click('#go');await wait(spectator,'me.mode==="spectator"');
    await host.click('#bOpen');await wait(a,'me.mode==="open"');assert.equal(await spectator.eval('document.querySelector("#bz").disabled'),true);await a.click('#bz');await wait(host,'ST.phase==="answering"');
    await host.click('#live-modes');await host.eval('document.querySelector("#timer-seconds").value="10"');await host.click('#timer-start');await wait(b,'me.live.timer && me.live.timer.status==="running"');await host.click('#timer-toggle');await wait(a,'me.live.timer.status==="paused"');await host.click('#timer-toggle');await wait(a,'me.live.timer.status==="running"');
    const expirySoundsBefore=await b.eval('__heard.filter(x=>x.name==="expired").length');await b.eval('s.disconnect();undefined');
    await wait(a,'me.live.timer.status==="expired"',12000);assert.ok(await a.eval('document.querySelector("#live-timer").textContent.includes("Tempo scaduto")'));
    await b.eval('s.connect();undefined');await wait(b,'s.connected && me.live.timer.status==="expired"');await sleep(150);assert.equal(await b.eval('__heard.filter(x=>x.name==="expired").length'),expirySoundsBefore);
    await host.click('[data-live="timer:reset"]');await wait(a,'!me.live.timer');await host.key('Escape');
    await host.click('#bNew');await wait(host,'ST.phase==="locked"');assert.equal((await live(host,'duel:end')).ok,true);await wait(spectator,'me.mode==="locked"');passed('Duello, spettatore, timer risposta e ripristino normale');
    assert.equal((await live(host,'draw',{excludeDrawn:true})).ok,true);await wait(tv,'ST.live.draw');const draw=await tv.eval('ST.live.draw.pid');assert.equal(await host.eval('ST.live.draw.pid'),draw);assert.equal((await live(host,'draw:clear')).ok,true);assert.equal((await live(host,'draw',{excludeDrawn:true})).ok,true);await wait(host,`ST.live.draw && ST.live.draw.pid!==${JSON.stringify(draw)}`);assert.equal((await live(host,'draw:reset')).ok,true);passed('Estrazione unica condivisa ed esclusione dei già estratti');
    assert.equal((await live(host,'applause:start')).ok,true);await wait(a,'me.live.applause && !me.live.applause.closed');const applause=await a.eval('me.live.applause.id');assert.equal((await emit(a,'applause:react',{id:applause,value:'🔥'})).ok,true);await wait(host,'ST.live.applause.counts["🔥"]===1');assert.equal((await live(host,'applause:stop')).ok,true);assert.equal((await live(host,'applause:clear')).ok,true);passed('Applausometro condiviso separato dal punteggio');
    await a.eval('s.disconnect();s.connect();undefined');await wait(a,'s.connected && me.id');await sleep(300);assert.equal(await a.eval('__effects.length'),2);passed('Riconnessione con stato corrente senza replay degli effetti');
    await a.send('Page.bringToFront');await a.click('#ux-settings');await wait(a,'document.querySelector("#ux-settings-dialog").open');
    assert.equal(await a.eval('document.activeElement.id'),'ux-settings-close');await a.key('Tab');assert.equal(await a.eval('document.activeElement.dataset.pref'),'theme');
    await setPref(a,'theme','dark');await setPref(a,'highContrast',true);await setPref(a,'textSize','large');await setPref(a,'backgrounds','full');await setPref(a,'reduceTransparency',true);await setPref(a,'motion','reduce');await setPref(a,'focusMode',true);
    assert.deepEqual(await a.eval('({theme:document.documentElement.dataset.uxTheme,motion:document.documentElement.dataset.uxMotion,text:document.documentElement.dataset.uxText,contrast:document.documentElement.dataset.uxContrast,focus:document.documentElement.dataset.uxFocus})'),{theme:'dark',motion:'reduce',text:'large',contrast:'true',focus:'true'});
    await a.click('#ux-test-audio');await wait(a,'BuzzerUX.audioStatus()==="ready"');await setPref(a,'sounds',false);assert.equal(await a.eval('BuzzerUX.play("press",{channel:"buzz"})'),false);
    await setPref(a,'sounds',true);await setPref(a,'buzzVolume',0);assert.equal(await a.eval('BuzzerUX.play("press",{channel:"buzz"})'),false);await setPref(a,'buzzVolume',35);assert.equal(await a.eval('BuzzerUX.play("press",{channel:"buzz"})'),true);
    await setPref(a,'receiveHostAudio',false);assert.equal(await a.eval('BuzzerUX.play("applause",{received:true})'),false);await setPref(a,'effectsVolume',0);assert.equal(await a.eval('BuzzerUX.play("comic")'),false);await setPref(a,'effectsVolume',25);
    await a.shot('settings-mobile');await a.key('Escape');assert.equal(await a.eval('document.activeElement.id'),'ux-settings');assert.equal(await a.eval('document.querySelector("#ux-settings-dialog").open'),false);
    const personal=await a.eval('BuzzerUX.getPreferences()');await a.goto('/player.html?c='+room.code);await wait(a,'me.id');assert.deepEqual(await a.eval('BuzzerUX.getPreferences()'),personal);assert.equal(await b.eval('BuzzerUX.getPreferences().theme'),'system');assert.equal(await host.eval('BuzzerUX.getPreferences().buzzVolume'),65);
    await b.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await wait(b,'document.documentElement.dataset.uxMotion==="reduce"');assert.equal(await b.eval('BuzzerUX.getPreferences().motion'),'system');passed('Preferenze immediate e persistenti: mute, volumi, audio host, movimento di sistema, Escape e focus');
    // Native keyboard activation must submit exactly one buzz, including after preference restoration.
    const keyboardRound = await host.eval('ST.live.roundId');
    await host.click('#bNew');await wait(host,`ST.live.roundId!==${JSON.stringify(keyboardRound)}`);await wait(a,`me.live.roundId!==${JSON.stringify(keyboardRound)} && me.mode==="locked"`);await host.click('#bOpen');await wait(a,'me.mode==="open"');await a.eval('document.querySelector("#bz").focus()');await a.key(' ','Space');await wait(host,'ST.order.length===1');assert.equal(await host.eval('ST.order[0].id'),ids[0]);passed('Buzzer attivabile da tastiera senza doppia prenotazione');
    await a.shot('player-final-mobile');await host.shot('host-final-desktop');await tv.shot('tv-final-desktop');
    for(const p of [host,a,b,tv,spectator]){assert.deepEqual(p.errors,[]);assert.ok(await p.eval('document.documentElement.scrollWidth<=innerWidth+1'),'Horizontal viewport overflow');assert.deepEqual(await p.eval('[...document.images].filter(i=>i.offsetWidth && (!i.complete || !i.naturalWidth)).map(i=>i.src)'),[]);}
    passed('Nessuna eccezione JS, immagine visibile rotta o overflow orizzontale');
  }
  writeFileSync(join(out,'result.json'),JSON.stringify({at:new Date().toISOString(),base,baseline,checks,limitations:['Headless Chrome: no acoustic speaker verification, iOS Safari hardware, or low-end phone performance.']},null,2)+'\n');
  console.log(`Browser smoke: ${checks.length} checks passed. Artifacts: ${out}`);
}finally{if(browser)await browser.close();if(server)server.kill();}
