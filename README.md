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
2. Ort antippen. Die **Auto-Regie** entscheidet Länge, Songausschnitt, Tempo, Look, Einstieg und Ende und erklärt das im Klartext. Unscharfe Bilder und Duplikate bleiben draußen, alle Aufnahmen werden farblich angeglichen.
3. Optional anpassen: Format (Story, Beitrag, Film, Kino), Look, Einstieg, Ende, Texte, einzelne Einstellungen.
4. **Film exportieren** und im Teilen-Menü **„Video sichern“** wählen: Dann liegt der Film in der Fotos-App.

**Gesamtfilm:** fasst die besten Momente aller Orte in Kapiteln zusammen, auf Wunsch mit Koordinaten und gefahrenen Kilometern je Kapitel und einem Abspann mit Statistik (Orte · km · Tage).

**Einstiege ohne Schwarzbild:** *Countdown* (alter Filmvorspann über Bildern in Schwarzweiß), *9er-Raster*, *Durch den Namen*, *Ortsname*, *Titelkarte* (im Hochformat über dem abgedunkelten Bild), *Stärkstes Bild*, *Wort für Wort*, *Split-Screen*.

## Kreative Werkzeuge

- **Aufblende** (Standard-Einstieg): zwei Takte ruhiger Aufbau aus Details deiner Bilder, gedämpft, die Schärfe zieht an, dazu ein schlichter, gesperrter Titel. Genau auf dem Drop öffnet sich das stärkste Bild. Der Songausschnitt wird so gewählt, dass der Höhepunkt direkt nach dem Aufbau kommt.
- **Videos anders als Fotos**: Videos bekommen eigene, längere Plätze in ruhigen Songteilen, zeitlich dort, wo sie in der Reise liegen, und werden weich ausgeblendet statt abgeschnitten. Fotos werden in ihrer Reihenfolge verteilt, jeweils mit der Energie, die zum Songteil passt. Übergänge wechseln innerhalb ihrer Familie, nie zweimal derselbe Effekt hintereinander.
- **9er-Raster** (Einstieg): neun Bilder in Schwarzweiß, Beat für Beat werden sie farbig, dann zoomt der Film ins mittlere Bild. Die App wählt den Songausschnitt so, dass der Zoom genau auf dem Drop landet.
- **Originalton pro Video**: Standard ist stumm. Pro Video *Stumm / Leise / Normal*; die Musik wird dort automatisch abgesenkt. Beim Export „Ohne Song“ bleibt der Originalton im Film.
- **Flüge**: In der Reiseansicht „Flug“ antippen, Von und Nach eintragen, dann die Videos vom Flug wie gewohnt aus der Galerie wählen. Die App ordnet sie nach Aufnahmezeit (erste = Abflug, letzte = Landung, dazwischen Aufnahmen an Bord); im Menü einer Aufnahme lässt sich das ändern. Dazwischen zeichnet sich die Flugroute als Großkreis über einem Globus oder einer flachen Karte, mit Uhrzeiten, Flugdauer und Kilometern.
- **Texte**: acht Schriften, sechs Animationen (Einschweben, Einblenden, Tippen, Wort im Takt, Aufziehen, Ohne), Hintergrund Balken/Block, frei verschiebbar; sichtbar auf einer bestimmten Aufnahme, am Anfang, am Ende oder im ganzen Film.
- **Schrift der Titel**: Klassisch, Modern, Grotesk, Editorial, Geometrisch, Mono.
- **Durch den Namen** (Einstieg): Der Ortsname ist ein Fenster ins Bild, auf dem Beat zoomt die Kamera durch die Buchstaben.
- **Foto-Serie im Drop**: einen Takt lang jeder halbe Beat ein neues Bild (Photo-Dump).
- **Bewegung im Takt**: Kamerafahrt, Pendeln (links/rechts, Wendepunkt auf dem Beat), Puls, Handkamera – jeweils leicht, mittel oder stark.
- **Unter dem Ortsnamen**: auf Wunsch Koordinaten, die Ziffer für Ziffer erscheinen und dann in die gefahrenen Kilometer wechseln (seit dem letzten Ort oder seit Reisebeginn; Flugstrecken zählen nicht).
- **Countdown** (Einstieg): 3 · 2 · 1 wie im alten Kino, mit umlaufendem Zeiger, Sepia, Kratzern und Flackern; darunter wechseln deine Bilder in Schwarzweiß, nach der 1 geht es in Farbe auf dem Drop los.
- **Stil-Vorlage**: Stil eines Films speichern und mit einem Tipp auf alle Orte, Flüge und den Gesamtfilm übertragen; neue Orte übernehmen ihn automatisch.
- **Kartenstile** für Flüge: Nacht, Papier, Schwarzweiß, Signal, Eis, Salbei; eigene Routenfarbe; Kontinente als Punkte, Fläche oder aus; Globus oder flache Karte. Die Küstenlinien sind vereinfacht (etwa 1° genau) und offline eingebettet.
- **Vorspann + Einstieg kombinierbar**: *Countdown* oder *Rewind* laufen vor jedem Einstieg, z. B. Countdown und danach das 9er-Raster. Rewind zeigt kurz den besten Moment und spult dann wie eine Kassette (◀◀, Bildstörstreifen, rückwärts laufende Zeit) an den Anfang zurück.
- **Im Film – beliebig kombinierbar**: Match-Cuts, Bild aus Bild, Split-Screens, Foto-Serie im Drop, Speed-Ramp, Datumsstempel. Jedes Element hat seinen festen Platz im Song (Split-Screens im Refrain, Foto-Serie und Speed-Ramp im Drop, Bild aus Bild in ruhigen Teilen), so ergänzen sie sich statt sich zu stören.
- **Bewusste Reihenfolge**: grob chronologisch, innerhalb einer Szene folgt jedes Bild aus dem vorigen (Farbe, Helligkeit, Bildaufbau); Beinahe-Doppel stehen nie direkt hintereinander. Der Übergang richtet sich nach beiden Bildern: ähnlicher Aufbau → **Match-Cut** (die Kamerabewegung läuft weiter), Sprung ins Helle → Lichtblende, ins Dunkle → Schwarzblende.
- **Bild aus Bild**: drei Übergänge, bei denen das nächste Motiv aus dem vorigen entsteht: *Bild aus Bild* (Formen wachsen vom Motiv aus), *Farbfluss* (breitet sich wie Tinte aus), *Doppelbelichtung*.
- **Speed-Ramp**: Videos beschleunigen in den Drop hinein und landen auf dem Drop in Zeitlupe.
- **Digicam-Look**: knackig und kühl wie eine Kamera der 2000er, kleiner Blitz auf Fotoschnitten und orangefarbener Datumsstempel aus dem Aufnahmedatum (Stempel auch einzeln schaltbar).
- **Filmstreifen-Ende**: Das letzte Bild wird zum Einzelbild auf einem Filmstreifen mit Perforation, der rückwärts durch den Film läuft.
- **Titelbild für Reels**: im Export-Dialog. Stärkstes Bild mit Titel in voller Größe als JPEG; der Titel sitzt im Bereich, den das Profilraster zeigt.
- **Nichts ist fest**: Titel, Kapitel und Reise-Statistik lassen sich einzeln ausschalten; Koordinaten und Kilometer sind standardmäßig aus.

## Musik und Instagram

- **Datei** (MP3, M4A, WAV): wird lokal analysiert (Takt, Refrain, Drop, Pausen).
- **Mithören**: Spiel den Song auf einem zweiten Gerät ab. Die App hört 15–60 Sekunden zu und erkennt Takt und Aufbau. Trag ein, ab welcher Stelle der Song lief, dann stimmt die Startzeit für Instagram.
- **Instagram-Sync**: Exportiere ohne Ton und füge den Song über den Musik-Sticker ab der angezeigten Startzeit hinzu. So ist die Musik lizenziert und das Video wird nicht stummgeschaltet.

Songs aus Spotify, Apple Music oder YouTube lassen sich nicht übernehmen: Sie sind kopiergeschützt.

## Qualität

| Stufe | Auflösung | Datenrate (30 fps, 9:16) | Wofür |
| --- | --- | --- | --- |
| Instagram | 1080 × 1920 | ca. 14 Mbit/s | kleinere Datei |
| Maximal (Standard) | 1080 × 1920 | ca. 26 Mbit/s | beste Details, auch nach Instagrams Neukomprimierung |
| 4K-Archiv | 2160 × 3840 | ca. 30 Mbit/s | Archiv, große Bildschirme (nur wenn das Gerät es kodieren kann) |

Jedes Bild wird einzeln berechnet (ruckelfrei, auch bei 60 fps). Videos (MP4/MOV, auch HEVC vom iPhone) werden dafür direkt aus der Datei dekodiert (WebCodecs) statt im Videoelement zu springen: gleiches Bild, Bild für Bild geprüft, etwa 9× schneller im Videoteil. Wo ein Format nicht passt, nimmt die App automatisch den bisherigen Weg. Auch das Einlesen liest Videos so und bewertet Fotos aus einer einzigen verkleinerten Kopie.

**Takt-Genauigkeit**: Jeder Beat wird auf den tatsächlichen Anschlag im Signal gezogen (zwischen den Analyse-Frames genau), Taktanfänge werden über den ganzen Song verfolgt (auch nach Breaks oder Tempowechseln), Schnitte liegen ausschließlich auf Beats. Getestet mit 3-Minuten-Songs mit krummem Tempo und Tempodrift: Schlagzeug-Beats auf ±3 ms genau, im fertigen Video liegt jeder Schnitt höchstens ein halbes Bild neben dem Beat.

**Schonend fürs Handy**: Die Vorschau zeichnet höchstens 30 Bilder pro Sekunde (bei 120-Hz-Displays ein Viertel der Arbeit), rechnet in begrenzter Auflösung (kurze Seite höchstens 720 px) und dekodiert Fotos direkt in der benötigten Größe statt in voller Kameraauflösung. Der Bildspeicher ist begrenzt, Leinwände werden sofort freigegeben, nur zwei Songs bleiben dekodiert, die Audio-Hardware schläft in Pausen, und im Hintergrund gibt die App Speicher frei. Entzieht iOS ihr kurz die Grafikkarte, baut sie das Bild selbst wieder auf. Beim Export gilt weiterhin volle Qualität.

Die Vorschau passt sich an: Ruckelt das Gerät, sinkt beim Abspielen die Auflösung stufenweise, angehalten ist sie wieder voll scharf. Der Export ist davon nie betroffen. Fotos werden so hoch aufgelöst geladen, dass auch der Ausschnitt (z. B. Querfoto in der Story) nie hochskaliert wird; dazu eine leichte Nachschärfung. Die Vorschau rendert in der Pixeldichte des Displays.

## Aufbau

| Ordner | Inhalt |
| --- | --- |
| `src/js/` | Programmcode: Audioanalyse, Auto-Regie, Planung, Renderer, Export, Oberfläche |
| `src/body.html`, `src/app.css` | Oberfläche und Gestaltung |
| `docs/` | fertige Web-App (von `node build.mjs` erzeugt) und Symbole, von GitHub Pages ausgeliefert |
| `test/` | automatische Tests (Playwright/Chromium) |

## Entwicklung

```sh
node build.mjs          # docs/index.html (Web-App für GitHub Pages), docs/CineBeat.html (Einzeldatei), dist/cinebeat.html (Claude-Link, nicht im Repository)
node test/offline.mjs   # Einzeldatei: Netzsperre, Speicher, Export
node test/ui.mjs        # Bedienoberfläche
node test/e2e.mjs       # Ort und Gesamtfilm von Anfang bis Export
node test/beats.mjs     # Beat-Genauigkeit
node test/structure.mjs 124
node test/trip.mjs      # Reise-Import mit GPS, Koordinaten/km, Stil-Vorlage, keine gespeicherten Medien
node test/mic.mjs       # Mithören (Fake-Mikrofon), verweigerter Zugriff, Instagram-Startzeit, Export-Stufen
node test/quality.mjs   # Bildschärfe im Export gegenüber idealer Verkleinerung (Ziel > 90 %)
node test/flight.mjs    # Flug anlegen, Fluganimation
node test/pipeline.mjs '{"intro":"grid","many":1}'   # 9er-Raster
node test/pipeline.mjs '{"voice":1}'                  # Originalton im Export
```
