// Device sync — moves watch history between two browsers without an account.
//
// History lives only in localStorage (tijitoon:progress:<seriesId>, see shared.js), so a phone and
// a desktop know nothing about each other. The sending device posts the entries it wants to share
// to a relay worker and gets a 6-character code back; the receiving device redeems that code once
// and MERGES what it gets into whatever it already has. Codes live 10 minutes and die on first use.
//
// Why a code rather than the data itself in the QR: the QR then only encodes
// <site>/tijitoon/?sync=<code> — ~49 characters, 33x33 modules, read instantly by a phone's camera
// app whatever the list size. And a short code can be typed or pasted, which is the only thing that
// makes the phone -> desktop direction work: a desktop has no camera pointed at the phone.
//
// This file is loaded on index.html only, AFTER index.js — it calls that file's refreshPlaylist()
// and reads its playlistData for series titles (classic scripts, one shared scope, no modules).
// It must stay NON-deferred so the ?sync= parameter is stripped from the URL before the deferred
// analytics snippet reads location.href.

// Everything below is sealed in an IIFE. index.js and show.js keep their globals because other
// files call into them; nothing outside ever calls into this one — it only wires up its own
// listeners — so it can afford to be closed. That matters here: two classic scripts declaring
// `let popup` at top level is a SyntaxError that kills both, and popup/backdrop are exactly the
// names the next modal will reach for. announcement.js seals its own the same way.
(() => {
  // ── CONFIG ─────────────────────────────────────────────
  // Deployed sync-worker (workers/sync-worker.js). No trailing slash — the paths are appended.
  const SYNC_WORKER_URL = 'https://sync-leaf-29c8.ritatohme99.workers.dev';

  // Pinned + SRI like the other third-party scripts (see show.html), but injected on first use
  // instead of sitting in <head>: the index shouldn't pay 20 KB for a modal most visits never open.
  const QR_SRC = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';
  const QR_SRI = 'sha384-lQXOAyZwHXE55JFyrOMB7nY2Wv+m5ZWNtJcHrd1rceRQXAYNLak8ukN5TjBTcIwz';

  const syncBtn = document.getElementById('sync-btn');

  // ── HISTORY -> WIRE FORMAT ─────────────────────────────
  // { id, s, e, t? } per series — short keys because this rides in a request body, and `t` is
  // omitted for entries written before timestamps existed (see writeProgress in shared.js).
  function historyItems() {
    const items = [];
    for (const key of progressKeys()) {
      const id = key.slice(PROGRESS_PREFIX.length);
      const p = readProgress(id);
      if (p) items.push({ id, s: p.season, e: p.ep, t: p.t });
    }
    return items;
  }

  // data.json is fetched once by index.js; it may not have landed yet when the modal opens, and a
  // series can also be missing from an older catalog. Both cases fall back to the raw slug, which is
  // still recognisable ("angelo-la-debrouille").
  function seriesTitle(id) {
    return (playlistData && playlistData[id] && playlistData[id].title) || id;
  }

  function seriesEpTag(item) {
    const show = playlistData && playlistData[item.id];
    const season = show && show.seasons[item.s];
    const ep = season && season.episodes[item.e];
    return ep ? `S${item.s + 1}:E${ep.num}` : '';
  }

  function syncLink(code) {
    // './' resolves against the current directory, so this works at /tijitoon/ and on the local
    // simulator alike, and lands on the index whichever page generated it.
    return new URL(`./?sync=${code}`, location.href).href;
  }

  // A code in its ?sync= form, wherever it sits in a pasted string. Shared with the RECEVOIR field,
  // which collapses a pasted link to the bare code as it lands.
  const SYNC_IN_URL = /[?&]sync=([A-Za-z0-9]{6})/;

  // Accepts a bare code or a whole pasted URL. The explicit ?sync= match runs first so a link that
  // happens to end in six other characters can't be misread; otherwise strip separators and take the
  // tail, which is what a hand-typed code with stray spaces or dashes looks like.
  function normalizeCode(raw) {
    const str = String(raw || '');
    const inUrl = str.match(SYNC_IN_URL);
    if (inUrl) return inUrl[1].toUpperCase();
    const bare = str.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return bare.length >= 6 ? bare.slice(-6) : '';
  }

  // ── QR ─────────────────────────────────────────────────
  let qrPromise = null;
  function loadQr() {
    if (qrPromise) return qrPromise;
    qrPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = QR_SRC;
      script.integrity = QR_SRI;
      script.crossOrigin = 'anonymous';
      script.onload  = () => resolve(window.qrcode);
      script.onerror = () => { qrPromise = null; reject(new Error('qr')); }; // let the next open retry
      document.head.appendChild(script);
    });
    return qrPromise;
  }

  async function renderQr(host, link) {
    try {
      const qrcode = await loadQr();
      const qr = qrcode(0, 'M'); // 0 = pick the smallest version that fits
      qr.addData(link);
      qr.make();
      // The library paints black modules on an explicit white rect, and that is deliberately left
      // alone: --ink on --paper would be #0d0d0d on #242830 in dark mode, which no camera can read.
      // margin is in SVG units, so 16 at cellSize 4 is the 4-module quiet zone the spec asks for.
      host.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true });
    } catch (_) {
      // The QR is the convenience, not the mechanism — the code and the link below it still work.
      host.innerHTML = '<span class="sy-qr-fail">QR indisponible<br>utilise le code</span>';
    }
  }

  // ── MODAL ──────────────────────────────────────────────
  let backdrop = null;
  let popup    = null;
  let tabsEl   = null;
  let countdownTimer = null;
  let pendingPayload = null; // redeemed items waiting on the FUSIONNER confirmation
  let lastFocus  = null;

  function buildModal() {
    if (popup) return;

    backdrop = document.createElement('div');
    backdrop.id = 'sy-backdrop';

    popup = document.createElement('div');
    popup.id = 'sy-popup';
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-modal', 'true');
    popup.setAttribute('aria-labelledby', 'sy-title');
    popup.innerHTML = `
      <div class="sy-banner">
        <span id="sy-title">SYNCHRONISER</span>
        <button class="sy-x" type="button" aria-label="Fermer"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="sy-body">
        <div class="sy-tabs">
          <button class="sy-tab" type="button" data-go="pick">ENVOYER</button>
          <button class="sy-tab" type="button" data-go="recv">RECEVOIR</button>
        </div>

        <div class="sy-view" data-view="pick">
          <span class="sy-eyebrow">&gt;&gt; ENVOYER MON HISTORIQUE_</span>
          <p class="sy-text">Choisis ce que tu veux envoyer, puis scanne le code avec ton autre appareil.</p>
          <label class="sy-row sy-row-all">
            <input type="checkbox" id="sy-all" checked>
            <span class="sy-row-title">TOUT</span>
            <span class="sy-row-ep" id="sy-count"></span>
          </label>
          <div class="sy-list" id="sy-list"></div>
          <div class="sy-actions">
            <button class="sy-btn" type="button" id="sy-gen">GÉNÉRER LE CODE</button>
          </div>
        </div>

        <div class="sy-view" data-view="code">
          <div class="sy-qr" id="sy-qr"></div>
          <div class="sy-code" id="sy-code"></div>
          <div class="sy-linkrow">
            <span class="sy-link" id="sy-link"></span>
            <button class="sy-copy" type="button" id="sy-copy" aria-label="Copier le lien"><i class="fa-solid fa-copy"></i></button>
          </div>
          <p class="sy-text sy-hint">Scanne le QR avec l'appareil photo de ton autre appareil - ou copie le lien et ouvre-le dessus.</p>
          <div class="sy-actions">
            <span class="sy-expiry" id="sy-expiry"></span>
            <button class="sy-btn-ghost" type="button" id="sy-again">nouveau code</button>
          </div>
        </div>

        <div class="sy-view" data-view="recv">
          <span class="sy-eyebrow">&gt;&gt; RECEVOIR_</span>
          <p class="sy-text">Colle ici le code (ou le lien) affiché sur ton autre appareil.</p>
          <div class="sy-input-wrap">
            <input class="sy-input" id="sy-input" type="text" autocomplete="off"
                   autocapitalize="characters" spellcheck="false" placeholder="Ex: K7M2QX" maxlength="120">
          </div>
          <div class="sy-actions">
            <button class="sy-btn" type="button" id="sy-redeem">VALIDER</button>
          </div>
        </div>

        <div class="sy-view" data-view="merge">
          <span class="sy-eyebrow">&gt;&gt; HISTORIQUE REÇU_</span>
          <div class="sy-stats" id="sy-stats"></div>
          <div class="sy-actions">
            <button class="sy-btn" type="button" id="sy-merge">FUSIONNER</button>
            <button class="sy-btn-ghost" type="button" id="sy-cancel">ignorer</button>
          </div>
        </div>
      </div>`;

    document.body.append(backdrop, popup);
    tabsEl = popup.querySelector('.sy-tabs');

    backdrop.addEventListener('click', closeModal);
    popup.querySelector('.sy-x').addEventListener('click', closeModal);
    popup.querySelectorAll('.sy-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        showView(tab.dataset.go);
        // Tapping RECEVOIR is asking to type — openModal deliberately doesn't focus this (see there),
        // but a deliberate tap on the tab is the one moment a keyboard is welcome.
        if (tab.dataset.go === 'recv') popup.querySelector('#sy-input').focus();
      });
    });
    popup.querySelector('#sy-gen').addEventListener('click', generate);
    popup.querySelector('#sy-again').addEventListener('click', () => showView('pick'));
    const codeInput = popup.querySelector('#sy-input');
    popup.querySelector('#sy-redeem').addEventListener('click', () => {
      receive(normalizeCode(codeInput.value));
    });
    codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') popup.querySelector('#sy-redeem').click();
    });
    // The box is six Bungee characters wide, so a pasted link at that size runs straight out of it.
    // A link carrying ?sync= collapses to the bare code the moment it lands — which doubles as
    // confirmation that the paste was understood. Only that explicit form collapses: trimming any
    // long string to its last six characters (what normalizeCode does at VALIDER time, once the
    // typing is finished) would fight someone still mid-code. Anything else long — the wrong link,
    // stray text — just drops to a size that fits.
    codeInput.addEventListener('input', () => {
      const inUrl = codeInput.value.match(SYNC_IN_URL);
      if (inUrl) codeInput.value = inUrl[1].toUpperCase();
      codeInput.classList.toggle('sy-input-long', codeInput.value.length > 8);
    });
    popup.querySelector('#sy-merge').addEventListener('click', applyMerge);
    popup.querySelector('#sy-cancel').addEventListener('click', closeModal);

    const copyBtn = popup.querySelector('#sy-copy');
    copyBtn.addEventListener('click', () => {
      copyLink(copyBtn.dataset.link || '', copyBtn, copyBtn.querySelector('i'));
    });

    // Master checkbox both ways: TOUT drives the rows, the rows drive TOUT's indeterminate state.
    popup.querySelector('#sy-all').addEventListener('change', (e) => {
      popup.querySelectorAll('#sy-list input').forEach(cb => { cb.checked = e.target.checked; });
      syncMasterBox();
    });
    popup.querySelector('#sy-list').addEventListener('change', syncMasterBox);
  }

  function showView(name) {
    popup.querySelectorAll('.sy-view').forEach(v => {
      v.classList.toggle('sy-on', v.dataset.view === name);
    });
    // The tabs are a choice between the two entry points; once a code exists or a payload has been
    // redeemed the flow is committed, so they'd only offer a way to lose it.
    const choosing = name === 'pick' || name === 'recv';
    tabsEl.style.display = choosing ? '' : 'none';
    popup.querySelectorAll('.sy-tab').forEach(t => {
      t.classList.toggle('sy-tab-on', t.dataset.go === name);
    });
    if (name === 'pick') buildPicker();
    if (name !== 'code') stopCountdown();
  }

  function openModal(view) {
    buildModal();
    lastFocus = document.activeElement;
    backdrop.style.display = 'block';
    popup.style.display = 'block';
    showView(view);
    // aria-modal tells a screen reader the page behind is inert, but it moves nothing: without this,
    // focus stays on whatever was behind and the first Tab walks into the catalog under the modal.
    // closeModal already owns the other half (it restores lastFocus). The ✕ and not #sy-input even on
    // the RECEVOIR view — arriving from a scanned QR opens that view with the code already filled and
    // redeeming, so focusing the field would only throw the phone keyboard over the result.
    popup.querySelector('.sy-x').focus();
    // Same two-step as the announcement popup: paint the hidden state, then add the class on the
    // next frame so the entry animation actually runs.
    requestAnimationFrame(() => {
      backdrop.classList.add('sy-visible');
      popup.classList.add('sy-visible');
    });
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeydown);
  }

  function closeModal() {
    if (!popup) return;
    stopCountdown();
    pendingPayload = null;
    // Codes are single-use, so a code left in the box is always a spent one — reopening RECEVOIR to
    // find it still sitting there invites a VALIDER that can only fail with CODE INVALIDE.
    const codeInput = popup.querySelector('#sy-input');
    codeInput.value = '';
    codeInput.classList.remove('sy-input-long');
    backdrop.style.display = 'none';
    popup.style.display = 'none';
    backdrop.classList.remove('sy-visible');
    popup.classList.remove('sy-visible');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKeydown);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function onKeydown(e) {
    if (e.key === 'Escape') closeModal();
  }

  // ── SEND ───────────────────────────────────────────────
  function buildPicker() {
    const list  = popup.querySelector('#sy-list');
    const all   = popup.querySelector('#sy-all');
    const count = popup.querySelector('#sy-count');
    const gen   = popup.querySelector('#sy-gen');
    const items = historyItems()
      .sort((a, b) => seriesTitle(a.id).localeCompare(seriesTitle(b.id), 'fr'));

    list.innerHTML = '';
    count.textContent = items.length ? `${items.length}` : '';

    if (!items.length) {
      list.innerHTML = '<p class="sy-text sy-empty">Aucun historique pour l\'instant - lance un épisode et reviens ici.</p>';
      all.closest('.sy-row').style.display = 'none';
      gen.style.display = 'none';
      return;
    }
    all.closest('.sy-row').style.display = '';
    gen.style.display = '';
    all.checked = true;
    all.indeterminate = false;

    for (const item of items) {
      const row = document.createElement('label');
      row.className = 'sy-row';
      row.innerHTML = `
        <input type="checkbox" checked value="${esc(item.id)}">
        <span class="sy-row-title">${esc(seriesTitle(item.id))}</span>
        <span class="sy-row-ep">${esc(seriesEpTag(item))}</span>`;
      list.appendChild(row);
    }
  }

  function syncMasterBox() {
    const boxes = [...popup.querySelectorAll('#sy-list input')];
    const on = boxes.filter(b => b.checked).length;
    const all = popup.querySelector('#sy-all');
    all.checked = on === boxes.length && on > 0;
    all.indeterminate = on > 0 && on < boxes.length;
    popup.querySelector('#sy-count').textContent = on ? `${on}` : '';
  }

  // Swap a button to a spinner while a request is in flight, and hand back a restore function.
  function busy(btn, label) {
    const resting = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${label}`;
    return () => { btn.disabled = false; btn.innerHTML = resting; };
  }

  function workerMissing() {
    if (SYNC_WORKER_URL) return false;
    showToast('SYNC INDISPONIBLE');
    return true;
  }

  async function generate() {
    if (workerMissing()) return;
    const chosen = new Set([...popup.querySelectorAll('#sy-list input:checked')].map(b => b.value));
    if (!chosen.size) { showToast('SÉLECTIONNE UNE SÉRIE'); return; }

    const items = historyItems().filter(i => chosen.has(i.id));
    const restore = busy(popup.querySelector('#sy-gen'), 'ENVOI…');
    try {
      const res = await fetch(`${SYNC_WORKER_URL}/sync`, {
        method: 'POST',
        // text/plain keeps this a CORS "simple request", so the POST goes straight out instead of
        // waiting on a preflight. The worker parses the body as JSON regardless.
        headers: { 'content-type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ v: 1, items }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { code, ttl } = await res.json();
      showCode(code, ttl);
    } catch (_) {
      showToast('ERREUR DE CONNEXION');
    } finally {
      restore();
    }
  }

  function showCode(code, ttl) {
    const link = syncLink(code);
    popup.querySelector('#sy-code').textContent = code;
    popup.querySelector('#sy-link').textContent = link.replace(/^https?:\/\//, '');
    popup.querySelector('#sy-copy').dataset.link = link;
    renderQr(popup.querySelector('#sy-qr'), link);
    showView('code');
    startCountdown(ttl || 600);
  }

  function startCountdown(seconds) {
    const el = popup.querySelector('#sy-expiry');
    const deadline = Date.now() + seconds * 1000;
    const tick = () => {
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      if (left <= 0) {
        stopCountdown();
        el.textContent = 'code expiré';
        el.classList.add('sy-dead');
        return;
      }
      el.classList.remove('sy-dead');
      el.textContent = `expire dans ${Math.floor(left / 60)}:${pad2(left % 60)}`;
    };
    stopCountdown();
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  function stopCountdown() {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }

  // ── RECEIVE ────────────────────────────────────────────
  // A code is redeemed once and then deleted server-side, so a 404 normally means "wrong, expired, or
  // already used". The retries cover the one case where it doesn't: KV can serve a brief stale miss in
  // a datacenter that looked the key up before it existed.
  async function redeem(code) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await new Promise(r => setTimeout(r, 2000));
      const res = await fetch(`${SYNC_WORKER_URL}/sync/${code}`);
      if (res.ok) return res.json();
      if (res.status !== 404) throw new Error(`HTTP ${res.status}`);
    }
    return null;
  }

  async function receive(code) {
    if (workerMissing()) return;
    if (!code) { showToast('CODE INVALIDE'); return; }

    const btn = popup.querySelector('#sy-redeem');
    const restore = busy(btn, 'RECHERCHE…');
    try {
      const payload = await redeem(code);
      if (!payload || !Array.isArray(payload.items)) { showToast('CODE INVALIDE'); return; }
      pendingPayload = payload;
      showSummary(payload);
    } catch (_) {
      showToast('ERREUR DE CONNEXION');
    } finally {
      restore();
    }
  }

  function showSummary(payload) {
    const stat = mergeProgress(payload.items, false); // count only — nothing is written yet
    const total = payload.items.length;
    const rows = [
      `<span class="sy-stat-head">${total} ${total > 1 ? 'SÉRIES REÇUES' : 'SÉRIE REÇUE'}</span>`,
      stat.added   ? `<span class="sy-stat">${stat.added} nouvelle${stat.added > 1 ? 's' : ''}</span>` : '',
      stat.updated ? `<span class="sy-stat">${stat.updated} mise${stat.updated > 1 ? 's' : ''} à jour</span>` : '',
      stat.same    ? `<span class="sy-stat sy-stat-dim">${stat.same} déjà à jour</span>` : '',
    ];
    popup.querySelector('#sy-stats').innerHTML = rows.filter(Boolean).join('');

    // Nothing to write: offer the exit instead of a button that would do nothing visible.
    const nothing = !stat.added && !stat.updated;
    popup.querySelector('#sy-merge').style.display = nothing ? 'none' : '';
    popup.querySelector('#sy-cancel').textContent  = nothing ? 'fermer' : 'ignorer';
    showView('merge');
  }

  function applyMerge() {
    if (!pendingPayload) return;
    mergeProgress(pendingPayload.items, true);
    pendingPayload = null;
    closeModal();
    refreshPlaylist();
    showToast('HISTORIQUE SYNCHRONISÉ');
  }

  // ── ENTRY POINTS ───────────────────────────────────────
  if (syncBtn) syncBtn.addEventListener('click', () => openModal('pick'));

  // Arriving from a scanned QR: ?sync=<code> on the index.
  (function fromUrl() {
    const params = new URLSearchParams(location.search);
    const raw = params.get('sync');
    if (!raw) return;

    // Strip it immediately, before anything else reads the URL: reloading the page must not try to
    // redeem a code that has already been spent, and the deferred analytics snippet captures
    // location.href on load. Other parameters are preserved rather than dropping the whole query.
    params.delete('sync');
    const qs = params.toString();
    history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : '') + location.hash);

    const code = normalizeCode(raw);
    if (!code) { showToast('CODE INVALIDE'); return; }
    openModal('recv');
    popup.querySelector('#sy-input').value = code;
    receive(code);
  })();
})();
