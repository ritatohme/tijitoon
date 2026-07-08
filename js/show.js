// Show page: hero, season tabs, episode browser (grid/list + search + pagination)
// and the glue that hands each episode to the right player. Playback itself
// (ArtPlayer / hls.js / native fallback) lives in player.js: playM3u8 / playMp4 /
// playQualityMp4 / destroyArt / mediaEl / toggleFullscreen.

// ── PARAMS & GUARD ─────────────────────────────────────
const params = new URLSearchParams(location.search);
const showId = params.get('series') || params.get('id');
if (!showId || !/^[\w-]+$/.test(showId)) window.location.replace('404');

// ── ELEMENTS ───────────────────────────────────────────
const playerWrap  = document.getElementById('player-wrap');
const iframe      = document.getElementById('player-iframe');
const placeholder = document.getElementById('player-placeholder');
const fsBtn  = document.getElementById('fs-btn');
const fsExit = document.getElementById('fs-exit');

const seasonTabs   = document.getElementById('season-tabs');
const epGrid       = document.getElementById('ep-grid');
const epListWrap   = document.getElementById('ep-list-wrap');
const epCountLabel = document.getElementById('ep-count-label');
const noResults    = document.getElementById('ep-no-results');
const epPagination = document.getElementById('ep-pagination');
const epPagePrev   = document.getElementById('ep-page-prev');
const epPageNext   = document.getElementById('ep-page-next');
const epPageInfo   = document.getElementById('ep-page-info');

const epSearch       = document.getElementById('ep-search');
const epSearchClear  = document.getElementById('ep-search-clear');
const epSearchWrap   = document.getElementById('ep-search-wrap');
const epSearchToggle = document.getElementById('ep-search-toggle');
const epvGrid        = document.getElementById('epv-grid');
const epvList        = document.getElementById('epv-list');

const epNowPlaying = document.getElementById('ep-now-playing');
const epNavCounter = document.getElementById('ep-nav-counter');
const btnPrev      = document.getElementById('btn-prev');
const btnNext      = document.getElementById('btn-next');
const reportBtn    = document.getElementById('btn-report');

// ── STATE ──────────────────────────────────────────────
let show          = null;
let currentSeason = 0;
let currentEp     = -1;  // episode index within its own season (-1 = nothing playing)
let currentPos    = -1;  // index within flatEps
let flatEps       = [];
let epCards       = [];  // per-season arrays of grid cards
let epListRows    = [];  // per-season arrays of list rows
const seasonPages = {};  // last grid page per season while an episode plays there

let pageSize    = 10;    // grid episodes per page; recomputed from layout (computePageSize)
let currentPage = 0;
let epViewMode  = localStorage.getItem(EP_VIEW_KEY) || 'grid';
let loadGen     = 0;
let reportCtx   = null;

// ── SAVED PROGRESS ─────────────────────────────────────
const LS_KEY = progressKey(showId);

function saveProgress(si, ei) {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ season: si, ep: ei })); } catch(_) {}
}
function loadProgress() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const { season, ep } = JSON.parse(raw);
    if (typeof season === 'number' && typeof ep === 'number') return { season, ep };
  } catch(_) {}
  return null;
}

// ── URL SYNC ───────────────────────────────────────────
// Episode changes REPLACE the current history entry: the back button leaves the
// page instead of stepping through every episode watched.
function buildUrl(si, ei) {
  const u = new URLSearchParams();
  u.set('series', showId); u.set('season', si + 1); u.set('ep', ei + 1);
  return `${location.pathname}?${u}`;
}
function syncEpUrl(si, ei) {
  history.replaceState({ series: showId, season: si, ep: ei }, '', buildUrl(si, ei));
}
function readUrlEp() {
  const s = parseInt(params.get('season'), 10);
  const e = parseInt(params.get('ep'), 10);
  if (isNaN(s) || s < 1) return null;
  if (!isNaN(e) && e >= 1) return { season: s - 1, ep: e - 1 };
  return { season: s - 1, ep: null };
}

// ── SMALL HELPERS ──────────────────────────────────────
function clamp(min, val, max) { return Math.min(max, Math.max(min, val)); }

// Restart the season-flash entrance animation on an element.
function replayAnim(el) {
  el.classList.remove('season-switching');
  void el.offsetWidth;
  el.classList.add('season-switching');
}

function isPlayingInCurrentSeason() {
  return currentEp !== -1 && flatEps[currentPos]?.seasonIdx === currentSeason;
}

function scrollRowIntoView(si, ei) {
  const row = epListRows[si]?.[ei];
  if (row) setTimeout(() => row.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);
}

// ── EPISODE TYPES & WORKERS ────────────────────────────
const SANDBOX_PERMISSIONS = {
  'ojamajo.moe':        'allow-scripts allow-popups allow-forms',
  'archive.org':        'allow-scripts allow-same-origin allow-popups allow-forms allow-presentation',
  '1drv.ms':            'allow-scripts allow-same-origin allow-popups allow-forms allow-presentation'
};
const DEFAULT_SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-presentation';

const CRIMSON_WORKER_URL     = 'https://crimson-night-b851.ritatohme99.workers.dev';
const DESSINANIME_WORKER_URL = 'https://floral-star-ca2f.ritaclifford99.workers.dev';
// odycdn is proxied by the crimson worker; deno fallback deployment lives at
// great-lorikeet-66.roughrecipe.deno.net if the worker ever hits its quota.
const ODYCDN_PROXY_URL    = CRIMSON_WORKER_URL + '/';
const LOUDAPE_PROXY_URL   = 'https://loud-ape-44.roughrecipe.deno.net';
const OJAMAJO_WORKER_URL  = 'https://rapid-lab-6552.ritaclifford95.workers.dev';
const EMBED_WORKER_URL    = 'https://flaky-sturgeon-55.roughrecipe.deno.net';
// abysscdn-worker-v2: streams AbyssCDN as seekable MP4 (?res= picks a resolution;
// /abysscdn/sources lists them all for the quality gear).
const ABYSSCDN_WORKER_URL = 'https://noisy-hill-3a3b.ritaclifford99.workers.dev';

function odycdnProxyUrl(mp4Url) {
  return ODYCDN_PROXY_URL + '?url=' + encodeURIComponent(mp4Url);
}

// URL fragment → episode type. First match wins; adding a host is one line here.
const URL_TYPE_MATCHERS = [
  ['abysscdn.com',                  'abysscdn'],
  ['playhydrax.com',                'abysscdn'],
  ['zplayer.io',                    'abysscdn'],
  ['dessinanime.cc',                'dessinanime'],
  ['mhd.seekplayer.me',             'seekplayer'],
  ['embedseek.com',                 'embedseek'],
  ['player.ojamajo.moe/videos/watch', 'ojamajo'],
  ['uqload.is/embed-',              'uqload'],
  ['vidzy.live/embed-',             'vidzy'],
  ['vidmoly.biz/embed-',            'vidmoly'],
  ['sendvid.com/embed/',            'sendvid'],
  ['video.sibnet.ru/shell.php',     'sibnet'],
  ['pcloud.link/publink',           'pcloud'],
  ['pcloud.com/publink',            'pcloud'],
];

function getEpType(ep) {
  if (ep.type) return ep.type;
  const url = ep.url || '';
  const matched = URL_TYPE_MATCHERS.find(([fragment]) => url.includes(fragment));
  if (matched) return matched[1];
  if (url.endsWith('.mp4') && !url.includes('archive.org/embed')) return 'mp4';
  if (url.endsWith('.m3u8')) return 'm3u8';
  return 'embed';
}

// ── EP VIEW MODE (grid | list) ─────────────────────────
function applyEpView() {
  const isList = epViewMode === 'list';
  epGrid.style.display       = isList ? 'none' : '';
  epListWrap.classList.toggle('active', isList);
  epvGrid.classList.toggle('active', !isList);
  epvList.classList.toggle('active', isList);
}

// ── EP SEARCH ──────────────────────────────────────────
function collapseSearch() {
  epSearch.value = '';
  epSearchClear.classList.remove('visible');
  epSearchWrap.classList.remove('open');
  epSearchToggle.classList.remove('active');
  applySearch('', false);
}

function applySearch(q, resetPage = true) {
  const query = normalize(q.trim());
  if (resetPage) currentPage = 0;
  renderPage(query);
}

// ── PAGINATION & RENDER ────────────────────────────────
function computePageSize() {
  const gridWidth = epGrid.offsetWidth || epGrid.parentElement?.offsetWidth || 0;
  if (!gridWidth) return;
  const gap = 8;
  const minCard = clamp(100, gridWidth * 0.08, 160);
  const perRow = Math.max(1, Math.floor((gridWidth + gap) / (minCard + gap)));
  pageSize = perRow * 4;
}

function renderPage(query) {
  query = query ?? normalize(epSearch.value.trim());
  const cards = Array.from(epGrid.querySelectorAll('.ep-card'));
  const rows  = Array.from(epListWrap.querySelectorAll('.ep-list-row'));

  const matchedCards = cards.filter(c => !query || c.dataset.search.includes(query));
  const matchedRows  = rows.filter(r => !query || r.dataset.search.includes(query));

  const total = matchedCards.length;
  const totalPages = Math.ceil(total / pageSize);

  currentPage = Math.max(0, Math.min(currentPage, totalPages - 1));

  const start = currentPage * pageSize;
  const end   = start + pageSize;

  cards.forEach(c => c.style.display = 'none');
  matchedCards.slice(start, end).forEach(c => c.style.display = '');
  rows.forEach(r => r.style.display = matchedRows.includes(r) ? '' : 'none');

  noResults.style.display = total === 0 ? 'block' : 'none';
  epListWrap.classList.toggle('is-empty', total === 0);

  if (total > pageSize && epViewMode === 'grid') {
    epPagination.classList.add('visible');
    epPageInfo.textContent = `${start + 1}–${Math.min(end, total)} / ${total}`;
    epPagePrev.disabled = currentPage === 0;
    epPageNext.disabled = currentPage >= totalPages - 1;
  } else {
    epPagination.classList.remove('visible');
  }
}

// ── SEASONS ────────────────────────────────────────────
function buildSeasonTabs() {
  if (show.seasons.length <= 1) return;
  seasonTabs.style.display = '';
  let filmCount = 0;
  show.seasons.forEach((s, i) => {
    const isFilm = s.type === 'films';
    if (isFilm) filmCount++;
    const btn = document.createElement('button');
    btn.className = 'season-pill' + (i === 0 ? ' active' : '') + (isFilm ? ' film-type' : '');
    btn.textContent = isFilm ? `F${filmCount}` : `S${i + 1}`;
    btn.title = s.name || `Saison ${i + 1}`;
    btn.addEventListener('click', () => { if (i !== currentSeason) switchSeason(i); });
    seasonTabs.appendChild(btn);
  });
  const label = document.createElement('span');
  label.className = 'season-pill-label';
  label.id = 'season-ep-count';
  const s0 = show.seasons[0];
  label.textContent = `- ${s0.name || 'Saison 1'}`;
  seasonTabs.appendChild(label);
}

function switchSeason(i) {
  currentSeason = i;
  const playingHere = isPlayingInCurrentSeason();
  currentPage = playingHere && seasonPages[i] !== undefined ? seasonPages[i] : 0;
  collapseSearch();
  seasonTabs.querySelectorAll('.season-pill').forEach((btn, j) => btn.classList.toggle('active', j === i));
  const countEl = document.getElementById('season-ep-count');
  if (countEl) countEl.textContent = `- ${show.seasons[i].name || `Saison ${i + 1}`}`;
  buildEpGrid(i);
  if (epViewMode === 'list' && playingHere && epListRows[i]?.[currentEp]) {
    scrollRowIntoView(i, currentEp);
  } else {
    epListWrap.scrollTop = 0;
  }
  [epGrid, epListWrap].forEach(replayAnim);
}

// ── EPISODE GRID / LIST BUILD ──────────────────────────
function buildEpGrid(seasonIdx) {
  epGrid.innerHTML = '';
  epListWrap.innerHTML = '';
  epCards[seasonIdx]    = [];
  epListRows[seasonIdx] = [];
  const season = show.seasons[seasonIdx];
  const count  = season.episodes.length;
  epCountLabel.textContent = `${count} épisode${count > 1 ? 's' : ''}`;

  season.episodes.forEach((ep, i) => {
    const hasUrl = !!ep.url;
    const numStr = epCode(ep.num);

    const handler = () => {
      collapseSearch();
      selectEp(seasonIdx, i, ep, true);
      syncEpUrl(seasonIdx, i);
    };

    const searchKey = normalize(ep.title) + ' ' + ep.num;

    const card = document.createElement('div');
    card.className = 'ep-card' + (!hasUrl ? ' no-url' : '');
    card.dataset.search = searchKey;
    card.innerHTML = `
      <div class="ep-card-num">${numStr}</div>
      <div class="ep-card-title">${esc(ep.title)}</div>`;
    if (hasUrl) card.addEventListener('click', handler);
    epGrid.appendChild(card);
    epCards[seasonIdx].push(card);

    const row = document.createElement('div');
    row.className = 'ep-list-row' + (!hasUrl ? ' no-url' : '');
    row.dataset.search = searchKey;
    row.innerHTML = `
      <span class="ep-list-num">${numStr}</span>
      <span class="ep-list-title">${esc(ep.title)}</span>`;
    if (hasUrl) row.addEventListener('click', handler);
    epListWrap.appendChild(row);
    epListRows[seasonIdx].push(row);
  });

  if (isPlayingInCurrentSeason()) {
    epCards[seasonIdx]?.[currentEp]?.classList.add('playing');
    epListRows[seasonIdx]?.[currentEp]?.classList.add('playing');
  }
  refreshSavedMark();
  computePageSize();
  applySearch('', false);
}

// ── SELECT & NAVIGATE ──────────────────────────────────
function selectEp(seasonIdx, epIdx, ep, doSave) {
  currentEp  = epIdx;
  currentPos = flatEps.findIndex(e => e.seasonIdx === seasonIdx && e.epIdx === epIdx);
  currentPage = Math.floor(currentEp / pageSize);
  seasonPages[seasonIdx] = currentPage;

  renderPage();

  if (epCards[seasonIdx]) epCards[seasonIdx].forEach((c, j) => c.classList.toggle('playing', j === epIdx));
  if (epListRows[seasonIdx]) {
    epListRows[seasonIdx].forEach((r, j) => r.classList.toggle('playing', j === epIdx));
    if (epViewMode === 'list') scrollRowIntoView(seasonIdx, epIdx);
  }

  const sLabel = epLabel(show.seasons[seasonIdx], seasonIdx, ep.num);
  epNowPlaying.innerHTML = `<span class="np-code">${sLabel}</span><span class="np-title"> - ${esc(ep.title)}</span>`;
  epNavCounter.textContent = `${currentPos + 1} / ${flatEps.length}`;
  btnPrev.disabled = currentPos <= 0;
  btnNext.disabled = currentPos >= flatEps.length - 1;

  reportCtx = { show: show.title, label: sLabel, num: ep.num, title: ep.title, url: ep.url || '(aucune)' };
  resetReportBtn();

  // Lock screen / Control Center: episode as title, show as artist (player.js).
  setMediaSessionInfo(`${sLabel} - ${ep.title}`, show.title);

  loadEpisode(ep, seasonIdx);

  if (doSave) { saveProgress(seasonIdx, epIdx); refreshSavedMark(); }
}

function refreshSavedMark() {
  const saved = loadProgress();
  [epCards, epListRows].forEach(collection => {
    Object.entries(collection).forEach(([si, items]) => {
      items.forEach((el, ei) => {
        el.classList.toggle('saved', !!saved && saved.season === +si && saved.ep === ei);
      });
    });
  });
}

function navigateEp(dir) {
  if (currentPos === -1) return;
  const next = flatEps[currentPos + dir];
  if (!next) return;
  if (next.seasonIdx !== currentSeason) switchSeason(next.seasonIdx);
  collapseSearch();
  selectEp(next.seasonIdx, next.epIdx, next.ep, true);
  syncEpUrl(next.seasonIdx, next.epIdx);
}

// ── HERO & NOTES ───────────────────────────────────────
function populateNotes(notes) {
  const notesEl = document.getElementById('show-notes');
  const linesEl = document.getElementById('show-notes-lines');
  const lines = notes?.[showId];
  if (!notesEl || !linesEl || !Array.isArray(lines) || lines.length === 0) return;
  lines.forEach(({ line }) => {
    const p = document.createElement('p');
    p.className = 'show-notes-line'; // accent colour is assigned per line via :nth-child in CSS
    p.textContent = line;
    linesEl.appendChild(p);
  });
  notesEl.classList.add('has-notes');
}

function populateHero() {
  document.title = `Tijitoon - ${show.title}`;
  document.getElementById('show-title').textContent = show.title.toUpperCase();
  document.getElementById('pl-bg-title').textContent = show.title;
  document.getElementById('topbar-title').textContent = show.title.toUpperCase();
}

// ── DEAD-LINK REPORT ───────────────────────────────────
const FORMSPREE_URL = 'https://formspree.io/f/mjgqbkoo';

function resetReportBtn() {
  reportBtn.disabled = false;
  reportBtn.classList.remove('reported');
  reportBtn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> <span class="report-label">LIEN MORT</span>';
}

// ── EMBED SCALING ──────────────────────────────────────
// Some embeds break below a minimum width (mega: player collapses; archive.org /embed:
// controls overflow and clip on the right on narrow phones). Both ship at 640px wide, so
// render the iframe at that width and transform:scale() it down to fit, instead of padding.
const EMBED_SCALE_MIN_WIDTH = 640;
let scaleMinWidth = 0;
let megaScaleObserver = null;

function applyMegaScale() {
  const w = playerWrap.offsetWidth;
  if (!scaleMinWidth || w >= scaleMinWidth) {
    iframe.classList.remove('mega-scaled');
    iframe.style.width = '';
    iframe.style.height = '';
    iframe.style.transform = '';
  } else {
    const scale = w / scaleMinWidth;
    const scaledH = (w * 9 / 16) / scale;
    iframe.classList.add('mega-scaled');
    iframe.style.width  = scaleMinWidth + 'px';
    iframe.style.height = scaledH + 'px';
    iframe.style.transform = `scale(${scale})`;
  }
}

function clearMegaScale() {
  if (megaScaleObserver) { megaScaleObserver.disconnect(); megaScaleObserver = null; }
  scaleMinWidth = 0;
  iframe.classList.remove('mega-scaled');
  iframe.style.width = '';
  iframe.style.height = '';
  iframe.style.transform = '';
}

// ── FAKE FULLSCREEN (iOS + Google Drive) ───────────────
// iOS can't fullscreen Google Drive's cross-origin iframe player, so fake it:
// stretch .player-wrap over the viewport (.fake-fs) with an explicit ✕ exit
// button. Only shown for Drive embeds on iOS — see EPISODE_LOADERS.embed.
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function exitFakeFs() {
  playerWrap.classList.remove('fake-fs');
  fsExit.style.display = 'none';
  document.body.style.overflow = '';
}

// ── PLAYBACK GLUE ──────────────────────────────────────
// Hosts whose playable source must be resolved through a worker/API call first:
// show "Chargement…", fetch, then play whatever pickSource pulls out of the JSON
// payload ({ mp4 }, { m3u8 } or { sources } multi-quality; empty/null = dead link).
// The gen check drops responses that land after another episode was selected.
function resolveAndPlay(gen, ep, seasonIdx, fetchUrl, pickSource, fetchOpts) {
  placeholder.style.display = 'flex';
  placeholder.innerHTML = `<div class="pl-hint">Chargement…</div>`;
  fetch(fetchUrl, fetchOpts)
    .then(r => r.json())
    .then(json => {
      if (gen !== loadGen) return;
      const src = pickSource(json) || {};
      const hasSources = Array.isArray(src.sources) && src.sources.length > 0;
      if (!src.mp4 && !src.m3u8 && !hasSources) { showNoVideo(ep, seasonIdx); return; }
      placeholder.style.display = 'none';
      if (hasSources) playQualityMp4(src.sources);
      else if (src.mp4) playMp4(src.mp4);
      else playM3u8(src.m3u8);
    })
    .catch(err => {
      console.error(err);
      if (gen === loadGen) showNoVideo(ep, seasonIdx);
    });
}

// One loader per episode type (see getEpType). Each receives the episode, its
// parsed URL, the season index (for the "no video" placeholder) and the load
// generation (passed through to resolveAndPlay's stale-response guard).
const EPISODE_LOADERS = {
  vidmoly({ ep, seasonIdx }) {
    const id = ep.url.match(/embed-([a-z0-9]+)\.html/i)?.[1];
    if (!id) { showNoVideo(ep, seasonIdx); return; }
    playM3u8(`${EMBED_WORKER_URL}/vidmoly?id=${encodeURIComponent(id)}`);
  },

  sendvid({ ep, seasonIdx }) {
    const id = ep.url.match(/embed\/([a-z0-9]+)/i)?.[1];
    if (!id) { showNoVideo(ep, seasonIdx); return; }
    playMp4(`${EMBED_WORKER_URL}/sendvid?id=${encodeURIComponent(id)}`);
  },

  uqload({ ep, seasonIdx, gen }) {
    const id = ep.url.match(/embed-([a-z0-9]+)\.html/)?.[1];
    if (!id) { showNoVideo(ep, seasonIdx); return; }
    resolveAndPlay(gen, ep, seasonIdx, `${CRIMSON_WORKER_URL}/uqload?id=${id}`,
      ({ url }) => ({ m3u8: url }));
  },

  vidzy({ ep, seasonIdx, gen }) {
    const id = ep.url.match(/embed-([a-z0-9]+)\.html/)?.[1];
    if (!id) { showNoVideo(ep, seasonIdx); return; }
    resolveAndPlay(gen, ep, seasonIdx, `${CRIMSON_WORKER_URL}/vidzy?id=${id}`,
      ({ url }) => ({ m3u8: url }));
  },

  pcloud({ ep, epUrl, seasonIdx, gen }) {
    // direct links expire after a few hours - resolve a fresh one per play
    const code = epUrl.searchParams.get('code');
    if (!code) { showNoVideo(ep, seasonIdx); return; }
    const api = epUrl.hostname.startsWith('e.') ? 'eapi' : 'api'; // e.pcloud.link = EU datacenter
    // pcloud rejects requests with a foreign Referer ("Invalid link referer", result 7010)
    resolveAndPlay(gen, ep, seasonIdx,
      `https://${api}.pcloud.com/getpublinkdownload?code=${encodeURIComponent(code)}`,
      j => j.result === 0 && j.hosts?.length ? { mp4: 'https://' + j.hosts[0] + j.path } : null,
      { referrerPolicy: 'no-referrer' });
  },

  sibnet({ ep, epUrl, seasonIdx, gen }) {
    const id = epUrl.searchParams.get('videoid');
    if (!id) { showNoVideo(ep, seasonIdx); return; }
    resolveAndPlay(gen, ep, seasonIdx, `${EMBED_WORKER_URL}/sibnet?id=${encodeURIComponent(id)}`,
      ({ type: srcType, url }) => srcType === 'mp4' ? { mp4: url } : { m3u8: url });
  },

  ojamajo({ epUrl }) {
    const uuid = epUrl.pathname.split('/').pop();
    playM3u8(`${OJAMAJO_WORKER_URL}/ojamajo/playlist?uuid=${encodeURIComponent(uuid)}`);
  },

  redirect({ ep, epUrl, seasonIdx }) {
    placeholder.style.display = 'flex';
    placeholder.innerHTML = `
      <div class="pl-ep-label">S${seasonIdx + 1} - Épisode ${esc(ep.num)}</div>
      <a class="player-external-link" href="${esc(ep.url)}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-play"></i> Regarder sur ${esc(epUrl.hostname)}</a>`;
  },

  abysscdn({ ep, epUrl, seasonIdx, gen }) {
    // worker /sources returns { source, sources } with ready-to-play worker stream
    // URLs (all qualities, highest first, 360p excluded) → quality gear, exactly
    // like dessinanime.
    const v = epUrl.searchParams.get('v') || epUrl.pathname.split('/').pop();
    if (!v) { showNoVideo(ep, seasonIdx); return; }
    resolveAndPlay(gen, ep, seasonIdx,
      `${ABYSSCDN_WORKER_URL}/abysscdn/sources?v=${encodeURIComponent(v)}`,
      ({ source, sources }) => ({ sources, mp4: source }));
  },

  dessinanime({ ep, seasonIdx, gen }) {
    // floralstar returns sources[] (all qualities, highest first) → quality gear.
    resolveAndPlay(gen, ep, seasonIdx,
      `${DESSINANIME_WORKER_URL}/dessinanime?url=${encodeURIComponent(ep.url)}`,
      ({ source, sources }) => ({ sources, mp4: source }));
  },

  seekplayer({ epUrl }) {
    const id = epUrl.hash.slice(1);
    playM3u8(`${LOUDAPE_PROXY_URL}/?id=${encodeURIComponent(id)}`);
  },

  embedseek({ ep, epUrl, seasonIdx, gen }) {
    const id = epUrl.hash.slice(1);
    if (!id) { showNoVideo(ep, seasonIdx); return; }
    resolveAndPlay(gen, ep, seasonIdx, `${CRIMSON_WORKER_URL}/embedseek?id=${encodeURIComponent(id)}`,
      ({ url }) => ({ m3u8: url }));
  },

  mp4({ ep }) {
    playMp4(ep.url.includes('player.odycdn.com') ? odycdnProxyUrl(ep.url) : ep.url);
  },

  m3u8({ ep }) {
    const needsProxy = ep.url.includes('senpai-stream.club') || ep.url.includes('nakastream.tv');
    const src = needsProxy
      ? `${LOUDAPE_PROXY_URL}/?url=${encodeURIComponent(ep.url)}`
      : ep.url;
    playM3u8(src);
  },

  embed({ ep, epUrl }) {
    const host = epUrl.hostname;
    const sandboxVal = SANDBOX_PERMISSIONS[host] ?? DEFAULT_SANDBOX;
    if (sandboxVal) iframe.setAttribute('sandbox', sandboxVal);
    else iframe.removeAttribute('sandbox');
    iframe.src = ep.url;
    iframe.style.display = 'block';
    fsBtn.style.display = (isIOS && host === 'drive.google.com') ? 'inline-block' : 'none';
    if (host === 'mega.nz' || (host === 'archive.org' && epUrl.pathname.startsWith('/embed'))) {
      scaleMinWidth = EMBED_SCALE_MIN_WIDTH;
    }
    if (scaleMinWidth) {
      applyMegaScale();
      megaScaleObserver = new ResizeObserver(applyMegaScale);
      megaScaleObserver.observe(playerWrap);
    }
  },
};

function loadEpisode(ep, seasonIdx) {
  const gen = ++loadGen;
  destroyArt(); // also hides + clears the legacy <video>
  iframe.style.display = 'none'; iframe.src = 'about:blank';
  placeholder.style.display = 'none';
  placeholder.className = 'player-placeholder';
  fsBtn.style.display = 'none';
  clearMegaScale();

  if (!ep.url) { showNoVideo(ep, seasonIdx); return; }
  let epUrl;
  try { epUrl = new URL(ep.url); } catch (_) { showNoVideo(ep, seasonIdx); return; }
  if (!/^https?:$/.test(epUrl.protocol)) { showNoVideo(ep, seasonIdx); return; }

  const loader = EPISODE_LOADERS[getEpType(ep)] || EPISODE_LOADERS.embed;
  loader({ ep, epUrl, seasonIdx, gen });
}

function showUnavailable(label, msg) {
  placeholder.style.display = 'flex';
  placeholder.innerHTML = `
    <div class="pl-ep-label">${esc(label)}</div>
    <div class="pl-unavail">${esc(msg)}</div>`;
}

function showNoVideo(ep, seasonIdx) {
  showUnavailable(`S${seasonIdx + 1} - Épisode ${ep.num}`, "Vidéo non disponible pour l'instant");
}

// ── INIT ───────────────────────────────────────────────
// A failed data.json fetch redirects to 404 (nothing to show); bugs in the render
// path are not swallowed — they surface in the console as uncaught errors.
Promise.all([
  fetchJson('data.json').catch(err => { console.error(err); return null; }),
  fetchJson('notes.json').catch(() => null)
]).then(([data, notes]) => {
  if (!data) return window.location.replace('404');
  show = data[showId];
  if (!show) return window.location.replace('404');

  flatEps = show.seasons.flatMap((s, si) =>
    s.episodes.map((ep, ei) => ({ seasonIdx: si, epIdx: ei, ep }))
  );

  populateNotes(notes);
  populateHero();
  buildSeasonTabs();
  buildEpGrid(0);

  const urlEp = readUrlEp();
  const saved = loadProgress();

  if (urlEp) {
    const { season: si, ep: ei } = urlEp;
    const s = show.seasons[si];
    if (ei === null) {
      placeholder.style.display = 'flex';
      if (s) {
        if (si !== 0) switchSeason(si);
      } else {
        showUnavailable(`S${si + 1}`, 'Saison introuvable');
      }
    } else if (s && s.episodes[ei]) {
      syncEpUrl(si, ei);
      if (si !== 0) switchSeason(si);
      selectEp(si, ei, s.episodes[ei], true);
    } else {
      showUnavailable(`S${si + 1} - Épisode ${ei + 1}`, 'Épisode introuvable');
    }
  } else if (saved) {
    const { season: si, ep: ei } = saved;
    const s = show.seasons[si]; const ep = s?.episodes[ei];
    if (s && ep) {
      syncEpUrl(si, ei);
      if (si !== 0) switchSeason(si);
      selectEp(si, ei, ep, false);
    } else {
      placeholder.style.display = 'flex';
    }
  } else {
    placeholder.style.display = 'flex';
  }
});

// ── WIRING ─────────────────────────────────────────────
epSearchToggle.addEventListener('click', () => {
  const isOpen = epSearchWrap.classList.contains('open');
  if (isOpen) {
    collapseSearch();
  } else {
    epSearchWrap.classList.add('open');
    epSearchToggle.classList.add('active');
    epSearch.focus();
  }
});

epSearch.addEventListener('input', () => {
  epSearchClear.classList.toggle('visible', epSearch.value.length > 0);
  applySearch(epSearch.value);
});

epSearchClear.addEventListener('click', () => {
  collapseSearch();
  epSearch.blur();
});

epvGrid.addEventListener('click', () => {
  epViewMode = 'grid';
  localStorage.setItem(EP_VIEW_KEY, epViewMode);
  applyEpView();
  computePageSize();
  if (isPlayingInCurrentSeason()) currentPage = Math.floor(currentEp / pageSize);
  renderPage();
});

epvList.addEventListener('click', () => {
  epViewMode = 'list';
  localStorage.setItem(EP_VIEW_KEY, epViewMode);
  applyEpView();
  renderPage();
  if (isPlayingInCurrentSeason()) scrollRowIntoView(currentSeason, currentEp);
});

epPagePrev.addEventListener('click', () => { currentPage--; renderPage(); replayAnim(epGrid); });
epPageNext.addEventListener('click', () => { currentPage++; renderPage(); replayAnim(epGrid); });

btnPrev.addEventListener('click', () => navigateEp(-1));
btnNext.addEventListener('click', () => navigateEp(1));

// Show-notes expander (only present when notes.json has lines for this series).
const showNotesEl     = document.getElementById('show-notes');
const showNotesToggle = document.getElementById('show-notes-toggle');
const showNotesLines  = document.getElementById('show-notes-lines');
if (showNotesToggle && showNotesEl && showNotesLines) {
  showNotesToggle.addEventListener('click', () => {
    const expanded = showNotesEl.classList.toggle('expanded');
    // Animate to the exact content height on open, back to 0 on close.
    showNotesLines.style.maxHeight = expanded ? `${showNotesLines.scrollHeight}px` : '0';
    showNotesToggle.setAttribute('aria-expanded', String(expanded));
    showNotesToggle.innerHTML = expanded
      ? '<i class="fa-solid fa-caret-up"></i> RÉDUIRE'
      : '<i class="fa-solid fa-caret-down"></i> LIRE PLUS';
  });
}

fsBtn.addEventListener('click', () => {
  playerWrap.classList.add('fake-fs');
  fsExit.style.display = 'block';
  document.body.style.overflow = 'hidden';
});
fsExit.addEventListener('click', exitFakeFs);

reportBtn.addEventListener('click', () => {
  if (!reportCtx || reportBtn.disabled) return;
  reportBtn.disabled = true;
  reportBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span class="report-label">ENVOI…</span>';
  fetch(FORMSPREE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      serie: reportCtx.show,
      episode: `${reportCtx.label} - ${reportCtx.title}`,
      numero: reportCtx.num,
      lien: reportCtx.url,
      page: location.href
    })
  })
    .then(r => {
      if (!r.ok) throw new Error('formspree ' + r.status);
      reportBtn.classList.add('reported');
      reportBtn.innerHTML = '<i class="fa-solid fa-check"></i> <span class="report-label">SIGNALÉ</span>';
    })
    .catch(() => {
      reportBtn.disabled = false;
      reportBtn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> <span class="report-label">RÉESSAYER</span>';
    });
});

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const prevSize = pageSize;
    computePageSize();
    if (pageSize !== prevSize) {
      currentPage = currentEp !== -1 ? Math.floor(currentEp / pageSize) : 0;
      renderPage();
    }
  }, 150);
});

applyEpView();

// ── KEYBOARD SHORTCUTS (direct <video> only) ───────────
// Inactive while an iframe embed is playing (cross-origin, not scriptable).
// ArtPlayer's own hotkeys are disabled (see playArt in player.js) because they only
// fire once the player has been clicked — this global handler owns every key instead.
document.addEventListener('keydown', (e) => {
  // Don't hijack typing in search fields, and ignore modified shortcuts.
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  const v = mediaEl();
  if (!v) return;

  switch (e.key) {
    case ' ':
    case 'k':
      e.preventDefault();
      if (v.paused) v.play(); else v.pause();
      break;
    case 'ArrowRight':
      e.preventDefault();
      v.currentTime = Math.min(v.duration || Infinity, v.currentTime + 10);
      break;
    case 'ArrowLeft':
      e.preventDefault();
      v.currentTime = Math.max(0, v.currentTime - 10);
      break;
    case 'm':
      e.preventDefault();
      v.muted = !v.muted;
      break;
    case 'f':
      e.preventDefault();
      toggleFullscreen();
      break;
    case 'n':
      e.preventDefault();
      navigateEp(1);
      break;
    case 'p':
      e.preventDefault();
      navigateEp(-1);
      break;
  }
});
