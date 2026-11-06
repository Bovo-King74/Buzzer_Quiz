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
  async close(){try{await this.send('Browser.close');}catch{}try{this.ws.close();this.proc.kill();}catch{}await sleep(200);rmSync(this.profile,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
}
async function wait(p,expression,timeout=6000){const started=Date.now();let last;while(Date.now()-started<timeout){try{last=await p.eval(expression);if(last)return last;}catch{}await sleep(50);}throw new Error(`Browser wait timed out: ${expression}; last=${JSON.stringify(last)}`);}
const emit=(p,event,data)=>p.eval(`new Promise((resolve,reject)=>s.timeout(2500).emit(${JSON.stringify(event)},${JSON.stringify(data)},(error,result)=>error?reject(error):resolve(result)))`);
let serial=0;
const live=(p,type,data={})=>emit(p,'live:act',{type,requestId:`browser-${++serial}`,...data});
const setPref=(p,key,value)=>p.eval(`(()=>{const el=document.querySelector('[data-pref="'+${JSON.stringify(key)}+'"]');if(!el)throw Error('Missing preference '+${JSON.stringify(key)});if(el.type==='checkbox')el.checked=${JSON.stringify(value)};else el.value=${JSON.stringify(String(value))};el.dispatchEvent(new Event('input',{bubbles:true}));return BuzzerUX.getPreferences();})()`);
const checks=[];
function passed(name){checks.push(name);console.log(`✓ ${name}`);}

const findings=[], coverage=[];
const note=(id,title,evidence)=>{findings.push({id,title,evidence});console.log('FINDING',id,title,JSON.stringify(evidence));};
const checked=(area,result)=>{coverage.push({area,result});console.log('CHECK',area,JSON.stringify(result));};
let server,browser;
try {
 mkdirSync(out,{recursive:true});
 server=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(port),HOST_PASS:'BROWSER'},stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{server.stdout.on('data',()=>resolve());server.on('exit',()=>reject(Error('server failed')));});
 browser=await CDP.launch();
 const h=await browser.page(1440,900),a=await browser.page(),b=await browser.page(),tv=await browser.page(1280,800);
 for(const p of [h,a,b,tv])p.onDialog=[];
 // Dialogs use actual browser confirm, accepted for this isolated audit room.
 for(const p of [h,a,b,tv]) { await p.send('Page.enable'); }
 await h.goto('/host.html');await wait(h,'s.connected');
 await h.fill('#pw','WRONG');await h.click('#mk');await wait(h,'document.querySelector("#merr").textContent');checked('password errata',await h.eval('document.querySelector("#merr").textContent'));
 await h.eval('document.querySelector("#pw").value=""');await h.fill('#pw','BROWSER');await h.click('#mk');await wait(h,'ST');
 const room=await h.eval('cred');
 await h.click('#key');checked('mostra/nascondi chiave',await h.eval('document.querySelector("#key").textContent===cred.key'));await h.click('#key');
 await h.click('#sJoin');await wait(h,'!ST.set.joinOpen');
 await a.goto('/player.html?c='+room.code);await a.fill('#n','Squadra molto 1');await a.click('#go');await wait(a,'document.querySelector("#err").textContent');checked('ingressi chiusi',await a.eval('document.querySelector("#err").textContent'));
 await h.click('#sJoin');await h.click('#sApp');await wait(h,'ST.set.approve');await a.click('#go');await wait(a,'me.mode==="pending"');
 const id1=await a.eval('me.id');await h.click(`[data-id="${id1}"] [data-a="approve"]`);await wait(a,'me.mode==="lobby"');checked('approvazione',true);
 await b.goto('/player.html?c='+room.code);await b.fill('#n','Squadra molto 2');await b.click('#go');await wait(b,'me.mode==="pending"');const id2=await b.eval('me.id');
 await h.click(`[data-id="${id2}"] [data-a="reject"]`);await wait(b,'!cred');checked('rifiuto accesso',true);
 await h.click('#sApp');await wait(h,'!ST.set.approve');await b.click('#go');await wait(b,'me.mode==="lobby"');const idb=await b.eval('me.id');
 await tv.goto('/tv.html?c='+room.code);await wait(tv,'ST');
 const qrKey=await h.eval('({tabIndex:document.querySelector("#lqr").tabIndex,role:document.querySelector("#lqr").getAttribute("role")})');note('UI-QR','Ingrandimento QR escluso dalla navigazione tastiera',qrKey);
 await h.click('#lqr');await h.key('Escape');checked('QR mouse ed Escape',await h.eval('document.querySelector("#big").hidden'));
 await h.click('[data-t="ch"]');await h.fill('#ct','Messaggio host');await h.click('#cs');if(await h.eval('document.querySelector("#ux-settings-dialog").open')){note('UI-HOST-CHAT','Impostazioni intercetta Invia nella chat host',true);await h.shot('host-chat-settings-overlap');await h.key('Escape');}await h.eval('document.querySelector("#ct").focus()');await h.key('Enter');await wait(a,'document.querySelector("#log").textContent.includes("Messaggio host")');
 await a.click('#chb');const initialFocus=await a.eval('document.activeElement.id');await a.key('Escape');note('UI-CHAT','Chat partecipante non si chiude con Escape e non sposta il focus',await a.eval(`({open:!document.querySelector('#chat').hidden,focus:document.activeElement.id,modal:document.querySelector('#chat').getAttribute('aria-modal')})`));await a.click('#cx');
 await a.click('#chb');await a.fill('#ct','Messaggio squadra');await a.click('#cs');if(await a.eval('document.querySelector("#ux-settings-dialog").open')){note('UI-PLAYER-CHAT','Impostazioni intercetta Invia anche nella chat partecipante',true);await a.shot('player-chat-settings-overlap');await a.key('Escape');}await a.eval('document.querySelector("#ct").focus()');await a.key('Enter');await wait(h,'document.querySelector("#log").textContent.includes("Messaggio squadra")');checked('chat bidirezionale',true);
 await a.eval('window.__draftFocus=document.activeElement.id');await a.click('#stk img');await sleep(1100);await a.click('#cs');if(await a.eval('document.querySelector("#ux-settings-dialog").open')){note('UI-PLAYER-CHAT','Impostazioni intercetta Invia anche nella chat partecipante',true);await a.shot('player-chat-settings-overlap');await a.key('Escape');}await a.eval('document.querySelector("#ct").focus()');await a.key('Enter');await wait(h,'document.querySelector("#log .msg:last-child img")');checked('adesivo chat',true);
 await h.click('#sChat');await wait(a,'!me.chat');checked('disattiva chat',await a.eval('document.querySelector("#chat").hidden&&document.querySelector("#chb").hidden'));await h.click('#sChat');await wait(a,'me.chat');
 const extra=await browser.page();await extra.goto('/player.html?c='+room.code);await extra.fill('#n','Con selfie');await extra.send('DOM.enable');const documentNode=await extra.send('DOM.getDocument');const fileNode=await extra.send('DOM.querySelector',{nodeId:documentNode.root.nodeId,selector:'#f'});await extra.send('DOM.setFileInputFiles',{nodeId:fileNode.nodeId,files:[resolve('public/assets/icons8/trophy.png')]});await wait(extra,'!document.querySelector("#pv").hidden');await extra.click('#go');await wait(extra,'me.id');checked('selfie upload e preview',await extra.eval('!!me.avatar'));const extraId=await extra.eval('me.id');await h.click(`#lsq [data-player-action="${extraId}"]`);await h.eval('window.confirm=()=>true');await h.click('[data-manage="kick"]');await wait(extra,'!cred');checked('espulsione',await extra.eval('document.querySelector("#err").textContent'));
 const secondHost=await browser.page(1440,900);await secondHost.goto('/host.html');await secondHost.fill('#jc',room.code);await secondHost.fill('#jk',room.key);await secondHost.click('#jn');await wait(secondHost,'ST');checked('collega secondo host da form',await secondHost.eval('ST.code'));
 await h.click('#bStart');await wait(a,'me.mode==="locked"');
 await a.eval('window.__quick=[];s.on("effect",e=>__quick.push(e));undefined');await b.eval('window.__quick=[];s.on("effect",e=>__quick.push(e));undefined');await h.click(`#sq [data-player-action="${id1}"]`);
 for(const message of ['Tocca a te!','Grande risposta!','Preparati!']){await h.click(`[data-effect="message"][data-value="${message}"]`);await wait(a,`__quick.at(-1)?.value===${JSON.stringify(message)}`);checked('messaggio rapido '+message,await b.eval('__quick.length===0'));await sleep(750);}await h.key('Escape');
 await h.eval('document.querySelector("#sPts").value="10";document.querySelector("#sPts").dispatchEvent(new Event("change"))');await wait(h,'ST.set.pts===10');
 await h.click('#bOpen');await wait(a,'me.mode==="open"');await a.click('#bz');await wait(h,'ST.phase==="answering"');await h.click('#bOk');await wait(a,'me.score===10');checked('punti10 e corretta',true);
 await h.click('#bUndo');await wait(a,'me.score===0');checked('Annulla',true);
 await h.click('#bNew');await wait(h,'ST.order.length===0');await h.click('#sAuto');await wait(h,'!ST.set.autoReopen');await h.click('#bOpen');await wait(a,'me.mode==="open"');await a.click('#bz');await wait(h,'ST.phase==="answering"');await h.click('#bKo');await wait(h,'ST.phase==="locked"');checked('auto riapertura spenta',true);await h.click('#sAuto');
 // Actual focused control prevents documented shortcuts from reaching the game.
 await h.click('#bOpen');await wait(h,'ST.phase==="open"');await h.key('s','KeyS');checked('scorciatoia con focus sul pulsante',await h.eval('({phase:ST.phase,focus:document.activeElement.id})'));await h.key(' ','Space');await sleep(100);checked('Spazio dopo Apri verifica stato effettivo',await h.eval('({phase:ST.phase,focus:document.activeElement.id})'));
 await h.click('#bNew');await wait(h,'ST.order.length===0&&ST.phase==="locked"');await h.click('#bOpen');await wait(a,'me.mode==="open"');await a.click('#bz');await b.click('#bz');await wait(h,'ST.order.length===2');await h.click('#bLock');await wait(h,'ST.phase==="locked"');await h.click('#bOpen');await sleep(150);note('GAME-LOCK','Blocca e riapri lasciano coda con due prenotati senza rispondente',await h.eval('({phase:ST.phase,ans:ST.ans,order:ST.order.map(x=>x.id)})'));
 // All secondary commands with current UI feedback, including invalid states.
 await h.click('#live-modes');await h.click('#timer-start').catch(()=>{});checked('timer start senza risposta',await h.eval('document.querySelector("#timer-start").disabled'));
 for(const type of ['countdown:cancel','timer:pause','timer:resume','timer:reset','applause:stop','applause:clear','draw:clear','draw:reset','spotlight:clear']){const sel=`[data-live="${type}"]`;if(await h.eval(`!!document.querySelector(${JSON.stringify(sel)})`)){await h.click(sel);await sleep(80);checked(type,await h.eval('document.querySelector(".live-dialog-notice").textContent'));}}
 await h.key('Escape');
 await h.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(150);await h.shot('host-phone');
 const reach=await h.eval(`(()=>{const e=document.querySelector('#sJoin');e.scrollIntoView();const r=e.getBoundingClientRect();return {scrollY:scrollY,totalHeight:document.documentElement.scrollHeight,controlY:r.y};})()`);checked('regia telefono impostazioni stanza',reach);
 await h.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 // UI payload / DOM churn under applause is measured even while no score changes.
 await h.click('#bNew');await wait(h,'ST.phase==="locked"');await h.eval('window.__mutations=0;new MutationObserver(m=>__mutations+=m.length).observe(document.querySelector("#cmd"),{subtree:true,childList:true,attributes:true,characterData:true});undefined');
 await h.click('#live-modes');await h.click('[data-live="applause:start"]');await wait(a,'me.live.applause');await h.key('Escape');
 await a.eval('window.__packets=[];s.on("me",m=>__packets.push(JSON.stringify(m).length));undefined');
 for(let i=0;i<5;i++){await a.click('[data-applaud="👏"]');await sleep(850);}
 checked('applausometro5invii',await h.eval('({commandMutations:__mutations,count:ST.live.applause.counts["👏"]})'));checked('payload5reazioni',await a.eval('__packets'));
 await h.click('#live-modes');await h.click('[data-live="applause:stop"]');await wait(h,'ST.live.applause.closed');await h.click('[data-live="applause:clear"]');await wait(h,'!ST.live.applause');await h.key('Escape');
 // Remaining mode variants and manual TV reconnection, through browser controls.
 await h.click('#bNew');await wait(h,'ST.order.length===0');await h.click('#live-go');await wait(h,'ST.live.countdown');await h.click('#live-go');await wait(h,'!ST.live.countdown');checked('countdown avvio/annulla',true);
 await h.click('#live-modes');await h.click('#duel-start');await wait(h,'ST.live.duel.length===2');await h.click('[data-live="duel:end"]');await wait(h,'ST.live.duel.length===0');checked('duello avvio/uscita',true);
 for(const exclude of [true,false]){await h.eval(`document.querySelector('#draw-exclude').checked=${exclude}`);await h.click('#draw-start');await wait(h,'ST.live.draw');checked('estrazione exclude='+exclude,await h.eval('ST.live.draw.nick'));await h.click('[data-live="draw:clear"]');await wait(h,'!ST.live.draw');}
 await h.key('Escape');await h.click('#bOpen');await wait(a,'me.mode==="open"');await a.click('#bz');await wait(h,'ST.phase==="answering"');await h.click('#live-modes');
 for(const seconds of [10,20,30]){await h.eval(`document.querySelector('#timer-seconds').value='${seconds}'`);await h.click('#timer-start');await wait(h,`ST.live.timer?.durationMs===${seconds*1000}`);await h.click('#timer-toggle');await wait(h,'ST.live.timer.status==="paused"');await h.click('#timer-toggle');await wait(h,'ST.live.timer.status==="running"');await h.click('[data-live="timer:reset"]');await wait(h,'!ST.live.timer');checked('timer '+seconds+' avvio/pausa/riprendi/reset',true);}
 await h.key('Escape');await h.click('#bNew');await wait(h,'ST.phase==="locked"');
 const manualTv=await browser.page(1280,800);await manualTv.goto('/tv.html');await wait(manualTv,'s.connected');await manualTv.fill('#tvc',room.code);await manualTv.click('#tvf button');await wait(manualTv,'ST');const oldSum=await manualTv.eval('ST.players.reduce((n,p)=>n+p.score,0)');
 await manualTv.eval('s.disconnect();s.connect();undefined');await wait(manualTv,'s.connected');await h.click(`#sq [data-id="${id1}"] [data-v="1"]`);await sleep(200);const newSum=await h.eval('ST.players.reduce((n,p)=>n+p.score,0)');note('TV-RECONNECT','TV con ingresso manuale non recupera lo stato dopo riconnessione',{before:oldSum,afterTV:await manualTv.eval('ST.players.reduce((n,p)=>n+p.score,0)'),afterHost:newSum});
 // Host moderation via actual modal, with confirm handled at protocol level.
 await h.eval('window.confirm=()=>true');await h.click(`#sq [data-player-action="${idb}"]`);await h.click('[data-manage="ban"]');await wait(b,'!cred');await h.click('[data-t="ac"]');await wait(h,'document.querySelector("[data-a=unban]")');await h.click('[data-a="unban"]');await wait(h,'ST.banned.length===0');checked('ban e riammissione',await h.eval('ST.banned.length===0'));await b.click('#go');await wait(b,'me.id');
 await h.click('#bReset');await sleep(100);checked('reset punteggi',await h.eval('ST.players.every(p=>p.score===0)'));
 await h.click('#bEnd');await wait(h,'!document.querySelector("#podium").hidden');await h.shot('final-host');
 await a.goto('/player.html?c='+room.code);await sleep(250);note('FINAL-RELOAD','Ricaricare durante podio respinge il partecipante invece di recuperare finale',await a.eval('({error:document.querySelector("#err").textContent,podium:!document.querySelector("#podium").hidden})'));
 await h.click('#podium button');await sleep(500);note('FINAL-NEW','Nuova partita nel podio ricarica la stanza terminata senza aprire creazione',await h.eval('({setup:!document.querySelector("#setup").hidden,app:!document.querySelector("#app").hidden,podium:!document.querySelector("#podium").hidden,phase:ST?.phase,cred:cred?.code})'));
 // Separate Afterparty full five-round journey through real browser controls.
 const ah=await browser.page(1440,900),aa=await browser.page(),ab=await browser.page();
 await ah.goto('/afterparty/');await ah.click('#host-details summary');await ah.fill('#password','BROWSER');await ah.click('#create-form button');await wait(ah,'!document.querySelector("#room").hidden');const apCode=await ah.eval('document.querySelector("#room-code").textContent');
 for(const [p,name] of [[aa,'Squadra A'],[ab,'Squadra B']]){await p.goto('/afterparty/?c='+apCode);await p.fill('#name',name);await p.click('#join-form button');await wait(p,'!document.querySelector("#room").hidden');}
 await ah.click('[data-action="copy"]');await sleep(100);checked('Afterparty copia invito',await ah.eval('document.querySelector("#error").textContent||document.querySelector("[data-action=copy]").textContent'));
 await ah.eval('window.confirm=()=>true');await ah.click('[data-remove]');await wait(ah,'document.querySelectorAll("[data-remove]").length===1');checked('Afterparty rimuovi in lobby',true);const removed=await aa.eval('document.querySelector("#entry").hidden')?ab:aa;await removed.click('#join-form button');await wait(ah,'document.querySelectorAll("[data-remove]").length===2');await ah.click('[data-action="advance"]');
 for(let round=1;round<=5;round++){
  for(const [p,name] of [[aa,'Alfa'],[ab,'Beta']]){await wait(p,'document.querySelector("#bluff")');await p.fill('#bluff',`Risposta inventata ${name} numero ${round}`);await p.click('#bluff-form button');}
  for(const p of [aa,ab]){await wait(p,'document.querySelector("[data-vote]:not(:disabled)")');await p.click('[data-vote]:not(:disabled)');}
  await wait(ah,'document.querySelector(".correct")');await ah.shot('afterparty-reveal-'+round);await ah.click('[data-action="advance"]');
 }
 await wait(ah,'document.querySelector("[data-action=export]")');await ah.click('[data-action="export"]');checked('Afterparty5round e download riepilogo',true);await aa.shot('afterparty-final-phone');
 await aa.eval('window.confirm=()=>true');await aa.click('#leave');await wait(aa,'!document.querySelector("#entry").hidden');checked('Afterparty esci',true);
 checked('eccezioni runtime',Object.fromEntries([['host',h.errors],['a',a.errors],['b',b.errors],['tv',tv.errors],['afterparty',ah.errors]]));
} finally {writeFileSync(join(out,'audit.json'),JSON.stringify({findings,coverage},null,2));try{if(browser)await browser.close();}finally{if(server)server.kill();}}
