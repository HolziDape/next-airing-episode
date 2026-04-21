# 📅 Next Airing Episode

> A Jellyfin plugin that shows **when the next unaired episode airs** — directly on the series detail page.

![Jellyfin](https://img.shields.io/badge/Jellyfin-10.10%2B-00a4dc?style=flat-square&logo=jellyfin)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)
![Version](https://img.shields.io/badge/version-1.0.0-blue?style=flat-square)

---

## ✨ What it looks like

On every series detail page a badge will appear automatically:

```
📅  Next Airing Episode
    S03E08 – The Reckoning
    In 3 Tagen  ·  Donnerstag, 24. April 2025
```

---

## 📦 Installation

### Via Jellyfin Plugin Catalog (recommended)

1. Go to **Dashboard → Plugins → Repositories → Add Repository**
2. Paste this URL:
   ```
   https://raw.githubusercontent.com/HolziDape/next-airing-episode/main/manifest.json
   ```
3. Go to **Dashboard → Plugins → Catalog**
4. Find **"Next Airing Episode"** and install it
5. Restart Jellyfin
6. Reload your browser — done! 🎉

### Docker note

If Jellyfin can't write to `index.html`, map it as a volume:

```yaml
volumes:
  - /path/to/your/config/index.html:/usr/share/jellyfin/web/index.html
```

---

## ⚙️ How it works

1. The C# plugin embeds the JavaScript file and injects it into Jellyfin's `index.html` on startup
2. The script watches for URL changes inside Jellyfin's single-page app
3. On a **Series** detail page it calls the Jellyfin API to find the first episode with a future `PremiereDate`
4. A styled badge is shown below the genre tags with season/episode number, title and air date

No external services or tracking — only your own Jellyfin server API is used.

---

## 🛠️ Requirements

| Requirement | Version |
|---|---|
| Jellyfin Server | 10.10+ |
| .NET | 8.0 (server-side, already included in Jellyfin) |

> ⚠️ Make sure **"Show missing episodes"** is enabled in your library settings so Jellyfin fetches future episode data from TVDB/TMDb.

---

## 🌍 Language / Locale

Dates are formatted in **German** (`de-DE`) by default. To change this, edit `src/next-episode.js` line ~65:

```js
d.toLocaleDateString('de-DE', { ... })
// Change to e.g. 'en-US', 'fr-FR', etc.
```

Then create a new release tag to trigger a rebuild.

---

## 🚀 Creating a new release

```bash
git tag v1.0.1
git push origin v1.0.1
```

GitHub Actions will automatically build the plugin, create a release ZIP and update the manifest checksum.

---

## 🤝 Contributing

Pull requests are welcome!

```bash
git clone https://github.com/HolziDape/next-airing-episode.git
cd next-airing-episode
```

---

## 📄 License

[MIT](LICENSE) © [HolziDape](https://github.com/HolziDape)
