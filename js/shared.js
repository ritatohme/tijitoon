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

// ── SAVED PROGRESS ─────────────────────────────────────
// One entry per series: { season, ep, t } — season/ep are 0-based indices into the catalog, t is
// the write time. `t` arrived with device sync (js/sync.js) and is absent from every entry written
// before it, so every reader must treat it as optional. It orders the index carousel (most recent
// first); the sync merge deliberately ignores it — see progressIsAhead.
function readProgress(seriesId) {
  try {
    const { season, ep, t } = JSON.parse(localStorage.getItem(progressKey(seriesId)));
    if (typeof season === 'number' && typeof ep === 'number') return { season, ep, t };
  } catch (_) {}
  return null;
}

// t is written only when the caller has one. Stamping Date.now() on an entry that arrived without
// a timestamp would claim it was watched just now, and that fake freshness would then beat a
// genuinely newer entry the next time the two devices meet.
function writeProgress(seriesId, { season, ep, t }) {
  const entry = { season, ep };
  if (Number.isFinite(t)) entry.t = t;
  try { localStorage.setItem(progressKey(seriesId), JSON.stringify(entry)); } catch (_) {}
}

// ── DEVICE SYNC MERGE ──────────────────────────────────
// Whether an incoming entry sits further along than the local one. Furthest-wins, NOT newest-wins:
// a timestamp comparison would let a rewatch started on the phone this morning drag the desktop
// back to episode 1. This rule gives the merge the one property the feature is sold on — it can
// carry a series forward, never rewind it — and it needs no `t`, so entries written before
// timestamps existed merge by exactly the same rule as new ones.
// The cost is that a stray click on a late episode sticks; the carousel's ✕ clears the entry.
function progressIsAhead(incoming, local) {
  if (!local) return true;
  return incoming.season > local.season
    || (incoming.season === local.season && incoming.ep > local.ep);
}

// items: [{ id, s, e, t? }] straight off the wire. Called once with apply=false so the confirmation
// dialog can describe the merge, then again with apply=true if it's accepted.
// Unknown series ids are written anyway rather than dropped: the sending device may simply be on a
// newer catalog, and playlistEntries() already skips ids it can't resolve.
function mergeProgress(items, apply) {
  const stat = { added: 0, updated: 0, same: 0 };
  for (const it of items) {
    const local = readProgress(it.id);
    const incoming = { season: it.s, ep: it.e, t: it.t };
    if (!local) {
      stat.added++;
      if (apply) writeProgress(it.id, incoming);
    } else if (progressIsAhead(incoming, local)) {
      stat.updated++;
      if (apply) writeProgress(it.id, incoming);
    } else {
      stat.same++;
    }
  }
  return stat;
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

// ── COPY TO CLIPBOARD ──────────────────────────────────
// Pre-Clipboard-API fallback (also covers insecure contexts, where navigator.clipboard is
// undefined). Returns whether the copy took.
function legacyCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  // user-select:text is required here: the global `user-select: none` on <body>
  // otherwise leaves the selection empty and execCommand('copy') copies nothing.
  ta.style.cssText = 'position:fixed;top:-9999px;opacity:0;user-select:text;-webkit-user-select:text;';
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (_) {}
  ta.remove();
  return ok;
}

// In-place feedback: swap a button's icon to a check mark for exactly TOAST_MS, so the mark and
// the toast fired alongside it clear on the same tick — the two always go together. Only the icon
// changes; retitling the label would resize the button and shove its neighbours sideways mid-flash.
const flashResting = new WeakMap();
const flashTimers  = new WeakMap();

function flashCheck(btn, icon) {
  // Capture the resting class once. Re-reading it on a second click during a flash would record
  // 'fa-check' as the resting state and leave the check mark up for good.
  if (!flashResting.has(icon)) flashResting.set(icon, icon.className);
  btn.classList.add('copied');
  icon.className = 'fa-solid fa-check';
  clearTimeout(flashTimers.get(btn)); // clicked again mid-flash: restart the clock
  flashTimers.set(btn, setTimeout(() => {
    btn.classList.remove('copied');
    icon.className = flashResting.get(icon);
  }, TOAST_MS));
}

// btn/icon are optional — a caller with no button to animate just gets the toast.
function copyLink(text, btn, icon) {
  const done     = () => { showToast('LIEN COPIÉ !'); if (btn && icon) flashCheck(btn, icon); };
  const fallback = () => { if (legacyCopy(text)) done(); else showToast('COPIE IMPOSSIBLE'); };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(fallback);
  } else {
    fallback();
  }
}

const CHANNEL_LABELS = {
  teletoon: 'Télétoon',
  tiji: 'Tiji',
  'cartoon-network': 'Cartoon Network',
};
function chLabel(channel) {
  return CHANNEL_LABELS[channel] || 'Télétoon';
}
