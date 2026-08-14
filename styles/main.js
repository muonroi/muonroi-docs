/* ============================================================
   Muonroi Docs — "Control Plane" theme enhancements
   - Injects the Muonroi diamond logo into the navbar
   - Renames the DocFX search placeholder
   - Adds a "copy" button to every code block
   The DocFX default template auto-loads styles/main.js on every page — this IS the customization point.
   ============================================================ */
(function () {
  'use strict';

  var LOGO_SVG =
    '<svg class="mr-logo" width="22" height="22" viewBox="0 0 32 32" fill="none" aria-hidden="true">' +
    '<rect x="16" y="2.5" width="19" height="19" rx="3.5" transform="rotate(45 16 2.5)" fill="url(#mrlg)" fill-opacity="0.16" stroke="url(#mrlg)" stroke-width="1.4"/>' +
    '<rect x="16" y="8.5" width="10.5" height="10.5" rx="2" transform="rotate(45 16 8.5)" fill="url(#mrlg)"/>' +
    '<defs><linearGradient id="mrlg" x1="6" y1="4" x2="27" y2="28" gradientUnits="userSpaceOnUse">' +
    '<stop stop-color="#5eead4"/><stop offset="0.55" stop-color="#2dd4bf"/><stop offset="1" stop-color="#22d3ee"/>' +
    '</linearGradient></defs></svg>';

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  /* 1. Navbar logo + wordmark polish */
  function injectLogo() {
    var brand = document.querySelector('.navbar .navbar-brand') ||
                document.querySelector('.navbar-brand');
    if (!brand || brand.querySelector('.mr-logo')) return;

    // Replace any default icon DocFX put in there, prepend our mark
    var svg = document.createElement('span');
    svg.innerHTML = LOGO_SVG;
    brand.insertBefore(svg.firstChild, brand.firstChild);

    // Hide the default logo image if present (we replaced it)
    var img = brand.querySelector('img:not(.mr-logo img)');
    if (img && !img.classList.contains('mr-logo')) img.style.display = 'none';
  }

  /* 2. Search placeholder */
  function polishSearch() {
    var q = document.querySelector('#search-query') ||
            document.querySelector('.navbar input[type="search"]') ||
            document.querySelector('.navbar .form-control');
    if (q) q.setAttribute('placeholder', 'Search docs…  ( / )');
  }

  /* 3. Copy buttons on code blocks */
  function addCopyButtons() {
    var blocks = document.querySelectorAll('pre');
    blocks.forEach(function (pre) {
      if (pre.querySelector('.mr-copy-btn')) return;
      var btn = document.createElement('button');
      btn.className = 'mr-copy-btn';
      btn.type = 'button';
      btn.textContent = 'copy';
      btn.addEventListener('click', function () {
        var code = pre.querySelector('code');
        var text = (code || pre).innerText;
        function done() {
          btn.textContent = 'copied ✓';
          btn.classList.add('copied');
          setTimeout(function () {
            btn.textContent = 'copy';
            btn.classList.remove('copied');
          }, 1600);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, done);
        } else {
          var ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); } catch (e) { /* noop */ }
          document.body.removeChild(ta);
          done();
        }
      });
      pre.appendChild(btn);
    });
  }

  /* 4. Keyboard shortcut: "/" focuses search */
  function bindSearchShortcut() {
    document.addEventListener('keydown', function (e) {
      if (e.key !== '/') return;
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
      var q = document.querySelector('#search-query') ||
              document.querySelector('.navbar input[type="search"]');
      if (q) { e.preventDefault(); q.focus(); }
    });
  }

  ready(function () {
    injectLogo();
    polishSearch();
    addCopyButtons();
    bindSearchShortcut();

    // DocFX renders some content lazily — re-scan once after load
    setTimeout(function () {
      injectLogo();
      polishSearch();
      addCopyButtons();
    }, 800);
  });
})();
