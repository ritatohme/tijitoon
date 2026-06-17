(function () {
  fetch('announcement.json?v=' + Date.now())
    .then(r => r.json())
    .then(function (ann) {
      if (!ann.enabled) return;

      const KEY = 'tijitoon_ann_' + ann.id;
      if (localStorage.getItem(KEY)) return;

      // Build popup
      const bd = document.getElementById('req-backdrop');
      const pp = document.getElementById('req-popup');

      document.getElementById('ann-eyebrow').textContent  = ann.eyebrow;
      document.getElementById('ann-headline').textContent = ann.title;
      document.getElementById('ann-text').textContent     = ann.text;

      const btn = document.getElementById('ann-btn');
      if (ann.btnUrl) {
        btn.textContent = ann.btnLabel + ' ';
        btn.appendChild(Object.assign(document.createElement('i'), { className: 'fa-solid fa-angle-right' }));
        btn.href = ann.btnUrl;
      } else {
        btn.style.display = 'none';
      }

      const later = document.getElementById('ann-later');
      if (ann.dismissLabel) {
        later.textContent = ann.dismissLabel;
      } else {
        later.style.display = 'none';
      }

      window.reqClose = function () {
        bd.style.display = 'none';
        pp.style.display = 'none';
        bd.classList.remove('req-visible');
        pp.classList.remove('req-visible');
        localStorage.setItem(KEY, '1');
      };

      btn.addEventListener('click', window.reqClose);
      later.addEventListener('click', window.reqClose);
      bd.addEventListener('click', window.reqClose);
      document.getElementById('ann-close').addEventListener('click', window.reqClose);

      setTimeout(function () {
        bd.style.display = 'block';
        pp.style.display = 'block';
        requestAnimationFrame(function () {
          bd.classList.add('req-visible');
          pp.classList.add('req-visible');
        });
      }, 1200);
    })
    .catch(function () { /* no announcement / bad json — silently skip */ });
})();
