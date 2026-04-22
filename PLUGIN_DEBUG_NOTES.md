# Plugin Debug Notes

## Ziel

Diese Datei dokumentiert, was das Plugin macht, welche Probleme im aktuellen Stand sichtbar waren und welche Aenderungen lokal vorgenommen wurden.

## Projektueberblick

Das Plugin besteht aus zwei Teilen:

1. `Jellyfin.Plugin.NextAiringEpisode/Plugin.cs`
   Der Server-Teil. Er sucht `index.html` der Jellyfin-Weboberflaeche und injiziert dort das eingebettete JavaScript.
2. `src/next-episode.js`
   Der Browser-Teil. Er erkennt Serienseiten, fragt die Jellyfin-API ab und rendert das Badge mit der naechsten Episode.

Weitere Dateien:

- `manifest.json`: Metadaten fuer den Jellyfin Plugin Catalog
- `README.md`: allgemeine Projektbeschreibung
- `PluginConfiguration.cs`: derzeit leer, noch keine konfigurierbaren Optionen

## Gefundene Probleme

### 1. Kaputte Zeichenkodierung

In `README.md`, `manifest.json`-Beschreibung und dem JavaScript waren lokal kaputte Sonderzeichen sichtbar. Das deutet auf ein Encoding-Problem oder auf gemischte UTF-8/Codepage-Ausgaben hin.

Auswirkung:

- schlechte Lesbarkeit
- unklare Darstellung in Logs und Dokumentation
- hohes Risiko fuer weitere Verwirrung beim Debugging

### 2. Versionskonflikt im Manifest

`manifest.json` zeigte `1.0.0.0`, waehrend `sourceUrl` auf ein Release `v1.0.3` mit Datei `..._1.0.3.0.zip` verwies.

Auswirkung:

- inkonsistente Plugin-Metadaten
- moegliche Verwirrung im Katalog
- erschwerte Fehlersuche bei Installationsproblemen

### 3. Injektion war nicht update-faehig

Die alte Logik in `Plugin.cs` hat nur geprueft, ob ein Marker schon existiert. Wenn ja, wurde das Script nie erneut geschrieben.

Auswirkung:

- Nutzer behalten veraltetes oder defektes JavaScript in `index.html`
- Updates des Plugins werden eventuell nicht wirksam
- manuelle Bereinigung von `index.html` kann noetig werden

### 4. Injektion war zu fragil

Es gab keine saubere Behandlung fuer den Fall, dass `</body>` nicht vorhanden ist oder der Pfad zu `index.html` anders aussieht als erwartet.

Auswirkung:

- stilles oder schwer erkennbares Fehlverhalten
- Probleme besonders bei Docker oder abweichenden Installationen

### 5. Browser-Skript war zu eng an lokale Speicherung gekoppelt

Das Skript hat Auth-Daten nur aus `localStorage` gelesen.

Auswirkung:

- moegliche Inkompatibilitaet mit Jellyfin-Clients oder kuenftigen UI-Aenderungen
- unnoetige Fehlerquelle, obwohl `window.ApiClient` oft direkt verfuegbar ist

### 6. SPA-Navigation war nicht robust genug

Es wurde nur auf DOM-Mutationen reagiert.

Auswirkung:

- Badge kann bei Navigation innerhalb der Jellyfin SPA fehlen oder veraltet bleiben
- Race Conditions bei schnellem Seitenwechsel

### 7. HTML-Inhalt wurde direkt zusammengebaut

Episodentitel wurden in `innerHTML` eingesetzt.

Auswirkung:

- unnoetiges XSS-Risiko, selbst wenn die Daten aus Jellyfin kommen
- schlechter wartbar als echte DOM-Knoten

## Durchgefuehrte Aenderungen

### `Plugin.cs`

- Managed block mit Start-/End-Markern eingefuehrt
- vorhandene Plugin-Injektion wird jetzt ersetzt statt nur erkannt
- UTF-8 Lesen/Schreiben explizit gesetzt
- mehr Suchpfade fuer `index.html`
- Warnung falls `</body>` fehlt

### `src/next-episode.js`

- Version auf `1.0.3` gesetzt
- Zugriff auf `window.ApiClient` als bevorzugte Quelle fuer Token, User und Serveradresse
- Fallback auf `localStorage` beibehalten
- URL-Erkennung ueber `URLSearchParams`
- Navigationserkennung erweitert:
  - `MutationObserver`
  - `history.pushState`
  - `history.replaceState`
  - `popstate`
  - `hashchange`
- Schutz gegen Race Conditions bei mehreren parallelen Abfragen
- Badge-Inhalt ueber DOM-Elemente statt unsicherem HTML-Aufbau
- ASCII-Only Texte fuer stabilere Darstellung in problematischen Shells
- Episodenseiten erweitert:
  - neue Sektion `Kommende Folgen`
  - Karten mit Preview-Bild, Episodenkennung, Releasedatum und Kurzbeschreibung
  - Positionierung nach der Episodenliste bzw. im Detailbereich als Fallback
- Serienansicht erweitert:
  - kommende Folgen werden jetzt auch auf der normalen Serienseite unterhalb des Episodenbereichs angezeigt
- spaeterer Umbau fuer Web/Desktop:
  - keine eigene Kartenreihe mehr
  - stattdessen wird ein nativer sichtbarer Episodeintrag als Template geklont
  - kommende Folgen werden direkt nach dem letzten sichtbaren nativen Eintrag eingefuegt
  - bei nicht erkannter nativer Episodenliste wird nichts injiziert statt eine falsche Zusatz-UI zu rendern

### `manifest.json`

- Version auf `1.0.3.0` angepasst
- Changelog aktualisiert

### `Jellyfin.Plugin.NextAiringEpisode.csproj`

- Assembly-Version auf `1.0.3.0` gesetzt
- `ExcludeAssets=runtime` fuer `Jellyfin.Model` und `Jellyfin.Controller` gesetzt, damit keine unpassenden Runtime-Assets mitgezogen werden
- aktueller lokaler Stand fuer den nativen Listen-Ansatz: `1.0.8.0`
- spaeterer Fix fuer Jellyfin Plugin-Ansicht:
  - `GenerateAssemblyInfo` wieder aktiviert
  - explizite `AssemblyVersion`, `FileVersion` und `InformationalVersion` gesetzt
  - Ziel: Jellyfin soll nicht mehr `0.0.0.0` fuer das installierte Plugin anzeigen
- weiterer DOM-Fix fuer Serien-/Staffelansicht:
  - `#childrenCollapsible` / `#childrenContent` werden als primaere Quelle fuer Episodenlisten priorisiert
  - sichtbare Cast-/People-Reihen werden bei der Template-Wahl stark abgewertet
  - `listItem-largeImage` und echte Children-Bereiche werden hoeher gewichtet als allgemeine Kartencontainer
- nach echter DOM-Ausgabe aus dem Browser weiter verschaerft:
  - sichtbarer Bereich `#listChildrenCollapsible` / `#childrenContent` wird direkt bevorzugt
  - nur `listItem` / `listItem-largeImage` werden als eigentliche Episodenkandidaten betrachtet
  - Item-Ids koennen jetzt auch aus verschachtelten Action-/Link-Elementen gelesen werden

### `README.md`

- neu geschrieben
- klare Installations- und Strukturuebersicht
- Verweis auf diese Debug-Datei hinzugefuegt

## Offene Risiken

### 1. Build lokal nicht verifiziert

Im aktuellen Arbeitsumfeld ist kein .NET SDK installiert. `dotnet build` konnte deshalb nicht ausgefuehrt werden.

Konsequenz:

- Code wurde statisch ueberprueft
- ein echter Compile-Test steht noch aus

### 2. Reale Jellyfin-Zielpfade koennen weiterhin abweichen

Es wurden mehr Pfadkandidaten hinzugefuegt, aber nicht jede Plattform-/Installationsvariante kann ohne Laufzeittest garantiert werden.

### 3. Direkte Modifikation von `index.html` bleibt grundsaetzlich fragil

Das Plugin arbeitet weiterhin ueber HTML-Injektion. Das ist praktisch, aber bei Jellyfin-Web-Updates grundsaetzlich anfaellig.

## Empfohlene naechste Schritte

1. Plugin auf einem System mit .NET SDK bauen
2. In einer echten Jellyfin-Instanz testen
3. Server-Log nach `[Next Airing Episode]` filtern
4. Browser-Konsole auf der Serienseite pruefen
5. Verifizieren, dass unaired episodes in Jellyfin-Metadaten vorhanden sind

## Wunsch aus der UI-Anpassung

Der neue Wunsch war, dass auf einer Episodenseite unter der aktuellen bzw. letzten sichtbaren Folge weitere kommende Folgen erscheinen. Dafuer wurde die Client-Logik erweitert, damit Jellyfin auf Episodenseiten mehrere kuenftige Episoden als Vorschau anzeigt statt nur eines einzelnen Badges auf Serienseiten.

## Aktueller Stand nach Sichtung der Screenshots

Nach dem Test mit den Screenshots wurde klar:

- der gewuenschte Zielbereich ist nicht nur eine reine Episodenseite
- der relevante Screen ist die normale Serienansicht mit vorhandener Episodenliste
- gewuenscht ist, dass die Anzeige optisch direkt unter der vorhandenen Liste weiterlaeuft
- idealerweise soll es wirken wie weitere Jellyfin-Episodenkarten
- zusaetzlich sollen Bild und Releasedatum sichtbar sein

## Was bereits umgesetzt wurde

### Version 1.0.5

Es wurde eine neue UI fuer kommende Folgen eingefuehrt:

- Karten mit Bild, Titel, Episodenkennung, Releasedatum und Kurzbeschreibung
- Anzeige auf Episodenseiten
- separate Sektion `Kommende Folgen`

### Version 1.0.6

Nach dem naechsten Screenshot wurde klar, dass die bisherige Logik auf der falschen Seite greift. Deshalb wurde nachgebessert:

- dieselbe Kartenlogik wird jetzt auch auf Serienseiten aufgerufen
- die Vorschau soll unterhalb des Episodenbereichs erscheinen
- daraus wurde Release `1.0.6.0`

## Warum das Ergebnis noch nicht dem Wunsch entspricht

Der entscheidende Unterschied ist:

- bisher wurde eine eigene Zusatzsektion erzeugt
- gewuenscht ist aber keine separate Sektion
- gewuenscht ist eine Fortsetzung der vorhandenen Jellyfin-Episodenliste selbst

Das heisst technisch:

- aktuell wird neuer Inhalt neben oder unter den vorhandenen Jellyfin-Bloecken eingefuegt
- du willst stattdessen, dass die bestehenden Episodenelemente visuell und strukturell weitergefuehrt werden
- also zum Beispiel direkt nach Folge 4 weitere Eintraege fuer kommende Folgen

## Wichtige Klarstellung

Ich habe den Screenshot bisher nicht pixelgenau nachgebaut.

Ich habe stattdessen zuerst eine pragmatische Loesung umgesetzt:

1. kommende Folgen als eigene Karten rendern
2. diese auf Episodenseiten anzeigen
3. danach auch auf Serienseiten anzeigen

Das ist funktional verwandt, aber nicht identisch mit dem eigentlichen Wunsch.

## Tatsaechlicher Zielzustand

Der eigentliche Wunsch ist nach heutigem Stand:

1. Jellyfin-Serienseite mit vorhandener Episodenliste offen
2. unter der letzten bereits sichtbaren Folge sollen weitere kommende Folgen erscheinen
3. diese sollen moeglichst wie native Jellyfin-Episodenkarten aussehen
4. sie sollen ein Vorschaubild haben, wenn Jellyfin eines liefert
5. das Releasedatum soll direkt sichtbar sein

## Technischer naechster Schritt

Die naechste sinnvolle Umsetzung ist nicht:

- weitere separate Sektionen hinzufuegen

Sondern:

- die vorhandene Jellyfin-Episodenliste direkt erweitern
- oder bestehende Episodenkarten-Struktur im selben Container nachbauen

Das bedeutet wahrscheinlich:

- gezielt den DOM-Container der Episodenliste finden
- aus kommenden Episoden Karten erzeugen, die sich an Jellyfins vorhandener Listenstruktur orientieren
- diese direkt nach den vorhandenen Folgen einfuegen

## Versionsstand

Bis jetzt wurden diese Versionen erzeugt:

- `1.0.4.0`: Stabilitaets- und Injektionsfixes
- `1.0.5.0`: kommende Folgen als eigene Karten fuer Episodenseiten
- `1.0.6.0`: dieselbe Kartenlogik auch fuer Serienseiten

## Offene Bewertung

Die aktuelle Implementierung ist noch nicht zielgenau genug fuer den gewuenschten Look.

Fachlich funktioniert die Richtung:

- kommende Folgen laden
- Bild und Datum anzeigen

Aber die Einbettung in die Jellyfin-Oberflaeche ist noch nicht so, wie gewuenscht.

## Neuer Zielzustand nach den letzten Referenzbildern

Die neuen Screenshots praezisieren den Wunsch deutlich:

- keine separate Vorschau-Sektion
- keine eigenstaendige Kartenleiste ausserhalb der Episodenliste
- stattdessen soll die bestehende Staffellogik weitergefuehrt werden
- kommende Folgen der ganzen Staffel sollen sichtbar sein
- diese sollen in derselben Inhaltslogik wie die vorhandenen Episoden auftauchen
- zusaetzlich sollen Bild und Datum sichtbar sein

Praktisch bedeutet das:

- wenn in Jellyfin in einer Staffel bereits Episode 1 bis 4 sichtbar sind
- und in den Metadaten Episode 5 bis 13 schon als zukuenftig vorhanden sind
- dann sollen diese kommenden Episoden ebenfalls im selben Staffelkontext dargestellt werden

## Was jetzt als Naechstes gemacht werden soll

Der naechste technische Schritt ist nicht mehr:

- eine separate Zusatzsektion unter die Seite zu setzen

Sondern:

- die vorhandene Staffel-/Episodenansicht direkt zu erweitern

Geplante Umsetzung:

1. den Container der vorhandenen Episodenansicht identifizieren
2. erkennen, welche Staffel gerade sichtbar ist
3. alle Episoden dieser Staffel aus Jellyfin laden
4. kommende Episoden derselben Staffel filtern
5. fuer diese Eintraege UI-Elemente erzeugen, die im selben visuellen Fluss erscheinen
6. dabei Datum immer sichtbar machen
7. Bild anzeigen, wenn Jellyfin zu der Folge ein verwertbares Bild liefert

## Wichtige technische Konsequenz

Das ist eine andere Umsetzung als bisher:

- bisher wurden kommende Episoden als eigener Block gerendert
- jetzt soll die bestehende Listen-/Staffelansicht selbst erweitert oder nachgebaut werden

Das ist aufwaendiger, aber deutlich naeher an dem von den Screenshots gezeigten Wunsch.

## Gestartete Umsetzung fuer den neuen Zielzustand

Der aktuelle Umbau geht jetzt in genau diese Richtung:

- die bisherige separate Kartenleiste wird ersetzt
- kommende Folgen werden nicht mehr als losgeloester Extra-Block gedacht
- stattdessen werden sie an den vorhandenen Episodenbereich angehaengt

Aktueller technischer Ansatz:

1. sichtbare Staffel ueber die Seitenstruktur erkennen
2. Episoden der Serie laden
3. kommende Episoden derselben Staffel filtern
4. diese als fortlaufende Eintraege an den Episodencontainer anhaengen
5. pro Eintrag Bild, Episodencode, Titel und Datum anzeigen

Damit ist die Richtung jetzt naeher an:

- "Staffel geht weiter"

Und weiter weg von:

- "separate Vorschau-Sektion"

## Schnellcheck bei Problemen

Wenn das Badge nicht erscheint, dann zuerst:

1. pruefen, ob das Plugin gestartet ist
2. pruefen, ob `index.html` beschrieben werden konnte
3. pruefen, ob das Script in `index.html` wirklich vorhanden ist
4. pruefen, ob Jellyfin fuer die Serie zukuenftige Episoden kennt
5. Browser-Konsole auf Fehler oder fehlende API-Antworten pruefen

## Build-Hinweis

Der lokale Befehl schlug fehl, weil kein SDK installiert ist:

```text
dotnet build Jellyfin.Plugin.NextAiringEpisode\Jellyfin.Plugin.NextAiringEpisode.csproj
```

Fehlerbild:

```text
No .NET SDKs were found.
```
