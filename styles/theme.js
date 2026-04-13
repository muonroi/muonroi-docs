(function () {
  function systemPrefersDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('theme', theme); } catch (_) {}
    var btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = (theme === 'dark') ? '☀ Light' : '🌙 Dark';
  }

  function initTheme() {
    var stored = null;
    try { stored = localStorage.getItem('theme'); } catch (_) {}
    var initial = stored || (systemPrefersDark() ? 'dark' : 'light');
    applyTheme(initial);
  }

  function injectToggle() {
    var nav = document.getElementById('navbar');
    if (!nav) return;
    var btn = document.createElement('button');
    btn.id = 'theme-toggle';
    btn.type = 'button';
    btn.className = 'btn btn-default navbar-btn';
    btn.onclick = function () {
      var current = document.documentElement.getAttribute('data-theme') || 'light';
      applyTheme(current === 'dark' ? 'light' : 'dark');
    };
    var searchForm = document.getElementById('search');
    if (searchForm && searchForm.parentElement) searchForm.parentElement.appendChild(btn);
    else nav.appendChild(btn);
    var cur = document.documentElement.getAttribute('data-theme') || 'light';
    btn.textContent = (cur === 'dark') ? '☀ Light' : '🌙 Dark';
  }

  document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    injectToggle();
  });
})();

