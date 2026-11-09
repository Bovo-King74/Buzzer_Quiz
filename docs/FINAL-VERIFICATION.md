# Buzzer — verifica e correzioni dell’8 novembre 2026

## Ambito e ambiente

Lettura di README, CLAUDE.md, manifest/lockfile, configurazioni di build/browser e percorsi applicativi. Nessun AGENTS.md presente nel repository o negli antenati esaminati. Preservate le modifiche preesistenti a `.gitignore`. App avviata in locale; nessun dato di produzione usato. Node 24.21.0, Chrome installato tramite Playwright 1.65.0 e suite CDP esistente. I test aprono processi temporanei e contesti indipendenti per host, due squadre, TV e una seconda stanza.

Express + Socket.IO, frontend HTML/JS/CSS e plugin Afterparty separato. Nessun database o account personale remoto: stanze in memoria, credenziali di ripresa locali e profilo ospite locale separato dalla squadra. La creazione quiz resta pubblica; riprendere la regia richiede la chiave segreta. La TV è volutamente pubblica e in sola lettura. I privilegi vengono controllati sugli handler server, non sulla rotta HTML.

## Copertura e correzioni

La [checklist funzionale](FUNCTIONAL-CHECKLIST.md) distingue esito atteso, osservato e metodo. I [dettagli di sicurezza](SECURITY-FIXES.md) contengono riproduzioni, gravità, cause, correzioni e limiti. I precedenti AUDIT.md/AUDIT-REALTIME.md sono evidenze storiche, non risultati sul codice corretto.

Priorità applicate: input ostili e privilegi/isolamento, correttezza della coda e dei round, riconnessioni/finale, accessibilità, rendering e pulizia. La validazione più stretta ha fatto emergere nei browser il formato legacy `pid:null`/`avatar:null`: conservata la compatibilità degli ingressi reali oltre ai test socket.

Il finale si recupera dopo refresh **entro i 12 secondi** prima dell’eliminazione della stanza. Poi il podio già aperto rimane visibile, ma un refresh non può recuperare una stanza eliminata. Nessuna persistenza permanente introdotta. Rete lenta e offline sono simulati nel browser; non equivalgono a una prova su rete mobile fisica.

## Identità visiva e accessibilità

Menu con tre scelte, icone coerenti e istruzioni brevi; segnale luminoso “Studio live”; pulsante fisico CSS con scritta BUZZ, stato testuale e contorno differente quando bloccato/offline. Il gesto mostra “Premuto”, la prenotazione e l’anello vengono confermati dal server. Migliorati i testi per attesa e disconnessione. Colori personali con contrasto nero/bianco e feedback ridotti secondo preferenze.

La conversione JPEG del selfie di squadra ora applica un fondo chiaro: i PNG trasparenti mantengono il contenuto leggibile. Il badge Offline esplicito evita che rimanga Pronto durante una disconnessione.

QR host e adesivi sono pulsanti da tastiera. Escape e focus di ritorno funzionano nel QR e nella chat; il selfie di squadra è raggiungibile anche da tastiera. La chiave host lunga va a capo senza allargare la regia. Corretto il contrasto del sottotesto sul pulsante lime. Sui piccoli schermi il marchio centrale non forza una seconda riga nella barra superiore.

Desktop verificati: 1280×720, 1366×768, 1440×900, con dimensioni del documento e click di prova sui controlli. Il difetto desktop precedente era `#joinform` alto 833,44 px per contenuti, spazi e padding nel contenitore di ingresso: [misure e causa](MENU-VERIFICATION.md). La correzione presente è stata riverificata; non è stato aggiunto overflow hidden globale. Mobile 390×844, 320×568, landscape e reflow equivalente a 200% consentono lo scorrimento necessario.

Liquid Glass JS e ShaderGradient restano integrazioni locali effettive per superfici/pannelli e sfondo decorativo; fallback statici/opachi, sospensione a scheda nascosta e preferenze accessibili conservati. Nessuna nuova libreria, fotografia o illustrazione esterna: riusate le icone locali Icons8, con attribuzione visibile e [provenienza](ASSETS.md). Lucide e unDraw valutate sulle licenze ufficiali senza introdurre una seconda famiglia. Il video originale locale e le licenze delle librerie sono descritti in [VISUAL-LIBRARIES.md](VISUAL-LIBRARIES.md).

## Efficienza e pulizia

[Misure e inventario](CLEANUP-REVIEW.md): nessun download audio prima del gesto; una sola preparazione condivisa; fallback sintetico disponibile senza attendere i media. Volume/mute non rigenerano lo snapshot WebGL. Clock e comandi non riscrivono il DOM quando il valore non cambia; il server pubblica gli snapshot entro un intervallo limitato anche sotto traffico continuo. Nel menu reale osservate zero mutazioni dei contenuti in 2,2 secondi a riposo, con shader/video attivi: misura locale, non benchmark su hardware debole.

Rimosso l’import di Google Fonts esterno: i WOFF2 locali conservano Bricolage Grotesque e Dela Gothic One con licenze OFL. Chrome ha confermato le famiglie realmente renderizzate, nessuna richiesta ai CDN e caricamento completato in 307 ms nella prova locale (non una garanzia di latenza). I due file richiesti dal testo italiano pesano complessivamente 55.036 byte; tutti gli otto subset archiviati 108.764 byte.

Rimossi `public/assets/live-crowd.jpg` (100.433 byte, nessun riferimento nel grafo applicativo/build), vecchi sfondi CSS già disattivati, selettori per l’immagine buzzer e selezione adesivi superati. Conservati media/API dinamici, easter egg referenziati e dipendenze ancora utilizzate. L’audit storico eseguibile ora avvia regressioni di accettazione anziché asserire deliberatamente i vecchi difetti.

## Comandi e risultati finali

| Comando / metodo | Esito |
| --- | --- |
| `npm test` | 4 controlli storici e 14 test Node (5 realtime + 9 sicurezza), tutti superati. Le regressioni di sicurezza sono incluse nel comando standard. |
| `npm run test:security` | 9/9, comprese origini reali, input ostili, isolamento e chat non esposta a pending/TV. |
| `npm run test:afterparty` | 8/8. |
| `npm run test:afterparty:integration` | 1/1, namespace reale e giro completo. |
| `npm run build:visuals` | Superato. |
| `npm run test:ui` | 7/7 attivi; 1 scenario storico di baseline saltato intenzionalmente. |
| `PW_FULL_AUDIT=1 PW_PORT=3152 npx playwright test --project=chromium` | 3/3 nuove suite, 16 checkpoint positivi. |
| `npm run test:browser` | 13/13 scenari CDP su Chrome, eseguiti anche dopo i font locali. |
| Audit npm produzione e completo | Zero avvisi di vulnerabilità. |
| Sintassi JS e script inline host/player/TV; `git diff --check` | Superati. |

Non esistono script lint/typecheck nel manifest; non vengono presentati come eseguiti. Il progetto non usa TypeScript. I server temporanei sono stati arrestati. Il runner CDP ora attende il nuovo round ID anziché considerare sufficiente uno stato locked precedente; i test Playwright concorrenti hanno directory di output separate.

Screenshot finali locali: `.taste-skill/full-qa/menu-{desktop,mobile}.png`, `participant-{desktop,mobile}.png`, `host-two-players-{desktop,mobile}.png`. Misure dettagliate dei tre desktop in `.taste-skill/playwright/after/layout.json`. Questi artifact locali sono ignorati da Git; il codice delle verifiche e i rapporti sono nel repository.

## Limiti delle prove

Nessuna certificazione generale di sicurezza o conformità WCAG. Non verificati hardware audio/fotocamera reali, Safari/WebKit non installato, browser Firefox, screen reader, proxy del deployment o resistenza sotto carico con molti telefoni. Fotocamera negata e stream simulato verificati; conferma su iOS/Android resta manuale. Testare una sola opzione in un contesto non prova ogni combinazione possibile. L’audit dipendenze non copre vulnerabilità sconosciute; la scansione segreti non certifica la storia Git.

Riferimenti primari: [OWASP WSTG](https://owasp.org/www-project-web-security-testing-guide/), [OWASP WebSocket Security](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html), [Lucide ISC](https://lucide.dev/license), [unDraw license](https://undraw.co/license). Usata la skill frontend disponibile per ispezione reale e ciclo screenshot/correzione.
