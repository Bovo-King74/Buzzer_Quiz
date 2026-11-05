# Afterparty: l’archivio dei bluff

Plugin multiplayer originale per il dopogioco, accessibile a `/afterparty/`.
La regia crea una stanza usando la stessa parola chiave host del quiz (`HOST_PASS`, predefinita `KJB`), poi invita da 2 a 12 squadre tramite QR o link. La regia non partecipa al voto: può mostrare il suo schermo alla compagnia.

## Regole

Ogni partita ha cinque storie pescate senza ripetizioni da un archivio originale di dodici scenari immaginari. Le domande e le risposte non sono fatti reali. In ogni round:

1. Le squadre hanno 60 secondi per scrivere un bluff, massimo 140 caratteri. Una sola consegna.
2. La risposta della busta viene mescolata ai bluff e, se necessario, ad alcune esche del mazzo. Le squadre hanno 30 secondi per votare; niente autovoti.
3. Tutti scoprono risposta, autori, votanti e punti. La regia avvia il round successivo.

Il timer scatta sul server; se tutti consegnano o votano si passa subito alla fase seguente. La regia può chiudere una fase in anticipo con conferma.

- 1.000 punti per trovare la risposta della busta.
- 500 punti per ogni voto di un’altra squadra al proprio bluff.
- Bluff uguali (senza distinzione tra maiuscole e minuscole) vengono uniti. Ogni autore guadagna 500 punti per voto.
- Scrivere esattamente la risposta della busta assegna 1.000 punti alla rivelazione, anche se poi non si vota. Non si può votare quella risposta.
- Nessun punto per i voti alle esche del mazzo. Chi non consegna può comunque votare.
- La regia può rimuovere squadre solo in sala d’attesa. I nomi e i punteggi restano intatti durante la partita.

## Isolamento e attivazione

Il server monta il modulo con una singola chiamata a `require('./plugins/afterparty')`. Il plugin usa il namespace Socket.IO `/afterparty`, un archivio di stanze proprio e risorse esclusivamente sotto `public/afterparty/`. Non accede a stanze, chat, credenziali, punteggi o schermate del quiz principale. Nessuna nuova dipendenza npm, nessuna API a pagamento, nessun materiale di terzi.

È attivo per impostazione predefinita. Per disattivare la parte server senza modificare il quiz:

```sh
AFTERPARTY_ENABLED=false npm start
```

Con il plugin disattivato, la pagina statica rimane raggiungibile, ma non accetta connessioni di gioco. Riattivarlo richiede il riavvio del server.

Il QR viene generato localmente da `qrcode` sul percorso `/afterparty/qr/:code`. Non contiene credenziali della regia.

## Recupero e limiti

Le credenziali sono separate da quelle del quiz e conservate in `sessionStorage`: ricaricando **la stessa scheda** si recuperano ruolo, round, voti e punteggi; una disconnessione di rete causa un rientro automatico. Le bozze non consegnate restano intatte durante gli aggiornamenti degli altri giocatori, ma non dopo il ricaricamento della pagina. Chi preme Esci cancella le credenziali della propria scheda: durante la partita non può rientrare con il solo nome. La regia deve conservare aperta la propria scheda.

Le stanze sono in memoria e scadono dopo 6 ore senza avanzamenti o rivelazioni. Un deploy o riavvio elimina le stanze del plugin, come già accade per quelle del quiz. Usare una sola istanza Render. Massimo 100 stanze, 12 squadre per stanza, limiti ai tentativi di creazione/accesso e alle azioni ripetute.

I token e la risposta della busta non vengono inviati nelle viste di gioco prima della rivelazione. Testi e nomi sono trattati come testo, con escape HTML. Il riepilogo finale è scaricabile come file `.txt`, senza esportare token.

## Verifica

```sh
npm test
npm run test:afterparty
npm run test:afterparty:integration
```

Il test d’integrazione apre un server locale e usa il client già incluso in Socket.IO. Per quel test serve Node 22+ (WebSocket globale); il plugin mantiene i requisiti Node del progetto.

I test coprono risposte sigillate, autorizzazioni, voti doppi, autovoti, punti, bluff uguali, scadenze, cinque round, capienza e isolamento. Il test WebSocket verifica anche rientro, rimozione in sala, comandi superati e assenza di eventi sul namespace principale.

Per provarlo a mano: aprire `/afterparty/` in tre schede indipendenti, creare la stanza dalla prima e collegare due squadre dalle altre. Si possono usare telefoni collegati all’indirizzo pubblico Render.
