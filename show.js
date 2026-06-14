const params = new URLSearchParams(location.search);
const showId = params.get('series') || params.get('id');
if (!showId || !/^[\w-]+$/.test(showId)) window.location.replace('404.html');

const iframe         = document.getElementById('player-iframe');
const video          = document.getElementById('player-video');
const placeholder    = document.getElementById('player-placeholder');
const audioBtn       = document.getElementById('audio-track-btn');
const audioMenu      = document.getElementById('audio-track-menu');

audioBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpen = audioMenu.style.display === 'block';
  audioMenu.style.display = isOpen ? 'none' : 'block';
});
audioMenu.addEventListener('click', (e) => { e.stopPropagation(); });
document.addEventListener('click', () => { audioMenu.style.display = 'none'; });

function buildAudioMenu(tracks, hlsInstance) {
  audioMenu.innerHTML = '';
  tracks.forEach((t, i) => {
    const btn = document.createElement('button');
    btn.textContent = t.name || t.lang || `Track ${i + 1}`;
    if (i === hlsInstance.audioTrack) btn.classList.add('active');
    btn.addEventListener('click', () => {
      hlsInstance.audioTrack = i;
      audioMenu.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      audioBtn.textContent = btn.textContent;
      audioMenu.style.display = 'none';
    });
    audioMenu.appendChild(btn);
  });
  audioBtn.textContent = tracks[hlsInstance.audioTrack]?.name || tracks[hlsInstance.audioTrack]?.lang || 'AUDIO';
  audioBtn.removeAttribute('disabled');
  audioBtn.style.display = 'block';
}

function hideAudioMenu() {
  audioBtn.style.display = 'none';
  audioMenu.style.display = 'none';
  audioMenu.innerHTML = '';
}
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
    epCountLabel.style.display = 'none';
    epSearch.focus();
  }
});

function collapseSearch() {
  epSearch.value = '';
  epSearchClear.classList.remove('visible');
  epSearchWrap.classList.remove('open');
  epCountLabel.style.display = '';
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
};
const DEFAULT_SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-presentation';

// const ODYCDN_PROXY_URL = 'https://great-lorikeet-66.roughrecipe.deno.net/'; // deno fallback
const CRIMSON_WORKER_URL = 'https://crimson-night-b851.ritatohme99.workers.dev';
const ODYCDN_PROXY_URL   = CRIMSON_WORKER_URL + '/';
const LOUDAPE_PROXY_URL   = 'https://loud-ape-44.roughrecipe.deno.net';
const OJAMAJO_WORKER_URL  = 'https://rapid-lab-6552.ritaclifford95.workers.dev';
const EMBED_WORKER_URL    = 'https://flaky-sturgeon-55.roughrecipe.deno.net';

function odycdnProxyUrl(mp4Url) {
  return ODYCDN_PROXY_URL + '?url=' + encodeURIComponent(mp4Url);
}

function getEpType(ep) {
  if (ep.type) return ep.type;
  if (ep.url?.includes('mhd.seekplayer.me')) return 'seekplayer';
  if (ep.url?.includes('embedseek.com')) return 'embedseek';
  if (ep.url?.includes('player.ojamajo.moe/videos/watch')) return 'ojamajo';
  if (ep.url?.includes('uqload.is/embed-')) return 'uqload';
  if (ep.url?.includes('vidzy.live/embed-')) return 'vidzy';
  if (ep.url?.includes('vidmoly.biz/embed-')) return 'vidmoly';
  if (ep.url?.includes('sendvid.com/embed/')) return 'sendvid';
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

fetch('data.json')
  .then(r => r.ok ? r.json() : Promise.reject())
  .then(data => {
    show = data[showId];
    if (!show) return window.location.replace('404.html');

    flatEps = show.seasons.flatMap((s, si) =>
      s.episodes.map((ep, ei) => ({ seasonIdx: si, epIdx: ei, ep }))
    );

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

function populateHero() {
  document.title = `Tijitoon - ${show.title}`;
  document.getElementById('show-title').textContent = show.title.toUpperCase();
  document.getElementById('pl-bg-title').textContent = show.title;
  document.getElementById('topbar-title').textContent = show.title.toUpperCase();

  const eyebrow = document.getElementById('show-eyebrow');
  const parts = [];
  if (show.tag) {
    const tagCls = show.tag === '★' ? 'tag-star' : `tag-${esc(show.tag)}`;
    parts.push(`<span class="show-tag ${tagCls}">${esc(TAG_LABELS[show.tag] ?? show.tag)}</span>`);
  }
  parts.push(`<span class="ch-badge ${esc(show.channel)}">${chLabel(show.channel)}</span>`);
  if (show.years) parts.push(`<span class="show-years">${esc(show.years)}</span>`);
  if (parts.length) {
    eyebrow.innerHTML = parts.join('');
    eyebrow.style.display = '';
  }
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

    const card = document.createElement('div');
    card.className = 'ep-card' + (!hasUrl ? ' no-url' : '');
    card.dataset.title = normalize(ep.title);
    card.innerHTML = `
      <div class="ep-card-num">${numStr}</div>
      <div class="ep-card-title">${esc(ep.title)}</div>`;
    if (hasUrl) card.addEventListener('click', handler);
    epGrid.appendChild(card);
    epCards[seasonIdx].push(card);

    const row = document.createElement('div');
    row.className = 'ep-list-row' + (!hasUrl ? ' no-url' : '');
    row.dataset.title = normalize(ep.title);
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
  epSearch.focus();
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

  const matchedCards = cards.filter(c => !query || c.dataset.title.includes(query));
  const matchedRows  = rows.filter(r => !query || r.dataset.title.includes(query));

  const total = matchedCards.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  currentPage = Math.max(0, Math.min(currentPage, totalPages - 1));

  const start = currentPage * PAGE_SIZE;
  const end   = start + PAGE_SIZE;

  cards.forEach(c => c.style.display = 'none');
  matchedCards.slice(start, end).forEach(c => c.style.display = '');
  rows.forEach(r => r.style.display = matchedRows.includes(r) ? '' : 'none');

  noResults.style.display = total === 0 ? 'block' : 'none';

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
  document.getElementById('ep-now-playing').textContent = `${sLabel} - ${ep.title}`;
  document.getElementById('ep-nav-counter').textContent = `${currentPos + 1} / ${flatEps.length}`;
  document.getElementById('btn-prev').disabled = currentPos <= 0;
  document.getElementById('btn-next').disabled = currentPos >= flatEps.length - 1;

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

const MEGA_MIN_WIDTH = 480;
let megaScaleObserver = null;

function applyMegaScale() {
  const w = playerWrap.offsetWidth;
  if (w >= MEGA_MIN_WIDTH) {
    iframe.classList.remove('mega-scaled');
    iframe.style.width = '';
    iframe.style.height = '';
    iframe.style.transform = '';
  } else {
    const scale = w / MEGA_MIN_WIDTH;
    const scaledH = (w * 9 / 16) / scale;
    iframe.classList.add('mega-scaled');
    iframe.style.width  = MEGA_MIN_WIDTH + 'px';
    iframe.style.height = scaledH + 'px';
    iframe.style.transform = `scale(${scale})`;
  }
}

function clearMegaScale() {
  if (megaScaleObserver) { megaScaleObserver.disconnect(); megaScaleObserver = null; }
  iframe.classList.remove('mega-scaled');
  iframe.style.width = '';
  iframe.style.height = '';
  iframe.style.transform = '';
}

let activeHls = null;

function playM3u8(src) {
  video.style.display = 'block';
  if (Hls.isSupported()) {
    const hls = new Hls();
    activeHls = hls;
    hls.loadSource(src);
    hls.attachMedia(video);
    hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
      const frTrack = hls.audioTracks.findIndex(t =>
        t.lang === 'fr' || /^fr/i.test(t.lang) || /vf|fra$|français|french/i.test(t.name)
      );
      if (frTrack !== -1) {
        hls.audioTrack = frTrack;
        setTimeout(() => { hls.audioTrack = frTrack; }, 300);
      }
      if (hls.audioTracks.length > 1) buildAudioMenu(hls.audioTracks, hls);
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = src;
  }
}

let loadGen = 0;

function loadEpisode(ep, seasonIdx) {
  const gen = ++loadGen;
  if (activeHls) { activeHls.destroy(); activeHls = null; }
  iframe.style.display = 'none'; iframe.src = 'about:blank';
  video.style.display  = 'none'; video.src  = '';
  hideAudioMenu();
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
    video.src = `${EMBED_WORKER_URL}/sendvid?id=${encodeURIComponent(id)}`;
    video.style.display = 'block';
  } else if (type === 'uqload') {
    const id = ep.url.match(/embed-([a-z0-9]+)\.html/)?.[1];
    if (!id) { showNoVideo(ep, seasonIdx); return; }
    placeholder.style.display = 'flex';
    placeholder.innerHTML = `<div class="pl-hint">Chargement…</div>`;
    fetch(`${CRIMSON_WORKER_URL}/uqload?id=${id}`)
      .then(r => r.json())
      .then(({ url: m3u8url }) => {
        if (gen !== loadGen) return;
        if (!m3u8url) { showNoVideo(ep, seasonIdx); return; }
        placeholder.style.display = 'none';
        playM3u8(m3u8url);
      })
      .catch(() => { if (gen === loadGen) showNoVideo(ep, seasonIdx); });
  } else if (type === 'vidzy') {
    const id = ep.url.match(/embed-([a-z0-9]+)\.html/)?.[1];
    if (!id) { showNoVideo(ep, seasonIdx); return; }
    placeholder.style.display = 'flex';
    placeholder.innerHTML = `<div class="pl-hint">Chargement…</div>`;
    fetch(`${CRIMSON_WORKER_URL}/vidzy?id=${id}`)
      .then(r => r.json())
      .then(({ url: m3u8url }) => {
        if (gen !== loadGen) return;
        if (!m3u8url) { showNoVideo(ep, seasonIdx); return; }
        placeholder.style.display = 'none';
        playM3u8(m3u8url);
      })
      .catch(() => { if (gen === loadGen) showNoVideo(ep, seasonIdx); });
  } else if (type === 'pcloud') {
    // direct links expire after a few hours - resolve a fresh one per play
    const code = epUrl.searchParams.get('code');
    if (!code) { showNoVideo(ep, seasonIdx); return; }
    const api = epUrl.hostname.startsWith('e.') ? 'eapi' : 'api'; // e.pcloud.link = EU datacenter
    placeholder.style.display = 'flex';
    placeholder.innerHTML = `<div class="pl-hint">Chargement…</div>`;
    // pcloud rejects requests with a foreign Referer ("Invalid link referer", result 7010)
    fetch(`https://${api}.pcloud.com/getpublinkdownload?code=${encodeURIComponent(code)}`, { referrerPolicy: 'no-referrer' })
      .then(r => r.json())
      .then(j => {
        if (gen !== loadGen) return;
        if (j.result !== 0 || !j.hosts?.length) { showNoVideo(ep, seasonIdx); return; }
        placeholder.style.display = 'none';
        video.src = 'https://' + j.hosts[0] + j.path;
        video.style.display = 'block';
      })
      .catch(() => { if (gen === loadGen) showNoVideo(ep, seasonIdx); });
  } else if (type === 'ojamajo') {
    const uuid = epUrl.pathname.split('/').pop();
    playM3u8(`${OJAMAJO_WORKER_URL}/ojamajo/playlist?uuid=${encodeURIComponent(uuid)}`);
  } else if (type === 'redirect') {
    placeholder.style.display = 'flex';
    placeholder.innerHTML = `
      <div class="pl-ep-label">S${seasonIdx + 1} - Épisode ${esc(ep.num)}</div>
      <a class="player-external-link" href="${esc(ep.url)}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-play"></i> Regarder sur ${esc(epUrl.hostname)}</a>`;
  } else if (type === 'seekplayer') {
    const id = epUrl.hash.slice(1);
    playM3u8(`${LOUDAPE_PROXY_URL}/?id=${encodeURIComponent(id)}`);
  } else if (type === 'embedseek') {
    const id = epUrl.hash.slice(1);
    if (!id) { showNoVideo(ep, seasonIdx); return; }
    placeholder.style.display = 'flex';
    placeholder.innerHTML = `<div class="pl-hint">Chargement…</div>`;
    fetch(`${CRIMSON_WORKER_URL}/embedseek?id=${encodeURIComponent(id)}`)
      .then(r => r.json())
      .then(({ url: m3u8url }) => {
        if (gen !== loadGen) return;
        if (!m3u8url) { showNoVideo(ep, seasonIdx); return; }
        placeholder.style.display = 'none';
        playM3u8(m3u8url);
      })
      .catch(() => { if (gen === loadGen) showNoVideo(ep, seasonIdx); });
  } else if (type === 'mp4') {
    const src = (ep.odysee || ep.url.includes('player.odycdn.com')) ? odycdnProxyUrl(ep.url) : ep.url;
    video.src = src; video.style.display = 'block';
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
    if (host === 'mega.nz') {
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
