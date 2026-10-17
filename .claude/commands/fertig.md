---
description: Sitzung beenden – NOTES.md aktualisieren, committen und pushen
---
Beende die Sitzung sauber:
1. Führe `npm test` aus, falls seit dem letzten Commit Code geändert wurde, und melde das Ergebnis.
2. Aktualisiere NOTES.md anhand des aktuellen Codes und dieser Sitzung:
   - „Stand“: was jetzt funktioniert (kurz, Stichpunkte, Versionsnummer aus package.json).
   - „Offene Aufgaben“: meine Wünsche aus dieser Sitzung, die noch nicht erledigt sind, plus bekannte Probleme. Bereits erledigte Punkte entfernen.
   - „Nächster Schritt“: der sinnvollste nächste Schritt in einem Satz.
3. Committe alle Änderungen mit einer aussagekräftigen deutschen Commit-Nachricht und pushe auf den aktuellen Branch.
4. Aktualisiere den Spiel-Link (steht in CLAUDE.md): `npm run build:artifact`, dann mit dem Artifact-Tool
   zuerst `action: "read"` mit dieser `url`, danach `dist/hexkrone-artifact.html` mit derselben `url` veröffentlichen.
   Niemals ein neues Artefakt anlegen. Falls das nicht klappt, sag es mir deutlich.
5. Sag mir in zwei, drei Sätzen, was gesichert wurde, nenne den Spiel-Link und dass ich jetzt eine neue Sitzung starten kann. $ARGUMENTS
