// Announcement popup (index page). Fetches announcement.json and, unless that
// announcement was already dismissed, builds the popup DOM and shows it after a
// short delay. Replaces the old popup.html fragment + popup.js pair — one script,
// no runtime HTML include. Styles live in css/popup.css.
(() => {
  fetch('announcement.json?v=' + Date.now())
    .then(r => r.json())
    .then(ann => {
      if (!ann.enabled) return;

      const KEY = ANN_KEY_PREFIX + ann.id;
      if (localStorage.getItem(KEY)) return;

      // Build popup
      const backdrop = document.createElement('div');
      backdrop.id = 'req-backdrop';

      const popup = document.createElement('div');
      popup.id = 'req-popup';
      popup.innerHTML = `
        <div class="req-banner">
          <span>✦ TIJITOON ✦</span>
          <button class="req-x"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="req-body">
          <div class="req-eyebrow"></div>
          <h2 class="req-headline"></h2>
          <p class="req-text"></p>
          <div class="req-actions">
            <a class="req-btn"></a>
            <button class="req-btn-ghost"></button>
          </div>
        </div>`;

      popup.querySelector('.req-eyebrow').textContent  = ann.eyebrow;
      popup.querySelector('.req-headline').textContent = ann.title;
      popup.querySelector('.req-text').textContent     = ann.text;

      const btn = popup.querySelector('.req-btn');
      if (ann.btnUrl) {
        btn.textContent = ann.btnLabel + ' ';
        btn.appendChild(Object.assign(document.createElement('i'), { className: 'fa-solid fa-angle-right' }));
        btn.href = ann.btnUrl;
      } else {
        btn.style.display = 'none';
      }

      const later = popup.querySelector('.req-btn-ghost');
      if (ann.dismissLabel) {
        later.textContent = ann.dismissLabel;
      } else {
        later.style.display = 'none';
      }

      function closePopup() {
        backdrop.style.display = 'none';
        popup.style.display = 'none';
        backdrop.classList.remove('req-visible');
        popup.classList.remove('req-visible');
        localStorage.setItem(KEY, '1');
      }

      btn.addEventListener('click', closePopup);
      later.addEventListener('click', closePopup);
      backdrop.addEventListener('click', closePopup);
      popup.querySelector('.req-x').addEventListener('click', closePopup);

      document.body.appendChild(backdrop);
      document.body.appendChild(popup);

      setTimeout(() => {
        // The sync modal opens synchronously on ?sync= arrival, and both popups sit at 900/901 —
        // this one is appended later, so at equal z-index it would land on top of the very flow it
        // is advertising. Skip the visit entirely: KEY is written only by closePopup, so an
        // announcement that never showed comes back next time.
        const sync = document.getElementById('sy-popup');
        if (sync && sync.style.display === 'block') return;
        backdrop.style.display = 'block';
        popup.style.display = 'block';
        requestAnimationFrame(() => {
          backdrop.classList.add('req-visible');
          popup.classList.add('req-visible');
        });
      }, 1200);
    })
    .catch(() => { /* no announcement / bad json — silently skip */ });
})();
