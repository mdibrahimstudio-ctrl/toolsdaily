// ToolsDaily shared script: dark/light theme toggle, footer year + home-page search filter.
(function () {
  var rootEl = document.documentElement;
  var toggle = document.getElementById('theme-toggle');
  function currentTheme() { return rootEl.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
  function paintToggle() {
    if (!toggle) return;
    var dark = currentTheme() === 'dark';
    toggle.textContent = dark ? '☀️' : '🌙';
    toggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  }
  if (toggle) {
    paintToggle();
    toggle.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      rootEl.setAttribute('data-theme', next);
      try { localStorage.setItem('td-theme', next); } catch (e) {}
      paintToggle();
    });
  }

  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  var search = document.getElementById('tool-search');
  if (search) {
    var cards = Array.prototype.slice.call(document.querySelectorAll('.tool-card'));
    var sections = Array.prototype.slice.call(document.querySelectorAll('.cat'));
    var empty = document.getElementById('no-results');
    search.addEventListener('input', function () {
      var q = search.value.trim().toLowerCase();
      var visible = 0;
      cards.forEach(function (card) {
        var hay = (card.getAttribute('data-name') + ' ' + card.textContent).toLowerCase();
        var show = !q || hay.indexOf(q) !== -1;
        card.classList.toggle('hidden', !show);
        if (show) visible++;
      });
      // Hide category sections that have no matching cards while searching.
      sections.forEach(function (sec) {
        if (!q) { sec.classList.remove('hidden'); return; }
        var any = Array.prototype.some.call(sec.querySelectorAll('.tool-card'), function (c) {
          return !c.classList.contains('hidden');
        });
        sec.classList.toggle('hidden', !any);
      });
      if (empty) empty.classList.toggle('hidden', visible !== 0);
    });
  }
})();
