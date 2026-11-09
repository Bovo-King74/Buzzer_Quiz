# Efficienza, dipendenze e pulizia — 8 novembre 2026

Revisione del repository corrente e dei difetti documentati nell’audit del 6 novembre. Questo intervento modifica `public/experience.js` e `public/experience.css`; non cambia regole, prenotazioni, punteggi, dipendenze o asset. Le correzioni a server, navigazione, chat, clock realtime e rendering visivo sono coordinate separatamente.

## Audio: lavoro rimosso dal caricamento iniziale

Prima della modifica ogni pagina eseguiva immediatamente `/api/sounds` e scaricava i file audio disponibili, compreso `public/sounds/buzzer.mp3` (58.513 byte), anche sul menu iniziale e prima di qualsiasi interazione. Ora la preparazione parte dal primo gesto esplicito che sblocca l’audio oppure dalla prova audio. Con master mute già salvato non viene creato neppure l’`AudioContext`; il comando nativo che riattiva i suoni prepara il grafo audio.

La preparazione viene condivisa tra richieste contemporanee: una richiesta al manifest, un download per file e una decodifica per suono durante la visita. I buffer codificati vengono rilasciati dopo la decodifica. Lo sblocco concorrente condivide la stessa promessa; una volta pronto non ricrea sorgenti silenziose ad ogni comando. La sorgente silenziosa iniziale si scollega quando termina.

Il buzz personale resta un tono sintetizzato immediato e non aspetta file o animazioni. L’host usa il file preparato per il suo buzz confermato, oppure la sintesi distinta già prevista se download/decodifica non riescono. I tre percorsi master, buzz locale ed effetti ricevuti mantengono i propri controlli di volume/mute. Gli effetti temporanei non vengono accodati per essere riascoltati dopo una riattivazione della pagina.

`/api/sounds` accetta nel client soltanto le chiavi previste e percorsi della stessa origine sotto `/sounds/`. Non sono stati aggiunti fetch audio in chat, echo realtime o nuovi riproduttori `Audio`. La rassegna dei sorgenti conferma che l’audio condiviso rimane in `experience.js`; `live-ui.js` e `player.html` lo invocano tramite l’API esistente.

## Preferenze e feedback corretti

- Il backdrop del pannello usa un selettore `::backdrop` valido separato da `:is()`, anche sulla TV che non carica `app-shell.css`. Riduzione trasparenze e contrasto elevato producono il fondo opaco del tema.
- Le impostazioni a larghezze ridotte impilano etichetta e select: i valori completi restano leggibili anche con testo grande a 320 px.
- La modalità concentrazione sopprime l’animazione dei toast nella base condivisa, conservando il messaggio.
- Un effetto prossimo alla scadenza viene rimosso alla propria deadline; il precedente minimo di 1,5 secondi poteva mantenerlo visibile oltre `expiresAt`.

Le correzioni equivalenti già presenti nello stile della shell restano compatibili; la base copre anche i pannelli TV. La posizione dei toast e gli altri controlli della shell appartengono alla verifica complessiva dell’interfaccia.

## Prove eseguite

Chrome reale headless tramite Playwright, server locale isolato su porta 3148, viewport 320×568. Sono stati usati i controlli nativi del pannello; le misure audio contano richieste, contesti, decodifiche e sorgenti reali. Risultati in `.taste-skill/cleanup-review/experience-check.json`.

| Controllo | Risultato osservato |
| --- | --- |
| Pagina senza gesti | Zero richieste audio e zero AudioContext. |
| Primo gesto, 12 sblocchi concorrenti, pannello riaperto | Un manifest, un MP3, un contesto, una decodifica. |
| Pressione personale / buzz host | Una sorgente oscillatore per `press`; una sorgente buffer per `buzzer` preparato. |
| Master mute, volume buzz zero, mute regia | `play()` rifiuta il percorso corrispondente senza nuove sorgenti. |
| TV, testo grande, 320 px | Testi selezionati misurati entro lo spazio disponibile; backdrop opaco. |
| Toast in concentrazione con scadenza a 300 ms | Animazione `none`; toast assente dopo 500 ms. |
| Master mute salvato e successiva riattivazione nativa | Nessun engine/download finché disattivato; una preparazione alla riattivazione. |
| AudioContext assente | Impostazioni funzionanti, stato audio non disponibile e zero download facoltativi. |
| Manifest audio non raggiungibile | Il buzz host sintetizzato continua a funzionare. |

Nove controlli mirati superati; nessuna eccezione di pagina nei contesti esaminati. Superato anche `node --check public/experience.js`. Queste prove verificano percorsi e assenza di duplicazioni; non misurano volume acustico, udibilità in sala, Safari/iOS fisici o consumo di batteria su smartphone.

## Dipendenze

Eseguiti contro il registro npm l’8 novembre 2026, con cache temporanee esterne al repository:

```sh
npm audit --json --omit=dev --cache=/private/tmp/buzzer-audit-cache
npm audit --json --cache=/private/tmp/buzzer-audit-cache-all
```

Entrambi gli audit hanno restituito **zero vulnerabilità segnalate**, comprese zero alte e critiche. Il primo tentativo nel sandbox non raggiungeva il DNS; i risultati sopra provengono dalle esecuzioni successive con accesso di rete autorizzato, non da dati memorizzati in un vecchio report. Non sono stati eseguiti `npm audit fix`, installazioni o modifiche a package/lockfile in questo sottotask.

Express, Socket.IO e qrcode sono usati dal server e dal modulo Afterparty. Le dipendenze di sviluppo servono alle prove Playwright o alla build dell’isola ShaderGradient; i vincoli Three/camera-controls/three-stdlib hanno un ruolo di compatibilità documentato. Non è stata identificata una dipendenza diretta eliminabile con certezza. Un audit senza segnalazioni non certifica l’assenza di vulnerabilità del codice applicativo.

## Inventario e candidati alla pulizia

Rassegna di sorgenti HTML/CSS/JS, build, endpoint dinamici e documentazione. Dopo la verifica incrociata, il coordinatore ha applicato le rimozioni mirate riportate sotto; gli asset dinamici sono stati conservati.

| Elemento | Riscontro / decisione |
| --- | --- |
| `public/assets/live-crowd.jpg` — 100.433 byte | Nessun riferimento applicativo o di build trovato, né endpoint dinamico che lo selezioni. Il coordinatore ha confermato la ricerca nell’intero repository e rimosso l’asset inutilizzato. |
| Immagini in `public/assets/anim/` | Sono tutte elencate dinamicamente da `/api/anims`; l’assenza di nomi letterali nei client non dimostra che siano inutilizzate. Conservate. |
| File in `public/sounds/` | `buzzer` e gli eventuali `giusto`/`sbagliato` vengono selezionati dall’API per nome e formato. Conservati. |
| Set locale Icons8 | La whitelist di `icon(name)` costruisce i percorsi; alcuni nomi compaiono solo nei dati dei controlli. Non rimuovere file sulla base della sola ricerca di URL letterali. |
| Video sorpresa con nome accentato | Referenziato da `player.html` tramite URL percent-encoded e caricamento al gesto. Conservato. |
| `chat-easter-egg.js`, `easter-eggs.js` | Referenziati e invocati dai flussi chat/ingresso; la presenza di una regola `.gitignore` non rende inutilizzato un file già tracciato. Conservati. |
| `buzzer.png`, illustrazioni della serata/trofeo, loop e poster menu | Hanno riferimenti espliciti in pagina o nello script di generazione video. Conservati. |
| Fogli stile e script applicativi top-level | Tutti hanno riferimenti nei percorsi applicativi. Le sovrascritture CSS non giustificano la rimozione di un intero file senza verifica delle tre viste e di Afterparty. |
| Vecchio blocco di sfondi in `style.css` | I relativi pseudo-elementi erano disattivati da `refresh.css` nelle tre pagine principali; `--o` e `spin/slide/rise/drift/ring` appartenevano a quel blocco. Rimossi dal coordinatore, preservando i vincoli di posizione/isolation e il fondo lobby. |
| Selettori buzzer/adesivi obsoleti | Il coordinatore ha eliminato i selettori `#bz img` non più usati e sostituito la vecchia selezione `.stk img.on` con lo stato accessibile del pulsante `aria-pressed`. Gli asset rimangono disponibili per i riferimenti conservati. |
| Audit storici che asseriscono difetti | Sono riproduzioni della versione del 6 novembre, non test di accettazione del prodotto corretto. Il vecchio comando `audit-realtime.js` ora avvia le suite di regressione realtime/sicurezza; i report restano marcati come evidenza storica. |

## Lifecycle Liquid Glass / ShaderGradient

Revisione in lettura del controller e delle classi vendorizzate:

- Il controller limita Liquid Glass a sei superfici visibili, usa disegni in risposta a eventi e non avvia il loop continuo dei `Button` annidati upstream.
- `releaseGlass` rimuove i layer, libera texture/buffer, rilascia il contesto e rimuove le istanze dal registro e dal ResizeObserver. I callback di setup sono protetti da `disposed`.
- La pagina nascosta smonta ShaderGradient, rimuove i contesti glass e mette in pausa il video. Concentrazione, contrasto e trasparenze ridotte disattivano le superfici decorative. L’isola React contiene esclusivamente lo sfondo.
- Lo snapshot è limitato a 1920×1200 e campiona decorazioni locali, senza screenshot di campi, profilo o chat.

Segnalato e corretto dal coordinatore: un cambio di volume/mute non deve rigenerare lo snapshot grafico. Il listener visuale ora filtra le preferenze che modificano effettivamente l’aspetto.

Due opportunità restano osservazioni sul sorgente, senza regressione o crescita illimitata dimostrata: l’inizializzazione upstream converte lo stesso snapshot in data URL e lo decodifica per ogni nuova istanza; il registro conserva un singolo snapshot anche quando le istanze sono rilasciate (fino a circa 9,2 MB di pixel RGBA). Non sono state modificate le classi upstream o il lifecycle del controller per inseguire un miglioramento non misurato. Nessuna promessa di prestazioni su hardware fisico deriva da questa lettura.

## Ricerca di credenziali

Controllati 68 file testuali del working tree tracciati e non ignorati, con pattern ad alta confidenza per chiavi private, token di servizio e URL di database con credenziali. Esclusi dipendenze, artefatti browser, media binari e storia Git. Non sono emersi file con corrispondenze né file di configurazione sensibili tra quelli esaminati; nessun valore è stato stampato. È una scansione mirata, non una certificazione del repository o della sua storia.

## Font: rimosso il blocco da servizio esterno

Un successivo controllo CDP ha riprodotto `document.readyState` ancora diverso da `complete` dopo oltre sei secondi, in attesa dell’import Google Fonts all’inizio di `style.css`. È stato sostituito soltanto quell’import con `@font-face` locali e `font-display: swap`, conservando Bricolage Grotesque 400/700 e Dela Gothic One 400. Nessun nuovo servizio, pacchetto o altro cambio di stile è necessario.

Gli otto WOFF2 provengono dagli URL effettivamente restituiti dal CSS ufficiale Google; firma, tipo MIME, stato HTTP e dimensione sono verificati. Le due licenze OFL 1.1 provengono dal repository Google Fonts, con commit e SHA-256 conservati nel manifest. Provenienza, copertura Unicode e attribuzioni sono documentate in [ASSETS.md](ASSETS.md#font-locali--8-novembre-2026).

Payload archiviato: **108.764 byte**, più licenze e manifest. La pagina italiana e i campioni regolare/grassetto caricati nel controllo hanno richiesto soltanto due file latini, **55.036 byte**, poiché i due pesi Bricolage condividono il WOFF2 variabile. I subset aggiuntivi sono selezionati dai caratteri visualizzati; gli script non inclusi restano leggibili tramite i fallback di sistema.

Chrome headless, viewport 390×844, processo locale isolato: `readyState: complete` in **307 ms**, zero richieste a `fonts.googleapis.com`/`fonts.gstatic.com`, zero errori di pagina. CDP ha confermato font custom realmente usati per Bricolage 400, Bricolage 700 e Dela 400 su testo con accenti italiani. Dati in `.taste-skill/cleanup-review/font-check.json`. Il tempo è una misura locale di questa esecuzione, non una previsione di rete o hardware reale.
