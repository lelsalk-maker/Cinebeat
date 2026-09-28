# CineBeat – Arbeitsanleitung

Web-App (Vanilla JS, kein Framework, keine Abhängigkeiten zur Laufzeit), die aus Fotos/Videos einer Reise
beat-synchrone Filme macht. Läuft komplett auf dem Gerät (iPhone ist Hauptziel). Antworten an den Nutzer auf Deutsch.

## Befehle
- `npm run build` – bündelt `src/` nach `docs/index.html` (PWA, GitHub Pages), `docs/CineBeat.html` (offline, CSP) und `dist/cinebeat.html` (Claude-Artefakt).
- `npm test -- changed` – **Standard nach Änderungen**: nur die Tests, die zu geänderten Dateien gehören (Zuordnung `MAP` in `test/run.mjs`).
- `npm test` – schnelle Auswahl; `npm test -- all` – alles (~6 min, 4 parallel mit `CB_JOBS=4`, Standard 3); `npm test -- flow ui` – einzelne; `-v` zeigt jede Testzeile.
- Ausgabe ist absichtlich knapp: eine Ergebniszeile, Details nur bei Fehlern. Zeitkritische Tests (`SERIAL`) laufen allein am Ende, lange werden zerlegt (`SPLIT`, z. B. `judder/story`).
- Einzelne Prüfprogramme: Glätte `smooth`, Sprünge Bild für Bild `judder` (`JCONF`), Export nach App-Wechsel `bgexport`, Mithören `listen`, Karten/Kapitel `trip`. Tests brauchen Playwright/Chromium (vorinstalliert).
- Veröffentlichen: `docs/sw.js` Cache-Version erhöhen (`cinebeat-vNN`), bauen, committen, pushen; Artefakt mit `dist/cinebeat.html` an die bestehende URL.

## Aufbau (Reihenfolge im Bündel = `build.mjs`)
| Datei | Inhalt |
| --- | --- |
| `src/js/mediaio.js` | Bild dekodieren, Video-Elemente (iOS: `primeVideo`), WebM-Fix |
| `meta.js`, `world.js` | EXIF/MP4-Metadaten, Orte, Küstenlinien |
| `audio.js` | Beats, Takte, Abschnitte (intro/verse/build/drop/chorus/break/outro), Bassdrum/Snare, `AN_VER` (erhöhen ⇒ Neuanalyse) |
| `score.js` | Bildbewertung: Schärfe, Farbe, Fokus, Layout, Hash; Video-Highlights; `actionCurve`/`motionHits` (Bewegungsmomente bildgenau) |
| `plan/base.js` | Zufall, `LOOKS`, `FORMATS`, `TR` (Übergänge), `sectionAt`, `pickWindow` |
| `plan/cuts.js` | Schnittraster auf Beats (`planCuts`, DP), `adjustCuts` |
| `plan/transitions.js` | Wahl der Übergänge |
| `plan/media.js` | Tempo-Kurven, `videoPlay`, Reihenfolge (`flowOrder`, `applyMoves`), Szenen (`sceneStarts`), Einstellungsgröße (`shotSize`), `imageMotion`/`fitSubject` |
| `plan/search.js` | `buildPlan`: Suche über Schnittlänge (`_scale`) und Verdichtungsstufe (`_level` 0–4) |
| `plan/chrono.js` | `layoutChrono`: Aufnahmen streng chronologisch auf die Schnitte (Split, Serie, Stapel, Videoplätze) |
| `plan/plan.js` | `planOnce`: Einstiege, Stil-Mittel, Zuteilung, Übergänge, Bewegung, Effekte, Overlays, Kapazität |
| `plan/timeline.js` | `layersAt`, `clipIndexAt` |
| `plan/cutter.js` | `cutterPolish`: Standzeit nach Bildinhalt (Schnitte ±1–2 Beats auf starken Zählzeiten), Höhepunkt-/Schlussbild |
| `plan/vsync.js` | Videoschnitt auf den Takt: `hitGrid` (Eins/Snare/Bassdrum/Beats), `syncVideoOffset` legt Aktionsmomente (`m.hits`) aufs Raster |
| `plan/advice.js` | Song zuerst: `idealLength`, `songAdvice` (ideale Menge per Testschnitt), `planQuality` (Bewertung), `bestCut` (beste von n Varianten) |
| `director.js` | Auto-Regie: Varianten (`VARIANTS`), Musikvideo (`withMusicVideo`), Aussortieren (`autoOut`), Länge, Songausschnitt, Tempo, Look, Einstieg/Ende, Stil-Budget (`rs.*`) |
| `perflog.js` | Leistungsprotokoll (`perfLog.add`, lokal, 40 Einträge) und Wärmeschutz beim Export (`HeatGuard`) |
| `scoreworker.js` | Worker fürs Einlesen (mit `score.js` von `build.mjs` als `SCORE_WORKER_SRC` eingebettet, Blob-Worker) |
| `renderer.js` | WebGL-Shader (zwei Ebenen A/B, Grading, Übergänge, Film-Schwarzweiß `filmBW`, Farbmomente, Mehrfachbelichtung 21/22, Spiegel, Farbversatz) |
| `overlay.js` | Titel, Kapitel, Flug- und Etappenkarte (`drawRouteMap`), Countdown usw. (Canvas 2D, ungegradet) |
| `engine.js` | Vorschau (Audio-Uhr), Slots/Texturen, Kompositionen (Raster, Split, Stapel, Streifen), Export (WebCodecs + `mp4mux.js`/`demux.js`) |
| `store.js`, `demo.js`, `ui.js` | IndexedDB, Beispielmaterial, gesamte Oberfläche; `src/body.html`, `src/app.css` |

## Datenfluss
`analyzeAudio` → `an` · Medien mit Scores → `buildPlan({ an, media, settings, overrides, chapters, trip, flight })` → `plan`
(`overrides`: `clips[i]` = {mediaId, trans, speed, srcOffset, again}, `moves` = [{id, before}] aus der Zeitleiste, `texts`, `stickers`)
(`clips[]` mit `start/end/visStart/visEnd`, `mediaIndex`, `motion`, `tin/tout`, Flags wie `split/grid/stack/burst/vid/rush`; `fx[]`, `overlays[]`, `capacity`, `notes`, `resolved`)
Reisen: `S.trips`, aktive `S.trip`; `S.places` enthält die Orte **aller** Reisen (`tripId`, fehlt = 'main'), Anzeige über `inTrip`/`tripStops`. Import ordnet Etappen per `tripForStop` nach Datum ein.
Bedienebenen: `.app[data-level]` = `regie` | `bench` (Werkbank dockt `.cliprow-wrap` in `#benchDock`); Tests, die alle Regler brauchen, setzen `localStorage['cinebeat-level']='bench'`.
Ablauf je Ort (`rec.flow`): `song` (Song wählen) → `advice` (Songprofil + Empfehlung) → `done` (geschnitten; alte Orte ohne `flow` gelten als fertig). Vorher baut `rebuild` keinen Plan, sondern zeigt `#flowStage`.
→ `Engine.setProject` → `drawAt(t)` je Bild → Renderer. **`clip.i` muss dem Index in `plan.clips` entsprechen.**

## Regeln, die gelten müssen
- Alles lokal: keine Netzwerkzugriffe, keine Uploads.
- Chronologie aus Metadaten (Ausnahmen: Startbild, Tausch innerhalb 3 min, Beinahe-Doppel versetzt).
- „Alle Aufnahmen“ (Standard): nichts weglassen; verdichten zuerst in Drop/Refrain; ruhige Teile ≥ 2 Beats.
- Videos laufen wirklich (mind. ein Takt), bester Moment auf dem Schlag; nie in Sekundenbruchteil-Einstellungen.
- Songdynamik: Drop-Einsatz ist ein Schnitt. Design: Schwarz/Dunkelblau/Beige, schlicht, modern.
- Farbe: `colorMatch` gleicht je Szene an (`[r,g,b,gamma]`), Stimmung bleibt. Ausschnitt: `framePoint` (Drittel, Horizont, Kopf).
- Videos: Feinanalyse (`analyzeVideoAction`) läuft nach dem Einlesen im Hintergrund (`vAct`), pausiert beim Export; `cutFilm` wartet darauf.
- Export: Bild- und Tonspur müssen Bit für Bit gleich bleiben (Beschleunigung nur drumherum: Ton parallel, `dequeue`-Wecken). Einlesen: Fotos parallel über Pixelbudget (`budget` in ui.js), Videos einzeln.
- Leistung: Vorschau 30 fps, 60 fps nur im Flüssig-Modus (Bild kostet < 4,5 ms, fällt nichts aus), begrenzte Auflösung, keine Arbeit pro Bild, die sich cachen lässt.

## Effizient arbeiten (Token sparen)
- Nicht ganze Dateien lesen: `grep -n` nach Funktions-/Variablennamen, dann gezielt `sed -n 'a,bp'`.
- Änderungen mit kleinen, eindeutigen Ersetzungen (Python-Replace mit `assert old in s`).
- Nach Änderungen `npm test -- changed`; `npm test -- all` nur vor dem Veröffentlichen. Keine Testausgaben ungefiltert lesen.
- Neue Planer-Logik in die passende `plan/*.js` statt in `plan.js`; neue Tests in `test/*.mjs` + in `test/run.mjs` eintragen.
- Aufträge bündeln: mehrere Wünsche in einer Nachricht sparen Wiederholungen beim Einlesen; „wie letztes Mal“ reicht, Regeln stehen hier.
- Screenshots nur zum Prüfen von Gestaltung ansehen (teuer); Logik über Test-Ausgaben prüfen.
- Commits: Autor-Mail ist gesetzt; Nachricht endet mit Co-Authored-By- und Claude-Session-Zeile.
