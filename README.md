# Buzzer Quiz

Un'applicazione web per organizzare quiz a risposta rapida in tempo reale, pensata per una serata tra gruppi o squadre. L'idea è semplice: un host crea una stanza, i partecipanti si uniscono da smartphone, e tutti competono per premere il buzzer al momento giusto quando viene aperta la votazione.

Il progetto è costruito con Node.js, Express e Socket.IO, quindi tutto avviene in tempo reale senza bisogno di database: lo stato della partita, i punteggi, i gruppi connessi e la chat vengono gestiti in memoria dal server.

## Cosa fa

- crea e gestisce partite con codice univoco
- permette a più gruppi di collegarsi con nome, avatar e selfie
- offre una pagina dedicata all'host per controllare la partita
- apre e chiude le votazioni in modo semplice
- registra i click su buzzer e mostra l'ordine di prenotazione
- assegna punti e aggiorna la classifica in tempo reale
- supporta chat tra host e giocatori
- gestisce approvazioni, espulsioni e ban temporanei
- genera QR code per far entrare velocemente i partecipanti

## Come funziona

Il flusso tipico del gioco è questo:

1. L'host avvia una nuova stanza dal pannello di controllo.
2. Viene generato un codice partita e una chiave privata per l'host.
3. I giocatori entrano da un browser mobile usando il codice e il proprio nome.
4. Il selfie è facoltativo: senza foto il gruppo riceve un quadrato colorato con l'iniziale del nome.
5. L'host decide quando avviare la partita e quando aprire le votazioni.
6. Quando le votazioni sono aperte, il primo gruppo che preme il buzzer ottiene la chance di rispondere.
7. L'host può confermare se la risposta è corretta o sbagliata, mentre il punteggio e la classifica vengono aggiornati in tempo reale.
8. Alla fine della manche si può iniziare una nuova round o terminare la partita.

## Struttura del progetto

```text
quiz-animazione/
├── package.json            # dipendenze e script di avvio
├── server.js               # server Express + Socket.IO + logica del gioco
├── public/                 # client web dell'app
│   ├── host.html           # interfaccia dell'host
│   ├── player.html         # interfaccia dei giocatori
│   ├── style.css           # stili condivisi
│   └── assets/
│       └── anim/           # immagini da usare nella chat
├── README.md               # documentazione del progetto
└── node_modules/           # dipendenze installate localmente
```

### Dettaglio dei file principali

- `server.js`
  - avvia l'app Express
  - gestisce le connessioni Socket.IO
  - crea e mantiene le stanze di gioco
  - valida accessi, bannati, punteggi e bottoni buzzer
  - sincronizza lo stato tra host e giocatori

- `public/host.html`
  - pannello di controllo dell'host
  - gestione stanze, QR code, approvazioni, chat e classifica
  - comandi per aprire/bloccare votazioni e assegnare punti

- `public/player.html`
  - interfaccia per i gruppi partecipanti
  - inserimento codice, nome, avatar
  - pulsante buzzer, stato del gioco e chat

- `public/style.css`
  - fogli di stile dell'intera applicazione

## Grafica

Ogni schermata ha uno sfondo animato fatto solo di CSS (nessuna immagine da caricare):

| Dove | Stato | Animazione |
|---|---|---|
| Giocatore | Ingresso, host | raggi che ruotano lentamente |
| Giocatore | Sala d'attesa | pallini che salgono su fondo blu |
| Giocatore | Votazioni bloccate | strisce di cantiere che scorrono |
| Giocatore | Votazioni aperte | raggi gialli veloci + buzzer che pulsa |
| Giocatore | Tocca a voi | onde magenta che si allargano |
| Giocatore | Attesa degli altri | scacchiera turchese che scivola |
| Host | Banner di stato | stesse animazioni, in base alla fase |

Chi ha attivato "Riduci movimento" nel telefono o nel computer vede gli sfondi fermi.

## Tecnologie utilizzate

- Node.js
- Express
- Socket.IO
- QRCode
- HTML/CSS/JavaScript

## Requisiti

- Node.js 18+
- npm
- browser moderno

## Installazione

```bash
npm install
```

## Avvio

```bash
npm start
```

Dopo l'avvio, il server resta in ascolto sulla porta 3000 di default:

```text
http://localhost:3000
```

## Modalità d'uso

### Host

Apri la pagina host direttamente su un browser:

```text
http://localhost:3000/host
```

Da lì puoi:

- creare una nuova partita
- condividere il codice con i gruppi
- approvare o rifiutare l'accesso
- aprire/bloccare le votazioni
- assegnare punti
- gestire la chat

### Giocatori

I partecipanti possono aprire:

```text
http://localhost:3000/player.html
```

Inseriscono:

- codice partita
- nome del gruppo
- selfie/avatar

e poi partecipano al quiz premendo il buzzer quando è il loro turno.

## Note

Questo progetto è pensato per un uso locale o in rete semplice, ideale per eventi, feste, lezioni o workshop. Non usa database persistente, quindi i dati della partita sono mantenuti in memoria finché il server resta attivo.

## Licenza

Questo progetto è distribuito senza una licenza specifica, quindi è da considerarsi un esempio o un progetto personale da adattare liberamente.