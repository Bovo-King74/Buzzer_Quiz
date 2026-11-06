# Audit di Buzzer dal punto di vista dell’uso — 6 novembre 2026

Revisione della versione `95e7c17`, eseguita in Chrome headless locale con contesti indipendenti per host, partecipanti e TV. Click, tastiera, form, caricamento file e schermate osservate; le prove Socket.IO isolate completano i percorsi che non possono essere generati dalla normale UI. Nessuna correzione al codice applicativo, nessun commit o push durante questo audit.

Questo rapporto descrive ciò che è stato riprodotto. Non è possibile certificare l’assenza di altri difetti né provare tutte le combinazioni di rete, browser e preferenze. La matrice copre le singole opzioni censite; le combinazioni sono mirate ai punti di rischio. Le prove automatiche che confermano un bug non sono test di correttezza superati dal prodotto.

## Problemi da correggere prima di una serata

| Priorità | Difetto e impatto per una persona | Riproduzione / riferimento |
| --- | --- | --- |
| P1 | **Arresto dell’intero server da input realtime non valido.** Si interrompono tutte le stanze del processo e lo stato in memoria viene perso. | Riprodotto esclusivamente su processo temporaneo, con client personalizzato, non dalla UI normale. [RT-06](AUDIT-REALTIME.md#rt-06--p1-un-payload-json-non-autenticato-può-arrestare-tutto-il-server). |
| P1 | **Blocca → Apri rompe la coda.** Chi ha già prenotato può restare bloccato; un terzo può superare i primi due. | Due prenotazioni → Blocca → Apri: `locked`, `ans:null`, coda conservata. Con un terzo idoneo: diventa rispondente pur essendo terzo. `server.js:141,296,301,454`. |
| P1 | **Impostazioni copre “Invia” nelle chat host e partecipante.** Una persona preme Invia e apre le impostazioni; il messaggio rimane nel campo. | Riprodotto con click al centro del pulsante, desktop host e telefono partecipante. Invio da tastiera permette di mandare il messaggio. Posizione fissa/z-index in `public/experience.css:34`; i composer occupano lo stesso angolo. |
| P2 | **TV congelata dopo rientro dalla rete se il codice è stato digitato manualmente.** Nessuna nuova classifica dopo riconnessione. | Aprire `/tv.html` senza credenziali, compilare codice, disconnettere/riconnettere il socket, assegnare +1. Host totale 1, TV totale 0. Il listener `connect` è registrato solo con codice iniziale: `public/tv.html:149`. |
| P2 | **Annulla può ripristinare un rispondente espulso.** Fase answering con destinatario inesistente. | Buzz → Giusta → espelli → Annulla. Riproduzione socket in [RT-02](AUDIT-REALTIME.md#rt-02--p2-annulla-dopo-unespulsione-ripristina-una-squadra-inesistente-come-rispondente); `server.js:330`. |
| P2 | **Ricaricare il podio lo fa perdere.** Sul telefono compare “La partita è terminata”; host e TV ignorano il finale ancora disponibile. | Reload durante i 12 secondi del podio. Riprodotto nel browser sul partecipante e nel protocollo host/TV; `server.js:225,391`, `public/host.html:157`, `public/tv.html:124`. |
| P2 | **“Nuova partita” non avvia subito una nuova partita.** Riapre la vecchia stanza terminata con schermata bloccata. | Click sul pulsante del podio prima della cancellazione della stanza: `setup:false`, `app:true`, `podium:false`, credenziali vecchie conservate. `public/host.html:124`. |
| P2 | **Sedicesimo ingresso/rientro per IP respinto entro un minuto.** Una compagnia sulla stessa rete può non riuscire a entrare o tornare insieme. | Soglia riprodotta localmente, include sessioni legittime. Effetto del proxy in hosting non verificato. [RT-04](AUDIT-REALTIME.md#rt-04--p2-16-ingressi-o-riconnessioni-in-un-minuto-dalla-stessa-rete-vengono-bloccati). |

## Grafica, accessibilità e comprensibilità

| Priorità | Difetto verificato | Impatto e intervento consigliato |
| --- | --- | --- |
| P2 | “Riduci trasparenze” lascia il backdrop semitrasparente. | Il pannello non mantiene la promessa dell’opzione. Chrome scarta il selettore con `::backdrop` dentro `:is()` in `public/experience.css:78`; dichiarare la regola del pseudo-elemento separatamente. |
| P2 | “Concentrazione” continua ad animare le reazioni ricevute. | Persistono 8 px di movimento `ux-toast-in`; sopprimere l’animazione anche sui toast, conservando testo e conferma. La preferenza Movimento ridotto funziona invece nelle prove. |
| P2 | I select delle impostazioni troncano i valori con testo Grande a 320/390 px. | “Segui il sistema” e altri valori non si leggono per intero. Layout a due colonne, max-width48% e padding limitano lo spazio. Impilare etichetta e controllo nelle configurazioni strette. |
| P2 | I toast ricevuti coprono la striscia della modalità. | Il buzzer rimane libero, ma “Gioco normale” e l’eventuale modalità sono sotto il toast posizionato a top88px. Ancorare i messaggi a uno spazio riservato al feedback. Screenshot nell’audit preferenze. |
| P2 | La chat del partecipante non gestisce focus ed Escape. | Il focus resta su `chb`, Escape non chiude, il contenitore ha role dialog ma nessuna gestione modale. Riprodotto da tastiera. `public/player.html:49,225,226`. |
| P3 | Il QR ingrandibile è un’immagine senza accesso da tastiera. | `tabIndex:-1`, nessun ruolo pulsante; funziona col mouse ed Escape. Usare un vero pulsante con nome accessibile. `public/host.html:51,75,279`. |
| P3, ispezione statica | Gli adesivi chat sono immagini cliccabili con alt vuoto. | Selezione e significato non sono accessibili da tastiera/screen reader come comandi. La selezione con mouse è verificata; una prova con screen reader reale resta da svolgere. `public/player.html:217,227`, `public/host.html:164`. |

Sul telefono i controlli della stanza richiedono molto scorrimento: nel percorso a390px il documento host misura2301px e raggiungere “Ingressi aperti” porta scrollY a1457px. È una frizione misurata, non un malfunzionamento: una sezione “Stanza” raggiungibile direttamente ridurrebbe i passaggi. Alcuni comandi secondari sono disponibili anche in stati in cui il server deve rifiutarli; spiegazioni e disabilitazione preventiva renderebbero il menu meno basato su tentativi.

## Efficienza

1. **Pubblicazione dello stato senza un’attesa massima — P2 condizionale.** Il debounce30ms viene rinviato da ogni evento. Il modello temporale che esegue la funzione originale dimostra zero snapshot durante8s di eventi ogni25ms. Questo flusso è compatibile con26 persone sfalsate al limite individuale; non è un benchmark con26 telefoni. Preferire un throttle con pubblicazione periodica massima. Dettagli [RT-05](AUDIT-REALTIME.md#rt-05--p2-condizionale-sul-carico-gli-snapshot-possono-essere-rinviati-per-tutta-una-raffica-di-reazioni).
2. **Ricostruzione di controlli non cambiati.** Cinque reazioni nell’applausometro producono83 record MutationObserver in `#cmd`, benché i comandi e la fase non cambino. Il conteggio comprende l’avvio: non va interpretato come83 frame persi. Ogni reazione osservata invia al partecipante uno snapshot di513caratteri nel caso di due squadre. Aggiornare solo i dati cambiati e preservare i nodi dei comandi; `public/host.html:235`, `public/live-ui.js:118,242`.
3. **Polling DOM anche quando non serve.** Audit preferenze:22 mutazioni di attributi in2.2s senza timer; `paintClock` riscrive gli attributi hidden11volte per elemento. Il timer gira ogni200ms anche a riposo. Evitare scritture identiche e avviare il clock solo per una scadenza attiva. Non è stato dimostrato un rallentamento percepibile su telefoni reali.
4. **Caricamento anticipato degli adesivi — ispezione statica.** Tutte le immagini vengono inserite con src al caricamento, anche quando la chat è nascosta. La cartella occupa circa1.2MiB su disco. Caricare la striscia alla prima apertura e usare miniature; il valore su disco non è una misura del traffico reale del browser.
5. **CSS sovrapposto e font esterni — debito tecnico.** `style.css`, `refresh.css`, `experience.css` e `live-ui.css` si sovrascrivono; restano vecchie animazioni disattivate e il font via importGoogle. Consolidare dopo i difetti funzionali. La dipendenza font è verificata nel sorgente; non è stato misurato un problema di disponibilità del provider.

## Matrice delle prove

| Area | Opzioni percorse | Esito / limiti |
| --- | --- | --- |
| Accesso | Password errata/corretta, codice, seconda regia, chiave mostra/nascondi, ingressi aperti/chiusi | Percorsi completati da form reali. |
| Partecipanti | Approva, rifiuta, entra senza foto, upload e preview foto, espelli, ban, riammetti | Completati. Upload di PNG locale via file input; fotocamera hardware non provata. |
| Gioco | Avvia, Apri, Blocca, buzz/coda, Giusta/Sbagliata, punti10, ±1, Annulla, Nuova manche, reset, termine | Percorsi ordinari funzionanti; anomalie nei passaggi Blocca/Annulla/finale. |
| Regole | Auto-riapertura attiva/disattiva, chat attiva/disattiva | Provate con gli effetti sullo stato dei telefoni. |
| Chat e QR | Messaggio host/partecipante, adesivo, apertura/chiusura chat, QR grande/Escape | Funzioni presenti; problemi di sovrapposizione e tastiera descritti sopra. |
| Modalità | Countdown avvio/annulla/pausa/riprendi; duello avvio/uscita/spettatore; estrazione con/senza esclusione, reset/chiudi; timer10/20/30 con pausa/riprendi/reset; applausometro apri/reagisci/stop/chiudi; spotlight e presenza | Varianti percorse nel nuovo audit e nelle riproduzioni browser documentate in VERIFICATION.md. Le scadenze esatte sono coperte anche dalle prove deterministiche realtime. |
| Azioni private | Tutte6reazioni, tutti4suoni, tutti3messaggi rapidi, presenza/Eccomi, spotlight | Consegna privata, API audio e tastiera verificate; suono acustico non ascoltato. |
| Preferenze | Tutti12controlli, enum completi, toggleoff/on, volumi0/default/100, salvataggio, sistema chiaro/scuro/movimento |101/103 controlli nell’audit dedicato. I difetti visuali rilevati tramite misure e screenshot sono aggiuntivi alle due asserzioni fallite. |
| TV e rete | Ingresso da URL e da codice manuale, snapshot, riconnessione | Rientro con codice iniziale funziona nelle prove precedenti; rientro dopo ingresso manuale riprodotto come difettoso. |
| Afterparty | Creazione, regole visibili, invito/copia, due squadre, rimozione/rientro lobby, cinque round con bluff/voto/rivelazione, riepilogo, click download, uscita | Partita intera completata nel browser. Click export verificato; file scaricato non confrontato nel contenuto. Non testate tutte le storie né tutti i pareggi. |

## Ripetibilità, prove e limiti

- `test/audit-journeys.mjs`: percorsi browser descritti, artefatti con `BROWSER_TEST_PORT=3141 BROWSER_TEST_OUT=.taste-skill/audit-journeys node test/audit-journeys.mjs`.
- `test/audit-preferences.mjs` e [rapporto preferenze](AUDIT-PREFERENCES.md): matrice e misure dedicate.
- `test/audit-realtime.js` e [rapporto realtime](AUDIT-REALTIME.md): processi temporanei isolati, incluso test deliberato del crash. Non eseguire contro una partita reale.
- Screenshot e JSON locali in `.taste-skill/audit-journeys/` e `.taste-skill/audit-preferences/`, esclusi da Git come gli altri artefatti.
- Nessun test acustico, Safari/iOS hardware, tastiera virtuale reale, vera interruzione Wi-Fi/sospensione del telefono, rete di produzione o benchmark batteria/FPS su telefoni lenti. Le disconnessioni sono controllate nel browser/socket.
- Nessuna nuova prova di contrasto esaustiva su tutte le combinazioni colore; nessun audit completo con lettore di schermo. I tre layout320/390/landscape delle preferenze sono testati; il rapporto precedente documenta anche1440/768/390.
- Verificati anche apertura del pannello nascosto con sette tocchi, chiusura/pausa del video, espansione delle regole Afterparty e destinazione del trigger speciale chat (intercettando window.open senza visitare YouTube). La riproduzione esterna su YouTube non è stata provata. Prove aggiuntive in `.taste-skill/audit-extras/reproduce.mjs`.

Sicurezza: alta (95–100%) per i difetti riprodotti; valutazioni di comodità e opportunità di ottimizzazione sono giudizi progettuali o deduzioni dal sorgente, indicati separatamente. Direzione visiva mantenuta: True-black flat, seed1240856172. L’audit è una review, quindi non introduce una nuova direzione o una ridisegnazione.
