# Asset e attribuzioni Buzzer

## Icone aggiunte il 5 novembre 2026

Fonte richiesta: [catalogo italiano Icons8](https://icons8.it/icons/). Famiglia coerente **iOS outline**, PNG trasparenti 100 × 100 pixel, serviti dalla cartella locale `public/assets/icons8/`. Tutti i download sono stati verificati: risposta HTTP 200, firma PNG e dimensioni effettive. Il runtime non dipende da hotlink o dalla connessione a Icons8.

Uso gratuito con attribuzione, non CC0. La [pagina ufficiale della licenza](https://icons8.com/license) richiede un collegamento a Icons8 su ogni pagina web che usa le icone. La [documentazione ufficiale](https://icons8.github.io/icons8-docs/web-app/licensing/) permette i PNG fino a 100 × 100 pixel nell’opzione gratuita. Condizioni consultate il 5 novembre 2026; nessun servizio acquistato, nessun SVG o formato a pagamento scaricato.

L’attribuzione **Icone Icons8** è un link visibile presente su host, giocatore e TV grazie a `experience.js`, e viene ripetuta nel pannello Impostazioni. Mantenerla nelle distribuzioni future. Le icone vengono visualizzate come parti dell’interfaccia e non come un catalogo di file redistribuiti separatamente.

| Chiave riutilizzabile | File locale | Sorgente verificata |
| --- | --- | --- |
| `settings` | `public/assets/icons8/settings.png` | [settings](https://img.icons8.com/ios/100/settings.png) |
| `contrast` | `public/assets/icons8/contrast.png` | [contrast](https://img.icons8.com/ios/100/contrast.png) |
| `text` | `public/assets/icons8/text.png` | [text](https://img.icons8.com/ios/100/text.png) |
| `sun` | `public/assets/icons8/sun.png` | [sun](https://img.icons8.com/ios/100/sun.png) |
| `moon` | `public/assets/icons8/moon.png` | [moon-symbol](https://img.icons8.com/ios/100/moon-symbol.png) |
| `speaker` | `public/assets/icons8/speaker.png` | [speaker](https://img.icons8.com/ios/100/speaker.png) |
| `muted` | `public/assets/icons8/muted.png` | [mute](https://img.icons8.com/ios/100/mute.png) |
| `play` | `public/assets/icons8/play.png` | [play](https://img.icons8.com/ios/100/play.png) |
| `pause` | `public/assets/icons8/pause.png` | [pause](https://img.icons8.com/ios/100/pause.png) |
| `timer` | `public/assets/icons8/timer.png` | [timer](https://img.icons8.com/ios/100/timer.png) |
| `users` | `public/assets/icons8/users.png` | [user-group-man-man](https://img.icons8.com/ios/100/user-group-man-man.png) |
| `trophy` | `public/assets/icons8/trophy.png` | [trophy](https://img.icons8.com/ios/100/trophy.png) |
| `check` | `public/assets/icons8/check.png` | [checked](https://img.icons8.com/ios/100/checked.png) |
| `connection` | `public/assets/icons8/connection.png` | [wi-fi-connected](https://img.icons8.com/ios/100/wi-fi-connected.png) |
| `shuffle` | `public/assets/icons8/shuffle.png` | [shuffle](https://img.icons8.com/ios/100/shuffle.png) |
| `duel` | `public/assets/icons8/duel.png` | [fencing](https://img.icons8.com/ios/100/fencing.png) |
| `spotlight` | `public/assets/icons8/spotlight.png` | [spotlight](https://img.icons8.com/ios/100/spotlight.png) |
| `message` | `public/assets/icons8/message.png` | [speech-bubble](https://img.icons8.com/ios/100/speech-bubble.png) |
| `reaction` | `public/assets/icons8/reaction.png` | [applause](https://img.icons8.com/ios/100/applause.png) |
| `more` | `public/assets/icons8/more.png` | [ellipsis](https://img.icons8.com/ios/100/ellipsis.png) |
| `countdown` | `public/assets/icons8/countdown.png` | [traffic-light](https://img.icons8.com/ios/100/traffic-light.png) |
| `reset` | `public/assets/icons8/reset.png` | [restart](https://img.icons8.com/ios/100/restart.png) |
| `close` | `public/assets/icons8/close.png` | [delete-sign](https://img.icons8.com/ios/100/delete-sign.png) |
| `focus` | `public/assets/icons8/focus.png` | [visible](https://img.icons8.com/ios/100/visible.png) |
| `motion` | `public/assets/icons8/motion.png` | [animation](https://img.icons8.com/ios/100/animation.png) |
| `background` | `public/assets/icons8/background.png` | [landscape](https://img.icons8.com/ios/100/landscape.png) |
| `volume` | `public/assets/icons8/volume.png` | [high-volume](https://img.icons8.com/ios/100/high-volume.png) |

### Sostituzioni

Quattro nomi inizialmente cercati non erano disponibili (HTTP 404). Sono stati sostituiti con asset della stessa famiglia iOS, effettivamente scaricati e verificati: `text-size` → `text`, `swords` → `fencing`, `stage-light` → `spotlight`, `reset` → `restart`. Nessun URL di asset non disponibile viene usato nell’app.

## Audio

Il suono locale di pressione, le conferme di fallback, applauso, fanfara, rullo di tamburi ed effetto comico sono generati con Web Audio dal codice di Buzzer. Non richiedono campioni, licenze o attribuzioni esterne. Il suono personale è un breve tono sinusoidale da 65 ms: indica l’invio, senza anticipare l’ordine deciso dal server. L’host continua a usare gli eventuali file `buzzer`, `giusto`, `sbagliato` già previsti da `/api/sounds`, con sintesi di fallback. I media preesistenti non sono stati sostituiti.

## Immagini preesistenti

Sono mantenuti il buzzer, il favicon Icons8, le illustrazioni della serata e del trofeo e gli adesivi già presenti nel repository. Nessuna nuova fotografia o immagine generata è stata aggiunta in questo intervento. Le attribuzioni e i diritti originali degli asset preesistenti restano di competenza del progetto.
