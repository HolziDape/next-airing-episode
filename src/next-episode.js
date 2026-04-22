/**
 * Next Airing Episode - Jellyfin Plugin
 * =====================================
 * Shows when the next unaired episode of a series will air,
 * directly on the series detail page in Jellyfin.
 *
 * @version     1.0.7
 * @author      HolziDape
 * @license     MIT
 * @repository  https://github.com/HolziDape/next-airing-episode
 */

(function () {
  'use strict';

  const VERSION = '1.0.7';
  const BADGE_ID = 'next-airing-episode-badge';
  const UPCOMING_ITEM_CLASS = 'next-airing-episode-upcoming-item';
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

  async function getItem(itemId) {
    const userId = getUserId();
    if (!userId || !itemId) {
      return null;
    }

    return apiFetch(
      `/Users/${encodeURIComponent(userId)}/Items/${encodeURIComponent(itemId)}` +
      '?Fields=PremiereDate,IndexNumber,ParentIndexNumber,SeriesId,SeriesName,SeasonId,ImageTags,Overview,ParentThumbItemId,ParentThumbImageTag'
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
      '&Fields=PremiereDate,IndexNumber,ParentIndexNumber,SeasonId,ImageTags,Overview,ParentThumbItemId,ParentThumbImageTag' +
      '&SortBy=ParentIndexNumber,IndexNumber,PremiereDate,SortName' +
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

  function createEpisodeCode(episode) {
    const season = String(episode.ParentIndexNumber || 0).padStart(2, '0');
    const episodeNumber = String(episode.IndexNumber || 0).padStart(2, '0');
    return `S${season}E${episodeNumber}`;
  }

  function createLabel(episode) {
    return episode.Name ? `${createEpisodeCode(episode)} - ${episode.Name}` : createEpisodeCode(episode);
  }

  function removeBadge() {
    document.getElementById(BADGE_ID)?.remove();
  }

  function removeUpcomingSection() {
    document.querySelectorAll(`.${UPCOMING_ITEM_CLASS}`).forEach((node) => node.remove());
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

  function getVisibleSeasonNumber() {
    const selectors = [
      '.childrenItemsContainer h2',
      '.verticalSection h2',
      '.sectionTitle',
      '.listName',
      'h2',
      'h3',
    ];

    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        const text = (node.textContent || '').trim();
        const match = text.match(/Season\s+(\d+)/i);
        if (match) {
          return Number(match[1]);
        }
      }
    }

    return null;
  }

  function getImageUrl(item) {
    const serverAddress = getServerAddress();
    const token = getToken();
    if (!serverAddress || !token || !item) {
      return null;
    }

    if (item.ImageTags && item.ImageTags.Primary) {
      return `${serverAddress}/Items/${encodeURIComponent(item.Id)}/Images/Primary?maxWidth=520&quality=90&tag=${encodeURIComponent(item.ImageTags.Primary)}&api_key=${encodeURIComponent(token)}`;
    }

    if (item.ParentThumbItemId && item.ParentThumbImageTag) {
      return `${serverAddress}/Items/${encodeURIComponent(item.ParentThumbItemId)}/Images/Thumb?maxWidth=520&quality=90&tag=${encodeURIComponent(item.ParentThumbImageTag)}&api_key=${encodeURIComponent(token)}`;
    }

    return null;
  }

  function findEpisodeListAnchor() {
    const selectors = [
      '.childrenItemsContainer .itemsContainer',
      '.childrenItemsContainer',
      '.episodes',
      '.detailPageSecondaryContainer .itemsContainer',
      '.detailPageSecondaryContainer',
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
    }

    return null;
  }

  function getItemHref(itemId) {
    if (!itemId) {
      return '#';
    }

    try {
      const url = new URL(location.href);
      url.searchParams.set('id', itemId);
      return url.toString();
    } catch {
      return `?id=${encodeURIComponent(itemId)}`;
    }
  }

  function buildInlineEpisode(episode) {
    const item = document.createElement('a');
    item.className = UPCOMING_ITEM_CLASS;
    item.href = getItemHref(episode.Id);
    item.style.cssText = [
      'display:flex',
      'align-items:stretch',
      'gap:16px',
      'width:100%',
      'margin-top:6px',
      'padding:8px 0',
      'border-radius:0',
      'background:transparent',
      'border-top:1px solid rgba(255,255,255,.06)',
      'text-decoration:none',
      'color:inherit',
      'cursor:pointer',
      'overflow:hidden',
    ].join(';');

    const visual = document.createElement('div');
    visual.style.cssText = [
      'position:relative',
      'flex:0 0 34%',
      'max-width:320px',
      'min-height:108px',
      'border-radius:8px',
      'overflow:hidden',
      'background:linear-gradient(135deg, rgba(0,164,220,.18), rgba(12,27,39,.62))',
    ].join(';');

    const imageUrl = getImageUrl(episode);
    if (imageUrl) {
      const image = document.createElement('img');
      image.src = imageUrl;
      image.alt = episode.Name || 'Upcoming episode';
      image.loading = 'lazy';
      image.style.cssText = 'width:100%;height:100%;min-height:108px;object-fit:cover;display:block';
      visual.appendChild(image);
    } else {
      visual.appendChild(createLine('Kein Bild', 'padding:16px;font-weight:700;color:#dff7ff'));
    }

    const dateChip = document.createElement('div');
    dateChip.textContent = formatRelative(episode.PremiereDate);
    dateChip.style.cssText = [
      'position:absolute',
      'left:8px',
      'bottom:8px',
      'padding:5px 9px',
      'border-radius:999px',
      'background:rgba(7,20,29,.82)',
      'border:1px solid rgba(139,220,255,.22)',
      'font-size:.74rem',
      'font-weight:700',
      'color:#dff7ff',
      'backdrop-filter:blur(8px)',
    ].join(';');
    visual.appendChild(dateChip);

    const meta = document.createElement('div');
    meta.style.cssText = 'display:flex;flex:1 1 auto;flex-direction:column;justify-content:center;min-width:0;padding-right:8px';
    meta.appendChild(createLine(createLabel(episode), 'font-size:1rem;font-weight:700;line-height:1.25;color:#f3f3f3'));
    meta.appendChild(createLine(formatRelative(episode.PremiereDate), 'margin-top:6px;font-size:.92rem;color:rgba(255,255,255,.78)'));

    if (episode.Overview) {
      meta.appendChild(createLine(
        episode.Overview,
        'margin-top:8px;font-size:.9rem;line-height:1.4;color:rgba(255,255,255,.62);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden'
      ));
    }

    item.appendChild(visual);
    item.appendChild(meta);
    return item;
  }

  function injectUpcomingEpisodes(episodes) {
    removeUpcomingSection();
    if (!episodes.length) {
      return;
    }

    const anchor = findEpisodeListAnchor();
    if (!anchor) {
      return;
    }

    for (const episode of episodes) {
      anchor.appendChild(buildInlineEpisode(episode));
    }
  }

  function getUpcomingEpisodes(allEpisodes, currentEpisodeId, seasonNumber) {
    const now = new Date();
    return allEpisodes
      .filter((episode) => episode.Id !== currentEpisodeId)
      .filter((episode) => episode.PremiereDate)
      .filter((episode) => new Date(episode.PremiereDate) > now)
      .filter((episode) => seasonNumber == null || Number(episode.ParentIndexNumber) === Number(seasonNumber));
  }

  async function renderSeriesPage(itemId, runId) {
    const episodes = await fetchSeriesEpisodes(itemId);
    if (runId !== currentRun) {
      return;
    }

    const visibleSeasonNumber = getVisibleSeasonNumber();
    const upcomingEpisodes = getUpcomingEpisodes(episodes, null, visibleSeasonNumber);
    const nextEpisode = upcomingEpisodes[0] || getUpcomingEpisodes(episodes, null, null)[0] || null;

    if (nextEpisode) {
      injectBadge(nextEpisode);
    } else {
      removeBadge();
    }

    injectUpcomingEpisodes(upcomingEpisodes);
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

    injectUpcomingEpisodes(getUpcomingEpisodes(episodes, itemId, item.ParentIndexNumber || getVisibleSeasonNumber()));
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
