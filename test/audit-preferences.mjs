// Exploratory preferences/feedback audit. Does not change production files.
// Requires Node22+ Chrome. node test/audit-preferences.mjs
// Findings and screenshots: .taste-skill/audit-preferences/
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const port = Number(process.env.BROWSER_TEST_PORT || 3142);
const base = process.env.BROWSER_TEST_URL || `http://127.0.0.1:${port}`;
const out = resolve(process.env.BROWSER_TEST_OUT || '.taste-skill/audit-preferences');
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
    p.key=async(key,code=key)=>{await p.send('Page.bringToFront');await p.send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:({Escape:27,Tab:9,Enter:13,' ':32,Home:36,End:35,ArrowDown:40,ArrowUp:38,ArrowLeft:37,ArrowRight:39})[key]||0,...(key==='Enter'?{text:'\r',unmodifiedText:'\r'}:{})});await p.send('Input.dispatchKeyEvent',{type:'keyUp',key,code});};
    p.shot=async name=>{const {data}=await p.send('Page.captureScreenshot',{format:'jpeg',quality:80});writeFileSync(join(out,`${name}.jpg`),Buffer.from(data,'base64'));};
    return p;
  }
  async close(){try{await this.send('Browser.close');}catch{}try{this.ws.close();this.proc.kill();}catch{}await sleep(200);rmSync(this.profile,{recursive:true,force:true});}
}
async function wait(p,expression,timeout=6000){const started=Date.now();let last;while(Date.now()-started<timeout){try{last=await p.eval(expression);if(last)return last;}catch{}await sleep(50);}throw new Error(`Browser wait timed out: ${expression}; last=${JSON.stringify(last)}`);}
const emit=(p,event,data)=>p.eval(`new Promise((resolve,reject)=>s.timeout(2500).emit(${JSON.stringify(event)},${JSON.stringify(data)},(error,result)=>error?reject(error):resolve(result)))`);
let serial=0;
const live=(p,type,data={})=>emit(p,'live:act',{type,requestId:`browser-${++serial}`,...data});
const syntheticSetPref=(p,key,value)=>p.eval(`(()=>{const el=document.querySelector('[data-pref="'+${JSON.stringify(key)}+'"]');if(!el)throw Error('Missing preference '+${JSON.stringify(key)});if(el.type==='checkbox')el.checked=${JSON.stringify(value)};else el.value=${JSON.stringify(String(value))};el.dispatchEvent(new Event('input',{bubbles:true}));return BuzzerUX.getPreferences();})()`);
const checks=[],findings=[],coverage={},measurements={};
function check(name,pass,details={}){checks.push({name,pass:!!pass,...details});console.log(`${pass?'PASS':'FINDING'} ${name}`);}
function finding(id,severity,title,details){if(!findings.some(f=>f.id===id)){findings.push({id,severity,title,...details});console.log(`${severity}: ${title}`);}}
async function setting(p,key,value){
  if(!await p.eval('document.querySelector("#ux-settings-dialog").open'))await p.click('#ux-settings');
  const selector=`[data-pref="${key}"]`,meta=await p.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});return{type:e.type,value:e.type==='checkbox'?e.checked:e.value,options:e.options?[...e.options].map(x=>x.value):null};})()`);
  await p.eval(`document.querySelector(${JSON.stringify(selector)}).focus()`);
  if(meta.type==='checkbox'){if(meta.value!==value)await p.click(selector);}
  else if(meta.options){await p.key('Home');for(let i=0;i<meta.options.indexOf(value);i++)await p.key('ArrowDown');await p.key('Enter');}
  else {await p.key('Home');for(let i=0;i<value/5;i++)await p.key('ArrowRight');}
  const actual=await p.eval(`BuzzerUX.getPreferences()[${JSON.stringify(key)}]`),stored=await p.eval(`JSON.parse(localStorage.getItem('buzzer.preferences.v1'))?.[${JSON.stringify(key)}]`);
  check(`setting ${key}=${value}`,actual===value&&stored===value,{actual,stored});(coverage[key]??=[]).push(value);
  if(actual!==value)throw Error(`Control ${key} did not apply ${value}: ${actual}`);
}
async function closeSettings(p){if(await p.eval('document.querySelector("#ux-settings-dialog").open'))await p.key('Escape');}
async function resize(p,width,height){await p.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600||height<500});await sleep(100);}
const dimensions=`(()=>{const d=document.querySelector('#ux-settings-dialog');const c=document.createElement('canvas').getContext('2d');return{pageOverflow:document.documentElement.scrollWidth>innerWidth,dialogOverflow:d.scrollWidth>d.clientWidth,clippedSelects:[...d.querySelectorAll('select')].map(e=>{const s=getComputedStyle(e);c.font=s.font;const width=c.measureText(e.selectedOptions[0].textContent).width,available=e.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight);return{key:e.dataset.pref,text:e.selectedOptions[0].textContent,width,available};}).filter(e=>e.width>e.available+1),outside:[...d.querySelectorAll('label')].map(e=>({text:e.textContent.trim().slice(0,40),r:e.getBoundingClientRect().toJSON()})).filter(e=>e.r.left<d.getBoundingClientRect().left||e.r.right>d.getBoundingClientRect().right)}})()`;
const buzzerOverlap=`(()=>{const b=document.querySelector('#bz').getBoundingClientRect();return [...document.querySelectorAll('.ux-toast,#live-presence,#ux-settings,#chb')].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return{selector:e.id||e.className,overlap:r.left<b.right&&r.right>b.left&&r.top<b.bottom&&r.bottom>b.top,rect:r.toJSON(),buzzer:b.toJSON()};});})()`;
let server,browser;
try{
  mkdirSync(out,{recursive:true});
  server=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(port),HOST_PASS:'AUDIT',AFTERPARTY_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
  let logs='';server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);
  const started=Date.now();let healthy=false;while(Date.now()-started<6000){try{healthy=(await fetch(base+'/healthz')).ok;if(healthy)break;}catch{}await sleep(100);}if(!healthy)throw Error(logs);
  browser=await CDP.launch();
  const host=await browser.page(1440,900),p=await browser.page(),other=await browser.page();
  await host.goto('/host.html');await wait(host,'s.connected&&!document.querySelector("#setup").hidden');await host.click('#mk');await wait(host,'ST');const room=await host.eval('cred');
  for(const [page,nick] of [[p,'Audit accessibile'],[other,'Seconda squadra']]){await page.goto('/player.html?c='+room.code);await wait(page,'s.connected');await page.fill('#n',nick);await page.click('#go');await wait(page,'me.id');}
  await host.click('#bStart');await wait(p,'me.mode==="locked"');await host.click('#bOpen');await wait(p,'me.mode==="open"');
  const pid=await p.eval('me.id');
  await p.click('#ux-settings');check('Settings focus starts on close',await p.eval('document.activeElement.id')==='ux-settings-close');
  // Every enum value, toggle state and volume boundary is changed through native keyboard/mouse input.
  for(const [key,values] of Object.entries({theme:['light','dark','system'],textSize:['normal','large'],backgrounds:['off','light','full'],motion:['system','reduce']}))for(const value of values)await setting(p,key,value);
  for(const key of ['highContrast','reduceTransparency','focusMode','visualFeedback','sounds','receiveHostAudio'])for(const value of [false,true])await setting(p,key,value);
  for(const [key,normal] of [['buzzVolume',65],['effectsVolume',45]])for(const value of [0,normal,100])await setting(p,key,value);
  const schema=await p.eval('Object.keys(BuzzerUX.getPreferences())');check('Every preference covered',schema.every(key=>coverage[key]),{schema,coverage});
  await setting(p,'theme','system');for(const theme of ['light','dark']){await p.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme}]});await wait(p,`document.documentElement.dataset.uxTheme===${JSON.stringify(theme)}`);check(`System follows ${theme}`,true);}
  await setting(p,'theme','light');await p.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});check('Explicit theme ignores system',await p.eval('document.documentElement.dataset.uxTheme')==='light');
  await setting(p,'motion','system');await p.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await wait(p,'document.documentElement.dataset.uxMotion==="reduce"');check('System reduced motion overrides preference',true);
  await p.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});await wait(p,'document.documentElement.dataset.uxMotion==="normal"');
  await setting(p,'highContrast',false);await setting(p,'reduceTransparency',false);await setting(p,'focusMode',false);await setting(p,'textSize','large');
  measurements.layouts=[];
  for(const [width,height] of [[320,568],[390,844],[844,390]])for(const theme of ['light','dark']){
    await resize(p,width,height);await setting(p,'theme',theme);await p.eval('document.querySelector("#ux-settings-dialog").scrollTop=0');
    const result=await p.eval(dimensions);measurements.layouts.push({width,height,theme,...result});await p.shot(`settings-${width}x${height}-${theme}-large`);
    check(`layout ${width}x${height} ${theme}`,!result.pageOverflow&&!result.dialogOverflow,{result});
    if(result.clippedSelects.length)finding('PREF-01','P2','Le opzioni selezionate si troncano nel testo grande',{selectors:'[data-pref=theme], [data-pref=backgrounds], [data-pref=motion]',reproduce:'Impostazioni → Dimensione testo Grande; telefono320/390px; osservare le opzioni dei menu.',evidence:result.clippedSelects,screenshot:`settings-${width}x${height}-${theme}-large.jpg`,files:['public/experience.css:47','public/experience.css:83']});
  }
  await resize(p,390,844);await setting(p,'theme','dark');await setting(p,'textSize','normal');
  await p.eval('document.querySelector("#ux-settings-dialog").querySelector("a").focus()');await p.key('Tab');check('Tab wraps to modal close',await p.eval('document.activeElement.id')==='ux-settings-close');
  await p.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8});await p.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8});check('Shift Tab wraps inside dialog',await p.eval('document.activeElement.tagName')==='A');
  await closeSettings(p);check('Escape restores trigger focus',await p.eval('document.activeElement.id')==='ux-settings');
  await setting(p,'reduceTransparency',true);const backdrop=await p.eval('getComputedStyle(document.querySelector("#ux-settings-dialog"),"::backdrop").backgroundColor'),ground=await p.eval('getComputedStyle(document.body).backgroundColor');check('Reduced transparency opaque settings backdrop',backdrop===ground,{backdrop,ground});
  if(backdrop!==ground)finding('PREF-05','P2','Riduci trasparenze lascia il velo trasparente del pannello',{reproduce:'Aprire Impostazioni, attivare Riduci trasparenze, osservare lo sfondo attraverso il velo.',evidence:{backdrop,ground},files:['public/experience.css:78'],screenshot:'reduced-transparency.jpg'});await p.shot('reduced-transparency');
  await closeSettings(p);await host.click('#live-modes');measurements.liveBackdrop=await host.eval('getComputedStyle(document.querySelector("#live-mode-dialog"),"::backdrop").backgroundColor');await host.key('Escape');
  await setting(p,'focusMode',true);await closeSettings(p);check('Focus mode removes ambient',await p.eval('getComputedStyle(document.querySelector(".ux-ambient")).display')==='none');
  // Capture actual user interactions; instrument Web Audio starts without recording/acoustic claims.
  for(const page of [p,other])await page.eval(`window.__effects=[];window.__plays=[];const original=BuzzerUX.play;BuzzerUX.play=function(name,opts){const result=original.call(this,name,opts);__plays.push({name,opts,result});return result;};s.on('effect',e=>__effects.push(e));undefined`);
  await setting(p,'sounds',true);await setting(p,'receiveHostAudio',true);await setting(p,'buzzVolume',65);await setting(p,'effectsVolume',45);await setting(p,'visualFeedback',true);await p.click('#ux-test-audio');await wait(p,'BuzzerUX.audioStatus()==="ready"');await sleep(300);check('Audio test schedules personal press and fanfare',await p.eval('__plays.some(x=>x.name==="press"&&x.result)&&__plays.some(x=>x.name==="fanfare"&&x.result)'));
  await closeSettings(p);await host.click(`#sq [data-player-action="${pid}"]`);await wait(host,'document.querySelector("#live-player-dialog").open');
  measurements.reactions=[];
  for(const value of ['👏','🔥','🎉','😂','💪','❤️']){
    await sleep(1050);const before=await p.eval('__effects.length');await host.click(`[data-effect="reaction"][data-value="${value}"]`);await wait(p,`__effects.length>${before}`);await sleep(100);
    const overlap=await p.eval(buzzerOverlap),count=await p.eval('document.querySelectorAll(".ux-toast").length');measurements.reactions.push({value,overlap,count});check(`Private reaction ${value}`,await other.eval('__effects.length')===0&&count<=2);
    if(overlap.some(x=>x.overlap))finding('PREF-02','P1','Feedback ricevuto copre il buzzer',{reproduce:'In partita, inviare una reazione dal menu della squadra; osservare il telefono.',evidence:overlap,screenshot:'reaction-focus-mode.jpg',files:['public/experience.css:58']});
    if(value==='👏')await p.shot('reaction-focus-mode');
  }
  const animated=await p.eval('[...document.querySelectorAll(".ux-toast")].map(e=>getComputedStyle(e).animationName)');measurements.focusAnimations=await p.eval('document.getAnimations().filter(a=>a.effect?.target?.classList?.contains("ux-toast")).map(a=>({name:a.animationName,playState:a.playState,currentTime:a.currentTime}))');check('Focus mode reaction animations',animated.every(x=>x==='none'),{animated,active:measurements.focusAnimations});
  if(animated.some(x=>x!=='none'))finding('PREF-03','P2','Modalità concentrazione mantiene l’animazione delle reazioni',{reproduce:'Attivare Modalità concentrazione; ricevere una reazione privata.',evidence:animated,files:['public/experience.css:75','public/experience.css:59'],screenshot:'reaction-focus-mode.jpg'});
  // Native Enter activation of the first reaction button.
  await sleep(1050);let before=await p.eval('__effects.length');await host.eval('document.querySelector("[data-effect=reaction]").focus()');await host.key('Enter');await wait(p,`__effects.length>${before}`);check('Host reaction usable from keyboard',true);
  for(const value of ['applause','fanfare','drumroll','comic']){
    await sleep(3100);before=await p.eval('__effects.length');await host.click(`[data-effect="sound"][data-value="${value}"]`);await wait(p,`__effects.length>${before}`);await sleep(100);check(`Private sound ${value}`,await p.eval(`__plays.some(x=>x.name===${JSON.stringify(value)}&&x.opts?.received&&x.result)`));
  }
  await setting(p,'receiveHostAudio',false);await closeSettings(p);await sleep(3100);before=await p.eval('__effects.length');await host.click('[data-effect="sound"][data-value="applause"]');await wait(p,`__effects.length>${before}`);check('Host audio disabled preserves visual cue',await p.eval('__plays.at(-1).result===false && document.querySelectorAll(".ux-toast[data-kind=sound]").length>0'));
  await setting(p,'visualFeedback',false);await closeSettings(p);await sleep(3100);before=await p.eval('__effects.length');await host.click('[data-effect="sound"][data-value="comic"]');await wait(p,`__effects.length>${before}`);await p.shot('host-audio-and-visual-disabled');check('Visual feedback disabled with audio optout',await p.eval('__plays.at(-1).result===false'));
  await setting(p,'sounds',false);await p.click('#ux-test-audio');check('Muted audio test explains mute',await p.eval('document.querySelector("#ux-audio-status").textContent.includes("disattivati")'));await setting(p,'sounds',true);await setting(p,'receiveHostAudio',true);await setting(p,'visualFeedback',true);await closeSettings(p);
  await sleep(1050);before=await p.eval('__effects.length');await host.click('[data-effect="presence"]');await wait(p,`__effects.length>${before}&&me.presence`);await p.shot('presence-mobile');check('Presence does not obscure buzzer',!(await p.eval(buzzerOverlap)).some(x=>x.overlap));
  await p.eval('document.querySelector("#presence-reply").focus()');await p.key('Enter');await wait(p,'!me.presence');check('Presence response from keyboard',true);
  await host.key('Escape');
  for(const [width,height] of [[320,568],[390,844],[844,390]]){
    await resize(p,width,height);await setting(p,'textSize','large');await closeSettings(p);await p.shot(`game-${width}x${height}-large`);measurements[`game-${width}`]=await p.eval(buzzerOverlap);
    check(`Buzzer controls ${width}x${height}`,!(await p.eval(buzzerOverlap)).some(x=>x.overlap));
  }
  // Observe actual idle DOM churn with decorations disabled, not a synthetic stress benchmark.
  await resize(p,390,844);await setting(p,'backgrounds','off');await closeSettings(p);
  measurements.idle=await p.eval(`new Promise(resolve=>{let attributes=0,text=0;const sample={};const ob=new MutationObserver(records=>{for(const r of records){if(r.type==='attributes'){attributes++;const k=(r.target.id||r.target.className)+':'+r.attributeName;sample[k]=(sample[k]||0)+1;}else text++;}});ob.observe(document.querySelector('#live-strip'),{subtree:true,attributes:true,childList:true,characterData:true});setTimeout(()=>{ob.disconnect();resolve({milliseconds:2200,attributes,text,sample});},2200);})`);
  if(measurements.idle.attributes>10)finding('PREF-04','P3','Il pannello modalità riscrive attributi anche quando tutto è fermo',{reproduce:'Round aperto senza timer/countdown, sfondi spenti; osservare #live-strip con MutationObserver per2.2s.',evidence:measurements.idle,files:['public/live-ui.js:168','public/live-ui.js:268']});
  await setting(p,'motion','reduce');await closeSettings(p);await sleep(1050);await host.click(`#sq [data-player-action="${pid}"]`);await host.click('[data-effect="reaction"][data-value="🎉"]');await sleep(100);check('Reduced movement suppresses reaction animation',await p.eval('[...document.querySelectorAll(".ux-toast")].every(e=>getComputedStyle(e).animationName==="none")'));await p.shot('reduced-motion-reaction');await host.key('Escape');
  const prefs=await p.eval('BuzzerUX.getPreferences()');await p.goto('/player.html?c='+room.code);await wait(p,'me.id');check('All final preferences persist after reload',JSON.stringify(await p.eval('BuzzerUX.getPreferences()'))===JSON.stringify(prefs));check('Other player preferences remain personal',await other.eval('BuzzerUX.getPreferences().focusMode')===false);
  check('No runtime exceptions',host.errors.length+p.errors.length+other.errors.length===0,{errors:[...host.errors,...p.errors,...other.errors]});
}catch(error){check('Audit execution finished',false,{error:error.stack});process.exitCode=1;}
finally{
  writeFileSync(join(out,'result.json'),JSON.stringify({at:new Date().toISOString(),checks,coverage,findings,measurements,limits:['Chrome headless, not acoustic testing or physical phones.','Every preference exercised individually; not every possible combination.']},null,2)+'\n');
  if(browser)await browser.close();if(server)server.kill();console.log(`Audit completed: ${checks.filter(x=>x.pass).length}/${checks.length} checks; ${findings.length} findings. ${out}`);
}
