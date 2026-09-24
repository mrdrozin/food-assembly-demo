/* The card's slider: arrows, keys, wheel, swipe, and the slide number in the URL.
   Videos on slides that are not showing stay paused — eight looping clips would
   otherwise keep a laptop warm for no reason. */

(function () {
  'use strict';

  var track  = document.getElementById('track');
  var slides = Array.prototype.slice.call(track.querySelectorAll('.slide'));
  var rail   = document.getElementById('rail');
  var prev   = document.getElementById('prev');
  var next   = document.getElementById('next');
  var bar    = document.getElementById('bar');
  var cur    = document.getElementById('cur');
  var total  = document.getElementById('total');

  var calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var i = 0;

  total.textContent = slides.length;

  /* ---- the dots ------------------------------------------------------ */

  var dots = slides.map(function (s, n) {
    var b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-label', 'Slide ' + (n + 1) + ': ' + (s.getAttribute('aria-label') || ''));
    b.addEventListener('click', function () { go(n); });
    rail.appendChild(b);
    return b;
  });

  /* ---- moving between slides ----------------------------------------- */

  function go(n, silent) {
    n = Math.max(0, Math.min(slides.length - 1, n));
    i = n;

    track.style.transform = 'translate3d(' + (-100 * n) + '%,0,0)';
    bar.style.width = ((n + 1) / slides.length * 100) + '%';
    cur.textContent = n + 1;

    dots.forEach(function (d, k) { d.setAttribute('aria-current', k === n ? 'true' : 'false'); });
    prev.disabled = n === 0;
    next.disabled = n === slides.length - 1;

    slides.forEach(function (s, k) {
      var off = k !== n;
      s.setAttribute('aria-hidden', off ? 'true' : 'false');
      /* focus must not travel to a slide that is off screen */
      s.querySelectorAll('a, button, video[controls]').forEach(function (el) {
        if (off) { el.setAttribute('tabindex', '-1'); } else { el.removeAttribute('tabindex'); }
      });
      s.querySelectorAll('video').forEach(function (v) {
        if (off) { v.pause(); }
        else if (!calm) { var p = v.play(); if (p && p.catch) { p.catch(function () {}); } }
      });
      if (off) { s.scrollTop = 0; }
    });

    if (!silent) {
      try { history.replaceState(null, '', '#' + (n + 1)); } catch (e) { /* file:// must work too */ }
    }
  }

  prev.addEventListener('click', function () { go(i - 1); });
  next.addEventListener('click', function () { go(i + 1); });

  /* ---- keyboard ------------------------------------------------------ */

  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) { return; }
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) { return; }

    switch (e.key) {
      case 'ArrowRight': case 'PageDown': go(i + 1); e.preventDefault(); break;
      case 'ArrowLeft':  case 'PageUp':   go(i - 1); e.preventDefault(); break;
      case ' ':          go(e.shiftKey ? i - 1 : i + 1); e.preventDefault(); break;
      case 'Home':       go(0); e.preventDefault(); break;
      case 'End':        go(slides.length - 1); e.preventDefault(); break;
      default: break;
    }
  });

  /* ---- wheel: scroll the slide first, turn the page at its edge ------- */

  var lock = 0;

  window.addEventListener('wheel', function (e) {
    var s = slides[i];
    var dx = e.deltaX, dy = e.deltaY;
    var now = Date.now();

    /* a slide taller than the screen scrolls before it turns */
    if (Math.abs(dy) > Math.abs(dx)) {
      var room = s.scrollHeight - s.clientHeight;
      if (room > 4) {
        var atTop = s.scrollTop <= 0;
        var atEnd = s.scrollTop >= room - 1;
        if (!(atTop && dy < 0) && !(atEnd && dy > 0)) { return; }
      }
    }

    var d = Math.abs(dx) > Math.abs(dy) ? dx : dy;
    if (Math.abs(d) < 18 || now < lock) { return; }
    lock = now + 480;
    go(d > 0 ? i + 1 : i - 1);
  }, { passive: true });

  /* ---- swipe --------------------------------------------------------- */

  var x0 = null, y0 = null;

  window.addEventListener('touchstart', function (e) {
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
  }, { passive: true });

  window.addEventListener('touchend', function (e) {
    if (x0 === null) { return; }
    var dx = e.changedTouches[0].clientX - x0;
    var dy = e.changedTouches[0].clientY - y0;
    x0 = y0 = null;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) { go(dx < 0 ? i + 1 : i - 1); }
  }, { passive: true });

  /* ---- the slide number in the URL ----------------------------------- */

  function fromHash() {
    var n = parseInt((location.hash || '').replace('#', ''), 10);
    return isNaN(n) ? 0 : n - 1;
  }

  window.addEventListener('hashchange', function () { go(fromHash(), true); });

  go(fromHash(), true);
}());
