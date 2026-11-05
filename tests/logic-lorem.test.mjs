// Logic + UI tests for the Lorem Ipsum Generator (2026-11-05 daily tool).
// Drives the real page code through jsdom; core functions are window.TD_lorem.
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
const countSentences = (t) => (t.match(/\./g) || []).length;

console.log('LOREM STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'lorem-ipsum-generator', 'index.html'), 'utf8');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/lorem-ipsum-generator/">'), 'lorem: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'lorem: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'lorem: twitter card present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'lorem: no external resource loads except the GA4 tag');
  ok(html.includes('G-KX85CZXTR4'), 'lorem: GA4 tag present');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'lorem: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'Lorem Ipsum Generator' && app.url === 'https://toolsdaily.vercel.app/lorem-ipsum-generator/' && app.offers.price === '0', 'lorem: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(JSON.stringify(visible) === JSON.stringify(schema), `lorem: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  const others = ['qr-generator', 'image-compressor', 'image-converter', 'word-counter', 'password-generator', 'age-calculator', 'unit-converter', 'color-converter', 'text-case-converter', 'json-formatter', 'pdf-merge', 'pdf-split', 'image-to-pdf', 'bmi-calculator', 'emi-calculator', 'percentage-calculator', 'image-resizer', 'base64-encoder-decoder', 'date-difference-calculator', 'qr-reader', 'background-remover'];
  ok(others.every((s) => html.includes(`href="../${s}/"`)), 'lorem: More-tools nav links all other 21 tools');
  const sitemap = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
  ok((sitemap.match(/<loc>/g) || []).length === 23, 'sitemap.xml has 23 URLs');
  ok(sitemap.includes('https://toolsdaily.vercel.app/lorem-ipsum-generator/'), 'sitemap includes lorem-ipsum-generator');
  const home = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  ok((home.match(/class="tool-card"/g) || []).length === 22, 'home has exactly 22 tool cards');
  ok(home.includes('href="lorem-ipsum-generator/"'), 'home cards + nav include lorem-ipsum-generator');
}

console.log('LOREM CORE');
{
  const dom = await loadPage('lorem-ipsum-generator/');
  const w = dom.window, TD = w.TD_lorem;
  ok(TD && typeof TD.generate === 'function' && typeof TD.countWords === 'function', 'TD_lorem exposed');
  // Determinism: same seed -> identical text; different seed -> different text.
  const a = TD.generate({ type: 'paragraphs', count: 3, classic: true, seed: 42 });
  const b = TD.generate({ type: 'paragraphs', count: 3, classic: true, seed: 42 });
  const c = TD.generate({ type: 'paragraphs', count: 3, classic: true, seed: 43 });
  ok(a.text === b.text, 'same seed reproduces identical text');
  ok(a.text !== c.text, 'different seed gives different text');
  // Paragraphs structure.
  ok(a.text.split('\n\n').length === 3, '3 paragraphs requested -> 3 paragraphs');
  ok(a.text.startsWith(TD.CLASSIC_FIRST), 'classic start: first sentence is the classic opening');
  ok(a.text.split('\n\n').every((p) => { const n = countSentences(p); return n >= 4 && n <= 7; }), 'every paragraph has 4-7 sentences');
  ok(a.words === TD.countWords(a.text) && a.chars === a.text.length, 'paragraph result reports its own word/char counts');
  const noClassic = TD.generate({ type: 'paragraphs', count: 2, classic: false, seed: 7 });
  ok(!noClassic.text.startsWith(TD.CLASSIC_FIRST), 'classic off: no classic opening');
  ok(noClassic.text.split('\n\n').length === 2, '2 paragraphs without classic');
  // Sentences.
  const s = TD.generate({ type: 'sentences', count: 5, classic: true, seed: 11 });
  ok(countSentences(s.text) === 5, '5 sentences requested -> 5 sentence-ending periods');
  ok(s.text.startsWith(TD.CLASSIC_FIRST), 'sentences mode with classic starts with the classic sentence');
  const s1 = TD.generate({ type: 'sentences', count: 1, classic: true, seed: 99 });
  ok(s1.text === TD.CLASSIC_FIRST, '1 sentence with classic is exactly the classic sentence');
  // Words.
  const wd = TD.generate({ type: 'words', count: 25, classic: true, seed: 5 });
  ok(wd.text.split(/\s+/).length === 25, '25 words requested -> exactly 25 words');
  ok(wd.text.startsWith('Lorem ipsum dolor sit amet'), 'words mode with classic starts with the classic words');
  ok(wd.text.endsWith('.'), 'words mode ends with a period');
  const wd10 = TD.generate({ type: 'words', count: 10, classic: true, seed: 5 });
  ok(wd10.text.split(/\s+/).length === 10 && wd10.text.startsWith('Lorem ipsum dolor sit amet'), 'classic words mode clamps the classic opening to the requested count');
  const wdNo = TD.generate({ type: 'words', count: 30, classic: false, seed: 5 });
  ok(wdNo.text.split(/\s+/).length === 30 && !wdNo.text.startsWith('Lorem'), 'words mode without classic is fully random');
  // Every generated word comes from the pool (ignoring case and trailing ,/.).
  const pool = new Set(TD.WORDS);
  const clean = (t) => t.replace(/[.,]/g, '').split(/\s+/).map((x) => x.toLowerCase());
  ok(clean(a.text).every((x) => pool.has(x)), 'all paragraph words come from the lorem pool');
  ok(clean(wd.text).every((x) => pool.has(x)), 'all words-mode words come from the lorem pool');
  // Limits and errors.
  ok(!!TD.generate({ type: 'paragraphs', count: 0 }).error, '0 paragraphs errors');
  ok(!!TD.generate({ type: 'paragraphs', count: 51 }).error, '51 paragraphs errors (limit 50)');
  ok(!!TD.generate({ type: 'sentences', count: 101 }).error, '101 sentences errors (limit 100)');
  ok(!!TD.generate({ type: 'words', count: 1001 }).error, '1001 words errors (limit 1000)');
  ok(!!TD.generate({ type: 'paragraphs', count: null }).error, 'missing count errors');
  ok(!!TD.generate({ type: 'lines', count: 3 }).error, 'unknown type errors');
  ok(TD.countWords('  one   two\nthree ') === 3, 'countWords handles extra whitespace');
  dom.window.close();
}

console.log('LOREM UI');
{
  const dom = await loadPage('lorem-ipsum-generator/');
  const w = dom.window, TD = w.TD_lorem;
  // Auto-generated on load: 3 paragraphs, classic start.
  const out = w.document.querySelector('#output');
  ok(out.value.split('\n\n').length === 3, 'UI auto-generates 3 paragraphs on load');
  ok(out.value.startsWith(TD.CLASSIC_FIRST), 'UI default output starts with the classic sentence');
  ok(w.document.querySelector('#st-words').textContent === TD.countWords(out.value).toLocaleString('en-US'), 'UI word stat matches the output');
  // Words mode via the controls.
  setVal(w, '#gen-type', 'words');
  setVal(w, '#gen-count', '25');
  w.document.querySelector('#generate').click();
  ok(out.value.split(/\s+/).length === 25, 'UI words mode: 25 words generated');
  ok(out.value.startsWith('Lorem ipsum dolor sit amet'), 'UI words mode keeps the classic opening');
  // Sentences mode, classic off.
  setVal(w, '#gen-type', 'sentences');
  setVal(w, '#gen-count', '4');
  w.document.querySelector('#classic-start').checked = false;
  w.document.querySelector('#generate').click();
  ok(countSentences(out.value) === 4, 'UI sentences mode: 4 sentences generated');
  ok(!out.value.startsWith(TD.CLASSIC_FIRST), 'UI classic off: output does not start with the classic sentence');
  // Invalid count shows an error and clears the output.
  setVal(w, '#gen-count', '0');
  w.document.querySelector('#generate').click();
  ok(w.document.querySelector('#msg').textContent.length > 0 && out.value === '', 'UI 0 count shows an error and clears the output');
  // Copy with a stubbed clipboard.
  setVal(w, '#gen-type', 'paragraphs');
  setVal(w, '#gen-count', '1');
  w.document.querySelector('#classic-start').checked = true;
  w.document.querySelector('#generate').click();
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
  ok(dl.getAttribute('href') === 'blob:fake' && dl.getAttribute('download') === 'lorem-ipsum.txt', 'UI download link points at blob with lorem-ipsum.txt name');
  ok(w.document.querySelector('#msg').textContent === 'Downloaded lorem-ipsum.txt.' && w.document.querySelector('#msg').className === 'msg ok', 'UI download shows a visible success message');
  // Home search finds the new tool.
  const homeDom = await loadPage('');
  const hw = homeDom.window;
  setVal(hw, '#tool-search', 'lorem');
  const visible = [...hw.document.querySelectorAll('.tool-card')].filter((x) => !x.classList.contains('hidden'));
  ok(visible.length === 1 && visible[0].getAttribute('href') === 'lorem-ipsum-generator/', 'home search "lorem" finds the new tool');
  homeDom.window.close();
  dom.window.close();
}

console.log(`\nLOGIC-LOREM TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
