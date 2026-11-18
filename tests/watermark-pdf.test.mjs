// Watermark PDF tests: drives the real page code (window.TD_watermarkPdf)
// through jsdom, verifies the output with the vendored pdf-lib + pdf.js,
// plus DOM checks against the local server.
// Run: TD_BASE=http://127.0.0.1:8791/ node tests/watermark-pdf.test.mjs  (from the site root)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('/tmp/tooltests/package.json');
const { JSDOM, VirtualConsole } = require('jsdom');
const requireSite = createRequire(import.meta.url);
const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PDFDocument } = requireSite(path.join(SITE, 'assets/vendor/pdf-lib.min.js'));
const pdfjsLib = requireSite(path.join(SITE, 'assets/vendor/pdf.min.js'));
// NOTE: do NOT set pdf.js workerSrc in Node — the fake (in-process) worker is
// used, and assets/vendor/pdf.worker.js exists next to pdf.min.js so it works.

const BASE = process.env.TD_BASE || 'http://127.0.0.1:8791/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }

/* NOTE: copy fs Buffers into clean Uint8Arrays — pdf-lib's JPEG parser trips on
   Node Buffer pool offsets. Copy jsdom-realm results into Node Uint8Arrays too,
   so Node pdf.js/pdf-lib see a same-realm typed array. And inputs to the page's
   jsdom-realm pdf-lib must be jsdom-realm Uint8Arrays — pdf-lib's strict
   instanceof check rejects a Node-realm Uint8Array ("must be of type string or
   Uint8Array or ArrayBuffer, but was actually of type NaN"). */
const u8 = (b) => new Uint8Array(b);
const ju8 = (b) => new window.Uint8Array(b);

async function pageText(pdfBytes, pageNo) {
  const doc = await pdfjsLib.getDocument({ data: u8(pdfBytes) }).promise;
  const page = await doc.getPage(pageNo);
  const tc = await page.getTextContent();
  const text = tc.items.map((i) => i.str).join(' ');
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
const dom = await JSDOM.fromURL(BASE + 'watermark-pdf/', {
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
ok(doc.querySelector('h1').textContent.trim() === 'Watermark PDF', 'H1 is "Watermark PDF"');
ok(typeof window.TD_watermarkPdf === 'function', 'window.TD_watermarkPdf is exposed');
ok(typeof window.PDFLib === 'object', 'pdf-lib global loaded');

/* ---------- text watermark (real page function, fixture PDF) ---------- */
console.log('TEXT WATERMARK (node, real page function + vendored libs)');
const bytesA = u8(fs.readFileSync(path.join(SITE, 'tests/sample-a.pdf')));
{
  const out = u8(await window.TD_watermarkPdf(ju8(bytesA), {
    mode: 'text', text: 'CONFIDENTIAL', opacity: 0.3, angle: 45, size: 48, pages: 'all',
  }));
  const check = await PDFDocument.load(out);
  ok(check.getPageCount() === 2, 'text-watermarked sample-a.pdf still has 2 pages');
  ok(out.length > bytesA.length, `output (${out.length} bytes) is larger than the input (${bytesA.length} bytes)`);
  const t1 = await pageText(out, 1);
  const t2 = await pageText(out, 2);
  ok(t1.includes('CONFIDENTIAL'), `page 1 text contains "CONFIDENTIAL" (got: "${t1}")`);
  ok(t1.includes('Sample A page 1'), 'page 1 original text intact ("Sample A page 1")');
  ok(t2.includes('CONFIDENTIAL'), `page 2 text contains "CONFIDENTIAL" (got: "${t2}")`);
  ok(t2.includes('Sample A page 2'), 'page 2 original text intact ("Sample A page 2")');
}

/* ---------- image watermark ---------- */
console.log('IMAGE WATERMARK');
{
  const png = u8(fs.readFileSync(path.join(SITE, 'tests/test-image.png')));
  const out = u8(await window.TD_watermarkPdf(ju8(bytesA), {
    mode: 'image', imageBytes: ju8(png), opacity: 0.4, scale: 30, position: 'centre', pages: 'all',
  }));
  const check = await PDFDocument.load(out);
  ok(check.getPageCount() === 2, 'image-watermarked sample-a.pdf still has 2 pages');
  ok(out.length > bytesA.length, `image output (${out.length} bytes) is larger than the input (${bytesA.length} bytes)`);
  const t1 = await pageText(out, 1);
  ok(t1.includes('Sample A page 1'), 'image-watermarked page 1 original text intact');
}

/* ---------- page choice: "2" only ---------- */
console.log('PAGE CHOICE');
{
  const out = u8(await window.TD_watermarkPdf(ju8(bytesA), {
    mode: 'text', text: 'CONFIDENTIAL', opacity: 0.3, angle: 45, size: 48, pages: '2',
  }));
  const check = await PDFDocument.load(out);
  ok(check.getPageCount() === 2, 'pages "2" output still has 2 pages');
  const t1 = await pageText(out, 1);
  const t2 = await pageText(out, 2);
  ok(!t1.includes('CONFIDENTIAL'), 'pages "2": page 1 has NO watermark text');
  ok(t2.includes('CONFIDENTIAL'), 'pages "2": page 2 has the watermark text');
}
{
  // Range parsing: "1,3-5" on a 5-page doc stamps 1, 3, 4, 5 only.
  const src = await PDFDocument.create();
  for (let i = 0; i < 5; i++) src.addPage([612, 792]);
  const srcBytes = u8(await src.save());
  const out = u8(await window.TD_watermarkPdf(ju8(srcBytes), {
    mode: 'text', text: 'CONFIDENTIAL', opacity: 0.3, angle: 0, size: 48, pages: '1,3-5',
  }));
  const texts = [];
  for (let p = 1; p <= 5; p++) texts.push(await pageText(out, p));
  ok(texts[0].includes('CONFIDENTIAL') && !texts[1].includes('CONFIDENTIAL') &&
     texts[2].includes('CONFIDENTIAL') && texts[3].includes('CONFIDENTIAL') &&
     texts[4].includes('CONFIDENTIAL'),
    'pages "1,3-5": pages 1, 3, 4, 5 stamped, page 2 untouched');
}

/* ---------- errors ---------- */
console.log('ERRORS');
{
  let code = null;
  try { await window.TD_watermarkPdf(ju8(bytesA), { mode: 'text', text: '   ', pages: 'all' }); }
  catch (e) { code = e.code; }
  ok(code === 'EMPTY_TEXT', `empty watermark text rejected (EMPTY_TEXT, got ${code})`);

  let threw = false;
  try { await window.TD_watermarkPdf(ju8(new Uint8Array([1, 2, 3, 4, 5])), { mode: 'text', text: 'X' }); }
  catch { threw = true; }
  ok(threw, 'corrupt buffer throws (page turns this into a friendly error)');

  let badCode = null;
  try { await window.TD_watermarkPdf(ju8(bytesA), { mode: 'text', text: 'X', pages: '99' }); }
  catch (e) { badCode = e.code; }
  ok(badCode === 'BAD_PAGES', `invalid page number rejected (BAD_PAGES, got ${badCode})`);

  let noImg = null;
  try { await window.TD_watermarkPdf(ju8(bytesA), { mode: 'image', pages: 'all' }); }
  catch (e) { noImg = e.code; }
  ok(noImg === 'NO_IMAGE', `image mode without an image rejected (NO_IMAGE, got ${noImg})`);

  let badImg = null;
  try { await window.TD_watermarkPdf(ju8(bytesA), { mode: 'image', imageBytes: ju8(new Uint8Array([9, 9, 9, 9])), pages: 'all' }); }
  catch (e) { badImg = e.code; }
  ok(badImg === 'BAD_IMAGE', `non-PNG/JPG image bytes rejected (BAD_IMAGE, got ${badImg})`);
}

/* ---------- DOM checks ---------- */
console.log('DOM');
ok(!!doc.querySelector('#drop'), 'drop zone #drop exists');
ok(!!doc.querySelector('#file'), 'file input #file exists');
ok(!!doc.querySelector('#tab-text') && !!doc.querySelector('#tab-image'), 'text + image mode tabs exist');
ok(!!doc.querySelector('#panel-text') && !!doc.querySelector('#panel-image'), 'text + image panels exist');
ok(!!doc.querySelector('#wm-text'), 'watermark text input #wm-text exists');
ok(!!doc.querySelector('#image-file'), 'image upload #image-file exists');
ok(!!doc.querySelector('#opacity') && !!doc.querySelector('#img-opacity'), 'opacity sliders exist (text + image)');
ok(!!doc.querySelector('#angle'), 'rotation angle control #angle exists');
ok(!!doc.querySelector('#font-size'), 'font size slider #font-size exists');
ok(!!doc.querySelector('#tile'), 'tile checkbox #tile exists');
ok(!!doc.querySelector('#pages'), 'pages input #pages exists');
ok(!!doc.querySelector('#watermark'), 'Add watermark button #watermark exists');
{
  const btn = doc.querySelector('#download');
  const hiddenAncestor = btn && btn.closest('.hidden');
  ok(!!btn && btn.textContent.trim() === 'Download watermarked PDF', 'visible download button reads "Download watermarked PDF"');
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
ok((doc.querySelector('.eyebrow') || {}).textContent.trim() === 'PDF Tools · No. 46', 'eyebrow is "PDF Tools · No. 46"');
ok(doc.body.textContent.includes('63 tools'), 'footer count says "63 tools"');
{
  const links = [...doc.querySelectorAll('nav.more a')].map((a) => a.getAttribute('href'));
  ok(links.length === 5, `nav.more has exactly 5 curated links (got ${links.length})`);
  for (const want of ['../pdf-merge/', '../pdf-split/', '../sign-pdf/', '../add-page-numbers/', '../organize-pdf/']) {
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
console.log(`\nWATERMARK-PDF TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
