# Stageshow source subset

Source: the installed Stageshow skill, version 1.1.1, from `benjitaylor/skills`, read at `/Users/samu/.agents/skills/stageshow` on 2026-11-09.

`kit/` contains only the 28 unchanged files needed by the Buzzer demo's dependency graph. The kit remains separate from Buzzer's live UI. Its MIT license and upstream notice are preserved here. No example logos, photography, fonts or third-party brand assets were copied.

The scene in `../buzzer-demo/BuzzerDemo.jsx` starts from `examples/hero-demo`: Stage, measured targets, cursor script, retained scene layers, Window, a payoff poster and a compact layout. The original dashboard was replaced with Buzzer's roster, physical buzzer and authoritative confirmation story. The live application remains native HTML/JS/Socket.IO.

Build with `npm run build:demo`. The host already supplies React, React DOM and esbuild as development dependencies; the checked-in bundle needs no runtime build step. `public/vendor/kit/stageshow.css` is unchanged kit CSS; the authored scene CSS is built separately so Stageshow's rehearsal inspector can distinguish the two. Full license text ships in `public/vendor/BUZZER-DEMO-LICENSE.txt`.
