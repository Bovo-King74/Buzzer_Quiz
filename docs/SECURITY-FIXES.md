# Correzioni server e regressioni — 8 novembre 2026

Le correzioni mantengono Express, Socket.IO e lo stato in memoria. Non aggiungono dipendenze. Chiavi, token, selfie e messaggi non vengono stampati nei log. La creazione del quiz rimane pubblica; il ruolo host viene verificato per ogni comando successivo.

## Difetti riprodotti e risolti

| Problema | Risultato della correzione | Prova |
| --- | --- | --- |
| `String(object)` e `Number(object)` potevano sollevare eccezioni non gestite | Tipi e formati vengono validati prima della conversione; gli handler contengono anche gli errori asincroni e rispondono con un errore comprensibile | Payload `{toString:null,valueOf:null}` su ingressi, chat, ID e valori numerici; processo ancora attivo |
| ID riservati e campi con tipi inattesi | I dizionari delle stanze/giocatori/rate limit non hanno prototipo; gli ID dei partecipanti accettano soltanto otto cifre esadecimali | `__proto__`, array e oggetti rifiutati; avatar di un ID non valido restituisce 404 |
| «Blocca → Apri» poteva lasciare prenotazioni bloccate o far rispondere il terzo | La coda viene conservata e la riapertura riprende il primo partecipante idoneo non ancora valutato | Due e poi tre prenotazioni, blocco/riapertura: Alfa rimane prima anche dopo il buzz di Gamma |
| «Annulla» poteva ripristinare un rispondente espulso | Snapshot riconciliati con i partecipanti esistenti, senza rimettere in coda ID rimossi | Giusta → espelli → annulla non produce un turno con un rispondente inesistente |
| Retry e azioni obsoleti potevano restituire conferme di una vecchia manche | Controllo di `roundId` e del rispondente atteso; ACK conservati solo nel contesto della manche ancora corrente | Comandi, effetti e retry obsoleti rifiutati; un countdown duplicato crea una sola manche |
| Il limite condiviso per IP colpiva anche i rientri validi | Credenziali corrette e ingressi nuovi hanno budget separati; i rientri autenticati non consumano il budget degli errori della rete | 65 ingressi errati e 25 rientri validi dallo stesso IP: tutti i rientri corretti riescono |
| Le raffiche continue rinviavano indefinitamente gli snapshot | Coalescenza con attesa massima di 30 ms dal primo cambiamento; rank e posizione calcolati una volta per pubblicazione | Durante un flusso di cambiamenti ogni 15 ms arrivano snapshot intermedi |
| Il podio non veniva restituito al partecipante che rientrava | Durante i 12 secondi finali il rientro richiede un'identità esistente e valida, e restituisce `final` | Rientro corretto con classifica; nuovo partecipante e token errato rifiutati |
| Approvazione ingressi proteggeva soltanto l'interfaccia della chat | Pending e TV non ricevono storico o nuovi messaggi; l'approvazione invia lo storico autorizzato | Test con host, squadra ammessa, pending e TV, seguito da approvazione e backfill |

`pid:null`, `token:null` e `avatar:null` inviati dal normale form alla prima visita restano compatibili. Il caso è incluso nei test: non viene scambiato per un tentativo di assumere un'identità esistente.

## Gravità, evidenza e file interessati

| Rilievo | Gravità / evidenza | Correzione nel repository |
| --- | --- | --- |
| Arresto del processo da input non convertibile | Alta, riprodotto nell’audit storico su processo temporaneo | `server.js` handler protetti; `lib/security.js` tipi e conversioni |
| Password Afterparty predefinita nel sorgente | Alta se usata nel deployment, configurazione debole confermata; compromissione remota non simulata | `server.js` configurazione; `plugins/afterparty/index.js` guardia senza default utilizzabile |
| Chat accessibile a pending/TV | Media, riprodotta aggirando la UI con eventi reali | `server.js` info/join/chat/approve; `public/player.html` backfill autorizzato |
| Coda persa e undo su partecipante rimosso | Media, riprodotti con eventi e browser | `server.js` act open/undo; `lib/live-game.js` modalità |
| Conferme obsolete e rientri limitati per rete | Media, riprodotti con retry e molte riconnessioni locali | `server.js` cache delle richieste, guardie round/rispondente e budget separati; client host/live-ui |
| Mancanza di controllo Origin e chiavi host brevi | Media, rischio plausibile ridotto; nessun furto di chiave dimostrato | `lib/security.js` originPolicy/secretEqual; `server.js` handshake, CORS e chiavi casuali |
| Avatar con controllo solo del prefisso | Media, input falsi riprodotti; esecuzione XSS sul vecchio endpoint non dichiarata provata | `lib/avatar.js` firme/strutture/dimensioni; `server.js` endpoint raster con MIME/CSP |
| Snapshot rinviati dal traffico continuo | Media per disponibilità del gioco, riprodotto con tempo deterministico e flusso locale | `server.js` sync/_syncNow |
| Finale e riconnessione TV | Media funzionale, riprodotti nel browser | `server.js` join; `public/player.html`, `public/host.html`, `public/tv.html` |

Le riproduzioni e le asserzioni aggiornate sono in `test/security-regressions.test.js`, `test/realtime.test.js` e `test/full-audit.spec.js`. Non ci sono nuove dipendenze npm: audit completo e di produzione senza avvisi; nessun avviso è stato ignorato sostenendo che fosse codice irraggiungibile.

## Origini, autorizzazione e credenziali

Il controllo `allowRequest` viene applicato al handshake Engine.IO, prima di accettare la connessione. Un browser deve usare la stessa origine esatta della richiesta oppure una delle origini configurate in `BUZZER_ALLOWED_ORIGINS`. Si confrontano protocollo, hostname e porta dopo normalizzazione; niente wildcard, sottostringhe, credenziali nell'URL, path o origine `null`. La stessa policy configura i CORS del polling.

Esempio, solo se un frontend o una parete pubblica vengono serviti da un'origine distinta:

```sh
BUZZER_ALLOWED_ORIGINS="https://quiz.example,https://wall.example"
```

I client locali/CLI senza header Origin rimangono consentiti e devono comunque autenticarsi negli eventi. Le richieste browser di altre origini vengono respinte. La suite verifica il vero upgrade WebSocket con intestazioni valide: stessa origine, allowlist e client senza Origin ricevono 101; le origini esterne ricevono il rifiuto `Forbidden`. Engine.IO serializza il rifiuto dell'upgrade come HTTP 400; il polling equivalente restituisce HTTP 403 e codice Engine.IO 4. Il test controlla anche questo contenuto, senza confondere un errore di protocollo con il controllo di origine.

Gli URL dei QR vengono costruiti solo da origini convalidate; un `origin` arbitrario nel payload non può sostituire il sito con un dominio esterno. Il rilevamento IP riusa il getter Express e la configurazione `trust proxy` già presente, anziché leggere soltanto l'indirizzo del socket del proxy. L'app continua ad assumere un solo hop fidato davanti al server: in hosting occorre mantenere coerente questa configurazione con il proxy effettivo. Il deployment non è stato modificato o verificato da questi test locali.

Le nuove chiavi host sono CSPRNG da 32 byte, rappresentate da **64 caratteri esadecimali**. I token personali sono CSPRNG da 24 byte. Il confronto dei segreti usa `timingSafeEqual` dopo i controlli di tipo e lunghezza. La TV non riceve chiavi host; cambiare stanza o ruolo lascia i canali precedenti, e una sessione personale sostituita perde i propri permessi.

Il token di creazione idempotente è un segreto client CSPRNG da 16 byte, rappresentato da **32 caratteri esadecimali**. Se presente, deve rispettare questa forma. Può recuperare la stessa stanza per dieci minuti anche dopo un cambio di rete. Il formato è un requisito di rappresentazione: la casualità viene prodotta dal client, non dedotta dal server dal contenuto della stringa. I client storici che non inviano il token possono continuare a creare stanze.

Queste scelte applicano controllo esplicito dell'origine, autorizzazione per messaggio e protezione dei token descritti da [OWASP WebSocket Security](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html). La validazione distingue tipo, formato e regola del gioco, come indicato da [OWASP Input Validation](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html).

## Avatar raster convalidati

`lib/avatar.js` verifica il contenuto binario, non soltanto il prefisso della data URI:

- Base64 canonico, limite della data URI di 140000 caratteri, massimo 1024 pixel per lato e 1048576 pixel complessivi.
- PNG: firma, IHDR, campi consentiti, CRC dei chunk, presenza di IDAT/IEND, assenza di dati dopo IEND e di animazione. L'inflate usa un limite di output derivato dalle dimensioni, con verifica di righe e filtri, compresi i passaggi interlacciati.
- JPEG: SOI/EOI, limiti dei segmenti, frame supportato e dimensioni, componenti, presenza di uno scan con dati.
- WebP: RIFF/WEBP, lunghezze dei chunk, frame VP8/VP8L, canvas VP8X coerente e dimensioni; animazioni rifiutate.

Gli avatar ammessi vengono conservati come byte raster in memoria e serviti con il MIME verificato, `nosniff`, cache HTTP e CSP restrittiva. Gli SVG caricati dal client sono rifiutati; l'unico SVG ammesso è quello delle iniziali generato dal server con testo escapato. I payload delle partite contengono ancora soltanto l'URL dell'avatar.

La suite usa PNG e JPEG reali già nel progetto e un piccolo fixture WebP, più firme false, tipi MIME discordanti, CRC corrotti, dati troncati, contenuti aggiunti e dimensioni enormi. JPEG e WebP ricevono controlli strutturali e dimensionali, non una ricodifica completa né una scansione antivirus: non viene dichiarata una validazione totale del flusso compresso. La combinazione di allowlist, verifica delle firme e limiti segue [OWASP File Upload](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).

## Contratto client e compatibilità

- `act`, `live:act` e `host:effect` accettano `roundId`; i client aggiornati lo inviano. `act` per `correct` e `wrong` può anche specificare `ans`, il rispondente atteso. Un valore obsoleto non modifica stato o punteggi.
- Gli ACK idempotenti restano validi anche quando il comando stesso crea una nuova manche. Dopo una successiva nuova manche la medesima richiesta viene rifiutata invece di riprodurre un vecchio effetto o confermare un vecchio buzz.
- `join` con credenziali esistenti corrette restituisce `final` durante il podio. La risposta di rientro host/TV continua a includerlo. Dopo la cancellazione della stanza l'identità scade normalmente.
- `chat:history` consegna un array di messaggi soltanto quando una squadra pending viene approvata. Prima dell'approvazione `hist` è vuoto e il socket non riceve messaggi di chat. Il frontend riusa il proprio rendering testuale sicuro.
- Il limite dei nuovi ingressi è 120 per IP/minuto; i tentativi errati e i rientri hanno contatori distinti. Il rientro personale ha un limite separato di 60 operazioni ogni 10 secondi per identità, senza penalizzare gli altri dispositivi della stessa rete.
- I normali comandi host hanno un limite di 60 al secondo per socket; restano i limiti specifici di effetti, suoni e reazioni. La coalescenza non modifica l'ordine di elaborazione dei buzz.

## Afterparty

Il quiz pubblico non richiede `HOST_PASS`. **La creazione di una regia Afterparty richiede invece che `HOST_PASS` sia impostata esplicitamente nell'ambiente.** Il precedente default statico è stato eliminato. Quando manca la configurazione viene prodotto un valore interno casuale e non registrato, e il namespace risponde con il messaggio chiaro che la regia deve configurare `HOST_PASS`; non vengono mostrate o stampate password. La posizione era il fallback `HOST_PASS` di `server.js` (ora sostituito); se un deployment usava quel default, configurare una nuova password esplicita prima di riaprire Afterparty. Il valore precedente non viene riportato.

L'unica modifica al plugin aggiunge questa guardia di configurazione. Restano le sue verifiche già esistenti su token, ruolo, round, fase, contenuti e scadenze. Il controllo comune delle origini protegge anche il suo handshake. Testato il rifiuto di input malformati, il caso non configurato, la creazione con password esplicita e l'isolamento dal namespace principale. La suite Afterparty completa rimane verde.

## Controlli eseguiti

Comandi verificati, su Node 24.21.0 e server temporanei con porte locali effimere:

```sh
npm test
npm run test:afterparty
npm run test:afterparty:integration
```

**23/23 test Node superati**, oltre ai quattro controlli storici, dei quali nove nella nuova suite di regressione. Comprendono upgrade WebSocket e polling reali, ruoli e due stanze, payload malformati senza arresto, form d'ingresso reale con campi null, recupero dei finali, avatar e recupero autorizzato della chat. La suite temporanea non registra segreti e chiude i propri server.

Verifiche sintattiche: `server.js`, `lib/security.js`, `lib/avatar.js`, `lib/live-game.js`, `plugins/afterparty/index.js` e `test/security-regressions.test.js`.

I vecchi report di audit descrivono i difetti prima delle correzioni; il nuovo test verifica il comportamento corretto. Questi controlli non certificano l'infrastruttura TLS/proxy di produzione, la resistenza a carichi distribuiti o la disponibilità delle stanze dopo un riavvio: le partite continuano a essere conservate soltanto in memoria. Le prove grafiche e su fotocamera/browser sono documentate separatamente dal coordinatore.
