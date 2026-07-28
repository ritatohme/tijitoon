// ── STATE ──────────────────────────────────────────────
let allEntries = [];
let activeFilter = 'all';
let searchQ = '';
let viewMode = localStorage.getItem(VIEW_KEY) || 'cards';
let playlistData = null; // data.json ref, so ✕-removal can re-render the carousel

// ── MA PLAYLIST (continue-watching carousel) ───────────
// Reads per-series keys: tijitoon:progress:<id> → { season, ep, t } (0-based
// indices, t = last watched). Renders a horizontal strip of wide 16:9 backdrop
// cards with a progress bar; the card link resumes on the show page. History is
// still tracked when hidden. Most recently watched first — see the sort below.
function playlistEntries(data) {
  const entries = [];
  for (const key of progressKeys()) {
    const seriesId = key.slice(PROGRESS_PREFIX.length);
    const show = data[seriesId];
    if (!show || show.disabled) continue;
    const saved = readProgress(seriesId);
    if (!saved) continue;
    const { season, ep, t } = saved;
    const s = show.seasons[season];
    if (!s || !s.episodes[ep]) continue;
    entries.push({ seriesId, show, season, ep, s, t });
  }
  // Most recent first. Without this the strip renders in localStorage key order — which is
  // insertion order, and re-saving a key does NOT move it, so the series you started FIRST sat at
  // the front forever.
  // Entries predating the t field sort to the end rather than being handed an invented date that
  // would jump them to the front; among themselves they keep their previous order, since Array#sort
  // has been stable since ES2019.
  return entries.sort((a, b) => (b.t || 0) - (a.t || 0));
}

function buildPlaylistCard({ seriesId, show, season, ep, s }) {
  // Progress across the whole series, counted in episodes (only season/ep
  // indices are stored — no within-episode position).
  const total = show.seasons.reduce((n, se) => n + se.episodes.length, 0);
  const before = show.seasons.slice(0, season).reduce((n, se) => n + se.episodes.length, 0);
  const pct = total ? Math.round((before + ep + 1) / total * 100) : 0;
  // Wide 16:9 shot uses the TMDB backdrop; shows without one get the catalog's
  // channel-colored letter fallback.
  const hasBackdrop = !!show.backdrop_url;

  const card = document.createElement('a');
  card.className = 'pl-card';
  card.href = `show?series=${encodeURIComponent(seriesId)}&season=${season + 1}&ep=${ep + 1}`;
  card.innerHTML = `
    <button class="pl-remove" type="button" title="Retirer de l'historique"><i class="fa-solid fa-xmark"></i></button>
    <span class="pl-shot${hasBackdrop ? '' : ` no-shot ${esc(show.channel)}`}">
      ${hasBackdrop ? `<img src="${esc(show.backdrop_url)}" alt="">` : posterFallback(show)}
      <span class="pl-hover"><i class="fa-solid fa-play"></i></span>
      <span class="pl-progress" title="${pct}%"><span class="pl-progress-fill ${esc(show.channel)}" style="width:${pct}%"></span></span>
    </span>
    <span class="pl-caption">
      <span class="pl-cap-title">${esc(show.title)}</span>
      <span class="pl-ep">• S${season + 1}:E${s.episodes[ep].num}</span>
    </span>`;

  card.querySelector('.pl-remove').addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation(); // inside the card <a>: don't navigate
    localStorage.removeItem(progressKey(seriesId));
    buildPlaylist(playlistData); // re-render; hides the section if it was the last one
  });
  const img = card.querySelector('img');
  if (img) img.addEventListener('error', () => {
    const shot = card.querySelector('.pl-shot');
    shot.classList.add('no-shot', show.channel);
    img.replaceWith(posterFallback2(show)); // keep the progress bar; only swap the image
  });
  return card;
}

// Fallback letter as a node (buildPlaylistCard swaps only the <img>, so it can't
// use posterFallback's HTML-string form without clobbering the progress bar).
function posterFallback2(show) {
  const span = document.createElement('span');
  span.className = 'card-letter';
  span.textContent = (show.title[0] || '?').toUpperCase();
  return span;
}

function buildPlaylist(data) {
  const section = document.getElementById('playlist');
  const strip = document.getElementById('pl-strip');
  const entries = playlistEntries(data);

  // .pl-empty tells applyFilter to leave the section hidden (no history to show).
  if (!entries.length) {
    section.classList.add('pl-empty');
    section.style.display = 'none';
    return;
  }
  section.classList.remove('pl-empty');
  // Don't override a search-time hide: applyFilter shows it again when cleared.
  if (!searchQ) section.style.display = '';
  strip.innerHTML = '';
  entries.forEach(e => strip.appendChild(buildPlaylistCard(e)));

  // "voir tout" shows only when the strip actually overflows (more than fits in
  // one row); otherwise the whole history is already on screen.
  const seeAll = document.getElementById('pl-seeall');
  const overflowing = strip.scrollWidth > strip.clientWidth + 4;
  seeAll.style.display = (overflowing || strip.classList.contains('expanded')) ? '' : 'none';
}

// Re-render after something outside this file rewrote the stored history — today that's the device
// sync merge in sync.js. Guards the startup window: data.json may not have landed yet, and the
// fetch's own .then() builds the carousel anyway once it does.
function refreshPlaylist() {
  if (playlistData) buildPlaylist(playlistData);
}

// "voir tout" expands the strip into a wrapping grid (and back to "réduire").
document.getElementById('pl-seeall').addEventListener('click', () => {
  const strip = document.getElementById('pl-strip');
  const seeAll = document.getElementById('pl-seeall');
  const expanded = strip.classList.toggle('expanded');
  seeAll.classList.toggle('open', expanded);
  seeAll.innerHTML = expanded
    ? 'réduire <i class="fa-solid fa-angle-right"></i>'
    : 'voir tout <i class="fa-solid fa-angle-right"></i>';
});

// ── BUILD ITEMS ────────────────────────────────────────
function posterFallback(show) {
  return `<span class="card-letter">${esc((show.title[0] || '?').toUpperCase())}</span>`;
}

function buildCard(id, show) {
  const disabled = !!show.disabled;
  const el = document.createElement(disabled ? 'div' : 'a');
  el.className = 'card' + (disabled ? ' disabled' : '');
  if (!disabled) el.href = `show?series=${encodeURIComponent(id)}`;
  el.dataset.id = id;
  el.dataset.channel = show.channel;
  el.dataset.search = normalize(`${show.title} ${show.alt_title || ''}`);
  const hasPoster = !!show.poster_url;
  el.innerHTML = `
    <div class="card-poster${hasPoster ? '' : ` no-poster ${esc(show.channel)}`}">
      ${hasPoster ? `<img class="card-img" src="${esc(show.poster_url)}" alt="" loading="lazy">` : posterFallback(show)}
    </div>
    <div class="card-title">${esc(show.title)}</div>
    <div class="card-meta">
      <span class="card-ch ${esc(show.channel)}">${chLabel(show.channel)}</span>
    </div>`;
  const img = el.querySelector('.card-img');
  if (img) img.addEventListener('error', () => {
    const poster = el.querySelector('.card-poster');
    poster.classList.add('no-poster', show.channel);
    img.outerHTML = posterFallback(show);
  });
  return el;
}

function buildRow(id, show, idx) {
  const disabled = !!show.disabled;
  const el = document.createElement(disabled ? 'div' : 'a');
  el.className = 'trow' + (disabled ? ' disabled' : '');
  if (!disabled) el.href = `show?series=${encodeURIComponent(id)}`;
  el.dataset.id = id;
  el.dataset.channel = show.channel;
  el.dataset.search = normalize(`${show.title} ${show.alt_title || ''}`);
  el.innerHTML = `
    <span class="trow-num">${String(idx + 1).padStart(2,'0')}</span>
    <span class="trow-title">${esc(show.title)}</span>
    <span class="trow-ch ${esc(show.channel)}">${chLabel(show.channel)}</span>`;
  return el;
}

// ── RENDER ─────────────────────────────────────────────
function renderAll(data) {
  const cardGrid = document.getElementById('card-grid');
  const listRows = document.getElementById('list-rows');
  cardGrid.innerHTML = '';
  listRows.innerHTML = '';

  allEntries = Object.entries(data)
    .sort((a,b) => normalize(a[1].title).localeCompare(normalize(b[1].title)));

  allEntries.forEach(([id, show], i) => {
    cardGrid.appendChild(buildCard(id, show));
    listRows.appendChild(buildRow(id, show, i));
  });

  document.getElementById('meta-count').textContent = `> ${allEntries.length} séries`;
  const channelCount = new Set(allEntries.map(([, show]) => show.channel)).size;
  document.getElementById('meta-channels').textContent = `> ${channelCount} chaînes`;
  applyFilter();
  applyView();
}

// ── FILTER ─────────────────────────────────────────────
function matchesFilter(el) {
  const matchesChip = activeFilter === 'all' || el.dataset.channel === activeFilter;
  return matchesChip && (!searchQ || el.dataset.search.includes(searchQ));
}

function applyFilter() {
  let visible = 0;

  document.querySelectorAll('#card-grid .card').forEach(el => {
    const show = matchesFilter(el);
    el.classList.toggle('hidden', !show);
    if (show) visible++;
  });

  document.querySelectorAll('.trow').forEach(el => {
    el.classList.toggle('hidden', !matchesFilter(el));
  });

  document.getElementById('fb-count').textContent = `${visible}`;
  document.getElementById('no-results').classList.toggle('visible', visible === 0);

  // While a search is typed, only the results matter: hide the hero, the
  // random-pick box and MA PLAYLIST. The filter button stays usable — channel
  // filter and search combine.
  const searching = !!searchQ;
  document.querySelector('header').style.display = searching ? 'none' : '';
  document.getElementById('random-pick').classList.toggle('hidden', searching);
  document.querySelector('.view-toggle').style.display = searching ? 'none' : '';
  // Visibility only — never rebuild here (applyFilter runs on every keystroke).
  // .pl-empty means buildPlaylist found no history, so it stays hidden regardless.
  const pl = document.getElementById('playlist');
  if (!pl.classList.contains('pl-empty')) pl.style.display = searching ? 'none' : '';
}

// ── VIEW MODE ──────────────────────────────────────────
function applyView() {
  const isCards = viewMode === 'cards';
  document.getElementById('card-grid').classList.toggle('list-mode', !isCards);
  document.getElementById('list-view').classList.toggle('active', !isCards);
  document.getElementById('btn-cards').classList.toggle('active', isCards);
  document.getElementById('btn-list').classList.toggle('active', !isCards);
}

function setView(mode) {
  viewMode = mode;
  localStorage.setItem(VIEW_KEY, mode);
  applyView();
}
document.getElementById('btn-cards').addEventListener('click', () => setView('cards'));
document.getElementById('btn-list').addEventListener('click', () => setView('list'));

// ── FILTER BUTTON TOGGLE ──────────────────────────────
const filterBtn = document.getElementById('filter-btn');
const filterDropdown = document.getElementById('filter-dropdown');
const filterBackdrop = document.getElementById('filter-backdrop');

function closeFilter() {
  filterDropdown.classList.remove('open');
  filterBtn.classList.remove('open');
  filterBackdrop.classList.remove('active');
}

filterBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpen = filterDropdown.classList.toggle('open');
  filterBtn.classList.toggle('open', isOpen);
  filterBackdrop.classList.toggle('active', isOpen);
});

filterBackdrop.addEventListener('click', closeFilter);
document.addEventListener('click', closeFilter);

filterDropdown.addEventListener('click', e => e.stopPropagation());

const filterClear = document.getElementById('filter-clear');

function setFilter(f, label) {
  activeFilter = f;
  document.querySelectorAll('.fb-chip').forEach(c =>
    c.classList.toggle('active', c.dataset.f === activeFilter)
  );
  filterBtn.classList.toggle('has-filter', activeFilter !== 'all');
  filterBtn.innerHTML = `${label} <span class="filter-btn-arrow"><i class="fa-solid fa-caret-down"></i></span>`;
  filterClear.style.display = activeFilter !== 'all' ? 'inline-block' : 'none';
  closeFilter();
  applyFilter();
}

filterClear.addEventListener('click', (e) => {
  e.stopPropagation();
  setFilter('all', 'FILTRES');
});

// ── FILTER CHIPS ───────────────────────────────────────
document.querySelectorAll('.fb-chip').forEach(chip => {
  chip.addEventListener('click', () => setFilter(chip.dataset.f, chip.textContent.trim()));
});

// ── SEARCH ─────────────────────────────────────────────
const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');

searchInput.addEventListener('input', () => {
  searchQ = normalize(searchInput.value.trim());
  searchClear.classList.toggle('visible', !!searchQ);
  applyFilter();
});
searchClear.addEventListener('click', () => {
  searchInput.value = ''; searchQ = '';
  searchClear.classList.remove('visible');
  applyFilter();
  searchInput.focus();
});

// ── AU HASARD ──────────────────────────────────────────
// Random-series box under the hero; the dice re-rolls, never landing on the
// same series twice in a row.
function initRandomPick(data) {
  const ids = Object.keys(data).filter(id => !data[id].disabled);
  if (!ids.length) { document.getElementById('random-pick').style.display = 'none'; return; }
  let currentId = null;

  function roll() {
    let id;
    do { id = ids[Math.floor(Math.random() * ids.length)]; } while (ids.length > 1 && id === currentId);
    currentId = id;
    const show = data[id];
    const href = `show?series=${encodeURIComponent(id)}`;
    document.getElementById('rp-link').href = href;
    document.getElementById('rp-watch').href = href;
    document.getElementById('rp-title').textContent = show.title;
    const ch = document.getElementById('rp-ch');
    ch.className = `card-ch ${show.channel}`;
    ch.textContent = chLabel(show.channel);
    const poster = document.getElementById('rp-poster');
    poster.innerHTML = show.poster_url
      ? `<img src="${esc(show.poster_url)}" alt="">` // above the fold: no lazy-loading
      : posterFallback(show);
    const img = poster.querySelector('img');
    if (img) img.addEventListener('error', () => { img.outerHTML = posterFallback(show); });
  }

  const reroll = document.getElementById('rp-reroll');
  reroll.addEventListener('click', () => {
    reroll.classList.remove('rolling');
    void reroll.offsetWidth; // flush the removal so re-adding restarts the animation
    reroll.classList.add('rolling');
    roll();
  });
  roll();
}

// ── SCROLL: BACK TO TOP + STUCK TOPBAR ─────────────────
// The topbar starts at the top of the document, so it is "stuck" as soon as
// the page scrolls at all.
const backTop = document.getElementById('back-top');
const topbar = document.querySelector('.topbar');
backTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
function onScroll() {
  backTop.classList.toggle('visible', window.scrollY > 500);
  topbar.classList.toggle('stuck', window.scrollY > 0);
}
window.addEventListener('scroll', onScroll, { passive: true });
onScroll(); // a restored scroll position (reload, bfcache) doesn't always refire 'scroll'

// Mobile: the bar is collapsed to an icon by default (CSS ≤600px); tapping
// opens it. On desktop the icon is hidden and the class has no effect.
document.getElementById('search-toggle').addEventListener('click', () => {
  topbar.classList.add('search-open');
  searchInput.focus();
});

// The icon is hidden while the bar is open, so an empty search closes itself
// when the input loses focus. (Tapping ✕ refocuses, so it doesn't close.)
searchInput.addEventListener('blur', () => {
  if (!searchInput.value.trim()) topbar.classList.remove('search-open');
});

window.addEventListener('pageshow', e => {
  if (e.persisted) {
    searchInput.value = ''; searchQ = '';
    searchClear.classList.remove('visible');
    topbar.classList.remove('search-open'); // the search was reset: don't restore an open bar
    // Restored from bfcache (e.g. back from a show page): progress may have
    // changed, so rebuild the carousel before applyFilter re-shows it.
    if (playlistData) buildPlaylist(playlistData);
    applyFilter();
  }
});

// ── TOUCH PRESS FEEDBACK ───────────────────────────────
// The cards' lift/highlight lives on :hover, gated to hover-capable pointers —
// on touch a tap leaves :hover stuck (after a ✕ delete it even lit up the card
// that slid under the finger). :active is no substitute on touch: iOS needs
// event hacks to show it at all, and a quick tap outruns it elsewhere. So touch
// gets a .pressed class instead: applied once the finger has rested briefly (a
// scroll flick cancels first), and held long enough after release that even
// the fastest tap shows a visible flash. Mouse/pen keep plain :hover.
const PRESSABLE = '.card, .trow, .pl-card, .pl-remove';
const PRESS_SHOW = 60;   // ms the finger must rest before the effect shows
const PRESS_FLASH = 180; // ms the effect stays visible after release
document.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') return;
  const el = e.target.closest?.(PRESSABLE);
  if (!el || el.classList.contains('disabled')) return;
  const show = setTimeout(() => el.classList.add('pressed'), PRESS_SHOW);
  const done = (ev) => {
    if (ev.pointerId !== e.pointerId) return; // another finger — not this press
    clearTimeout(show);
    document.removeEventListener('pointerup', done);
    document.removeEventListener('pointercancel', done);
    if (ev.type === 'pointercancel') { el.classList.remove('pressed'); return; } // scroll, not a tap
    el.classList.add('pressed'); // tap: show the flash even if released before PRESS_SHOW
    setTimeout(() => el.classList.remove('pressed'), PRESS_FLASH);
  };
  document.addEventListener('pointerup', done);
  document.addEventListener('pointercancel', done);
}, { passive: true });

// ── FETCH ──────────────────────────────────────────────
// Network/HTTP failures show the error message; bugs in the render path are not
// swallowed here — they surface in the console as uncaught errors.
fetchJson('data.json')
  .catch(err => {
    console.error(err);
    document.getElementById('card-grid').innerHTML =
      '<div class="grid-msg">Erreur de chargement.</div>';
    document.getElementById('random-pick').style.display = 'none'; // never filled: hide the empty box
  })
  .then(data => {
    if (!data) return;
    playlistData = data;
    renderAll(data);
    buildPlaylist(data);
    initRandomPick(data);
  });
