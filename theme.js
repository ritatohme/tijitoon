function syncThemeLabel() {
  var lbl = document.getElementById('theme-label');
  if (lbl) lbl.textContent = document.documentElement.dataset.theme === 'dark' ? 'LIGHT' : 'DARK';
}

syncThemeLabel();

document.getElementById('theme-toggle').addEventListener('click', function() {
  var html = document.documentElement;
  html.dataset.theme = html.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('tijitoon_theme', html.dataset.theme);
  syncThemeLabel();
});
