# Hexkrone

Rundenbasiertes Hex-Strategiespiel für das Handy – als Web-App (PWA), ohne Installation spielbar,
offline-fähig und zum Homescreen hinzufügbar.

## Spielprinzip

- Erobere alle Städte deiner Gegner. Einheiten ziehen und kämpfen auf einer Hex-Karte.
- **Rohstoffe:** Jede Stadt besitzt das Gebiet um sich. Wiesen und Seen liefern Nahrung, Wälder Holz,
  Hügel und Gebirge Erz. Fehlt etwas, kann man jederzeit 3:1 handeln (mit Markt 2:1).
- **Aufbau:** Städte wachsen in 5 Stufen (Dorf → Metropole). Jede Stufe bringt einen Bauplatz für Gebäude:
  Bauernhof, Holzfäller, Mine, Kaserne, Werkstatt, Mauer, Markt. Minen lohnen sich bei Hügeln/Bergen, Holzfäller bei Wäldern.
- **Kampf:** Fernkämpfer erschüttern ihr Ziel (halbe Verteidigung, kein Gegenschlag) – danach schlagen Nahkämpfer zu.
  Über jedem Ziel steht der vorhergesagte Schaden, ein Tipp greift an.
- Beliebig viele Rekrutierungen pro Runde; neue Einheiten erscheinen im Stadtgebiet, mit Kaserne sofort einsatzbereit.
- **Türme** auf Feldern im Stadtgebiet verteidigen dein Reich (3 Ausbaustufen).
- **Forschung:** Entwicklungsbaum mit 15 Verbesserungen in Militär, Wirtschaft und Verteidigung
  (z. B. Reichweite für Schützen, Bewegung und Reichweite für Katapulte, bessere Minen).
- **Kartennebel** (optional): Man sieht nur, was eigene Einheiten und Städte sehen – die KI ebenso.
- **Gruppen:** Mehrere Einheiten auswählen und gemeinsam bewegen oder angreifen lassen (Fernkämpfer zuerst).
- Ein **Ratgeber** (💡) schlägt auf Knopfdruck den nächsten sinnvollen Schritt vor.
- **Kampagne:** 50 Level in 5 Welten, Karten wachsen von 8×10 bis zur epischen Karte mit 44×58 Feldern.
- **Freies Spiel:** Zufallskarten in 7 Größen (bis 44×58), 5 Landschaften, 1–3 Gegner und 5 KI-Stufen; Karten-Code zum Teilen.

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

### Online stellen (Cloudflare Pages, kostenlos, Repo bleibt privat)

1. Auf https://dash.cloudflare.com kostenlos registrieren.
2. *Workers & Pages → Erstellen → Pages → Mit Git verbinden* und GitHub-Zugriff nur für dieses Repo erlauben.
3. Branch wählen, Framework „Keine“, Build-Befehl leer lassen, Ausgabeverzeichnis `/`.
4. Speichern und bereitstellen: Das Spiel ist dann unter `https://<projekt>.pages.dev` erreichbar und
   wird bei jedem Push automatisch aktualisiert. Im Handy-Browser „Zum Startbildschirm hinzufügen“.

## Entwicklung

| Befehl | Zweck |
| --- | --- |
| `npm test` | Erzeugt alle Level und spielt 60 KI-Partien auf Regelfehler durch (läuft auch automatisch auf GitHub) |
| `npm run sim -- 20 4 3 M` | 20 Partien KI-Stufe 4 gegen 3 auf mittlerer Karte (Balancing) |

### Aufbau

| Datei | Inhalt |
| --- | --- |
| `js/data.js` | Einheiten, Gelände, Städte, Schwierigkeitsstufen – hier wird balanciert |
| `js/game.js` | Regeln und Spielzustand (ohne DOM, auch in Node lauffähig) |
| `js/ai.js` | Computergegner |
| `js/mapgen.js` | Prozeduraler Kartengenerator mit fairer Startverteilung |
| `js/levels.js` | Kampagnen-Level |
| `js/render.js` | Canvas-Grafik, Kamera und Animationen |
| `js/art.js` | Zeichnungen von Gelände, Städten und Figuren |
| `js/main.js` | Menüs, Bedienung, Spielablauf |

### Später: App Stores

Die Web-App lässt sich mit [Capacitor](https://capacitorjs.com/) ohne Code-Änderungen als Android-/iOS-App verpacken.
