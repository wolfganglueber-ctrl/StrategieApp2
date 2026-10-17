# Projekt
Rundenbasiertes 2D-Strategiespiel (Mittelalter) mit schöner Textur-Grafik. Hexfelder mit verschiedenen Rohstoffen. Über einen Entwicklungsbaum wird eine bessere kleine Armee aufgebaut, Ziel ist die vollständige Eroberung gegnerischer Städte. Gegner sind KI-Spieler mit gut einstellbarer Stärke.

# Tech-Stack und Befehle
- Reines HTML5/CSS/JavaScript (ES-Module), Grafik mit Canvas 2D, kein Framework, keine Abhängigkeiten, kein Build-Schritt nötig.
- Web-App (PWA): `manifest.webmanifest`, Service Worker `sw.js` (Cache-Version bei Änderungen erhöhen), Speicherstand in `localStorage`.
- Node.js 22 nur für Tests, Simulation und Einzeldatei-Build.

| Befehl | Zweck |
| --- | --- |
| `npm start` | Statischer Server auf http://localhost:8080 (alternativ `python3 -m http.server 8080`) |
| `npm test` | `node tools/test.mjs`: erzeugt alle 50 Level und spielt ~90 KI-Partien auf Regelfehler durch (dauert 1–3 Min.) |
| `npm run sim -- 20 4 3 L` | KI-Balancing: 20 Partien Stufe 4 gegen 3 auf Kartengröße L |
| `npm run build` | `dist/hexkrone.html`: alles in einer Datei (wird nicht eingecheckt) |

CI: `.github/workflows/test.yml` führt bei jedem Push `node tools/test.mjs` aus.

Aufbau:
- `js/data.js` Einheiten, Gelände, Gebäude, Forschung, Kartengrößen (Balancing)
- `js/game.js` Regeln und Spielzustand (ohne DOM, in Node lauffähig)
- `js/ai.js` Computergegner (Stufen 1–5)
- `js/mapgen.js` Kartengenerator, `js/levels.js` Kampagne
- `js/render.js` Kamera, Kachel-Puffer, Effekte; `js/art.js` Zeichnungen (Gelände, Städte, Figuren)
- `js/main.js` Menüs, Bedienung, Spielablauf; `js/input.js` Touch/Maus
- `tools/` Tests, Simulation, Einzeldatei-Build

# Regeln
- Kleine, abgeschlossene Änderungen, nach jeder Änderung testen.
- Bestehenden Code-Stil beibehalten.
- Die Entwicklung läuft vom Handy aus: Das Repo ist die einzige Wahrheit, nichts bleibt nur lokal.
- Lies zu Sitzungsbeginn NOTES.md. Aktualisiere NOTES.md vor Sitzungsende, committe und pushe.
