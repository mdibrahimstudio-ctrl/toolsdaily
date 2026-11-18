// Tests for the Compress PDF tool (pdf-compressor, homepage card No. 39).
// Two parts, following pdf.test.mjs / pdf-to-image.test.mjs style:
//   (1) Node-level compression through the page's own window.TD_compressPdf,
//       run in jsdom against the local server. jsdom has a REAL canvas here
//       (@napi-rs/canvas installed in /tmp/tooltests) and the beforeParse
//       hook polyfills the three web APIs jsdom lacks that pdf.js 3.11 needs
//       in fake-worker mode (structuredClone, ReadableStream, WritableStream,
//       TransformStream — all from Node's own globals). So the render ->
//       JPEG -> pdf-lib path under test is the exact code the page ships.
//   (2) jsdom DOM checks against the local server (TD_BASE, default
//       http://127.0.0.1:8791/): page loads, drop zone, download button visible
//       from page load, no emoji, GA4.
// Run: TD_BASE=http://127.0.0.1:8791/ node tests/pdf-compressor.test.mjs   (from ~/workspace/tools-site)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const requireTooltests = createRequire('/tmp/tooltests/package.json');
const { JSDOM, VirtualConsole } = requireTooltests('jsdom');
const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PDFDocument } = require(path.join(SITE, 'assets/vendor/pdf-lib.min.js'));

const BASE = process.env.TD_BASE || 'http://127.0.0.1:8791/';
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- fixtures ---------- */
console.log('FIXTURES');
const photoBuf = fs.readFileSync(path.join(SITE, 'tests/sample-photo.pdf'));
const textBuf = fs.readFileSync(path.join(SITE, 'tests/sample-a.pdf'));
ok((await PDFDocument.load(new Uint8Array(photoBuf))).getPageCount() === 2, `sample-photo.pdf has 2 pages (${photoBuf.length} bytes, image-heavy)`);
ok((await PDFDocument.load(new Uint8Array(textBuf))).getPageCount() === 2, `sample-a.pdf has 2 pages (${textBuf.length} bytes, text-only)`);

/* ---------- load the page in jsdom (real canvas via @napi-rs/canvas) ---------- */
console.log('LOAD');
const jsdomErrors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => jsdomErrors.push(String((e.detail && e.detail.message) || e.message)));
const dom = await JSDOM.fromURL(BASE + 'pdf-compressor/', {
  resources: 'usable', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(window) {
    // jsdom gaps that pdf.js 3.11 (fake worker) + the page need; all from Node.
    window.structuredClone = globalThis.structuredClone;
    window.ReadableStream = globalThis.ReadableStream;
    window.WritableStream = globalThis.WritableStream;
    window.TransformStream = globalThis.TransformStream;
    window.URL.createObjectURL = () => 'blob:mock-url';
    window.URL.revokeObjectURL = () => {};
  },
});
await new Promise((res) => {
  if (dom.window.document.readyState === 'complete') res();
  else dom.window.addEventListener('load', res);
  setTimeout(res, 8000);
});
await sleep(500);
const { window } = dom;
const { document } = window;
// Fresh jsdom-realm copy per call: pdf.js may detach the buffer (worker transfer).
const jBytes = (buf) => new window.Uint8Array(buf);

/* ---------- DOM checks ---------- */
console.log('DOM (jsdom, local server)');
ok(document.querySelector('h1') && document.querySelector('h1').textContent.trim() === 'Compress PDF', 'page loads with h1 "Compress PDF"');
ok(document.title.length <= 60, `title is ${document.title.length} chars (<= 60)`);
const desc = document.querySelector('meta[name="description"]');
ok(desc && desc.getAttribute('content').length <= 160, `description is ${desc ? desc.getAttribute('content').length : '?'} chars (<= 160)`);
ok(document.querySelector('.eyebrow') && document.querySelector('.eyebrow').textContent.includes('PDF Tools') && document.querySelector('.eyebrow').textContent.includes('No. 39'), 'eyebrow reads "PDF Tools · No. 39"');
ok(document.querySelector('link[rel="canonical"]').getAttribute('href') === 'https://toolsdaily.vercel.app/pdf-compressor/', 'canonical points at /pdf-compressor/');
ok(document.querySelector('.lead').textContent.includes('no longer selectable'), 'honest note on the page: re-rendered text is no longer selectable');

// Tool UI
const drop = document.getElementById('drop');
ok(!!drop, 'drop zone (#drop) exists');
const fileInput = document.getElementById('file');
ok(!!fileInput && fileInput.getAttribute('accept').includes('.pdf'), 'file input accepts .pdf');
ok(!fileInput.hasAttribute('multiple'), 'file input is single-file (one PDF at a time)');
const qualitySel = document.getElementById('quality');
const qualityVals = qualitySel ? [...qualitySel.options].map((o) => o.value) : [];
ok(qualitySel && qualityVals.includes('high') && qualityVals.includes('medium') && qualityVals.includes('low'), 'quality control offers High / Medium / Low');
ok(qualitySel && qualitySel.value === 'medium', 'quality defaults to Medium');
const compressBtn = document.getElementById('compress');
ok(!!compressBtn && compressBtn.textContent.includes('Compress PDF'), 'Compress button exists with label "Compress PDF"');
ok(compressBtn.disabled, 'Compress button starts disabled (no file chosen yet)');
ok(!!document.getElementById('results') && !!document.getElementById('orig-size') && !!document.getElementById('comp-size') && !!document.getElementById('ratio'), 'before/after stats row exists (#results, #orig-size, #comp-size, #ratio)');

// Download rule: exactly ONE visible download button, visible from page load
const downloadBtn = document.getElementById('download');
ok(!!downloadBtn, 'visible download button (#download) exists from page load');
ok(!downloadBtn.classList.contains('hidden') && !downloadBtn.hasAttribute('hidden'), 'download button is not hidden at page load');
ok(!downloadBtn.closest('.hidden'), 'download button has no hidden ancestor at page load');
const dl = document.getElementById('dl');
ok(!!dl && dl.classList.contains('hidden') && dl.getAttribute('href') === '#', 'hidden <a id="dl"> starts with href="#"');
ok(dl.getAttribute('download') === 'compressed.pdf', 'hidden <a id="dl"> downloads as compressed.pdf');
// Early click hints instead of downloading
downloadBtn.click();
await sleep(50);
ok(document.getElementById('msg').textContent.includes('Nothing to download yet'), 'early download click shows a hint and downloads nothing');

// Pure function + vendored libs exposed
ok(typeof window.TD_compressPdf === 'function', 'window.TD_compressPdf is exposed as a function');
ok(typeof window.pdfjsLib !== 'undefined' && typeof window.pdfjsLib.getDocument === 'function', 'pdf.js (pdfjsLib) loaded from vendored script');
ok(typeof window.PDFLib !== 'undefined' && typeof window.PDFLib.PDFDocument !== 'undefined', 'pdf-lib (PDFLib) loaded from vendored script');

// No emoji anywhere in visible text
const emojiRe = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
ok(!emojiRe.test(document.body.textContent), 'no emoji in page text');
ok(!emojiRe.test(document.title), 'no emoji in title');

// GA4 present
ok(!!document.querySelector('script[src*="googletagmanager.com/gtag/js?id=G-KX85CZXTR4"]'), 'GA4 tag present (G-KX85CZXTR4)');
ok(document.documentElement.outerHTML.includes("gtag('config', 'G-KX85CZXTR4')"), 'GA4 config call present');

// FAQ: visible items match JSON-LD
const ld = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent);
const faqLd = ld.find((e) => e['@type'] === 'FAQPage');
const ldQs = faqLd.mainEntity.map((q) => q.name);
const visibleQs = [...document.querySelectorAll('section details summary')].map((s) => s.textContent.trim());
ok(ldQs.length === 3 && visibleQs.length === 3, '3 FAQs in JSON-LD and 3 visible FAQ items');
ok(ldQs.every((q, i) => q === visibleQs[i]), 'JSON-LD FAQ questions match the visible FAQ');
const ldAs = faqLd.mainEntity.map((q) => q.acceptedAnswer.text);
const visibleAs = [...document.querySelectorAll('section details p')].map((p) => p.textContent.trim());
ok(ldAs.every((a, i) => a === visibleAs[i]), 'JSON-LD FAQ answers match the visible FAQ');

// Privacy line + footer count + curated nav.more
ok(document.body.textContent.includes('never leave your device'), 'privacy line present ("never leave your device")');
ok(document.body.textContent.includes('63 tools'), 'footer count reads "63 tools"');
const moreLinks = [...document.querySelectorAll('nav.more ul li a')].map((a) => a.getAttribute('href'));
ok(moreLinks.length === 5, `nav.more has exactly 5 curated links (found ${moreLinks.length})`);
for (const href of ['../pdf-merge/', '../pdf-split/', '../image-to-pdf/', '../pdf-to-image/', '../unlock-pdf/']) {
  ok(moreLinks.includes(href), `nav.more links to ${href}`);
}

// Non-PDF rejection: feeding a .txt file shows a friendly error, no crash
{
  const txt = new window.File(['hello'], 'notes.txt', { type: 'text/plain' });
  Object.defineProperty(fileInput, 'files', { value: [txt], configurable: true });
  fileInput.dispatchEvent(new window.Event('change', { bubbles: true }));
  await sleep(50);
  ok(document.getElementById('msg').textContent.includes('not a PDF'), 'non-PDF file shows a friendly "not a PDF" error');
  ok(compressBtn.disabled, 'Compress stays disabled after a non-PDF file');
}

/* ---------- compression (node-level, the page's own TD_compressPdf) ---------- */
console.log('COMPRESS (node, page function in jsdom + real canvas)');
let mediumLen = 0;
{
  const out = await window.TD_compressPdf(jBytes(photoBuf), 'medium');
  const outNode = new Uint8Array(out); // back to the Node realm for pdf-lib
  const check = await PDFDocument.load(outNode);
  mediumLen = outNode.length;
  ok(check.getPageCount() === 2, 'photo PDF @ Medium: valid PDF with 2 pages');
  ok(outNode.length < photoBuf.length, `photo PDF @ Medium: ${photoBuf.length} -> ${outNode.length} bytes (smaller than input)`);
  const p0 = check.getPage(0);
  ok(p0.getWidth() === 800 && p0.getHeight() === 600, 'photo PDF @ Medium: output page keeps the 800x600pt page size');
}
{
  const out = await window.TD_compressPdf(jBytes(textBuf), 'medium');
  const outNode = new Uint8Array(out);
  const check = await PDFDocument.load(outNode);
  ok(check.getPageCount() === 2, 'text-only PDF @ Medium: valid PDF with the same 2-page count');
}
{
  const out = await window.TD_compressPdf(jBytes(photoBuf), 'low');
  const outNode = new Uint8Array(out);
  const check = await PDFDocument.load(outNode);
  ok(check.getPageCount() === 2, 'photo PDF @ Low: valid PDF with 2 pages');
  ok(outNode.length < mediumLen, `photo PDF @ Low (${outNode.length} bytes) is smaller than @ Medium (${mediumLen} bytes)`);
}
{
  let threw = null;
  try { await window.TD_compressPdf(jBytes(Buffer.from([1, 2, 3, 4, 5])), 'medium'); }
  catch (e) { threw = e; }
  ok(!!threw && threw.name === 'InvalidPDFException', `corrupt buffer throws InvalidPDFException (got ${threw ? threw.name : 'no throw'})`);
}

/* ---------- full UI flow in jsdom: file -> compress -> sizes shown ---------- */
console.log('UI FLOW (jsdom)');
{
  const file = new window.File([jBytes(photoBuf)], 'sample-photo.pdf', { type: 'application/pdf' });
  Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
  fileInput.dispatchEvent(new window.Event('change', { bubbles: true }));
  await sleep(50);
  ok(!compressBtn.disabled, 'Compress enables once a PDF is chosen');
  compressBtn.click();
  // Wait for the async compress to finish (photo @ Medium takes ~1s in jsdom).
  let done = false;
  for (let i = 0; i < 40 && !done; i++) {
    await sleep(250);
    done = document.getElementById('msg').textContent.includes('Done!');
  }
  ok(done, 'UI compress finishes with a "Done!" message');
  ok(!document.getElementById('results').classList.contains('hidden'), 'before/after stats row becomes visible after compression');
  ok(document.getElementById('ratio').textContent.includes('% smaller'), `stats show a real saving ("${document.getElementById('ratio').textContent}")`);
  ok(document.getElementById('orig-size').textContent !== '–' && document.getElementById('comp-size').textContent !== '–', 'original + compressed sizes are both shown');
  ok(dl.getAttribute('href') !== '#', 'download link href is set after compression (blob URL)');
}

/* ---------- jsdom errors (GA beacon noise filtered: external analytics ping) ---------- */
const realErrors = jsdomErrors.filter((e) => !/google-analytics\.com|googletagmanager\.com/.test(e));
ok(realErrors.length === 0, `zero JS/resource errors on the page${realErrors.length ? ' — got: ' + realErrors.map((e) => e.slice(0, 120)).join(' | ') : ''}`);

dom.window.close();
console.log(`\nPDF-COMPRESSOR TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
