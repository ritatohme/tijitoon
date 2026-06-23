// Runs in <head> BEFORE styles.css loads, so it can't read the --paper CSS
// variable yet. The dark background color is therefore hardcoded here on
// purpose — this is the single source for it; theme.js reads the rest from CSS.
// Its job: apply the saved theme and set theme-color before first paint, so a
// returning dark-mode user never sees a white status-bar flash on load.
(function () {
  var DARK_BG = '#242830'; // keep in sync with --paper in styles.css [data-theme="dark"]
  var saved = localStorage.getItem('tijitoon_theme');
  if (saved) document.documentElement.dataset.theme = saved;
  if (saved === 'dark') {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', DARK_BG);
  }
})();
