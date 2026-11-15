// ToolsDaily v2 shared script: theme toggle (SVG sun/moon), footer year,
// home-page search + category filter (combined, animated).
(function () {
  'use strict';
  var rootEl = document.documentElement;
  var toggle = document.getElementById('theme-toggle');
  function currentTheme() { return rootEl.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
  function paintToggle() {
    if (!toggle) return;
    var dark = currentTheme() === 'dark';
    toggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    toggle.setAttribute('title', dark ? 'Switch to light mode' : 'Switch to dark mode');
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

  // ---- Home: search + category filter, combined ----
  var search = document.getElementById('tool-search');
  var chips = Array.prototype.slice.call(document.querySelectorAll('.cat-chip'));
  if (!search && !chips.length) return;
  var cards = Array.prototype.slice.call(document.querySelectorAll('.tool-card'));
  var sections = Array.prototype.slice.call(document.querySelectorAll('.cat'));
  var empty = document.getElementById('no-results');
  var activeCat = 'all';
  var reduceMotion = false;
  try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  function cardMatches(card, q) {
    if (activeCat !== 'all') {
      var sec = card.closest('.cat');
      if (!sec || sec.getAttribute('data-cat') !== activeCat) return false;
    }
    if (!q) return true;
    var hay = ((card.getAttribute('data-name') || '') + ' ' + card.textContent).toLowerCase();
    return hay.indexOf(q) !== -1;
  }

  function showCard(card) {
    // Clear a pending hide first: a card mid-fade ('leaving' but not yet
    // 'hidden') must not be hidden by its stale timer after it matches again.
    card.classList.remove('leaving');
    if (!card.classList.contains('hidden')) return;
    card.classList.remove('hidden');
    if (!reduceMotion) {
      card.classList.add('entering');
      setTimeout(function () { card.classList.remove('entering'); }, 320);
    }
  }
  function hideCard(card) {
    if (card.classList.contains('hidden')) return;
    if (reduceMotion) { card.classList.add('hidden'); return; }
    card.classList.add('leaving');
    setTimeout(function () { if (!card.classList.contains('leaving')) return; card.classList.add('hidden'); card.classList.remove('leaving'); }, 150);
  }

  function applyFilter() {
    var q = search ? search.value.trim().toLowerCase() : '';
    var visible = 0;
    cards.forEach(function (card) {
      if (cardMatches(card, q)) { showCard(card); visible++; }
      else hideCard(card);
    });
    sections.forEach(function (sec) {
      var any = Array.prototype.some.call(sec.querySelectorAll('.tool-card'), function (c) {
        return cardMatches(c, q);
      });
      sec.classList.toggle('hidden', !any);
    });
    if (empty) empty.classList.toggle('hidden', visible !== 0);
  }

  if (search) search.addEventListener('input', applyFilter);
  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      activeCat = chip.getAttribute('data-filter') || 'all';
      chips.forEach(function (c) { c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'); });
      applyFilter();
      var grid = document.getElementById('tools');
      if (grid && activeCat !== 'all') grid.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    });
  });

  // Deep links (#ai-tools etc.) still work: if the URL has a category hash,
  // activate that filter on load so the section isn't hidden by a stale state.
  try {
    var hash = window.location.hash.replace('#', '');
    var valid = ['ai-tools', 'image-tools', 'pdf-tools', 'calculators', 'text-tools', 'converters', 'generators'];
    if (valid.indexOf(hash) !== -1) {
      var chip = document.querySelector('.cat-chip[data-filter="' + hash + '"]');
      if (chip) chip.click();
    }
  } catch (e) {}
})();
