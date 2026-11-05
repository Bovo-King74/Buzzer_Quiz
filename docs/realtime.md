# Regia realtime di Buzzer

Lo stato del quiz continua a vivere in memoria in `server.js`. `lib/live-game.js` gestisce le modalità e le scadenze senza introdurre dipendenze o un secondo trasporto. Punteggi, classifica, chat, moderazione e namespace Afterparty rimangono separati dalle nuove modalità.

## Stato condiviso e riconnessione

Gli eventi `state` (host e TV) e `me` (singolo partecipante) contengono `live`:

- `roundId`, nuovo a ogni nuova manche o avvio di un countdown/duello; `serverNow` per calcolare l'offset dell'orologio locale.
- `paused`, `countdown: {id, endsAt, remainingMs} | null`.
- `duel: [id, id]`, `duelParticipants: [{id,nick}]`.
- `draw: {id,pid,nick,at} | null`, `drawn: [id]`.
- `timer: {id,pid,status,endsAt,remainingMs,durationMs} | null`, con stato `running`, `paused` o `expired`.
- `applause: {id,endsAt,remainingMs,counts,closed} | null`.
- `spotlight: {id,pid,endsAt} | null`.

`me` contiene anche `queued`, `position` e `presence: {id,expiresAt} | null`. I modi personali aggiuntivi sono `paused`, `countdown`, `spectator`, `queued`. Un partecipante idoneo può ancora prenotare mentre un altro risponde: questo conserva la vera coda del quiz.

Il server effettua una scansione delle scadenze ogni 50 ms, pubblicando solo i cambiamenti effettivi. Ogni buzz verifica prima la scadenza: la grafica non apre il buzzer autonomamente. La pausa conserva i millisecondi residui di countdown, timer e applausometro. Il timer manualmente in pausa rimane tale dopo una pausa di partita. Le scadenze del timer non modificano i punteggi né fanno avanzare la coda.

Socket.IO non conserva pacchetti da riprodurre al ritorno: i client si riassociano alla stanza con le proprie credenziali e ricevono lo snapshot attuale. Reazioni e suoni precedenti non vengono reinviati. Le richieste di presenza ancora valide fanno parte dello snapshot. Un token errato non permette di assumere l'identità altrui; una nuova sessione valida sostituisce il vecchio socket, che perde tutti i permessi. I client TV non ricevono la chiave host.

## Comandi e ACK

Tutti i nuovi comandi prevedono ACK `{ok:true,...}` oppure `{ok:false,error}`. `requestId` è una stringa univoca facoltativa: i client aggiornati devono inviarla. Il server memorizza gli ultimi 100 risultati per sessione ed evento, rendendo idempotenti i tentativi con lo stesso identificativo.

`live:act` è riservato a un socket autenticato come host nella stanza:

| `type` | Parametri | Comportamento |
| --- | --- | --- |
| `countdown:start` / `countdown:cancel` | — | 3–2–1; apertura server dopo 3 secondi, annullamento esplicito |
| `duel:start` / `duel:end` | `ids: [id,id]` per avviare | Due squadre connesse e approvate; cambio modalità apre una nuova manche bloccata |
| `draw` | `excludeDrawn: boolean` | Risultato crittograficamente casuale scelto dal server tra gli idonei connessi |
| `draw:reset` / `draw:clear` | — | Azzera il giro / chiude il risultato |
| `timer:start` | `seconds: 10 \| 20 \| 30` | Richiede una prenotazione attiva |
| `timer:pause` / `timer:resume` / `timer:reset` | — | Conserva il residuo / riprende / rimuove |
| `applause:start` / `applause:stop` / `applause:clear` | — | Finestra di 8 secondi / chiude / rimuove riepilogo |
| `pause` / `resume` | — | Blocca nuovi buzz e conserva tutte le scadenze |
| `spotlight` / `spotlight:clear` | `pid` per avviare | Evidenza di 6 secondi, solo per un destinatario connesso |

Countdown, estrazione e avvio di un duello richiedono la manche bloccata. Un duello può accompagnare un countdown e un timer di risposta; l'applausometro richiede una manche bloccata senza duello. Le azioni classiche che cambiano il gioco sono bloccate durante countdown, applausometro aperto e pausa; moderazione, impostazioni, fine e nuova manche restano disponibili. Nuova manche annulla gli effetti dello stato precedente; termina partita blocca subito nuove prenotazioni. Un partecipante rimosso viene tolto dalla coda; se era attivo, la risposta passa alla successiva squadra connessa. La rimozione di un duellante termina il duello e blocca una nuova manche; la sola disconnessione conserva il posto per la riconnessione.

`buzz` accetta `{roundId,requestId}` e risponde `{ok:true,roundId,position,eventId}`. Un round obsoleto, un socket disconnesso/sostituito, un duplicato, una pausa o uno spettatore vengono rifiutati con testo leggibile. Le chiamate storiche prive di payload continuano a funzionare. La coda registra l'ordine di elaborazione del server e il timestamp; non attende audio o animazioni. Solo la vista host/TV riceve `buzz: {id,roundId}` quando la squadra attiva cambia; `sfx: {id,roundId,name}` usa `giusto` e `sbagliato`.

## Effetti privati

`host:effect` riceve `{pid,kind,value,requestId}` e richiede un destinatario approvato e connesso nella stessa stanza. Non esiste un invio implicito a tutti. L'evento `effect: {id,roundId,pid,kind,value,expiresAt}` è inviato esclusivamente al socket corrente del destinatario:

- `reaction`: 👏 🔥 🎉 😂 💪 ❤️.
- `sound`: `applause`, `fanfare`, `drumroll`, `comic`.
- `message`: `Tocca a te!`, `Grande risposta!`, `Preparati!`, `Ci sei?`.
- `presence`: valore fisso `Ci sei?`, scade dopo 15 secondi.

Gli altri effetti scadono dopo 4 secondi. Il server limita gli invii a uno ogni 700 ms per destinatario, almeno 3 secondi tra suoni e 12 effetti ogni 5 secondi per stanza. I payload di testo sono selezionati da una lista fissa; il rendering deve comunque usare `textContent`. Il destinatario applica preferenze locali di audio, movimento e feedback visivo.

`presence:reply: {id,requestId}` verifica identità e scadenza e invia `presence:confirmed: {id,pid,nick}` solo agli host, non alla TV. Non modifica buzzer, ordine o punteggi.

`applause:react: {id,value,requestId}` richiede una finestra attiva e un partecipante approvato della stanza. Limite di una reazione ogni 650 ms per persona; il riepilogo condiviso è aggiornato con gli stessi snapshot, senza eventi privati o incrementi di punteggio.

## Verifica

`node --test test/realtime.test.js` verifica scadenze deterministiche, compatibilità, pausa e reset. Include inoltre un server Express/Socket.IO reale su porta locale con host, tre partecipanti e TV: buzz concorrenti, punteggi e undo, suoni host identificati senza eco ai partecipanti, effetto privato e deduplicazione, rifiuti di autenticazione, countdown con pausa e apertura effettiva, duello, estrazione, timer, applausometro, presenza dopo riconnessione e destinatario disconnesso. La riproduzione sonora fisica rimane una verifica del browser/dispositivo.
