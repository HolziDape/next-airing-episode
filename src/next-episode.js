/**
 * Next Airing Episode - Jellyfin Plugin
 * =====================================
 * Shows when the next unaired episode of a series will air,
 * directly on the series detail page in Jellyfin.
 *
 * @version     1.0.12
 * @author      HolziDape
 * @license     MIT
 * @repository  https://github.com/HolziDape/next-airing-episode
 */

(function () {
  'use strict';

  const VERSION = '1.0.13';
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
      let id = url.searchParams.get('id');
      if (id) {
        return id;
      }

      // Check hash for SPA navigation (e.g. #!/details?id=...)
      if (url.hash) {
        const hashPart = url.hash.replace(/^#+!?/, '');
        const searchPart = hashPart.includes('?') ? hashPart.substring(hashPart.indexOf('?')) : (hashPart.startsWith('?') ? hashPart : '');
        if (searchPart) {
          const hashParams = new URLSearchParams(searchPart);
          const hashId = hashParams.get('id');
          if (hashId) {
            return hashId;
          }
        }
      }
      return null;
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

  function getImageUrl(item, seriesItem) {
    const serverAddress = getServerAddress();
    const token = getToken();
    if (!serverAddress || !token || !item) {
      return null;
    }

    // 1. Episode primary image
    if (item.ImageTags && item.ImageTags.Primary) {
      return `${serverAddress}/Items/${encodeURIComponent(item.Id)}/Images/Primary?maxWidth=520&quality=90&tag=${encodeURIComponent(item.ImageTags.Primary)}&api_key=${encodeURIComponent(token)}`;
    }

    // 2. Season thumb
    if (item.ParentThumbItemId && item.ParentThumbImageTag) {
      return `${serverAddress}/Items/${encodeURIComponent(item.ParentThumbItemId)}/Images/Thumb?maxWidth=520&quality=90&tag=${encodeURIComponent(item.ParentThumbImageTag)}&api_key=${encodeURIComponent(token)}`;
    }

    // 3. Series primary image (Fallback)
    if (seriesItem && seriesItem.ImageTags && seriesItem.ImageTags.Primary) {
      return `${serverAddress}/Items/${encodeURIComponent(seriesItem.Id)}/Images/Primary?maxWidth=520&quality=90&tag=${encodeURIComponent(seriesItem.ImageTags.Primary)}&api_key=${encodeURIComponent(token)}`;
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

    const descendantWithId = node.querySelector('[data-id], [data-itemid], [data-item-id], a[href], .itemAction[data-id]');
    if (descendantWithId) {
      return getNodeItemId(descendantWithId);
    }

    return null;
  }

  function uniqueNodes(nodes) {
    return Array.from(new Set(nodes.filter(Boolean)));
  }

  function getPreferredEpisodeContainers() {
    const selectors = [
      '#listChildrenCollapsible #childrenContent',
      '#listChildrenCollapsible .itemsContainer.padded-right',
      '#childrenContent',
      '.childrenItemsContainer .itemsContainer',
    ];

    return uniqueNodes(
      selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)))
    ).filter((node) => isVisible(node));
  }

  function getEpisodeNodeCandidates() {
    const itemSelectors = [
      '.listItem.listItem-largeImage',
      '.listItem',
    ];

    const preferredContainers = getPreferredEpisodeContainers();
    const preferredNodes = preferredContainers.flatMap((container) =>
      itemSelectors.flatMap((selector) => Array.from(container.querySelectorAll(`:scope > ${selector}, ${selector}`)))
    );

    const fallbackSelectors = [
      '#listChildrenCollapsible .listItem.listItem-largeImage',
      '#listChildrenCollapsible .listItem',
      '#childrenContent .listItem.listItem-largeImage',
      '#childrenContent .listItem',
      '.childrenItemsContainer .listItem.listItem-largeImage',
      '.childrenItemsContainer .listItem',
      '.verticalSection .listItem.listItem-largeImage',
      '.verticalSection .listItem',
    ];

    const fallbackNodes = fallbackSelectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
    return uniqueNodes([...preferredNodes, ...fallbackNodes]);
  }

  function getSectionRoot(node) {
    return node.closest(
      '#listChildrenCollapsible, #childrenContent, .itemsContainer, .childrenItemsContainer, .verticalSection, .detailPageSecondaryContainer, section'
    ) || node.parentElement;
  }

  function getNodeEpisodeWeight(node, item) {
    let score = 0;
    const section = item.section;
    const text = normalizeText(node.textContent);

    if (section && (section.id === 'childrenCollapsible' || section.id === 'childrenContent')) {
      score += 5000;
    }
    if (section && section.id === 'listChildrenCollapsible') {
      score += 7000;
    }
    if (node.closest('#listChildrenCollapsible, #childrenContent')) {
      score += 3000;
    }
    if (node.classList.contains('listItem-largeImage')) {
      score += 500;
    }
    if (node.classList.contains('listItem')) {
      score += 300;
    }
    if (node.classList.contains('cardBox') || node.classList.contains('card')) {
      score += 150;
    }
    if (item.episode.Type === 'Episode') {
      score += 1000;
    }
    if (text.includes(normalizeText(item.episode.Name))) {
      score += 400;
    }

    return score;
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
          weight: 0,
        } : null;
      })
      .map((item) => ({
        ...item,
        weight: getNodeEpisodeWeight(item.node, item),
      }))
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
      const groupWeight = groupItems.reduce((sum, item) => sum + item.weight, 0);
      const score = preferredCount * 10000 + groupWeight + groupItems.length;
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

  function updateImage(root, episode, seriesItem) {
    const imageUrl = getImageUrl(episode, seriesItem);
    const backgroundNode = root.querySelector('.listItemImage.listItemImage-large');
    if (backgroundNode) {
      if (imageUrl) {
        backgroundNode.style.backgroundImage = `url("${imageUrl}")`;
        backgroundNode.classList.add('lazy-image-fadein-fast');
      } else {
        backgroundNode.style.backgroundImage = 'none';
      }

      updateNodeItemIds(backgroundNode, episode.Id);
      backgroundNode.setAttribute('data-action', 'link');
      return;
    }

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

  function updateExplicitListItemLayout(root, episode) {
    const titleBdi = root.querySelector('.listItemBody .listItemBodyText bdi');
    const mediaInfo = root.querySelector('.listItemMediaInfo');
    const overviewBdi = root.querySelector('.listItem-overview bdi');
    const bottomOverviewBdi = root.querySelector('.listItem-bottomoverview bdi');
    const bodyAction = root.querySelector('.listItemBody.itemAction');

    replaceTextContent(titleBdi, createDisplayTitle(episode));

    if (mediaInfo) {
      mediaInfo.innerHTML = '';

      const runtimeNode = document.createElement('div');
      runtimeNode.className = 'mediaInfoItem';
      runtimeNode.textContent = episode.RunTimeTicks ? `${Math.round(episode.RunTimeTicks / 600000000)}m` : 'TBA';
      mediaInfo.appendChild(runtimeNode);

      const dateNode = document.createElement('div');
      dateNode.className = 'mediaInfoItem endsAt';
      dateNode.textContent = formatRelative(episode.PremiereDate);
      mediaInfo.appendChild(dateNode);
    }

    if (targetEpisodeHasOverview(episode)) {
      replaceTextContent(overviewBdi, episode.Overview);
      replaceTextContent(bottomOverviewBdi, episode.Overview);
    } else {
      hideElement(root.querySelector('.listItem-overview'));
      hideElement(root.querySelector('.listItem-bottomoverview'));
    }

    if (bodyAction) {
      updateNodeItemIds(bodyAction, episode.Id);
      bodyAction.setAttribute('data-action', 'link');
    }
  }

  function targetEpisodeHasOverview(episode) {
    return Boolean(episode && normalizeText(episode.Overview));
  }

  function updateText(root, sourceEpisode, targetEpisode) {
    if (root.classList.contains('listItem-largeImage')) {
      updateExplicitListItemLayout(root, targetEpisode);
      return;
    }

    const textBlocks = Array.from(root.querySelectorAll('.listItemBodyText bdi'));
    replaceTextContent(textBlocks[0], createDisplayTitle(targetEpisode));
    replaceTextContent(textBlocks[1], formatRelative(targetEpisode.PremiereDate));
    if (targetEpisodeHasOverview(targetEpisode)) {
      replaceTextContent(textBlocks[2], targetEpisode.Overview);
    }
  }

  function buildUpcomingEpisodeNode(context, episode, seriesItem) {
    const clone = context.templateNode.cloneNode(true);
    sanitizeClone(clone);
    updateNodeItemIds(clone, episode.Id);
    updateLinks(clone, episode);
    updateImage(clone, episode, seriesItem);
    updateText(clone, context.templateEpisode, episode);
    return clone;
  }

  function injectUpcomingEpisodes(episodes, context, seriesItem) {
    removeUpcomingSection();
    if (!episodes.length || !context) {
      return;
    }

    let insertAfter = context.insertAfter;
    for (const episode of episodes) {
      const clone = buildUpcomingEpisodeNode(context, episode, seriesItem);
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

  function renderNativeUpcomingEpisodes(episodes, currentEpisodeId, preferredSeasonNumber, seriesItem) {
    const context = findNativeEpisodeContext(episodes, preferredSeasonNumber);
    if (!context) {
      removeUpcomingSection();
      console.info(`${SCRIPT_TAG} no native desktop episode list found; skipping upcoming episode injection`);
      return { nextVisibleUpcoming: null, seasonNumber: preferredSeasonNumber || null };
    }

    const visibleIds = new Set(context.seasonItems.map((item) => item.episode.Id));
    const upcomingEpisodes = getUpcomingEpisodes(episodes, currentEpisodeId, context.seasonNumber)
      .filter((episode) => !visibleIds.has(episode.Id));

    if (upcomingEpisodes.length > 0) {
      console.info(`${SCRIPT_TAG} injecting ${upcomingEpisodes.length} upcoming episodes`);
    }

    injectUpcomingEpisodes(upcomingEpisodes, context, seriesItem);

    return {
      nextVisibleUpcoming: upcomingEpisodes[0] || null,
      seasonNumber: context.seasonNumber,
    };
  }

  async function renderSeriesPage(seriesItem, runId) {
    const episodes = await fetchSeriesEpisodes(seriesItem.Id);
    if (runId !== currentRun) {
      return;
    }

    const preferredSeasonNumber = getVisibleSeasonNumber();
    const { nextVisibleUpcoming } = renderNativeUpcomingEpisodes(episodes, null, preferredSeasonNumber, seriesItem);
    const nextEpisode = nextVisibleUpcoming || getUpcomingEpisodes(episodes, null, null)[0] || null;

    if (nextEpisode) {
      injectBadge(nextEpisode);
    } else {
      removeBadge();
    }
  }

  async function renderEpisodePage(episodeItem, runId) {
    removeBadge();

    if (!episodeItem || !episodeItem.SeriesId) {
      removeUpcomingSection();
      return;
    }

    const [episodes, seriesItem] = await Promise.all([
      fetchSeriesEpisodes(episodeItem.SeriesId),
      getItem(episodeItem.SeriesId),
    ]);

    if (runId !== currentRun) {
      return;
    }

    renderNativeUpcomingEpisodes(episodes, episodeItem.Id, episodeItem.ParentIndexNumber || getVisibleSeasonNumber(), seriesItem);
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
      await renderSeriesPage(item, runId);
      return;
    }

    if (item.Type === 'Episode') {
      await renderEpisodePage(item, runId);
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
