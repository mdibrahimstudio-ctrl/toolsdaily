// PDF to Word tests: drives the real page code (window.TD_pdfToWordDocx) through
// jsdom, plus DOM checks against the local server.
// Run: TD_BASE=http://127.0.0.1:8791/ node tests/pdf-to-word.test.mjs  (from the site root)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('/tmp/tooltests/package.json');
const { JSDOM, VirtualConsole } = require('jsdom');
const requireSite = createRequire(import.meta.url);
const JSZip = requireSite(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets/vendor/jszip.min.js'));
const { PDFDocument } = requireSite(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets/vendor/pdf-lib.min.js'));

const BASE = process.env.TD_BASE || 'http://127.0.0.1:8791/';
const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }

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
const dom = await JSDOM.fromURL(BASE + 'pdf-to-word/', {
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
ok(doc.querySelector('h1').textContent.trim() === 'PDF to Word', 'H1 is "PDF to Word"');
ok(typeof window.TD_pdfToWordDocx === 'function', 'window.TD_pdfToWordDocx is exposed');
ok(typeof window.pdfjsLib === 'object' && typeof window.docx === 'object', 'pdf.js + docx.js globals loaded');

/* ---------- node-level conversion (real page function, fixture PDF) ---------- */
console.log('CONVERT (node, real page function + vendored libs)');
{
  const bytes = new Uint8Array(fs.readFileSync(path.join(SITE, 'tests/sample-a.pdf')));
  const blob = await window.TD_pdfToWordDocx(bytes);
  ok(blob && typeof blob.size === 'number' && blob.size > 1000, `conversion returns a Blob (${blob ? blob.size : 0} bytes)`);
  const buf = Buffer.from(await blob.arrayBuffer());
  ok(buf[0] === 0x50 && buf[1] === 0x4b, 'output starts with the ZIP signature (PK) — a .docx is a ZIP');
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml').async('string');
  ok(xml.includes('Sample A page 1'), 'document.xml contains "Sample A page 1"');
  ok(xml.includes('Sample A page 2'), 'document.xml contains "Sample A page 2"');
  ok(xml.includes('w:type="page"') || xml.includes("w:type='page'"), 'a page break separates the two PDF pages');
  ok(!!zip.file('[Content_Types].xml'), 'docx contains [Content_Types].xml (valid OOXML package)');
}

/* ---------- corrupt input throws ---------- */
console.log('ERRORS');
{
  let threw = false;
  try { await window.TD_pdfToWordDocx(new Uint8Array([1, 2, 3, 4, 5])); } catch { threw = true; }
  ok(threw, 'corrupt buffer throws (page turns this into a friendly error)');
  let threwNoText = false;
  try {
    const blank = await PDFDocument.create();
    blank.addPage([612, 792]); // a page with no text at all (like a scanned page)
    await window.TD_pdfToWordDocx(new Uint8Array(await blank.save()));
  } catch (e) { threwNoText = e && (e.code === 'NO_TEXT' || e.message === 'NO_TEXT'); }
  ok(threwNoText, 'textless PDF throws NO_TEXT (page points the user at OCR PDF)');
}

/* ---------- heading heuristic (pure helper) ---------- */
console.log('HEADINGS');
{
  const items = [
    { str: 'Big Title', transform: [24, 0, 0, 24, 72, 700] },
    { str: 'body line one', transform: [12, 0, 0, 12, 72, 670] },
    { str: 'body line two', transform: [12, 0, 0, 12, 72, 655] },
  ];
  const paras = window.TD_itemsToParagraphs(items);
  ok(paras.length === 2, 'title + 2 body lines group into 2 paragraphs');
  ok(paras[0] && paras[0].heading === 1 && paras[0].text === 'Big Title', 'distinctly larger type becomes a Heading 1');
  ok(paras[1] && paras[1].heading === 0 && paras[1].text === 'body line one body line two', 'adjacent body lines merge into one paragraph');
}

/* ---------- DOM checks ---------- */
console.log('DOM');
ok(!!doc.querySelector('#drop'), 'drop zone #drop exists');
ok(!!doc.querySelector('#file'), 'file input #file exists');
ok(!!doc.querySelector('#convert'), 'Convert button #convert exists');
{
  const btn = doc.querySelector('#download');
  const hiddenAncestor = btn && btn.closest('.hidden');
  ok(!!btn && btn.textContent.trim() === 'Download .docx', 'visible download button reads "Download .docx"');
  ok(!!btn && !btn.hasAttribute('hidden') && !hiddenAncestor && btn.style.display !== 'none',
    'download button is visible from page load (not hidden, no hidden ancestor)');
  const dl = doc.querySelector('#dl');
  ok(!!dl && dl.getAttribute('href') === '#', 'hidden download link #dl starts at "#" (early click downloads nothing)');
  const visibleDownloads = [...doc.querySelectorAll('#tool button')].filter((b) => /download/i.test(b.textContent));
  ok(visibleDownloads.length === 1, 'exactly ONE visible download button');
}
{
  const bodyText = doc.body.textContent || '';
  ok(bodyText.includes('not a pixel-perfect conversion'), 'honest-limit wording present: "not a pixel-perfect conversion"');
  ok(bodyText.includes('complex layouts, tables and images are simplified'), 'honest-limit wording present: layouts/tables/images simplified');
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
ok((doc.querySelector('.eyebrow') || {}).textContent.trim() === 'PDF Tools · No. 40', 'eyebrow is "PDF Tools · No. 40"');
ok(doc.body.textContent.includes('68 tools'), 'footer count says "68 tools"');
{
  const links = [...doc.querySelectorAll('nav.more a')].map((a) => a.getAttribute('href'));
  ok(links.length === 5, `nav.more has exactly 5 curated links (got ${links.length})`);
  for (const want of ['../pdf-merge/', '../pdf-split/', '../image-to-pdf/', '../pdf-compressor/', '../ocr-pdf/']) {
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
ok(!!doc.querySelector('a[href="../ocr-pdf/"]'), 'page links to ../ocr-pdf/ (scanned-PDF path)');

window.close();
console.log(`\nPDF-TO-WORD TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
