/**
 * Next Airing Episode - Jellyfin Plugin
 * =====================================
 * Shows when the next unaired episode of a series will air,
 * directly on the series detail page in Jellyfin.
 *
 * @version     1.0.3
 * @author      HolziDape
 * @license     MIT
 * @repository  https://github.com/HolziDape/next-airing-episode
 */

(function () {
  'use strict';

  const VERSION = '1.0.3';
  const BADGE_ID = 'next-airing-episode-badge';
  const SCRIPT_TAG = '[Next Airing Episode]';
  const LOCALE = 'de-DE';
  let currentRun = 0;

  function getApiClient() {
    return typeof window.ApiClient === 'object' && window.ApiClient ? window.ApiClient : null;
  }

  function getCredentials() {
    try {
      const raw = localStorage.getItem('jellyfin_credentials');
      const creds = JSON.parse(raw || '{}');
      return (creds.Servers || [])[0] || null;
    } catch {
      return null;
    }
  }

  function getToken() {
    const apiClient = getApiClient();
    if (apiClient && typeof apiClient.accessToken === 'function') {
      return apiClient.accessToken();
    }

    return (getCredentials() || {}).AccessToken || null;
  }

  function getUserId() {
    const apiClient = getApiClient();
    if (apiClient && typeof apiClient.getCurrentUserId === 'function') {
      return apiClient.getCurrentUserId();
    }

    return (getCredentials() || {}).UserId || null;
  }

  function getServerAddress() {
    const apiClient = getApiClient();
    if (apiClient && typeof apiClient.serverAddress === 'function') {
      return apiClient.serverAddress();
    }

    return (getCredentials() || {}).ManualAddress || location.origin;
  }

  async function apiFetch(path) {
    const token = getToken();
    const serverAddress = getServerAddress();
    if (!token || !serverAddress) {
      return null;
    }

    try {
      const res = await fetch(`${serverAddress}${path}`, {
        headers: {
          'X-Emby-Token': token,
        },
      });

      return res.ok ? res.json() : null;
    } catch {
      return null;
    }
  }

  async function getItemType(itemId) {
    const userId = getUserId();
    if (!userId || !itemId) {
      return null;
    }

    const data = await apiFetch(`/Users/${encodeURIComponent(userId)}/Items/${encodeURIComponent(itemId)}`);
    return data ? data.Type : null;
  }

  async function fetchNextUnaired(seriesId) {
    const userId = getUserId();
    if (!userId) {
      return null;
    }

    const data = await apiFetch(
      `/Users/${encodeURIComponent(userId)}/Items?` +
      `ParentId=${encodeURIComponent(seriesId)}` +
      '&IncludeItemTypes=Episode' +
      '&Recursive=true' +
      '&Fields=PremiereDate,IndexNumber,ParentIndexNumber' +
      '&SortBy=PremiereDate' +
      '&SortOrder=Ascending' +
      '&Limit=500'
    );

    if (!data || !Array.isArray(data.Items)) {
      return null;
    }

    const now = new Date();
    return data.Items.find((ep) => ep.PremiereDate && new Date(ep.PremiereDate) > now) || null;
  }

  function formatRelative(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.ceil((date - now) / 864e5);

    const absoluteDate = date.toLocaleDateString(LOCALE, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    if (diff === 0) {
      return `Heute - ${absoluteDate}`;
    }

    if (diff === 1) {
      return `Morgen - ${absoluteDate}`;
    }

    if (diff > 1 && diff <= 7) {
      return `In ${diff} Tagen - ${absoluteDate}`;
    }

    return absoluteDate;
  }

  function removeBadge() {
    document.getElementById(BADGE_ID)?.remove();
  }

  function createLine(text, style) {
    const line = document.createElement('div');
    line.textContent = text;
    line.style.cssText = style;
    return line;
  }

  function injectBadge(episode) {
    removeBadge();

    const season = String(episode.ParentIndexNumber || 0).padStart(2, '0');
    const episodeNumber = String(episode.IndexNumber || 0).padStart(2, '0');
    const episodeLabel = episode.Name ? `S${season}E${episodeNumber} - ${episode.Name}` : `S${season}E${episodeNumber}`;
    const dateLabel = formatRelative(episode.PremiereDate);

    const badge = document.createElement('div');
    badge.id = BADGE_ID;
    badge.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'gap:10px',
      'margin-top:14px',
      'padding:9px 15px',
      'background:rgba(0,164,220,.12)',
      'border:1px solid rgba(0,164,220,.45)',
      'border-radius:10px',
      'font-size:.9em',
      'color:#e0e0e0',
      'max-width:520px',
      'box-shadow:0 2px 8px rgba(0,0,0,.25)',
    ].join(';');

    const icon = document.createElement('span');
    icon.innerHTML = '&#128197;';
    icon.style.cssText = 'font-size:1.4em;line-height:1';

    const content = document.createElement('div');
    content.appendChild(createLine('Next Airing Episode', 'font-weight:700;color:#00a4dc;letter-spacing:.02em'));
    content.appendChild(createLine(episodeLabel, 'margin-top:2px;font-size:.9em;opacity:.9'));
    content.appendChild(createLine(dateLabel, 'margin-top:3px;font-size:.82em;opacity:.65'));

    badge.appendChild(icon);
    badge.appendChild(content);

    const anchors = [
      '.itemGenres',
      '.overview-container',
      '.overview',
      '.detailPageContent h3',
      '.nameContainer',
    ];

    for (const selector of anchors) {
      const element = document.querySelector(selector);
      if (element) {
        element.insertAdjacentElement('afterend', badge);
        return;
      }
    }

    (document.querySelector('.detailPageContent') || document.querySelector('main'))?.prepend(badge);
  }

  function getItemIdFromUrl() {
    try {
      const url = new URL(location.href);
      return url.searchParams.get('id');
    } catch {
      return null;
    }
  }

  async function checkPage() {
    const runId = ++currentRun;
    const itemId = getItemIdFromUrl();
    if (!itemId) {
      removeBadge();
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 900));
    if (runId !== currentRun) {
      return;
    }

    const type = await getItemType(itemId);
    if (runId !== currentRun) {
      return;
    }

    if (type !== 'Series') {
      removeBadge();
      return;
    }

    const nextEpisode = await fetchNextUnaired(itemId);
    if (runId !== currentRun) {
      return;
    }

    if (nextEpisode) {
      injectBadge(nextEpisode);
    } else {
      removeBadge();
    }
  }

  function queueCheck() {
    window.setTimeout(checkPage, 0);
  }

  function installNavigationHooks() {
    let lastUrl = location.href;
    const handleNavigation = () => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        queueCheck();
      }
    };

    const observer = new MutationObserver(handleNavigation);

    const startObserver = () => {
      if (!document.body) {
        window.setTimeout(startObserver, 100);
        return;
      }

      observer.observe(document.body, { childList: true, subtree: true });
    };

    const originalPushState = history.pushState;
    history.pushState = function pushState() {
      originalPushState.apply(this, arguments);
      handleNavigation();
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function replaceState() {
      originalReplaceState.apply(this, arguments);
      handleNavigation();
    };

    window.addEventListener('popstate', handleNavigation);
    window.addEventListener('hashchange', handleNavigation);
    startObserver();
  }

  installNavigationHooks();
  queueCheck();
  console.info(`${SCRIPT_TAG} v${VERSION} loaded`);
})();
