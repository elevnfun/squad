/* mockup: at 900px and narrower the picker shows one club at a time. With JS off both clubs stay stacked. */
(function () {
  var sw = document.querySelector('.bp-sw'), box = document.querySelector('.bp-scroll'); if (!sw || !box) return;
  document.documentElement.classList.add('bp-js');
  var btns = sw.querySelectorAll('.bp-swb');
  [].forEach.call(btns, function (b) {
    b.addEventListener('click', function () {
      box.setAttribute('data-show', b.getAttribute('data-club'));
      [].forEach.call(btns, function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
      box.scrollTop = 0;
    });
  });
})();
