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

### `manifest.json`

- Version auf `1.0.3.0` angepasst
- Changelog aktualisiert

### `Jellyfin.Plugin.NextAiringEpisode.csproj`

- Assembly-Version auf `1.0.3.0` gesetzt
- `ExcludeAssets=runtime` fuer `Jellyfin.Model` und `Jellyfin.Controller` gesetzt, damit keine unpassenden Runtime-Assets mitgezogen werden

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
