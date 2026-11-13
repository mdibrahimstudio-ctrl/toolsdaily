// Logic + UI tests for the Base64 Encoder / Decoder (2026-11-02 daily tool).
// Drives the real page code through jsdom; core functions are window.TD_base64.
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
    beforeParse(window) {
      window.URL.createObjectURL = () => 'blob:mock-url';
      window.URL.revokeObjectURL = () => {};
    },
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
function setFiles(win, sel, files) {
  const el = win.document.querySelector(sel);
  Object.defineProperty(el, 'files', { value: files, configurable: true });
  el.dispatchEvent(new win.Event('change', { bubbles: true }));
}

console.log('BASE64 STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'base64-encoder-decoder', 'index.html'), 'utf8');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/base64-encoder-decoder/">'), 'base64: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'base64: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'base64: twitter card present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'base64: no external resource loads except the GA4 tag');
  ok(html.includes('G-KX85CZXTR4'), 'base64: GA4 tag present');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'base64: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'Base64 Encoder / Decoder' && app.url === 'https://toolsdaily.vercel.app/base64-encoder-decoder/' && app.offers.price === '0', 'base64: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(JSON.stringify(visible) === JSON.stringify(schema), `base64: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  const others = ['qr-generator', 'image-compressor', 'image-converter', 'word-counter', 'password-generator', 'age-calculator', 'unit-converter', 'color-converter', 'text-case-converter', 'json-formatter', 'pdf-merge', 'pdf-split', 'image-to-pdf', 'bmi-calculator', 'emi-calculator', 'percentage-calculator', 'image-resizer', 'date-difference-calculator', 'qr-reader'];
  ok(others.every((s) => html.includes(`href="../${s}/"`)), 'base64: More-tools nav links all other 18 tools');
  const sitemap = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
  ok((sitemap.match(/<loc>/g) || []).length === 33, 'sitemap.xml has 32 URLs');
  ok(sitemap.includes('https://toolsdaily.vercel.app/base64-encoder-decoder/'), 'sitemap includes base64-encoder-decoder');
  const home = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  ok((home.match(/class="tool-card"/g) || []).length === 32, 'home has exactly 32 tool cards');
  ok(home.includes('href="base64-encoder-decoder/"'), 'home cards + nav include base64-encoder-decoder');
}

console.log('BASE64 CORE + UI');
{
  const dom = await loadPage('base64-encoder-decoder/');
  const w = dom.window, TD = w.TD_base64;
  ok(TD && typeof TD.encodeText === 'function' && typeof TD.decodeText === 'function', 'TD_base64 exposed');
  ok(TD.encodeText('Hello, World!') === 'SGVsbG8sIFdvcmxkIQ==', 'encode "Hello, World!" = SGVsbG8sIFdvcmxkIQ== (known value)');
  ok(TD.decodeText('SGVsbG8sIFdvcmxkIQ==') === 'Hello, World!', 'decode round-trips to "Hello, World!"');
  ok(TD.encodeText('café') === 'Y2Fmw6k=', 'encode "café" = Y2Fmw6k= (UTF-8, known value)');
  ok(TD.decodeText(TD.encodeText('café ☕')) === 'café ☕', 'unicode round-trip (café + coffee emoji)');
  ok(TD.encodeText('') === '' && TD.decodeText('') === '', 'empty string encodes/decodes to empty');
  ok(TD.bytesToBase64(new w.Uint8Array([0, 255, 128])) === 'AP+A', 'bytes [0,255,128] = AP+A');
  ok(JSON.stringify(Array.from(TD.base64ToBytes('AP+A'))) === '[0,255,128]', 'AP+A decodes back to [0,255,128]');
  ok(TD.isValid('SGVsbG8=') && TD.isValid('') && TD.isValid('SGVsbG8') && !TD.isValid('!!!') && !TD.isValid('SGVsb'), 'isValid: valid, empty and unpadded ok; "!!!" and bad-length "SGVsb" invalid');
  ok(TD.decodeText('SGVs bG8=') === 'Hello', 'whitespace inside Base64 is tolerated');
  let threw = false;
  try { TD.decodeText('!!!'); } catch { threw = true; }
  ok(threw, 'decodeText throws on invalid input');
  // UI: text encode / decode / invalid
  setVal(w, '#text-in', 'Hello, World!');
  w.document.querySelector('#btn-encode').click();
  ok(w.document.querySelector('#text-out').value === 'SGVsbG8sIFdvcmxkIQ==', 'UI encode shows SGVsbG8sIFdvcmxkIQ==');
  setVal(w, '#text-in', 'SGVsbG8sIFdvcmxkIQ==');
  w.document.querySelector('#btn-decode').click();
  ok(w.document.querySelector('#text-out').value === 'Hello, World!', 'UI decode shows Hello, World!');
  setVal(w, '#text-in', '!!!');
  w.document.querySelector('#btn-decode').click();
  ok(w.document.querySelector('#text-msg').textContent.includes('not valid Base64'), 'UI invalid decode shows a friendly error');
  // UI: file encode (jsdom File + arrayBuffer)
  const f = new w.File(['hello'], 'hello.txt', { type: 'text/plain' });
  setFiles(w, '#file-in', [f]);
  ok(w.document.querySelector('#btn-file-encode').disabled === false, 'file selection enables Encode file');
  w.document.querySelector('#btn-file-encode').click();
  await sleep(400);
  ok(w.document.querySelector('#file-out').value === 'aGVsbG8=', 'UI file encode: "hello" -> aGVsbG8=');
  ok(!w.document.querySelector('#file-dl').classList.contains('hidden'), 'file encode reveals the .txt download link');
  ok(w.document.querySelector('#file-dl').getAttribute('download') === 'hello.txt.base64.txt', 'file download name is hello.txt.base64.txt');
  // UI: base64 -> file
  setVal(w, '#b64-in', 'aGVsbG8=');
  setVal(w, '#dl-name', 'hello.txt');
  w.document.querySelector('#btn-b64-decode').click();
  await sleep(200);
  ok(!w.document.querySelector('#b64-dl').classList.contains('hidden'), 'base64 decode reveals the file download link');
  ok(w.document.querySelector('#b64-dl').getAttribute('download') === 'hello.txt', 'decoded download uses the typed filename');
  ok(w.document.querySelector('#b64-msg').textContent.includes('5 bytes'), 'base64 decode message reports 5 bytes');
  setVal(w, '#b64-in', '!!!');
  w.document.querySelector('#btn-b64-decode').click();
  ok(w.document.querySelector('#b64-msg').textContent.includes('not valid Base64'), 'UI invalid base64-to-file shows a friendly error');
  dom.window.close();
}

console.log(`\nLOGIC-BASE64 TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
