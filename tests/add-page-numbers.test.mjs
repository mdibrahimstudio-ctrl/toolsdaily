// Add Page Numbers tests: drives the real page code (window.TD_addPageNumbers)
// through jsdom, verifies the output with the vendored pdf-lib + pdf.js,
// plus DOM checks against the local server.
// Run: TD_BASE=http://127.0.0.1:8791/ node tests/add-page-numbers.test.mjs  (from the site root)
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
   so Node pdf.js/pdf-lib see a same-realm typed array. */
const u8 = (b) => new Uint8Array(b);

async function pageItems(pdfBytes, pageNo) {
  const doc = await pdfjsLib.getDocument({ data: u8(pdfBytes) }).promise;
  const page = await doc.getPage(pageNo);
  const tc = await page.getTextContent();
  const items = tc.items.map((i) => ({ str: i.str, y: i.transform ? i.transform[5] : null }));
  await doc.destroy();
  return items;
}
async function pageText(pdfBytes, pageNo) {
  return (await pageItems(pdfBytes, pageNo)).map((i) => i.str).join(' ');
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
const dom = await JSDOM.fromURL(BASE + 'add-page-numbers/', {
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
ok(doc.querySelector('h1').textContent.trim() === 'Add Page Numbers', 'H1 is "Add Page Numbers"');
ok(typeof window.TD_addPageNumbers === 'function', 'window.TD_addPageNumbers is exposed');
ok(typeof window.PDFLib === 'object', 'pdf-lib global loaded');

/* Inputs to the page function must be jsdom-realm Uint8Arrays: pdf-lib's
   type check rejects Node-realm typed arrays ("of type NaN"). Real browsers
   are unaffected — File.arrayBuffer() yields same-realm bytes there. */
const wu8 = (b) => new window.Uint8Array(b);
const bytesA = wu8(fs.readFileSync(path.join(SITE, 'tests/sample-a.pdf')));

/* ---------- numbering: "Page N of M", bottom-centre, start 1 ---------- */
console.log('NUMBERING "Page N of M" (node, real page function + vendored libs)');
{
  const out = u8(await window.TD_addPageNumbers(bytesA, {
    format: 'page-n-of-m', position: 'bottom-centre', startPage: 1, fontSize: 'medium',
  }));
  const check = await PDFDocument.load(out);
  ok(check.getPageCount() === 2, 'numbered sample-a.pdf is a valid PDF with 2 pages');
  ok(out.length > bytesA.length, `output (${out.length} bytes) is larger than the input (${bytesA.length} bytes)`);
  const t1 = await pageText(out, 1);
  const t2 = await pageText(out, 2);
  ok(t1.includes('Page 1 of 2'), `page 1 text contains "Page 1 of 2" (got: "${t1}")`);
  ok(t1.includes('Sample A page 1'), 'page 1 original text intact ("Sample A page 1")');
  ok(t2.includes('Page 2 of 2'), `page 2 text contains "Page 2 of 2" (got: "${t2}")`);
  ok(t2.includes('Sample A page 2'), 'page 2 original text intact ("Sample A page 2")');
  // Bottom placement: the number sits near the bottom edge (y < 50pt on a 792pt page).
  const items1 = await pageItems(out, 1);
  const num = items1.find((i) => i.str === 'Page 1 of 2');
  ok(!!num && num.y !== null && num.y < 50, `bottom-centre number sits near the bottom edge (y=${num ? num.y : 'n/a'}pt)`);
}

/* ---------- start page 2: number equals the page's position in the document ---------- */
console.log('START PAGE 2');
{
  const out = u8(await window.TD_addPageNumbers(bytesA, {
    format: 'page-n-of-m', position: 'bottom-centre', startPage: 2, fontSize: 'medium',
  }));
  const check = await PDFDocument.load(out);
  ok(check.getPageCount() === 2, 'start-page-2 output still has 2 pages');
  const t1 = await pageText(out, 1);
  const t2 = await pageText(out, 2);
  ok(!t1.includes('Page 1 of 2') && !t1.includes('Page 2 of 2'), `page 1 has NO number text (got: "${t1}")`);
  ok(t2.includes('Page 2 of 2'), `page 2 reads "Page 2 of 2" — the number is the page's position in the document (got: "${t2}")`);
}

/* ---------- format "N": bare numbers ---------- */
console.log('FORMAT "N"');
{
  const out = u8(await window.TD_addPageNumbers(bytesA, {
    format: 'n', position: 'bottom-right', startPage: 1, fontSize: 'small',
  }));
  const items1 = await pageItems(out, 1);
  const items2 = await pageItems(out, 2);
  ok(items1.some((i) => i.str === '1'), 'format "N": page 1 has a bare "1" text item');
  ok(items2.some((i) => i.str === '2'), 'format "N": page 2 has a bare "2" text item');
  ok(!items1.some((i) => /Page|of/.test(i.str)), 'format "N": no "Page"/"of" wording on page 1');
}

/* ---------- format "N of M" + top-right placement ---------- */
console.log('FORMAT "N of M" + TOP-RIGHT');
{
  const out = u8(await window.TD_addPageNumbers(bytesA, {
    format: 'n-of-m', position: 'top-right', startPage: 1, fontSize: 'large',
  }));
  const items1 = await pageItems(out, 1);
  const num = items1.find((i) => i.str === '1 of 2');
  ok(!!num, 'format "N of M": page 1 text contains "1 of 2"');
  ok(!!num && num.y !== null && num.y > 700, `top-right number sits near the top edge (y=${num ? num.y : 'n/a'}pt on a 792pt page)`);
  const t2 = await pageText(out, 2);
  ok(t2.includes('2 of 2'), 'format "N of M": page 2 text contains "2 of 2"');
}

/* ---------- errors ---------- */
console.log('ERRORS');
{
  let code = null;
  try {
    await window.TD_addPageNumbers(bytesA, {
      format: 'page-n-of-m', position: 'bottom-centre', startPage: 3, fontSize: 'medium',
    });
  } catch (e) { code = e.code; }
  ok(code === 'START_PAGE_TOO_HIGH', `start page 3 on a 2-page PDF rejected (START_PAGE_TOO_HIGH, got ${code})`);

  let threw = false;
  try { await window.TD_addPageNumbers(wu8([1, 2, 3, 4, 5]), { format: 'n', startPage: 1 }); }
  catch { threw = true; }
  ok(threw, 'corrupt buffer throws (page turns this into a friendly error)');

  let protThrew = false;
  try {
    const prot = wu8(fs.readFileSync(path.join(SITE, 'tests/sample-protected.pdf')));
    await window.TD_addPageNumbers(prot, { format: 'n', startPage: 1 });
  } catch { protThrew = true; }
  ok(protThrew, 'password-protected PDF throws (page turns this into a friendly error)');
}

/* ---------- DOM checks ---------- */
console.log('DOM');
ok(!!doc.querySelector('#drop'), 'drop zone #drop exists');
ok(!!doc.querySelector('#file'), 'file input #file exists');
ok(!!doc.querySelector('#format'), 'number-format select #format exists');
{
  const fmt = doc.querySelector('#format');
  const vals = [...fmt.options].map((o) => o.value);
  ok(vals.includes('page-n-of-m') && vals.includes('n-of-m') && vals.includes('n'),
    'format select offers "Page N of M" / "N of M" / "N"');
}
ok(!!doc.querySelector('#position'), 'position select #position exists');
{
  const pos = doc.querySelector('#position');
  const vals = [...pos.options].map((o) => o.value);
  ok(vals.includes('bottom-centre') && vals.includes('bottom-right') && vals.includes('bottom-left') &&
     vals.includes('top-centre') && vals.includes('top-right'),
    'position select offers bottom-centre / bottom-right / bottom-left / top-centre / top-right');
}
{
  const sp = doc.querySelector('#start-page');
  ok(!!sp && sp.type === 'number', 'start-page input #start-page exists (type=number)');
  ok(!!sp && sp.value === '1', 'start page defaults to 1');
}
ok(!!doc.querySelector('#font-size'), 'font-size control #font-size exists');
ok(!!doc.querySelector('#add-numbers'), 'Add page numbers button #add-numbers exists');
{
  const btn = doc.querySelector('#download');
  const hiddenAncestor = btn && btn.closest('.hidden');
  ok(!!btn && btn.textContent.trim() === 'Download numbered PDF', 'visible download button reads "Download numbered PDF"');
  ok(!!btn && !btn.hasAttribute('hidden') && !hiddenAncestor && btn.style.display !== 'none',
    'download button is visible from page load (not hidden, no hidden ancestor)');
  const dl = doc.querySelector('#dl');
  ok(!!dl && dl.getAttribute('href') === '#', 'hidden download link #dl starts at "#" (early click downloads nothing)');
  const visibleDownloads = [...doc.querySelectorAll('#tool button')].filter((b) => /download/i.test(b.textContent));
  ok(visibleDownloads.length === 1, 'exactly ONE visible download button');
}
{
  const bodyText = doc.body.textContent || '';
  ok(bodyText.includes('never leave your device'), 'privacy line present: files never leave your device');
  ok(bodyText.includes('Start at 2 to leave a cover page unnumbered'), 'start-page behaviour documented on the page');
  const emojiRe = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
  ok(!emojiRe.test(bodyText), 'no emoji anywhere on the page');
}
ok(doc.documentElement.outerHTML.includes('G-KX85CZXTR4'), 'GA4 present (G-KX85CZXTR4)');
ok(doc.title.length <= 60, `title is ${doc.title.length} chars (<= 60)`);
{
  const meta = doc.querySelector('meta[name="description"]');
  ok(!!meta && meta.getAttribute('content').length <= 160, `meta description is ${meta ? meta.getAttribute('content').length : 0} chars (<= 160)`);
}
ok((doc.querySelector('.eyebrow') || {}).textContent.trim() === 'PDF Tools · No. 47', 'eyebrow is "PDF Tools · No. 47"');
ok(doc.body.textContent.includes('63 tools'), 'footer count says "63 tools"');
{
  const links = [...doc.querySelectorAll('nav.more a')].map((a) => a.getAttribute('href'));
  ok(links.length === 5, `nav.more has exactly 5 curated links (got ${links.length})`);
  for (const want of ['../pdf-merge/', '../pdf-split/', '../organize-pdf/', '../watermark-pdf/', '../image-to-pdf/']) {
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
console.log(`\nADD-PAGE-NUMBERS TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
