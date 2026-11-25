(function () {
  var deck = document.getElementById('deck');
  var slides = Array.prototype.slice.call(deck.querySelectorAll('.slide'));
  var count = document.querySelector('.present-nav .count');
  var presenting = false, idx = 0;

  function setNotes(on) {
    document.body.classList.toggle('show-notes', on);
    Array.prototype.forEach.call(document.querySelectorAll('[data-act="notes"]'), function (b) {
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    try { localStorage.setItem('judaism-notes', on ? '1' : '0'); } catch (e) {}
  }
  function show(i) {
    idx = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach(function (el, k) { el.classList.toggle('current', k === idx); });
    deck.scrollTop = 0;
    count.textContent = (idx + 1) + ' / ' + slides.length;
    if (history.replaceState) history.replaceState(null, '', '#' + (idx + 1));
  }
  function present(start) {
    presenting = true;
    document.body.classList.add('presenting');
    show(start || 0);
    if (document.documentElement.requestFullscreen) { document.documentElement.requestFullscreen().catch(function () {}); }
  }
  function exitPresent() {
    if (!presenting) return;
    presenting = false;
    document.body.classList.remove('presenting');
    slides.forEach(function (el) { el.classList.remove('current'); });
    if (document.fullscreenElement && document.exitFullscreen) { document.exitFullscreen().catch(function () {}); }
    if (history.replaceState) history.replaceState(null, '', location.pathname + location.search);
    slides[idx].scrollIntoView({ block: 'start' });
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var act = b.getAttribute('data-act');
    if (act === 'present') present(0);
    else if (act === 'next') show(idx + 1);
    else if (act === 'prev') show(idx - 1);
    else if (act === 'exit') exitPresent();
    else if (act === 'notes') setNotes(!document.body.classList.contains('show-notes'));
  });
  // Double-click a slide in the scrolling view to present from it
  slides.forEach(function (el, k) {
    el.addEventListener('dblclick', function () { if (!presenting) present(k); });
  });
  var x0 = null;
  deck.addEventListener('touchstart', function (e) { if (presenting && !e.target.closest('.tw')) x0 = e.touches[0].clientX; }, { passive: true });
  deck.addEventListener('touchend', function (e) {
    if (!presenting || x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 50) show(idx + (dx < 0 ? 1 : -1));
  });
  document.addEventListener('keydown', function (e) {
    if (!presenting) return;
    var k = e.key;
    if (k === 'ArrowRight' || k === 'PageDown' || k === ' ') { e.preventDefault(); show(idx + 1); }
    else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); show(idx - 1); }
    else if (k === 'Home') { e.preventDefault(); show(0); }
    else if (k === 'End') { e.preventDefault(); show(1e9); }
    else if (k === 'n' || k === 'N') { setNotes(!document.body.classList.contains('show-notes')); }
    else if (k === 'Escape') { exitPresent(); }
  });
  document.addEventListener('fullscreenchange', function () {
    if (!document.fullscreenElement && presenting) exitPresent();
  });

  // Photos: if a Commons image cannot load, show a labelled link instead
  Array.prototype.forEach.call(document.querySelectorAll('.ph img'), function (img) {
    function fail() { img.parentNode.classList.add('missing'); }
    img.addEventListener('error', fail);
    if (img.complete && img.naturalWidth === 0) fail();
  });

  var saved = null;
  try { saved = localStorage.getItem('judaism-notes'); } catch (e) {}
  if (saved === '1') setNotes(true);
  // Deep link: ...#7 presents from slide 7
  var n = parseInt(location.hash.slice(1), 10);
  if (n >= 1 && n <= slides.length) present(n - 1);
})();
