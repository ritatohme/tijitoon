// Reads the live --topbar value from CSS so the status-bar color always tracks
// the topbar (which sits directly under the iOS/Android status bar), in both
// themes, with no hardcoded hex. Safe here because this file runs after CSS has
// loaded, unlike theme-init.js. Replaces the meta node rather than mutating its
// content attribute, which forces Chrome for Android to repaint the bar live.
function syncThemeColor() {
  const color = getComputedStyle(document.documentElement).getPropertyValue('--topbar').trim();
  const old = document.querySelector('meta[name="theme-color"]');
  if (old) old.parentNode.removeChild(old);
  const meta = document.createElement('meta');
  meta.setAttribute('name', 'theme-color');
  meta.setAttribute('content', color);
  document.head.appendChild(meta);
}

// The moon/sun icon swap is pure CSS off [data-theme]; only the status-bar
// meta needs a JS nudge on toggle.
document.getElementById('theme-toggle').addEventListener('click', () => {
  const html = document.documentElement;
  html.dataset.theme = html.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('tijitoon_theme', html.dataset.theme); // key duplicated in theme-init.js on purpose
  syncThemeColor();
});
