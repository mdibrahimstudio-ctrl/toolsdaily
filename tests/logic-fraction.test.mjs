// Logic + UI tests for the Fraction Calculator (2026-11-19 daily tool).
// Drives the real page code through jsdom; core functions are window.TD_fraction.
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
const eq = (f, n, d) => f && !f.error && f.num === n && f.den === d;

console.log('FRACTION STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'fraction-calculator', 'index.html'), 'utf8');
  ok(html.includes('<p class="eyebrow">Calculators · No. 66</p>'), 'fraction: eyebrow is Calculators · No. 66');
  ok(html.includes('<h1 class="rise rise-1">Fraction Calculator</h1>'), 'fraction: H1 is the tool name');
  ok((html.match(/<h1/g) || []).length === 1, 'fraction: exactly one H1');
  ok(html.includes('<title>Fraction Calculator — Free Online Fraction Calculator — ToolsDaily</title>'), 'fraction: title is exact');
  ok(html.includes('<meta name="description" content="Free fraction calculator:'), 'fraction: meta description present');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/fraction-calculator/">'), 'fraction: canonical present');
  ok(html.includes('<meta property="og:url" content="https://toolsdaily.vercel.app/fraction-calculator/">'), 'fraction: og:url present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'fraction: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'fraction: twitter card present');
  ok(html.includes('<link rel="stylesheet" href="../assets/design.css">'), 'fraction: design.css stylesheet linked');
  ok(html.includes('<script src="../assets/site.js"></script>'), 'fraction: site.js loaded at end');
  ok(html.includes('<a class="skip" href="#tool">Skip to tool</a>'), 'fraction: skip link present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'fraction: no external resource loads except the GA4 tag');
  ok(html.includes('G-KX85CZXTR4'), 'fraction: GA4 tag present');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'fraction: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'Fraction Calculator' && app.url === 'https://toolsdaily.vercel.app/fraction-calculator/' && app.offers.price === '0', 'fraction: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(visible.length === 3 && JSON.stringify(visible) === JSON.stringify(schema), `fraction: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  ok(html.includes('<p>68 tools · New tools added regularly.</p>'), 'fraction: footer says 68 tools');
  ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(html), 'fraction: no emoji anywhere on the page');
  const nav = html.match(/<nav class="more">[\s\S]*?<\/nav>/)[0];
  const related = ['percentage-calculator', 'scientific-calculator', 'unit-converter', 'bmi-calculator', 'date-difference-calculator'];
  ok((nav.match(/<li>/g) || []).length === related.length, 'fraction: More-tools nav has exactly 5 links');
  ok(related.every((s) => nav.includes(`href="../${s}/"`)), 'fraction: More-tools nav links the 5 related tools');
  ok(nav.indexOf('percentage-calculator') < nav.indexOf('scientific-calculator') && nav.indexOf('scientific-calculator') < nav.indexOf('unit-converter') && nav.indexOf('unit-converter') < nav.indexOf('bmi-calculator') && nav.indexOf('bmi-calculator') < nav.indexOf('date-difference-calculator'), 'fraction: More-tools nav links are in the required order');
  ok(nav.includes('>Percentage Calculator<') && nav.includes('>Scientific Calculator<') && nav.includes('>Unit Converter<') && nav.includes('>BMI Calculator<') && nav.includes('>Date Difference Calculator<'), 'fraction: More-tools nav uses the tools’ display names');
  for (const id of ['#frac-a', '#frac-b', '#op', '#calc', '#reset', '#copy', '#msg', '#r-result', '#r-decimal', '#r-steps']) {
    ok(html.includes(`id="${id.slice(1)}"`), `fraction: element ${id} present`);
  }
  ok(html.includes('<option value="add" selected>') && html.includes('<option value="subtract">') && html.includes('<option value="multiply">') && html.includes('<option value="divide">'), 'fraction: operation select has add/subtract/multiply/divide');
  ok(!html.includes('id="download"') && !html.includes('id="dl"'), 'fraction: NO #download / #dl present');
  ok(!html.includes('Download'), 'fraction: no download button or label anywhere');
}

console.log('FRACTION CORE');
{
  const { dom, jsErrors } = await loadPage('fraction-calculator/');
  const w = dom.window, TD = w.TD_fraction;
  ok(jsErrors === 0, `fraction: zero JS errors on load (${jsErrors})`);
  ok(TD && typeof TD.parseFraction === 'function' && typeof TD.gcd === 'function' && typeof TD.simplify === 'function' && typeof TD.add === 'function' && typeof TD.sub === 'function' && typeof TD.mul === 'function' && typeof TD.div === 'function' && typeof TD.toDecimal === 'function' && typeof TD.formatFraction === 'function', 'TD_fraction exposed with parseFraction, gcd, simplify, add, sub, mul, div, toDecimal, formatFraction');
  // parseFraction: plain fractions, whole numbers, mixed numbers, negatives.
  ok(eq(TD.parseFraction('1/2'), 1, 2), 'parse 1/2 -> 1/2');
  ok(eq(TD.parseFraction('3/4'), 3, 4), 'parse 3/4 -> 3/4');
  ok(eq(TD.parseFraction('5'), 5, 1), 'parse whole 5 -> 5/1');
  ok(eq(TD.parseFraction('-3'), -3, 1), 'parse whole -3 -> -3/1');
  ok(eq(TD.parseFraction('-1/2'), -1, 2), 'parse -1/2 -> -1/2');
  ok(eq(TD.parseFraction('1 1/2'), 3, 2), 'parse mixed 1 1/2 -> 3/2');
  ok(eq(TD.parseFraction('-1 1/2'), -3, 2), 'parse mixed -1 1/2 -> -3/2');
  ok(eq(TD.parseFraction('2 1/4'), 9, 4), 'parse mixed 2 1/4 -> 9/4');
  ok(eq(TD.parseFraction('0'), 0, 1), 'parse 0 -> 0/1');
  ok(eq(TD.parseFraction('0/5'), 0, 1), 'parse 0/5 -> 0/1');
  ok(eq(TD.parseFraction('2/4'), 1, 2), 'parse 2/4 simplifies to 1/2');
  ok(eq(TD.parseFraction('12/18'), 2, 3), 'parse 12/18 simplifies to 2/3');
  ok(eq(TD.parseFraction('1 / 2'), 1, 2), 'parse 1 / 2 (spaces around slash) -> 1/2');
  // gcd and simplify.
  ok(TD.gcd(12, 18) === 6, 'gcd(12, 18) = 6');
  ok(TD.gcd(0, 5) === 5, 'gcd(0, 5) = 5');
  ok(TD.gcd(7, 13) === 1, 'gcd(7, 13) = 1');
  ok(TD.gcd(-12, 18) === 6, 'gcd(-12, 18) = 6');
  ok(eq(TD.simplify(12, 18), 2, 3), 'simplify 12/18 -> 2/3');
  ok(eq(TD.simplify(-4, 8), -1, 2), 'simplify -4/8 -> -1/2');
  ok(eq(TD.simplify(0, 5), 0, 1), 'simplify 0/5 -> 0/1');
  ok(!!TD.simplify(1, 0).error, 'simplify with zero denominator errors');
  // The four required arithmetic cases.
  ok(eq(TD.add({ num: 1, den: 2 }, { num: 1, den: 3 }), 5, 6), '1/2 + 1/3 = 5/6');
  ok(eq(TD.sub({ num: 3, den: 4 }, { num: 1, den: 4 }), 1, 2), '3/4 - 1/4 = 1/2');
  ok(eq(TD.mul({ num: 2, den: 3 }, { num: 3, den: 4 }), 1, 2), '2/3 x 3/4 = 1/2');
  ok(eq(TD.div({ num: 1, den: 2 }, { num: 1, den: 4 }), 2, 1), '1/2 / 1/4 = 2');
  // More arithmetic: negatives, whole numbers, mixed numbers, zero.
  ok(eq(TD.add({ num: -1, den: 2 }, { num: 1, den: 2 }), 0, 1), '-1/2 + 1/2 = 0');
  ok(eq(TD.sub({ num: 1, den: 2 }, { num: 3, den: 4 }), -1, 4), '1/2 - 3/4 = -1/4');
  ok(eq(TD.mul({ num: -2, den: 3 }, { num: 3, den: 4 }), -1, 2), '-2/3 x 3/4 = -1/2');
  ok(eq(TD.div({ num: 1, den: 2 }, { num: -1, den: 4 }), -2, 1), '1/2 / -1/4 = -2');
  ok(eq(TD.add({ num: 5, den: 1 }, { num: 1, den: 2 }), 11, 2), '5 + 1/2 = 11/2');
  ok(eq(TD.mul({ num: 3, den: 2 }, { num: 2, den: 1 }), 3, 1), '3/2 x 2 = 3');
  ok(eq(TD.add({ num: 0, den: 1 }, { num: 1, den: 3 }), 1, 3), '0 + 1/3 = 1/3');
  // calculate() wrapper with strings, including mixed numbers and steps.
  const c1 = TD.calculate('1/2', '1/3', 'add');
  ok(!c1.error && eq(c1.result, 5, 6) && c1.decimal === 0.833333 && c1.steps.includes('3/6') && c1.steps.includes('2/6'), 'calculate 1/2 + 1/3 = 5/6, decimal 0.833333, steps show 3/6 + 2/6');
  const c2 = TD.calculate('1 1/2', '1/2', 'add');
  ok(!c2.error && eq(c2.result, 2, 1), 'calculate 1 1/2 + 1/2 = 2');
  const c3 = TD.calculate('2/3', '3/4', 'multiply');
  ok(!c3.error && eq(c3.result, 1, 2) && c3.steps.includes('6/12'), 'calculate 2/3 x 3/4 = 1/2, steps show 6/12');
  const c4 = TD.calculate('1/2', '1/4', 'divide');
  ok(!c4.error && eq(c4.result, 2, 1) && c4.steps.includes('4/1'), 'calculate 1/2 / 1/4 = 2, steps show the flipped 4/1');
  // toDecimal and formatFraction (mixed-number display).
  ok(TD.toDecimal({ num: 5, den: 6 }) === 0.833333, 'toDecimal 5/6 = 0.833333');
  ok(TD.toDecimal({ num: 1, den: 2 }) === 0.5, 'toDecimal 1/2 = 0.5');
  ok(TD.toDecimal({ num: 2, den: 1 }) === 2, 'toDecimal 2/1 = 2');
  ok(TD.toDecimal({ num: 1, den: 3 }, 2) === 0.33, 'toDecimal 1/3 to 2 places = 0.33');
  ok(TD.formatFraction({ num: 5, den: 6 }) === '5/6', 'format 5/6 stays 5/6');
  ok(TD.formatFraction({ num: 3, den: 2 }) === '1 1/2', 'format 3/2 -> mixed 1 1/2');
  ok(TD.formatFraction({ num: 2, den: 1 }) === '2', 'format 2/1 -> 2');
  ok(TD.formatFraction({ num: -3, den: 2 }) === '-1 1/2', 'format -3/2 -> mixed -1 1/2');
  ok(TD.formatFraction({ num: 0, den: 1 }) === '0', 'format 0/1 -> 0');
  // Summary text contains the key figures.
  const s = TD.summary(c1);
  ok(s.includes('1/2 + 1/3 = 5/6') && s.includes('Decimal: 0.833333') && s.includes('Working:'), 'summary lists the sum, decimal and working');
  // Errors: zero denominator, divide by zero, invalid input.
  ok(!!TD.parseFraction('1/0').error, 'parse 1/0 errors (zero denominator)');
  ok(!!TD.parseFraction('1 1/0').error, 'parse mixed 1 1/0 errors (zero denominator)');
  ok(!!TD.parseFraction('').error, 'parse empty input errors');
  ok(!!TD.parseFraction('abc').error, 'parse abc errors');
  ok(!!TD.parseFraction('1.5').error, 'parse decimal 1.5 errors');
  ok(!!TD.parseFraction('1/2/3').error, 'parse 1/2/3 errors');
  ok(!!TD.div({ num: 1, den: 2 }, { num: 0, den: 1 }).error, 'divide by zero fraction errors');
  ok(!!TD.calculate('1/2', '0', 'divide').error, 'calculate 1/2 / 0 errors');
  ok(!!TD.calculate('1/0', '1/2', 'add').error, 'calculate with 1/0 errors');
  ok(!!TD.calculate('abc', '1/2', 'add').error, 'calculate with invalid input errors');
  ok(!!TD.calculate('1/2', '1/3', 'bogus').error, 'calculate with unknown operation errors');
  dom.window.close();
}

console.log('FRACTION UI');
{
  const { dom, jsErrors } = await loadPage('fraction-calculator/');
  const w = dom.window;
  ok(jsErrors === 0, `fraction: zero JS errors on load (${jsErrors})`);
  // Defaults on load: 1/2 + 1/3 = 5/6.
  ok(w.document.querySelector('#r-result').textContent === '5/6', 'UI defaults: result 5/6 on load');
  ok(w.document.querySelector('#r-decimal').textContent === '0.833333', 'UI defaults: decimal 0.833333 on load');
  ok(w.document.querySelector('#r-steps').textContent.includes('3/6') && w.document.querySelector('#r-steps').textContent.includes('2/6'), 'UI defaults: steps show the common denominator 3/6 + 2/6');
  // Subtract with the same inputs: 1/2 - 1/3 = 1/6.
  setVal(w, '#op', 'subtract');
  ok(w.document.querySelector('#r-result').textContent === '1/6', 'UI subtract: 1/2 - 1/3 = 1/6');
  ok(w.document.querySelector('#r-decimal').textContent === '0.166667', 'UI subtract: decimal 0.166667');
  // Live update: 2/3 x 3/4 = 1/2.
  setVal(w, '#op', 'multiply');
  setVal(w, '#frac-a', '2/3');
  setVal(w, '#frac-b', '3/4');
  ok(w.document.querySelector('#r-result').textContent === '1/2', 'UI live: 2/3 x 3/4 = 1/2');
  ok(w.document.querySelector('#r-decimal').textContent === '0.5', 'UI live: decimal 0.5');
  // Divide: 1/2 / 1/4 = 2, shown as a whole number.
  setVal(w, '#op', 'divide');
  setVal(w, '#frac-a', '1/2');
  setVal(w, '#frac-b', '1/4');
  ok(w.document.querySelector('#r-result').textContent === '2', 'UI divide: 1/2 / 1/4 = 2');
  ok(w.document.querySelector('#r-decimal').textContent === '2', 'UI divide: decimal 2');
  // Calculate button applies the current inputs (mixed numbers).
  setVal(w, '#op', 'add');
  setVal(w, '#frac-a', '1 1/2');
  setVal(w, '#frac-b', '1/2');
  w.document.querySelector('#calc').click();
  ok(w.document.querySelector('#r-result').textContent === '2' && w.document.querySelector('#r-decimal').textContent === '2', 'UI Calculate button: 1 1/2 + 1/2 = 2');
  // Invalid input shows an error and clears the results.
  setVal(w, '#frac-a', 'abc');
  ok(w.document.querySelector('#msg').textContent.length > 0 && w.document.querySelector('#r-result').textContent === '–' && w.document.querySelector('#r-decimal').textContent === '–' && w.document.querySelector('#r-steps').textContent === '', 'UI invalid input shows an error and clears the results');
  // Zero denominator shows an error and clears the results.
  setVal(w, '#frac-a', '1/0');
  ok(w.document.querySelector('#msg').textContent.length > 0 && w.document.querySelector('#r-result').textContent === '–', 'UI 1/0 shows an error and clears the results');
  // Reset restores the defaults.
  w.document.querySelector('#reset').click();
  ok(w.document.querySelector('#frac-a').value === '1/2' && w.document.querySelector('#frac-b').value === '1/3' && w.document.querySelector('#op').value === 'add', 'UI Reset restores 1/2, 1/3, add');
  ok(w.document.querySelector('#r-result').textContent === '5/6' && w.document.querySelector('#r-decimal').textContent === '0.833333', 'UI Reset recalculates the defaults 5/6 / 0.833333');
  // Copy with a stubbed clipboard.
  let copied = null;
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (t) => { copied = t; } }, configurable: true });
  w.document.querySelector('#copy').click();
  await sleep(80);
  ok(copied && copied.includes('1/2 + 1/3 = 5/6') && copied.includes('Decimal: 0.833333') && w.document.querySelector('#msg').textContent === 'Copied to clipboard.' && w.document.querySelector('#msg').className === 'msg ok', 'UI copy writes the summary to the clipboard and shows a visible success message');
  dom.window.close();
}

console.log(`\nLOGIC-FRACTION TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
