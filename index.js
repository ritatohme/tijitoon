// ── STATE ──────────────────────────────────────────────
let allEntries = [];
let activeFilter = 'all';
let searchQ = '';
let viewMode = localStorage.getItem('tijitoon_view') || 'cards';

// ── CONTINUE WATCHING ──────────────────────────────────
// Reads per-series keys: tijitoon:progress:<id> → { season, ep }
function buildContinueWatching(data) {
  const entries = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key.startsWith(PROGRESS_PREFIX)) continue;
    const seriesId = key.slice(PROGRESS_PREFIX.length);
    const show = data[seriesId];
    if (!show || show.disabled) continue;
    try {
      const { season, ep } = JSON.parse(localStorage.getItem(key));
      const s = show.seasons[season];
      const epObj = s?.episodes[ep];
      if (!s || !epObj) continue;
      entries.push({ seriesId, show, season, ep, s, epObj });
    } catch (_) {}
  }

  const wrap = document.getElementById('continue-watching');
  const strip = document.getElementById('cw-strip');
  strip.innerHTML = '';

  if (!entries.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';

  const expandBtn = document.getElementById('cw-expand');
  let expanded = false;
  let firstRowLimit = null;

  function computeLimit() {
    const cards = Array.from(strip.querySelectorAll('.cw-card'));
    if (!cards.length) return 0;
    const tops = cards.map(c => c.getBoundingClientRect().top);
    const firstTop = tops[0];
    const count = tops.filter(t => Math.abs(t - firstTop) < 4).length;
    return count || cards.length;
  }

  function updateExpand() {
    const isMobile = window.matchMedia('(max-width: 600px)').matches;
    const cards = Array.from(strip.querySelectorAll('.cw-card'));
    if (!isMobile) {
      cards.forEach(c => c.classList.remove('cw-hidden'));
      expandBtn.style.display = 'none';
      return;
    }
    if (firstRowLimit === null) firstRowLimit = computeLimit();
    if (cards.length <= firstRowLimit) {
      cards.forEach(c => c.classList.remove('cw-hidden'));
      expandBtn.style.display = 'none';
      return;
    }
    cards.forEach((c, i) => c.classList.toggle('cw-hidden', !expanded && i >= firstRowLimit));
    expandBtn.style.display = '';
    expandBtn.innerHTML = expanded
      ? '<i class="fa-solid fa-caret-up"></i> réduire'
      : `<i class="fa-solid fa-caret-down"></i> ${cards.length - firstRowLimit} de plus`;
  }

  expandBtn.onclick = () => { expanded = !expanded; updateExpand(); };

  entries.forEach(({ seriesId, show, season, ep, s, epObj }) => {
    const label = `S${s.id ?? String(season + 1).padStart(2,'0')}E${String(epObj.num).padStart(2,'0')}`;

    const card = document.createElement('div');
    card.className = 'cw-card';
    card.style.position = 'relative';

    const removeBtn = document.createElement('button');
    removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    removeBtn.className = 'cw-remove-btn';
    removeBtn.style.cssText = `position:absolute; top:-7px; right:-7px; opacity:0; transition:opacity .15s;`;
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      localStorage.removeItem(progressKey(seriesId));
      card.remove();
      if (!strip.querySelectorAll('.cw-card').length) wrap.style.display = 'none';
      else { firstRowLimit = null; requestAnimationFrame(updateExpand); }
    });
    card.addEventListener('mouseenter', () => removeBtn.style.opacity = '1');
    card.addEventListener('mouseleave', () => removeBtn.style.opacity = '0');
    if (window.matchMedia('(hover: none)').matches) removeBtn.style.opacity = '1';

    const inner = document.createElement('div');
    inner.style.cssText = 'text-decoration:none;color:inherit;display:flex;flex-direction:column;gap:.25rem;';
    inner.innerHTML = `
      <div class="cw-card-title">${esc(show.title)}</div>
      <div class="cw-meta">
        <span class="ep-badge">${esc(label)}</span>
        <span class="ch-mini ${esc(show.channel)}">${chLabel(show.channel)}</span>
      </div>`;

    card.appendChild(removeBtn);
    card.appendChild(inner);
    card.addEventListener('click', () => {
      window.location.href = `show.html?series=${encodeURIComponent(seriesId)}&season=${season + 1}&ep=${ep + 1}`;
    });
    strip.appendChild(card);
  });

  requestAnimationFrame(updateExpand);
}

document.getElementById('cw-clear').addEventListener('click', () => {
  if (!confirm('Effacer tout l\'historique de visionnage ?')) return;
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith(PROGRESS_PREFIX)) keys.push(key);
  }
  keys.forEach(k => localStorage.removeItem(k));
  document.getElementById('continue-watching').style.display = 'none';
  document.getElementById('cw-strip').innerHTML = '';
});

// ── BUILD ITEMS ────────────────────────────────────────
function buildCard(id, show) {
  const el = document.createElement('div');
  el.className = 'card' + (show.disabled ? ' disabled' : '');
  el.dataset.channel = show.channel;
  el.dataset.tag = show.tag || '';
  el.dataset.search = normalize(`${show.title} ${show.alt_title || ''}`);
  el.innerHTML = `
    <div class="card-title">${esc(show.title)}</div>
    <div class="card-bottom">
      ${show.tag ? `<span class="card-tag ${tagCls(show.tag)}">${esc(show.tag)}</span>` : ''}
      <span class="card-ch ${esc(show.channel)}">${chLabel(show.channel)}</span>
    </div>`;
  if (!show.disabled) {
    el.addEventListener('click', () => {
      window.location.href = `show.html?series=${encodeURIComponent(id)}`;
    });
  }
  return el;
}

function buildRow(id, show, idx) {
  const disabled = !!show.disabled;
  const el = document.createElement(disabled ? 'div' : 'a');
  el.className = 'trow' + (disabled ? ' disabled' : '');
  if (!disabled) el.href = `show.html?series=${encodeURIComponent(id)}`;
  el.dataset.channel = show.channel;
  el.dataset.tag = show.tag || '';
  el.dataset.search = normalize(`${show.title} ${show.alt_title || ''}`);
  el.innerHTML = `
    <span class="trow-num">${String(idx + 1).padStart(2,'0')}</span>
    <span class="trow-title">${esc(show.title)}</span>
    <span class="trow-tag ${tagCls(show.tag || '')}">${esc(show.tag || '-')}</span>
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
function applyFilter() {
  let visible = 0;
  const q = searchQ;

  document.querySelectorAll('#card-grid .card').forEach(el => {
    const mf = activeFilter === 'all' || el.dataset.channel === activeFilter || el.dataset.tag === activeFilter;
    const mq = !q || el.dataset.search.includes(q);
    const show = mf && mq;
    el.classList.toggle('hidden', !show);
    if (show) visible++;
  });

  document.querySelectorAll('.trow').forEach(el => {
    const mf = activeFilter === 'all' || el.dataset.channel === activeFilter || el.dataset.tag === activeFilter;
    const mq = !q || el.dataset.search.includes(q);
    el.classList.toggle('hidden', !(mf && mq));
  });

  document.getElementById('fb-count').textContent = `${visible}`;
  document.getElementById('no-results').classList.toggle('visible', visible === 0);
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
  localStorage.setItem('tijitoon_view', mode);
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

// ── BACK TO TOP ────────────────────────────────────────
const backTop = document.getElementById('back-top');
window.addEventListener('scroll', () =>
  backTop.classList.toggle('visible', window.scrollY > 500)
, { passive: true });

window.addEventListener('pageshow', e => {
  if (e.persisted) { searchInput.value = ''; searchQ = ''; searchClear.classList.remove('visible'); applyFilter(); }
});

// ── FETCH ──────────────────────────────────────────────
fetch('data.json')
  .then(r => r.ok ? r.json() : Promise.reject())
  .then(data => {
    renderAll(data);
    buildContinueWatching(data);
  })
  .catch(() => {
    document.getElementById('card-grid').innerHTML =
      '<div style="grid-column:1/-1;font-family:VT323,monospace;font-size:1.1rem;opacity:.4;">Erreur de chargement.</div>';
  });
