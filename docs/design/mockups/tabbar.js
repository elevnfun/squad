/* Phone bottom tab bar (Today / Ranks / Chat). Built from the top bar's own links, so the two never disagree.
   Shown only at 700px and below (see mock.css). Add to a page with: <script src="tabbar.js" defer></script> */
(function () {
  var src = document.querySelectorAll('.nav .links a'); if (!src.length || document.querySelector('.tabbar')) return;
  var icons = {
    Today: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/>',
    Ranks: '<path d="M7 20V11M12 20V5M17 20v-6"/><path d="M4 20h16"/>',
    Chat: '<path d="M4 5.5h16v10.5H10l-4.5 3.5V16H4z"/>'
  };
  var nav = document.createElement('nav'); nav.className = 'tabbar'; nav.setAttribute('aria-label', 'Main');
  nav.innerHTML = [].map.call(src, function (a) {
    var t = a.textContent.trim(), cur = a.classList.contains('cur') || a.getAttribute('aria-current') === 'page';
    return '<a href="' + a.getAttribute('href') + '"' + (cur ? ' class="cur" aria-current="page"' : '') + '><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (icons[t] || '') + '</svg><span>' + t + '</span></a>';
  }).join('');
  document.body.appendChild(nav); document.body.classList.add('has-tabbar');
})();
