const params = new URLSearchParams(location.search);
const showId = params.get('series') || params.get('id');
if (!showId || !/^[\w-]+$/.test(showId)) window.location.replace('404.html');

const iframe         = document.getElementById('player-iframe');
const placeholder    = document.getElementById('player-placeholder');
const epGrid      = document.getElementById('ep-grid');
const epListWrap  = document.getElementById('ep-list-wrap');
const epPagination = document.getElementById('ep-pagination');
const epPagePrev   = document.getElementById('ep-page-prev');
const epPageNext   = document.getElementById('ep-page-next');
const epPageInfo   = document.getElementById('ep-page-info');
let PAGE_SIZE = 10;
let currentPage = 0;

function clamp(min, val, max) { return Math.min(max, Math.max(min, val)); }

function computePageSize() {
  const gridWidth = epGrid.offsetWidth || epGrid.parentElement?.offsetWidth || 0;
  if (!gridWidth) return;
  const gap = 8;
  const minCard = clamp(100, gridWidth * 0.08, 160);
  const perRow = Math.max(1, Math.floor((gridWidth + gap) / (minCard + gap)));
  PAGE_SIZE = perRow * 4;
}

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const prevSize = PAGE_SIZE;
    computePageSize();
    if (PAGE_SIZE !== prevSize) {
      currentPage = currentEp !== -1 ? Math.floor(currentEp / PAGE_SIZE) : 0;
      renderPage();
    }
  }, 150);
});
const seasonTabs  = document.getElementById('season-tabs');
const epSearch       = document.getElementById('ep-search');
const epSearchClear  = document.getElementById('ep-search-clear');
const epSearchWrap   = document.getElementById('ep-search-wrap');
const epSearchToggle = document.getElementById('ep-search-toggle');

const epCountLabel = document.getElementById('ep-count-label');

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

function collapseSearch() {
  epSearch.value = '';
  epSearchClear.classList.remove('visible');
  epSearchWrap.classList.remove('open');
  epSearchToggle.classList.remove('active');
  applySearch('', false);
}
const noResults   = document.getElementById('ep-no-results');

let epViewMode = localStorage.getItem('tijitoon_ep_view') || 'grid';

const epvGrid = document.getElementById('epv-grid');
const epvList = document.getElementById('epv-list');
function applyEpView() {
  const isList = epViewMode === 'list';
  epGrid.style.display       = isList ? 'none' : '';
  epListWrap.classList.toggle('active', isList);
  epvGrid.classList.toggle('active', !isList);
  epvList.classList.toggle('active', isList);
}
function isPlayingInCurrentSeason() {
  return currentEp !== -1 && flatEps[currentPos]?.seasonIdx === currentSeason;
}

epvGrid.addEventListener('click', () => {
  epViewMode = 'grid';
  localStorage.setItem('tijitoon_ep_view', epViewMode);
  applyEpView();
  computePageSize();
  if (isPlayingInCurrentSeason()) currentPage = Math.floor(currentEp / PAGE_SIZE);
  renderPage();
});

epvList.addEventListener('click', () => {
  epViewMode = 'list';
  localStorage.setItem('tijitoon_ep_view', epViewMode);
  applyEpView();
  renderPage();
  if (isPlayingInCurrentSeason() && epListRows[currentSeason]?.[currentEp]) {
    setTimeout(() => epListRows[currentSeason][currentEp].scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);
  }
});
applyEpView();

// ── SHOW NOTES TOGGLE ──
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

const playerWrap = document.getElementById('player-wrap');
// TODO TEMP
const fsBtn = document.getElementById('fs-btn');
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const fsExit = document.getElementById('fs-exit');

function exitFakeFs() {
  playerWrap.classList.remove('fake-fs');
  fsExit.style.display = 'none';
  document.body.style.overflow = '';
}

fsBtn.addEventListener('click', () => {
  playerWrap.classList.add('fake-fs');
  fsExit.style.display = 'block';
  document.body.style.overflow = 'hidden';
});

fsExit.addEventListener('click', exitFakeFs);
// END TODO TEMP

const SANDBOX_PERMISSIONS = {
  'ojamajo.moe':        'allow-scripts allow-popups allow-forms',
  'archive.org':        'allow-scripts allow-same-origin allow-popups allow-forms allow-presentation',
  '1drv.ms':            'allow-scripts allow-same-origin allow-popups allow-forms allow-presentation'
};
const DEFAULT_SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-presentation';

// const ODYCDN_PROXY_URL = 'https://great-lorikeet-66.roughrecipe.deno.net/'; // deno fallback
const CRIMSON_WORKER_URL    = 'https://crimson-night-b851.ritatohme99.workers.dev';
const DESSINANIME_WORKER_URL = 'https://floral-star-ca2f.ritaclifford99.workers.dev';
const ODYCDN_PROXY_URL   = CRIMSON_WORKER_URL + '/';
const LOUDAPE_PROXY_URL   = 'https://loud-ape-44.roughrecipe.deno.net';
const OJAMAJO_WORKER_URL  = 'https://rapid-lab-6552.ritaclifford95.workers.dev';
const EMBED_WORKER_URL    = 'https://flaky-sturgeon-55.roughrecipe.deno.net';
// abysscdn-worker-v2: streams AbyssCDN as seekable MP4.
const ABYSSCDN_WORKER_URL = 'https://noisy-hill-3a3b.ritaclifford99.workers.dev';

function odycdnProxyUrl(mp4Url) {
  return ODYCDN_PROXY_URL + '?url=' + encodeURIComponent(mp4Url);
}

function getEpType(ep) {
  if (ep.type) return ep.type;
  if (ep.url?.includes('abysscdn.com') || ep.url?.includes('playhydrax.com') || ep.url?.includes('zplayer.io')) return 'abysscdn';
  if (ep.url?.includes('dessinanime.cc')) return 'dessinanime';
  if (ep.url?.includes('mhd.seekplayer.me')) return 'seekplayer';
  if (ep.url?.includes('embedseek.com')) return 'embedseek';
  if (ep.url?.includes('player.ojamajo.moe/videos/watch')) return 'ojamajo';
  if (ep.url?.includes('uqload.is/embed-')) return 'uqload';
  if (ep.url?.includes('vidzy.live/embed-')) return 'vidzy';
  if (ep.url?.includes('vidmoly.biz/embed-')) return 'vidmoly';
  if (ep.url?.includes('sendvid.com/embed/')) return 'sendvid';
  if (ep.url?.includes('video.sibnet.ru/shell.php')) return 'sibnet';
  if (ep.url?.includes('pcloud.link/publink') || ep.url?.includes('pcloud.com/publink')) return 'pcloud';
  // if (ep.url?.endsWith('.mp4')) return 'mp4';
  if (ep.url?.endsWith('.mp4') && !ep.url.includes('archive.org/embed')) return 'mp4';
  if (ep.url?.endsWith('.m3u8')) return 'm3u8';
  return 'embed';
}

let show          = null;
let currentSeason = 0;
let currentEp     = -1;
let currentPos    = -1;
let flatEps       = [];
let epCards       = [];
let epListRows    = [];
let isRestoringFromHistory = false;
const seasonPages = {};

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

function buildUrl(si, ei) {
  const u = new URLSearchParams();
  u.set('series', showId); u.set('season', si + 1); u.set('ep', ei + 1);
  return `${location.pathname}?${u}`;
}
function pushEpUrl(si, ei) {
  history.replaceState({ series: showId, season: si, ep: ei }, '', buildUrl(si, ei));
}
function readUrlEp() {
  const s = parseInt(params.get('season'), 10);
  const e = parseInt(params.get('ep'), 10);
  if (isNaN(s) || s < 1) return null;
  if (!isNaN(e) && e >= 1) return { season: s - 1, ep: e - 1 };
  return { season: s - 1, ep: null };
}

Promise.all([
  fetch('data.json').then(r => r.ok ? r.json() : Promise.reject()),
  fetch('notes.json').then(r => r.ok ? r.json() : null).catch(() => null)
])
  .then(([data, notes]) => {
    show = data[showId];
    if (!show) return window.location.replace('404.html');

    flatEps = show.seasons.flatMap((s, si) =>
      s.episodes.map((ep, ei) => ({ seasonIdx: si, epIdx: ei, ep }))
    );

    populateNotes(notes);
    populateHero();
    buildSeasonTabs();
    buildEpGrid(0);

    const urlEp = readUrlEp();
    const saved  = loadProgress();

    if (urlEp) {
      const { season: si, ep: ei } = urlEp;
      const s = show.seasons[si];
      if (ei === null) {
        placeholder.style.display = 'flex';
        if (s) {
          if (si !== 0) switchSeason(si);
        } else {
          placeholder.innerHTML = `
            <div class="pl-ep-label">S${si + 1}</div>
            <div class="pl-unavail">Saison introuvable</div>`;
        }
      } else if (s && s.episodes[ei]) {
        history.replaceState({ series: showId, season: si, ep: ei }, '', buildUrl(si, ei));
        if (si !== 0) switchSeason(si);
        selectEp(si, ei, s.episodes[ei], true);
      } else {
        placeholder.style.display = 'flex';
        placeholder.innerHTML = `
          <div class="pl-ep-label">S${si + 1} - Épisode ${ei + 1}</div>
          <div class="pl-unavail">Épisode introuvable</div>`;
      }
    } else if (saved) {
      const { season: si, ep: ei } = saved;
      const s = show.seasons[si]; const ep = s?.episodes[ei];
      if (s && ep) {
        history.replaceState({ series: showId, season: si, ep: ei }, '', buildUrl(si, ei));
        if (si !== 0) switchSeason(si);
        selectEp(si, ei, ep, false);
      } else {
        placeholder.style.display = 'flex';
      }
    } else {
      placeholder.style.display = 'flex';
    }
  })
  .catch(() => window.location.replace('404.html'));

window.addEventListener('popstate', e => {
  if (!show || !e.state || e.state.series !== showId) return;
  const { season: si, ep: ei } = e.state;
  const s = show.seasons[si]; const ep = s?.episodes[ei];
  if (!s || !ep) return;
  isRestoringFromHistory = true;
  if (si !== currentSeason) switchSeason(si);
  selectEp(si, ei, ep, false);
  isRestoringFromHistory = false;
});

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
  const playingHere = currentEp !== -1 && flatEps[currentPos]?.seasonIdx === i;
  currentPage = playingHere && seasonPages[i] !== undefined ? seasonPages[i] : 0;
  collapseSearch();
  seasonTabs.querySelectorAll('.season-pill').forEach((btn, j) => btn.classList.toggle('active', j === i));
  const countEl = document.getElementById('season-ep-count');
  if (countEl) countEl.textContent = `- ${show.seasons[i].name || `Saison ${i + 1}`}`;
  buildEpGrid(i);
  if (epViewMode === 'list' && playingHere && epListRows[i]?.[currentEp]) {
    setTimeout(() => epListRows[i][currentEp].scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);
  } else {
    epListWrap.scrollTop = 0;
  }
  [epGrid, epListWrap].forEach(el => {
    el.classList.remove('season-switching');
    void el.offsetWidth;
    el.classList.add('season-switching');
  });
}

function buildEpGrid(seasonIdx) {
  epGrid.innerHTML = '';
  epListWrap.innerHTML = '';
  epCards[seasonIdx]    = [];
  epListRows[seasonIdx] = [];
  const season = show.seasons[seasonIdx];
  const count  = season.episodes.length;
  document.getElementById('ep-count-label').textContent = `${count} épisode${count > 1 ? 's' : ''}`;

  season.episodes.forEach((ep, i) => {
    const hasUrl = !!ep.url;
    const numStr = `E${String(ep.num).padStart(2,'0')}`;

    const handler = () => {
      collapseSearch();
      selectEp(seasonIdx, i, ep, true);
      if (!isRestoringFromHistory) pushEpUrl(seasonIdx, i);
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

epSearch.addEventListener('input', () => {
  epSearchClear.classList.toggle('visible', epSearch.value.length > 0);
  applySearch(epSearch.value);
});
epSearchClear.addEventListener('click', () => {
  collapseSearch();
  epSearch.blur();
});

function applySearch(q, resetPage = true) {
  const query = normalize(q.trim());
  if (resetPage) currentPage = 0;
  renderPage(query);
}

function renderPage(query) {
  query = query ?? normalize(epSearch.value.trim());
  const cards = Array.from(epGrid.querySelectorAll('.ep-card'));
  const rows  = Array.from(epListWrap.querySelectorAll('.ep-list-row'));

  const matchedCards = cards.filter(c => !query || c.dataset.search.includes(query));
  const matchedRows  = rows.filter(r => !query || r.dataset.search.includes(query));

  const total = matchedCards.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  currentPage = Math.max(0, Math.min(currentPage, totalPages - 1));

  const start = currentPage * PAGE_SIZE;
  const end   = start + PAGE_SIZE;

  cards.forEach(c => c.style.display = 'none');
  matchedCards.slice(start, end).forEach(c => c.style.display = '');
  rows.forEach(r => r.style.display = matchedRows.includes(r) ? '' : 'none');

  noResults.style.display = total === 0 ? 'block' : 'none';
  epListWrap.classList.toggle('is-empty', total === 0);

  if (total > PAGE_SIZE && epViewMode === 'grid') {
    epPagination.classList.add('visible');
    epPageInfo.textContent = `${start + 1}–${Math.min(end, total)} / ${total}`;
    epPagePrev.disabled = currentPage === 0;
    epPageNext.disabled = currentPage >= totalPages - 1;
  } else {
    epPagination.classList.remove('visible');
  }
}

function flashEpGrid() {
  epGrid.classList.remove('season-switching');
  void epGrid.offsetWidth;
  epGrid.classList.add('season-switching');
}

epPagePrev.addEventListener('click', () => { currentPage--; renderPage(); flashEpGrid(); });
epPageNext.addEventListener('click', () => { currentPage++; renderPage(); flashEpGrid(); });

function selectEp(seasonIdx, epIdx, ep, doSave) {
  currentEp  = epIdx;
  currentPos = flatEps.findIndex(e => e.seasonIdx === seasonIdx && e.epIdx === epIdx);
  currentPage = Math.floor(currentEp / PAGE_SIZE);
  seasonPages[seasonIdx] = currentPage;

  renderPage();

  if (epCards[seasonIdx])   epCards[seasonIdx].forEach((c, j)   => c.classList.toggle('playing', j === epIdx));
  if (epListRows[seasonIdx]) {
    epListRows[seasonIdx].forEach((r, j) => {
      r.classList.toggle('playing', j === epIdx);
      if (j === epIdx && epViewMode === 'list') setTimeout(() => r.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);
    });
  }

  const sLabel = `S${String(seasonIdx + 1).padStart(2,'0')}E${String(ep.num).padStart(2,'0')}`;
  document.getElementById('ep-now-playing').innerHTML = `<span class="np-code">${sLabel}</span><span class="np-title"> - ${esc(ep.title)}</span>`;
  document.getElementById('ep-nav-counter').textContent = `${currentPos + 1} / ${flatEps.length}`;
  document.getElementById('btn-prev').disabled = currentPos <= 0;
  document.getElementById('btn-next').disabled = currentPos >= flatEps.length - 1;

  reportCtx = { show: show.title, label: sLabel, num: ep.num, title: ep.title, url: ep.url || '(aucune)' };
  resetReportBtn();

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
  if (!isRestoringFromHistory) pushEpUrl(next.seasonIdx, next.epIdx);
}

document.getElementById('btn-prev').addEventListener('click', () => navigateEp(-1));
document.getElementById('btn-next').addEventListener('click', () => navigateEp(1));

const FORMSPREE_URL = 'https://formspree.io/f/mjgqbkoo';
const reportBtn = document.getElementById('btn-report');
let reportCtx = null;

function resetReportBtn() {
  reportBtn.disabled = false;
  reportBtn.classList.remove('reported');
  reportBtn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> <span class="report-label">LIEN MORT</span>';
}

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

// Playback itself (ArtPlayer / hls.js / native fallback) lives in player.js:
// playM3u8 / playMp4 / playQualityMp4 / destroyArt / mediaEl / toggleFullscreen.

let loadGen = 0;

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
    .catch(() => { if (gen === loadGen) showNoVideo(ep, seasonIdx); });
}

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

  const type = getEpType(ep);

  if (type === 'vidmoly') {
    const id = ep.url.match(/embed-([a-z0-9]+)\.html/i)?.[1];
    if (!id) { showNoVideo(ep, seasonIdx); return; }
    playM3u8(`${EMBED_WORKER_URL}/vidmoly?id=${encodeURIComponent(id)}`);
  } else if (type === 'sendvid') {
    const id = ep.url.match(/embed\/([a-z0-9]+)/i)?.[1];
    if (!id) { showNoVideo(ep, seasonIdx); return; }
    playMp4(`${EMBED_WORKER_URL}/sendvid?id=${encodeURIComponent(id)}`);
  } else if (type === 'uqload') {
    const id = ep.url.match(/embed-([a-z0-9]+)\.html/)?.[1];
    if (!id) { showNoVideo(ep, seasonIdx); return; }
    resolveAndPlay(gen, ep, seasonIdx, `${CRIMSON_WORKER_URL}/uqload?id=${id}`,
      ({ url }) => ({ m3u8: url }));
  } else if (type === 'vidzy') {
    const id = ep.url.match(/embed-([a-z0-9]+)\.html/)?.[1];
    if (!id) { showNoVideo(ep, seasonIdx); return; }
    resolveAndPlay(gen, ep, seasonIdx, `${CRIMSON_WORKER_URL}/vidzy?id=${id}`,
      ({ url }) => ({ m3u8: url }));
  } else if (type === 'pcloud') {
    // direct links expire after a few hours - resolve a fresh one per play
    const code = epUrl.searchParams.get('code');
    if (!code) { showNoVideo(ep, seasonIdx); return; }
    const api = epUrl.hostname.startsWith('e.') ? 'eapi' : 'api'; // e.pcloud.link = EU datacenter
    // pcloud rejects requests with a foreign Referer ("Invalid link referer", result 7010)
    resolveAndPlay(gen, ep, seasonIdx,
      `https://${api}.pcloud.com/getpublinkdownload?code=${encodeURIComponent(code)}`,
      j => j.result === 0 && j.hosts?.length ? { mp4: 'https://' + j.hosts[0] + j.path } : null,
      { referrerPolicy: 'no-referrer' });
  } else if (type === 'sibnet') {
    const id = epUrl.searchParams.get('videoid');
    if (!id) { showNoVideo(ep, seasonIdx); return; }
    resolveAndPlay(gen, ep, seasonIdx, `${EMBED_WORKER_URL}/sibnet?id=${encodeURIComponent(id)}`,
      ({ type: srcType, url }) => srcType === 'mp4' ? { mp4: url } : { m3u8: url });
  } else if (type === 'ojamajo') {
    const uuid = epUrl.pathname.split('/').pop();
    playM3u8(`${OJAMAJO_WORKER_URL}/ojamajo/playlist?uuid=${encodeURIComponent(uuid)}`);
  } else if (type === 'redirect') {
    placeholder.style.display = 'flex';
    placeholder.innerHTML = `
      <div class="pl-ep-label">S${seasonIdx + 1} - Épisode ${esc(ep.num)}</div>
      <a class="player-external-link" href="${esc(ep.url)}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-play"></i> Regarder sur ${esc(epUrl.hostname)}</a>`;
  } else if (type === 'abysscdn') {
    // worker decrypts AbyssCDN and streams a seekable MP4 directly to <video>
    const v = epUrl.searchParams.get('v') || epUrl.pathname.split('/').pop();
    if (!v) { showNoVideo(ep, seasonIdx); return; }
    playMp4(`${ABYSSCDN_WORKER_URL}/abysscdn?v=${encodeURIComponent(v)}`);
  } else if (type === 'dessinanime') {
    // floralstar returns sources[] (all qualities, highest first) → quality gear.
    resolveAndPlay(gen, ep, seasonIdx,
      `${DESSINANIME_WORKER_URL}/dessinanime?url=${encodeURIComponent(ep.url)}`,
      ({ source, sources }) => ({ sources, mp4: source }));
  } else if (type === 'seekplayer') {
    const id = epUrl.hash.slice(1);
    playM3u8(`${LOUDAPE_PROXY_URL}/?id=${encodeURIComponent(id)}`);
  } else if (type === 'embedseek') {
    const id = epUrl.hash.slice(1);
    if (!id) { showNoVideo(ep, seasonIdx); return; }
    resolveAndPlay(gen, ep, seasonIdx, `${CRIMSON_WORKER_URL}/embedseek?id=${encodeURIComponent(id)}`,
      ({ url }) => ({ m3u8: url }));
  } else if (type === 'mp4') {
    playMp4((ep.odysee || ep.url.includes('player.odycdn.com')) ? odycdnProxyUrl(ep.url) : ep.url);
  } else if (type === 'm3u8') {
    const src = ep.url.includes('senpai-stream.club')
      ? `${LOUDAPE_PROXY_URL}/?url=${encodeURIComponent(ep.url)}`
      : ep.url;
    playM3u8(src);
  } else {
    const host = epUrl.hostname;
    const sandboxVal = SANDBOX_PERMISSIONS[host] ?? DEFAULT_SANDBOX;
    if (sandboxVal) iframe.setAttribute('sandbox', sandboxVal);
    else iframe.removeAttribute('sandbox');
    iframe.src = ep.url;
    iframe.style.display = 'block';
    fsBtn.style.display = (isIOS && host === 'drive.google.com') ? 'inline-block' : 'none'; // TODO TEMP
    if (host === 'mega.nz' || (host === 'archive.org' && epUrl.pathname.startsWith('/embed'))) {
      scaleMinWidth = EMBED_SCALE_MIN_WIDTH;
    }
    if (scaleMinWidth) {
      applyMegaScale();
      megaScaleObserver = new ResizeObserver(applyMegaScale);
      megaScaleObserver.observe(playerWrap);
    }
  }
}

function showNoVideo(ep, seasonIdx) {
  placeholder.style.display = 'flex';
  placeholder.innerHTML = `
    <div class="pl-ep-label">S${seasonIdx + 1} - Épisode ${esc(ep.num)}</div>
    <div class="pl-unavail">Vidéo non disponible pour l'instant</div>`;
}

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
