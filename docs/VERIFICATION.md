# Verifica Buzzer

## Ambiente

Chrome locale in modalità headless, Node 24.21.0. Il test browser usa il protocollo DevTools e sessioni isolate per host, partecipanti e schermo TV; non aggiunge dipendenze npm.

```sh
node test/browser-smoke.mjs
```

Il controllo opzionale richiede Node 22+ e Chrome/Chromium installato. `CHROME_PATH` consente di indicare l'eseguibile. Il test avvia il server su una porta locale temporanea; per un server già avviato impostare `BROWSER_TEST_URL`; la creazione della stanza quiz non richiede password. Non usarlo su una partita reale: crea una stanza e ne cambia lo stato.

Gli screenshot e il rapporto JSON sono scritti in `.taste-skill/browser/`; `BROWSER_TEST_OUT` cambia la destinazione.
`--capture` crea una stanza e acquisisce anche le viste di gioco a 1440, 768 e 390 px, i menu host e i temi del partecipante.

## Prima delle modifiche

- Inspector della skill design: 1440, 768 e 390 px, pagina di ingresso giocatori, **0 FAIL / 3 WARN**. Screenshot esaminati. Le segnalazioni riguardano la tinta chiara della palette esistente, i colori dell'illustrazione e la dimensione del titolo d'ingresso.
- Flusso browser reale: creazione stanza dal form host, due ingressi dai form partecipanti, connessione TV, avvio e apertura della manche.
- Screenshot di confronto in `.taste-skill/before/` e `.taste-skill/before-game/`.

## Risultato delle verifiche browser

Smoke finale: **13 controlli superati**. Rapporto eseguibile in `.taste-skill/browser/result.json`.

- Flusso di accesso, avvio e prenotazione eseguito con click sui controlli reali.
- Due buzz simultanei, ordine unico deciso dal server, suono locale `press` distinto da `buzzer` dell'host, nessun eco sui partecipanti.
- Passaggio al secondo in coda dopo risposta sbagliata, punteggio dopo risposta giusta, ripristino con Annulla.
- Reazione privata dal menu della squadra e risposta di presenza tramite “Eccomi!”.
- Spotlight dal menu della squadra verificato sulla stessa identità nella regia e nella classifica TV.
- Countdown, pausa e ripresa con mantenimento del tempo, duello con terzo partecipante spettatore, ritorno al gioco normale.
- Timer risposta con pausa, ripresa, scadenza visibile e reset, senza penalità aggiunte.
- Estrazione condivisa e senza ripetere gli estratti, applausometro separato dal punteggio.
- Riconnessione e recupero dello stato senza ripetizione degli effetti; un partecipante disconnesso durante la scadenza del timer recupera “Tempo scaduto” senza riprodurne il vecchio suono.
- Preferenze applicate subito e recuperate dopo il ricaricamento; nessuna modifica alle preferenze degli altri contesti.
- Mute generale, volumi a zero, disattivazione audio della regia, sblocco AudioContext e ritorni dell'API audio verificati. Non si tratta di una prova acustica.
- Preferenza di sistema `prefers-reduced-motion` emulata con CDP, navigazione Tab, Escape e ritorno del focus, buzzer attivato con Spazio senza doppio invio.
- Nessuna eccezione JavaScript, immagine visibile mancante o overflow orizzontale nelle viste controllate.

L'inspector finale sulle pagine di accesso di host, partecipante e TV, ciascuna a 1440, 768 e 390 px, riporta **0 FAIL e 2 WARN per pagina**. Restano intenzionalmente i titoli d'ingresso grandi già presenti nell'identità del progetto; gli altri avvisi riguardano i colori dell'illustrazione del giocatore e lo spazio delle schermate di accesso host/TV. Non sono errori della partita o contenuti sovrapposti.

## Critica visiva

Direzione della skill: **True-black-flat**, seed **1240856172**, conservando palette e tipografia esistenti (`keep palette,type`). Le reazioni emoji e le onde circolari ambientali sono richieste esplicite del brief e prevalgono sui divieti generici della skill; restano separate dai controlli e si disattivano con concentrazione o riduzione del movimento. Le ombre dei dialoghi e dei toast indicano elementi realmente sovrapposti.

```text
ROUND 2
Seen in one second: stanza Buzzer e stato di prenotazione; sul telefono il buzzer resta dominante.
Idea (one sentence): il cerchio del buzzer diventa un'onda ambientale discreta, con gli stessi colori di stato del gioco.
Live thing: prenotazione sul telefono e regia sincronizzata dall'host.
Layout words by section: ingresso=illustrazione/form / host=regia-coda-classifica / player=identità-stato-buzzer / impostazioni=pannello compatto.
Scores: design 6.5 · usability 8 · creativity 6.5 · content 7.5 → overall 7.1
Caps applied: non è una nuova direzione fotografica; conservati asset e composizione esistenti. Nessun voto da sito promozionale assegnato alla partita.
Top three problems (most visible first), each with the screenshot it shows in and the fix:
1. Il codice stanza risultava bianco sul lime nel tema scuro (host-game-1440); corretto con testo scuro.
2. I pulsanti punti dell'host erano troppo stretti (host-game-390); portati a una larghezza minima di 44 px.
3. Il pulsante impostazioni aggiungeva un'ombra a riposo (pagine di accesso); rimossa, inspector finale senza FAIL.
```

I menu Modalità e Azioni sono stati esaminati a 1440 e 390 px. Il destinatario è esplicito, i comandi si dispongono su più righe e il pannello scorre senza coprire i controlli della pagina con contenuti fuori dal dialogo. La regia su telefono continua a richiedere più scorrimento della vista desktop, coerentemente con il numero di funzioni disponibili.

Un'ultima verifica mirata ha confermato che a 768 px la TV mostra i nomi delle squadre per intero, disponendo la classifica sotto la prenotazione; a 390 px le impostazioni dell'accesso host occupano l'angolo superiore sinistro e non coprono i pulsanti dei form. I temi chiaro e scuro sono stati confrontati sullo stesso telefono emulato.

## Limiti

Chrome headless permette di verificare la consegna degli eventi e i percorsi dell'API Web Audio, ma non l'ascolto dagli altoparlanti fisici. Safari/iOS, browser mobile reali, sospensione del telefono e fluidità su smartphone poco potenti richiedono una prova sui dispositivi. Nessuna di queste prove hardware è dichiarata eseguita.
