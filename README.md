# Next Airing Episode

A Jellyfin plugin that shows the next unaired episode of a series directly on the series detail page.

## What it does

The plugin injects a small badge into the Jellyfin web UI. When a user opens a series page, the badge shows:

- season and episode number
- episode title
- relative air date
- absolute air date

The plugin only uses the local Jellyfin API. No external service is called by the JavaScript itself.

## How it works

1. The C# plugin loads the embedded `src/next-episode.js` file.
2. On startup it injects that script into Jellyfin's `index.html`.
3. The browser script watches Jellyfin SPA navigation.
4. On a series page it fetches episodes from the Jellyfin API.
5. It finds the first episode whose `PremiereDate` is in the future.
6. It renders a badge under the series metadata area.

## Requirements

- Jellyfin Server 10.10.x
- .NET 8 runtime as used by Jellyfin
- Future episode metadata available in Jellyfin

Important: Jellyfin must know about unaired or missing episodes, otherwise there is nothing for the plugin to display.

## Installation

### Jellyfin plugin repository

1. Open `Dashboard -> Plugins -> Repositories -> Add Repository`
2. Add:

```text
https://raw.githubusercontent.com/HolziDape/next-airing-episode/main/manifest.json
```

3. Open `Dashboard -> Plugins -> Catalog`
4. Install `Next Airing Episode`
5. Restart Jellyfin
6. Reload the browser

### Docker note

This plugin modifies Jellyfin web `index.html`. If Jellyfin runs in Docker and the file is not writable, mount it explicitly:

```yaml
volumes:
  - /path/to/config/index.html:/usr/share/jellyfin/web/index.html
```

## Local structure

```text
Jellyfin.Plugin.NextAiringEpisode/
  Jellyfin.Plugin.NextAiringEpisode.csproj
  Plugin.cs
  PluginConfiguration.cs
src/
  next-episode.js
manifest.json
README.md
```

## Current version

- plugin assembly version: `1.0.4.0`
- web script version: `1.0.4`

## Development notes

- `Plugin.cs` is responsible for finding and patching `index.html`
- `src/next-episode.js` contains all client-side logic
- `manifest.json` is used by the Jellyfin plugin catalog

For project analysis, fixes, and troubleshooting, see [PLUGIN_DEBUG_NOTES.md](PLUGIN_DEBUG_NOTES.md).
