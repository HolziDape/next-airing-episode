using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.NextAiringEpisode
{
    /// <summary>
    /// Next Airing Episode plugin for Jellyfin.
    /// Injects a JavaScript badge into the web UI that shows
    /// when the next unaired episode of a series will air.
    /// </summary>
    public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
    {
        private readonly ILogger<Plugin> _logger;

        public Plugin(
            IApplicationPaths applicationPaths,
            IXmlSerializer xmlSerializer,
            ILogger<Plugin> logger)
            : base(applicationPaths, xmlSerializer)
        {
            _logger = logger;
            Instance = this;
            InjectScript(applicationPaths);
        }

        /// <inheritdoc />
        public override string Name => "Next Airing Episode";

        /// <inheritdoc />
        public override Guid Id => Guid.Parse("a1b2c3d4-e5f6-7890-abcd-ef1234567890");

        /// <inheritdoc />
        public override string Description =>
            "Shows when the next unaired episode of a series will air, directly on the series detail page.";

        /// <summary>Gets the global plugin instance.</summary>
        public static Plugin? Instance { get; private set; }

        /// <inheritdoc />
        public IEnumerable<PluginPageInfo> GetPages()
        {
            return new[]
            {
                new PluginPageInfo
                {
                    Name        = "NextAiringEpisode",
                    EmbeddedResourcePath = $"{GetType().Namespace}.Configuration.configPage.html"
                }
            };
        }

        // ── Script injection ────────────────────────────────────────────────

        private void InjectScript(IApplicationPaths paths)
        {
            try
            {
                // Read JS from embedded resource
                var assembly   = Assembly.GetExecutingAssembly();
                using var stream = assembly.GetManifestResourceStream("next-episode.js");
                if (stream is null)
                {
                    _logger.LogWarning("[Next Airing Episode] Embedded JS resource not found.");
                    return;
                }

                using var reader = new StreamReader(stream);
                var jsContent = reader.ReadToEnd();

                // Find Jellyfin's web root index.html
                var webRoot  = Path.Combine(paths.ProgramDataPath, "..", "jellyfin-web");
                var indexPath = Path.Combine(webRoot, "index.html");

                if (!File.Exists(indexPath))
                {
                    // Try common alternative paths
                    var alt = new[]
                    {
                        "/usr/share/jellyfin/web/index.html",
                        "/usr/lib/jellyfin/bin/jellyfin-web/index.html",
                    };
                    indexPath = Array.Find(alt, File.Exists) ?? string.Empty;
                }

                if (string.IsNullOrEmpty(indexPath))
                {
                    _logger.LogWarning(
                        "[Next Airing Episode] index.html not found. " +
                        "If using Docker, map index.html as a volume (see README).");
                    return;
                }

                var html = File.ReadAllText(indexPath);
                const string marker = "<!-- next-airing-episode -->";

                if (html.Contains(marker))
                {
                    _logger.LogInformation("[Next Airing Episode] Already injected, skipping.");
                    return;
                }

                var tag = $"\n{marker}\n<script>\n{jsContent}\n</script>\n</body>";
                html = html.Replace("</body>", tag, StringComparison.OrdinalIgnoreCase);
                File.WriteAllText(indexPath, html);

                _logger.LogInformation("[Next Airing Episode] Script injected into {Path}.", indexPath);
            }
            catch (UnauthorizedAccessException)
            {
                _logger.LogError(
                    "[Next Airing Episode] Permission denied writing to index.html. " +
                    "See README for Docker volume mapping instructions.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[Next Airing Episode] Failed to inject script.");
            }
        }
    }
}
