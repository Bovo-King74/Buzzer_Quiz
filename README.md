# Buzzer Quiz

Un'applicazione web per organizzare quiz a risposta rapida in tempo reale, pensata per serate tra gruppi o squadre. L'idea è semplice: un host crea una stanza, i partecipanti si uniscono da smartphone e competono premendo il buzzer al momento dell'apertura della votazione, mentre uno schermo pubblico (`/tv`) proietta la manche e la classifica.

Il progetto è costruito con Node.js, Express e Socket.IO, senza database: lo stato della partita, i punteggi, i gruppi connessi e la chat vengono gestiti in memoria dal server con prestazioni ottimizzate ed endpoint dedicati con caching HTTP per gli avatar.

## Funzionalità principali

- **Partite con codice e chiave host**: creazione protetta da parola chiave (`HOST_PASS`) con rate limiting anti-brute-force.
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

La parola chiave predefinita per creare nuove stanze host è `KJB`. Puoi impostare la variabile d'ambiente `HOST_PASS` per sostituirla con una parola chiave diversa:

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
- Environment: `HOST_PASS=KJB`, se si vuole usare questa password anche quando è già configurato un valore diverso.
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
