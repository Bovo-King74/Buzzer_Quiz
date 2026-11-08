const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const artifacts = path.resolve('.taste-skill/playwright');
const viewports = [{ width:1280,height:720 },{width:1366,height:768},{width:1440,height:900}];
test.beforeAll(async({browser})=>{fs.mkdirSync(artifacts,{recursive:true});fs.writeFileSync(path.join(artifacts,'environment.json'),JSON.stringify({playwright:require('@playwright/test/package.json').version,browser:browser.version(),channel:'chrome',node:process.version},null,2)+'\n');});
async function settleDialog(page,selector){await expect(page.locator(selector)).toBeVisible();await expect.poll(()=>page.locator(selector).evaluate(el=>Number(getComputedStyle(el).opacity))).toBe(1);}
const evaluateLayout = () => {
  const elements=[...document.querySelectorAll('body *')].filter(el=>el.getClientRects().length);
  return {
    viewport:{width:innerWidth,height:innerHeight},
    document:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,clientWidth:document.documentElement.clientWidth,clientHeight:document.documentElement.clientHeight},
    scrollContainers:elements.filter(el=>el.scrollHeight>el.clientHeight+1||el.scrollWidth>el.clientWidth+1).map(el=>({selector:el.id?'#'+el.id:el.tagName.toLowerCase()+'.'+String(el.className).replaceAll(' ','.'),clientWidth:el.clientWidth,clientHeight:el.clientHeight,scrollWidth:el.scrollWidth,scrollHeight:el.scrollHeight,overflow:getComputedStyle(el).overflow,overflowY:getComputedStyle(el).overflowY,rect:el.getBoundingClientRect().toJSON(),minHeight:getComputedStyle(el).minHeight,padding:getComputedStyle(el).padding})).slice(0,30),
    outside:elements.filter(el=>{const r=el.getBoundingClientRect();return r.left<-1||r.right>innerWidth+1||r.bottom>innerHeight+1||r.top<-1}).map(el=>({selector:el.id?'#'+el.id:el.tagName.toLowerCase()+'.'+String(el.className).replaceAll(' ','.'),rect:el.getBoundingClientRect().toJSON(),position:getComputedStyle(el).position})).slice(0,30)
  };
};
async function createLegacyHost(browser,baseURL){
  const context=await browser.newContext(),page=await context.newPage();await page.goto(baseURL+'/host.html');if(await page.locator('#pw').count())await page.locator('#pw').fill('PLAYWRIGHT');await page.locator('#mk').click();await expect(page.locator('#app')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>typeof ST!=='undefined'&&ST?.code)).toBeTruthy();return{context,page,room:await page.evaluate(()=>cred)};
}
test('baseline: misure scroll delle schermate esistenti prima delle modifiche', async({browser,baseURL})=>{
  test.skip(process.env.PW_BASELINE!=='1','Run explicitly before UI changes with PW_BASELINE=1');
  fs.mkdirSync(path.join(artifacts,'before'),{recursive:true});
  const host=await createLegacyHost(browser,baseURL),report=[];
  await host.page.locator('#bStart').click();
  for(const viewport of viewports){
    const context=await browser.newContext({viewport}),page=await context.newPage();await page.goto(baseURL+'/player.html?c='+host.room.code);await expect(page.locator('#join')).toBeVisible();
    await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:path.join(artifacts,'before',`join-${viewport.width}x${viewport.height}.png`)});
    report.push({view:'join',...await page.evaluate(evaluateLayout)});
    await page.locator('#n').fill('Baseline '+viewport.width);await page.locator('#go').click();await expect(page.locator('#game')).toBeVisible();
    if(viewport.width===1280){await expect(host.page.locator('#bOpen')).toBeEnabled();await host.page.locator('#bOpen').click();}
    await expect(page.locator('#bz')).toBeEnabled();await page.screenshot({path:path.join(artifacts,'before',`player-${viewport.width}x${viewport.height}.png`)});report.push({view:'game',...await page.evaluate(evaluateLayout)});
    await context.close();
  }
  fs.writeFileSync(path.join(artifacts,'before','layout.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));await host.context.close();
});

test('menu: tre percorsi, doppia creazione idempotente, chiave host, cronologia e QR',async({browser,baseURL})=>{
  test.skip(process.env.PW_BASELINE==='1');
  fs.mkdirSync(path.join(artifacts,'after'),{recursive:true});
  const context=await browser.newContext({viewport:viewports[0]}),page=await context.newPage();
  await page.goto(baseURL+'/player.html');await expect(page.locator('#start-menu')).toBeVisible();
  await expect(page.locator('#menu-join')).toBeVisible();await expect(page.locator('#menu-create')).toBeVisible();await expect(page.locator('#menu-host')).toBeVisible();
  await page.locator('#menu-join').click();await expect(page.locator('#joinform')).toBeVisible();await expect(page).toHaveURL(/#join$/);await page.goBack();await expect(page.locator('#start-menu')).toBeVisible();
  const before=await page.request.get(baseURL+'/healthz').then(r=>r.json());
  await page.locator('#menu-create').dblclick({delay:20});await expect(page).toHaveURL(/host\.html/);await expect(page.locator('#app')).toBeVisible();await expect.poll(()=>page.evaluate(()=>ST?.code)).toBeTruthy();
  const after=await page.request.get(baseURL+'/healthz').then(r=>r.json());expect(after.games-before.games).toBe(1);
  const room=await page.evaluate(()=>JSON.parse(localStorage.hostGame));expect(room.code).toMatch(/^[A-Z]{4}$/);expect(room.key).toBeTruthy();
  await page.screenshot({path:path.join(artifacts,'after','host-created-desktop.png')});
  const resumedContext=await browser.newContext(),resumed=await resumedContext.newPage();await resumed.goto(baseURL+'/player.html');await resumed.locator('#menu-host').click();await expect(resumed.locator('#jnf')).toBeVisible();await resumed.locator('#jc').fill(room.code);await resumed.locator('#jn').click();await expect(resumed.locator('#jerr')).not.toHaveText('');await expect(resumed.locator('#app')).toBeHidden();
  await resumed.locator('#jk').fill(room.key);await resumed.locator('#jn').click();await expect(resumed.locator('#app')).toBeVisible();
  const inviteContext=await browser.newContext(),invite=await inviteContext.newPage();await invite.goto(baseURL+'/player.html?c='+room.code);await expect(invite.locator('#joinform')).toBeVisible();await expect(invite.locator('#c')).toHaveValue(room.code);await expect(invite.locator('#start-menu')).toBeHidden();
  await inviteContext.close();await resumedContext.close();await context.close();
});

test('profilo: salva/annulla, galleria valida e non valida, persistenza e focus',async({browser,baseURL})=>{
  test.skip(process.env.PW_BASELINE==='1');
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();await page.goto(baseURL+'/player.html');
  await page.locator('[data-personal-profile]').click();await expect(page.locator('#buzzer-profile-dialog')).toBeVisible();await expect(page.locator('#profile-name')).toBeFocused();
  await page.locator('#profile-name').fill('');await page.locator('#profile-save').click();await expect(page.locator('#profile-notice')).toContainText(/nome/i);await expect(page.locator('#buzzer-profile-dialog')).toBeVisible();
  await page.locator('#profile-name').fill('Samuele Verifica');await page.locator('#profile-save').click();await expect(page.locator('#buzzer-profile-dialog')).toBeHidden();await expect(page.locator('.buzzer-profile-name')).toHaveText('Samuele Verifica');await expect(page.locator('[data-personal-profile]')).toBeFocused();
  await page.locator('[data-personal-profile]').click();await page.locator('#profile-name').fill('Da annullare');await page.locator('#profile-cancel').click();expect(await page.evaluate(()=>BuzzerProfile.getProfile().name)).toBe('Samuele Verifica');
  await page.locator('[data-personal-profile]').click();await page.locator('#profile-gallery').setInputFiles({name:'non-immagine.txt',mimeType:'text/plain',buffer:Buffer.from('not an image')});await expect(page.locator('#profile-notice')).toContainText(/JPG|PNG|WebP/i);expect(await page.evaluate(()=>BuzzerProfile.getProfile().avatar)).toBe('');
  await page.locator('#profile-gallery').setInputFiles({name:'falso.png',mimeType:'image/png',buffer:Buffer.from('not a real png')});await expect(page.locator('#profile-notice')).toContainText(/valida|leggere|leggibile/i);
  await page.locator('#profile-gallery').setInputFiles(path.resolve('public/assets/icons8/settings.png'));await expect(page.locator('#profile-crop')).toBeVisible();await expect(page.locator('#profile-avatar-canvas')).toBeVisible();
  await page.locator('#profile-crop-zoom').focus();await page.keyboard.press('End');await expect(page.locator('#profile-crop-zoom')).toHaveValue('3');await page.locator('#profile-crop-x').focus();await page.keyboard.press('Home');await expect(page.locator('#profile-crop-x')).toHaveValue('0');
  await page.locator('#profile-cancel').click();expect(await page.evaluate(()=>BuzzerProfile.getProfile().avatar)).toBe('');
  await page.locator('[data-personal-profile]').click();await page.locator('#profile-gallery').setInputFiles(path.resolve('public/assets/icons8/settings.png'));await expect(page.locator('#profile-crop')).toBeVisible();await page.locator('#profile-save').click();expect(await page.evaluate(()=>BuzzerProfile.getProfile().avatar)).toMatch(/^data:image\/jpeg;base64,/);
  const profile=await page.evaluate(()=>BuzzerProfile.getProfile());await page.reload();await expect(page.locator('.buzzer-profile-name')).toHaveText(profile.name);expect(await page.evaluate(()=>BuzzerProfile.getProfile())).toEqual(profile);
  await page.locator('[data-personal-profile]').click();await settleDialog(page,'#buzzer-profile-dialog');await page.screenshot({path:path.join(artifacts,'after','profile-gallery-mobile.png')});await page.keyboard.press('Escape');await expect(page.locator('[data-personal-profile]')).toBeFocused();
  await context.close();
});

test('fotocamera: permesso negato e flusso simulato con conferma, rifai e stop stream',async({browser,baseURL})=>{
  test.skip(process.env.PW_BASELINE==='1');
  const deniedContext=await browser.newContext({viewport:{width:390,height:844}});await deniedContext.addInitScript(()=>{Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{throw new DOMException('Denied by test','NotAllowedError');}});});
  const denied=await deniedContext.newPage();await denied.goto(baseURL+'/player.html');await denied.locator('[data-personal-profile]').click();await denied.locator('#profile-camera-start').click();await expect(denied.locator('#profile-notice')).toContainText(/negato/i);await expect(denied.locator('#profile-gallery-button')).toBeFocused();await expect(denied.locator('#profile-save')).toBeEnabled();await settleDialog(denied,'#buzzer-profile-dialog');await denied.screenshot({path:path.join(artifacts,'after','camera-denied-mobile.png')});await deniedContext.close();
  const context=await browser.newContext({viewport:{width:390,height:844}});await context.addInitScript(()=>{
    window.__cameraStreams=[];
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{
      const canvas=document.createElement('canvas');canvas.width=480;canvas.height=640;const ctx=canvas.getContext('2d');ctx.fillStyle='#ff8d9f';ctx.fillRect(0,0,480,640);ctx.fillStyle='#e8f580';ctx.beginPath();ctx.arc(240,280,120,0,Math.PI*2);ctx.fill();const stream=canvas.captureStream(10);window.__cameraStreams.push(stream);return stream;
    }});
  });
  const page=await context.newPage();await page.goto(baseURL+'/player.html');await page.locator('[data-personal-profile]').click();await page.locator('#profile-name').fill('Selfie simulato');await page.locator('#profile-camera-start').click();await expect.poll(()=>page.locator('#profile-camera-video').evaluate(el=>el.videoWidth)).toBeGreaterThan(0);await page.locator('#profile-camera-capture').click();await expect(page.locator('#profile-camera-still')).toBeVisible();await page.locator('#profile-camera-retake').click();await expect(page.locator('#profile-camera-video')).toBeVisible();await page.locator('#profile-camera-capture').click();await page.locator('#profile-camera-confirm').click();
  await expect(page.locator('#profile-camera-panel')).toBeHidden();expect(await page.evaluate(()=>__cameraStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended')))).toBe(true);expect(await page.evaluate(()=>BuzzerProfile.getProfile().avatar)).toBe('');await page.locator('#profile-save').click();expect(await page.evaluate(()=>BuzzerProfile.getProfile().avatar)).toMatch(/^data:image\/jpeg;base64,/);
  await page.locator('[data-personal-profile]').click();await page.locator('#profile-camera-start').click();await expect(page.locator('#profile-camera-capture')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#buzzer-profile-dialog')).toBeHidden();expect(await page.evaluate(()=>__cameraStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended')))).toBe(true);
  await context.close();
});

async function assertFit(page,selectors,label,{allowVerticalScroll=false}={}){
  await page.evaluate(()=>scrollTo(0,0));
  fs.mkdirSync(path.join(artifacts,'after'),{recursive:true});fs.writeFileSync(path.join(artifacts,'after',label.replaceAll(' ','-')+'-metrics.json'),JSON.stringify(await page.evaluate(evaluateLayout),null,2)+'\n');
  const assertion=process.env.PW_LAYOUT_AUDIT==='1'?expect.soft:expect;
  const dimensions=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight}));
  assertion(dimensions.scrollWidth,label+' horizontal document').toBeLessThanOrEqual(dimensions.width+1);
  if(!allowVerticalScroll)assertion(dimensions.scrollHeight,label+' vertical document').toBeLessThanOrEqual(dimensions.height+1);
  const targets=[];
  for(const selector of selectors){
    const locator=page.locator(selector);await expect(locator,label+' '+selector).toBeVisible();const r=await locator.boundingBox();
    assertion(r.x,label+' '+selector+' left').toBeGreaterThanOrEqual(-1);assertion(r.x+r.width,label+' '+selector+' right').toBeLessThanOrEqual(dimensions.width+1);
    if(!allowVerticalScroll){assertion(r.y,label+' '+selector+' top').toBeGreaterThanOrEqual(-1);assertion(r.y+r.height,label+' '+selector+' bottom').toBeLessThanOrEqual(dimensions.height+1);}
    targets.push({selector,locator});
  }
  for(const {selector,locator} of targets)if(await locator.isEnabled())try{await locator.click({trial:true,timeout:2000});}catch(error){assertion(error.message,label+' '+selector+' pointer target').toBeUndefined();}
  await page.evaluate(()=>scrollTo(0,0));
  return dimensions;
}
test('layout reale: menu, ingresso e buzzer a tre desktop, mobile e reflow 200%',async({browser,baseURL})=>{
  test.skip(process.env.PW_BASELINE==='1');test.setTimeout(120000);
  fs.mkdirSync(path.join(artifacts,'after'),{recursive:true});
  const context=await browser.newContext(),menu=await context.newPage(),report=[];
  for(const viewport of [...viewports,{width:390,height:844},{width:320,height:568}]){
    await menu.setViewportSize(viewport);await menu.goto(baseURL+'/player.html');await expect(menu.locator('#start-menu')).toBeVisible();await menu.evaluate(()=>document.fonts.ready);
    report.push({view:'menu',viewport,...await assertFit(menu,['#menu-join','#menu-create','#menu-host','#ux-settings','[data-personal-profile]'],'menu '+viewport.width,{allowVerticalScroll:viewport.width<600})});
    await menu.screenshot({path:path.join(artifacts,'after',`menu-${viewport.width}x${viewport.height}.png`)});
    await menu.locator('#menu-join').click();await expect(menu.locator('#joinform')).toBeVisible();
    report.push({view:'join',viewport,...await assertFit(menu,['#c','#n','#go','#ux-settings','[data-personal-profile]'],'join '+viewport.width,{allowVerticalScroll:viewport.width<600})});
    await menu.screenshot({path:path.join(artifacts,'after',`join-${viewport.width}x${viewport.height}.png`)});
  }
  const host=await createLegacyHost(browser,baseURL);await host.page.locator('#bStart').click();
  const playerContext=await browser.newContext(),player=await playerContext.newPage();await player.goto(baseURL+'/player.html?c='+host.room.code);await player.locator('#n').fill('Layout squadra');await player.locator('#go').click();await expect(player.locator('#game')).toBeVisible();await expect(host.page.locator('#bOpen')).toBeEnabled();await host.page.locator('#bOpen').click();await expect(player.locator('#bz')).toBeEnabled();
  for(const viewport of [...viewports,{width:390,height:844},{width:844,height:390},{width:640,height:360}]){
    await player.setViewportSize(viewport);await player.evaluate(()=>document.fonts.ready);
    report.push({view:'player',viewport,...await assertFit(player,['#bz','#chb','#ux-settings','[data-personal-profile]'],'player '+viewport.width,{allowVerticalScroll:viewport.width===640||viewport.height<500})});
    await player.screenshot({path:path.join(artifacts,'after',`player-${viewport.width}x${viewport.height}.png`)});
  }
  await player.emulateMedia({reducedMotion:'reduce'});await expect.poll(()=>player.evaluate(()=>document.documentElement.dataset.uxMotion)).toBe('reduce');
  expect(await player.evaluate(()=>getComputedStyle(document.querySelector('#bz')).animationName)).toBe('none');await player.screenshot({path:path.join(artifacts,'after','player-reduced-motion-reflow-200.png')});
  fs.writeFileSync(path.join(artifacts,'after','layout.json'),JSON.stringify(report,null,2)+'\n');await playerContext.close();await host.context.close();await context.close();
});

test('due partecipanti: colore personale persistente, feedback confermato e ordine server',async({browser,baseURL})=>{
  test.skip(process.env.PW_BASELINE==='1');
  const host=await createLegacyHost(browser,baseURL),players=[];
  for(const nick of ['Le Volpi','I Fulmini']){
    const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();await page.goto(baseURL+'/player.html?c='+host.room.code);await page.locator('#n').fill(nick);await page.locator('#go').click();await expect(page.locator('#game')).toBeVisible();players.push({context,page,id:await page.evaluate(()=>me.id)});
  }
  const a=players[0],b=players[1];
  await a.page.locator('#ux-settings').click();
  const colorContrast=[];
  for(const color of ['#000000','#ffffff']){
    // Native OS colour chooser is outside the page; exercise its standard input event deterministically.
    await a.page.locator('#buzzer-custom-color').evaluate((input,value)=>{input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));},color);expect(await a.page.evaluate(()=>BuzzerUX.getPreferences().buzzerColor)).toBe(color);
    const contrast=await a.page.evaluate(()=>[document.querySelector('.buzzer-state'),...document.querySelectorAll('.buzzer-preview-states span')].map(element=>{
      const style=getComputedStyle(element),rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number),luminance=value=>rgb(value).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0),fg=luminance(style.color),bg=luminance(style.backgroundColor);return{text:element.textContent,foreground:style.color,background:style.backgroundColor,ratio:(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05)};
    }));expect(contrast.length).toBe(4);for(const item of contrast)expect(item.ratio,item.text+' contrast '+color).toBeGreaterThanOrEqual(4.5);colorContrast.push({color,contrast});
  }
  fs.writeFileSync(path.join(artifacts,'after','custom-color-contrast.json'),JSON.stringify(colorContrast,null,2)+'\n');
  const palette=a.page.locator('[data-buzzer-color]');expect(await palette.count()).toBeGreaterThan(1);const chosen=await palette.nth(1).getAttribute('data-buzzer-color');await palette.nth(1).click();expect(await a.page.evaluate(()=>BuzzerUX.getPreferences().buzzerColor)).toBe(chosen);
  await a.page.keyboard.press('Escape');const ownColor=await a.page.locator('#bz').evaluate(el=>getComputedStyle(el).backgroundColor),otherColor=await b.page.locator('#bz').evaluate(el=>getComputedStyle(el).backgroundColor);expect(ownColor).not.toBe(otherColor);
  await a.page.reload();await expect(a.page.locator('#game')).toBeVisible();expect(await a.page.evaluate(()=>BuzzerUX.getPreferences().buzzerColor)).toBe(chosen);expect(await a.page.locator('#bz').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(ownColor);
  await host.page.locator('#bStart').click();await expect(host.page.locator('#bOpen')).toBeEnabled();await host.page.locator('#bOpen').click();await expect(a.page.locator('#bz')).toBeEnabled();await expect(b.page.locator('#bz')).toBeEnabled();
  await a.page.locator('#bz').click();await expect(a.page.locator('#bz')).toHaveClass(/buzz-confirmed/);await expect(b.page.locator('#bz')).not.toHaveClass(/buzz-confirmed/);await expect(host.page.locator(`#sq [data-id="${a.id}"]`)).toHaveClass(/host-buzz-confirmed/);await expect(host.page.locator(`#sq [data-id="${b.id}"]`)).not.toHaveClass(/host-buzz-confirmed/);
  await expect.poll(()=>host.page.evaluate(()=>ST.order.length)).toBe(1);expect(await host.page.evaluate(()=>ST.ans)).toBe(a.id);await a.page.screenshot({path:path.join(artifacts,'after','player-confirmed-mobile.png')});
  await host.page.locator('#bNew').click();await expect(host.page.locator('#bOpen')).toBeEnabled();await host.page.locator('#bOpen').click();await expect(a.page.locator('#bz')).toBeEnabled();await expect(b.page.locator('#bz')).toBeEnabled();
  await Promise.all([a.page.locator('#bz').click(),b.page.locator('#bz').click()]);await expect.poll(()=>host.page.evaluate(()=>ST.order.length)).toBe(2);const order=await host.page.evaluate(()=>ST.order.map(item=>item.id));expect(new Set(order).size).toBe(2);expect(new Set(order)).toEqual(new Set([a.id,b.id]));expect(await host.page.evaluate(()=>ST.ans)).toBe(order[0]);
  const authoritative=await host.page.evaluate(()=>ST.order.map(item=>({id:item.id,t:item.t})));expect(authoritative[0].t).toBeLessThanOrEqual(authoritative[1].t);await host.page.screenshot({path:path.join(artifacts,'after','host-authoritative-queue-desktop.png')});
  await a.page.locator('#ux-settings').click();await a.page.locator('#buzzer-color-reset').click();expect(await a.page.evaluate(()=>BuzzerUX.getPreferences().buzzerColor)).toBe('#e8f580');await a.page.keyboard.press('Escape');await a.page.reload();await expect(a.page.locator('#game')).toBeVisible();expect(await a.page.evaluate(()=>BuzzerUX.getPreferences().buzzerColor)).toBe('#e8f580');
  await a.context.close();await b.context.close();await host.context.close();
});

test('grafica reale: WebGL ShaderGradient, Liquid Glass circoscritto e fallback accessibili',async({browser,baseURL})=>{
  test.skip(process.env.PW_BASELINE==='1');
  const context=await browser.newContext({viewport:viewports[0],colorScheme:'dark'}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(baseURL+'/player.html');await expect.poll(()=>page.evaluate(()=>window.BuzzerVisuals?.status().webgl)).not.toBeUndefined();
  const supported=await page.evaluate(()=>BuzzerVisuals.status().webgl);
  if(supported){
    await expect.poll(()=>page.evaluate(()=>BuzzerVisuals.status().shader)).toBe('ready');await expect(page.locator('#buzzer-shader-stage canvas')).toBeVisible();
    const shader=await page.locator('#buzzer-shader-stage canvas').evaluate(canvas=>{const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');return{width:canvas.width,height:canvas.height,active:!!gl&&!gl.isContextLost(),pointerEvents:getComputedStyle(canvas).pointerEvents};});expect(shader.active).toBe(true);expect(shader.width).toBeGreaterThan(0);expect(shader.height).toBeGreaterThan(0);expect(shader.pointerEvents).toBe('none');
    await expect.poll(()=>page.locator('#ux-settings').getAttribute('data-liquid-glass')).toBe('active');
    for(const selector of ['#ux-settings','[data-personal-profile]']){
      const target=page.locator(selector),parent=await target.boundingBox(),layer=await target.locator('.buzzer-glass-layer').boundingBox();expect(layer).toBeTruthy();expect(Math.abs(layer.x-parent.x)).toBeLessThanOrEqual(2);expect(Math.abs(layer.y-parent.y)).toBeLessThanOrEqual(2);expect(layer.width).toBeLessThanOrEqual(parent.width+2);expect(layer.height).toBeLessThanOrEqual(parent.height+2);
      expect(await target.locator('.buzzer-glass-layer canvas').evaluate(canvas=>{const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');return!!gl&&!gl.isContextLost();})).toBe(true);
    }
  }else{expect(await page.evaluate(()=>BuzzerVisuals.status().shader)).toBe('static');}
  await page.locator('#ux-settings').click();await settleDialog(page,'#ux-settings-dialog');await page.screenshot({path:path.join(artifacts,'after','settings-liquid-glass-desktop.png')});
  await page.locator('[data-pref=backgrounds]').selectOption('off');await expect.poll(()=>page.evaluate(()=>BuzzerVisuals.status().shader)).toBe('static');await expect(page.locator('#buzzer-shader-stage canvas')).toHaveCount(0);expect(await page.locator('#menu-video').evaluate(video=>video.paused)).toBe(true);
  await page.locator('[data-pref=backgrounds]').selectOption('light');if(supported)await expect.poll(()=>page.evaluate(()=>BuzzerVisuals.status().shader)).toBe('ready');
  await page.locator('[data-pref=focusMode]').check();await expect.poll(()=>page.evaluate(()=>BuzzerVisuals.status().glass)).toBe(0);await expect.poll(()=>page.evaluate(()=>BuzzerVisuals.status().shader)).toBe('static');await page.locator('[data-pref=focusMode]').uncheck();
  await page.locator('[data-pref=reduceTransparency]').check();await expect.poll(()=>page.evaluate(()=>BuzzerVisuals.status().glass)).toBe(0);await page.locator('[data-pref=reduceTransparency]').uncheck();
  await page.keyboard.press('Escape');
  // Simulate the visibility event deterministically; this is not a physical mobile suspension test.
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
  await expect.poll(()=>page.evaluate(()=>BuzzerVisuals.status().shader)).toBe('static');expect(await page.evaluate(()=>BuzzerVisuals.status().glass)).toBe(0);expect(await page.locator('#menu-video').evaluate(video=>video.paused)).toBe(true);
  await page.evaluate(()=>{delete document.hidden;delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'));});if(supported)await expect.poll(()=>page.evaluate(()=>BuzzerVisuals.status().shader)).toBe('ready');
  await page.emulateMedia({reducedMotion:'reduce'});await expect.poll(()=>page.evaluate(()=>BuzzerVisuals.status().shader)).toBe('static');expect(await page.locator('#menu-video').evaluate(video=>video.paused)).toBe(true);await page.screenshot({path:path.join(artifacts,'after','menu-reduced-motion-static.png')});
  fs.writeFileSync(path.join(artifacts,'after','visual-renderers.json'),JSON.stringify({webgl:supported,status:await page.evaluate(()=>BuzzerVisuals.status()),pageErrors:errors},null,2)+'\n');expect(errors).toEqual([]);await context.close();
});

test('fallback senza WebGL: menu e pannelli restano utilizzabili con canvas 2D disponibile',async({browser,baseURL})=>{
  test.skip(process.env.PW_BASELINE==='1');
  const context=await browser.newContext({viewport:{width:390,height:844}});await context.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...args){return typeof type==='string'&&/webgl/i.test(type)?null:original.call(this,type,...args);};
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(baseURL+'/player.html');await expect(page.locator('#start-menu')).toBeVisible();await expect.poll(()=>page.evaluate(()=>BuzzerVisuals.status().webgl)).toBe(false);expect(await page.evaluate(()=>BuzzerVisuals.status().shader)).toBe('static');await expect(page.locator('#buzzer-shader-stage canvas')).toHaveCount(0);await expect(page.locator('.buzzer-glass-layer')).toHaveCount(0);
  await page.locator('#menu-join').click();await expect(page.locator('#joinform')).toBeVisible();await page.locator('#ux-settings').click();await settleDialog(page,'#ux-settings-dialog');await page.keyboard.press('Escape');await page.locator('[data-personal-profile]').click();await settleDialog(page,'#buzzer-profile-dialog');expect(await page.evaluate(()=>!!document.createElement('canvas').getContext('2d'))).toBe(true);await page.screenshot({path:path.join(artifacts,'after','profile-no-webgl-mobile.png')});await page.keyboard.press('Escape');expect(errors).toEqual([]);await context.close();
});
