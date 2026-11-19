// Logic + UI tests for the Number to Words Converter (2026-11-19 daily tool).
// Drives the real page code through jsdom; core functions are window.TD_numwords.
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

console.log('NUMWORDS STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'number-to-words-converter', 'index.html'), 'utf8');
  ok(html.includes('<p class="eyebrow">Converters · No. 68</p>'), 'numwords: eyebrow is Converters · No. 68');
  ok(html.includes('<h1 class="rise rise-1">Number to Words Converter</h1>'), 'numwords: H1 is the tool name');
  ok((html.match(/<h1/g) || []).length === 1, 'numwords: exactly one H1');
  ok(html.includes('<title>Number to Words Converter — Free Number to Words — ToolsDaily</title>'), 'numwords: title is correct');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/number-to-words-converter/">'), 'numwords: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'numwords: og:image present');
  ok(html.includes('<meta property="og:url" content="https://toolsdaily.vercel.app/number-to-words-converter/">'), 'numwords: og:url present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'numwords: twitter card present');
  ok(html.includes('<link rel="stylesheet" href="../assets/design.css">'), 'numwords: design.css stylesheet linked');
  ok(html.includes('<script src="../assets/site.js"></script>'), 'numwords: site.js loaded at end');
  ok(html.includes('<a class="skip" href="#tool">Skip to tool</a>'), 'numwords: skip link present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'numwords: no external resource loads except the GA4 tag');
  ok(html.includes('G-KX85CZXTR4'), 'numwords: GA4 tag present');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'numwords: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'Number to Words Converter' && app.url === 'https://toolsdaily.vercel.app/number-to-words-converter/' && app.offers.price === '0', 'numwords: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(visible.length === 3 && JSON.stringify(visible) === JSON.stringify(schema), `numwords: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  ok(!html.includes('id="download"') && !html.includes('id="dl"'), 'numwords: NO #download button and NO #dl anchor present');
  ok(!/download/i.test(html.match(/<div class="card[\s\S]*?<\/div>\s*<script>/)[0].replace(/Download/g, '')), 'numwords: no download wording in the tool card');
  const nav = html.match(/<nav class="more">[\s\S]*?<\/nav>/)[0];
  const related = ['roman-numeral-converter', 'unit-converter', 'currency-converter', 'binary-text-converter', 'date-difference-calculator'];
  ok((nav.match(/<li>/g) || []).length === related.length, 'numwords: More-tools nav has exactly 5 links');
  ok(related.every((s) => nav.includes(`href="../${s}/"`)), 'numwords: More-tools nav links the 5 related tools');
  ok(nav.indexOf('roman-numeral-converter') < nav.indexOf('unit-converter') && nav.indexOf('unit-converter') < nav.indexOf('currency-converter') && nav.indexOf('currency-converter') < nav.indexOf('binary-text-converter') && nav.indexOf('binary-text-converter') < nav.indexOf('date-difference-calculator'), 'numwords: More-tools nav links are in the required order');
  ok(nav.includes('>Roman Numeral Converter<') && nav.includes('>Unit Converter<') && nav.includes('>Currency Converter<') && nav.includes('>Binary / Text Converter<') && nav.includes('>Date Difference Calculator<'), 'numwords: More-tools nav uses the tools’ display names');
  ok(html.includes('<p>68 tools · New tools added regularly.</p>'), 'numwords: footer says 68 tools');
  ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(html), 'numwords: no emoji anywhere on the page');
  for (const id of ['#num', '#mode', '#convert', '#reset', '#copy', '#msg', '#r-result']) {
    ok(html.includes(`id="${id.slice(1)}"`), `numwords: element ${id} present`);
  }
  ok(html.includes('<option value="words"') && html.includes('<option value="cheque"') && html.includes('<option value="currency"'), 'numwords: mode select has words / cheque / currency options');
  ok(html.includes('<option value="USD"') && html.includes('<option value="EUR"') && html.includes('<option value="GBP"'), 'numwords: currency select has USD / EUR / GBP options');
}

console.log('NUMWORDS CORE');
{
  const { dom, jsErrors } = await loadPage('number-to-words-converter/');
  const w = dom.window, TD = w.TD_numwords;
  ok(jsErrors === 0, `numwords: zero JS errors on load (${jsErrors})`);
  ok(TD && typeof TD.toWords === 'function' && typeof TD.toCheque === 'function' && typeof TD.toCurrency === 'function', 'TD_numwords exposed with toWords, toCheque, toCurrency');
  const cases = [
    [0, 'zero'], [5, 'five'], [11, 'eleven'], [19, 'nineteen'], [20, 'twenty'],
    [21, 'twenty-one'], [99, 'ninety-nine'], [100, 'one hundred'], [101, 'one hundred one'],
    [1000, 'one thousand'], [1234, 'one thousand two hundred thirty-four'],
    [1000000, 'one million'], [1000000000, 'one billion'],
    [123456789, 'one hundred twenty-three million four hundred fifty-six thousand seven hundred eighty-nine'],
    [-42, 'minus forty-two'], [3.14, 'three point one four'],
    [1000000000000, 'one trillion'], [999999999999999, 'nine hundred ninety-nine trillion nine hundred ninety-nine billion nine hundred ninety-nine million nine hundred ninety-nine thousand nine hundred ninety-nine'],
    [1000001, 'one million one'], [2000000, 'two million'], [1000000000001, 'one trillion one'],
    [0.5, 'zero point five'], [-3.14, 'minus three point one four'],
    [10, 'ten'], [100000, 'one hundred thousand'], [100000000, 'one hundred million'],
  ];
  for (const [n, expected] of cases) {
    ok(TD.toWords(n) === expected, `toWords(${n}) === "${expected}"`);
  }
  // String input is accepted too.
  ok(TD.toWords('1234') === 'one thousand two hundred thirty-four', 'toWords("1234") string input works');
  ok(TD.toWords('42') === 'forty-two', 'toWords("42") string input works');
  // Cheque style.
  ok(TD.toCheque(1234) === 'One thousand two hundred thirty-four only', 'toCheque(1234) === "One thousand two hundred thirty-four only"');
  ok(TD.toCheque(0) === 'Zero only', 'toCheque(0) === "Zero only"');
  ok(TD.toCheque(100) === 'One hundred only', 'toCheque(100) === "One hundred only"');
  ok(TD.toCheque(-42) === 'Minus forty-two only', 'toCheque(-42) === "Minus forty-two only"');
  // Currency mode (USD default).
  ok(TD.toCurrency(1234.56) === 'one thousand two hundred thirty-four dollars and fifty-six cents', 'toCurrency(1234.56) === "... dollars and fifty-six cents"');
  ok(TD.toCurrency(1234.56, 'USD') === 'one thousand two hundred thirty-four dollars and fifty-six cents', 'toCurrency(1234.56, USD) explicit USD works');
  ok(TD.toCurrency(100) === 'one hundred dollars', 'toCurrency(100) === "one hundred dollars" (no cents when zero)');
  ok(TD.toCurrency(1) === 'one dollar', 'toCurrency(1) === "one dollar" (singular)');
  ok(TD.toCurrency(1.01) === 'one dollar and one cent', 'toCurrency(1.01) === "one dollar and one cent" (singular cent)');
  ok(TD.toCurrency(0) === 'zero dollars', 'toCurrency(0) === "zero dollars"');
  ok(TD.toCurrency(-42.5) === 'minus forty-two dollars and fifty cents', 'toCurrency(-42.5) === "minus forty-two dollars and fifty cents"');
  ok(TD.toCurrency(100, 'EUR') === 'one hundred euros', 'toCurrency(100, EUR) === "one hundred euros"');
  ok(TD.toCurrency(2.5, 'GBP') === 'two pounds and fifty pence', 'toCurrency(2.5, GBP) === "two pounds and fifty pence"');
  // Errors: out of range and non-numeric.
  ok(!!TD.toWords(1000000000000000).error, 'toWords(1 quadrillion) errors (beyond trillions)');
  ok(!!TD.toWords(10000000000000000).error, 'toWords(10 quadrillion) errors');
  ok(!!TD.toWords('1000000000000000').error, 'toWords("1000000000000000") string beyond trillions errors');
  ok(!!TD.toWords('abc').error, 'toWords("abc") errors');
  ok(!!TD.toWords('').error, 'toWords("") errors');
  ok(!!TD.toWords(NaN).error, 'toWords(NaN) errors');
  ok(!!TD.toWords(null).error, 'toWords(null) errors');
  ok(!!TD.toWords(undefined).error, 'toWords(undefined) errors');
  ok(!!TD.toCheque('hello').error, 'toCheque("hello") errors');
  ok(!!TD.toCheque(1000000000000000).error, 'toCheque(1 quadrillion) errors');
  ok(!!TD.toCurrency('abc').error, 'toCurrency("abc") errors');
  ok(!!TD.toCurrency(1000000000000000).error, 'toCurrency(1 quadrillion) errors');
  ok(!!TD.toCurrency(100, 'JPY').error, 'toCurrency(100, JPY) errors for unsupported currency');
  dom.window.close();
}

console.log('NUMWORDS UI');
{
  const { dom } = await loadPage('number-to-words-converter/');
  const w = dom.window;
  const result = () => w.document.querySelector('#r-result').textContent;
  const msg = () => w.document.querySelector('#msg').textContent;
  // Defaults on load: 1234 in plain-words mode.
  ok(result() === 'one thousand two hundred thirty-four', 'UI defaults: 1234 converts on load to "one thousand two hundred thirty-four"');
  // Typing a number converts live.
  setVal(w, '#num', '42');
  ok(result() === 'forty-two', 'UI live: typing 42 shows "forty-two"');
  setVal(w, '#num', '1000000');
  ok(result() === 'one million', 'UI live: typing 1000000 shows "one million"');
  // Mode switch changes the output format.
  setVal(w, '#num', '1234');
  setVal(w, '#mode', 'cheque');
  ok(result() === 'One thousand two hundred thirty-four only', 'UI cheque mode: 1234 shows "One thousand two hundred thirty-four only"');
  setVal(w, '#mode', 'currency');
  ok(result() === 'one thousand two hundred thirty-four dollars', 'UI currency mode: 1234 shows "... dollars"');
  setVal(w, '#num', '1234.56');
  ok(result() === 'one thousand two hundred thirty-four dollars and fifty-six cents', 'UI currency mode: 1234.56 shows dollars and cents');
  setVal(w, '#currency', 'EUR');
  ok(result() === 'one thousand two hundred thirty-four euros and fifty-six cents', 'UI currency EUR: 1234.56 shows euros and cents');
  setVal(w, '#currency', 'USD');
  setVal(w, '#mode', 'words');
  // Convert button applies the current inputs.
  setVal(w, '#num', '99');
  w.document.querySelector('#convert').click();
  ok(result() === 'ninety-nine', 'UI Convert button: 99 shows "ninety-nine"');
  // Negative and decimal via the UI.
  setVal(w, '#num', '-42');
  ok(result() === 'minus forty-two', 'UI live: -42 shows "minus forty-two"');
  setVal(w, '#num', '3.14');
  ok(result() === 'three point one four', 'UI live: 3.14 shows "three point one four"');
  // Invalid input shows an error and clears the result.
  setVal(w, '#num', '');
  ok(msg().length > 0 && result() === '–', 'UI empty input shows an error and clears the result');
  setVal(w, '#num', '1000000000000000');
  ok(msg().length > 0 && result() === '–', 'UI out-of-range input shows an error and clears the result');
  // Reset restores the defaults.
  w.document.querySelector('#reset').click();
  ok(w.document.querySelector('#num').value === '1234' && w.document.querySelector('#mode').value === 'words' && w.document.querySelector('#currency').value === 'USD', 'UI Reset restores number 1234, words mode, USD');
  ok(result() === 'one thousand two hundred thirty-four', 'UI Reset recalculates the default result');
  ok(msg() === '', 'UI Reset clears the message');
  // Copy with a stubbed clipboard.
  let copied = null;
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (t) => { copied = t; } }, configurable: true });
  w.document.querySelector('#copy').click();
  await sleep(80);
  ok(copied === 'one thousand two hundred thirty-four' && msg() === 'Copied to clipboard.' && w.document.querySelector('#msg').className === 'msg ok', 'UI copy writes the result to the clipboard and shows a visible success message');
  // Copy after switching mode copies the new format.
  setVal(w, '#mode', 'cheque');
  copied = null;
  w.document.querySelector('#copy').click();
  await sleep(80);
  ok(copied === 'One thousand two hundred thirty-four only', 'UI copy in cheque mode writes the cheque text to the clipboard');
  dom.window.close();
}

console.log(`\nLOGIC-NUMWORDS TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
