/* Side menu for the elevn mockups. Include with menu.css.
   Opens with the "Menu +" control; force it open with #menu in the URL (combine: #guest-menu). */
(function () {
  var old = document.querySelector('.nav .right a.menu'); if (!old) return;
  var btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'menu-btn'; btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'side-menu'); btn.setAttribute('aria-haspopup', 'dialog');
  var LABEL_OPEN = '<span class="lbl">Menu </span><span aria-hidden="true">+</span>', LABEL_CLOSE = '<span class="lbl">Close </span><span aria-hidden="true">×</span>';
  btn.innerHTML = LABEL_OPEN;
  old.replaceWith(btn);

  var page = location.pathname.split('/').pop() || 'index.html';
  function here(h) { return h === page ? ' aria-current="page"' : ''; }
  function mark(h) { return h === page ? '<span class="here">Here</span>' : ''; }
  var items = [
    ['news.html', 'News', 'Football news, with the source named.'],
    ['how-to-play.html', 'How to play', 'Blitz and Draft in a few minutes.'],
    ['faq.html', 'FAQ', 'Short answers to common questions.'],
    ['about.html', 'About', 'What elevn is.'],
    ['roadmap.html', 'Roadmap', 'What is live, and what comes next.']];
  var main = items.map(function (i) {
    return '<li><a href="' + i[0] + '"' + here(i[0]) + '><span class="t">' + i[1] + mark(i[0]) + '</span><span class="d">' + i[2] + '</span></a></li>';
  }).join('');

  var scrim = document.createElement('div'); scrim.className = 'menu-scrim'; scrim.setAttribute('aria-hidden', 'true');
  var p = document.createElement('div'); p.className = 'menu-panel'; p.id = 'side-menu';
  p.setAttribute('role', 'dialog'); p.setAttribute('aria-modal', 'true'); p.setAttribute('aria-label', 'Menu'); p.tabIndex = -1;
  p.innerHTML = '<div class="mp-in">' +
    '<nav aria-label="Menu"><ul class="mp-main">' + main + '</ul></nav>' +
    '<div class="mp-foot"><a href="shootout.html"' + here('shootout.html') + '>Penalty Shootout' + mark('shootout.html') + '</a><a href="https://x.com/elevndotfun" target="_blank" rel="noopener">X<span class="sr-only"> (opens in a new tab)</span> <span aria-hidden="true">↗</span></a></div></div>';
  document.body.appendChild(scrim); document.body.appendChild(p);
  var nav = document.querySelector('header.nav'), isOpen = false;

  function focusables() {
    return [].slice.call(p.querySelectorAll('a[href], button')).filter(function (e) { return e.getClientRects().length > 0; });
  }
  function setHash(on) {
    var parts = location.hash.replace('#', '').split('-').filter(function (x) { return x && x !== 'menu'; });
    if (on) parts.push('menu');
    var h = parts.length ? '#' + parts.join('-') : '';
    if (h !== location.hash) history.replaceState(null, '', location.pathname + location.search + h);
  }
  function open(fromHash, byKey) {
    if (isOpen) return; isOpen = true;
    p.style.setProperty('--menu-top', Math.max(0, nav.getBoundingClientRect().bottom) + 'px');
    var sb = window.innerWidth - document.documentElement.clientWidth;   // the scrollbar the lock is about to hide
    if (sb > 0) document.documentElement.style.paddingRight = sb + 'px';   // so the page does not shift
    document.documentElement.classList.add('menu-lock'); document.body.classList.add('menu-open'); btn.setAttribute('aria-expanded', 'true'); btn.innerHTML = LABEL_CLOSE;
    if (!fromHash) setHash(true);
    var f = focusables(); (byKey && f[0] ? f[0] : p).focus({ preventScroll: true });
  }
  function close(noFocus) {
    if (!isOpen) return; isOpen = false;
    document.documentElement.style.paddingRight = '';
    document.documentElement.classList.remove('menu-lock'); document.body.classList.remove('menu-open'); btn.setAttribute('aria-expanded', 'false'); btn.innerHTML = LABEL_OPEN;
    setHash(false); if (!noFocus) btn.focus();
  }
  btn.addEventListener('click', function (e) { isOpen ? close() : open(false, e.detail === 0); });
  scrim.addEventListener('click', function () { close(); });
  document.addEventListener('keydown', function (e) {
    if (!isOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    var f = focusables().concat([btn]), i = f.indexOf(document.activeElement), n = f.length;
    e.preventDefault();
    f[i === -1 ? 0 : (i + (e.shiftKey ? n - 1 : 1)) % n].focus();
  });
  function fromHash() {
    var want = location.hash.replace('#', '').split('-').indexOf('menu') > -1;
    if (want && !isOpen) open(true); else if (!want && isOpen) close(true); 
  }
  window.addEventListener('hashchange', fromHash); fromHash();
})();
