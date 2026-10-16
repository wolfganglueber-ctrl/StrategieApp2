# Hexkrone

Rundenbasiertes Hex-Strategiespiel für das Handy – als Web-App (PWA), ohne Installation spielbar,
offline-fähig und zum Homescreen hinzufügbar.

## Spielprinzip

- Erobere alle Städte deiner Gegner. Einheiten ziehen und kämpfen auf einer Hex-Karte.
- Städte bringen Gold und versorgen Einheiten; Ausbau erhöht Einkommen, Versorgung und (Stufe 3) die Verteidigung.
- Kämpfe sind deterministisch – die Schadensvorschau zeigt vorher genau, was passiert.
- Gelände zählt: Wald/Hügel geben Deckung, Hügel erhöhen die Reichweite von Fernkämpfern, Kontrollzonen stoppen Bewegung.
- **Kampagne:** 50 Level in 5 Welten mit steigender Schwierigkeit und Sternebewertung.
- **Freies Spiel:** Zufallskarten mit Größe, Landschaft, 1–3 Gegnern und 5 KI-Stufen. Der Karten-Code macht Karten teilbar.

## Starten

Es gibt keinen Build-Schritt. Ein beliebiger statischer Webserver genügt:

```bash
npm start            # http://localhost:8080
```

Auf dem Handy im selben WLAN: `http://<IP-des-Rechners>:8080`.

### Einzeldatei

```bash
npm run build        # erzeugt dist/hexkrone.html (alles in einer Datei)
```

### Online stellen (GitHub Pages)

Der Workflow `.github/workflows/pages.yml` testet und veröffentlicht das Spiel bei jedem Push.
Einmalig unter *Settings → Pages → Source* „GitHub Actions“ auswählen. Danach ist das Spiel unter
`https://<benutzer>.github.io/<repo>/` erreichbar und kann per Link geteilt werden.
Im Handy-Browser „Zum Startbildschirm hinzufügen“ wählen, dann startet es wie eine App.

## Entwicklung

| Befehl | Zweck |
| --- | --- |
| `npm test` | Erzeugt alle Level und spielt 60 KI-Partien auf Regelfehler durch |
| `npm run sim -- 20 4 3 M` | 20 Partien KI-Stufe 4 gegen 3 auf mittlerer Karte (Balancing) |

### Aufbau

| Datei | Inhalt |
| --- | --- |
| `js/data.js` | Einheiten, Gelände, Städte, Schwierigkeitsstufen – hier wird balanciert |
| `js/game.js` | Regeln und Spielzustand (ohne DOM, auch in Node lauffähig) |
| `js/ai.js` | Computergegner |
| `js/mapgen.js` | Prozeduraler Kartengenerator mit fairer Startverteilung |
| `js/levels.js` | Kampagnen-Level |
| `js/render.js` | Canvas-Grafik und Animationen |
| `js/main.js` | Menüs, Bedienung, Spielablauf |

### Später: App Stores

Die Web-App lässt sich mit [Capacitor](https://capacitorjs.com/) ohne Code-Änderungen als Android-/iOS-App verpacken.
