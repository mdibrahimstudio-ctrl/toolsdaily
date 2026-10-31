// ToolsDaily shared script: footer year + home-page search filter.
(function () {
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  var search = document.getElementById('tool-search');
  if (search) {
    var cards = Array.prototype.slice.call(document.querySelectorAll('.tool-card'));
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
      if (empty) empty.classList.toggle('hidden', visible !== 0);
    });
  }
})();
