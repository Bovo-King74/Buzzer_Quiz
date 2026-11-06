# Audit umano di preferenze e feedback — 6 novembre 2026

Audit esplorativo su Chrome headless locale, Node 24, stanza dedicata su porta 3142: host e due partecipanti in contesti con storage isolato. Nessuna correzione al codice di produzione. Comandi attivati con mouse e tastiera reali via CDP; lo stato applicato e il valore salvato sono stati confrontati dopo ogni cambio.

Esecuzione: `node test/audit-preferences.mjs` (Node 22+ e Chrome). Il server avviato dal test viene fermato al termine. Rapporto grezzo e screenshot: `.taste-skill/audit-preferences/`.

**Esito: 101 controlli superati su 103; quattro difetti misurati automaticamente e un ulteriore problema visivo osservato negli screenshot.** I controlli falliti sono la riduzione delle trasparenze del backdrop e la soppressione delle animazioni in concentrazione. I menu troncati e il lavoro DOM inattivo sono misurazioni esplorative, separate dalle asserzioni funzionali.

## Difetti riproducibili

### P2 · Le scelte dei menu si troncano, proprio nella modalità testo grande

Aprire Impostazioni su 320×568 o 390×844, scegliere Dimensione testo → Grande. A 320 px “Completi” diventa “Comple…” e “Segui il sistema” non entra; a 390 px rimane “Segui il sist…”. Non c'è overflow della pagina: è il testo **dentro** il select a perdere informazione.

Il valore Movimento richiede circa 124,4 px; il campo ne lascia 80 a 320 px e 113 a 390 px, dopo i padding. La larghezza fissa/max 48% non cresce insieme al testo. Il problema è presente in entrambi i temi. Riferimenti: `public/experience.css:47`, `public/experience.css:83` e regola mobile `public/experience.css:94`.

Evidenza: [320 px](../.taste-skill/audit-preferences/settings-320x568-light-large.jpg), [390 px](../.taste-skill/audit-preferences/settings-390x844-light-large.jpg). Possibile soluzione: impilare etichetta e campo sulle larghezze strette oppure usare opzioni più brevi e dimensioni coerenti con la modalità Grande.

### P2 · “Riduci trasparenze” lascia il backdrop semitrasparente

Attivare Riduci trasparenze nel pannello. Il gioco continua a vedersi attraverso il velo: `getComputedStyle(dialog, '::backdrop').backgroundColor` rimane `rgba(0, 0, 0, 0.533)` mentre il fondo opaco del tema è `rgb(16, 18, 16)`. L'eliminazione delle ombre invece funziona.

La regola `html[data-ux-transparency=reduce] :is(.ux-settings::backdrop,#big)` non applica il ramo del pseudo-elemento in Chrome. Riferimento: `public/experience.css:78`. Il selettore del backdrop deve essere una regola valida separata; anche i dialoghi delle modalità/azioni dovrebbero rispettare la stessa preferenza personale.

Evidenza: [trasparenze ridotte ancora attive](../.taste-skill/audit-preferences/reduced-transparency.jpg).

### P2 · “Modalità concentrazione” nasconde gli sfondi ma continua ad animare le reazioni

Attivare Modalità concentrazione e inviare una reazione privata dal menu della squadra. Lo sfondo ambientale scompare correttamente, ma il toast esegue ancora `ux-toast-in`, spostandosi di 8 px. Concentrazione non equivale alla preferenza Movimento: la seconda sopprime questa animazione, la prima no.

Misura effettuata durante la reazione: animazione `ux-toast-in`, `playState='running'`, `currentTime≈100 ms`. Riferimenti: `public/experience.css:59`, `public/experience.css:75`. Il feedback testuale può rimanere, con ingresso statico quando concentrazione è attiva.

Evidenza: [reazione in concentrazione](../.taste-skill/audit-preferences/reaction-focus-mode.jpg); dettaglio temporale in `result.json → measurements.focusAnimations`.

### P2 · I toast coprono lo stato della modalità

Durante una reazione il pulsante Buzzer resta libero, ma il toast fisso a `top:88px` si sovrappone alla barra “Gioco normale”. L'effetto si ripete anche con Movimento ridotto: la preferenza elimina l'animazione, non la sovrapposizione. Il testo necessario per capire la modalità attiva viene quindi nascosto da un feedback temporaneo.

È un riscontro visivo, non uno dei due assert falliti. Riferimenti: `.ux-toasts` in `public/experience.css:58`; `#live-strip` e `buildStrip()` in `public/live-ui.js:139`. Posizionare i toast in una zona riservata oppure dimensionarli rispetto alla barra corrente anziché all'altezza fissa del vecchio header.

Evidenza: [reazione che copre la barra](../.taste-skill/audit-preferences/reaction-focus-mode.jpg), [stessa sovrapposizione con movimento ridotto](../.taste-skill/audit-preferences/reduced-motion-reaction.jpg).

### P3 · Il timer di rendering lavora anche senza scadenze

Con round aperto, senza countdown/timer e con sfondi spenti, un `MutationObserver` su `#live-strip` registra **22 modifiche di attributi in 2,2 secondi**: 11 assegnazioni a `live-clock:hidden` e 11 a `live-timer:hidden`, senza alcun cambio di testo o stato.

`paintClock()` gira ogni 200 ms per tutte le viste e riassegna gli attributi anche se il valore resta uguale. Riferimenti: `public/live-ui.js:168`, `public/live-ui.js:268`. Avviare il tick quando esiste una scadenza o almeno evitare gli aggiornamenti identici ridurrebbe il lavoro inattivo. Non è una prova di consumo batteria o prestazioni su telefono: è una misura concreta di lavoro DOM evitabile.

## Matrice delle opzioni provate

| Controllo | Valori esercitati con interazione nativa | Risultato |
|---|---|---|
| Tema | Sistema, chiaro, scuro | Applicazione e salvataggio corretti; Sistema segue entrambe le preferenze colore emulabili. Chiaro esplicito resta chiaro quando il sistema cambia. |
| Contrasto elevato | Spento, acceso | Valore personale applicato e salvato; nessuna certificazione WCAG complessiva del prodotto dedotta da questo controllo. |
| Dimensione testo | Normale, grande | Applicazione e salvataggio corretti; campi con testo troncato come descritto sopra. |
| Sfondi animati | Spenti, leggeri, completi | Valori applicati e salvati; lo sfondo viene nascosto in concentrazione. |
| Riduci trasparenze | Spento, acceso | Salvataggio e rimozione ombre corretti; backdrop non rispetta la scelta. |
| Movimento | Segui sistema, riduci sempre | Sistema ridotto e assenza di riduzione emulati; le reazioni diventano statiche con riduzione attiva. |
| Concentrazione | Spenta, accesa | Decorazione ambientale nascosta, effetti necessari presenti; animazione dei toast rimane attiva. |
| Feedback visivi | Spenti, accesi | Il testo accompagna i suoni con opzione accesa; può essere soppresso senza modificare la consegna degli eventi. |
| Suoni attivi | Spenti, accesi | Prova audio a mute spiega il motivo; audio sbloccato e API pronta dopo gesto. |
| Volume buzz | 0, 65, 100 | Cambi tramite tasti del range, valore applicato e salvato per ogni livello. |
| Volume effetti | 0, 45, 100 | Cambi tramite tasti del range, valore applicato e salvato per ogni livello. |
| Suoni regia | Spenti, accesi | L'evento privato arriva ma `play()` restituisce `false` a opzione spenta; il testo alternativo rimane con feedback visivi attivi. |

Sono stati provati anche: focus iniziale su Chiudi, Tab e Shift+Tab confinati nel dialogo, Escape e ritorno al pulsante, ripristino completo dopo ricaricamento, preferenze invariate sull'altro partecipante.

## Reazioni, suoni e piccoli schermi

- Inviate tutte le sei reazioni: 👏 🔥 🎉 😂 💪 ❤️. Arrivano solo al destinatario, massimo due toast contemporanei. Non coprono il Buzzer nelle viste misurate; coprono però la barra modalità come indicato sopra.
- Provati tutti i quattro suoni privati: applauso, fanfara, rullo di tamburi, effetto comico. Gli eventi chiamano l'API audio con `received:true` e ritorno positivo quando abilitata. I tentativi rispettano il limite di tre secondi per i suoni dello stesso destinatario.
- Reazione inviata anche con Enter dalla tastiera host. “Ci sei?” ricevuto sul telefono e risposta “Eccomi!” attivata con Enter: funzionano senza prenotare.
- Layout esaminati: 320×568, 390×844 e 844×390, testo Grande in chiaro e scuro. Nessun overflow orizzontale di pagina/dialogo. La richiesta di presenza rimane sopra il gioco senza coprire il pulsante.
- Nessuna eccezione JavaScript nei tre contesti durante l'esecuzione completa.

## Limiti

Tutte le opzioni sono state esercitate singolarmente e in alcune combinazioni significative; non è un'esplorazione di ogni combinazione possibile. Non sono stati provati Safari/iOS fisici, smartphone lenti, sospensione del telefono o ascolto dagli altoparlanti. I riscontri audio riguardano sblocco e percorsi dell'API, non qualità percepita, volume acustico o udibilità in sala. La conformità completa a contrasto e screen reader richiede un audit dedicato. Nessuna correzione è stata implementata durante questa fase.
