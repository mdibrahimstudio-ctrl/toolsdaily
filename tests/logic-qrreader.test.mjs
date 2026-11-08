// Logic + UI tests for the QR Code Reader (2026-11-04 daily tool).
// Drives the real page code through jsdom; core function is window.TD_qrReader.
// A real QR pixel buffer is built with the site's own vendored qrcode.js encoder
// and decoded with the page's vendored jsQR — a true encode -> decode round trip.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
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

// Build a QR pixel buffer (RGBA) for `text` using the vendored encoder, as the
// QR Generator page does: qrcode(0, 'M'), addData, make, isDark(row, col).
function qrImageData(text, scale = 8, quiet = 4) {
  const src = fs.readFileSync(path.join(SITE, 'assets', 'vendor', 'qrcode.js'), 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  const qr = sandbox.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const size = (n + quiet * 2) * scale;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const mx = Math.floor(x / scale) - quiet;
      const my = Math.floor(y / scale) - quiet;
      const dark = mx >= 0 && my >= 0 && mx < n && my < n && qr.isDark(my, mx);
      const i = (y * size + x) * 4;
      const v = dark ? 0 : 255;
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    }
  }
  return { data, width: size, height: size };
}

console.log('QRREADER STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'qr-reader', 'index.html'), 'utf8');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/qr-reader/">'), 'qr-reader: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'qr-reader: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'qr-reader: twitter card present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'qr-reader: no external resource loads except the GA4 tag');
  ok(html.includes('G-KX85CZXTR4'), 'qr-reader: GA4 tag present');
  ok(html.includes('<script src="../assets/vendor/jsqr.js"></script>'), 'qr-reader: jsQR vendored locally');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'qr-reader: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'QR Code Reader' && app.url === 'https://toolsdaily.vercel.app/qr-reader/' && app.offers.price === '0', 'qr-reader: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(JSON.stringify(visible) === JSON.stringify(schema), `qr-reader: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  const others = ['qr-generator', 'image-compressor', 'image-converter', 'word-counter', 'password-generator', 'age-calculator', 'unit-converter', 'color-converter', 'text-case-converter', 'json-formatter', 'pdf-merge', 'pdf-split', 'image-to-pdf', 'bmi-calculator', 'emi-calculator', 'percentage-calculator', 'image-resizer', 'base64-encoder-decoder', 'date-difference-calculator'];
  ok(others.every((s) => html.includes(`href="../${s}/"`)), 'qr-reader: More-tools nav links all other 19 tools');
  const sitemap = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
  ok((sitemap.match(/<loc>/g) || []).length === 26, 'sitemap.xml has 26 URLs');
  ok(sitemap.includes('https://toolsdaily.vercel.app/qr-reader/'), 'sitemap includes qr-reader');
  const home = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  ok((home.match(/class="tool-card"/g) || []).length === 25, 'home has exactly 25 tool cards');
  ok(home.includes('href="qr-reader/"'), 'home cards + nav include qr-reader');
}

console.log('QRREADER CORE + UI');
{
  const dom = await loadPage('qr-reader/');
  const w = dom.window, TD = w.TD_qrReader;
  ok(typeof w.jsQR === 'function', 'vendored jsQR loads on the page');
  ok(TD && typeof TD.decodeImageData === 'function' && typeof TD.isUrl === 'function', 'TD_qrReader exposed');

  // Encode -> decode round trips through the page's own decode function.
  const hello = qrImageData('Hello, World!');
  let r = TD.decodeImageData(hello);
  ok(!r.error && r.text === 'Hello, World!', 'round trip: "Hello, World!" QR decodes back exactly');
  const url = qrImageData('https://toolsdaily.vercel.app/');
  r = TD.decodeImageData(url);
  ok(!r.error && r.text === 'https://toolsdaily.vercel.app/', 'round trip: URL QR decodes back exactly');
  const wifi = qrImageData('WIFI:T:WPA;S:MyNetwork;P:secret123;;');
  r = TD.decodeImageData(wifi);
  ok(!r.error && r.text === 'WIFI:T:WPA;S:MyNetwork;P:secret123;;', 'round trip: Wi-Fi payload QR decodes back exactly');
  // Inverted QR (white code on black) via inversionAttempts: attemptBoth.
  const inv = qrImageData('Inverted test');
  for (let i = 0; i < inv.data.length; i += 4) { const v = 255 - inv.data[i]; inv.data[i] = v; inv.data[i + 1] = v; inv.data[i + 2] = v; }
  r = TD.decodeImageData(inv);
  ok(!r.error && r.text === 'Inverted test', 'inverted (white-on-black) QR decodes via attemptBoth');
  // Blank image -> friendly error, no crash.
  const blank = { data: new Uint8ClampedArray(200 * 200 * 4).fill(255), width: 200, height: 200 };
  r = TD.decodeImageData(blank);
  ok(!!r.error && /No QR code found/.test(r.error), 'blank image returns "No QR code found" error');
  r = TD.decodeImageData(null);
  ok(!!r.error, 'null image data returns an error');

  ok(TD.isUrl('https://example.com/page') === true, 'isUrl: https URL true');
  ok(TD.isUrl('http://example.com') === true, 'isUrl: http URL true');
  ok(TD.isUrl('Hello, World!') === false, 'isUrl: plain text false');
  ok(TD.isUrl('ftp://example.com') === false, 'isUrl: ftp rejected (only http/https open)');
  ok(TD.isUrl('') === false, 'isUrl: empty false');

  // UI wiring that jsdom can drive (canvas decode itself needs a real browser;
  // the live-verify step covers it end to end).
  const d = w.document;
  ok(!!d.querySelector('#file') && !!d.querySelector('#drop') && !!d.querySelector('#decode') && !!d.querySelector('#clear') && !!d.querySelector('#copy') && !!d.querySelector('#result') && !!d.querySelector('#open-link'), 'qr-reader: all UI elements exist');
  d.querySelector('#decode').click();
  await sleep(50);
  ok(d.querySelector('#msg').textContent === 'Please choose a QR code image first.', 'decode with no file shows the prompt message');
  dom.window.close();
}
console.log(`\nQRREADER TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
