// Logic + UI tests for the URL Encoder / Decoder (2026-11-08 daily tool).
// Drives the real page code through jsdom; core functions are window.TD_url.
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

console.log('URL STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'url-encoder-decoder', 'index.html'), 'utf8');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/url-encoder-decoder/">'), 'url: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'url: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'url: twitter card present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'url: no external resource loads except the GA4 tag');
  ok(html.includes('G-KX85CZXTR4'), 'url: GA4 tag present');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'url: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'URL Encoder / Decoder' && app.url === 'https://toolsdaily.vercel.app/url-encoder-decoder/' && app.offers.price === '0', 'url: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(JSON.stringify(visible) === JSON.stringify(schema), `url: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  const others = ['qr-generator', 'image-compressor', 'image-converter', 'word-counter', 'password-generator', 'age-calculator', 'unit-converter', 'color-converter', 'text-case-converter', 'json-formatter', 'pdf-merge', 'pdf-split', 'image-to-pdf', 'bmi-calculator', 'emi-calculator', 'percentage-calculator', 'image-resizer', 'base64-encoder-decoder', 'date-difference-calculator', 'qr-reader', 'background-remover', 'lorem-ipsum-generator', 'random-number-generator', 'tip-calculator'];
  ok(others.every((s) => html.includes(`href="../${s}/"`)), 'url: More-tools nav links all other 24 tools');
  const sitemap = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
  ok((sitemap.match(/<loc>/g) || []).length === 30, 'sitemap.xml has 30 URLs');
  ok(sitemap.includes('https://toolsdaily.vercel.app/url-encoder-decoder/'), 'sitemap includes url-encoder-decoder');
  const home = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  ok((home.match(/class="tool-card"/g) || []).length === 29, 'home has exactly 29 tool cards');
  ok(home.includes('href="url-encoder-decoder/"'), 'home cards + nav include url-encoder-decoder');
  ok(home.includes('Twenty-nine handy tools'), 'home lead says Twenty-nine tools');
}

console.log('URL CORE');
{
  const dom = await loadPage('url-encoder-decoder/');
  const w = dom.window, TD = w.TD_url;
  ok(TD && typeof TD.encodeComponent === 'function' && typeof TD.encodeFull === 'function' && typeof TD.decode === 'function', 'TD_url exposed');
  // Component encoding: everything unsafe goes, including / ? & = #.
  ok(TD.encodeComponent('Hello World!') === 'Hello%20World!', 'component: "Hello World!" -> "Hello%20World!"');
  ok(TD.encodeComponent('https://example.com/a b?x=1&y=2') === 'https%3A%2F%2Fexample.com%2Fa%20b%3Fx%3D1%26y%3D2', 'component: full URL gets : / ? & = encoded');
  ok(TD.encodeComponent('/?&=#') === '%2F%3F%26%3D%23', 'component: reserved chars / ? & = # all encoded');
  ok(TD.encodeComponent('café ☕') === 'caf%C3%A9%20%E2%98%95', 'component: Unicode é + ☕ encoded as UTF-8 %XX');
  ok(TD.encodeComponent('') === '', 'component: empty string stays empty');
  ok(TD.encodeComponent("a+b=c@d'e~f") === "a%2Bb%3Dc%40d'e~f", "component: + = @ encoded, ' and ~ left alone");
  // Full-URL encoding: structure characters survive, unsafe parts encoded.
  ok(TD.encodeFull('https://example.com/a b?x=1&y=2') === 'https://example.com/a%20b?x=1&y=2', 'full: structure kept, space encoded');
  ok(TD.encodeFull('Hello World!') === 'Hello%20World!', 'full: plain text behaves like component');
  ok(TD.encodeFull('https://example.com/café') === 'https://example.com/caf%C3%A9', 'full: non-ASCII path encoded, slashes kept');
  ok(TD.encodeFull('') === '', 'full: empty string stays empty');
  // Decoding.
  let r = TD.decode('Hello%20World!', false);
  ok(!r.error && r.result === 'Hello World!', 'decode: Hello%20World! -> Hello World!');
  r = TD.decode('https%3A%2F%2Fexample.com%2Fa%20b%3Fx%3D1%26y%3D2', false);
  ok(!r.error && r.result === 'https://example.com/a b?x=1&y=2', 'decode: fully-encoded URL round-trips back');
  r = TD.decode('caf%C3%A9%20%E2%98%95', false);
  ok(!r.error && r.result === 'café ☕', 'decode: UTF-8 %XX sequences decode to café ☕');
  r = TD.decode('', false);
  ok(!r.error && r.result === '', 'decode: empty string stays empty');
  // Round trips both ways.
  const samples = ['Hello World!', 'https://example.com/a b?x=1&y=2', 'café ☕', 'a+b=c&d=e', '100% sure!', 'ünïcödé & symbols <>'];
  ok(samples.every((s) => TD.decode(TD.encodeComponent(s), false).result === s), 'round-trip: decode(encodeComponent(x)) === x for 6 samples');
  ok(samples.every((s) => TD.decode(TD.encodeFull(s), false).result === s), 'round-trip: decode(encodeFull(x)) === x for 6 samples');
  // Plus handling.
  r = TD.decode('a+b', false);
  ok(!r.error && r.result === 'a+b', 'decode: + stays a literal + without the checkbox');
  r = TD.decode('a+b', true);
  ok(!r.error && r.result === 'a b', 'decode: + becomes a space with the checkbox');
  r = TD.decode('a+b+c%20d', true);
  ok(!r.error && r.result === 'a b c d', 'decode: + and %20 both become spaces with the checkbox');
  // Invalid encodings error instead of throwing.
  ok(!!TD.decode('%E0%A4%A', false).error, 'decode: truncated UTF-8 %E0%A4%A errors');
  ok(!!TD.decode('%zz', false).error, 'decode: %zz (bad hex) errors');
  ok(!!TD.decode('100%', false).error, 'decode: lone trailing % errors');
  ok(!!TD.decode('%', false).error, 'decode: single % errors');
  ok(TD.decode('plain text', false).result === 'plain text', 'decode: text with no % sequences passes through');
  // Helpers.
  ok(TD.countEncoded('Hello%20World!') === 1 && TD.countEncoded('%2F%3F%26%3D%23') === 5 && TD.countEncoded('plain') === 0 && TD.countEncoded('%zz %20') === 1, 'countEncoded: 1 / 5 / 0 / 1 (only valid %XX count)');
  ok(TD.isValidEncoded('Hello%20World!') === true && TD.isValidEncoded('%E0%A4%A') === false && TD.isValidEncoded('plain text') === true && TD.isValidEncoded('%') === false, 'isValidEncoded: valid / truncated / plain / lone-% cases');
  dom.window.close();
}

console.log('URL UI');
{
  const dom = await loadPage('url-encoder-decoder/');
  const w = dom.window;
  const DEFAULT_IN = 'Hello World! https://example.com/café?q=tea & cake';
  const DEFAULT_COMP = 'Hello%20World!%20https%3A%2F%2Fexample.com%2Fcaf%C3%A9%3Fq%3Dtea%20%26%20cake';
  const DEFAULT_FULL = 'Hello%20World!%20https://example.com/caf%C3%A9?q=tea%20&%20cake';
  // Defaults on load: sample input, component mode, encoded on load.
  ok(w.document.querySelector('#text-in').value === DEFAULT_IN, 'UI defaults: sample input pre-filled');
  ok(w.document.querySelector('#mode-component').checked, 'UI defaults: component mode selected');
  ok(w.document.querySelector('#text-out').value === DEFAULT_COMP, 'UI defaults: sample encoded as component on load');
  ok(w.document.querySelector('#st-in').textContent === '50', 'UI defaults: input stat 50 chars');
  ok(w.document.querySelector('#st-out').textContent === '77', 'UI defaults: output stat 77 chars');
  ok(w.document.querySelector('#st-encoded').textContent === '13', 'UI defaults: 13 % sequences');
  // Switching to full-URL mode re-encodes.
  w.document.querySelector('#mode-full').click();
  ok(w.document.querySelector('#text-out').value === DEFAULT_FULL, 'UI mode switch: full URL keeps : / ? & =');
  ok(w.document.querySelector('#st-out').textContent === '63', 'UI mode switch: output stat 63 chars');
  ok(w.document.querySelector('#st-encoded').textContent === '6', 'UI mode switch: 6 % sequences');
  // Encode a fresh value in component mode.
  w.document.querySelector('#mode-component').click();
  setVal(w, '#text-in', 'café ☕');
  w.document.querySelector('#btn-encode').click();
  ok(w.document.querySelector('#text-out').value === 'caf%C3%A9%20%E2%98%95', 'UI encode: café ☕ -> caf%C3%A9%20%E2%98%95');
  ok(w.document.querySelector('#st-in').textContent === '6' && w.document.querySelector('#st-out').textContent === '21' && w.document.querySelector('#st-encoded').textContent === '6', 'UI encode: stats 6 / 21 / 6');
  ok(w.document.querySelector('#text-msg').textContent === 'Encoded.' && w.document.querySelector('#text-msg').className === 'msg ok', 'UI encode shows a visible success message');
  // Decode it back.
  setVal(w, '#text-in', 'caf%C3%A9%20%E2%98%95');
  w.document.querySelector('#btn-decode').click();
  ok(w.document.querySelector('#text-out').value === 'café ☕', 'UI decode: caf%C3%A9%20%E2%98%95 -> café ☕');
  ok(w.document.querySelector('#text-msg').textContent === 'Decoded.' && w.document.querySelector('#text-msg').className === 'msg ok', 'UI decode shows a visible success message');
  // Plus handling via the checkbox.
  setVal(w, '#text-in', 'a+b');
  w.document.querySelector('#btn-decode').click();
  ok(w.document.querySelector('#text-out').value === 'a+b', 'UI decode: + stays + with checkbox off');
  w.document.querySelector('#plus-space').click();
  w.document.querySelector('#btn-decode').click();
  ok(w.document.querySelector('#text-out').value === 'a b', 'UI decode: + becomes a space with checkbox on');
  w.document.querySelector('#plus-space').click();
  // Invalid decode shows an error and clears the output and stats.
  setVal(w, '#text-in', '%E0%A4%A');
  w.document.querySelector('#btn-decode').click();
  ok(w.document.querySelector('#text-out').value === '' && w.document.querySelector('#text-msg').textContent.length > 0 && w.document.querySelector('#text-msg').className === 'msg err', 'UI invalid decode: error shown and output cleared');
  ok(w.document.querySelector('#st-out').textContent === '–' && w.document.querySelector('#st-encoded').textContent === '–', 'UI invalid decode: stats reset to dashes');
  // Back to a valid value for copy/download.
  setVal(w, '#text-in', 'Hello World!');
  w.document.querySelector('#btn-encode').click();
  ok(w.document.querySelector('#text-out').value === 'Hello%20World!', 'UI valid value after error: Hello%20World!');
  // Copy with a stubbed clipboard.
  let copied = null;
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (t) => { copied = t; } }, configurable: true });
  w.document.querySelector('#copy-out').click();
  await sleep(80);
  ok(copied === 'Hello%20World!' && w.document.querySelector('#text-msg').textContent === 'Copied to clipboard.' && w.document.querySelector('#text-msg').className === 'msg ok', 'UI copy writes the result to the clipboard and shows a visible success message');
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
  ok(dl.getAttribute('href') === 'blob:fake' && dl.getAttribute('download') === 'url-result.txt', 'UI download link points at blob with url-result.txt name');
  ok(w.document.querySelector('#text-msg').textContent === 'Downloaded url-result.txt.' && w.document.querySelector('#text-msg').className === 'msg ok', 'UI download shows a visible success message');
  // Home search finds the new tool.
  const homeDom = await loadPage('');
  const hw = homeDom.window;
  setVal(hw, '#tool-search', 'url');
  const visible = [...hw.document.querySelectorAll('.tool-card')].filter((x) => !x.classList.contains('hidden'));
  ok(visible.length === 1 && visible[0].getAttribute('href') === 'url-encoder-decoder/', 'home search "url" finds the new tool');
  homeDom.window.close();
  dom.window.close();
}

console.log(`\nLOGIC-URL TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
