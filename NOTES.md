# Stand
Spiel-Link: https://claude.ai/artifact/DSHgsarxYi3z7aj65QHMEA (wird bei /fertig aktualisiert)

Version 0.7 (Branch `ccr-8aa711c1-0bv1jz`), spielbar im Browser/als PWA.
- Hexkarte mit Wiese, Wald, Hügel, Gebirge, See; 7 Kartengrößen bis 44×58 (Episch), 5 Landschaftstypen, fairer Generator mit teilbarem Karten-Code.
- Rohstoffe Nahrung/Holz/Erz aus dem Stadtgebiet; Handel 3:1 (Markt/Handelsgilde 2:1) mit Mengenregler.
- Städte mit 5 Stufen (Dorf bis Metropole), Bauplätze für 9 Gebäude, Türme mit 3 Ausbaustufen.
- 8 Einheiten: Krieger, Schütze, Reiter, Wächter, Ritter, Katapult (Flächenschaden 50 % auf Nachbarn), Zauberer (Schutzaura −25 %, Heilen), Schwarzer Troll (Titan, Trollhöhle ab Stufe 4, 3 Versorgung, einer pro Reich).
- Zugweite gedeckelt: Fußtruppen 4, Katapult 3, Reiter/Ritter 6 (inkl. Sprünge über eigene Einheiten).
- Ränge 1–5 (Erfahrung oder Ausbilden mit Kaserne), Fähigkeiten bei Rang 3 und 5 (je 2 zur Wahl), Flankenbonus +10 % je Nachbar, „Wache halten“.
- Versorgung knapper: Dorf 1, Siedlung 2, Stadt 2, Burgstadt 3, Metropole 4 (Ø ~9 statt ~12 Einheiten je Spieler auf Groß).
- Entwicklungsbaum mit 17 Forschungen (neu: Erleuchtung, Segen).
- KI in 5 Stufen (baut, forscht, handelt, Türme, Zauberer heilen, Ausbilden, Fähigkeiten, spart auf Troll); Stufen sauber gestaffelt (4 vs 3: 16:4, 5 vs 4: 15:5).
- Kampagne mit 50 Leveln in 5 Welten, Freies Spiel, Speicherstand (Version 5), Rückgängig.
- Bedienung: Angriff mit einem Tipp und Schadensvorschau, Gruppen, Einheiten-Info, 💡-Tipp-Knopf, Heilziele grün, Fähigkeitswahl im Panel.
- Geräusche (js/audio.js): alles per Web Audio erzeugt, keine Dateien, offline. Effekte für Bewegung (Schritte, Hufe, Räder, Troll), Kampf (Klingen, Bogen, Katapult, Fall), Heilen, Bauen, Rekrutieren, Eroberung, Ränge, Sieg/Niederlage; Umgebung je nach Kartenausschnitt (Meer, Bach/See, Wind, Vögel, Stadt mit Schmied und Glocke). Einstellbar: Geräusche An/Aus, Umgebung Aus/Leise/Normal/Laut.
- Tests (`npm test`) laufen grün; `node tools/stats.mjs [spiele] [stufe] [größe]` zählt Einheiten und Fähigkeiten in KI-Partien.

# Offene Aufgaben
- Wolfgang testet Version 0.7 (Zauberer, Ränge, Troll, Flächenschaden, Zugweite, Geräusche) und gibt Rückmeldung, v. a. zur Lautstärke und zum Klang auf dem Handy.
- Balancing beobachten: Troll (70 Leben, Angriff 7, Verteidigung 5) ist in Städten mit Mauer kaum zu knacken; ggf. abschwächen.
- KI nutzt Heilen noch selten (~2–4 Mal pro Partie); Gewichtung ggf. erhöhen.
- Schadensvorschau zeigt den Flächenschaden des Katapults noch nicht auf den Nachbarfeldern.

# Nächster Schritt
Rückmeldung zu Version 0.7 einholen, danach Balancing (Troll, Heilen) und Flächenschaden in der Vorschau.
