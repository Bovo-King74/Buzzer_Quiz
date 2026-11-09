// Adapted from Stageshow examples/hero-demo: measured gestures, retained layers,
// a payoff poster and a dedicated compact composition. No game socket or storage.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Stage } from '../stageshow/kit/stage';
import { Window } from '../stageshow/kit/window';
import { Button } from '../stageshow/kit/controls/Button';
import { Row } from '../stageshow/kit/parts/Row';
import { Avatar } from '../stageshow/kit/parts/Avatar';
import { Check } from '../stageshow/kit/parts/Check';
import { States } from '../stageshow/kit/motion/States';
import './buzzer-demo.css';

const initial = { joined: false, open: false, pressed: false, confirmed: false };
const poster = { joined: true, open: true, pressed: false, confirmed: true };
async function script(a) {
  await a.wait(700);
  await a.click('join');
  await a.set({ joined: true }); a.mark('joined');
  await a.move('rest'); await a.wait(1300);
  await a.click('open');
  await a.set({ open: true }); a.mark('ready');
  await a.move('rest'); await a.wait(1300);
  await a.click('buzz');
  await a.set({ pressed: true }); a.mark('press');
  await a.wait(380);
  await a.set({ confirmed: true, pressed: false }); a.mark('confirmed');
  await a.move('rest'); await a.wait(2500);
  await a.click('replay');
  await a.set(initial); a.mark('replay');
  await a.move('rest'); await a.wait(500);
}
const phase = s => s.confirmed ? 'confirmed' : s.pressed ? 'sent' : s.open ? 'open' : s.joined ? 'joined' : 'lobby';
const states = { lobby:'La vostra squadra?', joined:'Siete dentro.', open:'Il turno è aperto.', sent:'Pressione inviata…', confirmed:'Primi. Tocca a voi!' };
function ProductDemo() {
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const update = () => setReduced(document.documentElement.dataset.uxMotion === 'reduce');
    const observer = new MutationObserver(update); observer.observe(document.documentElement, { attributes:true, attributeFilter:['data-ux-motion'] }); update();
    return () => observer.disconnect();
  }, []);
  return <>
    <div className="demo-caption"><span>Demo · una manche in pochi secondi</span><button type="button" onClick={() => setPaused(v => !v)} aria-pressed={paused} aria-label={paused ? 'Riproduci demo' : 'Mostra demo statica'}>{paused ? 'Riproduci' : 'Ferma'}</button></div>
    <div aria-hidden="true" inert>
      <Stage width={540} height={480} compact={{below:480,width:358,height:342}} initial={initial} poster={poster} script={paused || reduced ? undefined : script} theme="dark" fidelity="realistic" accent="#e8f580" className="buzzer-demo" cursor={{at:'rest', style:'touch', ripple:true}} tokens={{'--ss-font':"'Bricolage Grotesque', system-ui, sans-serif",'--ss-surface':'#20271f','--ss-canvas':'#101310','--ss-chrome':'#293127','--ss-text':'#d1dccb','--ss-text-strong':'#f7f8ef','--ss-text-faint':'#becab8','--ss-accent-text':'#172019'}}>
        {(s, rect, layout) => <>
          <Window key={layout} title="Stanza QUIZ" className="bd-window" lights="grey" toolbar={<Button size="small" data-target="replay">Rivedi la demo</Button>}>
            <div className="bd-content" data-phase={phase(s)}>
              <div className="bd-status"><Check on={s.confirmed} pending={s.pressed} size={22}/><States value={phase(s)} states={states}/></div>
              <div className="bd-arena">
                <div className="bd-roster">
                  <div className="bd-label">In stanza</div>
                  <Row pad={10} lead={<Avatar name="Le Volpi" size={24}/>} title="Le Volpi"/>

                  <div className="bd-team" data-show={s.joined}><Row pad={10} lead={<Avatar name="I Fulmini" size={24} tone="accent"/>} title="I Fulmini" meta={<States value={s.confirmed ? 'win' : 'you'} states={{win:'1°',you:'Voi'}}/>}/></div>
                  <div className="bd-enter" data-show={!s.joined}><Button data-target="join" variant="primary" size={layout === 'compact' ? 'small' : 'large'}>Entra in squadra</Button></div>
                  <div className="bd-host"><Button data-target="open" size={layout === 'compact' ? 'small' : 'large'}>Apri il turno</Button></div>
                </div>
                <div className="bd-player">
                  <div className="bd-label">Il vostro buzzer</div>
                  <div className="bd-buzzer" data-target="buzz" data-cursor="hand" data-ready={s.open} data-down={s.pressed} data-confirmed={s.confirmed}>
                    <div className="bd-face"><div className="bd-type"><img src="/assets/buzzer.png" alt="" draggable="false" width="309" height="412"/>
                    <div className="bd-badge"><States value={phase(s)} states={{lobby:'Bloccato',joined:'Bloccato',open:'Premi!',sent:'Inviato',confirmed:'Prenotati'}}/></div></div></div>
                  </div>
                </div>
              </div>
              <div className="bd-result" data-confirmed={s.confirmed}>
                <span className="bd-rank"><States value={s.confirmed ? 'win' : 'wait'} states={{wait:'—',win:'1°'}}/></span>
                <div><div className="bd-result-title"><States align="start" value={s.confirmed ? 'win' : 'wait'} states={{wait:'Il prossimo punto è vostro.',win:'I Fulmini'}}/></div><div className="bd-result-copy"><States align="start" value={s.confirmed ? 'win' : 'wait'} states={{wait:'Aspettate il via. Poi premete.',win:'Prenotazione confermata · 0,24 s'}}/></div></div>
              </div>
            </div>
          </Window>
          <span data-target="rest" className="bd-rest"/>
        </>}
      </Stage>
    </div>
    <p className="demo-equivalent">Entrate in stanza, aspettate il via e premete. Il server conferma l’ordine: la prima squadra risponde.</p>
  </>;
}
const target = document.getElementById('buzzer-product-demo');
if (target) document.fonts.ready.then(() => createRoot(target).render(<ProductDemo/>));
