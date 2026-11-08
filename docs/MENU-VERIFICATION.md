# Verifica Playwright: menu, profilo e Buzzer

La verifica usa **Playwright Test reale**, con contesti browser isolati. Configurazione in `playwright.config.js`, suite in `test/menu-profile.spec.js`. Il runner avvia il server locale su porta 3150 e lo arresta al termine.

```sh
npx playwright test --project=chromium
```

Ambiente misurato: Playwright **1.65.0**, Chrome **156.0.8078.80** installato sul computer (`channel: chrome`), Node **24.21.0**. Non sono state aggiunte dipendenze di automazione alla pagina pubblica. Le cache dei browser Playwright Chromium e WebKit erano assenti: è stato usato Chrome locale, senza scaricare browser aggiuntivi. WebKit e Safari non sono dichiarati verificati.

## Baseline prima delle modifiche

Esecuzione separata: `PW_BASELINE=1 PW_PORT=3145 npx playwright test --project=chromium`.

| Vista | 1280×720 | 1366×768 | 1440×900 |
|---|---|---|---|
| Documento ingresso | 1280×720 | 1366×768 | 1440×900 |
| Contenitore ingresso `#join` | scroll interno: 833 px su 720 | scroll interno: 833 px su 768 | nessuno scroll necessario |
| Documento partita | 1280×720 | 1366×768 | 1440×900 |

Il problema riprodotto era nello **scroll interno dell'ingresso**, non in un documento globalmente più alto dello schermo. Il form misurava 833,44 px per somma di contenuti, spazi e padding: a 720 px eccedeva di 113 px, a 768 di 65 px. Gli elementi ambientali avevano dimensioni decorative maggiori ma rimanevano dentro contenitori con overflow nascosto e non erano la causa dello scroll utilizzabile.

Sono stati conservati screenshot e misure prima delle modifiche in `.taste-skill/playwright/before/`, compreso `layout.json`. L'attuale test di baseline viene saltato nella suite finale per non confondere l'interfaccia vecchia con quella nuova.

## Controlli sulla nuova interfaccia

- Tre percorsi del menu: ingresso partecipante, creazione stanza, ripresa della regia.
- Doppio clic sulla creazione: incremento di una sola stanza verificato tramite `/healthz`, navigazione alla regia e credenziali host presenti.
- Codice pubblico da solo: accesso host rifiutato. Codice e chiave corretti: regia aperta.
- Cronologia tra menu e ingresso; invito con `?c=...` apre il form con codice precompilato.
- Profilo personale: nome obbligatorio, Salva/Annulla, ritorno del focus, ricaricamento, avatar e ritaglio, annullamento senza salvare la bozza.
- Galleria: file non immagine e falso PNG rifiutati; immagine reale accettata, ritaglio applicato e JPEG ridotto conservato.
- Fotocamera: rifiuto del permesso simulato con `NotAllowedError`, messaggio e alternativa galleria; stream video simulato tramite canvas, Scatta/Rifai/Conferma/Salva, stream spento dopo conferma ed Escape. Non è stata attivata una fotocamera fisica.
- Due partecipanti: colore applicato solo al proprio dispositivo, persistenza dopo reload e ripristino Lime persistente.
- Nero e bianco personalizzati: foreground automatico, **21:1** di contrasto misurato sia sullo stato effettivo del Buzzer sia sulle tre anteprime Pronto/Prenotato/Chiuso.
- Buzz accettato: impulso sul solo partecipante che ha premuto e sulla sua riga host; nessun impulso sull'altro telefono o sull'altra riga. Due pressioni simultanee producono due ID unici nella coda; il primo ID della coda coincide con il rispondente deciso dal server.

I valori del colore personalizzato sono passati all'evento standard `input` dell'elemento `type=color`: non è stata automatizzata l'interfaccia del selettore colori del sistema operativo. I colori della palette sono stati scelti con clic effettivi.

## Dimensioni e cliccabilità finali

Per ogni controllo vengono verificate posizione e dimensione **prima** di qualsiasi scroll automatico; `locator.click({trial:true})` di Playwright conferma inoltre che il controllo riceva il puntatore. Il solo `overflow:hidden` non è considerato prova di un layout corretto.

| Vista | 1280×720 | 1366×768 | 1440×900 |
|---|---|---|---|
| Menu | documento 1280×720 | documento 1366×768 | documento 1440×900 |
| Ingresso | documento 1280×720 | documento 1366×768 | documento 1440×900 |
| Partita | documento 1280×720 | documento 1366×768 | documento 1440×900 |

I tre desktop non richiedono scroll del documento nelle viste controllate. Menu, form, Buzzer, Chat, Impostazioni e profilo sono cliccabili. Sono stati controllati anche 390×844, 320×568, landscape 844×390 e reflow 640×360. Su piccoli schermi e landscape è consentito lo scroll verticale necessario, mantenendo l'accesso ai controlli e senza overflow orizzontale. A 390×844 la partita rimane alta 844 px; a 844×390 misura 416 px.

Il controllo al **200%** usa il reflow equivalente di un desktop 1280×720 ridotto a viewport CSS 640×360: documento largo 640 px e alto 402 px, con controlli raggiungibili. Non viene presentato come una prova dell'interfaccia Zoom di Chrome o di uno zoom fisico su Safari. Il sistema `prefers-reduced-motion` è stato emulato e gli effetti sul Buzzer controllati.

## Shader e Glass: verifica dell'implementazione reale

Chrome ha restituito `webgl: true`. La suite verifica canvas ShaderGradient visibile, contesto WebGL attivo e non perso, dimensioni positive e `pointer-events:none`. Sono stati verificati anche i canvas WebGL di Liquid Glass sui pulsanti Impostazioni e Profilo; la loro area rimane entro 2 px dal rispettivo controllo, anziché estendersi sull'intera barra.

Sono state provate le preferenze Sfondi spenti, Concentrazione, Riduci trasparenze e Movimento ridotto: ShaderGradient viene fermato quando richiesto, il video mostra il poster quando non deve animarsi e i canvas Glass vengono rimossi nelle modalità che riducono le decorazioni. Per Movimento ridotto il vetro può restare statico; non è richiesta la rimozione della superficie.

Un secondo contesto simula assenza di WebGL mantenendo disponibile Canvas 2D: menu, ingresso, impostazioni e profilo restano utilizzabili, senza canvas opzionali e senza eccezioni JavaScript. Questa prova non misura consumi o frame rate di uno smartphone lento.

Gli screenshot dei dialoghi vengono acquisiti solo quando l'opacità ha raggiunto 1, evitando i fotogrammi iniziali dell'animazione di apertura.

## Riferimenti letti e risorse

Sono stati consultati il [README ufficiale Playwright](https://github.com/microsoft/playwright/blob/main/README.md) per runner e isolamento dei contesti e il [README Figma Context MCP](https://github.com/GLips/Figma-Context-MCP/blob/main/README.md). Nel repository non è stato trovato un riferimento `figma.com/design` o `figma.com/file`; non è stato acquisito un design Figma o dichiarato un confronto pixel con Figma. Non è stato trovato un `AGENTS.md` negli antenati della cartella di progetto.

Artifact locali:

- `.taste-skill/playwright/environment.json`: versioni effettive.
- `.taste-skill/playwright/results.json`: esito del runner.
- `.taste-skill/playwright/after/layout.json` e `*-metrics.json`: dimensioni e contenitori.
- `.taste-skill/playwright/after/custom-color-contrast.json`: misure dei colori estremi.
- `.taste-skill/playwright/after/visual-renderers.json`: stato dei renderer e assenza di errori.
- `.taste-skill/playwright/after/`: screenshot di menu, ingresso, regia, partecipante, profilo, impostazioni e fallback.

Limiti residui: ascolto fisico dei suoni, permessi e fotocamera reali, Safari/WebKit, browser mobile fisici, selettore colori nativo del sistema, prestazioni e batteria su dispositivi lenti. Non sono dichiarati verificati.

## Esito conclusivo

La suite finale comprende sette test attivi superati e una baseline saltata intenzionalmente. Sono passati anche `npm test`, entrambe le suite Afterparty, `npm run test:browser` (13 scenari), `npm run build:visuals`, i controlli sintattici JavaScript e `git diff --check`. Non esiste uno script lint separato nel repository.

Non era disponibile un nuovo screenshot allegato nella conversazione: la schermata iniziale reale e la descrizione fornita sono state il riferimento visivo. La direzione antracite/lime esistente è mantenuta, con vetro e gradienti introdotti come richiesto. Le fotografie/illustrazioni preesistenti non sono state sostituite; il video è un’elaborazione originale della grafica locale, documentata in VISUAL-LIBRARIES.md.

Un’esecuzione intermedia ha registrato due timeout (menu e due partecipanti), con durate anomale superiori ai 90 secondi configurati. La ripetizione senza modifiche alla logica ha completato tutti e sette i test attivi in 30,8 secondi. Il risultato finale JSON registra zero fallimenti; la causa esterna dei timeout non è stata certificata.
