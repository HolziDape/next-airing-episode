using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
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
        private const string StartMarker = "<!-- next-airing-episode:start -->";
        private const string EndMarker = "<!-- next-airing-episode:end -->";
        private static readonly Encoding Utf8NoBom = new UTF8Encoding(false);

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

                using var reader = new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true);
                var jsContent = reader.ReadToEnd().Trim();

                var indexPath = FindIndexHtml(paths);
                if (string.IsNullOrEmpty(indexPath))
                {
                    _logger.LogWarning(
                        "[Next Airing Episode] index.html not found. " +
                        "If using Docker, map index.html as a volume (see README)");
                    return;
                }

                var html = File.ReadAllText(indexPath, Encoding.UTF8);
                var managedBlock = BuildManagedBlock(jsContent);
                string updatedHtml;

                if (ContainsManagedBlock(html))
                {
                    updatedHtml = ReplaceManagedBlock(html, managedBlock);
                }
                else if (html.Contains("</body>", StringComparison.OrdinalIgnoreCase))
                {
                    updatedHtml = Regex.Replace(
                        html,
                        "</body>",
                        managedBlock + Environment.NewLine + "</body>",
                        RegexOptions.IgnoreCase,
                        TimeSpan.FromSeconds(2));
                }
                else
                {
                    _logger.LogWarning("[Next Airing Episode] index.html has no closing </body> tag");
                    return;
                }

                if (string.Equals(html, updatedHtml, StringComparison.Ordinal))
                {
                    _logger.LogInformation("[Next Airing Episode] Script block already up to date");
                    return;
                }

                File.WriteAllText(indexPath, updatedHtml, Utf8NoBom);
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

        private static string BuildManagedBlock(string jsContent)
        {
            return string.Join(
                Environment.NewLine,
                StartMarker,
                "<script>",
                jsContent,
                "</script>",
                EndMarker);
        }

        private static bool ContainsManagedBlock(string html)
        {
            return html.Contains(StartMarker, StringComparison.Ordinal) &&
                html.Contains(EndMarker, StringComparison.Ordinal);
        }

        private static string ReplaceManagedBlock(string html, string managedBlock)
        {
            var pattern = $"{Regex.Escape(StartMarker)}.*?{Regex.Escape(EndMarker)}";
            return Regex.Replace(
                html,
                pattern,
                managedBlock,
                RegexOptions.Singleline,
                TimeSpan.FromSeconds(2));
        }

        private static string FindIndexHtml(IApplicationPaths paths)
        {
            var baseDirectory = AppContext.BaseDirectory;
            var candidates = new[]
            {
                Path.Combine(paths.ProgramDataPath, "..", "jellyfin-web", "index.html"),
                Path.Combine(paths.ProgramDataPath, "..", "web", "index.html"),
                Path.Combine(baseDirectory, "jellyfin-web", "index.html"),
                Path.Combine(baseDirectory, "web", "index.html"),
                "/usr/share/jellyfin/web/index.html",
                "/usr/lib/jellyfin/bin/jellyfin-web/index.html",
            };

            foreach (var path in candidates
                .Select(Path.GetFullPath)
                .Distinct(StringComparer.OrdinalIgnoreCase))
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
