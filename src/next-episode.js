/**
 * Next Airing Episode – Jellyfin Plugin
 * =======================================
 * Shows when the next unaired episode of a series will air,
 * directly on the series detail page in Jellyfin.
 *
 * @version     1.0.0
 * @author      HolziDape
 * @license     MIT
 * @repository  https://github.com/HolziDape/next-airing-episode
 */

(function () {
  'use strict';

  const BADGE_ID   = 'next-airing-episode-badge';
  const SCRIPT_TAG = '[Next Airing Episode]';

  // ── Auth helpers ────────────────────────────────────────────────────────────

  function getCredentials() {
    try {
      const raw = localStorage.getItem('jellyfin_credentials');
      const creds = JSON.parse(raw || '{}');
      return (creds.Servers || [])[0] || null;
    } catch {
      return null;
    }
  }

  function getToken()  { return (getCredentials() || {}).AccessToken || null; }
  function getUserId() { return (getCredentials() || {}).UserId      || null; }

  // ── API ─────────────────────────────────────────────────────────────────────

  async function apiFetch(path) {
    const token = getToken();
    if (!token) return null;
    try {
      const res = await fetch(`${location.origin}${path}`, {
        headers: { 'X-Emby-Token': token }
      });
      return res.ok ? res.json() : null;
    } catch {
      return null;
    }
  }

  async function getItemType(itemId) {
    const userId = getUserId();
    if (!userId || !itemId) return null;
    const data = await apiFetch(`/Users/${userId}/Items/${itemId}`);
    return data ? data.Type : null;
  }

  async function fetchNextUnaired(seriesId) {
    const userId = getUserId();
    if (!userId) return null;

    const data = await apiFetch(
      `/Users/${userId}/Items?` +
      `ParentId=${seriesId}` +
      `&IncludeItemTypes=Episode` +
      `&Recursive=true` +
      `&Fields=PremiereDate,IndexNumber,ParentIndexNumber` +
      `&SortBy=PremiereDate` +
      `&SortOrder=Ascending` +
      `&Limit=500`
    );

    if (!data?.Items) return null;

    const now = new Date();
    return data.Items.find(ep => ep.PremiereDate && new Date(ep.PremiereDate) > now) || null;
  }

  // ── Date formatting ─────────────────────────────────────────────────────────

  function formatRelative(dateStr) {
    const d    = new Date(dateStr);
    const now  = new Date();
    const diff = Math.ceil((d - now) / 864e5);

    const abs = d.toLocaleDateString('de-DE', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });

    if (diff === 0) return `Heute  ·  ${abs}`;
    if (diff === 1) return `Morgen  ·  ${abs}`;
    if (diff >  1 && diff <= 7) return `In ${diff} Tagen  ·  ${abs}`;
    return abs;
  }

  // ── DOM helpers ─────────────────────────────────────────────────────────────

  function removeBadge() {
    document.getElementById(BADGE_ID)?.remove();
  }

  function injectBadge(episode) {
    removeBadge();

    const s  = String(episode.ParentIndexNumber || 0).padStart(2, '0');
    const e  = String(episode.IndexNumber       || 0).padStart(2, '0');
    const ep = episode.Name ? `S${s}E${e} – ${episode.Name}` : `S${s}E${e}`;
    const dt = formatRelative(episode.PremiereDate);

    const badge = document.createElement('div');
    badge.id = BADGE_ID;
    badge.style.cssText = [
      'display:inline-flex', 'align-items:center', 'gap:10px',
      'margin-top:14px', 'padding:9px 15px',
      'background:rgba(0,164,220,.12)',
      'border:1px solid rgba(0,164,220,.45)',
      'border-radius:10px', 'font-size:.9em',
      'color:#e0e0e0', 'max-width:520px',
      'box-shadow:0 2px 8px rgba(0,0,0,.25)',
    ].join(';');

    badge.innerHTML = `
      <span style="font-size:1.4em;line-height:1">📅</span>
      <div>
        <div style="font-weight:700;color:#00a4dc;letter-spacing:.02em">Next Airing Episode</div>
        <div style="margin-top:2px;font-size:.9em;opacity:.9">${ep}</div>
        <div style="margin-top:3px;font-size:.82em;opacity:.65">${dt}</div>
      </div>`;

    const anchors = [
      '.itemGenres',
      '.overview-container',
      '.overview',
      '.detailPageContent h3',
      '.nameContainer',
    ];

    for (const sel of anchors) {
      const el = document.querySelector(sel);
      if (el) { el.insertAdjacentElement('afterend', badge); return; }
    }

    (document.querySelector('.detailPageContent') || document.querySelector('main'))
      ?.prepend(badge);
  }

  // ── Page detection ──────────────────────────────────────────────────────────

  function getItemIdFromUrl() {
    return (location.href.match(/[?&]id=([a-f0-9]+)/i) || [])[1] || null;
  }

  async function checkPage() {
    const itemId = getItemIdFromUrl();
    if (!itemId) { removeBadge(); return; }

    await new Promise(r => setTimeout(r, 900));

    const type = await getItemType(itemId);
    if (type !== 'Series') { removeBadge(); return; }

    const next = await fetchNextUnaired(itemId);
    next ? injectBadge(next) : removeBadge();
  }

  // ── SPA navigation observer ─────────────────────────────────────────────────

  let lastUrl = location.href;

  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      checkPage();
    }
  }).observe(document.body, { childList: true, subtree: true });

  checkPage();
  console.info(`${SCRIPT_TAG} v1.0.0 loaded ✓`);
})();
