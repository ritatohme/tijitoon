function syncThemeLabel() {
  var lbl = document.getElementById('theme-label');
  if (lbl) lbl.textContent = document.documentElement.dataset.theme === 'dark' ? 'LIGHT' : 'DARK';
}

// Reads the live --paper value from CSS so the status-bar color always tracks
// styles.css (no hardcoded hex). Safe here because this file runs after CSS has
// loaded, unlike theme-init.js. Replaces the meta node rather than mutating its
// content attribute, which forces Chrome for Android to repaint the bar live.
function syncThemeColor() {
  var color = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();
  var old = document.querySelector('meta[name="theme-color"]');
  if (old) old.parentNode.removeChild(old);
  var meta = document.createElement('meta');
  meta.setAttribute('name', 'theme-color');
  meta.setAttribute('content', color);
  document.head.appendChild(meta);
}

syncThemeLabel();

document.getElementById('theme-toggle').addEventListener('click', function() {
  var html = document.documentElement;
  html.dataset.theme = html.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('tijitoon_theme', html.dataset.theme);
  syncThemeLabel();
  syncThemeColor();
});
