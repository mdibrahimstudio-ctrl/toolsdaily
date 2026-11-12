// Logic + UI tests for the Remove Duplicate Lines tool (2026-11-09 daily tool).
// Drives the real page code through jsdom; core function is window.TD_dedup.dedupeLines.
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

console.log('DEDUP STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'remove-duplicate-lines', 'index.html'), 'utf8');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/remove-duplicate-lines/">'), 'dedup: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'dedup: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'dedup: twitter card present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'dedup: no external resource loads except the GA4 tag');
  ok(html.includes('G-KX85CZXTR4'), 'dedup: GA4 tag present');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'dedup: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'Remove Duplicate Lines' && app.url === 'https://toolsdaily.vercel.app/remove-duplicate-lines/' && app.offers.price === '0', 'dedup: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(JSON.stringify(visible) === JSON.stringify(schema), `dedup: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  const others = ['qr-generator', 'image-compressor', 'image-converter', 'word-counter', 'password-generator', 'age-calculator', 'unit-converter', 'color-converter', 'text-case-converter', 'json-formatter', 'pdf-merge', 'pdf-split', 'image-to-pdf', 'bmi-calculator', 'emi-calculator', 'percentage-calculator', 'image-resizer', 'base64-encoder-decoder', 'date-difference-calculator', 'qr-reader', 'background-remover', 'lorem-ipsum-generator', 'random-number-generator', 'tip-calculator', 'url-encoder-decoder', 'image-synthid-remover'];
  ok(others.length === 26 && others.every((s) => html.includes(`href="../${s}/"`)), 'dedup: More-tools nav links all other 26 tools');
  const sitemap = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
  ok((sitemap.match(/<loc>/g) || []).length === 32, 'sitemap.xml has 32 URLs');
  ok(sitemap.includes('https://toolsdaily.vercel.app/remove-duplicate-lines/'), 'sitemap includes remove-duplicate-lines');
  const home = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  ok((home.match(/class="tool-card"/g) || []).length === 31, 'home has exactly 31 tool cards');
  ok(home.includes('href="remove-duplicate-lines/"'), 'home cards + nav include remove-duplicate-lines');
  ok(home.includes('Thirty-one handy tools'), 'home lead says Thirty-one tools');
}

console.log('DEDUP CORE');
{
  const dom = await loadPage('remove-duplicate-lines/');
  const w = dom.window, TD = w.TD_dedup;
  ok(TD && typeof TD.dedupeLines === 'function', 'TD_dedup exposed');
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // Basic dedupe keeps first occurrence order.
  let r = TD.dedupeLines('apple\nbanana\napple');
  ok(eq(r.lines, ['apple', 'banana']) && r.inputCount === 3 && r.outputCount === 2 && r.removed === 1 && r.emptyRemoved === 0, 'core: apple/banana/apple -> apple, banana (removed 1)');
  r = TD.dedupeLines('c\nb\na\nb\nc');
  ok(eq(r.lines, ['c', 'b', 'a']) && r.removed === 2, 'core: order is first-occurrence order, 2 removed');
  r = TD.dedupeLines('only');
  ok(eq(r.lines, ['only']) && r.removed === 0 && r.inputCount === 1, 'core: single line passes through');
  r = TD.dedupeLines('x\nx\nx\nx');
  ok(eq(r.lines, ['x']) && r.removed === 3, 'core: all-duplicates input leaves one line, 3 removed');
  // Case sensitivity.
  r = TD.dedupeLines('Apple\napple\nAPPLE');
  ok(eq(r.lines, ['Apple', 'apple', 'APPLE']) && r.removed === 0, 'core: case-sensitive by default — Apple/apple/APPLE all kept');
  r = TD.dedupeLines('Apple\napple\nAPPLE\nbanana', { insensitive: true });
  ok(eq(r.lines, ['Apple', 'banana']) && r.removed === 2, 'core: insensitive — Apple/apple/APPLE collapse, first casing kept');
  r = TD.dedupeLines(' Apple \napple\nAPPLE ', { insensitive: true });
  ok(eq(r.lines, ['Apple']) && r.removed === 2, 'core: insensitive + trim — " Apple " / apple / "APPLE " collapse to Apple');
  // Trimming.
  r = TD.dedupeLines('  apple  \napple\n apple');
  ok(eq(r.lines, ['apple']) && r.removed === 2, 'core: trim on — padded copies are duplicates');
  r = TD.dedupeLines('  apple  \napple', { trim: false });
  ok(eq(r.lines, ['  apple  ', 'apple']) && r.removed === 0, 'core: trim off — padded line is distinct and spacing is preserved');
  r = TD.dedupeLines('hello world\nhello world\nfoo bar');
  ok(eq(r.lines, ['hello world', 'foo bar']) && r.removed === 1, 'core: inner spaces are kept, only edges are trimmed');
  // Empty lines.
  r = TD.dedupeLines('a\n\nb\n\n\na');
  ok(eq(r.lines, ['a', 'b']) && r.removed === 1 && r.emptyRemoved === 3 && r.inputCount === 6, 'core: empty lines removed by default (3) plus 1 duplicate');
  r = TD.dedupeLines('a\n\nb\n\n', { removeEmpty: false });
  ok(eq(r.lines, ['a', '', 'b']) && r.removed === 2 && r.emptyRemoved === 0 && r.inputCount === 5, 'core: removeEmpty off — first empty kept, later empties count as duplicates');
  r = TD.dedupeLines('a\n   \nb');
  ok(eq(r.lines, ['a', 'b']) && r.emptyRemoved === 1, 'core: whitespace-only line is empty after trim');
  r = TD.dedupeLines('a\n   \nb', { trim: false });
  ok(eq(r.lines, ['a', '   ', 'b']) && r.emptyRemoved === 0, 'core: whitespace-only line is NOT empty with trim off');
  // Line endings.
  r = TD.dedupeLines('a\r\nb\r\na');
  ok(eq(r.lines, ['a', 'b']) && r.removed === 1 && r.inputCount === 3, 'core: CRLF input splits correctly');
  r = TD.dedupeLines('a\rb\ra');
  ok(eq(r.lines, ['a', 'b']) && r.removed === 1, 'core: CR-only input splits correctly');
  r = TD.dedupeLines('a\nb\n');
  ok(eq(r.lines, ['a', 'b']) && r.emptyRemoved === 1 && r.inputCount === 3, 'core: trailing newline makes one trailing empty line, removed');
  // Empty input.
  r = TD.dedupeLines('');
  ok(eq(r.lines, []) && r.inputCount === 0 && r.outputCount === 0 && r.removed === 0 && r.emptyRemoved === 0, 'core: empty input -> empty result, 0 counts');
  // Unicode.
  r = TD.dedupeLines('café\n☕\ncafé');
  ok(eq(r.lines, ['café', '☕']) && r.removed === 1, 'core: Unicode lines dedupe (café, ☕)');
  // Sorting.
  r = TD.dedupeLines('banana\nApple\ncherry', { sort: true });
  ok(eq(r.lines, ['Apple', 'banana', 'cherry']), 'core: sort A–Z is case-insensitive (Apple before banana)');
  r = TD.dedupeLines('banana\nBanana\napple', { sort: true });
  ok(eq(r.lines, ['apple', 'Banana', 'banana']), 'core: sort tie-break is deterministic (Banana before banana)');
  r = TD.dedupeLines('zebra\napple\nMango', { sort: true });
  ok(eq(r.lines, ['apple', 'Mango', 'zebra']), 'core: sort orders mixed case by lowercase value');
  r = TD.dedupeLines('b\na\nb\nc\na', { sort: true });
  ok(eq(r.lines, ['a', 'b', 'c']) && r.removed === 2, 'core: sort + dedupe together');
  // Idempotent: deduping the output changes nothing.
  const sample = 'apple\nBanana\ncherry\nbanana\napple\n\nmango\nCherry';
  const once = TD.dedupeLines(sample);
  const twice = TD.dedupeLines(once.lines.join('\n'));
  ok(eq(twice.lines, once.lines) && twice.removed === 0 && twice.emptyRemoved === 0, 'core: dedupe is idempotent on its own output');
  dom.window.close();
}

console.log('DEDUP UI');
{
  const dom = await loadPage('remove-duplicate-lines/');
  const w = dom.window;
  const DEFAULT_IN = 'apple\nBanana\ncherry\nbanana\napple\n\nmango\nCherry';
  const DEFAULT_OUT = 'apple\nBanana\ncherry\nbanana\nmango\nCherry';
  const INSENS_OUT = 'apple\nBanana\ncherry\nmango';
  const SORTED_OUT = 'apple\nBanana\nbanana\nCherry\ncherry\nmango';
  // Defaults on load: sample input, deduped on load.
  ok(w.document.querySelector('#text-in').value === DEFAULT_IN, 'UI defaults: sample input pre-filled');
  ok(!w.document.querySelector('#opt-insensitive').checked, 'UI defaults: case-insensitive off');
  ok(w.document.querySelector('#opt-trim').checked && w.document.querySelector('#opt-empty').checked, 'UI defaults: trim and remove-empty on');
  ok(!w.document.querySelector('#opt-sort').checked, 'UI defaults: sort off');
  ok(w.document.querySelector('#text-out').value === DEFAULT_OUT, 'UI defaults: sample deduped on load (6 lines)');
  ok(w.document.querySelector('#st-in').textContent === '8' && w.document.querySelector('#st-out').textContent === '6' && w.document.querySelector('#st-removed').textContent === '1' && w.document.querySelector('#st-empty').textContent === '1', 'UI defaults: stats 8 / 6 / 1 / 1');
  ok(w.document.querySelector('#text-msg').textContent === 'Removed 1 duplicate line and 1 empty line.' && w.document.querySelector('#text-msg').className === 'msg ok', 'UI defaults: visible success message with counts');
  // Toggling case-insensitive re-dedupes live.
  w.document.querySelector('#opt-insensitive').click();
  ok(w.document.querySelector('#text-out').value === INSENS_OUT, 'UI insensitive toggle: banana + Cherry collapse (4 lines)');
  ok(w.document.querySelector('#st-out').textContent === '4' && w.document.querySelector('#st-removed').textContent === '3', 'UI insensitive toggle: stats 4 out / 3 removed');
  ok(w.document.querySelector('#text-msg').textContent === 'Removed 3 duplicate lines and 1 empty line.', 'UI insensitive toggle: message counts update');
  w.document.querySelector('#opt-insensitive').click();
  ok(w.document.querySelector('#text-out').value === DEFAULT_OUT, 'UI insensitive toggle off: back to 6-line output');
  // Toggling sort re-dedupes live.
  w.document.querySelector('#opt-sort').click();
  ok(w.document.querySelector('#text-out').value === SORTED_OUT, 'UI sort toggle: lines sorted A–Z');
  w.document.querySelector('#opt-sort').click();
  ok(w.document.querySelector('#text-out').value === DEFAULT_OUT, 'UI sort toggle off: back to first-occurrence order');
  // Dedupe a fresh value.
  setVal(w, '#text-in', 'one\ntwo\none\nthree\ntwo');
  w.document.querySelector('#btn-dedupe').click();
  ok(w.document.querySelector('#text-out').value === 'one\ntwo\nthree', 'UI dedupe: one/two/one/three/two -> one/two/three');
  ok(w.document.querySelector('#st-in').textContent === '5' && w.document.querySelector('#st-out').textContent === '3' && w.document.querySelector('#st-removed').textContent === '2' && w.document.querySelector('#st-empty').textContent === '0', 'UI dedupe: stats 5 / 3 / 2 / 0');
  // Empty input errors and clears the output and stats.
  setVal(w, '#text-in', '');
  w.document.querySelector('#btn-dedupe').click();
  ok(w.document.querySelector('#text-out').value === '' && w.document.querySelector('#text-msg').textContent.length > 0 && w.document.querySelector('#text-msg').className === 'msg err', 'UI empty input: error shown and output cleared');
  ok(w.document.querySelector('#st-in').textContent === '–' && w.document.querySelector('#st-out').textContent === '–' && w.document.querySelector('#st-removed').textContent === '–' && w.document.querySelector('#st-empty').textContent === '–', 'UI empty input: stats reset to dashes');
  // Back to a valid value for copy/download.
  setVal(w, '#text-in', 'one\ntwo\none');
  w.document.querySelector('#btn-dedupe').click();
  ok(w.document.querySelector('#text-out').value === 'one\ntwo', 'UI valid value after error: one/two');
  // Copy with a stubbed clipboard.
  let copied = null;
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (t) => { copied = t; } }, configurable: true });
  w.document.querySelector('#copy-out').click();
  await sleep(80);
  ok(copied === 'one\ntwo' && w.document.querySelector('#text-msg').textContent === 'Copied to clipboard.' && w.document.querySelector('#text-msg').className === 'msg ok', 'UI copy writes the result to the clipboard and shows a visible success message');
  // A clipboard promise that never settles must still give feedback within ~1.5s.
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: () => new Promise(() => {}) }, configurable: true });
  w.document.querySelector('#text-msg').textContent = '';
  w.document.querySelector('#copy-out').click();
  await sleep(1800);
  ok(w.document.querySelector('#text-msg').textContent === 'Could not copy automatically — select the text and copy it manually.' && w.document.querySelector('#text-msg').className === 'msg err', 'UI copy with a hung clipboard promise falls back to a visible message instead of staying silent');
  // Download with a stubbed createObjectURL.
  w.URL.createObjectURL = () => 'blob:fake';
  w.document.querySelector('#download').click();
  const dl = w.document.querySelector('#dl');
  ok(dl.getAttribute('href') === 'blob:fake' && dl.getAttribute('download') === 'deduped-lines.txt', 'UI download link points at blob with deduped-lines.txt name');
  ok(w.document.querySelector('#text-msg').textContent === 'Downloaded deduped-lines.txt.' && w.document.querySelector('#text-msg').className === 'msg ok', 'UI download shows a visible success message');
  // Home search finds the new tool.
  const homeDom = await loadPage('');
  const hw = homeDom.window;
  setVal(hw, '#tool-search', 'duplicate');
  let visible = [...hw.document.querySelectorAll('.tool-card')].filter((x) => !x.classList.contains('hidden'));
  ok(visible.length === 1 && visible[0].getAttribute('href') === 'remove-duplicate-lines/', 'home search "duplicate" finds the new tool');
  setVal(hw, '#tool-search', 'dedupe');
  visible = [...hw.document.querySelectorAll('.tool-card')].filter((x) => !x.classList.contains('hidden'));
  ok(visible.length === 1 && visible[0].getAttribute('href') === 'remove-duplicate-lines/', 'home search "dedupe" finds the new tool');
  homeDom.window.close();
  dom.window.close();
}

console.log(`\nLOGIC-DEDUP TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
