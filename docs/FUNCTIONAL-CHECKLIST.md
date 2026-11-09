# Buzzer — verifica funzionale del 8 novembre 2026

Questa verifica unisce tre suite Playwright di regressione nuove, le sette suite UI esistenti e lo smoke con host, partecipanti e TV. I controlli server mirati rimangono in `test/realtime.test.js` e nelle suite Afterparty. Non equivale a provare ogni combinazione possibile di modalità, dispositivo e rete.

La nuova suite usa Chrome reale tramite Playwright, con storage e contesti indipendenti per due host, due partecipanti nella prima stanza, un partecipante nella seconda e una TV. Le porte dei gruppi di test sono separate per non consumare fra loro i limiti di creazione delle stanze.

```sh
npm test
npm run test:afterparty
npm run test:afterparty:integration
npm run build:visuals
npm run test:ui
PW_FULL_AUDIT=1 PW_PORT=3152 npx playwright test --project=chromium
```

Il comando finale seleziona solo `test/full-audit.spec.js`. Il runner avvia e arresta automaticamente il server locale. Il rapporto separato è `.taste-skill/playwright/audit-results.json`; screenshot e checkpoint leggibili sono in `.taste-skill/full-qa/`.

**Ultimo passaggio della nuova regressione: 3 suite superate su 3, 40,8 secondi, con 16 checkpoint funzionali positivi.** Comprende il controllo aggiunto sui pixel della PNG trasparente, il badge Offline nel Buzzer e la chiave host lunga su entrambe le larghezze. Il server di verifica 3152 risulta arrestato al termine.

## Difetti riprodotti e corretti

| Problema osservato | Riproduzione e conseguenza | Verifica della correzione |
|---|---|---|
| Credenziali opzionali `null` rifiutate dal nuovo validatore | Primo ingresso dal form: il client invia `pid:null` e `token:null`; compariva “Credenziali non valide”, anche senza foto. | Ingresso reale da form con doppio clic, con e senza selfie: accettato. Il payload reale è coperto anche dalla regressione server. |
| Coda bloccata dopo Blocca/Apri | Due gruppi prenotati; bloccare e riaprire lasciava la manche senza rispondente. | La fase torna `answering` e riprende lo stesso primo ID della coda. |
| Finale perso al refresh del partecipante | Durante la finestra finale il server rifiutava la riconnessione prima di controllare le credenziali esistenti. | Host, partecipante e TV recuperano il podio dopo ricaricamento, entro la finestra documentata. |
| TV collegata manualmente non si riagganciava | Aprire `/tv.html` senza query, inserire il codice, disconnettere e riconnettere. | Il round TV coincide con il nuovo round dell'host dopo la riconnessione. |
| PNG trasparente convertito in avatar nero | L'immagine nera su trasparenza veniva convertita in JPEG su fondo nero implicito. | Il canvas ora ha un fondo chiaro; nella JPEG finale rimangono pixel chiari e scuri, misurati usando una PNG realmente caricata dal form. |
| Chiave host lunga a rischio overflow | Mostrare la chiave completa dopo l'estensione a 64 caratteri. | La chiave intera è visibile nel pulsante, senza overflow orizzontale, su desktop e telefono. |
| Chat e controlli secondari difficili da usare da tastiera | QR ingrandibile solo con il mouse, adesivi senza pulsanti semantici, Escape/focus chat incompleti. | Enter apre il QR, Escape lo chiude e restituisce il focus; gli adesivi espongono `aria-pressed`; la chat chiude con Escape e ripristina Chat. |

## Checklist eseguita

**Metodi:** “Regressione” indica `test/full-audit.spec.js`; “UI” indica `test/menu-profile.spec.js`; “Smoke” indica `test/browser-smoke.mjs`; “Server” indica i test realtime/Afterparty. Le suite esistenti vengono riutilizzate per evitare test duplicati che rispecchino soltanto l'implementazione.

| Caso | Risultato atteso | Risultato osservato | Metodo | Stato |
|---|---|---|---|---|
| Tre percorsi del menu | Ingresso, creazione e ripresa host distinti | Tre controlli funzionanti e stati coerenti | UI + screenshot | PASS |
| Doppia creazione | Una sola stanza | Incremento `/healthz.games` di uno | UI | PASS |
| Codice partecipante inesistente | Errore comprensibile, form recuperabile | Errore nel form, nessun ingresso fantasma | Regressione | PASS |
| Accesso host con solo codice pubblico | Rifiuto | Regia nascosta e errore visibile | Regressione + Server | PASS |
| Accesso host con chiave completa | Riuscita | Form accetta tutti i 64 caratteri | Regressione | PASS |
| Due stanze contemporanee | Stato e messaggi separati | Due gruppi nella prima, uno nella seconda; chat non attraversa le stanze | Regressione | PASS |
| Doppio ingresso da tap/clic | Un solo gruppo | Conteggio e ID stabili | Regressione | PASS |
| Selfie della squadra | Riduzione client e avatar accettato | PNG caricata, JPEG prodotta dal canvas e accettata dal server | Regressione | PASS |
| Doppio buzz | Una sola prenotazione | Un invio UI; replay dello stesso request ID non duplica la coda | Regressione | PASS |
| Buzz del vecchio round | Rifiuto senza effetti sulla coda | ACK negativo, coda nuova vuota | Regressione | PASS |
| Ordine delle prenotazioni | Il server decide il primo | Due ID unici e rispondente uguale al primo ID server | UI + Smoke + Server | PASS |
| Blocca/Apri con coda esistente | Ripresa senza perdere il turno | Stesso primo partecipante torna a rispondere | Regressione | PASS |
| Giusta, Sbagliata, punti e Annulla | Punteggio e turno corretti | Passaggio di coda, assegnazione e ripristino verificati | Smoke + Server | PASS |
| Countdown e duello | Blocco fino al VIA; solo i due idonei | Scadenze server, spettatore escluso e ritorno al gioco normale | Smoke + Server | PASS |
| Timer, pausa, ripresa e reset | Tempo conservato, scadenza chiara | Stati condivisi; nessuna penalità automatica | Smoke + Server | PASS |
| Estrazione e applausometro | Esito condiviso, reazioni separate dai punti | Esclusione degli estratti e conteggi verificati | Smoke + Server | PASS |
| Reazioni e suoni privati | Solo il destinatario riceve l'effetto | Nessun eco sui partecipanti estranei o sulla TV | Smoke + Server | PASS |
| Presenza e spotlight | Conferma privata, evidenza sulla squadra giusta | “Eccomi!” ricevuto dall'host; stessa identità evidenziata nella TV | Smoke | PASS |
| Connessione lenta | Nessuna doppia azione o alterazione dell'ordine | Traffico WebSocket server→client ritardato di 300 ms; ingresso e coda restano corretti | Regressione | PASS |
| Offline del partecipante | Buzz disabilitato e avviso esplicito | Badge Offline visibile; nessuna nuova prenotazione possibile | Regressione | PASS |
| Riconnessione durante pausa | Recupero dello stato attuale e dello stesso ID | ID conservato, pausa corrente recuperata, ripresa corretta | Regressione | PASS |
| TV manuale dopo riconnessione | Aggiornamento al round corrente | Round ID uguale all'host | Regressione | PASS |
| Chat con testo simile a HTML | Testo sicuro | `<b>…</b>` mostrato letteralmente | Regressione | PASS |
| QR e adesivi da tastiera | Enter/Spazio ed Escape funzionanti | Focus ripristinato e stato di selezione accessibile | Regressione | PASS |
| Home, Indietro e refresh | Menu reale e sessione recuperabile | Menu raggiungibile; ritorno e reload conservano il gruppo | Regressione | PASS |
| Finale al refresh | Podio recuperato nella finestra di 12 secondi | Host, partecipante e TV lo ripristinano | Regressione | PASS |
| Nuova partita | Uscita dal risultato e nuova stanza | Menu iniziale e codice successivo diverso | Regressione | PASS |
| Profilo personale | Salva, Annulla e persistenza separati dalla squadra | Bozza annullabile, nome/avatar recuperati al reload | UI + Regressione | PASS |
| Foto non valida e permesso camera negato | Errore visibile e alternativa disponibile | File rifiutati; galleria ancora raggiungibile | UI + Regressione | PASS |
| Fotocamera simulata | Scatta/Rifai/Conferma/Salva e stop dello stream | Tutti i passaggi e chiusura dei track verificati | UI | PASS con simulazione |
| Preferenze | Effetto immediato, persistenza personale | Testo grande, movimento ridotto e mute recuperati; altro browser invariato | UI + Smoke + Regressione | PASS |
| Colore buzzer | Cambia solo sul dispositivo e resta leggibile | Palette persistente; i due valori personalizzati `#000000` e `#ffffff` misurano 21:1 con il testo opposto; reset Lime | UI | PASS |
| Focus e touch | Controlli raggiungibili e focus restituito | Tab fra i campi, Escape dai pannelli, pulsanti utilizzabili | UI + Regressione | PASS |
| Tre desktop | Nessuno scroll superfluo nelle viste principali | 1280×720, 1366×768, 1440×900 misurati e controlli verificati con Playwright | UI | PASS |
| Mobile e reflow | Nessun overflow orizzontale; contenuto raggiungibile | 320/390 px, landscape e viewport CSS equivalente al 200% | UI | PASS con limiti sotto |
| Renderer decorativi | Non intercettano il gioco e hanno fallback | WebGL reale, Glass circoscritto, disattivazione e assenza WebGL verificati | UI | PASS |
| Afterparty preesistente | Modulo isolato e partita completa | Suite di unità/integrazione dedicate, namespace separato | Server | PASS nel gruppo dedicato |

### Scenari e ruoli

| Scenario della checklist | Ruoli effettivamente coinvolti |
|---|---|
| Menu, codice errato e doppio ingresso | Visitatore senza credenziali, poi partecipante |
| Creazione e ripresa con chiave | Host creatore, secondo dispositivo host; visitatore con solo codice pubblico come controllo negativo |
| Due stanze e chat isolata | Due host, due partecipanti nella prima stanza e un partecipante nella seconda |
| Selfie e profilo personale | Partecipante; profilo locale prima dell'ingresso |
| Buzz, duplicati, vecchio round e ordine | Host e due partecipanti distinti |
| Blocca/Apri, Giusta/Sbagliata, punti e Annulla | Host e partecipanti prenotati; TV per la vista pubblica |
| Countdown, duello e spettatore | Host, due partecipanti idonei e partecipante escluso dal duello |
| Timer, pausa e ripresa | Host, partecipante rispondente, altro partecipante e TV |
| Estrazione e applausometro | Host e partecipanti; TV riceve il riepilogo pubblico |
| Reazioni e suoni privati | Host, destinatario, altro partecipante e TV come controlli di non ricezione |
| Presenza e spotlight | Host e destinatario; TV per lo spotlight pubblico |
| Rete lenta e offline | Partecipante con trasporto ritardato/offline, host e secondo partecipante online |
| TV manuale riconnessa | TV senza credenziali host e host che cambia il round mentre la TV è offline |
| QR e adesivi da tastiera | Host per il QR; partecipante per adesivi e chat |
| Home, cronologia e refresh sessione | Partecipante già autenticato |
| Finale e refresh | Host, partecipante e TV, entro la stessa finestra finale |
| Nuova partita | Host che lascia la classifica e crea una nuova stanza |
| Preferenze, colore e focus mobile | Due partecipanti con contesti locali separati; host per verificare l'assenza di cambi alle regole |
| Layout e renderer | Visitatore/menu, partecipante e host; controlli in un contesto separato senza WebGL |
| Afterparty | Host Afterparty e partecipanti nel namespace dedicato; namespace quiz come controllo di isolamento |

## Screenshot rivisti

Sono stati aperti e confrontati i seguenti artifact di `.taste-skill/full-qa/`:

- `menu-desktop.png`, `menu-mobile.png`.
- `participant-desktop.png`, `participant-mobile.png`: pulsante fisico BUZZ e stato leggibile.
- `host-two-players-desktop.png`, `host-two-players-mobile.png`.
- `host-key-mobile.png`: chiave lunga mostrata senza scroll orizzontale.
- `tv-reconnected-desktop.png`.
- `final-host-desktop.png`, `final-participant-desktop.png`.
- `join-mobile-large-reduced.png`.

Gli screenshot aspettano la fine delle animazioni CSS brevi, evitando di confondere un titolo a metà transizione con un contenuto mancante. Le schermate mobili possono scorrere verticalmente quando il contenuto lo richiede; la prova di cliccabilità non viene sostituita dalla sola assenza di overflow.

## Limiti e comportamenti intenzionali

- Le stanze rimangono in memoria e vengono eliminate dopo la finestra finale di **12 secondi**. Il podio già aperto resta visibile nel DOM, ma un ricaricamento successivo all'eliminazione non può recuperarlo: non esiste una classifica persistente o una nuova cache locale dei finali.
- La rete lenta è simulata ritardando pacchetti WebSocket di 300 ms. Offline e riconnessione usano l'emulazione Playwright e la chiusura del trasporto; non sono prove su rete cellulare reale.
- La fotocamera provata automaticamente è uno stream sintetico, e il rifiuto del permesso è simulato. Dispositivi fisici, browser Safari/iOS e selettori di sistema richiedono una verifica manuale.
- La prova al 200% riguarda il reflow equivalente con viewport CSS ridotta, non l'interfaccia Zoom del browser.
- I test audio verificano eventi, mute, volumi e percorsi API. Ascolto dagli altoparlanti, volume percepito in sala e ritardo hardware non sono dichiarati verificati.
- Le misure dei renderer non certificano frame rate, batteria o temperatura di smartphone poco potenti.
