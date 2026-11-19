// Logic + UI tests for the Roman Numeral Converter (2026-11-19 daily tool).
// Drives the real page code through jsdom; core functions are window.TD_roman.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire('/tmp/tooltests/package.json');
const { JSDOM, VirtualConsole } = require('jsdom');

const BASE = process.env.TD_BASE || 'http://127.0.0.1:8795/';
const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const unescapeHtml = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

async function loadPage(p) {
  const vc = new VirtualConsole();
  let jsErrors = 0;
  vc.on('jsdomError', (e) => {
    const m = String((e && e.message) || e);
    // External-resource failures and jsdom's unimplemented navigation are
    // environment limits, not page JS errors.
    if (/Could not load|Not implemented/i.test(m)) return;
    jsErrors++;
  });
  const dom = await JSDOM.fromURL(BASE + p, {
    resources: 'usable', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
  });
  await new Promise((res) => {
    if (dom.window.document.readyState === 'complete') res();
    else dom.window.addEventListener('load', res);
    setTimeout(res, 5000);
  });
  await sleep(150);
  return { dom, jsErrors };
}
function setVal(win, sel, value) {
  const el = win.document.querySelector(sel);
  el.value = value;
  el.dispatchEvent(new win.Event('input', { bubbles: true }));
  el.dispatchEvent(new win.Event('change', { bubbles: true }));
  return el;
}

console.log('ROMAN STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'roman-numeral-converter', 'index.html'), 'utf8');
  ok(html.includes('<p class="eyebrow">Converters · No. 67</p>'), 'roman: eyebrow is Converters · No. 67');
  ok(html.includes('<h1 class="rise rise-1">Roman Numeral Converter</h1>'), 'roman: H1 is the tool name');
  ok((html.match(/<h1/g) || []).length === 1, 'roman: exactly one H1');
  ok(html.includes('<title>Roman Numeral Converter — Free Roman Numerals Converter — ToolsDaily</title>'), 'roman: title is the tool name + tagline');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/roman-numeral-converter/">'), 'roman: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'roman: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'roman: twitter card present');
  ok(html.includes('<meta property="og:url" content="https://toolsdaily.vercel.app/roman-numeral-converter/">'), 'roman: og:url present');
  ok(html.includes('<link rel="stylesheet" href="../assets/design.css">'), 'roman: design.css stylesheet linked');
  ok(html.includes('<script src="../assets/site.js"></script>'), 'roman: site.js loaded at end');
  ok(html.includes('<a class="skip" href="#tool">Skip to tool</a>'), 'roman: skip link present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'roman: no external resource loads except the GA4 tag');
  ok(html.includes('G-KX85CZXTR4'), 'roman: GA4 tag present');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'roman: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'Roman Numeral Converter' && app.url === 'https://toolsdaily.vercel.app/roman-numeral-converter/' && app.offers.price === '0', 'roman: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(visible.length === 3 && JSON.stringify(visible) === JSON.stringify(schema), `roman: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  ok(!html.includes('id="download"') && !html.includes('id="dl"'), 'roman: NO #download button and NO #dl anchor (results are shown values only)');
  const nav = html.match(/<nav class="more">[\s\S]*?<\/nav>/)[0];
  const related = ['unit-converter', 'binary-text-converter', 'number-to-words-converter', 'color-converter', 'currency-converter'];
  ok((nav.match(/<li>/g) || []).length === related.length, 'roman: More-tools nav has exactly 5 links');
  ok(related.every((s) => nav.includes(`href="../${s}/"`)), 'roman: More-tools nav links the 5 related tools');
  ok(nav.indexOf('unit-converter') < nav.indexOf('binary-text-converter') && nav.indexOf('binary-text-converter') < nav.indexOf('number-to-words-converter') && nav.indexOf('number-to-words-converter') < nav.indexOf('color-converter') && nav.indexOf('color-converter') < nav.indexOf('currency-converter'), 'roman: More-tools nav links are in the required order');
  ok(nav.includes('>Unit Converter<') && nav.includes('>Binary / Text Converter<') && nav.includes('>Number to Words Converter<') && nav.includes('>Color Converter<') && nav.includes('>Currency Converter<'), 'roman: More-tools nav uses the tools’ display names');
  ok(html.includes('<p>68 tools · New tools added regularly.</p>'), 'roman: footer says 68 tools');
  ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(html), 'roman: no emoji anywhere on the page');
  for (const id of ['#num', '#roman', '#to-roman', '#to-number', '#reset', '#copy', '#msg', '#r-result']) {
    ok(html.includes(`id="${id.slice(1)}"`), `roman: element ${id} present`);
  }
  ok(!html.includes('id="swap"'), 'roman: no #swap button (optional per spec; a literal swap cannot work with a number-typed input and live two-way sync)');
  ok(html.includes('I=1') || (html.includes('<th>I</th>') && html.includes('<td>1</td>')), 'roman: reference table lists I = 1');
  ok(html.includes('M=1000') || (html.includes('<th>M</th>') && html.includes('<td>1,000</td>')), 'roman: reference table lists M = 1,000');
  for (const pair of ['IV', 'IX', 'XL', 'XC', 'CD', 'CM']) {
    ok(html.includes(`<th>${pair}</th>`), `roman: reference table lists subtractive pair ${pair}`);
  }
}

console.log('ROMAN CORE');
{
  const { dom, jsErrors } = await loadPage('roman-numeral-converter/');
  const w = dom.window, TD = w.TD_roman;
  ok(jsErrors === 0, `roman: zero JS errors on load (${jsErrors})`);
  ok(TD && typeof TD.toRoman === 'function' && typeof TD.fromRoman === 'function' && typeof TD.isValidRoman === 'function', 'TD_roman exposed with toRoman, fromRoman, isValidRoman');
  // Canonical conversions, number -> Roman.
  const cases = [[1, 'I'], [2, 'II'], [3, 'III'], [4, 'IV'], [5, 'V'], [9, 'IX'], [10, 'X'], [14, 'XIV'], [19, 'XIX'], [40, 'XL'], [44, 'XLIV'], [49, 'XLIX'], [90, 'XC'], [99, 'XCIX'], [400, 'CD'], [500, 'D'], [900, 'CM'], [1000, 'M'], [1994, 'MCMXCIV'], [2026, 'MMXXVI'], [3999, 'MMMCMXCIX']];
  cases.forEach(([n, r]) => {
    ok(TD.toRoman(n) === r, `toRoman(${n}) -> ${r}`);
  });
  // Same values back, Roman -> number.
  cases.forEach(([n, r]) => {
    ok(TD.fromRoman(r) === n, `fromRoman(${r}) -> ${n}`);
  });
  // Lowercase is accepted (case-insensitive).
  ok(TD.fromRoman('xiv') === 14, 'fromRoman(xiv, lowercase) -> 14');
  ok(TD.fromRoman('mcmxciv') === 1994, 'fromRoman(mcmxciv, lowercase) -> 1994');
  ok(TD.fromRoman('mmxxvi') === 2026, 'fromRoman(mmxxvi, lowercase) -> 2026');
  ok(TD.isValidRoman('xiv') === true, 'isValidRoman(xiv) is true');
  // Round-trip a sample set across the whole range.
  [1, 7, 13, 27, 58, 99, 144, 250, 399, 512, 777, 999, 1234, 1987, 2026, 3000, 3888, 3999].forEach((n) => {
    ok(TD.fromRoman(TD.toRoman(n)) === n, `round-trip ${n} -> ${TD.toRoman(n)} -> ${n}`);
  });
  // isValidRoman on good and bad inputs.
  ok(TD.isValidRoman('MCMXCIV') === true && TD.isValidRoman('I') === true && TD.isValidRoman('MMMCMXCIX') === true, 'isValidRoman true for I, MCMXCIV, MMMCMXCIX');
  ok(TD.isValidRoman('IIII') === false && TD.isValidRoman('VV') === false && TD.isValidRoman('IC') === false && TD.isValidRoman('ABC') === false && TD.isValidRoman('') === false && TD.isValidRoman('   ') === false, 'isValidRoman false for IIII, VV, IC, ABC, empty, spaces');
  // Errors: out of range, non-integer, wrong types.
  ok(!!TD.toRoman(0).error, 'toRoman(0) errors');
  ok(!!TD.toRoman(4000).error, 'toRoman(4000) errors');
  ok(!!TD.toRoman(-1).error, 'toRoman(-1) errors');
  ok(!!TD.toRoman(-3999).error, 'toRoman(-3999) errors');
  ok(!!TD.toRoman(2.5).error, 'toRoman(2.5, non-integer) errors');
  ok(!!TD.toRoman(NaN).error, 'toRoman(NaN) errors');
  ok(!!TD.toRoman(null).error, 'toRoman(null) errors');
  ok(!!TD.toRoman('2026').error, 'toRoman("2026", string) errors');
  // Errors: invalid Roman numerals.
  ok(!!TD.fromRoman('IIII').error, 'fromRoman(IIII) errors');
  ok(!!TD.fromRoman('VV').error, 'fromRoman(VV) errors');
  ok(!!TD.fromRoman('LL').error, 'fromRoman(LL) errors');
  ok(!!TD.fromRoman('DD').error, 'fromRoman(DD) errors');
  ok(!!TD.fromRoman('IC').error, 'fromRoman(IC) errors');
  ok(!!TD.fromRoman('IL').error, 'fromRoman(IL) errors');
  ok(!!TD.fromRoman('VX').error, 'fromRoman(VX) errors');
  ok(!!TD.fromRoman('MMMM').error, 'fromRoman(MMMM) errors');
  ok(!!TD.fromRoman('ABC').error, 'fromRoman(ABC, invalid chars) errors');
  ok(!!TD.fromRoman('X1V').error, 'fromRoman(X1V, digit inside) errors');
  ok(!!TD.fromRoman('').error, 'fromRoman(empty) errors');
  ok(!!TD.fromRoman('   ').error, 'fromRoman(spaces only) errors');
  ok(!!TD.fromRoman(null).error, 'fromRoman(null) errors');
  ok(!!TD.fromRoman(1994).error, 'fromRoman(1994, number) errors');
  dom.window.close();
}

console.log('ROMAN UI');
{
  const { dom } = await loadPage('roman-numeral-converter/');
  const w = dom.window;
  // Defaults on load: 2026 -> MMXXVI.
  ok(w.document.querySelector('#num').value === '2026', 'UI defaults: number input is 2026 on load');
  ok(w.document.querySelector('#roman').value === 'MMXXVI', 'UI defaults: roman input is MMXXVI on load');
  ok(w.document.querySelector('#r-result').textContent === 'MMXXVI', 'UI defaults: result MMXXVI on load');
  // Convert to Roman button.
  setVal(w, '#num', '1994');
  w.document.querySelector('#to-roman').click();
  ok(w.document.querySelector('#r-result').textContent === 'MCMXCIV' && w.document.querySelector('#roman').value === 'MCMXCIV', 'UI Convert to Roman: 1994 -> MCMXCIV and fills the roman box');
  // Convert to Number button.
  setVal(w, '#roman', 'XIV');
  w.document.querySelector('#to-number').click();
  ok(w.document.querySelector('#r-result').textContent === '14' && w.document.querySelector('#num').value === '14', 'UI Convert to Number: XIV -> 14 and fills the number box');
  // Live conversion: typing a number converts.
  setVal(w, '#num', '14');
  ok(w.document.querySelector('#r-result').textContent === 'XIV', 'UI live: typing 14 converts to XIV');
  // Live conversion: typing a Roman numeral converts.
  setVal(w, '#roman', 'XL');
  ok(w.document.querySelector('#r-result').textContent === '40', 'UI live: typing XL converts to 40');
  // Lowercase Roman numeral converts in the UI.
  setVal(w, '#roman', 'xiv');
  ok(w.document.querySelector('#r-result').textContent === '14', 'UI live: typing xiv (lowercase) converts to 14');
  // Invalid number shows an error and clears the result.
  setVal(w, '#num', '4000');
  ok(w.document.querySelector('#msg').textContent.length > 0 && w.document.querySelector('#r-result').textContent === '–', 'UI number 4000 shows an error and clears the result');
  // Invalid Roman numeral shows an error and clears the result.
  setVal(w, '#roman', 'IIII');
  ok(w.document.querySelector('#msg').textContent.length > 0 && w.document.querySelector('#r-result').textContent === '–', 'UI Roman IIII shows an error and clears the result');
  // Invalid characters show an error and clear the result.
  setVal(w, '#roman', 'ABC');
  ok(w.document.querySelector('#msg').textContent.length > 0 && w.document.querySelector('#r-result').textContent === '–', 'UI Roman ABC shows an error and clears the result');
  // Empty number shows an error and clears the result.
  setVal(w, '#num', '');
  ok(w.document.querySelector('#msg').textContent.length > 0 && w.document.querySelector('#r-result').textContent === '–', 'UI empty number shows an error and clears the result');
  // Reset restores the defaults.
  w.document.querySelector('#reset').click();
  ok(w.document.querySelector('#num').value === '2026' && w.document.querySelector('#roman').value === 'MMXXVI' && w.document.querySelector('#r-result').textContent === 'MMXXVI', 'UI Reset restores 2026 / MMXXVI / result MMXXVI');
  // No swap button: the spec marks #swap optional, and a literal value-swap
  // cannot work here — #num is a number-typed input (it rejects "XIV") and
  // live two-way sync keeps both fields consistent, so swapping is identity.
  ok(!w.document.querySelector('#swap'), 'UI no swap button present');
  w.document.querySelector('#reset').click();
  // Copy with a stubbed clipboard.
  let copied = null;
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (t) => { copied = t; } }, configurable: true });
  w.document.querySelector('#copy').click();
  await sleep(80);
  ok(copied && copied.includes('2026') && copied.includes('MMXXVI') && w.document.querySelector('#msg').textContent === 'Copied to clipboard.' && w.document.querySelector('#msg').className === 'msg ok', 'UI copy writes the result to the clipboard and shows a visible success message');
  // Copy with invalid input copies nothing and shows a hint.
  setVal(w, '#num', '4000');
  copied = null;
  w.document.querySelector('#copy').click();
  await sleep(80);
  ok(copied === null && w.document.querySelector('#msg').textContent.length > 0, 'UI copy with invalid input copies nothing and shows a hint');
  dom.window.close();
}

console.log(`\nLOGIC-ROMAN TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
