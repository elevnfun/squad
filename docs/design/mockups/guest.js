/* mockup only: show the not-connected state of a screen with #guest in the URL */
(function () {
  var right = document.querySelector('.nav .right'); if (!right) return;
  var saved = right.firstElementChild.outerHTML;
  // one gold button per view: Connect wallet is gold only when the page shows no other gold button
  function connectBtn() {
    var other = [].some.call(document.querySelectorAll('.btn-gold'), function (e) { return !e.closest('header.nav') && e.offsetParent !== null; });
    return '<a class="btn ' + (other ? 'btn-line' : 'btn-gold') + ' btn-sm" href="connect.html">Connect wallet</a>';
  }
  var ban = '<div class="banner" role="note">You\'re trying elevn as a guest. Connect a wallet to save your squads and play for prizes.</div>';
  function apply() {
    var g = /(^|[#-])guest(-|$)/.test(location.hash);
    document.body.classList.toggle('guest', g);
    right.firstElementChild.outerHTML = g ? connectBtn() : saved;
    var b = document.getElementById('gb');
    if (g && !b) { var d = document.createElement('div'); d.id = 'gb'; d.innerHTML = ban; document.querySelector('header.nav').after(d.firstChild); d.remove(); document.querySelector('.banner').id = 'gb'; }
    if (!g && b) b.remove();
  }
  window.addEventListener('hashchange', apply); apply();
})();
