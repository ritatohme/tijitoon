// Utilities shared by index.html and show.html.

// ── localStorage keys ──────────────────────────────────
// The theme key ('tijitoon_theme') is NOT here: theme-init.js runs in <head>
// before this file loads and must stay self-contained (see its header comment).
const PROGRESS_PREFIX = 'tijitoon:progress:'; // + seriesId → { season, ep }
const VIEW_KEY        = 'tijitoon_view';      // index catalog: 'cards' | 'list'
const EP_VIEW_KEY     = 'tijitoon_ep_view';   // show episodes: 'grid' | 'list'
const ANN_KEY_PREFIX  = 'tijitoon_ann_';      // + announcement id → dismissed

function progressKey(seriesId) {
  return PROGRESS_PREFIX + seriesId;
}

// Every saved-progress key currently in localStorage.
function progressKeys() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith(PROGRESS_PREFIX)) keys.push(key);
  }
  return keys;
}

// fetch that also rejects on HTTP error status, so callers handle "unreachable"
// and "404/500" the same way.
function fetchJson(url) {
  return fetch(url).then(r => r.ok ? r.json() : Promise.reject(new Error(`${url}: HTTP ${r.status}`)));
}

function normalize(str) {
  // strip combining diacritics left by NFD decomposition (é → e + U+0301)
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function esc(str) {
  return String(str).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

// "E05" — the episode half of a label.
function epCode(num) {
  return `E${pad2(num)}`;
}

// "S02E05" — or "S5.1E05" when the season carries an explicit id (split seasons).
// Single source of truth so the index EN COURS badges and the show page agree.
function epLabel(season, seasonIdx, epNum) {
  return `S${season.id ?? pad2(seasonIdx + 1)}${epCode(epNum)}`;
}

// ── TOAST ──────────────────────────────────────────────
// Brief bottom-centre confirmation. The node is built on first use so this file
// stays independent of where its <script> sits in the page. TOAST_MS is shared so
// a caller animating its own button alongside the toast can end at the same moment.
const TOAST_MS = 2200;
let toastEl = null;
let toastTimer = null;

function showToast(msg) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'toast';
    toastEl.setAttribute('role', 'status');
    document.body.appendChild(toastEl);
    void toastEl.offsetWidth; // commit the hidden state so the first toast fades in too
  }
  toastEl.textContent = msg;
  toastEl.classList.add('visible');
  clearTimeout(toastTimer); // tapped again mid-toast: swap the text, restart the clock
  toastTimer = setTimeout(() => toastEl.classList.remove('visible'), TOAST_MS);
}

const CHANNEL_LABELS = {
  teletoon: 'Télétoon',
  tiji: 'Tiji',
  'cartoon-network': 'Cartoon Network',
};
function chLabel(channel) {
  return CHANNEL_LABELS[channel] || 'Télétoon';
}
