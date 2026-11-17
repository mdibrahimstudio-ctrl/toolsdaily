// Unlock PDF tests: drives the real page code (window.TD_unlockPdf) through
// jsdom, plus DOM checks against the local server.
// Run: TD_BASE=http://127.0.0.1:8791/ node tests/unlock-pdf.test.mjs  (from the site root)
//
// Fixture: tests/sample-protected.pdf is tests/sample-a.pdf (2 pages, labelled
// "Sample A page N") encrypted with qpdf --encrypt testpass123 ownerpass456 256.
// It is generated here with the vendored qpdf WASM when missing, so later PDF
// tools can reuse it. The user password is testpass123.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('/tmp/tooltests/package.json');
const { JSDOM, VirtualConsole } = require('jsdom');
const requireSite = createRequire(import.meta.url);
const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PDFDocument, StandardFonts, rgb } = requireSite(path.join(SITE, 'assets/vendor/pdf-lib.min.js'));
const pdfjsLib = requireSite(path.join(SITE, 'assets/vendor/pdf.min.js'));

const BASE = process.env.TD_BASE || 'http://127.0.0.1:8791/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }

/* ---------- fixtures ---------- */
console.log('FIXTURES');
const fixA = path.join(SITE, 'tests/sample-a.pdf');
const fixProtected = path.join(SITE, 'tests/sample-protected.pdf');
if (!fs.existsSync(fixA)) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 2; i++) {
    const page = doc.addPage([612, 792]);
    page.drawText(`Sample A page ${i}`, { x: 72, y: 700, size: 24, font, color: rgb(0, 0, 0) });
  }
  fs.writeFileSync(fixA, await doc.save());
}
if (!fs.existsSync(fixProtected)) {
  const Module = requireSite(path.join(SITE, 'assets/vendor/qpdf/qpdf.js'));
  const wasmPath = path.join(SITE, 'assets/vendor/qpdf/qpdf.wasm');
  const qpdf = await Module({ locateFile: (f) => (f.endsWith('.wasm') ? wasmPath : f) });
  qpdf.FS.writeFile('/input.pdf', fs.readFileSync(fixA));
  qpdf.callMain(['/input.pdf', '--encrypt', 'testpass123', 'ownerpass456', '256', '--', '/output.pdf']);
  fs.writeFileSync(fixProtected, Buffer.from(qpdf.FS.readFile('/output.pdf')));
}
ok(fs.existsSync(fixProtected), 'sample-protected.pdf exists');
const encBytes = new Uint8Array(fs.readFileSync(fixProtected));
const plainBytes = new Uint8Array(fs.readFileSync(fixA));
{
  // The fixture really is encrypted: pdf.js must demand a password for it.
  let code = null;
  try { await pdfjsLib.getDocument({ data: new Uint8Array(encBytes) }).promise; }
  catch (e) { code = e && e.code; }
  ok(code === 1, 'fixture demands a password (pdf.js PasswordException code 1, "No password given")');
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
const dom = await JSDOM.fromURL(BASE + 'unlock-pdf/', {
  resources: 'usable', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(window) {
    // pdf.js's no-worker path uses structuredClone + ReadableStream, which this
    // jsdom version does not provide. Real browsers have both natively.
    if (typeof window.structuredClone !== 'function') window.structuredClone = structuredClone;
    if (typeof window.ReadableStream !== 'function') window.ReadableStream = ReadableStream;
    if (typeof window.WritableStream !== 'function') window.WritableStream = WritableStream;
    if (typeof window.TransformStream !== 'function') window.TransformStream = TransformStream;
    // jsdom has no fetch, and the qpdf WASM loader needs it (its XHR fallback
    // cannot fetch the .wasm in jsdom). Real browsers have fetch natively.
    // Node's fetch needs absolute URLs, so resolve relative ones against the
    // page URL exactly as a browser would.
    if (typeof window.fetch !== 'function') {
      window.fetch = function (input, init) {
        if (typeof input === 'string') input = new URL(input, window.location.href).href;
        return fetch(input, init);
      };
    }
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
ok(doc.querySelector('h1').textContent.trim() === 'Unlock PDF', 'H1 is "Unlock PDF"');
ok(typeof window.TD_unlockPdf === 'function', 'window.TD_unlockPdf is exposed');
ok(typeof window.pdfjsLib === 'object' && typeof window.PDFLib === 'object', 'pdf.js + pdf-lib globals loaded');

/* ---------- unlock (real page function, encrypted fixture) ---------- */
console.log('UNLOCK (jsdom page function + vendored libs)');
{
  // NOTE: pdf.js transfers (neuters) the buffer it is given, so every call
  // below passes a fresh copy.
  const out = await window.TD_unlockPdf(new Uint8Array(encBytes), 'testpass123');
  ok(out && typeof out.length === 'number' && out.length > 500, `unlock returns bytes (${out ? out.length : 0} bytes)`);
  const bytes = new Uint8Array(out); // copy out of the jsdom realm for Node pdf-lib
  ok(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46,
    'output starts with the %PDF signature');
  const check = await PDFDocument.load(bytes); // loads WITHOUT a password = unprotected
  ok(check.getPageCount() === 2, 'unlocked PDF loads in pdf-lib without a password, 2 pages');
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
  ok(pdf.numPages === 2, 'unlocked PDF opens in pdf.js without a password, 2 pages');
  const tc = await (await pdf.getPage(1)).getTextContent();
  const text = tc.items.map((i) => i.str).join(' ');
  ok(text.includes('Sample A page 1'), `page 1 text intact ("${text}")`);
}

/* ---------- errors ---------- */
console.log('ERRORS');
{
  let code = null;
  try { await window.TD_unlockPdf(new Uint8Array(encBytes), 'wrongpass'); } catch (e) { code = e && e.code; }
  ok(code === 'WRONG_PASSWORD', 'wrong password rejects with WRONG_PASSWORD');
}
{
  let code = null;
  try { await window.TD_unlockPdf(new Uint8Array(plainBytes), 'testpass123'); } catch (e) { code = e && e.code; }
  ok(code === 'NOT_PROTECTED', 'unprotected input (with a password typed) rejects with NOT_PROTECTED');
}
{
  let code = null;
  try { await window.TD_unlockPdf(new Uint8Array(plainBytes), ''); } catch (e) { code = e && e.code; }
  ok(code === 'NOT_PROTECTED', 'unprotected input (no password typed) rejects with NOT_PROTECTED');
}
{
  let code = null;
  try { await window.TD_unlockPdf(new Uint8Array(encBytes), ''); } catch (e) { code = e && e.code; }
  ok(code === 'EMPTY_PASSWORD', 'protected input + empty password rejects with EMPTY_PASSWORD');
}
{
  let threw = false;
  try { await window.TD_unlockPdf(new Uint8Array([1, 2, 3, 4, 5]), 'testpass123'); } catch { threw = true; }
  ok(threw, 'corrupt buffer throws (page turns this into a friendly error)');
}

/* ---------- DOM checks ---------- */
console.log('DOM');
ok(!!doc.querySelector('#drop'), 'drop zone #drop exists');
ok(!!doc.querySelector('#file'), 'file input #file exists');
{
  const pw = doc.querySelector('#password');
  ok(!!pw && pw.getAttribute('type') === 'password', 'password input #password exists (type=password)');
}
ok(!!doc.querySelector('#unlock'), 'Unlock button #unlock exists');
ok(doc.querySelector('#unlock').textContent.trim() === 'Unlock PDF', 'Unlock button reads "Unlock PDF"');
{
  const btn = doc.querySelector('#download');
  const hiddenAncestor = btn && btn.closest('.hidden');
  ok(!!btn && btn.textContent.trim() === 'Download unlocked PDF', 'visible download button reads "Download unlocked PDF"');
  ok(!!btn && !btn.hasAttribute('hidden') && !hiddenAncestor && btn.style.display !== 'none',
    'download button is visible from page load (not hidden, no hidden ancestor)');
  const dl = doc.querySelector('#dl');
  ok(!!dl && dl.getAttribute('href') === '#', 'hidden download link #dl starts at "#" (early click downloads nothing)');
  const visibleDownloads = [...doc.querySelectorAll('#tool button')].filter((b) => /download/i.test(b.textContent));
  ok(visibleDownloads.length === 1, 'exactly ONE visible download button');
}
{
  const bodyText = doc.body.textContent || '';
  ok(bodyText.includes('does not guess or crack passwords'), 'no-cracking wording present: "does not guess or crack passwords"');
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
ok((doc.querySelector('.eyebrow') || {}).textContent.trim() === 'PDF Tools · No. 43', 'eyebrow is "PDF Tools · No. 43"');
ok(doc.body.textContent.includes('58 tools'), 'footer count says "58 tools"');
{
  const links = [...doc.querySelectorAll('nav.more a')].map((a) => a.getAttribute('href'));
  ok(links.length === 5, `nav.more has exactly 5 curated links (got ${links.length})`);
  for (const want of ['../pdf-merge/', '../pdf-split/', '../protect-pdf/', '../sign-pdf/', '../pdf-compressor/']) {
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
console.log(`\nUNLOCK-PDF TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
