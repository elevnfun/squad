/* mockup only: show the not-connected state of a screen with #guest in the URL */
(function () {
  var right = document.querySelector('.nav .right'); if (!right) return;
  var saved = right.firstElementChild.outerHTML;
  var btn = '<a class="btn btn-gold btn-sm" href="connect.html">Connect wallet</a>';
  var ban = '<div class="banner" role="note">You\'re trying elevn as a guest. Connect a wallet to save your squads and play for prizes.</div>';
  function apply() {
    var g = location.hash === '#guest';
    document.body.classList.toggle('guest', g);
    right.firstElementChild.outerHTML = g ? btn : saved;
    var b = document.getElementById('gb');
    if (g && !b) { var d = document.createElement('div'); d.id = 'gb'; d.innerHTML = ban; document.querySelector('header.nav').after(d.firstChild); d.remove(); document.querySelector('.banner').id = 'gb'; }
    if (!g && b) b.remove();
  }
  window.addEventListener('hashchange', apply); apply();
})();
