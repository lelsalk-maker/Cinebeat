# CineBeat – Arbeitsanleitung

Web-App (Vanilla JS, kein Framework, keine Abhängigkeiten zur Laufzeit), die aus Fotos/Videos einer Reise
beat-synchrone Filme macht. Läuft komplett auf dem Gerät (iPhone ist Hauptziel). Antworten an den Nutzer auf Deutsch.

## Befehle
- `npm run build` – bündelt `src/` nach `docs/index.html` (PWA, GitHub Pages), `docs/CineBeat.html` (offline, CSP) und `dist/cinebeat.html` (Claude-Artefakt).
- Nach Änderungen nur die **relevanten** Tests (Nutzerwunsch); `npm test -- all` nur bei großen, übergreifenden Änderungen.
- `npm test -- changed` – Tests zu geänderten Dateien: nur die Tests, die zu geänderten Dateien gehören (Zuordnung `MAP` in `test/run.mjs`).
- `npm test` – schnelle Auswahl; `npm test -- all` – alles (~10 min, 4 parallel, `CB_JOBS` ändert das); `npm test -- flow ui` – einzelne; `-v` zeigt jede Testzeile.
- Ausgabe ist absichtlich knapp: eine Ergebniszeile, Details nur bei Fehlern. Zeitkritische Tests (`SERIAL`) laufen allein am Ende, lange werden zerlegt (`SPLIT`, z. B. `judder/story`).
- Einzelne Prüfprogramme: Glätte `smooth`, Sprünge Bild für Bild `judder` (`JCONF`), Export nach App-Wechsel `bgexport`, Mithören `listen`, Karten/Kapitel `trip`. Tests brauchen Playwright/Chromium (vorinstalliert).
- Veröffentlichen: `docs/sw.js` Cache-Version erhöhen (`cinebeat-vNN`), bauen, committen, pushen; Artefakt mit `dist/cinebeat.html` an die bestehende URL.

## Aufbau (Reihenfolge im Bündel = `build.mjs`)
| Datei | Inhalt |
| --- | --- |
| `src/js/mediaio.js` | Bild dekodieren, Video-Elemente (iOS: `primeVideo`), WebM-Fix |
| `meta.js`, `world.js` | EXIF/MP4-Metadaten, Orte, Küstenlinien |
| `audio.js` | Beats, Takte, Abschnitte (intro/verse/build/drop/chorus/break/outro), Bassdrum/Snare, `AN_VER` (erhöhen ⇒ Neuanalyse). Tempo-Oktave per Bassdrum (150 statt 75), Schnittraster `alignToKick`: Anschlag je Schlag im Signal auf ≈ 1 ms (`attackAt`), dann robuste lokale Tempo-Linie (Theil-Sen, ±8/±16 Schläge) gegen Fehlmessungen (Bass/Flächen), Strecken ohne Bassdrum und Songränder auf dieser Linie |
| `score.js` | Bildbewertung: Schärfe, Farbe, Fokus, Layout, Hash; Video-Highlights; `actionCurve`/`motionHits` (Bewegungsmomente bildgenau) |
| `plan/base.js` | Zufall, `LOOKS` (u. a. `diner`: Farbdia-Look mit `grade.retro` → Shader `retroColor`, selektive Farbtöne, Haut geschützt), `FORMATS`, `TR` (Übergänge), `sectionAt`, `pickWindow` |
| `plan/cuts.js` | Schnittraster auf Beats (`planCuts`, DP), `adjustCuts` |
| `plan/transitions.js` | Wahl der Übergänge |
| `plan/media.js` | Tempo-Kurven, `videoPlay`, Reihenfolge (`flowOrder`, `applyMoves`), Szenen (`sceneStarts`), Einstellungsgröße (`shotSize`), `imageMotion`/`fitSubject` |
| `plan/search.js` | `buildPlan`: Suche über Schnittlänge (`_scale`) und Verdichtungsstufe (`_level` 0–4) |
| `plan/chrono.js` | `layoutChrono`: Aufnahmen streng chronologisch auf die Schnitte (Split, Serie, Stapel, Videoplätze) |
| `plan/plan.js` | `planOnce`: Einstiege, Stil-Mittel, Zuteilung, Übergänge, Bewegung, Effekte, Overlays, Kapazität |
| `plan/timeline.js` | `layersAt`, `clipIndexAt` |
| `plan/us.js` | Wir-Vorrang **nur manuell** (`m.us === true`, keine Erkennung mehr): `usScore`/`isUs`, `usPolish` (≤6 Plätze, gleicher Tagesblock). Wirkung: ruhige Plätze, mehr Standzeit, Schlussbild, Karussell-Titel; „Wir-Moment“ in plan.js (bis 3 längste Wir-Bilder: ruhige Kamera, weiches Scharfwerden, `c.usMoment`). UI: „Wir markieren“ im Material (`S.usMark`, Kacheln antippen) |
| `plan/arrange.js` | Anordnung nach Tageszeit: `dayBlock`, `arrangeBlocks` (lokale Suche je Block: Wir ruhig, Totalen/starke Bilder lang, Energie zur Songstelle, keine ähnlichen Nachbarn) |
| `plan/cutter.js` | `cutterPolish`: Standzeit nach Bildinhalt (Schnitte ±1–2 Beats auf starken Zählzeiten), Höhepunkt-/Schlussbild |
| `plan/vsync.js` | Videoschnitt auf den Takt: `hitGrid` (Eins/Snare/Bassdrum/Beats), `syncVideoOffset` legt Aktionsmomente (`m.hits`) aufs Raster |
| `plan/advice.js` | Song zuerst: `idealLength`, `songAdvice` (ideale Menge per Testschnitt), `planQuality` (Bewertung), `bestCut` (beste von n Varianten, abzüglich Unstimmigkeiten), `planAudit` (harte Regeln gegen den Song: Schlag, Drop, Mindestzeiten, Länge, Reihenfolge, nichts fehlt), `hookScore` (Stopp-Wert der ersten 1,5 s), `improveHook` |
| Kino-Rollladen (`intro: 'shutter'`) | `SHUTTER`/`shutterStep` (plan/base.js, Ablauf in Zählzeiten, alles auf den Schlägen: Felder schwarzweiß 0–2,5, farbig in derselben Folge 3–5,5, drei Züge 6/7/8, kurz Schwarz, Ortsname auf Schwarz 9, Öffnen 15, Einsatz 20), Planung in plan.js (Wand-Clip `split.orient: 'wall'` mit `colorAt[]` je Feld und `shutter.moves` = 3 Züge, schnelle Bilder als `rush`-Stücke beim Öffnen, kein Farbmoment und kein Kapitel mit dem Ort bis zum Einsatz), Engine `composeWall`/`_drawShutter`, Overlay `shutter` (Schwarz + Öffnen), `plan.sfx` (nur leiser Projektor, `synthSfx`). Der Song läuft unverändert (wie mit der Instagram-Musik) |
| `plan/carousel.js` | Karussell-Beitrag (4:5): `planCarousel` (6–10 Slides: stärkstes Foto vorn, danach chronologisch; beste Fotos einzeln je Tagesblock, dazwischen 3–6-s-Clips aus Videos oder Foto-Sequenzen, Song läuft von Clip zu Clip weiter, gemeinsamer `colorMatch`), `carouselClipPlan`/`carouselPhotoPlan`; Engine: `renderPlanFrame`, `exportPlan`; UI: `runCarousel` |
| `beats.js` | Beat-Studio: eigene Beats. `BEAT_STYLES` (13 Stile: Tropical House, Synthwave, Lo-Fi, Deep House, Cinematic, Future Bass, Amapiano, Indie Pop, Disco Funk + `trend`: Drift Phonk (`cowbell`, `808slide`), Jersey Club (`vox` Formant-Chops, `808`), UK Garage, Reggaeton), `BEAT_ENERGY` chill/vibe/hype. Rezept `v: 2` (ältere `v: 1` klingen unverändert): Hook-Teaser im Intro, Reverse-Becken vor dem Drop, Build ohne Bass, Soft-Clipper + Limiter mit Vorausschau (Drop-Ziel −14/−12/−10,5 dB RMS), `beatForm` (Form je Story/Reel/Film, Drop nach `pre` Takten – Kino-Rollladen 5), `suggestBeats` (nach Look/Variante/Einstieg/Ziel), `beatRecipe` (Tempo nach Variante), `renderBeat` (komplette Synthese **und** Mischung in JS: Bit für Bit reproduzierbar, Song in wenigen Sekunden), `analyzeBeat` (Analyse + Wahrheit: Schläge, Takte, Abschnitte, Bassdrum/Snare exakt aus der Komposition), `beatSong`. Gespeichert wird nur das Rezept (`work`-Eintrag `gen`), `getSong` erzeugt neu. UI: `openBeatSheet` (Stilkarten, Vorhören, Tempo, Neue Melodie), Export mit Ton standardmäßig |
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
- Chronologie in Tagesblöcken (Standard `order: 'tageszeit'`): je Tag „Morgen & Mittag“ (bis 14 Uhr) und „Nachmittag & Abend“ (Nacht bis 4 Uhr = Vorabend, `dayBlock`); Blöcke nie vertauscht, innerhalb ordnet `arrangeBlocks` (plan/arrange.js) frei. `order: 'streng'`: Uhrzeit (Ausnahmen: Startbild, Tausch innerhalb 3 min, Beinahe-Doppel versetzt).
- Lange Filme: Reel bis 180 s (Auto bleibt 90 s, außer Menge ≠ auto), 16:9/2.39 bis 600 s (`FORMAT_RULES`). Gesamtfilm mit Länge auto = ganzer Song; Kapitelmodus: `chapTarget` nach Menge, Stufen-Suche (`_level`), Kapitelgewicht nach Aufnahmen, Chronologie je Kapitel, `mergeDupes` (nichts doppelt), Rückblick-Finale (`recap`). Test `reisefilm.mjs`.
- Menge (`settings.menge`, Wahl beim „Neu schneiden“ mit Zählung „x von y im Film“ und Gründen): `auto` = wie eingestellt, `mehr` = alle guten + jedes zweite Serienbild, Videos ×0,75, `max` = alle Serienbilder, Videos ×0,55 (`mengeOf`, `allMediaOn`, `burstKeep`, `formatRule` in director.js). Stufen-Test in allmedia.mjs, `reel-max`/`story-mehr` in stimmig.mjs.
- „Alle Aufnahmen“ (Standard): nichts weglassen; verdichten zuerst in Drop/Refrain; ruhige Teile ≥ 2 Beats. Bleibt nach dem Layout ein Foto übrig, teilt es sich mit dem zeitlich nächsten Foto einen Split-Screen.
- Videos laufen wirklich (mind. ein Takt), bester Moment auf dem Schlag; nie in Sekundenbruchteil-Einstellungen.
- Stimmigkeit: `test/stimmig.mjs` prüft `planAudit` über 3 Tempi × 3 Materialmengen × 10 Formate (Story, Reel 90 s …) – muss ohne Befund bleiben.
- Auswahl gehört dem Nutzer: Favorit (♥) = sicher im Film, „Nicht im Film verwenden“ = sicher draußen. Passt nicht alles hinein, bleibt der Aufbau (Schnitte, Split-Screens, Tempo) und Aufnahmen tauschen ihre Plätze: stärkere draußen gebliebene gegen die schwächsten im selben Tagesabschnitt (plan.js nach `layoutChrono`). UI: Material-Filter Alle/Im Film/Draußen, `swapMedia`/`pickMedia` (Tauschen in beide Richtungen), „Neu schneiden“ (`remixBtn`: `settings.recut` → andere Anordnung im Tagesabschnitt über `arrangeBlocks({ vary })`, `bestCut({ avoid })` verwirft zu ähnliche Varianten; Auswahl, Reihenfolge, Taps, Texte bleiben).
- Videos laufen wirklich: `test/vplay.mjs` misst je Darstellung (Einstellung, Wand, Split, Karussell-Clip) im Export die Quellzeit jedes Bilds und in der Vorschau das Mitlaufen in Echtzeit. Karussell-Clips füllt `carouselFill` lückenlos (Video läuft durch).
- Takt: `test/takt.mjs` prüft über 3 Tempi × 17 Einstiege/Stil-Mittel `planAudit` + `planSyncAudit` (jeder Effekt, jede Einblendung, jeder Farbmoment auf Schlag/halbem Schlag/Bassdrum/Schnitt ±25 ms; Einblendungen rastet plan.js auf den nächsten Rasterpunkt) und das Beat-Raster gegen die Wahrheit (≥ 97 % auf ±25 ms). Countdown endet auf dem Drop, Rewind-Stücke auf echten Schlägen.
- Lesezeit: Ortsnamen/Titel der Einstiege bleiben nach dem Ausschreiben stehen (`titleReadTime` in plan/base.js: Wörter, Datum, Koordinaten, km). Koordinaten/Kilometer ohne Hoch-Runter: im großen Ortstitel gestapelt (`drawGeoLine(..., stacked)`), sonst Überblenden an Ort und Stelle; shutter.mjs misst die Zeilen bildgenau.
- Kein Ort doppelt: Kapitel mit dem Namen des Einstiegstitels entfallen; kurze Storys (< 35 s) zeigen den Ort am Ende nicht noch einmal (`endTitle`). Ruckler-Prüfung auch für Einstiege (`judder/einstieg`).
- Songdynamik: Drop-Einsatz ist ein Schnitt. Design: Schwarz/Dunkelblau/Beige, schlicht, modern.
- Farbe: `colorMatch` gleicht je Szene an (`[r,g,b,gamma]`), Stimmung bleibt. Ausschnitt: `framePoint` (Drittel, Horizont, Kopf).
- Mitgetippt: `overrides.taps` (Songzeit, auf Beats gerastet) → erzwungene Schnitte in `planCuts` (Segment `tap`), Zoom-Stoß (`fx.tap`); Cutter und Zusammenlegungen in `chrono.js` lassen sie stehen; im Vorspann/Video nur Akzent.
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
