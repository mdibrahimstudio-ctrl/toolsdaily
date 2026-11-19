// Logic + UI tests for the Scientific Calculator (2026-11-19 daily tool).
// Drives the real page code through jsdom; core functions are window.TD_scientific.
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
const approx = (a, b) => typeof a === 'number' && Math.abs(a - b) < 1e-9;

async function loadPage(p) {
  const vc = new VirtualConsole();
  let jsErrors = 0;
  vc.on('jsdomError', (e) => {
    const m = String((e && e.message) || e);
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
function clickKey(w, key) {
  const btn = w.document.querySelector(`[data-key="${key}"]`);
  if (!btn) throw new Error('missing key button: ' + key);
  btn.click();
}
function clickKeys(w, keys) { keys.forEach((k) => clickKey(w, k)); }

console.log('SCIENTIFIC STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'scientific-calculator', 'index.html'), 'utf8');
  ok(html.includes('<p class="eyebrow">Calculators · No. 65</p>'), 'scientific: eyebrow is Calculators · No. 65');
  ok(html.includes('<h1 class="rise rise-1">Scientific Calculator</h1>'), 'scientific: H1 is the tool name');
  ok((html.match(/<h1/g) || []).length === 1, 'scientific: exactly one H1');
  ok(html.includes('<title>Scientific Calculator — Free Online Scientific Calculator — ToolsDaily</title>'), 'scientific: title is correct');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/scientific-calculator/">'), 'scientific: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'scientific: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'scientific: twitter card present');
  ok(html.includes('<link rel="stylesheet" href="../assets/design.css">'), 'scientific: design.css stylesheet linked');
  ok(html.includes('<script src="../assets/site.js"></script>'), 'scientific: site.js loaded at end');
  ok(html.includes('<a class="skip" href="#tool">Skip to tool</a>'), 'scientific: skip link present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'scientific: no external resource loads except the GA4 tag');
  ok(html.includes('G-KX85CZXTR4'), 'scientific: GA4 tag present');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'scientific: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'Scientific Calculator' && app.url === 'https://toolsdaily.vercel.app/scientific-calculator/' && app.offers.price === '0', 'scientific: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(visible.length === 3 && JSON.stringify(visible) === JSON.stringify(schema), `scientific: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  const nav = html.match(/<nav class="more">[\s\S]*?<\/nav>/)[0];
  const related = ['percentage-calculator', 'fraction-calculator', 'bmi-calculator', 'age-calculator', 'unit-converter'];
  ok((nav.match(/<li>/g) || []).length === related.length, 'scientific: More-tools nav has exactly 5 links');
  ok(related.every((s) => nav.includes(`href="../${s}/"`)), 'scientific: More-tools nav links the 5 related tools');
  // Note: href-prefixed matching — 'age-calculator' is a substring of 'percentage-calculator'.
  ok(related.every((s, i, a) => i === 0 || nav.indexOf(`href="../${a[i - 1]}/"`) < nav.indexOf(`href="../${s}/"`)), 'scientific: More-tools nav links are in the required order');
  ok(nav.includes('>Percentage Calculator<') && nav.includes('>Fraction Calculator<') && nav.includes('>BMI Calculator<') && nav.includes('>Age Calculator<') && nav.includes('>Unit Converter<'), 'scientific: More-tools nav uses the tools’ display names');
  ok(html.includes('<p>68 tools · New tools added regularly.</p>'), 'scientific: footer says 68 tools');
  ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(html), 'scientific: no emoji anywhere on the page');
  for (const id of ['display', 'history', 'equals', 'clear', 'backspace', 'copy', 'msg', 'clear-history']) {
    ok(html.includes(`id="${id}"`), `scientific: element #${id} present`);
  }
  ok(!html.includes('id="download"') && !html.includes('id="dl"'), 'scientific: NO #download / #dl present');
  ok(!html.includes('eval('), 'scientific: no eval( in page source');
  ok(!html.includes('new Function('), 'scientific: no new Function( in page source');
  const requiredKeys = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '+', '-', '*', '/', '(', ')', '.', '^', 'sqrt', 'sin', 'cos', 'tan', 'log', 'ln', 'pi', 'e', '!', '%', 'Ans'];
  ok(requiredKeys.every((k) => html.includes(`data-key="${k}"`)), 'scientific: keypad has all required data-key buttons');
}

console.log('SCIENTIFIC CORE');
{
  const { dom, jsErrors } = await loadPage('scientific-calculator/');
  const w = dom.window, TD = w.TD_scientific;
  ok(jsErrors === 0, `scientific: zero JS errors on load (${jsErrors})`);
  ok(TD && typeof TD.evaluate === 'function' && typeof TD.factorial === 'function' && typeof TD.toRadians === 'function', 'TD_scientific exposed with evaluate, factorial, toRadians');
  const cases = [
    ['2+3*4', 14], ['(2+3)*4', 20], ['2^3', 8], ['2^10', 1024], ['2^3^2', 512],
    ['sqrt(16)', 4], ['sqrt(2)', Math.SQRT2], ['sin(30)', 0.5], ['cos(60)', 0.5],
    ['tan(45)', 1], ['sin(90)', 1], ['cos(0)', 1], ['log(100)', 2], ['log(1000)', 3],
    ['ln(e)', 1], ['ln(1)', 0], ['pi', Math.PI], ['e', Math.E], ['5!', 120], ['0!', 1],
    ['3!+2', 8], ['10%', 0.1], ['50%*200', 100], ['-5+3', -2], ['-(2+3)', -5],
    ['2*-3', -6], ['10-4-3', 3], ['100/4/5', 5], ['3.5+1.5', 5], ['1/3', 1 / 3],
    ['2pi', 2 * Math.PI], ['2(3+1)', 8], ['(2)(3)', 6], ['sqrt(16)+1', 5],
    ['2sin(30)', 1], ['Ans+1', 6, 5],
  ];
  cases.forEach(([expr, expected, ans]) => {
    const r = TD.evaluate(expr, ans);
    ok(!r.error && approx(r.value, expected), `evaluate ${expr} = ${expected} (got ${r.error || r.value})`);
  });
  // Helpers.
  ok(TD.factorial(5).value === 120, 'factorial(5) = 120');
  ok(!!TD.factorial(-1).error && !!TD.factorial(2.5).error, 'factorial rejects negative and non-integer');
  ok(approx(TD.toRadians(180), Math.PI), 'toRadians(180) = pi');
  // Errors.
  const errCases = ['', '   ', '1/0', '0/0', '(2+3', '2+3)', '2++', 'foo(2)', '2$3', '5.5!', '(-1)!', 'sqrt(-1)', 'log(0)', 'log(-5)', 'ln(0)', 'Ans', 'tan(90)', '2..3', 'sqrt()', 'sin(30', '10/0+1'];
  errCases.forEach((expr) => {
    const r = TD.evaluate(expr);
    ok(!!r.error, `evaluate ${JSON.stringify(expr)} errors (got ${r.error || r.value})`);
  });
  dom.window.close();
}

console.log('SCIENTIFIC UI');
{
  const { dom } = await loadPage('scientific-calculator/');
  const w = dom.window;
  const display = () => w.document.querySelector('#display');
  const history = () => w.document.querySelector('#history');
  ok(display().value === '', 'UI starts with an empty display');
  ok(history().children.length === 0, 'UI starts with an empty history');
  // Keypad click builds the expression 2+3.
  clickKeys(w, ['2', '+', '3']);
  ok(display().value === '2+3', 'UI keypad clicks build 2+3 in the display');
  // = computes and shows the result + a history entry.
  w.document.querySelector('#equals').click();
  ok(display().value === '5', 'UI = computes 2+3 = 5 in the display');
  ok(history().children.length === 1 && history().children[0].textContent === '2+3 = 5', 'UI = adds history entry "2+3 = 5"');
  ok(w.document.querySelector('#msg').textContent === 'Result: 5', 'UI = shows "Result: 5" message');
  // Copy with a stubbed clipboard.
  let copied = null;
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (t) => { copied = t; } }, configurable: true });
  w.document.querySelector('#copy').click();
  await sleep(80);
  ok(copied === '5' && w.document.querySelector('#msg').textContent === 'Copied to clipboard.' && w.document.querySelector('#msg').className === 'msg ok', 'UI copy writes result 5 to the clipboard and shows a visible success message');
  // Ans reuses the last answer: Ans+1 = 6.
  w.document.querySelector('#clear').click();
  ok(display().value === '', 'UI Clear empties the display');
  clickKeys(w, ['Ans', '+', '1']);
  ok(display().value === 'Ans+1', 'UI keypad builds Ans+1 in the display');
  w.document.querySelector('#equals').click();
  ok(display().value === '6', 'UI Ans+1 = 6 (Ans was 5)');
  ok(history().children.length === 2 && history().children[0].textContent === 'Ans+1 = 6', 'UI Ans calculation is added to history');
  // Trig via keypad: sin(30) = 0.5.
  w.document.querySelector('#clear').click();
  clickKeys(w, ['sin', '3', '0', ')']);
  ok(display().value === 'sin(30)', 'UI sin key inserts sin( and keypad builds sin(30)');
  w.document.querySelector('#equals').click();
  ok(display().value === '0.5', 'UI sin(30) = 0.5 via keypad');
  // Backspace removes the last character.
  w.document.querySelector('#clear').click();
  clickKeys(w, ['1', '2', '3']);
  w.document.querySelector('#backspace').click();
  ok(display().value === '12', 'UI Backspace turns 123 into 12');
  // Division by zero shows an error and keeps the expression.
  w.document.querySelector('#clear').click();
  clickKeys(w, ['1', '/', '0']);
  w.document.querySelector('#equals').click();
  ok(w.document.querySelector('#msg').textContent.length > 0 && display().value === '1/0', 'UI 1/0 shows an error and keeps the expression');
  // Clear history empties the history list.
  ok(history().children.length === 3, 'UI history holds 3 entries before clearing');
  w.document.querySelector('#clear-history').click();
  ok(history().children.length === 0, 'UI Clear history empties the history list');
  dom.window.close();
}

console.log(`\nLOGIC-SCIENTIFIC TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
