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
    /// </summary>
    public class NextAiringEpisodePlugin : BasePlugin<PluginConfiguration>, IHasWebPages
    {
        private readonly ILogger<NextAiringEpisodePlugin> _logger;

        /// <summary>
        /// Initializes a new instance of the <see cref="NextAiringEpisodePlugin"/> class.
        /// </summary>
        public NextAiringEpisodePlugin(
            IApplicationPaths applicationPaths,
            IXmlSerializer xmlSerializer,
            ILogger<NextAiringEpisodePlugin> logger)
            : base(applicationPaths, xmlSerializer)
        {
            ArgumentNullException.ThrowIfNull(applicationPaths);
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
        public static NextAiringEpisodePlugin? Instance { get; private set; }

        /// <inheritdoc />
        public IEnumerable<PluginPageInfo> GetPages()
        {
            return Array.Empty<PluginPageInfo>();
        }

        private void InjectScript(IApplicationPaths paths)
        {
            try
            {
                var assembly = Assembly.GetExecutingAssembly();
                using var stream = assembly.GetManifestResourceStream("next-episode.js");
                if (stream is null)
                {
                    _logger.LogWarning("[Next Airing Episode] Embedded JS resource not found");
                    return;
                }

                using var reader = new StreamReader(stream);
                var jsContent = reader.ReadToEnd();

                var indexPath = FindIndexHtml(paths);
                if (string.IsNullOrEmpty(indexPath))
                {
                    _logger.LogWarning(
                        "[Next Airing Episode] index.html not found. " +
                        "If using Docker, map index.html as a volume (see README)");
                    return;
                }

                var html = File.ReadAllText(indexPath);
                const string Marker = "<!-- next-airing-episode -->";

                if (html.Contains(Marker, StringComparison.Ordinal))
                {
                    _logger.LogInformation("[Next Airing Episode] Already injected, skipping");
                    return;
                }

                var tag = $"\n{Marker}\n<script>\n{jsContent}\n</script>\n</body>";
                html = html.Replace("</body>", tag, StringComparison.OrdinalIgnoreCase);
                File.WriteAllText(indexPath, html);

                _logger.LogInformation("[Next Airing Episode] Script injected into {Path}", indexPath);
            }
            catch (UnauthorizedAccessException ex)
            {
                _logger.LogError(ex, "[Next Airing Episode] Permission denied writing to index.html. See README for Docker volume mapping");
            }
            catch (IOException ex)
            {
                _logger.LogError(ex, "[Next Airing Episode] IO error while injecting script");
            }
        }

        private static string FindIndexHtml(IApplicationPaths paths)
        {
            var candidates = new[]
            {
                Path.Combine(paths.ProgramDataPath, "..", "jellyfin-web", "index.html"),
                "/usr/share/jellyfin/web/index.html",
                "/usr/lib/jellyfin/bin/jellyfin-web/index.html",
            };

            foreach (var path in candidates)
            {
                if (File.Exists(path))
                {
                    return path;
                }
            }

            return string.Empty;
        }
    }
}
