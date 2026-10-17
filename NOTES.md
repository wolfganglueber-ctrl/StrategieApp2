# Stand
Spiel-Link: https://claude.ai/artifact/DSHgsarxYi3z7aj65QHMEA (wird bei /fertig aktualisiert)

Version 0.5 (Branch `claude/strategy-game-app-c4z13v`), spielbar im Browser/als PWA.
- Hexkarte mit Wiese, Wald, Hügel, Gebirge, See; 7 Kartengrößen bis 44×58 (Episch), 5 Landschaftstypen, fairer Generator mit teilbarem Karten-Code.
- Rohstoffe Nahrung/Holz/Erz aus dem Stadtgebiet; Handel 3:1 (Markt/Handelsgilde 2:1) mit Mengenregler.
- Städte mit 5 Stufen (Dorf bis Metropole), Bauplätze für 7 Gebäude, Türme mit 3 Ausbaustufen.
- 6 Einheiten (Krieger, Schütze, Reiter, Wächter, Ritter, Katapult); Fernkämpfer erschüttern Ziele; Über eigene Einheiten springen kostet keine Bewegung.
- Entwicklungsbaum mit 15 Forschungen (Militär, Wirtschaft, Verteidigung).
- KI in 5 Stufen (baut, forscht, handelt, baut Türme); optionaler Kartennebel gilt auch für die KI.
- Kampagne mit 50 Leveln in 5 Welten, Freies Spiel, Speicherstand, Rückgängig.
- Bedienung: Angriff mit einem Tipp und Schadensvorschau, Gruppenauswahl (gemeinsam ziehen/angreifen), Einheiten-Info per Mouse-over/langem Drücken im Panel, 💡-Tipp-Knopf.
- Grafik: 2,5D-Hexkacheln mit Struktur, Figuren als Miniaturen auf Sockeln, Gelände in Kacheln gepuffert.
- Tests (`npm test`) laufen grün.

# Offene Aufgaben
Konzept „weniger Einheiten, intensivere Schlachten“ (mit Wolfgang abgestimmt, Reichweiten bleiben wie sie sind):
- [ ] Zugweite begrenzen: bei voller Entwicklung Fußtruppen max. 4 Felder, Katapult 3, Reiter/Ritter 6 (auch beim Springen über eigene Einheiten).
- [ ] Katapult mit Flächenschaden (Nachbarfelder des Ziels 50 %, nur Gegner).
- [ ] Zauberer: Schutzaura (−25 % Schaden, Flächenschaden halbiert) und Heilen als Aktion; Gebäude „Turm der Weisen“, max. 1 pro Stadt; Forschungen Erleuchtung (Aura Umkreis 2) und Segen.
- [ ] Ränge 1–5 pro Einheit: Erfahrung aus Kämpfen und Ausbilden in Städten mit Kaserne; bei Rang 3 und 5 Fähigkeit wählen.
- [ ] Versorgung senken (weniger, aber wertvollere Einheiten), Flankenbonus +10 % je Nachbar am Ziel, Befehl „Wache halten“.
- [ ] Schwarzer Troll: Titan, sehr teuer, spät verfügbar (Trollhöhle), etwa 10× so stark, kann ebenfalls Ränge erreichen.
- [ ] KI für alles anpassen, mit `npm run sim` ausbalancieren.

# Nächster Schritt
Konzeptpunkte oben der Reihe nach umsetzen.
