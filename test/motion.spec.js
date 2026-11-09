const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const artifacts = '.taste-skill/motion';
test.beforeAll(() => fs.mkdirSync(artifacts,{recursive:true}));
const recording = viewport => process.env.PW_RECORD_MOTION === '1' ? {dir:artifacts+'/video',size:viewport} : undefined;
async function host(browser, baseURL) {
  const context = await browser.newContext({viewport:{width:1366,height:768},recordVideo:recording({width:1366,height:768})}), page = await context.newPage();
  await page.goto(baseURL+'/host.html'); await expect.poll(()=>page.evaluate(()=>s.connected)).toBe(true); await page.locator('#mk').click(); await expect(page.locator('#app')).toBeVisible();
  return {context,page,room:await page.evaluate(()=>cred)};
}
async function player(browser, baseURL, code, name) {
  const context = await browser.newContext({viewport:{width:390,height:844},recordVideo:recording({width:390,height:844})}), page = await context.newPage();
  await page.goto(baseURL+'/player.html?c='+code); await page.locator('#n').fill(name); await page.locator('#go').click(); await expect(page.locator('#game')).toBeVisible();
  return {context,page,id:await page.evaluate(()=>me.id)};
}
test('motion: buzz immediato, tap ripetuti e ACK obsoleto dopo nuova manche', async({browser,baseURL})=>{
  const h=await host(browser,baseURL), a=await player(browser,baseURL,h.room.code,'I Fulmini lunghi');
  await h.page.locator('#bStart').click(); await h.page.locator('#bOpen').click(); await expect(a.page.locator('#bz')).toBeEnabled();
  await a.page.evaluate(()=>{
    const emit=s.emit; window.__sent=[]; window.__acks=0;
    s.emit=function(event,...args){
      if(event==='buzz'){
        __sent.push(performance.now()-window.__pressAt);
        const callback=args.pop(); args.push((...result)=>setTimeout(()=>{__acks++;callback(...result);},1100));
      }
      return emit.call(this,event,...args);
    };
    window.__pressAt=performance.now(); pressBuzzer(); pressBuzzer(); pressBuzzer();
  });
  expect(await a.page.evaluate(()=>__sent.length)).toBe(1);
  expect(await a.page.evaluate(()=>__sent[0])).toBeLessThan(100);
  await expect(a.page.locator('#bz')).not.toHaveClass(/buzz-confirmed/);
  await expect.poll(()=>h.page.evaluate(()=>ST.order.length)).toBe(1);
  await h.page.locator('#bNew').click(); await expect(a.page.locator('#zone')).toHaveAttribute('data-m','locked');
  await expect.poll(()=>a.page.evaluate(()=>__acks)).toBe(1);
  await expect(a.page.locator('#bz')).not.toHaveClass(/buzz-confirmed/); await expect(a.page.locator('#lb')).toHaveText('Buzzer bloccato');
  await h.page.locator('#bOpen').click(); await expect(a.page.locator('#bz')).toBeEnabled();
  await a.page.locator('#bz').focus(); await a.page.keyboard.press('Enter'); await expect.poll(()=>h.page.evaluate(()=>ST.order.length)).toBe(1);
  await expect(a.page.locator('#lb')).toContainText(/Tocca a voi|tocca a voi/);
  await expect(a.page.locator('#bz')).toHaveClass(/buzz-confirmed/);
  await a.page.screenshot({path:artifacts+'/player-confirmed.png'});
  await a.context.setOffline(true); await expect(a.page.locator('#net')).toBeVisible(); await expect(a.page.locator('#bz')).toBeDisabled();
  const headerBox=await a.page.locator('.buzzer-shell').boundingBox(),netBox=await a.page.locator('#net').boundingBox();
  expect(netBox.y).toBeGreaterThanOrEqual(headerBox.y+headerBox.height-1);
  expect(await a.page.locator('.buzzer-state').evaluate(el=>getComputedStyle(el,'::before').display)).toBe('none');
  await a.page.screenshot({path:artifacts+'/player-offline.png'});
  await a.context.setOffline(false); await expect(a.page.locator('#net')).toBeHidden(); await expect(a.page.locator('#lb')).toContainText(/Tocca a voi|tocca a voi/);
  await a.context.close(); await h.context.close();
});
test('motion: identità e focus dei controlli durante aggiornamenti e riordino live', async({browser,baseURL})=>{
  const h=await host(browser,baseURL), a=await player(browser,baseURL,h.room.code,'Nome molto lungo'), b=await player(browser,baseURL,h.room.code,'Le Volpi');
  await h.page.locator('#bStart').click();
  const row=h.page.locator(`#sq [data-id="${b.id}"]`), button=row.locator('[data-v="1"]');
  await row.evaluate(node=>window.__originalRow=node); await button.evaluate(node=>{window.__originalButton=node;node.focus();node.click();});
  await expect.poll(()=>h.page.evaluate(()=>ST.players.find(p=>p.id===window.__originalRow.dataset.id).score)).toBe(1);
  expect(await row.evaluate(node=>node===window.__originalRow)).toBe(true);
  expect(await button.evaluate(node=>node===window.__originalButton)).toBe(true); await expect(button).toBeFocused();
  for(let i=0;i<3;i++) await button.press('Enter');
  await expect.poll(()=>h.page.evaluate(()=>ST.players.find(p=>p.id===window.__originalRow.dataset.id).score)).toBe(4);
  await expect(button).toBeFocused(); expect(await h.page.locator('#sq>.rg').first().getAttribute('data-id')).toBe(b.id);
  const c=await player(browser,baseURL,h.room.code,'Terza squadra'); await expect(h.page.locator('#sq>.rg')).toHaveCount(3); await expect(button).toBeFocused();
  await h.page.screenshot({path:artifacts+'/host-retained-focus.png'});
  await c.context.close(); await a.context.close(); await b.context.close(); await h.context.close();
});
test('motion: demo isolata, poster accessibile, arresto fuori schermo e pannelli interrompibili', async({browser,baseURL})=>{
  fs.mkdirSync(artifacts,{recursive:true});
  const context=await browser.newContext({viewport:{width:390,height:844},recordVideo:process.env.PW_RECORD_MOTION === '1' ? {dir:artifacts+'/video',size:{width:390,height:844}} : undefined}), page=await context.newPage();
  const errors=[]; page.on('pageerror',e=>errors.push(e.message)); await page.goto(baseURL+'/player.html');
  await page.locator('.ss-stage').scrollIntoViewIfNeeded(); await expect(page.locator('.ss-stage')).toHaveAttribute('data-layout','compact');
  await expect.poll(()=>page.locator('.ss-stage').getAttribute('data-mark'),{timeout:18000}).toBe('confirmed');
  await page.locator('.demo-caption button').click(); await expect(page.locator('.ss-stage')).toHaveAttribute('data-still','true');
  await expect(page.locator('.bd-content')).toHaveAttribute('data-phase','confirmed');
  await page.locator('.demo-caption button').click();
  await page.locator('#menu-join').click(); await expect(page.locator('.ss-stage')).toHaveAttribute('data-offscreen','');
  await page.locator('[data-personal-profile]').click(); await page.keyboard.press('Escape'); await expect(page.locator('[data-personal-profile]')).toBeFocused();
  await page.locator('[data-personal-profile]').click(); await expect(page.locator('#profile-name')).toBeFocused(); await page.keyboard.press('Escape');
  await page.locator('#ux-settings').click(); await page.keyboard.press('Escape'); await expect(page.locator('#ux-settings')).toBeFocused();
  await page.goto(baseURL+'/player.html'); await page.emulateMedia({reducedMotion:'reduce'});
  await expect(page.locator('.ss-stage')).toHaveAttribute('data-still','true'); await expect(page.locator('.bd-content')).toHaveAttribute('data-phase','confirmed');
  expect(await page.evaluate(()=>({qz:localStorage.getItem('qz'),host:localStorage.getItem('hostGame')}))).toEqual({qz:null,host:null});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]); await context.close();
});

// An acceptance ACK carries the original rank; a later authoritative snapshot
// may already have promoted the team. The old ACK must not demote its wording.
test('motion: la promozione autorevole prevale sulla posizione di un ACK tardivo', async({browser,baseURL})=>{
  const h=await host(browser,baseURL), a=await player(browser,baseURL,h.room.code,'Le Volpi'), b=await player(browser,baseURL,h.room.code,'I Fulmini');
  await h.page.locator('#bStart').click(); await h.page.locator('#bOpen').click(); await expect(a.page.locator('#bz')).toBeEnabled();
  await b.page.evaluate(()=>{const emit=s.emit;window.__ack=false;s.emit=function(event,...args){if(event==='buzz'){const callback=args.pop();args.push((...result)=>setTimeout(()=>{__ack=true;callback(...result);},1200));}return emit.call(this,event,...args);};});
  await a.page.locator('#bz').click(); await expect.poll(()=>h.page.evaluate(()=>ST.order.length)).toBe(1);
  await b.page.locator('#bz').click(); await expect.poll(()=>h.page.evaluate(()=>ST.order.length)).toBe(2);
  await h.page.locator('#bKo').click(); await expect(b.page.locator('#zone')).toHaveAttribute('data-m','answering');
  await expect.poll(()=>b.page.evaluate(()=>__ack)).toBe(true); await expect(b.page.locator('#lb')).toContainText(/tocca a voi/i);
  await expect(b.page.locator('#sb')).not.toContainText('2°');
  await a.context.close(); await b.context.close(); await h.context.close();
});
