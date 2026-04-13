// Custom DocFX tweaks for TOC scrolling
(function () {
  function setTocScroll() {
    try {
      var offcanvas = document.querySelector('.toc-offcanvas .offcanvas-md');
      var body = document.querySelector('.toc-offcanvas .offcanvas-body');
      var toc = document.querySelector('.toc-offcanvas .toc');
      if (!offcanvas || !body) return;

      var header = document.querySelector('header');
      var headerH = header ? header.getBoundingClientRect().height : 0;
      var h = Math.max(320, window.innerHeight - headerH);

      offcanvas.style.position = 'sticky';
      offcanvas.style.top = headerH + 'px';
      offcanvas.style.height = h + 'px';

      body.style.overflowY = 'auto';
      body.style.maxHeight = h + 'px';
      body.style.paddingTop = '0';

      if (toc) {
        toc.style.overflowY = 'auto';
        toc.style.maxHeight = '100%';
      }
    } catch (e) {
      // noop
    }
  }

  window.addEventListener('resize', setTocScroll);
  document.addEventListener('DOMContentLoaded', setTocScroll);
  // In case docfx loads TOC asynchronously, delay-adjust after load
  window.addEventListener('load', function () { setTimeout(setTocScroll, 200); });
})();

