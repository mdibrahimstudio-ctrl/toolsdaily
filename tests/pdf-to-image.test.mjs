// Tests for the PDF to JPG/PNG tool (pdf-to-image, homepage card No. 41).
// Two parts, following pdf.test.mjs / logic-v2.test.mjs style:
//   (1) Node-level ZIP logic with the site's own vendored JSZip (assets/vendor/jszip.min.js)
//       — the exact file the page loads. A node-level render check is impossible without a
//       browser canvas, so the real functional verification is the Playwright smoke check
//       documented in the MANUAL VERIFICATION section at the bottom of this file.
//   (2) jsdom DOM checks against the local server (TD_BASE, default http://127.0.0.1:8791/).
// Run: TD_BASE=http://127.0.0.1:8791/ node tests/pdf-to-image.test.mjs   (from ~/workspace/tools-site)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const requireTooltests = createRequire('/tmp/tooltests/package.json');
const { JSDOM, VirtualConsole } = requireTooltests('jsdom');
const JSZip = require(path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'assets/vendor/jszip.min.js'));
const { PDFDocument } = require(path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'assets/vendor/pdf-lib.min.js'));

const BASE = process.env.TD_BASE || 'http://127.0.0.1:8791/';
const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- fixtures (the Playwright check converts these) ---------- */
console.log('FIXTURES');
const bytesA = new Uint8Array(fs.readFileSync(path.join(SITE, 'tests/sample-a.pdf')));
const bytesB = new Uint8Array(fs.readFileSync(path.join(SITE, 'tests/sample-b.pdf')));
ok((await PDFDocument.load(bytesA)).getPageCount() === 2, 'sample-a.pdf has 2 pages (multi-page ZIP case)');
ok((await PDFDocument.load(bytesB)).getPageCount() === 1, 'sample-b.pdf has 1 page (single-image case)');

/* ---------- ZIP logic (node, vendored JSZip — same path the page runs) ---------- */
console.log('ZIP (node, vendored JSZip)');
{
  // Two small stand-in PNGs: real PNG magic bytes + a few payload bytes each.
  // Buffers here, not Blobs: JSZip in Node cannot read Blobs (it needs a
  // FileReader); the page passes Blobs in the browser, where JSZip handles them.
  const pngHead = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const data1 = Buffer.concat([pngHead, Buffer.from('page-one-payload')]);
  const data2 = Buffer.concat([pngHead, Buffer.from('page-two-payload')]);
  const zip = new JSZip();
  zip.file('page-1.png', data1);
  zip.file('page-2.png', data2);
  const zipBuf = await zip.generateAsync({ type: 'nodebuffer' });
  ok(zipBuf.length > 0, 'ZIP generates a non-empty buffer');
  // ZIP magic bytes: PK\x03\x04
  ok(zipBuf[0] === 0x50 && zipBuf[1] === 0x4b && zipBuf[2] === 0x03 && zipBuf[3] === 0x04, 'ZIP starts with PK magic bytes');
  const loaded = await JSZip.loadAsync(zipBuf);
  const names = Object.keys(loaded.files).sort();
  ok(names.length === 2 && names[0] === 'page-1.png' && names[1] === 'page-2.png', 'ZIP contains exactly page-1.png and page-2.png');
  const out1 = await loaded.file('page-1.png').async('nodebuffer');
  const out2 = await loaded.file('page-2.png').async('nodebuffer');
  ok(Buffer.compare(out1, data1) === 0, 'page-1.png round-trips byte-for-byte');
  ok(Buffer.compare(out2, data2) === 0, 'page-2.png round-trips byte-for-byte');
  ok(out1[0] === 0x89 && out1[1] === 0x50 && out1[2] === 0x4e && out1[3] === 0x47, 'unzipped page-1.png keeps PNG magic bytes');
}

/* ---------- DOM checks (jsdom, local server) ---------- */
console.log('DOM (jsdom, local server)');
const vc = new VirtualConsole();
vc.on('jsdomError', () => {});
const dom = await JSDOM.fromURL(BASE + 'pdf-to-image/', {
  resources: 'usable', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(window) {
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

ok(document.querySelector('h1') && document.querySelector('h1').textContent.trim() === 'PDF to JPG/PNG', 'page loads with h1 "PDF to JPG/PNG"');
ok(document.title.length <= 60, `title is ${document.title.length} chars (<= 60)`);
const desc = document.querySelector('meta[name="description"]');
ok(desc && desc.getAttribute('content').length <= 160, `description is ${desc ? desc.getAttribute('content').length : '?'} chars (<= 160)`);
ok(document.querySelector('.eyebrow') && document.querySelector('.eyebrow').textContent.includes('PDF Tools') && document.querySelector('.eyebrow').textContent.includes('No. 41'), 'eyebrow reads "PDF Tools · No. 41"');
ok(document.querySelector('link[rel="canonical"]').getAttribute('href') === 'https://toolsdaily.vercel.app/pdf-to-image/', 'canonical points at /pdf-to-image/');

// Tool UI
const drop = document.getElementById('drop');
ok(!!drop, 'drop zone (#drop) exists');
const fileInput = document.getElementById('file');
ok(!!fileInput && fileInput.getAttribute('accept').includes('.pdf'), 'file input accepts .pdf');
ok(!fileInput.hasAttribute('multiple'), 'file input is single-file (one PDF at a time)');
const formatSel = document.getElementById('format');
const formatVals = formatSel ? [...formatSel.options].map((o) => o.value) : [];
ok(formatSel && formatVals.includes('png') && formatVals.includes('jpg'), 'format control offers PNG and JPG');
const dpiSel = document.getElementById('dpi');
const dpiVals = dpiSel ? [...dpiSel.options].map((o) => o.value) : [];
ok(dpiSel && dpiVals.includes('72') && dpiVals.includes('150') && dpiVals.includes('300'), 'DPI control offers 72 / 150 / 300');
ok(dpiSel && dpiSel.value === '150', 'DPI defaults to 150');
const convertBtn = document.getElementById('convert');
ok(!!convertBtn && convertBtn.textContent.includes('Convert to images'), 'Convert button exists with label "Convert to images"');
ok(convertBtn.disabled, 'Convert button starts disabled (no file chosen yet)');
ok(!!document.getElementById('thumbs'), 'thumbnail strip container (#thumbs) exists');

// Download rule: exactly ONE visible download button, visible from page load
const downloadBtn = document.getElementById('download');
ok(!!downloadBtn, 'visible download button (#download) exists from page load');
ok(!downloadBtn.classList.contains('hidden') && !downloadBtn.hasAttribute('hidden'), 'download button is not hidden at page load');
ok(!downloadBtn.closest('.hidden'), 'download button has no hidden ancestor at page load');
const dl = document.getElementById('dl');
ok(!!dl && dl.classList.contains('hidden') && dl.getAttribute('href') === '#', 'hidden <a id="dl"> starts with href="#"');
// Early click hints instead of downloading
downloadBtn.click();
await sleep(50);
ok(document.getElementById('msg').textContent.includes('Nothing to download yet'), 'early download click shows a hint and downloads nothing');

// Pure function exposed for tests / Playwright
ok(typeof window.TD_pdfToImages === 'function', 'window.TD_pdfToImages is exposed as a function');
ok(typeof window.pdfjsLib !== 'undefined' && typeof window.pdfjsLib.getDocument === 'function', 'pdf.js (pdfjsLib) loaded from vendored script');
ok(typeof window.JSZip !== 'undefined', 'JSZip loaded from vendored script');

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
for (const href of ['../pdf-merge/', '../pdf-split/', '../image-to-pdf/', '../image-converter/', '../pdf-compressor/']) {
  ok(moreLinks.includes(href), `nav.more links to ${href}`);
}

// Non-PDF rejection: feeding a .txt file shows a friendly error, no crash
{
  const txt = new window.File(['hello'], 'notes.txt', { type: 'text/plain' });
  Object.defineProperty(fileInput, 'files', { value: [txt], configurable: true });
  fileInput.dispatchEvent(new window.Event('change', { bubbles: true }));
  await sleep(50);
  ok(document.getElementById('msg').textContent.includes('not a PDF'), 'non-PDF file shows a friendly "not a PDF" error');
  ok(convertBtn.disabled, 'Convert stays disabled after a non-PDF file');
}

console.log(`\nPDF-TO-IMAGE TOTAL: ${pass} passed, ${fail} failed`);

/* ============================================================================
   MANUAL VERIFICATION — Playwright smoke check (functional, real browser).
   Node/jsdom cannot render a PDF to canvas, so the conversion itself is
   verified in Chromium against the local server (localhost only — the local
   Chromium cannot reach the live internet). Run with playwright-core and the
   cached Chromium at ~/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome:
     cd /tmp/pw && node check.cjs   (playwright-core installed in /tmp/pw)
   Assertions (all must pass; verified 2026-11-16 — see task report):
     1. Load http://127.0.0.1:8791/pdf-to-image/ — page renders, no console errors.
     2. Upload tests/sample-a.pdf (2 pages) via #file, select PNG + 150 DPI,
        click #convert — 2 thumbnails appear in #thumbs.
     3. Download button label becomes "Download images (.zip)"; clicking it
        downloads a ZIP whose entries are page-1.png and page-2.png, each
        starting with the PNG magic bytes 89 50 4E 47.
     4. Clear, upload tests/sample-b.pdf (1 page), convert at 150 DPI PNG —
        1 thumbnail appears, button label stays "Download image", clicking it
        downloads a single .png file with PNG magic bytes.
     5. Rendered page size at 150 DPI: 612x792pt fixture page -> 1275x1650px
        (scale 150/72 = 2.0833).
   ========================================================================== */
process.exit(fail ? 1 : 0);
