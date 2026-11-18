// Sign PDF tests — drives the real page code through jsdom (local server) and
// validates outputs with the site's own vendored pdf-lib (node).
// Covers: sign all pages / one page / last page, invalid page numbers, corrupt
// input, and DOM checks (drop zone, three signature methods, visible download
// button from page load, no emoji, GA4).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const requireSite = createRequire(import.meta.url);
const requireTests = createRequire('/tmp/tooltests/package.json');
const { JSDOM, VirtualConsole } = requireTests('jsdom');

const BASE = process.env.TD_BASE || 'http://127.0.0.1:8791/';
const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PDFDocument } = requireSite(path.join(SITE, 'assets/vendor/pdf-lib.min.js'));

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// NOTE: copy fs Buffers into clean Uint8Arrays — pdf-lib's parsers trip on Node
// Buffer pool offsets. Browsers are unaffected: File.arrayBuffer() is exact.
const u8 = (b) => new Uint8Array(b);

async function loadPage(p) {
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => {});
  const dom = await JSDOM.fromURL(BASE + p, {
    resources: 'usable', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
  });
  await new Promise((res) => {
    if (dom.window.document.readyState === 'complete') res();
    else dom.window.addEventListener('load', res);
    setTimeout(res, 8000);
  });
  await sleep(200);
  return dom;
}

/* ---------- fixtures ---------- */
console.log('FIXTURES');
const bytesA = u8(fs.readFileSync(path.join(SITE, 'tests/sample-a.pdf')));
const sigPng = u8(fs.readFileSync(path.join(SITE, 'tests/test-image.png')));
// 1x1 transparent PNG (data URI decoded) — the smallest possible signature.
const tinyPng = u8(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
));
const docA = await PDFDocument.load(bytesA);
ok(docA.getPageCount() === 2, `sample-a.pdf has 2 pages (input ${bytesA.length} bytes)`);

/* ---------- page load + DOM ---------- */
console.log('DOM (jsdom, local server)');
const dom = await loadPage('sign-pdf/');
const { window } = dom;
const doc = window.document;
ok(doc.title.includes('Sign PDF'), `page loads, title "${doc.title}"`);
ok(doc.title.length <= 60, `title is ${doc.title.length} chars (<= 60)`);
const desc = doc.querySelector('meta[name="description"]');
ok(desc && desc.content.length <= 160, `description is ${desc ? desc.content.length : 'MISSING'} chars (<= 160)`);
ok(!!doc.getElementById('drop'), 'drop zone #drop exists');
ok(!!doc.getElementById('file'), 'file input #file exists');
ok(!!doc.getElementById('sig-canvas'), 'draw method: canvas #sig-canvas exists');
ok(!!doc.getElementById('sig-name'), 'type method: input #sig-name exists');
ok(!!doc.getElementById('sig-file'), 'upload method: input #sig-file exists');
ok(doc.querySelectorAll('.sig-tab').length === 3, 'three signature-method tabs exist');
const dlBtn = doc.getElementById('download');
const dlStyle = dlBtn ? window.getComputedStyle(dlBtn) : null;
ok(!!dlBtn && !dlBtn.classList.contains('hidden') && dlStyle && dlStyle.display !== 'none' && dlStyle.visibility !== 'hidden',
  'download button #download is visible from page load');
const dl = doc.getElementById('dl');
ok(!!dl && dl.getAttribute('href') === '#', 'hidden download link #dl starts at "#" (early click downloads nothing)');
const emojiRe = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
ok(!emojiRe.test(doc.body.textContent), 'no emoji anywhere in page text');
ok(!!doc.querySelector('script[src*="googletagmanager.com/gtag/js?id=G-KX85CZXTR4"]'), 'GA4 script present');
ok(doc.querySelector('.eyebrow')?.textContent.includes('No. 42'), 'eyebrow says "No. 42"');
ok(doc.querySelector('.foot-copy')?.textContent.includes('63 tools'), 'footer count says "63 tools"');
ok(doc.querySelectorAll('nav.more a').length === 5, 'nav.more has exactly 5 curated links');
ok(typeof window.TD_signPdf === 'function', 'window.TD_signPdf is exposed');

/* ---------- sign (the page's real TD_signPdf, node-validated) ---------- */
console.log('SIGN (page TD_signPdf + node pdf-lib validation)');
// Cross-realm rule (logic-v2 pattern): pdf-lib inside jsdom rejects Node-realm
// Uint8Arrays, so re-wrap every buffer in the page realm's Uint8Array.
const wu8 = (b) => new window.Uint8Array(b);
{
  const out = await window.TD_signPdf(wu8(bytesA), wu8(sigPng), { pages: 'all', position: 'bottom-right', width: 150 });
  const check = await PDFDocument.load(new Uint8Array(out)); // re-wrap jsdom-realm bytes into the Node realm
  ok(check.getPageCount() === 2, 'sign all pages: output is a valid PDF with 2 pages');
  ok(out.length > bytesA.length, `sign all pages: output ${out.length} bytes > input ${bytesA.length} bytes (signature embedded)`);
}
{
  const out = await window.TD_signPdf(wu8(bytesA), wu8(tinyPng), { pages: [2], position: 'bottom-left', width: 120 });
  const check = await PDFDocument.load(new Uint8Array(out)); // re-wrap jsdom-realm bytes into the Node realm
  ok(check.getPageCount() === 2, 'sign page 2 only (1x1 PNG): output is a valid 2-page PDF');
}
{
  const out = await window.TD_signPdf(wu8(bytesA), wu8(sigPng), { pages: 'last', position: 'bottom-centre', width: 200 });
  const check = await PDFDocument.load(new Uint8Array(out)); // re-wrap jsdom-realm bytes into the Node realm
  ok(check.getPageCount() === 2, 'sign last page only: output is a valid 2-page PDF');
}
{
  let threw = false;
  try { await window.TD_signPdf(wu8(bytesA), wu8(sigPng), { pages: [5] }); } catch (e) { threw = /Invalid page number/.test(e.message); }
  ok(threw, 'page 5 of a 2-page PDF rejects with an invalid-page error');
}
{
  let threw = false;
  try { await window.TD_signPdf(wu8(bytesA), wu8(sigPng), { pages: [0] }); } catch { threw = true; }
  ok(threw, 'page 0 rejects');
}
{
  let threw = false;
  try { await window.TD_signPdf(wu8(new Uint8Array([1, 2, 3, 4, 5])), wu8(sigPng), { pages: 'all' }); } catch { threw = true; }
  ok(threw, 'corrupt PDF buffer throws (page turns this into a friendly error)');
}
{
  let threw = false;
  try { await window.TD_signPdf(wu8(bytesA), wu8(new Uint8Array([9, 9, 9])), { pages: 'all' }); } catch { threw = true; }
  ok(threw, 'non-PNG signature bytes throw');
}

console.log(`\nSIGN-PDF TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
