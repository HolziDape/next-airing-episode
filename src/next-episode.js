/**
 * Next Airing Episode - Jellyfin Plugin
 * =====================================
 * Shows when the next unaired episode of a series will air,
 * directly on the series detail page in Jellyfin.
 *
 * @version     1.0.5
 * @author      HolziDape
 * @license     MIT
 * @repository  https://github.com/HolziDape/next-airing-episode
 */

(function () {
  'use strict';

  const VERSION = '1.0.5';
  const BADGE_ID = 'next-airing-episode-badge';
  const UPCOMING_SECTION_ID = 'next-airing-episode-upcoming';
  const SCRIPT_TAG = '[Next Airing Episode]';
  const LOCALE = 'de-DE';
  const UPCOMING_LIMIT = 6;
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

  async function getItem(itemId) {
    const userId = getUserId();
    if (!userId || !itemId) {
      return null;
    }

    return apiFetch(
      `/Users/${encodeURIComponent(userId)}/Items/${encodeURIComponent(itemId)}` +
      '?Fields=PremiereDate,IndexNumber,ParentIndexNumber,SeriesId,SeriesName,ImageTags,Overview,ParentThumbItemId,ParentThumbImageTag'
    );
  }

  async function fetchSeriesEpisodes(seriesId) {
    const userId = getUserId();
    if (!userId || !seriesId) {
      return [];
    }

    const data = await apiFetch(
      `/Users/${encodeURIComponent(userId)}/Items?` +
      `ParentId=${encodeURIComponent(seriesId)}` +
      '&IncludeItemTypes=Episode' +
      '&Recursive=true' +
      '&Fields=PremiereDate,IndexNumber,ParentIndexNumber,ImageTags,Overview,ParentThumbItemId,ParentThumbImageTag' +
      '&SortBy=PremiereDate,SortName' +
      '&SortOrder=Ascending' +
      '&Limit=500'
    );

    return data && Array.isArray(data.Items) ? data.Items : [];
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

  function createLine(text, style) {
    const line = document.createElement('div');
    line.textContent = text;
    line.style.cssText = style;
    return line;
  }

  function createLabel(episode) {
    const season = String(episode.ParentIndexNumber || 0).padStart(2, '0');
    const episodeNumber = String(episode.IndexNumber || 0).padStart(2, '0');
    return episode.Name ? `S${season}E${episodeNumber} - ${episode.Name}` : `S${season}E${episodeNumber}`;
  }

  function removeBadge() {
    document.getElementById(BADGE_ID)?.remove();
  }

  function removeUpcomingSection() {
    document.getElementById(UPCOMING_SECTION_ID)?.remove();
  }

  function removeUi() {
    removeBadge();
    removeUpcomingSection();
  }

  function injectBadge(episode) {
    removeBadge();

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
    content.appendChild(createLine(createLabel(episode), 'margin-top:2px;font-size:.9em;opacity:.9'));
    content.appendChild(createLine(formatRelative(episode.PremiereDate), 'margin-top:3px;font-size:.82em;opacity:.65'));

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

  function getImageUrl(item) {
    const serverAddress = getServerAddress();
    const token = getToken();
    if (!serverAddress || !token || !item) {
      return null;
    }

    if (item.ImageTags && item.ImageTags.Primary) {
      return `${serverAddress}/Items/${encodeURIComponent(item.Id)}/Images/Primary?maxWidth=320&quality=90&tag=${encodeURIComponent(item.ImageTags.Primary)}&api_key=${encodeURIComponent(token)}`;
    }

    if (item.ParentThumbItemId && item.ParentThumbImageTag) {
      return `${serverAddress}/Items/${encodeURIComponent(item.ParentThumbItemId)}/Images/Thumb?maxWidth=320&quality=90&tag=${encodeURIComponent(item.ParentThumbImageTag)}&api_key=${encodeURIComponent(token)}`;
    }

    return null;
  }

  function findUpcomingAnchor() {
    return (
      document.querySelector('.childrenItemsContainer') ||
      document.querySelector('.episodes') ||
      document.querySelector('.detailPageSecondaryContainer') ||
      document.querySelector('.detailPageContent')
    );
  }

  function buildUpcomingCard(episode) {
    const card = document.createElement('article');
    card.style.cssText = [
      'display:flex',
      'flex-direction:column',
      'min-width:220px',
      'max-width:220px',
      'border-radius:16px',
      'overflow:hidden',
      'background:rgba(255,255,255,.06)',
      'border:1px solid rgba(255,255,255,.08)',
      'backdrop-filter:blur(10px)',
      'box-shadow:0 14px 32px rgba(0,0,0,.24)',
    ].join(';');

    const imageWrap = document.createElement('div');
    imageWrap.style.cssText = [
      'position:relative',
      'aspect-ratio:16/9',
      'background:linear-gradient(135deg, rgba(0,164,220,.35), rgba(12,27,39,.95))',
      'overflow:hidden',
    ].join(';');

    const imageUrl = getImageUrl(episode);
    if (imageUrl) {
      const image = document.createElement('img');
      image.src = imageUrl;
      image.alt = episode.Name || 'Upcoming episode';
      image.loading = 'lazy';
      image.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
      imageWrap.appendChild(image);
    } else {
      imageWrap.appendChild(createLine('Keine Vorschau', 'padding:16px;font-weight:700;font-size:1rem;color:#dff7ff'));
    }

    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:14px 14px 16px';
    body.appendChild(createLine(createLabel(episode), 'font-weight:700;line-height:1.35;color:#fff'));
    body.appendChild(createLine(formatRelative(episode.PremiereDate), 'font-size:.88rem;color:#8bdcff'));

    if (episode.Overview) {
      body.appendChild(createLine(episode.Overview, 'font-size:.85rem;line-height:1.45;color:rgba(255,255,255,.72);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden'));
    }

    card.appendChild(imageWrap);
    card.appendChild(body);
    return card;
  }

  function injectUpcomingEpisodes(episodes) {
    removeUpcomingSection();
    if (!episodes.length) {
      return;
    }

    const section = document.createElement('section');
    section.id = UPCOMING_SECTION_ID;
    section.style.cssText = [
      'margin-top:26px',
      'padding:18px',
      'border-radius:20px',
      'background:linear-gradient(180deg, rgba(6,20,28,.82), rgba(7,14,20,.72))',
      'border:1px solid rgba(0,164,220,.18)',
      'box-shadow:0 18px 40px rgba(0,0,0,.28)',
    ].join(';');

    section.appendChild(createLine('Kommende Folgen', 'font-size:1.35rem;font-weight:800;color:#f4fbff'));
    section.appendChild(createLine('Weiter nach der aktuellen Episode mit Vorschau und Releasedatum.', 'margin-top:4px;margin-bottom:14px;font-size:.92rem;color:rgba(255,255,255,.7)'));

    const row = document.createElement('div');
    row.style.cssText = [
      'display:flex',
      'gap:16px',
      'overflow-x:auto',
      'padding-bottom:4px',
      'scrollbar-width:thin',
    ].join(';');

    for (const episode of episodes) {
      row.appendChild(buildUpcomingCard(episode));
    }

    section.appendChild(row);

    const anchor = findUpcomingAnchor();
    if (!anchor) {
      return;
    }

    if (anchor.classList.contains('detailPageContent')) {
      anchor.appendChild(section);
      return;
    }

    anchor.insertAdjacentElement('afterend', section);
  }

  function getUpcomingEpisodes(allEpisodes, currentEpisodeId) {
    const now = new Date();
    return allEpisodes
      .filter((episode) => episode.Id !== currentEpisodeId)
      .filter((episode) => episode.PremiereDate)
      .filter((episode) => new Date(episode.PremiereDate) > now)
      .slice(0, UPCOMING_LIMIT);
  }

  async function renderSeriesPage(itemId, runId) {
    removeUpcomingSection();

    const episodes = await fetchSeriesEpisodes(itemId);
    if (runId !== currentRun) {
      return;
    }

    const nextEpisode = getUpcomingEpisodes(episodes, null)[0] || null;
    if (nextEpisode) {
      injectBadge(nextEpisode);
    } else {
      removeBadge();
    }
  }

  async function renderEpisodePage(itemId, runId) {
    removeBadge();

    const item = await getItem(itemId);
    if (runId !== currentRun) {
      return;
    }

    if (!item || !item.SeriesId) {
      removeUpcomingSection();
      return;
    }

    const episodes = await fetchSeriesEpisodes(item.SeriesId);
    if (runId !== currentRun) {
      return;
    }

    injectUpcomingEpisodes(getUpcomingEpisodes(episodes, itemId));
  }

  async function checkPage() {
    const runId = ++currentRun;
    const itemId = getItemIdFromUrl();
    if (!itemId) {
      removeUi();
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 900));
    if (runId !== currentRun) {
      return;
    }

    const item = await getItem(itemId);
    if (runId !== currentRun) {
      return;
    }

    if (!item || !item.Type) {
      removeUi();
      return;
    }

    if (item.Type === 'Series') {
      await renderSeriesPage(itemId, runId);
      return;
    }

    if (item.Type === 'Episode') {
      await renderEpisodePage(itemId, runId);
      return;
    }

    removeUi();
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
