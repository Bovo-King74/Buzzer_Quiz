# Buzzer Quiz

Un'applicazione web per organizzare quiz a risposta rapida in tempo reale, pensata per serate tra gruppi o squadre. L'idea è semplice: un host crea una stanza, i partecipanti si uniscono da smartphone e competono premendo il buzzer al momento dell'apertura della votazione, mentre uno schermo pubblico (`/tv`) proietta la manche e la classifica.

Il progetto è costruito con Node.js, Express e Socket.IO, senza database: lo stato della partita, i punteggi, i gruppi connessi e la chat vengono gestiti in memoria dal server con prestazioni ottimizzate ed endpoint dedicati con caching HTTP per gli avatar.

## Funzionalità principali

- **Partite con codice e chiave host**: creazione senza password, con limiti di frequenza; codice e chiave host per collegarsi a una stanza esistente.
- **Vera coda di prenotazione**: registra tutti i buzz in ordine temporale con timestamp relativo (+0.Xs); se una risposta è sbagliata passa automaticamente al gruppo successivo in coda.
- **Annulla ultima azione (Undo)**: comando Annulla (scorciatoia `Z`) per ripristinare punteggi e manche dopo click accidentali.
- **Schermo proiettore dedicato (`/tv`)**: vista pubblica pulita e di sola lettura con QR code gigante, stato manche, ordine prenotazioni e podio finale.
- **Avatar e selfie leggeri**: caricamento selfie compresso ed erogazione via `GET /avatar/:code/:pid` con cache HTTP per ridurre il payload Socket.IO da oltre 15 KB a meno di 1 KB a evento.
- **Protezione da doppi ingressi e nomi fantasma**: pulsante d'ingresso idempotente con blocco dei doppi tap, e possibilità per l'host di espellere/liberare i nomi di giocatori disconnessi.
- **Suoni ed effetti audio**: supporto per file personalizzati (`buzzer.mp3`, `giusto.mp3`, `sbagliato.mp3`) in `public/sounds/` con sintesi sonora di fallback via AudioContext condiviso.
- **Accessibilità e Responsive**: layout responsive per smartphone sia in verticale sia in orizzontale (landscape), conformità WCAG 2.1 AA (contrasto colori, screen reader `aria-live`, tag semantici).
- **Controllo e moderazione**: approvazione ingressi opzionale, espulsioni, ban per tutta la partita (con possibilità di riammissione), chat con adesivi e rate limit anti-spam.

## Struttura del progetto

```text
quiz-animazione/
├── package.json            # dipendenze e script di avvio
├── server.js               # server Express + Socket.IO + logica di gioco
├── public/                 # client web dell'app
│   ├── host.html           # console di controllo per l'host
│   ├── player.html         # interfaccia smartphone per i gruppi
│   ├── tv.html             # schermo pubblico per videoproiettore
│   ├── style.css           # fogli di stile condivisi
│   ├── assets/
│   │   ├── anim/           # adesivi animati per la chat
│   │   └── buzzer.png      # grafica pulsante buzzer
│   └── sounds/             # suoni di gioco (buzzer, giusto, sbagliato)
└── README.md
```

## Requisiti

- Node.js 18+
- npm

## Installazione

```bash
npm install
```

## Configurazione

Le stanze del quiz si creano direttamente dal pulsante **Crea stanza**, senza password. Per collegare un altro host a una stanza esistente servono ancora codice e chiave host.

`HOST_PASS` deve essere configurata per creare stanze del plugin Afterparty. Non esiste una password predefinita; il quiz principale non la richiede:

```bash
export HOST_PASS="MIACHIAVE"
```

## Avvio

```bash
npm start
```

Il server sarà attivo sulla porta 3000 (o sulla porta indicata da `PORT`):

- **Giocatori**: `http://localhost:3000/` (o `/player.html`)
- **Console Host**: `http://localhost:3000/host` (o `/host.html`)
- **Schermo TV/Proiettore**: `http://localhost:3000/tv` (o `/tv.html`)
- **Health Check**: `http://localhost:3000/healthz`

## Scorciatoie tastiera per l'Host

- `Spazio`: Apre le votazioni / Blocca
- `G` o `g`: Risposta Giusta (assegna punti)
- `S` o `s`: Risposta Sbagliata (passa al prossimo o chiude)
- `Z` o `z`: Annulla l'ultima azione

## Pubblicazione su Render (servizio esistente)

Il progetto richiede un **Web Service Node**, perché chat e partite usano Socket.IO.
Nel servizio Render collegato a questo repository controllare:

- Branch: `main`; Root Directory: radice del repository (campo vuoto).
- Build Command: `npm ci`.
- Start Command: `npm start`.
- Health Check Path: `/healthz`.
- Environment: `HOST_PASS` configura soltanto la password della regia Afterparty; il quiz non richiede password per creare stanze.
- Auto-Deploy: `On Commit`, per pubblicare dopo ogni push su `main`.

Se gli aggiornamenti automatici sono disattivati, usare **Manual Deploy → Deploy latest commit** nel servizio esistente. Non occorre creare un altro servizio.
Aspettare lo stato **Live** e controllare che il commit pubblicato sia quello appena inviato su GitHub.
Aprire `/player.html` e verificare la presenza del logo Buzzer, dell'interfaccia scura e del CSS `/refresh.css?v=clean-20261104` (risposta HTTP 200).
HTML, CSS e JavaScript vengono riconvalidati dal browser; le immagini mantengono la cache.
Una pagina già aperta prima dell'aggiornamento può richiedere un ricaricamento forzato.

Le partite sono conservate in memoria: il deploy/riavvio cancella le stanze attive. Pubblicare tra una sessione e l'altra e usare una sola istanza del servizio.

Documentazione: https://render.com/docs/deploys

## Plugin Afterparty

Il dopogioco di bluff è disponibile separatamente su **`/afterparty/`**. Una regia e 2–12 squadre si sfidano in cinque round di storie inventate, risposte anonime e votazioni. Accesso tramite QR, timer sul server, recupero dopo una disconnessione e classifica scaricabile. La password della regia è quella configurata in `HOST_PASS`.

Non modifica schermate o partite del quiz. Il namespace e le stanze sono separati; `AFTERPARTY_ENABLED=false` disattiva il modulo server. Le stanze sono in memoria e vengono cancellate al riavvio. [Regole, architettura e test](plugins/afterparty/README.md).

## Regia, feedback e preferenze personali

La barra della regia offre **Via 3–2–1**, **Pausa / Riprendi** e **Modalità**. I comandi classici, la coda, i punteggi e Annulla restano disponibili. La modalità e le scadenze sono visibili anche sui telefoni e sulla TV.

- **Via sincronizzato:** blocca i buzzer durante il countdown e li apre tramite il server. Si può annullare dalla stessa barra.
- **Duello:** in Modalità scegli due squadre connesse. Gli altri diventano spettatori; “Torna al gioco normale” conclude il duello e prepara una nuova manche.
- **Estrazione:** seleziona una squadra idonea connessa; puoi escludere le già estratte, azzerare il giro e chiudere il risultato. L’animazione mostra un unico esito già deciso dal server.
- **Tempo per rispondere:** dopo una prenotazione, scegli 10, 20 o 30 secondi. Pausa, riprendi o resetta il timer; la scadenza non assegna penalità.
- **Applausometro:** a prenotazioni bloccate, senza duello, apre 8 secondi di reazioni dai telefoni. Il riepilogo non cambia i punti.
- **Pausa partita:** sospende nuovi buzz, countdown e timer, conservando il tempo residuo.

Il pulsante **Azioni** accanto a ogni squadra apre un pannello con il destinatario indicato. Reazioni, quattro effetti sonori e messaggi rapidi sono privati. **Ci sei?** presenta “Eccomi!” sul telefono e conferma la presenza soltanto all’host. **Spotlight** è invece pubblico su host e TV per 6 secondi. Limiti di frequenza e sovrapposizione evitano invii continui.

Il partecipante sente un breve tono personale al tocco. “Pressione inviata” indica soltanto l’invio: la successiva conferma del server comunica l’accettazione e la posizione in coda. Il suono dell’host segue gli eventi confermati e non viene riprodotto sugli altri telefoni. L’audio si prepara alla prima interazione; **Impostazioni → Prova audio** permette di controllarlo prima di giocare.

**Impostazioni**, su ogni dispositivo, salva localmente tema chiaro/scuro/sistema, contrasto, testo grande, quantità di sfondi animati, movimento, concentrazione, trasparenze e audio. Sono disponibili mute, volumi separati e disattivazione dei suoni ricevuti dalla regia. Le preferenze non cambiano la stanza. Il movimento ridotto del sistema viene sempre rispettato; gli effetti si sospendono nelle schede nascoste.

La riconnessione recupera lo stato corrente e le richieste di presenza ancora valide, senza riprodurre vecchi effetti. Le nuove modalità rimangono in memoria come le partite esistenti: un riavvio del server cancella le stanze.

### Controlli e asset

```bash
npm test                          # controlli storici, logica modalità e Socket.IO reale
npm run test:afterparty
npm run test:afterparty:integration
npm run test:browser              # opzionale: Node 22+ e Chrome/Chromium locale
```

Il test browser usa contesti separati per host, partecipanti e TV senza dipendenze aggiuntive. `CHROME_PATH` permette di indicare il browser; artefatti e screenshot finiscono in `.taste-skill/browser/`. Il progetto continua a richiedere Node 18+ per server e test realtime.

Le nuove icone sono **27 PNG Icons8 iOS**, inclusi localmente, con il collegamento di attribuzione visibile nelle pagine e nelle Impostazioni. Conservare questo credito. [Fonti, licenze e sostituzioni](docs/ASSETS.md), [protocollo e compatibilità delle modalità](docs/realtime.md), [verifiche e limiti](docs/VERIFICATION.md).

## Menu iniziale, profilo e buzzer personale

Aprendo `/` o `/player.html` si vede il nuovo menu:

- **Entra in una stanza** apre il modulo squadra esistente. Un invito `/player.html?c=ABCD` salta il menu e compila il codice.
- **Crea una stanza** crea la partita senza password e apre la regia. La richiesta ha un identificativo conservato per i ritentativi: doppio clic o conferma lenta non creano una seconda stanza.
- **Entra come host** apre `/host.html#resume`: codice pubblico e chiave host vengono verificati dal backend. Il solo codice pubblico non dà accesso alla regia. Un host già riconosciuto può riprendere tramite le credenziali locali.

Impostazioni è nella barra superiore a sinistra; il profilo personale è a destra. Nome e avatar del profilo si salvano in `buzzer.profile.v1` e restano separati da nome e selfie della squadra. Nel profilo si può scegliere una foto, regolare il ritaglio circolare o usare la fotocamera frontale con Scatta, Rifai e Conferma. Salva applica la bozza; Annulla la scarta. La fotocamera viene spenta alla chiusura e quando la scheda diventa nascosta. Su HTTP fuori da localhost o con permesso negato rimane disponibile la galleria.

**Impostazioni → Colore del mio buzzer** offre palette, colore personalizzato, anteprima e ripristino del lime originale. La scelta è salvata nelle preferenze personali già esistenti. Il testo sul colore scelto usa automaticamente nero o bianco; gli stati restano scritti e non dipendono dal solo colore. Il tocco produce il feedback locale; l’anello parte solo dopo l’ACK del server. Nella regia ogni prenotazione accettata attiva un impulso sulla relativa riga, senza cambiare ordine o punteggi.

Liquid Glass JS e ShaderGradient sono inclusi localmente. ShaderGradient vive in una sola isola React decorativa: pagine, comunicazione e stato del gioco restano HTML/JS/Socket.IO. Non serve una migrazione o un servizio esterno. Movimento ridotto, contrasto elevato, trasparenze ridotte e assenza di WebGL attivano alternative statiche/opache. Video e renderer si fermano a scheda nascosta. [Versioni, API, licenze e provenienza del video](docs/VISUAL-LIBRARIES.md).

```sh
npm run build:visuals  # rigenera il bundle locale, con dipendenze di sviluppo installate
npm run test:ui        # suite Playwright del nuovo percorso, profilo e layout
```

Server e bundle statici mantengono il runtime Node 18+; gli strumenti di sviluppo e Playwright richiedono Node 20+ (verificati con Node 24). Per i test Chromium la configurazione usa Chrome installato; `npx playwright install webkit` permette di predisporre WebKit quando disponibile, configurandolo nei progetti Playwright. Il deploy può servire i bundle già presenti in `public/vendor` senza eseguire una build sul server.

[Misure dello scroll, screenshot e risultati delle prove](docs/MENU-VERIFICATION.md). Il vecchio ingresso aveva il form interno alto circa 833 px: a 1280×720 scorreva di 113 px e a 1366×768 di 65 px. Il nuovo layout usa l’altezza disponibile dopo la barra, senza bloccare globalmente lo scroll: reflow e contenuti più grandi possono continuare a scorrere.


## Audit e regressioni — novembre 2026

```sh
npm run test:security     # input ostili, ruoli, origini, avatar e isolamento su server locale
npm run test:regressions  # Playwright: stanze indipendenti, riconnessioni, finale e usabilità
```

Le chiavi host delle nuove stanze sono segreti casuali da 256 bit. Il codice pubblico serve soltanto a giocare o visualizzare la TV. Conserva la chiave host per riprendere la regia su un altro dispositivo. `BUZZER_ALLOWED_ORIGINS` consente, se necessario, origini browser aggiuntive separate da virgole; per impostazione predefinita i collegamenti browser devono avere la stessa origine dell’app. I client senza header Origin devono comunque autenticare ogni ruolo.

Le stanze vivono nella memoria del processo; riavvio o redeploy ne perdono lo stato. Il finale resta recuperabile nella finestra di chiusura di 12 secondi; la classifica già aperta rimane visibile quando la stanza viene eliminata.

Copertura, difetti corretti e limiti sono riportati in [verifica finale](docs/FINAL-VERIFICATION.md), [sicurezza](docs/SECURITY-FIXES.md), [checklist funzionale](docs/FUNCTIONAL-CHECKLIST.md) e [pulizia](docs/CLEANUP-REVIEW.md).
