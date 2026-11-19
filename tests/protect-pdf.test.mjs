// Protect PDF tests: node-level qpdf encryption verified with pdf.js, plus
// DOM checks against the local server. The page encrypts with qpdf WASM
// (pdf-lib CANNOT encrypt); the engine is lazy-loaded on first Protect click.
// Run: TD_BASE=http://127.0.0.1:8791/ node tests/protect-pdf.test.mjs  (from the site root)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('/tmp/tooltests/package.json');
const { JSDOM, VirtualConsole } = require('jsdom');
const requireSite = createRequire(import.meta.url);
const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// NOTE: do NOT set pdf.js workerSrc in Node — the fake (in-process) worker is
// used, and assets/vendor/pdf.worker.js exists next to pdf.min.js precisely
// so this works.
const pdfjsLib = requireSite(path.join(SITE, 'assets/vendor/pdf.min.js'));
const Module = requireSite(path.join(SITE, 'assets/vendor/qpdf/qpdf.js'));

const BASE = process.env.TD_BASE || 'http://127.0.0.1:8791/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }
// pdf.js transfers (neuters) the data buffer on getDocument, so every open
// attempt needs a FRESH copy of the bytes.
const fresh = (b) => new Uint8Array(b);

/* ---------- qpdf engine (node, same callMain path the page runs) ---------- */
const WASM = path.join(SITE, 'assets/vendor/qpdf/qpdf.wasm');
const qpdf = await Module({ locateFile: (f) => (f.endsWith('.wasm') ? WASM : f) });
// Mirrors window.TD_protectPdf's engine step: callMain returns an exit code
// (0 = success, 2 = bad input); a non-zero code or missing output throws.
function encryptNode(pdfBytes, password) {
  if (typeof password !== 'string' || password.length < 4) {
    const e = new Error('Password must be at least 4 characters long.');
    e.code = 'PASSWORD_TOO_SHORT';
    throw e;
  }
  try { qpdf.FS.unlink('/output.pdf'); } catch { /* first run */ }
  qpdf.FS.writeFile('/input.pdf', pdfBytes);
  const rc = qpdf.callMain(['/input.pdf', '--encrypt', password, password, '256', '--', '/output.pdf']);
  if (rc !== 0) {
    const e = new Error('Could not encrypt this PDF.');
    e.code = 'ENCRYPT_FAILED';
    throw e;
  }
  const out = qpdf.FS.readFile('/output.pdf');
  const copy = new Uint8Array(out.length);
  copy.set(out);
  try { qpdf.FS.unlink('/input.pdf'); } catch { /* ignore */ }
  try { qpdf.FS.unlink('/output.pdf'); } catch { /* ignore */ }
  return copy;
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
const dom = await JSDOM.fromURL(BASE + 'protect-pdf/', {
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
ok(doc.querySelector('h1').textContent.trim() === 'Protect PDF', 'H1 is "Protect PDF"');
ok(typeof window.TD_protectPdf === 'function', 'window.TD_protectPdf is exposed');
ok(typeof window.pdfjsLib === 'object', 'pdf.js global loaded (pre-check for encrypted/corrupt input)');
ok(typeof window.Module === 'undefined', 'qpdf Module NOT loaded with the page (lazy-load only)');
{
  const staticQpdf = [...doc.querySelectorAll('script[src]')].some((s) => s.getAttribute('src').includes('qpdf'));
  ok(!staticQpdf, 'no static qpdf <script> tag in the page (engine loads only on Protect click)');
  ok(doc.documentElement.outerHTML.includes('Loading encryption engine'), 'page shows a "Loading encryption engine…" status while the WASM loads');
}

/* ---------- node-level protect (qpdf + pdf.js verification) ---------- */
console.log('PROTECT (node, vendored qpdf + pdf.js)');
const bytesA = new Uint8Array(fs.readFileSync(path.join(SITE, 'tests/sample-a.pdf')));
const PASSWORD = 'testpass123';
const protectedBytes = encryptNode(bytesA, PASSWORD);
ok(protectedBytes.length > 100, `protected output is ${protectedBytes.length} bytes`);
ok(Buffer.from(protectedBytes.slice(0, 5)).toString() === '%PDF-', 'output is a valid PDF container (starts %PDF-)');
{
  let err = null;
  try { await pdfjsLib.getDocument({ data: fresh(protectedBytes) }).promise; } catch (e) { err = e; }
  ok(!!err && err.name === 'PasswordException', `pdf.js refuses the output without a password (got ${err ? err.name : 'no error'})`);
  ok(!!err && err.code === 1, `refusal is PasswordException code 1 (got ${err ? err.code : 'n/a'})`);
  ok(!!err && err.message === 'No password given', `refusal message is "No password given" (got ${err ? JSON.stringify(err.message) : 'n/a'})`);
}
{
  let err = null;
  try { await pdfjsLib.getDocument({ data: fresh(protectedBytes), password: 'wrongpassword' }).promise; } catch (e) { err = e; }
  ok(!!err && err.name === 'PasswordException' && err.code === 2, `wrong password is refused (PasswordException code 2, got ${err ? err.name + ' code ' + err.code : 'no error'})`);
}
{
  const opened = await pdfjsLib.getDocument({ data: fresh(protectedBytes), password: PASSWORD }).promise;
  ok(opened.numPages === 2, 'output opens with the password and still has 2 pages');
  const page = await opened.getPage(1);
  const tc = await page.getTextContent();
  const text = tc.items.map((i) => i.str).join(' ');
  ok(text.includes('Sample A page 1'), `page 1 text intact after encryption ("${text}")`);
  await opened.destroy();
}

/* ---------- validation + errors ---------- */
console.log('VALIDATION + ERRORS');
{
  // Short password is rejected by the page function itself — validation runs
  // before any engine load, so this needs no WASM.
  let err = null;
  try { await window.TD_protectPdf(new Uint8Array([1, 2, 3]), 'abc'); } catch (e) { err = e; }
  ok(!!err && err.code === 'PASSWORD_TOO_SHORT', `window.TD_protectPdf rejects a 3-char password (code PASSWORD_TOO_SHORT, got ${err ? err.code : 'no error'})`);
  let errEmpty = null;
  try { await window.TD_protectPdf(new Uint8Array([1, 2, 3]), ''); } catch (e) { errEmpty = e; }
  ok(!!errEmpty && errEmpty.code === 'PASSWORD_TOO_SHORT', 'window.TD_protectPdf rejects an empty password');
}
{
  let threw = false;
  try { encryptNode(new Uint8Array([1, 2, 3, 4, 5]), PASSWORD); } catch (e) { threw = e.code === 'ENCRYPT_FAILED'; }
  ok(threw, 'corrupt buffer throws ENCRYPT_FAILED (page turns this into a friendly error)');
}
{
  // An already-encrypted PDF cannot be re-encrypted directly.
  let threw = false;
  try { encryptNode(fresh(protectedBytes), 'anotherpass'); } catch (e) { threw = e.code === 'ENCRYPT_FAILED'; }
  ok(threw, 'already-encrypted input throws ENCRYPT_FAILED (page points at Unlock PDF)');
}

/* ---------- DOM checks ---------- */
console.log('DOM');
ok(!!doc.querySelector('#drop'), 'drop zone #drop exists');
ok(!!doc.querySelector('#file'), 'file input #file exists');
{
  const pw = doc.querySelector('#password');
  const cf = doc.querySelector('#confirm-password');
  ok(!!pw && pw.getAttribute('type') === 'password', 'password field #password exists (type=password)');
  ok(!!cf && cf.getAttribute('type') === 'password', 'confirm field #confirm-password exists (type=password)');
}
ok(!!doc.querySelector('#protect'), 'Protect button #protect exists');
{
  const btn = doc.querySelector('#download');
  const hiddenAncestor = btn && btn.closest('.hidden');
  ok(!!btn && btn.textContent.trim() === 'Download protected PDF', 'visible download button reads "Download protected PDF"');
  ok(!!btn && !btn.hasAttribute('hidden') && !hiddenAncestor && btn.style.display !== 'none',
    'download button is visible from page load (not hidden, no hidden ancestor)');
  const dl = doc.querySelector('#dl');
  ok(!!dl && dl.getAttribute('href') === '#', 'hidden download link #dl starts at "#" (early click downloads nothing)');
  const visibleDownloads = [...doc.querySelectorAll('#tool button')].filter((b) => /download/i.test(b.textContent));
  ok(visibleDownloads.length === 1, 'exactly ONE visible download button');
}
{
  const bodyText = doc.body.textContent || '';
  ok(bodyText.includes('cannot be recovered if lost'), 'honest note present: password "cannot be recovered if lost"');
  ok(bodyText.includes('no back door'), 'honest note present: "no back door"');
  ok(bodyText.includes('cannot be re-encrypted directly'), 'honest note present: already-encrypted PDF "cannot be re-encrypted directly"');
  ok(bodyText.includes('AES-256'), 'honest note present: AES-256 viewer support');
  ok(bodyText.includes('never leave your device'), 'privacy line present: files never leave the device');
  const emojiRe = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
  ok(!emojiRe.test(bodyText), 'no emoji anywhere on the page');
}
ok(!!doc.querySelector('a[href="../unlock-pdf/"]'), 'page links to ../unlock-pdf/ (unlock-first path)');
ok(doc.documentElement.outerHTML.includes('G-KX85CZXTR4'), 'GA4 present (G-KX85CZXTR4)');
ok(doc.title.length <= 60, `title is ${doc.title.length} chars (<= 60)`);
{
  const meta = doc.querySelector('meta[name="description"]');
  ok(!!meta && meta.getAttribute('content').length <= 160, `meta description is ${meta ? meta.getAttribute('content').length : 0} chars (<= 160)`);
}
ok((doc.querySelector('.eyebrow') || {}).textContent.trim() === 'PDF Tools · No. 44', 'eyebrow is "PDF Tools · No. 44"');
ok(doc.body.textContent.includes('68 tools'), 'footer count says "68 tools"');
{
  const links = [...doc.querySelectorAll('nav.more a')].map((a) => a.getAttribute('href'));
  ok(links.length === 5, `nav.more has exactly 5 curated links (got ${links.length})`);
  for (const want of ['../pdf-merge/', '../pdf-split/', '../unlock-pdf/', '../sign-pdf/', '../watermark-pdf/']) {
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
console.log(`\nPROTECT-PDF TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
