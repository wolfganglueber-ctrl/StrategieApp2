# Stand
Spiel-Link: https://claude.ai/artifact/DSHgsarxYi3z7aj65QHMEA (wird bei /fertig aktualisiert)

Version 0.19 (Branch `ccr-8aa711c1-0bv1jz`), spielbar im Browser/als PWA.
- Jede Stadt hat 2 Felder Gebiet; Dörfer mit Abstand ≥ 4 (Episch ~111 statt 193 Städte), Gebiete bilden zusammenhängende Reiche. Wald kostet 2 Bewegung (erster Schritt immer möglich).
- Einheiten kosten das Doppelte (UNIT_PRICE in data.js; KI-Wert bleibt auf alter Basis), Ausbilden 20 % je Rang.
- Steinwälle (6 Holz, 14 Erz): bis 6 pro Stadt im Umkreis von 2 Feldern (nicht auf fremdem Gebiet), 50 Leben, blockieren den Weg, verbinden sich optisch zur Mauer; KI setzt sie bei bedrohten Städten.
- Hexkarte mit Wiese, Wald, Hügel, Gebirge, See; 7 Kartengrößen bis 44×58 (Episch), 5 Landschaftstypen, fairer Generator mit teilbarem Karten-Code.
- Rohstoffe Nahrung/Holz/Erz aus dem Stadtgebiet; Handeln nur mit Markt (3:1), Handelsgilde (teuer) 2:1, Mengenregler.
- Städte mit 5 Stufen (Dorf bis Metropole), Bauplätze für 9 Gebäude, Türme mit 3 Ausbaustufen.
- Basilisk (neu, 0.19): Basiliskennest ab Stadtstufe 3, max. 2 pro Reich, 2 Versorgung, 28 Leben, Angriff 3, Reichweite 2. Getroffene Ziele versteinern (`u.stone` → beim nächsten eigenen Zug `stoneNow`, Zug ausgesetzt, kein Gegenschlag, graue Steinfigur); Troll, Drache, Türme, Wälle immun. KI baut Nest/Basilisk ab ~5 Einheiten (in kurzen Partien selten).
- Grafik 0.19: Figuren mit Schlagschatten und Licht von links oben (im Sprite-Puffer gebacken), Bäume/Berge mit langen Schlagschatten, Gesteinsschichten, Geröll, Grasbüschel auf Hügeln, Städte mit weichem Schatten.
- 10 Einheiten: Krieger, Schütze, Reiter, Wächter, Ritter, Katapult (Flächenschaden 50 % auf Nachbarn), Zauberer (Schutzaura −25 %, Heilen bis 3 Felder weit), Schwarzer Troll (Titan, Trollhöhle ab Stufe 4, 3 Versorgung, bis 5 pro Reich), Drache als Endgegner (Drachenhöhle in jeder Stadt baubar, einmal pro Reich, kleiner Drache auf dem Stadtturm zeigt sie an; ein Drache; kostet 1000/600/1400, 300 Leben, Angriff 12, Verteidigung 10, Bewegung 5, heilt 6/Runde, Feueratem 40 %, bei Rang 3 und 5 je drei Fähigkeiten; KI kauft ihn nur, wenn sie ihn sich gerade leisten kann; fliegt über Berge/Seen/eigene Einheiten, nicht über Gegner; Feueratem 30 % Flächenschaden; Schützen und Türme +60 %).
- Zugweite gedeckelt: Fußtruppen 4, Katapult 3, Reiter/Ritter 6 (inkl. Sprünge über eigene Einheiten).
- Ränge 1–5 (Erfahrung oder Ausbilden mit Kaserne), Fähigkeiten bei Rang 3 und 5 (je 2 zur Wahl), Flankenbonus +10 % je Nachbar, „Wache halten“.
- Versorgung: Dorf 2, Siedlung 2, Stadt 3, Burgstadt 4, Metropole 5 (Ø ~9 statt ~12 Einheiten je Spieler auf Groß).
- Entwicklungsbaum mit 17 Forschungen (neu: Erleuchtung, Segen).
- KI in 5 Stufen (baut, forscht, handelt, Türme, Zauberer heilen, Ausbilden, Fähigkeiten, spart auf Troll); Stufe 4 in 0.19 entschärft (mehr Rauschen/Fehler, weniger Ausbau): 4 vs 3 ≈ 13:11 (L), 10:6 (M); 5 vs 4: 13:3.
- Kampagne mit 50 Leveln in 5 Welten, Freies Spiel, Speicherstand (Version 5), Rückgängig.
- Verbände: bis 3 gleiche Einheiten (Krieger, Schütze, Reiter, Wächter, Ritter, Katapult) per „🔗 Verband bilden“ + Rückfrage zusammenlegen (verbraucht den Zug beider), Leben addiert, Schaden × Mitglieder, Flächenwaffen +25 % je weiterem Mitglied, „✂ Aufteilen“; Anzeige: mehrere Figuren + „×n“. KI legt nur weit hinter der Front zusammen.
- Türme schießen am Zugende automatisch, wenn sie noch nicht gefeuert haben.
- Eroberung: Türme und Steinwälle im Gebiet der Stadt wechseln zum Eroberer. Abreißen: Gebäude (🗑 im Stadtmenü) und eigene Türme/Wälle, mit Rückfrage, halbe Kosten zurück. Einheiten „🗑 Entlassen“ (Rückfrage, gibt Versorgung frei, keine Rückerstattung).
- Stadtmenü: Kaufen/Bauen/Ausbauen sofort ohne Warten auf Animation (quickAct), Scroll-Position von Panel und Gebäudeliste bleibt erhalten.
- Zugstatus: gelber Ring = ganzer Zug offen, orange gestrichelt = gezogen, Angriff noch möglich, fertige Einheiten stark ausgegraut.
- Bedienung: Fähigkeiten als Abzeichen an der Figur, wählbare Fähigkeit = goldener Schimmer (keine Ausrufezeichen mehr), kein Einheiten-Tooltip solange eine Einheit gewählt ist; Angriff mit einem Tipp und Schadensvorschau, Gruppen direkt aus dem Einheiten-Panel: „👥 Alle in der Nähe“ oder „👥 Alle <Typ>“ (nur gleiche Einheiten), danach gemeinsam ziehen/angreifen (Gruppe bleibt gewählt bis „Auflösen“ oder Tipp auf ein leeres Feld; alle greifen nacheinander ein Ziel an und rücken dafür heran, bis jeder dran war oder das Ziel fällt; Heranrücken abschaltbar), Einheiten-Info, 💡-Tipp-Knopf, Heilziele grün, Fähigkeitswahl im Panel.
- Städte (js/art.js `drawCity`): dicke umlaufende Stadtmauer (nur wenn gebaut) mit Wehrgang, Zinnen, Wehrtürmen und Torhaus (hinterer Teil hinter, vorderer vor den Häusern); Fahnen, Banner, Kirche ab Stufe 3; Stufe 5 mit 5/5 Gebäuden wird zur Burg (Bergfried, Ecktürmchen, große Fahne, Burgmauer). Vorschau: `.preview/cities.html` (nicht eingecheckt) über `npm start` öffnen.
- Figuren neu gezeichnet (js/art.js), Troll und Türme (3 Stufen) besonders detailliert: Stahlglanz, Kettenhemd, Wappenröcke/Umhänge in Spielerfarbe, Gesichter, Pferde mit Schabracke, Drache. Vorschau: `.preview/units.html`.
- Geräusche (js/audio.js): alles per Web Audio erzeugt, keine Dateien, offline. Effekte für Bewegung (Schritte, Hufe, Räder, Troll, Drachenflügel), Kampf (Klingen, Bogen per Saitenmodell, Katapult mit Holzknarzen und Geröll-Einschlag, Feueratem, Fall), Heilen, Bauen, Rekrutieren, Eroberung, Ränge, Sieg/Niederlage; Umgebung je nach Kartenausschnitt (Meer, Bach/See, Wind, Vögel, Stadt mit Schmied; keine Glocke mehr). Einstellbar: Geräusche An/Aus, Umgebung Aus/Leise/Normal/Laut.
- Tests (`npm test`) laufen grün; `node tools/stats.mjs [spiele] [stufe] [größe]` zählt Einheiten und Fähigkeiten in KI-Partien.

# Offene Aufgaben
- Wolfgang testet Version 0.19 (Basilisk, Schatten/3D-Grafik, schwächere Stufe 4, Einheiten entlassen, Türme wechseln bei Eroberung, Abreißen, schnelles Kaufen, Scroll-Position im Stadtmenü, Gruppenknöpfe „Alle in der Nähe“/„Alle <Typ>“, Verbände, automatisches Turmfeuer, Zugstatus-Ringe, Drache auf dem Turm, Gruppe bleibt gewählt, Gruppenangriff, Drache als Endgegner, Heilen auf 3 Felder, doppelte Einheitenpreise, stärkerer Drache, Städte mit 2 Feldern Gebiet, Steinwälle, Wald, neuer Troll und Türme, Drache, neue Figuren, dicke Mauer, natürlichere Geräusche, Markt-Pflicht, Burg-Grafik, Zauberer, Ränge, Troll, Flächenschaden, Zugweite, Geräusche) und gibt Rückmeldung, v. a. zur Lautstärke und zum Klang auf dem Handy.
- Balancing beobachten: Troll (70 Leben, Angriff 7, Verteidigung 5) ist in Städten mit Mauer kaum zu knacken; ggf. abschwächen.
- KI nutzt Heilen noch selten (~2–4 Mal pro Partie); Gewichtung ggf. erhöhen.
- Schadensvorschau zeigt den Flächenschaden des Katapults noch nicht auf den Nachbarfeldern.

# Nächster Schritt
Rückmeldung zu Version 0.19 einholen (ist Stufe 4 jetzt schlagbar?); danach ggf. Marschbefehl (automatisches Ziehen über mehrere Runden), danach Balancing (Troll, Heilen) und Flächenschaden in der Vorschau.
