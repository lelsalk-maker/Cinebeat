# CineBeat

Reisefilme im Kino-Look, geschnitten nach dem Aufbau deines Songs: für Instagram Stories und Reels (9:16), Beiträge (4:5), Film (16:9) und Kino (2.39:1). Für jeden Ort entsteht ein eigener Film. Der Gesamtfilm fasst die besten Momente aller Orte in Kapiteln zusammen.

## Sicherheit und Datenschutz

- **Keine Verbindung ins Netz.** Eine Content-Security-Policy verbietet dem Browser jede Anfrage nach außen: kein Upload, keine fremden Schriften oder Skripte, kein Tracking. Die Web-App lädt nur ihre eigenen Dateien.
- **Übergangsspeicher statt Datenreste.** Angefangene Projekte bleiben erhalten: Die gewählten Aufnahmen und Songs liegen als Zwischenspeicher nur auf diesem Gerät (IndexedDB) und werden 30 Tage nach der letzten Bearbeitung automatisch gelöscht. Pro Ort: Menü (⋯) → „Fertig: Aufnahmen aus dem Zwischenspeicher löschen“. In der Reiseansicht: „Zwischenspeicher leeren“ oder „Alles löschen“.
- **Weiterarbeiten nach einem Neustart.** Verwirft iOS die App im Hintergrund, öffnet sie beim nächsten Start wieder den Ort, den Tab und die Stelle, an der du warst. Gemerkt wird dafür nur die Position, nichts von den Aufnahmen.
- **Die Originale bleiben unberührt.** Die App sieht nur, was du in der Galerie-Auswahl markierst.
- **Mikrofon nur auf Knopfdruck** („Mithören“). Die Aufnahme dient nur Analyse und Vorschau, liegt höchstens im Zwischenspeicher und wird nie exportiert; das Mikrofon wird danach sofort freigegeben.

## Starten

| Gerät | So geht es |
| --- | --- |
| iPhone / iPad | Web-App über ihre Adresse (z. B. GitHub Pages) in Safari öffnen → Teilen → **Zum Home-Bildschirm**. iOS führt heruntergeladene HTML-Dateien nicht aus. |
| Computer | `docs/CineBeat.html` doppelklicken (Chrome, Edge oder Safari). |
| Android | Web-App im Browser öffnen oder `docs/CineBeat.html` mit Chrome. |

**Web-App veröffentlichen (GitHub Pages):** *Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch `main`, Ordner `/docs` → Save*. Nach ein bis zwei Minuten läuft die App unter `https://lelsalk-maker.github.io/Cinebeat/`. Hinweis: Für private Repositories bietet GitHub Pages nur mit einem kostenpflichtigen Plan (z. B. GitHub Pro). Mit kostenlosem Konto das Repository öffentlich stellen; es enthält nur den Programmcode, niemals Fotos oder Videos.

## Bedienung

1. **Fotos der Reise wählen**: einfach alle auf einmal. Die App liest Standort und Aufnahmezeit, erkennt die Orte (offline, eingebaute Ortsliste) und legt für jeden Ort einen Film an. Ohne Standort trennt sie nach Tagen.
2. Ort antippen und **zuerst den Song festlegen**: Song-Datei, Mithören oder der Beispiel-Beat. Vorher wird nichts geschnitten, denn der Song ist das Gerüst des Films.
3. **Songprofil**: Die App zeigt Tempo, Aufbau (Strophe, Refrain, Drop …) und den Höhepunkt und sagt, wie viele Aufnahmen für diesen Song ideal sind, z. B. „17–23 Fotos · bis 2 Videos · Film ca. 0:23“ für eine Story. Die Zahl stammt aus einem echten Testschnitt der Auto-Regie für das gewählte Ziel (Story, Reel, Beitrag, Film – direkt dort umschaltbar). Darunter die ehrliche Einschätzung deines Materials: passt ideal, mehr als ideal (alles kommt hinein, die Regie verlängert oder verdichtet im Refrain; mit „Beste Auswahl“ nimmt sie nur die stärksten) oder weniger (jedes Bild steht länger, der Film wird kürzer).
4. **Film schneiden**: Die Auto-Regie rechnet acht vollständige Schnitte durch und nimmt den besten – bewertet werden gleichmäßige Kamerafahrten über die Schnitte, keine Hektik in ruhigen Teilen, Bildgrößen im Wechsel, keine Doppel nebeneinander, kein Hin und Her, nichts weggelassen oder wiederholt. Sie entscheidet Länge, Songausschnitt, Tempo, Look, Einstieg und Ende und erklärt das im Klartext. Wechselst du später den Song, wird der Film gleich wieder bestmöglich neu geschnitten.
5. Optional anpassen: Format (Story, Beitrag, Film, Kino), Look, Einstieg, Ende, Texte, einzelne Einstellungen.
6. **Film exportieren** und im Teilen-Menü **„Video sichern“** wählen: Dann liegt der Film in der Fotos-App.

**Alle Aufnahmen, in Aufnahme-Reihenfolge** (Standard): Jedes Foto und jedes Video kommt in den Film, auch Serienbilder, streng chronologisch nach den Metadaten (nur Aufnahmen innerhalb weniger Minuten dürfen für Match-Cuts die Plätze tauschen). Reicht die Zeit nicht, verdichtet die Regie stufenweise: dichtere Schnitte (bis zu einem Beat), aufeinanderfolgende Fotos gemeinsam im Split-Screen, Foto-Serien in Refrain und Drop, zeitlich nahe Videos gleichzeitig im Split-Screen. Videos bekommen dabei nur so viel Zeit, dass alle Fotos Platz behalten (mindestens ein Takt je Video). Unter dem Format steht, wie verdichtet wurde. Die Songdynamik bleibt dabei führend: Verdichtet wird zuerst in Refrain und Drop, ruhige Teile (Intro, Strophe, Break, Outro) behalten mindestens zwei Beats je Einstellung und bekommen nie Foto-Serien; der erste Schlag eines Drops ist immer ein Schnitt – beginnt ein Video kurz davor, steht das Bild davor etwas länger und das Video setzt genau mit dem Drop ein. Alternativ *Beste Auswahl*: dann bleiben die schwächsten Fotos draußen, die Reihenfolge bleibt chronologisch.

**Story oder Reel** (bei 9:16): Eine *Story* ist höchstens 60 s lang, ein *Reel* bis 90 s. Unter dem Format steht, wie viele Fotos zum gewählten Song passen. Jede Aufnahme kommt genau einmal vor: Bei wenig Material stehen die Bilder länger (bei Länge „Auto“ wird der Film kürzer), es wird nichts wiederholt. Passt nicht alles hinein, sagt die App, wie viele Aufnahmen draußen bleiben, und markiert sie im Material („passt nicht“); als Reel passen mehr.

**Hochkant und quer**: Jede Aufnahme wird nach ihrem Format eingebunden. Passt sie gut, füllt sie das Bild. Wäre sonst mehr als die Hälfte abgeschnitten (Querfoto in der Story, Hochkantfoto im Kinoformat), steht sie vollständig im Bild, auf einer weichgezeichneten, abgedunkelten Fassung ihrer selbst mit leichtem Schatten, und bewegt sich ruhig innerhalb des Rahmens.

**Gesamtfilm:** fasst die besten Momente aller Orte in Kapiteln zusammen, auf Wunsch mit Koordinaten und gefahrenen Kilometern je Kapitel und einem Abspann mit Statistik (Orte · km · Tage).

**Einstiege ohne Schwarzbild:** *Countdown* (alter Filmvorspann über Bildern in Schwarzweiß), *9er-Raster*, *Durch den Namen*, *Ortsname*, *Titelkarte* (im Hochformat über dem abgedunkelten Bild), *Stärkstes Bild*, *Wort für Wort*, *Split-Screen*.

## Kreative Werkzeuge

- **Aufblende** (Standard-Einstieg): zwei Takte ruhiger Aufbau aus Details deiner Bilder, gedämpft, die Schärfe zieht an, dazu ein schlichter, gesperrter Titel. Genau auf dem Drop öffnet sich das stärkste Bild. Der Songausschnitt wird so gewählt, dass der Höhepunkt direkt nach dem Aufbau kommt.
- **Bilderflut** (Einstieg): ein Takt voller Bilder, erst auf halben, dann auf Viertel-Beats, immer schneller; auf der Eins steht das stärkste Bild. Danach wird es ruhiger, im Drop wieder schneller (Foto-Serie). Die Flut ist ein Vorgeschmack auf die Reise und zählt nicht als Doppelung.
- **Videos laufen wirklich**: Auf dem iPhone lädt ein Video seine Bilddaten oft erst beim Abspielen. Die App spielt es dafür kurz stumm an und gibt es nie als „nur Vorschaubild“ auf. Jedes Video bekommt einen eigenen Platz (mindestens ein Takt); reicht die Zeit nicht für alle in voller Länge, werden die Plätze gleichmäßig kürzer. Der beste Moment eines Videos liegt auf einem Schlag, bevorzugt auf der Eins. Videos landen nie in Foto-Serie, Bilderflut, Rewind oder anderen Sekundenbruchteil-Einstellungen.
- **Videos laufen (fast) ganz**: Jedes Video bekommt einen eigenen Platz, so lang wie das Video selbst (Story bis 7,5 s, Reel bis 10 s, Film bis 15 s), in Echtzeit, auf einem Taktanfang. Der Platz richtet sich nach Reisezeit und Charakter: ruhige Videos in Strophe und Break, bewegte in Drop und Refrain, möglichst ohne Abschnittswechsel mittendrin. Ist ein Video länger, zeigt die App einen Hinweis; im Material lässt sich per Antippen ein Ausschnitt (Start und Länge) wählen, der dann genau so läuft.
- **Videos anders als Fotos**: Videos werden weich ausgeblendet statt abgeschnitten. Fotos werden in ihrer Reihenfolge verteilt, jeweils mit der Energie, die zum Songteil passt. Übergänge wechseln innerhalb ihrer Familie, nie zweimal derselbe Effekt hintereinander.
- **9er-Raster** (Einstieg): neun Bilder in Schwarzweiß, Beat für Beat werden sie farbig, dann zoomt der Film ins mittlere Bild. Die App wählt den Songausschnitt so, dass der Zoom genau auf dem Drop landet.
- **Originalton pro Video**: Standard ist stumm. Pro Video *Stumm / Leise / Normal*; die Musik wird dort automatisch abgesenkt. Beim Export „Ohne Song“ bleibt der Originalton im Film.
- **Flüge**: In der Reiseansicht „Flug“ antippen, Von und Nach eintragen, dann die Videos vom Flug wie gewohnt aus der Galerie wählen. Die App ordnet sie nach Aufnahmezeit (erste = Abflug, letzte = Landung, dazwischen Aufnahmen an Bord); im Menü einer Aufnahme lässt sich das ändern. Dazwischen zeichnet sich die Flugroute als Großkreis über einem Globus oder einer flachen Karte, mit Uhrzeiten, Flugdauer und Kilometern.
- **Texte**: acht Schriften, sechs Animationen (Einschweben, Einblenden, Tippen, Wort im Takt, Aufziehen, Ohne), Hintergrund Balken/Block, frei verschiebbar; sichtbar auf einer bestimmten Aufnahme, am Anfang, am Ende oder im ganzen Film.
- **Schrift der Titel**: Klassisch, Modern, Grotesk, Editorial, Geometrisch, Mono.
- **Durch den Namen** (Einstieg): Der Ortsname ist ein Fenster ins Bild, auf dem Beat zoomt die Kamera durch die Buchstaben.
- **Foto-Serie im Drop**: einen Takt lang jeder halbe Beat ein neues Bild (Photo-Dump).
- **Bewegung im Takt**: Kamerafahrt, Pendeln (links/rechts, Wendepunkt auf dem Beat), Puls, Handkamera – jeweils leicht, mittel oder stark.
- **Ortsnamen und Kapitel**: schlicht in Weiß (bei warmen Looks Silber), ohne Gold; sie stehen über etwa zwei Einstellungen (3,4–5 s), lang genug zum Lesen. **Unter dem Ortsnamen** auf Wunsch etwas größere Koordinaten, die Ziffer für Ziffer erscheinen und dann in die gefahrenen Kilometer wechseln (seit dem letzten Ort oder seit Reisebeginn; Flugstrecken zählen nicht).
- **Countdown** (Einstieg): 3 · 2 · 1 wie im alten Kino, mit umlaufendem Zeiger, Sepia, Kratzern und Flackern; darunter wechseln deine Bilder in Schwarzweiß, nach der 1 geht es in Farbe auf dem Drop los.
- **Stil-Vorlage**: Stil eines Films speichern und mit einem Tipp auf alle Orte, Flüge und den Gesamtfilm übertragen; neue Orte übernehmen ihn automatisch.
- **Kartenstile** für Flüge: Nacht, Papier, Schwarzweiß, Signal, Eis, Salbei; eigene Routenfarbe; Kontinente als Punkte, Fläche oder aus; Globus oder flache Karte. Die Küstenlinien sind vereinfacht (etwa 1° genau) und offline eingebettet.
- **Vorspann + Einstieg kombinierbar**: *Countdown* oder *Rewind* laufen vor jedem Einstieg, z. B. Countdown und danach das 9er-Raster. Rewind zeigt kurz den besten Moment und spult dann wie eine Kassette (◀◀, Bildstörstreifen, rückwärts laufende Zeit) an den Anfang zurück.
- **Im Film – beliebig kombinierbar**: Match-Cuts, Bild aus Bild, Split-Screens, Foto-Serie im Drop, Speed-Ramp, Datumsstempel. Jedes Element hat seinen festen Platz im Song (Split-Screens im Refrain, Foto-Serie und Speed-Ramp im Drop, Bild aus Bild in ruhigen Teilen), so ergänzen sie sich statt sich zu stören.
- **Bewusste Reihenfolge**: grob chronologisch, innerhalb einer Szene folgt jedes Bild aus dem vorigen (Farbe, Helligkeit, Bildaufbau); Beinahe-Doppel stehen nie direkt hintereinander. Der Übergang richtet sich nach beiden Bildern: ähnlicher Aufbau → **Match-Cut** (die Kamerabewegung läuft weiter), Sprung ins Helle → Lichtblende, ins Dunkle → Schwarzblende.
- **Bild aus Bild**: drei Übergänge, bei denen das nächste Motiv aus dem vorigen entsteht: *Bild aus Bild* (Formen wachsen vom Motiv aus), *Farbfluss* (breitet sich wie Tinte aus), *Doppelbelichtung*.
- **Speed-Ramp**: Videos beschleunigen in den Drop hinein und landen auf dem Drop in Zeitlupe. Dafür bekommt ein längeres Video seinen Platz am Drop; Videos, die ganz laufen, bleiben in Echtzeit.
- **Digicam-Look**: knackig und kühl wie eine Kamera der 2000er, kleiner Blitz auf Fotoschnitten und orangefarbener Datumsstempel aus dem Aufnahmedatum (Stempel auch einzeln schaltbar).
- **Filmstreifen-Ende**: Das letzte Bild wird zum Einzelbild auf einem Filmstreifen mit Perforation, der rückwärts durch den Film läuft.
- **Titelbild für Reels**: im Export-Dialog. Stärkstes Bild mit Titel in voller Größe als JPEG; der Titel sitzt im Bereich, den das Profilraster zeigt.
- **Einstiegs-Elemente auch im Film** (Im Film): *Raster im Refrain* – beim Einsatz eines Refrains (oder am Anfang einer Phrase im Drop) werden 4 oder 9 Bilder im Takt farbig, dann zoomt der Film ins nächste Bild. *Countdown vor dem Drop* – 3 · 2 · 1 auf den letzten drei Beats, im Stil des Looks.
- **Bewegung**: Kamerafahrten gleiten (keine Stopps an den Schnitten), mit feiner Neigung, die Richtung fließt über zwei Einstellungen. Dazu *Impact-Zoom* (jeder Schnitt setzt mit einem kurzen Zoom auf dem Beat ein), *Puls*, *Pendeln*, *Schweben* (weiche Acht über zwei Takte), *Neigen* (kippt auf jeder Eins zur anderen Seite) und *Handkamera*.
- **Looks**: natürliches Grading mit eigenen Farbrädern für Schatten und Lichter, Vibrance und Farbtemperatur; jeder Look ist klar erkennbar, das Bild bleibt echt. Countdown und Rewind übernehmen den Ton des Looks, Titel und Kapitel bleiben neutral weiß bzw. silbern.
- **Einheitliche Titel**: Alle Einblendungen nutzen die gewählte Titelschrift und eine passende Schrift für kleine Zeilen. Titel gleiten wortweise auf den Beats aus einer Maske ins Bild und auf einem Beat wieder hinaus.
- **Schwarzweiß → Farbe** (eigene Auswahl): Das Schwarzweiß ist wie Film gemischt (Haut heller, Himmel dunkler, S-Kurve, dichte Schatten, silbriger Ton, etwas mehr Korn). Vor einem Einsatz ist das Bild schwarzweiß, auf dem Schlag kehrt die Farbe zurück und leuchtet gut einen Beat lang kräftiger, bevor sie sich beruhigt: *Auf dem Drop* (schlagartig), *Beat für Beat* (im Takt davor in vier Stufen), *Stroboskop* (zwei Takte vorher wechseln Farbe und Schwarzweiß auf den Schlägen – erst alle zwei Beats, dann jeden Beat, zuletzt auf halben Beats; direkt vor dem Einsatz schwarzweiß), *Farbe auf dem Schlag* (jede Bassdrum lässt die Farbe kurz aufleuchten, sie verblasst bis zum nächsten Schlag), *Vom Motiv aus*, *Farbwelle*, *Farbtupfer*. Mit der Aufblende bleibt der ganze Aufbau schwarzweiß und die Farbe kommt mit dem Highlight.
- **Schlagzeug**: Bassdrum und Snare werden erkannt. *Kick-Zoom* gibt nur auf der Bassdrum einen feinen Zoom-Impuls, *Kick + Snare* dazu ein kurzes, feines Rütteln auf der Snare. Die Erkennung korrigiert auch Taktraster, die auf Hi-Hats zwischen den Schlägen eingerastet wären.
- **Echo-Bild**: auf starken Schlägen im Drop blitzt das vorige Bild kurz halbtransparent auf (höchstens alle zwei Takte).
- **Polaroid-Stapel**: in einem ruhigen Teil fallen vier Fotos im Takt als Abzüge übereinander, mit Schatten auf einem weichen Hintergrund. Es kommen nur Fotos hinein, die sonst nicht im Film sind.
- **Mini-Rewind**: vor einem Drop spult der Film einen halben Takt zurück, auf dem Einsatz steht noch einmal der beste Moment.
- **Drift-Übergang**: in ruhigen Teilen gleitet die Kamera ohne Halt in Fahrtrichtung ins nächste Bild.
- **Tiefe (Parallax)**: nahe Bildteile (unten, am Motiv) folgen der Kamerafahrt etwas weiter als ferne, für mehr Tiefe.
- **Durch den Namen je Kapitel** (Gesamtfilm): zu jedem neuen Ort ist der Name ein Fenster ins Bild, dann zoomt die Kamera auf einem Beat durch die Buchstaben.
- **Auto-Stil**: Standardmäßig wählt die Regie wenige, aufeinander abgestimmte Mittel: durchgehend dezent Tiefe, Drift in ruhigen Teilen und den Bassdrum-Zoom im Drop, dazu je nach Filmlänge ein bis drei besondere Momente (Schwarzweiß → Farbe, Echo oder Polaroid-Stapel, Mini-Rewind) an den passenden Stellen im Song. Jedes Mittel lässt sich einzeln an- oder abschalten.
- **Einstellungsgrößen wie im Film**: Jede Aufnahme wird als *Totale* (Landschaft, Horizont, Weite), *Halbnah* (Menschen, Plätze) oder *Detail* (freigestelltes Motiv, Gesicht) erkannt. Innerhalb eines Moments wechseln sich die Größen ab, eine neue Szene beginnt möglichst mit einer Totale. Totalen gleiten ruhig, Details fahren sanft heran; zwischen Totale und Detail schneidet der Drop klar auf den Schlag, in ruhigen Teilen öffnet sich das Bild weich. Die Größe steht im Menü jeder Einstellung.
- **Feinschliff wie ein Cutter**: Nach der Zuteilung verschiebt die Regie einzelne Schnitte um ein bis zwei Beats: Totalen und starke Bilder bekommen Zeit zum Wirken, Details und schwächere Bilder bleiben knapp, nach einer schnellen Passage darf das erste Bild atmen. Schnitte bleiben auf starken Zählzeiten (Eins und Drei), Phrasenanfänge bleiben unangetastet, die Gesamtlänge bleibt gleich. Auf den Einsatz eines Refrains/Drops und ans Ende setzt sie das stärkste Bild aus der unmittelbaren Nähe (höchstens zwei Plätze, höchstens 3 Minuten Aufnahmezeit Abstand – die Chronologie bleibt). Eigene Entscheidungen bleiben unberührt.
- **Auto-Regie auf einen Blick**: Länge und Songausschnitt, Einstieg, Ende, Look, Schnitttempo und Aufnahmen stehen als Kacheln über den Einstellungen; antippen springt direkt zur passenden Einstellung. Die ausführliche Begründung gibt es unter „Warum so?“.
- **Bewegung als Einheit mit dem Song**: Die Kamera hat ein gemeinsames Tempo über den ganzen Film. Kurze Bilder fahren ein kurzes Stück, lange ein langes, mit derselben Geschwindigkeit; innerhalb einer Einstellung gleitet sie gleichmäßig statt abzubremsen. Das Tempo folgt der Energie des Songs, über gut einen Takt geglättet: in der Strophe ruhiger, im Refrain zügiger, ohne Sprünge. Bremst der Motivschutz einen Zoom, gleitet die Kamera stattdessen seitlich; einzelne zu schnelle Fahrten werden an ihre Nachbarn angeglichen. Tempo-Rampen in einen Drop hinein enden im normalen Tempo statt im Stillstand. „Bewegung: leicht / mittel / stark“ regelt dieses Tempo.
- **Glatt statt abgehackt**: Schwenks werden mit der Dauer einer Einstellung weiter (kurze Bilder gleiten nur ein Stück), die Kamera fließt in ruhigen Teilen meist in eine Richtung, Blitze und Zoom-Impulse kommen höchstens alle zwei Takte, Überblendungen mischen im Licht (die Mitte wird nicht matt), der Song blendet am Ende nach dem Gehör aus. Kleine Zeilen sind etwas größer und mit weichem Schatten auch über hellen Bildern lesbar. Takt-Akzente (Bassdrum-Impuls, pulsierende Mehrfachbelichtung, Farbversatz, Wörter im Takt) setzen mit einem kurzen, weichen Anschlag ein statt in einem einzigen Bild; Bewegungsunschärfe bei Wischer und Zoom ist stufenlos; beim Schieben schiebt sich das neue Bild mit weichem Schatten über das alte. Ein Prüfprogramm rendert jeden Film Bild für Bild und meldet jeden Sprung innerhalb einer Einstellung.
- **Flüssige Vorschau**: Auf schnellen Geräten läuft die Vorschau mit 60 statt 30 Bildern pro Sekunde; wird es knapp, schaltet sie zuerst auf 30 zurück, bevor die Auflösung sinkt.
- **Musikvideo** (Schalter unter der Variante, mit jeder Variante kombinierbar): *Mehrfachbelichtungen* – im Refrain liegt das nächste Bild wie Licht über dem aktuellen und pulsiert mit jedem Schlag, in ruhigen Teilen erscheint es als klassische Doppelbelichtung in den hellen Flächen (Himmel, Licht), die dunklen bleiben Silhouette; jede zweite weiche Blende in ruhigen Teilen wird zur Doppelbelichtung. Dazu Schwarzweiß mit *Farbe auf dem Schlag*, Echo, ein *Spiegelmoment* (zwei Beats, das Bild spiegelt sich in der Mitte) und ein Hauch *Farbversatz* auf den Bassdrums im Drop.
- **Drei Varianten**: *Ruhig* (lange Einstellungen, weiche Blenden, Titelkarte), *Ausgewogen* (wie der Song es vorgibt) und *Energisch* (schneller Schnitt, Bilderflut, Foto-Serie, Echo, Mini-Rewind). Sie füllen nur, was auf Auto steht; eigene Entscheidungen bleiben.
- **Zeitleiste zum Ziehen** (Schnitt): Kachel gedrückt halten und an eine andere Stelle ziehen. Die Aufnahme wandert dorthin, die Regie legt Schnitte und Songbogen neu an. „Änderungen am Schnitt zurücksetzen“ stellt die Aufnahme-Reihenfolge wieder her.
- **Gefällt mir nicht** (pro Einstellung): jedes Antippen bringt eine neue Kamerabewegung und einen anderen, zum Songteil passenden Übergang, bei *Beste Auswahl* auch ein anderes Foto aus derselben Zeit. Der Rest des Films bleibt unverändert.
- **Selbst aussortieren**: Auch bei *Alle Aufnahmen* bleiben Bildschirmfotos, fast schwarze oder ausgebrannte Bilder, unscharfe und zugleich schlecht belichtete Bilder und identische Serienbilder (wenige Sekunden auseinander) draußen. Im Material steht der Grund; als Favorit (♥) kommt ein Bild trotzdem hinein.
- **Szenen und Song**: Ein neuer Ort, eine längere Pause oder ein Lichtwechsel beginnt eine neue Szene. Sie setzt auf einem Taktanfang ein, in ruhigen Teilen mit einer Lichtblende, im Drop mit einem harten Schnitt. Kamerafahrten beschleunigen in einen Drop hinein und laufen danach schwungvoll aus (weiche Tempo-Rampen auch bei Fotos).
- **Motive**: Horizont, Himmel, Menschen und Gesichter (wo der Browser es kann) werden lokal erkannt. Kamerafahrten schneiden das Motiv nicht an, der Horizont bleibt waagerecht, Schwenks in Videos setzen sich im nächsten Foto fort.
- **Titel-Vorschläge** (Text): drei Titel aus Ort und Zeitraum, z. B. „Lissabon“ · „Lissabon ’26“ · „Ein Tag in Lissabon“, mit passender Unterzeile.
- **Karten-Moment** (Gesamtfilm): Bei jeder Etappe ab 20 km zeichnet eine kleine Karte oben rechts die Strecke vom letzten zum neuen Ort, mit Kilometern; die ganze Route ist fein gepunktet zu sehen.
- **Nichts ist fest**: Titel, Kapitel und Reise-Statistik lassen sich einzeln ausschalten; Koordinaten und Kilometer sind standardmäßig aus.

**Kino-Rollladen** (Einstieg, ideal für Stories): Im Kinoband in der Bildmitte erscheinen sechs Ausschnitte eurer stärksten Aufnahmen nebeneinander – die ersten im halben Takt, das stärkste vorn und sofort in Farbe, die übrigen erst schwarzweiß, dann fließt die Farbe hinein; jeder Ausschnitt setzt mit einem Zoom ein und fährt weiter, Videos laufen. Dann schließt ein Rollladen das Band in drei Zügen mit hörbarem Ziehen: unten, oben, ganz. Auf Schwarz erscheint der Ort mit Datum und Koordinaten, danach öffnet sich das Bild flüssig nach oben und unten, dahinter laufen schnell Bilder der Reise. Die Musik ist vom ersten Bild an da – gedämpft wie hinter einem Vorhang, mit jedem Zug dumpfer, zum Titel fast still – und öffnet sich zusammen mit dem Bild: voll und klar genau auf dem Refrain/Drop, wo das stärkste Bild steht. Die Geräusche entstehen auf dem Gerät und klingen in jedem Export gleich.

**Karussell-Beitrag** (Format Beitrag 4:5, Export → „Als Karussell“): die besten Fotos als Einzelbilder (JPEG), dazwischen kurze Clips (3–6 s, ganze Takte) aus euren Videos oder kleinen Foto-Sequenzen, geschnitten im Takt und mit dem Song, der von Clip zu Clip weiterläuft. Automatisch 6–10 Slides: vorn euer stärkstes Foto, danach chronologisch nach Tagesblöcken, nie zwei ähnliche Bilder, nie zwei Clips nebeneinander. Alle Slides teilen Look, Farbabgleich und Ausschnitt-Regeln; Dateien sind in Slide-Reihenfolge nummeriert und lassen sich gemeinsam in Fotos sichern.

## Musik und Instagram

- **Datei** (MP3, M4A, WAV): wird lokal analysiert (Takt, Refrain, Drop, Pausen).
- **Mithören**: Spiel den Song auf einem zweiten Gerät ab. Stell ihn auf die eingetragene Stelle (am besten 0:00) und lass ihn pausiert. Nach „Aufnahme starten“ zählt die App drei Töne herunter: **beim dritten, hohen Ton auf Play drücken**. Die App sucht danach in der Aufnahme den exakten Einsatz des Songs (der Startton wird dabei herausgefiltert) und schneidet genau dort: deine Reaktionszeit und die Latenz der Geräte spielen keine Rolle, im Test liegt der Einsatz auf etwa 1 ms genau. Lief der Song schon vor dem Ton, sagt die App Bescheid. 15–60 Sekunden reichen.
- **Instagram-Hilfe** (nach dem Export): ob Story oder Reel, welcher Moment das beste Titelbild ist, und eine fertige Bildunterschrift mit Hashtags zum Kopieren.
- **Wir-Vorrang** (Look, standardmäßig an): Aufnahmen von euch tragen die ruhigen Passagen und stehen länger, Natur, Häuser und Dinge die schnellen; das Schlussbild gehört euch.
- **Reihenfolge nach Tageszeit** (Look, standardmäßig an): Die Tage bleiben in ihrer Folge, ebenso je Tag „Morgen & Mittag“ (bis 14 Uhr) und „Nachmittag & Abend“ (die Nacht bis 4 Uhr zählt zum Vorabend). Innerhalb eines solchen Blocks setzt die Regie jedes Foto dorthin, wo es am besten wirkt: ihr in die ruhigen Passagen, Natur und Dinge in die schnellen, Totalen und starke Bilder auf die langen Plätze, die Bildenergie passend zur Songstelle, nie zwei ähnliche Bilder hintereinander. Eigene Entscheidungen, verschobene Aufnahmen und Videos bleiben, wo sie sind. Ausgeschaltet gilt die Uhrzeit streng. Erkennung über Gesichter/Hauttöne; im Medienblatt „Wir-Aufnahme: Ja / Nein / Automatisch“, markierte Kacheln zeigen WIR.
- **Hook-Prüfung**: Karte „Hook · 78 / 100“ in der Regie. Bewertet messbar, was in den ersten 1,5 s über Weiterwischen entscheidet (Bewegung, früher Schnitt, starkes Motiv, Menschen, Musik ohne Anlauf, kein Schwarzbild) mit Tipps; „Erste 1,5 s in Schleife“ zeigt den Scroll-Moment; „Automatisch verbessern“ probiert Einstieg, Songstart und Startbild und übernimmt das Stärkste, ohne den übrigen Film zu verschlechtern.
- **Im Takt mittippen**: Handsymbol unter dem Bild, der Film läuft, du tippst aufs Bild, wo es krachen soll. Jeder Tipp rastet auf den nächsten Schlag, dort wird geschnitten, mit kurzem Zoom-Stoß (im Vorspann und in durchlaufenden Videos nur der Stoß). Markierungen in der Zeitleiste; „Alle löschen“ oder Schnitt zurücksetzen.
- **Mehrere Reisen**: Neue Aufnahmen ordnet die App nach Datum selbst der passenden Reise zu; liegen sie außerhalb aller Reisen, legt sie eine neue an (Name aus Orten und Monat). Oben „Reise 1 von 3“ antippen zum Wechseln, Anlegen oder Löschen.
- **Reisekarte**: Die Route der Reise auf einer Punktekarte mit nummerierten Etappen; antippen öffnet den Ort.
- **Regie und Werkbank**: Zwei Bedienebenen. *Regie* zeigt das Wesentliche, die App schneidet. *Werkbank* legt die Zeitleiste direkt unter das Bild (die laufende Einstellung leuchtet mit) und zeigt jeden Regler.
- **Varianten vergleichen**: Im Vollbild zwischen *Ruhig*, *Ausgewogen* und *Energisch* wischen, an derselben Stelle im Song; mit Zahl der Einstellungen und mittlerer Standzeit. Übernehmen oder zurück.
- **Video auf den Takt**: Nach dem Einlesen misst die App im Hintergrund jede Bewegung in deinen Videos auf das Einzelbild genau (Sprung, Welle, Schwenk) und legt diese Momente beim Schneiden genau auf Schlag, Snare oder Bassdrum; kein Schnitt reißt eine Bewegung ab.
- **Colorist**: Jede Szene behält ihre Stimmung (ein warmer Abend bleibt warm), Ausreißer mit anderem Weißabgleich oder Gegenlicht werden angeglichen; Helligkeit über eine Gammakurve, damit helle Stellen nicht ausbrennen.
- **Bildausschnitt wie ein Fotograf**: Motiv auf dem Drittel mit Blickraum, Horizont auf einem Drittel, Köpfe nie angeschnitten.
- **Leistungsprotokoll** (unten auf der Startseite): Zeiten für Einlesen, Planen, Vorschau und Export je Schritt, nur auf dem Gerät gespeichert; zum Kopieren.
- **Wärmeschutz**: Wird das Gerät beim Export heiß (längere Rechenzeit je Bild oder Compute-Pressure-Meldung), legt der Export kurze Pausen ein. Das Video bleibt gleich.
- **Mini-Vorschau**: Scrollst du zu den Einstellungen, bleibt oben in der Kopfzeile ein kleines Livebild mit Abspielen und Fortschrittslinie. Antippen springt zurück zum großen Bild.
- **Export im Hintergrund**: Wechselst du während des Exports kurz die App, pausiert er und läuft danach weiter. Hat iOS den Encoder in der Zwischenzeit beendet, geht es ab dem letzten sicheren Bild weiter; nichts muss neu begonnen werden.
- **Instagram-Sync**: Exportiere ohne Ton und füge den Song über den Musik-Sticker ab der angezeigten Startzeit hinzu. So ist die Musik lizenziert und das Video wird nicht stummgeschaltet.

Songs aus Spotify, Apple Music oder YouTube lassen sich nicht übernehmen: Sie sind kopiergeschützt.

## Qualität

| Stufe | Auflösung | Datenrate (30 fps, 9:16) | Wofür |
| --- | --- | --- | --- |
| Instagram | 1080 × 1920 | ca. 14 Mbit/s | kleinere Datei |
| Maximal (Standard) | 1080 × 1920 | ca. 26 Mbit/s | beste Details, auch nach Instagrams Neukomprimierung |
| 4K-Archiv | 2160 × 3840 | ca. 30 Mbit/s | Archiv, große Bildschirme (nur wenn das Gerät es kodieren kann) |

Jedes Bild wird einzeln berechnet (ruckelfrei, auch bei 60 fps). Videos (MP4/MOV, auch HEVC vom iPhone) werden dafür direkt aus der Datei dekodiert (WebCodecs) statt im Videoelement zu springen: gleiches Bild, Bild für Bild geprüft, etwa 9× schneller im Videoteil. Wo ein Format nicht passt, nimmt die App automatisch den bisherigen Weg. Auch das Einlesen liest Videos so und bewertet Fotos aus einer einzigen verkleinerten Kopie. Fotos werden in Hintergrund-Threads dekodiert und bewertet (gleiche Werte, die Oberfläche bleibt flüssig) und teilen sich ein Pixelbudget: normale 12-MP-Fotos werden zu viert gleichzeitig gelesen, große entsprechend weniger (ca. 30 % schneller, gleicher Speicher-Höchststand, identische Bewertung). Beim Export wird der Ton parallel zum Bild berechnet und kodiert, und jedes neue Bild startet, sobald der Encoder frei ist. Bild- und Tonspur bleiben dabei Bit für Bit gleich.

**Takt-Genauigkeit**: Jeder Beat wird auf den tatsächlichen Anschlag im Signal gezogen (zwischen den Analyse-Frames genau), Taktanfänge werden über den ganzen Song verfolgt (auch nach Breaks oder Tempowechseln), Schnitte liegen ausschließlich auf Beats. Getestet mit 3-Minuten-Songs mit krummem Tempo und Tempodrift: Schlagzeug-Beats auf ±3 ms genau, im fertigen Video liegt jeder Schnitt höchstens ein halbes Bild neben dem Beat. Schnelle Songs werden nicht mehr im halben Tempo erkannt (die Bassdrum entscheidet: 150 statt 75 BPM), und Intro, Build oder Break ohne Schlagzeug laufen exakt im Tempo der Umgebung weiter.

**Stimmigkeit**: Jeder Schnitt wird gegen den Song geprüft – auf dem Schlag, Drop-Einsatz als Schnitt, ruhige Teile nicht hektisch, Videos lang genug und nie über einen Drop hinweg, Songausschnitt auf der Eins, Länge im Format (auch Reel 90 s), Tagesblöcke in Folge, nichts doppelt, nichts vergessen. Die Suche nach dem besten Schnitt wertet jede Unstimmigkeit ab; ein Prüflauf über 90 Kombinationen aus Tempo, Materialmenge und Format muss ohne Befund bleiben.

**Schonend fürs Handy**: Die Vorschau zeichnet höchstens 30 Bilder pro Sekunde (bei 120-Hz-Displays ein Viertel der Arbeit), rechnet in begrenzter Auflösung (kurze Seite höchstens 720 px) und dekodiert Fotos direkt in der benötigten Größe statt in voller Kameraauflösung. Der Bildspeicher ist begrenzt, Leinwände werden sofort freigegeben, nur zwei Songs bleiben dekodiert, die Audio-Hardware schläft in Pausen, und im Hintergrund gibt die App Speicher frei. Entzieht iOS ihr kurz die Grafikkarte, baut sie das Bild selbst wieder auf. Beim Export gilt weiterhin volle Qualität.

Die Vorschau passt sich an: Ruckelt das Gerät, sinkt beim Abspielen die Auflösung stufenweise, angehalten ist sie wieder voll scharf. Der Export ist davon nie betroffen. Fotos werden so hoch aufgelöst geladen, dass auch der Ausschnitt (z. B. Querfoto in der Story) nie hochskaliert wird; dazu eine leichte Nachschärfung. Die Vorschau rendert in der Pixeldichte des Displays.

## Aufbau

| Ordner | Inhalt |
| --- | --- |
| `src/js/` | Programmcode: Audioanalyse, Auto-Regie, Renderer, Export, Oberfläche |
| `src/js/plan/` | Planer: Schnittraster, Übergänge, chronologische Zuteilung, Effekte |
| `src/body.html`, `src/app.css` | Oberfläche und Gestaltung |
| `docs/` | fertige Web-App (von `node build.mjs` erzeugt) und Symbole, von GitHub Pages ausgeliefert |
| `test/` | automatische Tests (Playwright/Chromium) |

## Entwicklung

```sh
npm run build        # docs/index.html (Web-App), docs/CineBeat.html (Einzeldatei), dist/cinebeat.html (Claude-Link)
npm test             # Lint + schnelle Tests, eine Zeile je Test
npm test -- all      # alle Tests (Playwright/Chromium)
npm test -- flow     # einzelne Tests
```

Aufbau, Regeln und Arbeitsweise stehen in `CLAUDE.md`.
