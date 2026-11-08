# Liquid Glass e ShaderGradient in Buzzer

Integrazione reale delle due librerie richieste. La partita continua a usare HTML/CSS/JavaScript e Socket.IO: React viene montato soltanto nell'isola grafica decorativa di ShaderGradient. Non esistono controlli di gioco React e nessun evento di prenotazione attende il caricamento grafico.

## Provenienza e versioni fissate

| Asset/libreria | Versione esatta | Provenienza e licenza |
| --- | --- | --- |
| Liquid Glass JS | commit `78cb6ccb0b9987bb60a88b14ccbd13a9e6e8ab2a` | [repository ufficiale](https://github.com/dashersw/liquid-glass-js/tree/78cb6ccb0b9987bb60a88b14ccbd13a9e6e8ab2a), MIT, Armagan Amcalar |
| ShaderGradient | `@shadergradient/react@2.4.20` | [repository ufficiale e API](https://github.com/ruucm/shadergradient), [pacchetto npm](https://www.npmjs.com/package/@shadergradient/react/v/2.4.20), MIT, ruucm e stone-skipper |
| React / React DOM | `19.3.1` | npm, MIT |
| React Three Fiber | `9.8.2` | npm, MIT |
| Three.js | `0.169.0` | npm, MIT |
| three-stdlib | `2.36.1` | npm, MIT |
| camera-controls | `2.9.0` | npm, MIT |
| esbuild, solo build | `0.28.2` | npm, MIT |
| Playwright, solo test | `@playwright/test@1.65.0` | npm, Apache-2.0 |

I file upstream Liquid Glass `container.js`, `button.js`, `glass.css`, `README.md` e `LICENSE` sono salvati senza modifiche in `public/vendor/liquid-glass/`. `UPSTREAM.json` contiene commit e SHA-256 dei singoli file. `bridge.js` è un piccolo adattatore Buzzer per esporre le classi originali sotto un namespace, non un file upstream. `public/vendor/visual-manifest.json` elenca i pacchetti e lo SHA-256 del bundle ShaderGradient.

Sono stati letti i README ufficiali prima dell'implementazione. Il tree del repository Liquid Glass fissato non contiene `SKILL.md` né altre skill: non viene dichiarata o installata una skill inesistente. Per il progetto è stata applicata la skill locale disponibile `design-taste-frontend`, letta da `/Users/samu/.agents/skills/design-taste-frontend/SKILL.md` e `references/app-screens.md`. La richiesta esplicita dell'utente di gradienti e glass prevale sulle esclusioni grafiche generiche della skill.

Three.js e camera-controls sono fissati alle versioni compatibili usate dal pacchetto ShaderGradient: il primo test con Three.js 0.187.0 ha rilevato nel browser un include shader rimosso. La versione finale 0.169.0 è stata verificata con pixel realmente variabili e senza errori di pagina; non viene mascherata una libreria non funzionante con un gradiente CSS.

## Architettura e punti d'integrazione

Le pagine caricano `/visuals.css` e il piccolo controller `/visuals.js`. Quest'ultimo importa il bundle locale `/vendor/shader-island.js` soltanto quando le preferenze permettono un background animato e WebGL è disponibile. I file sono serviti dal progetto; nessun CDN o servizio esterno è necessario durante il gioco.

Il controller legge `body.dataset.view`: `menu`, `join`, `player`, `host` o `host-setup`. Il primo elemento visibile `[data-shader-stage]`, se presente, ospita il renderer; altrimenti viene creato uno sfondo fisso `#buzzer-shader-stage`. Il controller conserva separatamente il contenitore effettivamente montato, così un passaggio menu → gioco smonta il vecchio root prima di montarne un altro.

`visuals-src/shader-island.jsx` importa realmente `ShaderGradientCanvas` e `ShaderGradient` da `@shadergradient/react`, con controllo mediante props. Le luci sono locali (`lightType="3d"`), senza mappe HDR remote. La palette resta antracite, salvia e lime. Il menu si muove lentamente; il giocatore e l'host hanno velocità e opacità inferiori. La densità è 0.65 nella preferenza “leggeri”, 1 nella preferenza “completi”, limitata ulteriormente dal device pixel ratio. Nessun puntatore viene gestito dal canvas.

Liquid Glass usa le vere classi e i veri shader WebGL upstream. La sottoclasse locale modifica soltanto il ciclo di vita e l'aggancio al DOM: il layer viene aggiunto dietro a pulsanti e dialog nativi, senza sostituire semantica, click, tastiera o focus. I selettori sono `[data-glass]`, `.buzzer-glass`, `.ux-settings-trigger` e `.buzzer-profile-trigger`. Le istanze attive aggiungono `data-liquid-glass="active"`. Il numero massimo è sei superfici visibili.

L'adattatore fornisce alla libreria uno snapshot dei soli pixel decorativi di sfondo, campionando canvas e video locali. Non acquisisce pagina, campi del profilo, selfie, nomi, chat o chiave host. La libreria conserva il proprio shader di rifrazione, blur e mascheratura. L'immagine campionata viene aggiornata su cambio vista, preferenza e apertura del pannello; non vengono effettuate catture continue del DOM. `html2canvas` non è necessario a questo percorso ed è stato rimosso dalle dipendenze finali.

I controlli glass mantengono una tinta all'82%; i pannelli impostazioni e profilo usano il 96% per evitare che il testo della pagina sottostante interferisca con la lettura. I layer non intercettano eventi. Un ancoraggio relativo viene applicato soltanto ai controlli originariamente statici, azzerando gli offset precedentemente inattivi: il pulsante Impostazioni rimane nella sua posizione nell'header. Dialog, focus trap, Escape e ritorno del focus appartengono ai componenti nativi esistenti.

API pubblica:

```js
BuzzerVisuals.refresh(); // chiamare dopo cambio vista o apertura/chiusura di un pannello
BuzzerVisuals.status();  // diagnostica: shader, glass, role, video, webgl
```

`document` pubblica già `buzzer:preferences`; il controller lo ascolta e legge `BuzzerUX.getPreferences()`. Le preferenze restano locali e separate dalla stanza. Il feedback confermato usa le classi finite `.buzz-confirmed` sul buzzer e `.host-buzz-confirmed` sulla riga host; la logica che le applica resta esterna al renderer e segue gli ACK server.

## Fallback, movimento e risorse

- Con background spenti, movimento ridotto personale o di sistema, modalità concentrazione, contrasto elevato o riduzione delle trasparenze non viene mantenuto un renderer ShaderGradient attivo.
- Il fallback è una composizione statica tenue; concentrazione e contrasto elevato nascondono il background decorativo. Con WebGL non disponibile il gioco resta utilizzabile senza canvas grafici.
- Contrasto elevato e trasparenze ridotte rimuovono le superfici glass e ripristinano i fondi opachi. La sola riduzione del movimento può conservare un glass statico, senza animazione.
- `visibilitychange` smonta il root React/Three e libera i contesti Liquid Glass; il video va in pausa. La ricomparsa ripristina gli effetti consentiti dalle preferenze. Gli eventi di perdita del contesto WebGL portano a un fallback statico.
- Non ci sono MutationObserver sull'intera pagina. Il ridimensionamento dei pochi controlli glass è osservato con ResizeObserver; scroll e aggiornamenti espliciti causano disegni singoli. L'animazione continua è confinata al renderer decorativo.

Il bundle minificato è 1329833 byte (circa 1.3 MB), 346517 byte con gzip al momento della verifica. Il costo è esplicito e isolato: il bundle non viene importato con effetti disabilitati o WebGL assente, non contiene dati della partita e non blocca il caricamento dei controlli. Il numero di draw call e il consumo su smartphone fisici non sono stati misurati in questo sottotask.

## Video originale del menu

`public/assets/menu-loop.webm` è un video locale di 8 secondi, VP9, 1280×720, 24 fps, senza traccia audio, 126487 byte. `menu-loop-poster.jpg` è il fotogramma statico. Lo script riproducibile `visuals-src/render-menu-loop.sh` usa ffmpeg per un percorso di camera periodico, lento e senza taglio tra fine e inizio.

L'unico materiale sorgente è `public/assets/quiz-night-generated.jpg`, l'illustrazione della squadra e del buzzer lime già presente nel repository. Non sono stati scaricati filmati, musica o fotografie di terzi. Il video è una nuova elaborazione del materiale del progetto; non viene attribuita una licenza esterna inventata all'immagine originale. `buzzer.png`, che contiene un volto utilizzato dal progetto, non è stato impiegato nel video.

Il video è `muted`, `loop`, `playsinline`, `preload="none"`; il controller assegna il `src` solo quando il menu e le preferenze consentono la riproduzione. Se l'autoplay non è disponibile, il poster mantiene la composizione. Fuori dal menu o con effetti ridotti il video va in pausa.

## Build, licenze e verifiche

```sh
npm ci
npm run build:visuals
# Solo se si desidera rigenerare il video, con ffmpeg installato:
sh visuals-src/render-menu-loop.sh
```

Le dipendenze visive e di test sono `devDependencies`: gli asset finali vengono inclusi nel repository e il deploy Express può servirli senza installare React o eseguire un bundler. Il runtime server mantiene il requisito Node 18+; i test Playwright 1.65 richiedono Node 20+ (qui eseguiti con Node 24.21.0).

Le licenze MIT e i copyright sono conservati in `public/vendor/VISUAL-LICENSES.txt`, `shader-island.js.LEGAL.txt` e nella licenza originale Liquid Glass. I manifest rendono verificabili versioni e sorgenti. Le icone del progetto restano coperte dalla propria attribuzione Icons8; questa integrazione non ne cambia la licenza.

Verifiche eseguite in Chrome reale headless tramite Playwright:

- Build esbuild completata e syntax check del controller.
- Renderer ShaderGradient effettivo: canvas 832×520 su viewport 1280×800, pixel differenti a distanza di 350 ms e zero `pageerror` nella versione finale.
- Due superfici glass nell'header e una terza all'apertura del dialog; focus su un controllo nativo e chiusura Escape funzionanti.
- Riduzione trasparenze: zero canvas decorativi, video in pausa, superficie opaca.
- Pagine reali: passaggio menu → ingresso → giocatore, vecchio canvas fisso assente e un solo canvas ShaderGradient nel contenitore `#zone`; zero errori di pagina.
- Contenimento del glass nei pulsanti nativi, senza espansione all'intero header; posizione Impostazioni invariata a x=24/y=16 nel viewport 1366×768.
- `ffprobe` conferma durata, codec, risoluzione e assenza di audio nel loop.
- `npm audit` dopo installazione e pulizia: zero vulnerabilità segnalate.

Le prove non certificano browser Safari/Firefox o smartphone fisici. Le verifiche end-to-end di partita, profilo, permessi fotocamera e layout sono documentate separatamente dal coordinatore e dalla suite Playwright del progetto.
