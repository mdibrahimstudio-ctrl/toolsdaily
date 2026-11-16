// OCR PDF tests (homepage card No. 48).
// Three parts, following pdf.test.mjs / pdf-to-word.test.mjs style:
//   (1) Node-level OCR with the REAL Tesseract engine: tests/sample-scan.pdf
//       (1 page, image-only) is rendered with the vendored pdf.js +
//       @napi-rs/canvas, then OCR'd. The vendored tesseract.min.js is a
//       browser UMD build — it loads in Node only with a `self` polyfill and
//       then fails at createWorker ("Worker is not defined"), and the vendored
//       worker.min.js is browser-only too (verified 2026-11-16). So the node
//       test uses the npm tesseract.js 7.0.0 package (same version, Node
//       entry via worker_threads, installed in /tmp/tooltests) pointed at the
//       SAME vendored engine files: corePath + langPath =
//       assets/vendor/tesseract/ (the core wasm + eng.traineddata.gz the
//       page loads). The real functional verification is the Playwright smoke
//       check documented at the bottom of this file.
//   (2) Lazy-load contract: the page source has no static tesseract script
//       tag, and window.Tesseract is undefined at page load.
//   (3) jsdom DOM checks against the local server (TD_BASE, default
//       http://127.0.0.1:8791/).
// Run: TD_BASE=http://127.0.0.1:8791/ node tests/ocr-pdf.test.mjs  (from ~/workspace/tools-site)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const requireTT = createRequire('/tmp/tooltests/package.json');
const { JSDOM, VirtualConsole } = requireTT('jsdom');
const { createCanvas } = requireTT('@napi-rs/canvas');
const Tesseract = requireTT('tesseract.js');
const requireSite = createRequire(import.meta.url);

const BASE = process.env.TD_BASE || 'http://127.0.0.1:8791/';
const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TESS_DIR = path.join(SITE, 'assets/vendor/tesseract');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }

/* ---------- fixture ---------- */
console.log('FIXTURE');
const scanPath = path.join(SITE, 'tests/sample-scan.pdf');
ok(fs.existsSync(scanPath), 'tests/sample-scan.pdf exists');
const scanBytes = new Uint8Array(fs.readFileSync(scanPath));

/* ---------- node-level OCR (real engine, vendored core + language data) ---------- */
console.log('OCR (node, real Tesseract engine + vendored pdf.js)');
{
  const pdfjsLib = requireSite(path.join(SITE, 'assets/vendor/pdf.min.js'));
  // Custom canvas factory (a getDocument option in pdf.js 3.11) so pdf.js
  // never touches its built-in NodeCanvasFactory, which requires the
  // 'canvas' package from pdf.min.js's own module paths.
  const canvasFactory = {
    create(width, height) { const c = createCanvas(width, height); return { canvas: c, context: c.getContext('2d') }; },
    reset(cc, width, height) { cc.canvas.width = width; cc.canvas.height = height; },
    destroy(cc) { cc.canvas.width = 0; cc.canvas.height = 0; },
  };
  const doc = await pdfjsLib.getDocument({ data: scanBytes, canvasFactory }).promise;
  ok(doc.numPages === 1, 'sample-scan.pdf has exactly 1 page');
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 2 }); // same scale the page uses
  const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  const png = await canvas.encode('png');
  ok(png.length > 1000, `page renders to a PNG (${png.length} bytes at scale 2)`);
  ok(png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4e && png[3] === 0x47, 'rendered image starts with PNG magic bytes');

  const t0 = Date.now();
  const worker = await Tesseract.createWorker('eng', 1, {
    corePath: TESS_DIR + '/',
    langPath: TESS_DIR + '/',
  });
  const workerMs = Date.now() - t0;
  const r0 = Date.now();
  const { data } = await worker.recognize(png);
  const recogMs = Date.now() - r0;
  await worker.terminate();
  const text = data.text || '';
  console.log(`  (worker ready in ${workerMs} ms, recognize in ${recogMs} ms)`);
  console.log('  (extracted: ' + JSON.stringify(text.replace(/\s+/g, ' ').trim()) + ')');
  ok(/QUICK BROWN FOX/i.test(text), 'OCR text contains "QUICK BROWN FOX"');
  ok(/48210/.test(text), 'OCR text contains "48210"');
  ok(/1,?250\.00/.test(text), 'OCR text contains the total "1,250.00"');
  ok(/16 November 2026/i.test(text), 'OCR text contains "16 November 2026"');
}

/* ---------- lazy-load contract (page source) ---------- */
console.log('LAZY-LOAD CONTRACT');
{
  const src = fs.readFileSync(path.join(SITE, 'ocr-pdf/index.html'), 'utf8');
  ok(!/<script[^>]*tesseract/i.test(src), 'no static <script> tag loads tesseract (page source)');
  ok(!/src="[^"]*tesseract[^"]*"/i.test(src), 'no src attribute anywhere references tesseract');
  ok(/createElement\(['"]script['"]\)/.test(src), 'engine loads via dynamic script injection (createElement("script"))');
  ok(src.includes("TESS_DIR + 'tesseract.min.js'") || src.includes('tesseract.min.js'), 'dynamic injection points at the vendored tesseract.min.js');
  ok(src.includes('worker.min.js') && src.includes("corePath: TESS_DIR") && src.includes("langPath: TESS_DIR"),
    'worker is created with the vendored worker/core/lang paths');
  ok(src.includes('worker.terminate()'), 'worker is terminated when OCR is done');
}

/* ---------- load the page (jsdom, local server) ---------- */
console.log('PAGE LOAD');
const jsErrors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => {
  const m = String((e.detail && e.detail.message) || e.message || e);
  // External resources (GA4) may be unreachable in a sandbox — only local
  // script failures count. "Could not load script/link" is a fetch failure.
  if (!/Could not load (script|link|img)/i.test(m)) jsErrors.push(m);
});
const dom = await JSDOM.fromURL(BASE + 'ocr-pdf/', {
  resources: 'usable', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(window) {
    // pdf.js's no-worker path uses structuredClone + ReadableStream, which this
    // jsdom version does not provide. Real browsers have both natively.
    if (typeof window.structuredClone !== 'function') window.structuredClone = structuredClone;
    if (typeof window.ReadableStream !== 'function') window.ReadableStream = ReadableStream;
    if (typeof window.WritableStream !== 'function') window.WritableStream = WritableStream;
    if (typeof window.TransformStream !== 'function') window.TransformStream = TransformStream;
  },
});
await new Promise((res) => {
  if (dom.window.document.readyState === 'complete') res();
  else dom.window.addEventListener('load', res);
  setTimeout(res, 8000);
});
await sleep(500);
const { window } = dom;
const doc = window.document;
ok(jsErrors.length === 0, `zero local JS errors${jsErrors.length ? ' — got: ' + jsErrors.join(' | ') : ''}`);
ok(doc.querySelectorAll('h1').length === 1, 'exactly one H1');
ok(doc.querySelector('h1').textContent.trim() === 'OCR PDF', 'H1 is "OCR PDF"');
ok(typeof window.TD_ocrPdf === 'function', 'window.TD_ocrPdf is exposed as a function');
ok(typeof window.pdfjsLib === 'object' && typeof window.pdfjsLib.getDocument === 'function', 'pdf.js (pdfjsLib) loaded from the vendored script tag');
ok(typeof window.Tesseract === 'undefined', 'window.Tesseract is undefined at page load (nothing from the engine loads with the page)');

/* ---------- page function rejects bad input before touching the engine ---------- */
console.log('ERRORS (real page function, jsdom)');
{
  let threw = false;
  try { await window.TD_ocrPdf(new Uint8Array([1, 2, 3, 4, 5])); } catch { threw = true; }
  ok(threw, 'corrupt buffer throws (page turns this into a friendly error)');
  let threwPass = false;
  try {
    const prot = new Uint8Array(fs.readFileSync(path.join(SITE, 'tests/sample-protected.pdf')));
    await window.TD_ocrPdf(prot);
  } catch (e) { threwPass = e && e.name === 'PasswordException'; }
  ok(threwPass, 'password-protected PDF throws PasswordException (page shows the password message)');
  ok(typeof window.Tesseract === 'undefined', 'engine still not loaded after failed runs (errors happen before the engine is needed)');
}

/* ---------- DOM checks ---------- */
console.log('DOM');
ok(!!doc.querySelector('#drop'), 'drop zone #drop exists');
{
  const fi = doc.querySelector('#file');
  ok(!!fi && fi.getAttribute('accept').includes('.pdf'), 'file input #file accepts .pdf');
  ok(!!fi && !fi.hasAttribute('multiple'), 'file input is single-file (one PDF at a time)');
}
{
  const btn = doc.querySelector('#ocr');
  ok(!!btn && btn.textContent.trim() === 'Start OCR', 'Start OCR button #ocr exists');
  ok(!!btn && btn.disabled, 'Start OCR button starts disabled (no file chosen yet)');
}
ok(!!doc.querySelector('#results'), 'results container #results exists');
ok(!!doc.querySelector('#status'), 'progress/status line #status exists');
{
  const btn = doc.querySelector('#download');
  const hiddenAncestor = btn && btn.closest('.hidden');
  ok(!!btn && btn.textContent.trim() === 'Download text (.txt)', 'visible download button reads "Download text (.txt)"');
  ok(!!btn && !btn.hasAttribute('hidden') && !hiddenAncestor && btn.style.display !== 'none',
    'download button is visible from page load (not hidden, no hidden ancestor)');
  const dl = doc.querySelector('#dl');
  ok(!!dl && dl.getAttribute('href') === '#', 'hidden download link #dl starts at "#" (early click downloads nothing)');
  const visibleDownloads = [...doc.querySelectorAll('#tool button')].filter((b) => /download/i.test(b.textContent));
  ok(visibleDownloads.length === 1, 'exactly ONE visible download button');
  // Early click hints instead of downloading.
  btn.click();
  await sleep(50);
  ok(doc.querySelector('#msg').textContent.includes('Nothing to download yet'), 'early download click shows a hint and downloads nothing');
}
{
  const bodyText = doc.body.textContent || '';
  ok(bodyText.includes('about 6 MB'), 'engine-size wording present: "about 6 MB"');
  ok(bodyText.includes('cached'), 'cached-after-first-use wording present');
  ok(bodyText.includes('English only'), 'English-only wording present');
  ok(bodyText.includes('accuracy depends on scan quality'), 'accuracy caveat present');
  ok(bodyText.includes('searchable-PDF output is not included'), 'searchable-PDF exclusion stated honestly');
  ok(bodyText.includes('never leave your device'), 'privacy line present: files never leave the device');
  const emojiRe = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
  ok(!emojiRe.test(bodyText), 'no emoji anywhere on the page');
  ok(!emojiRe.test(doc.title), 'no emoji in the title');
}
ok(doc.documentElement.outerHTML.includes('G-KX85CZXTR4'), 'GA4 present (G-KX85CZXTR4)');
ok(doc.title.length <= 60, `title is ${doc.title.length} chars (<= 60)`);
{
  const meta = doc.querySelector('meta[name="description"]');
  ok(!!meta && meta.getAttribute('content').length <= 160, `meta description is ${meta ? meta.getAttribute('content').length : 0} chars (<= 160)`);
}
ok((doc.querySelector('.eyebrow') || {}).textContent.trim() === 'PDF Tools · No. 48', 'eyebrow is "PDF Tools · No. 48"');
ok(doc.body.textContent.includes('48 tools'), 'footer count says "48 tools"');
{
  const links = [...doc.querySelectorAll('nav.more a')].map((a) => a.getAttribute('href'));
  ok(links.length === 5, `nav.more has exactly 5 curated links (got ${links.length})`);
  for (const want of ['../pdf-merge/', '../pdf-split/', '../pdf-to-word/', '../image-to-pdf/', '../pdf-compressor/']) {
    ok(links.includes(want), `nav.more links to ${want}`);
  }
}
{
  const faqs = [...doc.querySelectorAll('section details summary')].map((s) => s.textContent.trim());
  ok(faqs.length === 3, '3 visible FAQs');
  const ld = doc.querySelector('script[type="application/ld+json"]');
  let ldOk = false, ldAnsOk = false;
  try {
    const data = JSON.parse(ld.textContent);
    const faqPage = data.find((d) => d['@type'] === 'FAQPage');
    const qNames = faqPage.mainEntity.map((q) => q.name);
    ldOk = faqs.every((q) => qNames.includes(q));
    const visibleAs = [...doc.querySelectorAll('section details p')].map((p) => p.textContent.trim());
    const ldAs = faqPage.mainEntity.map((q) => q.acceptedAnswer.text);
    ldAnsOk = ldAs.every((a, i) => a === visibleAs[i]);
  } catch { /* leave false */ }
  ok(ldOk, 'JSON-LD FAQ questions match the visible FAQs');
  ok(ldAnsOk, 'JSON-LD FAQ answers match the visible FAQs');
}
{
  // Non-PDF rejection: feeding a .txt file shows a friendly error, no crash.
  const fi = doc.querySelector('#file');
  const txt = new window.File(['hello'], 'notes.txt', { type: 'text/plain' });
  Object.defineProperty(fi, 'files', { value: [txt], configurable: true });
  fi.dispatchEvent(new window.Event('change', { bubbles: true }));
  await sleep(50);
  ok(doc.querySelector('#msg').textContent.includes('not a PDF'), 'non-PDF file shows a friendly "not a PDF" error');
  ok(doc.querySelector('#ocr').disabled, 'Start OCR stays disabled after a non-PDF file');
}

window.close();
console.log(`\nOCR-PDF TOTAL: ${pass} passed, ${fail} failed`);

/* ============================================================================
   MANUAL VERIFICATION — Playwright smoke check (functional, real browser).
   jsdom cannot run the Tesseract worker, so the full OCR run is verified in
   Chromium against the local server (localhost only — the local Chromium
   cannot reach the live internet). Run with playwright-core and the cached
   Chromium at ~/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome:
     cd /tmp/qapw && node ocr-pdf-smoke.mjs   (playwright-core installed there)
   Assertions (all must pass; verified 2026-11-16 — see task report):
     1. Load http://127.0.0.1:8791/ocr-pdf/ — page renders, no console errors,
        ZERO tesseract network requests on page load.
     2. Upload tests/sample-scan.pdf via #file, click #ocr — status shows
        engine loading with a percentage, then "Reading page 1 of 1…".
     3. Extracted text appears in #results and contains "QUICK BROWN FOX"
        and "48210"; word count shown.
     4. Click #download — a .txt file downloads (sample-scan-ocr.txt) whose
        contents contain "--- Page 1 ---" and "QUICK BROWN FOX".
   ========================================================================== */
process.exit(fail ? 1 : 0);
