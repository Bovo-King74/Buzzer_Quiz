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

Puoi impostare la variabile d'ambiente `HOST_PASS` per definire la parola chiave necessaria per creare nuove stanze host. Se omessa, il server genererà automaticamente una parola chiave casuale all'avvio e la stamperà nel terminale:

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
