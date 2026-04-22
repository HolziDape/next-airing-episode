/**
 * Next Airing Episode - Jellyfin Plugin
 * =====================================
 * Shows when the next unaired episode of a series will air,
 * directly on the series detail page in Jellyfin.
 *
 * @version     1.0.8
 * @author      HolziDape
 * @license     MIT
 * @repository  https://github.com/HolziDape/next-airing-episode
 */

(function () {
  'use strict';

  const VERSION = '1.0.8';
  const BADGE_ID = 'next-airing-episode-badge';
  const UPCOMING_ITEM_CLASS = 'next-airing-episode-upcoming-item';
  const UPCOMING_ITEM_ATTR = 'data-next-airing-episode';
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

  function createDisplayTitle(episode) {
    if (episode.IndexNumber != null && episode.Name) {
      return `${episode.IndexNumber}. ${episode.Name}`;
    }

    return episode.Name || createLabel(episode);
  }

  function normalizeText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function isVisible(element) {
    return Boolean(element && element.isConnected && element.getClientRects().length);
  }

  function removeBadge() {
    document.getElementById(BADGE_ID)?.remove();
  }

  function removeUpcomingSection() {
    document.querySelectorAll(`[${UPCOMING_ITEM_ATTR}="true"]`).forEach((node) => node.remove());
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
        const match = text.match(/(?:season|staffel)\s+(\d+)/i);
        if (match) {
          return Number(match[1]);
        }
      }
    }

    return null;
  }

  function parseItemIdFromHref(href) {
    if (!href) {
      return null;
    }

    try {
      const directUrl = new URL(href, location.origin);
      const directId = directUrl.searchParams.get('id');
      if (directId) {
        return directId;
      }

      if (directUrl.hash) {
        const hashUrl = new URL(directUrl.hash.replace(/^#/, ''), location.origin);
        return hashUrl.searchParams.get('id');
      }
    } catch {
      const match = href.match(/[?&]id=([^&#]+)/i) || href.match(/\/details\?id=([^&#]+)/i);
      if (match) {
        return decodeURIComponent(match[1]);
      }
    }

    return null;
  }

  function getNodeItemId(node) {
    if (!node) {
      return null;
    }

    const dataKeys = ['id', 'itemid', 'itemId'];
    for (const key of dataKeys) {
      const value = node.dataset ? node.dataset[key] : null;
      if (value) {
        return value;
      }
    }

    for (const attr of ['data-id', 'data-itemid', 'data-item-id']) {
      const value = node.getAttribute(attr);
      if (value) {
        return value;
      }
    }

    if (typeof node.href === 'string') {
      const hrefId = parseItemIdFromHref(node.href);
      if (hrefId) {
        return hrefId;
      }
    }

    const linkedNode = node.matches('a[href]') ? node : node.querySelector('a[href]');
    if (linkedNode) {
      return parseItemIdFromHref(linkedNode.getAttribute('href'));
    }

    return null;
  }

  function uniqueNodes(nodes) {
    return Array.from(new Set(nodes.filter(Boolean)));
  }

  function getEpisodeNodeCandidates() {
    const selectors = [
      '.childrenItemsContainer .listItem',
      '.childrenItemsContainer .cardBox',
      '.childrenItemsContainer .card',
      '.childrenItemsContainer .itemAction',
      '.detailPageSecondaryContainer .listItem',
      '.detailPageSecondaryContainer .cardBox',
      '.detailPageSecondaryContainer .card',
      '.detailPageSecondaryContainer .itemAction',
      '.verticalSection .listItem',
      '.verticalSection .cardBox',
      '.verticalSection .card',
    ];

    return uniqueNodes(
      selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)))
    );
  }

  function getSectionRoot(node) {
    return node.closest('.childrenItemsContainer, .verticalSection, .detailPageSecondaryContainer, section') || node.parentElement;
  }

  function collectNativeEpisodeItems(episodesById) {
    return getEpisodeNodeCandidates()
      .filter((node) => isVisible(node))
      .filter((node) => node.getAttribute(UPCOMING_ITEM_ATTR) !== 'true')
      .map((node) => {
        const itemId = getNodeItemId(node);
        const episode = itemId ? episodesById.get(itemId) : null;
        return itemId && episode ? {
          node,
          itemId,
          episode,
          section: getSectionRoot(node),
        } : null;
      })
      .filter(Boolean);
  }

  function chooseEpisodeGroup(items, preferredSeasonNumber) {
    if (!items.length) {
      return null;
    }

    const groups = new Map();
    for (const item of items) {
      const key = item.section || item.node.parentElement;
      if (!groups.has(key)) {
        groups.set(key, []);
      }

      groups.get(key).push(item);
    }

    let bestGroup = null;
    let bestScore = -1;
    for (const groupItems of groups.values()) {
      const preferredCount = preferredSeasonNumber == null
        ? 0
        : groupItems.filter((item) => Number(item.episode.ParentIndexNumber) === Number(preferredSeasonNumber)).length;
      const score = preferredCount * 1000 + groupItems.length;
      if (score > bestScore) {
        bestScore = score;
        bestGroup = groupItems;
      }
    }

    return bestGroup;
  }

  function findNativeEpisodeContext(episodes, preferredSeasonNumber) {
    const episodesById = new Map(episodes.map((episode) => [episode.Id, episode]));
    const nativeItems = collectNativeEpisodeItems(episodesById);
    if (!nativeItems.length) {
      return null;
    }

    const selectedGroup = chooseEpisodeGroup(nativeItems, preferredSeasonNumber);
    if (!selectedGroup || !selectedGroup.length) {
      return null;
    }

    let seasonItems = selectedGroup;
    if (preferredSeasonNumber != null) {
      const preferredItems = selectedGroup.filter(
        (item) => Number(item.episode.ParentIndexNumber) === Number(preferredSeasonNumber)
      );
      if (preferredItems.length) {
        seasonItems = preferredItems;
      }
    }

    const templateItem = seasonItems[seasonItems.length - 1];
    return {
      templateNode: templateItem.node,
      templateEpisode: templateItem.episode,
      insertAfter: templateItem.node,
      seasonItems,
      seasonNumber: Number(templateItem.episode.ParentIndexNumber) || preferredSeasonNumber || null,
    };
  }

  function getLeafTextElements(root) {
    return Array.from(root.querySelectorAll('*')).filter((element) => {
      if (!element.childElementCount) {
        return normalizeText(element.textContent).length > 0;
      }

      return false;
    });
  }

  function findBestLeaf(elements, scoreFn) {
    let bestElement = null;
    let bestScore = -1;

    for (const element of elements) {
      const score = scoreFn(element);
      if (score > bestScore) {
        bestScore = score;
        bestElement = element;
      }
    }

    return bestElement;
  }

  function getOverviewSnippet(text) {
    return normalizeText(String(text || '').slice(0, 80));
  }

  function findTitleElement(root, sourceEpisode) {
    const leaves = getLeafTextElements(root);
    const sourceName = normalizeText(sourceEpisode.Name);
    const sourceCode = normalizeText(createEpisodeCode(sourceEpisode));
    const sourceLabel = normalizeText(createLabel(sourceEpisode));
    const sourceDisplayTitle = normalizeText(createDisplayTitle(sourceEpisode));
    const sourceIndexPrefix = sourceEpisode.IndexNumber != null
      ? normalizeText(`${sourceEpisode.IndexNumber}.`)
      : '';

    return findBestLeaf(leaves, (element) => {
      const text = normalizeText(element.textContent);
      if (!text) {
        return -1;
      }

      let score = text.length;
      if (sourceName && text.includes(sourceName)) {
        score += 2000;
      }
      if (sourceDisplayTitle && text === sourceDisplayTitle) {
        score += 1800;
      }
      if (sourceLabel && text.includes(sourceLabel)) {
        score += 1500;
      }
      if (sourceCode && text.includes(sourceCode)) {
        score += 1200;
      }
      if (sourceIndexPrefix && text.startsWith(sourceIndexPrefix)) {
        score += 900;
      }

      return score;
    });
  }

  function findOverviewElement(root, sourceEpisode, titleElement) {
    const leaves = getLeafTextElements(root).filter((element) => element !== titleElement);
    const overviewSnippet = getOverviewSnippet(sourceEpisode.Overview);
    if (!overviewSnippet) {
      return null;
    }

    return findBestLeaf(leaves, (element) => {
      const text = normalizeText(element.textContent);
      if (!text) {
        return -1;
      }

      let score = 0;
      if (text.includes(overviewSnippet)) {
        score += 2000;
      }

      score += Math.min(text.length, 200);
      return score;
    });
  }

  function findInfoElement(root, titleElement, overviewElement) {
    const leaves = getLeafTextElements(root).filter((element) => element !== titleElement && element !== overviewElement);
    return findBestLeaf(leaves, (element) => {
      const text = normalizeText(element.textContent);
      if (!text) {
        return -1;
      }

      const textLength = text.length;
      let score = 100 - Math.min(Math.abs(textLength - 22), 100);
      if (/\d/.test(text)) {
        score += 25;
      }
      if (/end|endet|min|m$|heute|morgen|tage|uhr/.test(text)) {
        score += 50;
      }

      return score;
    });
  }

  function replaceTextContent(element, value) {
    if (element) {
      element.textContent = value;
      element.style.removeProperty('display');
    }
  }

  function hideElement(element) {
    if (element) {
      element.style.display = 'none';
    }
  }

  function sanitizeClone(clone) {
    clone.setAttribute(UPCOMING_ITEM_ATTR, 'true');
    clone.classList.add(UPCOMING_ITEM_CLASS);
    clone.removeAttribute('id');
    clone.removeAttribute('data-id');
    clone.removeAttribute('data-itemid');
    clone.removeAttribute('data-item-id');

    clone.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
    clone.querySelectorAll(`[${UPCOMING_ITEM_ATTR}]`).forEach((element) => {
      element.setAttribute(UPCOMING_ITEM_ATTR, 'true');
    });

    clone.querySelectorAll(
      'button, [role="button"]:not(a), .cardOverlayContainer, .cardOverlayFab-primary, .listItemButtons,' +
      '.listItemButton, .secondaryButtons, .mediaSourceIndicator, .playedIndicator, .playedPercentage,' +
      '.itemProgressBar, .countIndicator, .selectionCommands, .editButton, .listItemMenu'
    ).forEach((element) => element.remove());

    clone.querySelectorAll('.selected, .played').forEach((element) => {
      element.classList.remove('selected', 'played');
    });
  }

  function updateNodeItemIds(node, itemId) {
    if (!node || !itemId) {
      return;
    }

    if (node.dataset) {
      node.dataset.id = itemId;
      node.dataset.itemid = itemId;
      node.dataset.itemId = itemId;
    }

    for (const attr of ['data-id', 'data-itemid', 'data-item-id']) {
      if (node.hasAttribute(attr) || attr === 'data-id') {
        node.setAttribute(attr, itemId);
      }
    }
  }

  function updateLinks(root, episode) {
    const href = getItemHref(episode.Id);
    const links = root.matches('a[href]') ? [root] : Array.from(root.querySelectorAll('a[href]'));

    for (const link of links) {
      link.href = href;
      updateNodeItemIds(link, episode.Id);

      if (episode.Name) {
        link.setAttribute('title', episode.Name);
        link.setAttribute('aria-label', episode.Name);
      }
    }
  }

  function updateImage(root, episode) {
    const imageUrl = getImageUrl(episode);
    const images = root.matches('img') ? [root] : Array.from(root.querySelectorAll('img'));
    if (!images.length) {
      return;
    }

    for (const image of images) {
      if (imageUrl) {
        image.src = imageUrl;
        image.removeAttribute('srcset');
        image.alt = episode.Name || 'Upcoming episode';
        image.style.removeProperty('display');
      } else {
        image.removeAttribute('srcset');
        image.removeAttribute('src');
        image.alt = episode.Name || 'Upcoming episode';
        image.style.opacity = '.18';
      }
    }
  }

  function updateText(root, sourceEpisode, targetEpisode) {
    const titleElement = findTitleElement(root, sourceEpisode);
    const overviewElement = findOverviewElement(root, sourceEpisode, titleElement);
    let infoElement = findInfoElement(root, titleElement, overviewElement);

    replaceTextContent(titleElement, createDisplayTitle(targetEpisode));

    if (!infoElement && titleElement && titleElement.parentElement) {
      infoElement = titleElement.cloneNode(false);
      infoElement.className = titleElement.className;
      infoElement.removeAttribute('style');
      titleElement.insertAdjacentElement('afterend', infoElement);
    }

    replaceTextContent(infoElement, formatRelative(targetEpisode.PremiereDate));

    if (targetEpisode.Overview) {
      if (overviewElement) {
        replaceTextContent(overviewElement, targetEpisode.Overview);
      } else if (infoElement && infoElement.parentElement) {
        const detailElement = infoElement.cloneNode(false);
        detailElement.className = infoElement.className;
        detailElement.removeAttribute('style');
        detailElement.textContent = targetEpisode.Overview;
        infoElement.insertAdjacentElement('afterend', detailElement);
      }
    } else {
      hideElement(overviewElement);
    }
  }

  function buildUpcomingEpisodeNode(context, episode) {
    const clone = context.templateNode.cloneNode(true);
    sanitizeClone(clone);
    updateNodeItemIds(clone, episode.Id);
    updateLinks(clone, episode);
    updateImage(clone, episode);
    updateText(clone, context.templateEpisode, episode);
    return clone;
  }

  function injectUpcomingEpisodes(episodes, context) {
    removeUpcomingSection();
    if (!episodes.length || !context) {
      return;
    }

    let insertAfter = context.insertAfter;
    for (const episode of episodes) {
      const clone = buildUpcomingEpisodeNode(context, episode);
      insertAfter.insertAdjacentElement('afterend', clone);
      insertAfter = clone;
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

  function renderNativeUpcomingEpisodes(episodes, currentEpisodeId, preferredSeasonNumber) {
    const context = findNativeEpisodeContext(episodes, preferredSeasonNumber);
    if (!context) {
      removeUpcomingSection();
      console.info(`${SCRIPT_TAG} no native desktop episode list found; skipping upcoming episode injection`);
      return { nextVisibleUpcoming: null, seasonNumber: preferredSeasonNumber || null };
    }

    const visibleIds = new Set(context.seasonItems.map((item) => item.episode.Id));
    const upcomingEpisodes = getUpcomingEpisodes(episodes, currentEpisodeId, context.seasonNumber)
      .filter((episode) => !visibleIds.has(episode.Id));

    injectUpcomingEpisodes(upcomingEpisodes, context);

    return {
      nextVisibleUpcoming: upcomingEpisodes[0] || null,
      seasonNumber: context.seasonNumber,
    };
  }

  async function renderSeriesPage(itemId, runId) {
    const episodes = await fetchSeriesEpisodes(itemId);
    if (runId !== currentRun) {
      return;
    }

    const preferredSeasonNumber = getVisibleSeasonNumber();
    const { nextVisibleUpcoming } = renderNativeUpcomingEpisodes(episodes, null, preferredSeasonNumber);
    const nextEpisode = nextVisibleUpcoming || getUpcomingEpisodes(episodes, null, null)[0] || null;

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

    renderNativeUpcomingEpisodes(episodes, itemId, item.ParentIndexNumber || getVisibleSeasonNumber());
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
