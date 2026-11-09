# Audit realtime e affidabilità — 6 novembre 2026

> Rapporto storico del 06/11/2026. Le correzioni e le verifiche successive sono in [SECURITY-FIXES.md](SECURITY-FIXES.md) e [FUNCTIONAL-CHECKLIST.md](FUNCTIONAL-CHECKLIST.md). `test/audit-realtime.js` ora esegue regressioni di accettazione; non riproduce più deliberatamente i vecchi difetti.

Revisione indipendente in sola lettura del codice applicativo. Nessuna correzione di produzione introdotta. Le riproduzioni vivono in `test/audit-realtime.js`: avviano un server temporaneo sulla porta **3143**, creano stanze effimere e lo chiudono. Il test del payload malformato termina deliberatamente quel processo temporaneo. Non eseguire lo script contro un server usato per giocare.

Eseguito con Node 24.21.0, Socket.IO installato nel repository. Comando `node test/audit-realtime.js`, risultato **exit 0**: le asserzioni confermano i difetti osservati, non certificano la correttezza del prodotto. Il sandbox ha richiesto autorizzazione all'ascolto su localhost.

## RT-01 — P1: «Blocca» e successivo «Apri» perdono la squadra attiva e possono alterare l'ordine

**Passi umani:** avviare una stanza con Alfa, Beta e Gamma; Alfa preme, poi Beta. La regia usa «Blocca» e poi «Apri votazioni». Gamma preme.

**Atteso:** un comportamento coerente e dichiarato sulla coda, senza ignorare prenotazioni accettate.

**Osservato su socket reali:** la coda resta `[Alfa, Beta, Gamma]`, ma `ans` diventa **Gamma**, terza in ordine. Alfa e Beta restano prenotati, non possono ripremere e vengono superati. Se tutti e tre avevano premuto prima del blocco, la successiva apertura resta addirittura `phase: locked`, `ans: null`, con tre prenotazioni conservate. Occorre «Nuova manche» per uscire da quella situazione.

**Causa:** [server.js:301](../server.js#L301) azzera `ans` conservando `order`; [server.js:141](../server.js#L141) esclude tutti gli ID già presenti in coda da `elig`; [server.js:296](../server.js#L296) riapre solo se `elig`; [server.js:454](../server.js#L454) assegna al prossimo nuovo buzz il turno quando `ans` è nullo. L'interazione può verificarsi anche con la scorciatoia Spazio. Sicurezza della diagnosi: 100% sul flusso riprodotto.

## RT-02 — P2: «Annulla» dopo un'espulsione ripristina una squadra inesistente come rispondente

**Passi:** Alfa preme; la regia assegna «Giusta», espelle Alfa e usa «Annulla».

**Osservato:** `phase: answering`, `ans` è l'ID espulso, ma nessun elemento di `players` corrisponde a quell'ID. La regia vede una fase di risposta senza un partecipante valido; la coda può non avanzare normalmente fino a un ulteriore intervento.

**Causa:** [server.js:330](../server.js#L330) ripristina `snap.ans` e `snap.order` senza riconciliarli con le rimozioni intervenute. Gli snapshot non vengono invalidati da `drop`. Prova `RT-02` nello script. Sicurezza: 100%.

## RT-03 — P2: ricaricare durante il podio perde la schermata finale

**Passi:** terminare una partita; nei 12 secondi prima della cancellazione ricaricare host, TV o telefono di un partecipante.

**Osservato su protocollo reale:** il rientro host/TV restituisce `info.final`, ma non viene inviato un nuovo evento `final`. I relativi handler d'ingresso ignorano quel campo. Il rientro del partecipante viene rifiutato con `La partita è terminata`; non recupera il podio. La classifica esiste ancora sul server, ma è visibile soltanto ai dispositivi che avevano ricevuto l'evento originario.

**Fonti:** [server.js:225](../server.js#L225), [server.js:364](../server.js#L364), [server.js:391](../server.js#L391), [public/host.html:157](../public/host.html#L157), [public/tv.html:124](../public/tv.html#L124). Provato il protocollo, verificato staticamente il mancato consumo di `info.final`; il reload grafico non è stato eseguito in questo sottotask. Sicurezza: 99%.

## RT-04 — P2: 16 ingressi o riconnessioni in un minuto dalla stessa rete vengono bloccati

**Passi:** collegare più dispositivi che condividono l'IP visto dal server, oppure fare rientrare un gruppo già collegato dopo interruzioni di rete. La sedicesima richiesta `join` nell'intervallo viene respinta, indipendentemente dalla correttezza delle credenziali.

**Osservato:** esattamente la richiesta numero 16 restituisce `Troppi tentativi, riprova tra un minuto`. Il controllo viene eseguito prima della convalida della sessione, quindi anche le riconnessioni legittime consumano lo stesso budget delle nuove iscrizioni e degli errori. Un gruppo di dispositivi che rientra insieme dopo una caduta della rete può rimanere escluso per parte del minuto.

**Fonti:** [server.js:94](../server.js#L94), [server.js:385](../server.js#L385). `ipOf` usa direttamente `handshake.address`; l'impostazione Express `trust proxy` non viene consultata da questa funzione. Su un deployment che presenta al processo soltanto l'indirizzo del reverse proxy, il limite potrebbe essere condiviso anche da reti diverse: è una deduzione dal codice, **non una verifica del deployment Render**. La soglia per un singolo IP è riprodotta localmente. Sicurezza: 100% per la soglia, configurazione proxy da verificare in hosting.

## RT-05 — P2, condizionale sul carico: gli snapshot possono essere rinviati per tutta una raffica di reazioni

**Scenario:** più partecipanti inviano reazioni valide nell'applausometro. Con 26 partecipanti che reagiscono ciascuno ogni 650 ms, opportunamente sfalsati, il server può ricevere un aggiornamento ogni 25 ms. Ciascun partecipante rispetta il limite individuale.

**Evidenza deterministica:** lo script esegue la funzione `sync()` estratta direttamente dal sorgente con un orologio controllato: 320 aggiornamenti distanti 25 ms durante 8 secondi producono **zero snapshot durante la finestra**, poi uno solo dopo il periodo di quiete. Non è un benchmark con 26 dispositivi; dimostra il comportamento del debounce corrente.

**Impatto:** conteggi dell'applausometro apparentemente fermi fino alla fine e ritardo nella propagazione di eventuali altri cambiamenti avvenuti nella stessa finestra. Gli ACK restano immediati e lo stato server continua a cambiare: il problema riguarda la visibilità sui dispositivi.

**Causa:** [server.js:165](../server.js#L165) annulla e riprogramma il timeout di 30 ms a ogni aggiornamento, senza un'attesa massima; [server.js:509](../server.js#L509) usa lo stesso sync per ogni reazione. Inoltre ogni pubblicazione rispedisce lo stato host e un `me` a ciascun giocatore, ricalcolando il rank con una ricerca per persona ([server.js:173](../server.js#L173)); questo è un costo evitabile, ma non è stato dimostrato un rallentamento CPU nel carico reale. Sicurezza: 100% sul rinvio nel modello temporale; impatto su una serata reale da misurare.

## RT-06 — P1: un payload JSON non autenticato può arrestare tutto il server

**Riproduzione su server temporaneo:** aprire un socket nel namespace principale ed emettere `tv:join` con `{code: {toString: null, valueOf: null}}` e un callback ACK.

**Osservato:** `TypeError: Cannot convert object to primitive value` in `server.js:280`; il processo Node termina con **exit code 1**. Le stanze e i punteggi sono in memoria: l'arresto interrompe tutte le partite del processo. Non è una possibilità teorica: il test riproduce e attende la terminazione del processo figlio. Questo input richiede un client personalizzato; non viene generato dai moduli della UI normale.

**Causa:** [server.js:280](../server.js#L280) converte un campo non validato mediante `String(...)` in un handler asincrono senza contenimento dell'errore. Anche altri ingressi del namespace principale convertono valori arbitrari, ma l'audit non ne ha moltiplicato le riproduzioni perché la causa è la stessa. Gli handler Afterparty, invece, applicano un contenimento degli errori e `clean` rifiuta i valori non stringa. Sicurezza: 100% sul payload riprodotto.

## Controlli passati e limiti

- In Afterparty un partecipante non può far avanzare una fase; il comando host duplicato con round/fase obsoleti viene respinto (socket reali nello stesso script).
- Lettura completa di `plugins/afterparty/index.js` e `engine.js`: ruoli, segretezza dei token e delle risposte, guardie temporali, voti e punteggi, gestione tick. Non è emerso un ulteriore difetto confermato che giustifichi una segnalazione separata in questo sottotask.
- Non aggiunti scenari arbitrari fino a esaurimento delle combinazioni. Il funzionamento ordinario già verificato dalla suite è distinto dai flussi marginali qui riprodotti.
- Gli effetti sonori fisici, le prestazioni reali su telefoni lenti e il comportamento del proxy di produzione non sono stati testati qui.
- Segnalato al coordinatore un ulteriore problema TV da verificare nel browser: il listener di rientro automatico viene registrato solo se un codice esiste già all'avvio (`public/tv.html:149`). L'ingresso manuale su una pagina appena aperta non registra quel listener. Non incluso tra le riproduzioni Socket.IO di questo report perché dipende dal codice client del proiettore.
