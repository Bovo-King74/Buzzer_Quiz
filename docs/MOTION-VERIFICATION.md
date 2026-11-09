# Buzzer: interazioni e movimento — 9 novembre 2026

Il lavoro riguarda il quiz principale: home, ingresso squadra, giocatore, regia, lobby e TV. Afterparty conserva la propria UI e il proprio namespace. Nessun cambiamento alle regole del server, ai permessi o ai formati di persistenza. Non è stato eseguito un deploy.

## Direzione e file

L'identità esistente rimane: lime, scuri verdi, Bricolage Grotesque, buzzer circolare. La richiesta esplicita di profondità, luce e Liquid Glass prevale sulle preferenze stilistiche generiche delle skill. Non è stato estratto un nuovo tema: è un intervento sui componenti e sulla composizione già esistenti.

- `public/motion.css`: tempi condivisi (pressione 90 ms, controlli 160 ms, pannelli 320 ms, scena 420 ms), curve, focus, stati busy/disabled, menu, profondità e onde finite del buzzer, vincitore, pannelli nativi e layout tablet. L'avviso rete ora occupa spazio e non copre la barra.
- `public/motion.js`: riconciliazione per ID, aggiornamento dei discendenti senza ricreare i controlli, riordino FLIP interrompibile, feedback sui punteggi, origini dei dialog e pulizia delle animazioni a pagina nascosta o movimento ridotto.
- `public/player.html`, `public/experience.js`: ARIA degli stati, feedback locale immediato, ACK obsoleti ignorati, snapshot autorevole più recente preferito alla vecchia posizione dell'ACK, cancellazione del vecchio impulso a nuova manche. L'emit non aspetta audio o animazioni.
- `public/host.html`, `public/tv.html`: righe di lobby, classifica e prenotazione con chiavi stabili. In regia il controllo che mantiene il focus rimane lo stesso nodo anche quando la squadra cambia posto.
- `public/style.css`: il reset globale esclude la scena Stageshow.
- `public/visuals.js`: il vecchio video nascosto non viene caricato/riprodotto né campionato come sfondo del vetro. La libreria Liquid Glass locale rimane quella già integrata (commit 78cb6ccb), con rendering a eventi; le superfici dei dialog sono più opache per il contrasto.
- `visuals-src/buzzer-demo/`: demo Stageshow, foglio di stile, build e REHEARSAL. `visuals-src/stageshow/`: subset del kit con MIT/NOTICE. Bundle e licenze in `public/vendor/`.
- `test/motion.spec.js`, `playwright.config.js`, `package.json`: quattro regressioni mirate e comandi di build/verifica separati.

Nessuna nuova dipendenza npm. `.gitignore`, già modificato all'inizio, non è stato toccato. Non era presente un AGENTS.md né nel progetto né nei percorsi superiori controllati.

## Verifiche funzionali

- `npm test`: 4 asserzioni storiche e 14 test Node/realtime/sicurezza, tutti passati.
- `npm run test:ui`: 7 passati; il test baseline riservato alla cattura pre-intervento è saltato intenzionalmente.
- `npm run test:regressions`: 3 passati, con sessioni indipendenti host/giocatori/TV, due stanze, rete ritardata, duplicati, pausa, riconnessione, finale e recupero del focus.
- `PW_RECORD_MOTION=1 npm run test:motion`: 4 passati, con registrazioni dei contesti reali.
- Dopo la correzione della barra offline è stata ripetuta la prova specifica del buzz/riconnessione: passata, con controllo geometrico che l'avviso non copra la shell e controllo dell'icona offline.
- `npm run build:demo`, `node --check` sui JS modificati e `git diff --check`: passati.

La suite motion avvia un server fresco separato dalla suite menu: un primo tentativo cumulativo raggiungeva correttamente la protezione di 5 creazioni/minuto del server. Non è stato allentato il limite di produzione.

Casi aggiunti: tre tap sincroni → un solo emit immediato; ACK dopo nuova manche → nessun impulso obsoleto; Enter da tastiera; offline/ritorno allo stato corrente; nodo e focus conservati durante punteggi ravvicinati e arrivo di una squadra; promozione al turno di risposta prima dell'ACK inizialmente di secondo posto; demo senza credenziali o eventi reali; arresto fuori schermo; poster ridotto; Escape durante l'apertura e riapertura rapida dei pannelli.

Desktop verificati: 1280×720, 1366×768, 1440×900; tablet 768; mobile 390×844, 320×568, landscape 844×390 e reflow 640×360. Verificati nomi al limite consentito, colori personali bianco/nero, fallback senza WebGL, trasparenze ridotte e movimento ridotto. Screenshot di regia/giocatore/TV e pannelli sono nelle directory Playwright già previste dal progetto.

## Verifica visiva e limiti

`design-taste-frontend/inspect.mjs` prima: 2 FAIL, 1 WARN, con titolo tablet su tre righe. Dopo: **0 FAIL, 2 WARN**, titolo su due righe a 1440/768/390, senza overflow. Sono ammesse esplicitamente le regole gradient, button-fx, heavy-shadow e glass, coerentemente con l'identità esistente e la richiesta di profondità. I due warning residui riguardano bordi dei controlli e titolo ampio della home: entrambi intenzionali in questo menu, che presenta i percorsi di ingresso. Il contrasto segnalato durante la prima iterazione è stato corretto. `layout.mjs --strict` sul menu a 390: no-issues-detected.

La revisione di Stageshow e gli artefatti sono descritti in `visuals-src/buzzer-demo/REHEARSAL.md`. Gate superati, ma report motion **inconclusive per intervalli non campionati**; questo limite non è stato convertito in un pass completo. Sono stati guardati i fogli delle sequenze, i dettagli a 60 ms e i contatti estratti dai video; il difetto di sovrapposizione durante l'ingresso e l'avviso rete che copriva la shell sono stati corretti dopo la revisione.

Nessuna certificazione cross-browser, WCAG completa o test su telefono fisico. La rete lenta/offline è stata simulata; non è una misura della latenza su rete mobile reale. Ambiente: Chrome 157.0.8103.39, Node 24.21.0. Due campioni locali da 2,5 s, a larghezza 1440 e 390, hanno prodotto 151 frame ciascuno, mediana 16,7 ms, massimo 16,8 ms e nessun intervallo oltre 40 ms; non certificano i gap del recorder né hardware diverso. Misure rAF locali sono salvate in `.taste-skill/motion/raf.json`: descrivono questa esecuzione Chrome e non un benchmark su dispositivi mobili.

## Riproduzione

```sh
npm start
npm run build:demo
npm test
npm run test:ui
npm run test:motion
npm run test:regressions
# Opzionale, con FFmpeg di Playwright installato:
PW_RECORD_MOTION=1 npm run test:motion
```

App locale: http://localhost:3000/ . Video e screenshot sono in `.taste-skill/motion/`, `.taste-skill/motion-after/` e `.taste-skill/playwright/` (artefatti locali ignorati da Git).

## Critica finale della composizione

ROUND 3

Seen in one second: il buzzer lime e l'azione per entrare.

Idea (one sentence): il passaggio da pressione a prenotazione dà al quiz la tensione di una vera manche.

Live thing: ingressi e creazione stanza reali; demo del gesto separata dalla partita.

Layout words by section: home=split / tablet=navigazione sopra, scena sotto / mobile=azioni prima, scena dedicata dopo.

Scores: design 7.5 · usability 8 · creativity 7 · content 8 → overall 7.6 (valutazione interna, non un punteggio esterno).

Caps applied: le regole di profondità/luce del brief e l'interfaccia di gioco prevalgono sui divieti editoriali generici della skill; nessuna fotografia nuova era richiesta per questa demo di prodotto.

Top fixes completed: crop e tipografia compact; continuità delle righe e del focus; uscita/ingresso senza inchiostri sovrapposti.

Still short: le parti secondarie della regia mantengono l'impostazione precedente; fluidità su hardware mobile e Safari non misurata.
