# Verifica di Afterparty

## Prove funzionali

- Suite originale del quiz: 4/4 passate.
- Motore Afterparty: 8/8 passate.
- Integrazione con veri WebSocket: 1/1 passata, con credenziali, namespace separati, autovoti vietati, riconnessione, rimozione e comandi di regia superati.
- Browser Chrome, tre finestre indipendenti: una regia desktop, una squadra a 390 px e una a 768 px. Completati cinque round fino alla classifica finale.
- QR caricato; invito con codice precompilato verificato su telefono.
- Ricaricamento della regia durante la scrittura e della squadra durante il voto; sessione recuperata. Una bozza non viene cancellata dagli aggiornamenti della compagnia.
- Nomi contenenti `<` vengono mostrati come testo.
- Nessuna eccedenza orizzontale sulle finestre della partita; pagina originale del quiz e `/healthz` restano disponibili. Le partite Afterparty non incrementano il contatore `games` del quiz.

Non sono prove con persone reali. Non sono stati simulati carichi di centinaia di connessioni o guasti dell’infrastruttura Render. Una scheda chiusa o un riavvio del server non recuperano i dati in memoria.

## Revisione visiva

Direzione: True-black flat, seed 405808107, mantenendo la tipografia Bricolage e il contrasto scuro del progetto. Nessun ridisegno della direzione.
Idea: la risposta sigillata di un archivio immaginario diventa il centro del gioco; la rivelazione mostra autori e amici ingannati.
Interazione principale: consegna segreta, voto anonimo, apertura della busta.
Nessun contenuto o immagine esterna da attribuire; mazzo scritto per il plugin. Tutte le storie sono dichiaratamente inventate.

ROUND 2
Seen in one second: un dopogioco di bluff, con accesso per squadra e regia separati.
Idea (one sentence): le storie dell’archivio sono il pretesto per rendere credibili le bugie degli amici.
Live thing: consegna, votazione e rivelazione in tempo reale.
Layout words by section: ingresso=due colonne / invito=modulo compatto / partita=domanda e compagnia / rivelazione=risposte con autori / finale=classifica.
Scores: design 6.5 · usability 8 · creativity 7 · content 8 → overall 7.2
Caps applied: nessuna fotografia, componente visiva affidata a tipografia e gioco; valutazione prudente del design a 6.5.
Top three problems (most visible first), each with the screenshot it shows in and the fix:
1. Nell’ingresso generico mobile il modulo è sotto l’esempio: aggiunto accesso rapido visibile; un invito da QR mostra direttamente il modulo.
2. La domanda era un titolo lungo durante il voto mobile: separata dal titolo breve dell’archivio e resa come paragrafo leggibile.
3. Nel tablet l’esempio aveva un titolo su tre righe: usato il nome breve della storia e separata la domanda nel testo.

L’ispettore finale dell’ingresso ha rilevato 0 FAIL a 1440, 768 e 390 px. Resta un WARN sulla dimensione del titolo iniziale: intenzionale per la schermata introduttiva; i titoli della partita sono più piccoli. Sono state esaminate le immagini dell’ingresso completo e delle fasi di gioco. Le scelte sono orientate all’uso durante una serata, non a una pagina promozionale fotografica.
