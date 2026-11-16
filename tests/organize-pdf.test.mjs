// Organize PDF tests: drives the real page code (window.TD_organizePdf) through
// jsdom, verifies output with the vendored pdf-lib (page count, rotation) and
// pdf.js (text extraction), plus DOM checks against the local server.
// Run: TD_BASE=http://127.0.0.1:8791/ node tests/organize-pdf.test.mjs  (from the site root)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const requireTooltests = createRequire('/tmp/tooltests/package.json');
const { JSDOM, VirtualConsole } = requireTooltests('jsdom');
const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PDFDocument } = require(path.join(SITE, 'assets/vendor/pdf-lib.min.js'));
// Node pdf.js: no workerSrc — the fake (in-process) worker is used, which needs
// assets/vendor/pdf.worker.js next to pdf.min.js (it exists; do not delete it).
const pdfjsLib = require(path.join(SITE, 'assets/vendor/pdf.min.js'));

const BASE = process.env.TD_BASE || 'http://127.0.0.1:8791/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }

async function pageText(pdfBytes, pageNo) {
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes) }).promise;
  const page = await doc.getPage(pageNo);
  const tc = await page.getTextContent();
  const text = tc.items.map((it) => it.str).join(' ');
  await doc.destroy();
  return text;
}

/* ---------- load the page ---------- */
console.log('PAGE LOAD');
const jsErrors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => {
  const m = String((e.detail && e.detail.message) || e.message || e);
  // External resources (GA4) may be unreachable in a sandbox — only local
  // script failures count. "Could not load script/link" is a fetch failure.
  if (!/Could not load (script|link|img)/i.test(m)) jsErrors.push(m);
});
const dom = await JSDOM.fromURL(BASE + 'organize-pdf/', {
  resources: 'usable', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(window) {
    // pdf.js's no-worker path uses structuredClone + ReadableStream, which this
    // jsdom version does not provide. Real browsers have both natively.
    if (typeof window.structuredClone !== 'function') window.structuredClone = structuredClone;
    if (typeof window.ReadableStream !== 'function') window.ReadableStream = ReadableStream;
    if (typeof window.WritableStream !== 'function') window.WritableStream = WritableStream;
    if (typeof window.TransformStream !== 'function') window.TransformStream = TransformStream;
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
const doc = window.document;
ok(jsErrors.length === 0, `zero local JS errors${jsErrors.length ? ' — got: ' + jsErrors.join(' | ') : ''}`);
ok(doc.querySelectorAll('h1').length === 1, 'exactly one H1');
ok(doc.querySelector('h1').textContent.trim() === 'Organize PDF', 'H1 is "Organize PDF"');
ok(typeof window.TD_organizePdf === 'function', 'window.TD_organizePdf is exposed');
ok(typeof window.pdfjsLib === 'object' && typeof window.PDFLib === 'object', 'pdf.js + pdf-lib globals loaded');

/* ---------- organize (real page function, fixture PDF) ---------- */
console.log('ORGANIZE (node, real page function + vendored libs)');
const bytesA = new Uint8Array(fs.readFileSync(path.join(SITE, 'tests/sample-a.pdf')));
{
  // Reversed order + 90° rotation on the new first page.
  const out = await window.TD_organizePdf(new window.Uint8Array(bytesA), [
    { srcIndex: 1, rotation: 90 },
    { srcIndex: 0, rotation: 0 },
  ]);
  ok(out instanceof Uint8Array || (out && typeof out.length === 'number'), 'organize returns a byte array');
  const check = await PDFDocument.load(new Uint8Array(out));
  ok(check.getPageCount() === 2, 'reversed organize keeps 2 pages');
  ok(check.getPage(0).getRotation().angle === 90, 'new page 1 rotation is 90°');
  ok(check.getPage(1).getRotation().angle === 0, 'new page 2 rotation is 0°');
  const t1 = await pageText(out, 1);
  const t2 = await pageText(out, 2);
  ok(t1.includes('Sample A page 2'), `page 1 text is "Sample A page 2" (got "${t1.trim()}")`);
  ok(t2.includes('Sample A page 1'), `page 2 text is "Sample A page 1" (got "${t2.trim()}")`);
  ok(Buffer.from(new Uint8Array(out).slice(0, 5)).toString() === '%PDF-', 'output starts with %PDF-');
}
{
  // Drop page 2 (keep only page 1).
  const out = await window.TD_organizePdf(new window.Uint8Array(bytesA), [{ srcIndex: 0, rotation: 0 }]);
  const check = await PDFDocument.load(new Uint8Array(out));
  ok(check.getPageCount() === 1, 'dropping page 2 gives a 1-page output');
  const t1 = await pageText(out, 1);
  ok(t1.includes('Sample A page 1'), `1-page output text is "Sample A page 1" (got "${t1.trim()}")`);
}
{
  // Rotation wraps: 450° behaves as 90°.
  const out = await window.TD_organizePdf(new window.Uint8Array(bytesA), [{ srcIndex: 0, rotation: 450 }]);
  const check = await PDFDocument.load(new Uint8Array(out));
  ok(check.getPage(0).getRotation().angle === 90, '450° rotation normalizes to 90°');
}

/* ---------- errors ---------- */
console.log('ERRORS');
{
  let threw = false;
  try { await window.TD_organizePdf(new window.Uint8Array(bytesA), []); } catch { threw = true; }
  ok(threw, 'empty ops array is rejected (at least one page must remain)');
  let threwBadIndex = false;
  try { await window.TD_organizePdf(new window.Uint8Array(bytesA), [{ srcIndex: 5, rotation: 0 }]); } catch { threwBadIndex = true; }
  ok(threwBadIndex, 'out-of-range srcIndex is rejected');
  let threwCorrupt = false;
  try { await window.TD_organizePdf(new window.Uint8Array([1, 2, 3, 4, 5]), [{ srcIndex: 0, rotation: 0 }]); } catch { threwCorrupt = true; }
  ok(threwCorrupt, 'corrupt buffer throws (page turns this into a friendly error)');
}

/* ---------- DOM checks ---------- */
console.log('DOM');
ok(!!doc.querySelector('#drop'), 'drop zone #drop exists');
{
  const fileInput = doc.querySelector('#file');
  ok(!!fileInput && fileInput.getAttribute('accept').includes('.pdf'), 'file input #file accepts .pdf');
  ok(!!fileInput && !fileInput.hasAttribute('multiple'), 'file input is single-file (one PDF at a time)');
}
ok(!!doc.querySelector('#pages'), 'thumbnail grid container #pages exists');
{
  const saveBtn = doc.querySelector('#save');
  ok(!!saveBtn && saveBtn.textContent.trim() === 'Save organized PDF', 'Save button reads "Save organized PDF"');
  ok(!!saveBtn && saveBtn.disabled, 'Save button starts disabled (no file chosen yet)');
  ok(!!doc.querySelector('#reset') && doc.querySelector('#reset').textContent.trim() === 'Reset', 'Reset button exists');
}
{
  const btn = doc.querySelector('#download');
  const hiddenAncestor = btn && btn.closest('.hidden');
  ok(!!btn && btn.textContent.trim() === 'Download organized PDF', 'visible download button reads "Download organized PDF"');
  ok(!!btn && !btn.hasAttribute('hidden') && !hiddenAncestor && btn.style.display !== 'none',
    'download button is visible from page load (not hidden, no hidden ancestor)');
  const dl = doc.querySelector('#dl');
  ok(!!dl && dl.getAttribute('href') === '#', 'hidden download link #dl starts at "#" (early click downloads nothing)');
  const visibleDownloads = [...doc.querySelectorAll('#tool button')].filter((b) => /download/i.test(b.textContent));
  ok(visibleDownloads.length === 1, 'exactly ONE visible download button');
}
{
  const bodyText = doc.body.textContent || '';
  ok(bodyText.includes('never leave your device'), 'privacy line present: files never leave the device');
  const emojiRe = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
  ok(!emojiRe.test(bodyText), 'no emoji anywhere on the page');
}
ok(doc.documentElement.outerHTML.includes('G-KX85CZXTR4'), 'GA4 present (G-KX85CZXTR4)');
ok(doc.title.length <= 60, `title is ${doc.title.length} chars (<= 60)`);
{
  const meta = doc.querySelector('meta[name="description"]');
  ok(!!meta && meta.getAttribute('content').length <= 160, `meta description is ${meta ? meta.getAttribute('content').length : 0} chars (<= 160)`);
}
ok((doc.querySelector('.eyebrow') || {}).textContent.trim() === 'PDF Tools · No. 45', 'eyebrow is "PDF Tools · No. 45"');
ok(doc.body.textContent.includes('48 tools'), 'footer count says "48 tools"');
{
  const links = [...doc.querySelectorAll('nav.more a')].map((a) => a.getAttribute('href'));
  ok(links.length === 5, `nav.more has exactly 5 curated links (got ${links.length})`);
  for (const want of ['../pdf-merge/', '../pdf-split/', '../image-to-pdf/', '../pdf-compressor/', '../pdf-to-image/']) {
    ok(links.includes(want), `nav.more links to ${want}`);
  }
}
{
  const faqs = [...doc.querySelectorAll('section details summary')].map((s) => s.textContent.trim());
  ok(faqs.length === 3, '3 visible FAQs');
  const ld = doc.querySelector('script[type="application/ld+json"]');
  let ldOk = false;
  try {
    const data = JSON.parse(ld.textContent);
    const faqPage = data.find((d) => d['@type'] === 'FAQPage');
    const qNames = faqPage.mainEntity.map((q) => q.name);
    ldOk = faqs.every((q) => qNames.includes(q));
  } catch { ldOk = false; }
  ok(ldOk, 'JSON-LD FAQ questions match the visible FAQs');
}

window.close();
console.log(`\nORGANIZE-PDF TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
