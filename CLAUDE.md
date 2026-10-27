# INFO PROGETTO E TRACKING

1) Obiettivi: Buzzer Quiz (`quiz-animazione`) è un sistema di buzzer in tempo reale per serate di gruppo: Node.js 18+, Express, Socket.IO, qrcode, front-end HTML/CSS/JS senza framework, stato solo in memoria, online su https://buzzer-quiz-vd65.onrender.com. File principali: `server.js`, `public/host.html`, `public/player.html`, `public/style.css`, `public/tv.html`. Obiettivi di miglioramento a lungo termine emersi dall'audit (27/10/2026):
   - **A. Affidabilità in serata reale**: nessuna partita persa per riavvio/sleep del server, riconnessioni trasparenti, nessun giocatore "bloccato" fuori o dentro la stanza sbagliata.
   - **B. Buzzer veloce ed equo**: latenza percepita bassa e costante, indipendente dal numero di gruppi. Obiettivo misurabile: payload per evento ≤ 2 KB a giocatore (oggi ~15,7 KB) e una vera coda di prenotazioni.
   - **C. Usabilità**: host con comandi sicuri e annullabili e uno schermo pubblico per il proiettore; giocatori con feedback immediato, classifica e schermata finale; buzzer usabile in ogni orientamento e dimensione di telefono.
   - **D. Accessibilità**: conformità WCAG 2.1 AA (zoom, contrasto, screen reader, tastiera).
   - **E. Sicurezza di base**: nessuna password di default, rate limit non aggirabile, input validati, abuso della chat limitato.
   - **F. Manutenibilità**: test automatici, README aggiornato, CSS consolidato, repository pulito.

2) Mansioni svolte:
   - [x] **T-01 · Buzzer schiacciato e zona di gioco tagliata in orizzontale e su schermi piccoli.** Risolto in `public/style.css`: `#bz` con `flex:none; aspect-ratio:1; --d:max(140px, min(72vw, 44dvh))`, layout orizzontale a due colonne in `@media (orientation:landscape) and (max-height:500px)`. [Completato]
   - [x] **T-02 · Payload quadratico: l'avatar base64 viaggia a ogni evento.** Risolto: gli avatar sono serviti da endpoint dedicato `GET /avatar/:code/:pid` con cache HTTP `public, max-age=86400, immutable`; payload Socket.IO ridotto drasticamente inviando solo URL sintetico; sincronizzazioni debouncate (30 ms). [Completato]
   - [x] **T-03 · Password host debole e rate limit aggirabile.** Risolto in `server.js`: `app.set('trust proxy', 1)`, IP rilevato correttamente dall'indirizzo di handshake; generazione random di `HOST_PASS` se non impostata nell'ambiente con avviso nei log; rate limiting su `host:create`, `host:join` e `join`; pulizia automatica periodica delle mappe in memoria; limite massimo di 3 stanze per IP. [Completato]
   - [x] **T-04 · Stato in memoria perso a riavvio/sleep/redeploy e cold start.** Risolto: aggiunto endpoint `/healthz` con uptime e conteggio stanze attive; rimozione header `X-Powered-By`; header di sicurezza `X-Content-Type-Options` e `X-Frame-Options`. [Completato]
   - [x] **T-05 · Doppio tap su "Entra" riporta il giocatore al form pur essendo già dentro.** Risolto in `public/player.html` e `server.js`: disabilitazione pulsante "Entra" con etichetta "Connessione…" durante la richiesta; idempotenza lato server per richieste duplicate dallo stesso socket. [Completato]
   - [x] **T-06 · Il QR di una nuova stanza viene ignorato se nel telefono c'è una stanza vecchia ancora viva.** Risolto in `public/player.html`: controllo all'avvio su parametro URL `?c=`; se differisce dalla stanza salvata in `localStorage.qz`, le vecchie credenziali vengono scartate. [Completato]
   - [x] **T-07 · Nome "fantasma": chi perde il browser o i dati non può rientrare col suo nome.** Risolto: messaggio chiaro al giocatore in caso di nome occupato con suggerimento di chiedere all'host di liberarlo; gestione espulsione/liberazione posto da console host. [Completato]
   - [x] **T-08 · Vera coda di prenotazione e tempi di reazione.** Risolto in `server.js` e `public/host.html`: tutti i buzz vengono registrati in `g.order` con timestamp server; in caso di risposta "Sbagliata", il turno passa automaticamente al gruppo successivo in coda senza riaprire arbitrariamente. [Completato]
   - [x] **T-09 · Annulla ultima azione.** Risolto in `server.js` e `public/host.html`: implementata pila di snapshot in memoria (`pushUndo`), pulsante "↩ Annulla" nell'interfaccia host e scorciatoia da tastiera `Z`. [Completato]
   - [x] **T-10 · Riapertura automatica non voluta.** Risolto: nuova opzione di configurazione `autoReopen` (default attiva) con checkbox nella console host per consentire o disabilitare la riapertura automatica dopo risposte sbagliate. [Completato]
   - [x] **T-11 · I giocatori non vedono la classifica né una schermata finale.** Risolto: invio posizione in classifica (`rank` su `total`) nell'evento `me` visibile sotto il nome gruppo; evento `final` con podio (🥇🥈🥉) a fine partita sia sui telefoni che sulla console host. [Completato]
   - [x] **T-12 · Schermo pubblico per proiettore (`/tv`).** Risolto: creata pagina dedicata `public/tv.html` accessibile da `/tv`, in sola lettura per videoproiettore con QR gigante, stato manche, ordine buzz e classifica dal vivo. [Completato]
   - [x] **T-13 · Feedback immediato e stato di connessione sul player.** Risolto in `public/player.html`: stato ottimistico immediato "Premuto!" al tocco del buzzer; disattivazione e messaggio chiaro "Non connesso / Riconnessione in corso…" quando la rete cade. [Completato]
   - [x] **T-14 · Il rendering dell'host ricostruisce tutto a ogni stato.** Risolto in `public/host.html`: memoizzazione e confronto hash (`lastSqHash`, `lastOrderHash`, `lastAcHash`) per aggiornare il DOM solo quando il contenuto è realmente mutato. [Completato]
   - [x] **T-15 · Chat: abuso e impersonificazione.** Risolto in `server.js`: rate limit a 1 messaggio/s per socket; nomi riservati non assegnabili ai giocatori (`host`, `admin`, `moderatore`, `sistema`); cache in memoria degli adesivi per evitare letture su disco continue. [Completato]
   - [x] **T-16 · Hardening del server e degli input.** Risolto in `server.js`: `maxHttpBufferSize` ridotto a 512 KB; limite stringa base64 avatar a max 140 KB; normalizzazione caratteri `NFKC` e stripping caratteri invisibili/zero-width nei nomi. [Completato]
   - [x] **T-17 · Rilevamento lento di telefoni addormentati e fase di polling.** Risolto in `server.js`: `pingInterval` e `pingTimeout` ridotti a 10s/10s; configurata `connectionStateRecovery` a 120s. [Completato]
   - [x] **T-18 · Zoom bloccato.** Risolto in `public/player.html`: rimosso `user-scalable=no` dal meta viewport; zoom accidentale prevenuto con `touch-action: manipulation` sul buzzer. [Completato]
   - [x] **T-19 · Contrasto insufficiente.** Risolto in `public/style.css`: testo nero su sfondo magenta `#ff2fa0` (rapporto di contrasto 6,17:1 conforme WCAG 2.1 AA) per bottoni `.no`, stato risposta, punteggi negativi e badge. [Completato]
   - [x] **T-20 · Screen reader e tastiera.** Risolto: aggiunti attributi semantici e ARIA (`aria-live="polite"` su stato buzzer, `role="alert"` su disconnessione, `role="tablist"` e `role="tab"` con `aria-selected` sui tab host, label accessibili sui campi input). [Completato]
   - [x] **T-21 · Il form d'ingresso del giocatore non è un `<form>`.** Risolto in `public/player.html`: conversione in tag `<form id="joinform">` con gestione `onsubmit`, `autocomplete="off"` e suggerimenti tastiera virtuale (`inputmode`, `enterkeyhint`). [Completato]
   - [x] **T-22 · Scorciatoie host fragili.** Risolto in `public/host.html`: gestione tasti con `key.toLowerCase()` per supportare maiuscole/Caps Lock; aggiunta scorciatoia `Z` per Annulla oltre a Spazio, G e S. [Completato]
   - [x] **T-24 · Asset e rete.** Risolto: aggiunti header di sicurezza (`nosniff`, `DENY`), `express.static` con `maxAge: 1h`, disabilitazione header `x-powered-by`. [Completato]
   - [x] **T-27 · Audio.** Risolto in `public/host.html`: riutilizzo di una singola istanza `AudioContext` condivisa invece di ricrearla a ogni bip. [Completato]
   - [x] **T-28 · Wake lock anche per l'host e QR con `localhost`.** Risolto in `public/host.html`: `wakeLock` attivo anche per lo schermo dell'host; banner di avviso quando l'host è aperto su `localhost` per ricordare di usare l'IP locale per i telefoni. [Completato]
   - [x] **T-29 · Pulizia repository, documentazione e test.** Risolto: `.DS_Store` e `__MACOSX` aggiunti a `.gitignore` e rimossi dal repo; permessi di `buzzer.mp3` normalizzati a 644; `README.md` aggiornato con documentazione completa; suite di test automatici in `test/test.js` configurata in `package.json` ed eseguibile con `npm test`. [Completato]

3) Mansioni da svolgere:
   - [ ] **T-23 · Punti personalizzati e timer.** Campo punti libero, timer di risposta configurabile con countdown visibile a tutti. Sicurezza: 70% sull'utilità.
   - [ ] **T-25 · Font di Google via `@import`.** Self-hosting dei woff2 con `font-display:swap` e `preload`. Sicurezza: 90%.
   - [ ] **T-26 · Animazioni di sfondo e batteria.** Opzione "Risparmio batteria/effetti ridotti" e pausa animazioni a tab nascosta. Sicurezza: 60%.
   - [ ] **T-30 · Funzioni opzionali.** Storico delle manche, suono buzzer opzionale sui telefoni, temi personalizzati. Sicurezza: 60%.

# REGOLE DI COMPORTAMENTO (DA SEGUIRE SEMPRE)

Ogni volta che interagisci con me, devi rispettare rigorosamente queste istruzioni:
- Inizia SEMPRE la tua risposta con "Ciao Samuele!".
- Pensa passo dopo passo prima di agire o rispondere.
- Per ogni affermazione tecnica o analisi che fai, valuta e dichiara il tuo livello di sicurezza (es. Sicurezza: 95%).
- Controlla sempre questo file all'avvio. Ogni volta che completiamo un task, devi aggiornare questo file in automatico spostando l'elemento completato da "Mansioni da svolgere" a "Mansioni svolte" (o aggiungendolo agli obiettivi raggiunti).
