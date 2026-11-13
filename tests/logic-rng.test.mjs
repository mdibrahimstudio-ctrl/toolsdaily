// Logic + UI tests for the Random Number Generator (2026-11-06 daily tool).
// Drives the real page code through jsdom; core functions are window.TD_rng.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire('/tmp/tooltests/package.json');
const { JSDOM, VirtualConsole } = require('jsdom');

const BASE = process.env.TD_BASE || 'http://127.0.0.1:8791/';
const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const unescapeHtml = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

async function loadPage(p) {
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => {});
  const dom = await JSDOM.fromURL(BASE + p, {
    resources: 'usable', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
  });
  await new Promise((res) => {
    if (dom.window.document.readyState === 'complete') res();
    else dom.window.addEventListener('load', res);
    setTimeout(res, 5000);
  });
  await sleep(150);
  return dom;
}
function setVal(win, sel, value) {
  const el = win.document.querySelector(sel);
  el.value = value;
  el.dispatchEvent(new win.Event('input', { bubbles: true }));
  el.dispatchEvent(new win.Event('change', { bubbles: true }));
  return el;
}

console.log('RNG STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'random-number-generator', 'index.html'), 'utf8');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/random-number-generator/">'), 'rng: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'rng: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'rng: twitter card present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'rng: no external resource loads except the GA4 tag');
  ok(html.includes('G-KX85CZXTR4'), 'rng: GA4 tag present');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'rng: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'Random Number Generator' && app.url === 'https://toolsdaily.vercel.app/random-number-generator/' && app.offers.price === '0', 'rng: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(JSON.stringify(visible) === JSON.stringify(schema), `rng: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  const others = ['qr-generator', 'image-compressor', 'image-converter', 'word-counter', 'password-generator', 'age-calculator', 'unit-converter', 'color-converter', 'text-case-converter', 'json-formatter', 'pdf-merge', 'pdf-split', 'image-to-pdf', 'bmi-calculator', 'emi-calculator', 'percentage-calculator', 'image-resizer', 'base64-encoder-decoder', 'date-difference-calculator', 'qr-reader', 'background-remover', 'lorem-ipsum-generator'];
  ok(others.every((s) => html.includes(`href="../${s}/"`)), 'rng: More-tools nav links all other 22 tools');
  const sitemap = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
  ok((sitemap.match(/<loc>/g) || []).length === 33, 'sitemap.xml has 32 URLs');
  ok(sitemap.includes('https://toolsdaily.vercel.app/random-number-generator/'), 'sitemap includes random-number-generator');
  const home = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  ok((home.match(/class="tool-card"/g) || []).length === 32, 'home has exactly 32 tool cards');
  ok(home.includes('href="random-number-generator/"'), 'home cards + nav include random-number-generator');
  ok(home.includes('Thirty-two handy tools'), 'home lead says Thirty-two tools');
}

console.log('RNG CORE');
{
  const dom = await loadPage('random-number-generator/');
  const w = dom.window, TD = w.TD_rng;
  ok(TD && typeof TD.generate === 'function', 'TD_rng exposed');
  // Determinism: same seed -> identical numbers; different seed -> different numbers.
  const a = TD.generate({ min: 1, max: 100, count: 10, seed: 42 });
  const b = TD.generate({ min: 1, max: 100, count: 10, seed: 42 });
  const c = TD.generate({ min: 1, max: 100, count: 10, seed: 43 });
  ok(JSON.stringify(a.numbers) === JSON.stringify(b.numbers), 'same seed reproduces identical numbers');
  ok(JSON.stringify(a.numbers) !== JSON.stringify(c.numbers), 'different seed gives different numbers');
  ok(a.numbers.length === 10 && a.numbers.every((n) => n >= 1 && n <= 100), '10 numbers requested -> 10 numbers inside 1–100');
  ok(a.count === 10 && a.min === Math.min(...a.numbers) && a.max === Math.max(...a.numbers), 'result reports its own count/min/max');
  // Single-value range always returns that value.
  const one = TD.generate({ min: 7, max: 7, count: 5, seed: 3 });
  ok(one.numbers.every((n) => n === 7) && one.numbers.length === 5, 'min == max == 7 -> all numbers are 7');
  // Negative and large ranges.
  const neg = TD.generate({ min: -50, max: -1, count: 20, seed: 9 });
  ok(neg.numbers.length === 20 && neg.numbers.every((n) => n >= -50 && n <= -1), 'negative range -50..-1 respected');
  const big = TD.generate({ min: 1, max: 1000000, count: 50, seed: 21 });
  ok(big.numbers.length === 50 && big.numbers.every((n) => n >= 1 && n <= 1000000), 'large range 1..1000000 respected');
  // Unique: no duplicates, and sorted unique is ascending.
  const u = TD.generate({ min: 1, max: 10, count: 10, unique: true, seed: 5 });
  ok(new Set(u.numbers).size === 10 && u.numbers.every((n) => n >= 1 && n <= 10), 'unique 10 from 1–10 covers the whole range with no repeats');
  const us = TD.generate({ min: 1, max: 100, count: 20, unique: true, sort: true, seed: 8 });
  ok(new Set(us.numbers).size === 20 && us.numbers.every((n, i) => i === 0 || n > us.numbers[i - 1]), 'unique + sort: 20 distinct numbers in ascending order');
  // Sort without unique.
  const srt = TD.generate({ min: 1, max: 100, count: 25, sort: true, seed: 13 });
  ok(srt.numbers.length === 25 && srt.numbers.every((n, i) => i === 0 || n >= srt.numbers[i - 1]), 'sort: 25 numbers in ascending order');
  // Unseeded path (crypto/Math.random): correct shape, in range.
  const live = TD.generate({ min: 5, max: 15, count: 30 });
  ok(!live.error && live.numbers.length === 30 && live.numbers.every((n) => n >= 5 && n <= 15), 'unseeded generate: 30 numbers inside 5–15');
  const liveU = TD.generate({ min: 1, max: 100, count: 50, unique: true });
  ok(!liveU.error && new Set(liveU.numbers).size === 50, 'unseeded unique: 50 distinct numbers');
  // Errors.
  ok(!!TD.generate({ min: 10, max: 5, count: 1 }).error, 'min > max errors');
  ok(!!TD.generate({ min: 1, max: 5, count: 10, unique: true }).error, 'unique count larger than range errors');
  ok(!!TD.generate({ min: 1, max: 100, count: 0 }).error, '0 numbers errors');
  ok(!!TD.generate({ min: 1, max: 100, count: 1001 }).error, '1001 numbers errors (limit 1000)');
  ok(!!TD.generate({ min: 1, max: 100, count: null }).error, 'missing count errors');
  ok(!!TD.generate({ min: null, max: 100, count: 1 }).error, 'missing min errors');
  ok(!!TD.generate({ min: 1, max: null, count: 1 }).error, 'missing max errors');
  ok(!!TD.generate({ min: 1.5, max: 100, count: 1 }).error, 'non-integer min errors');
  ok(!!TD.generate({ min: 1, max: 100.5, count: 1 }).error, 'non-integer max errors');
  ok(!!TD.generate({ min: 1, max: 100, count: 2.5 }).error, 'non-integer count errors');
  dom.window.close();
}

console.log('RNG UI');
{
  const dom = await loadPage('random-number-generator/');
  const w = dom.window, TD = w.TD_rng;
  // Auto-generated on load: 1 number in 1–100.
  const out = w.document.querySelector('#output');
  const first = out.value.split('\n').filter(Boolean);
  ok(first.length === 1 && +first[0] >= 1 && +first[0] <= 100, 'UI auto-generates 1 number in 1–100 on load');
  ok(w.document.querySelector('#st-count').textContent === '1', 'UI count stat is 1 on load');
  // Custom range via the controls: 5 unique numbers from 1–10, sorted.
  setVal(w, '#rng-min', '1');
  setVal(w, '#rng-max', '10');
  setVal(w, '#rng-count', '5');
  w.document.querySelector('#rng-unique').checked = true;
  w.document.querySelector('#rng-sort').checked = true;
  w.document.querySelector('#generate').click();
  const nums = out.value.split('\n').filter(Boolean).map(Number);
  ok(nums.length === 5 && new Set(nums).size === 5 && nums.every((n) => n >= 1 && n <= 10), 'UI unique mode: 5 distinct numbers in 1–10');
  ok(nums.every((n, i) => i === 0 || n > nums[i - 1]), 'UI sort mode: numbers ascending');
  ok(w.document.querySelector('#st-count').textContent === '5', 'UI count stat is 5');
  ok(w.document.querySelector('#st-min').textContent === String(Math.min(...nums)), 'UI smallest stat matches');
  ok(w.document.querySelector('#st-max').textContent === String(Math.max(...nums)), 'UI largest stat matches');
  // Invalid range shows an error and clears the output.
  setVal(w, '#rng-min', '50');
  setVal(w, '#rng-max', '10');
  w.document.querySelector('#generate').click();
  ok(w.document.querySelector('#msg').textContent.length > 0 && out.value === '', 'UI min > max shows an error and clears the output');
  // Unique count larger than the range errors.
  setVal(w, '#rng-min', '1');
  setVal(w, '#rng-max', '5');
  setVal(w, '#rng-count', '10');
  w.document.querySelector('#generate').click();
  ok(w.document.querySelector('#msg').textContent.length > 0 && out.value === '', 'UI unique count over range shows an error and clears the output');
  // Back to a valid draw for copy/download.
  setVal(w, '#rng-count', '3');
  w.document.querySelector('#generate').click();
  ok(out.value.split('\n').filter(Boolean).length === 3, 'UI valid draw after errors: 3 numbers');
  // Copy with a stubbed clipboard.
  let copied = null;
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (t) => { copied = t; } }, configurable: true });
  w.document.querySelector('#copy').click();
  await sleep(80);
  ok(copied === out.value && w.document.querySelector('#msg').textContent === 'Copied to clipboard.' && w.document.querySelector('#msg').className === 'msg ok', 'UI copy writes the output to the clipboard and shows a visible success message');
  // A clipboard promise that never settles must still give feedback within ~1.5s.
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: () => new Promise(() => {}) }, configurable: true });
  w.document.querySelector('#msg').textContent = '';
  w.document.querySelector('#copy').click();
  await sleep(1800);
  ok(w.document.querySelector('#msg').textContent === 'Could not copy automatically — select the text and copy it manually.' && w.document.querySelector('#msg').className === 'msg err', 'UI copy with a hung clipboard promise falls back to a visible message instead of staying silent');
  // Download with a stubbed createObjectURL.
  w.URL.createObjectURL = () => 'blob:fake';
  w.document.querySelector('#download').click();
  const dl = w.document.querySelector('#dl');
  ok(dl.getAttribute('href') === 'blob:fake' && dl.getAttribute('download') === 'random-numbers.txt', 'UI download link points at blob with random-numbers.txt name');
  ok(w.document.querySelector('#msg').textContent === 'Downloaded random-numbers.txt.' && w.document.querySelector('#msg').className === 'msg ok', 'UI download shows a visible success message');
  // Home search finds the new tool.
  const homeDom = await loadPage('');
  const hw = homeDom.window;
  setVal(hw, '#tool-search', 'random number');
  const visible = [...hw.document.querySelectorAll('.tool-card')].filter((x) => !x.classList.contains('hidden'));
  ok(visible.length === 1 && visible[0].getAttribute('href') === 'random-number-generator/', 'home search "random number" finds the new tool');
  homeDom.window.close();
  dom.window.close();
}

console.log(`\nLOGIC-RNG TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
