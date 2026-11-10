// Logic tests for the V2 additions: pdf-merge, pdf-split, image-to-pdf, bmi, emi, percentage.
// Drives the real page code through jsdom; PDF core functions (TD_mergePdfs / TD_splitPdf /
// TD_imagesToPdf / TD_parseRange) are called on the pages themselves, with fixture bytes from tests/.
// Also static fidelity checks: JSON-LD vs visible FAQ, canonical/OG, sitemap, interlinking.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire('/tmp/tooltests/package.json');
const { JSDOM, VirtualConsole } = require('jsdom');

const BASE = process.env.TD_BASE || 'http://127.0.0.1:8791/';
const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }
function approx(a, b, tol) { return Math.abs(a - b) <= tol; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadPage(p, stubObjectUrl) {
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => {});
  const dom = await JSDOM.fromURL(BASE + p, {
    resources: 'usable', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(window) {
      if (stubObjectUrl) {
        window.URL.createObjectURL = () => 'blob:mock-url';
        window.URL.revokeObjectURL = () => {};
      }
    },
  });
  await new Promise((res) => {
    if (dom.window.document.readyState === 'complete') res();
    else dom.window.addEventListener('load', res);
    setTimeout(res, 5000);
  });
  await sleep(150);
  return dom;
}
function setVal(win, sel, value) {
  const el = win.document.querySelector(sel);
  el.value = value;
  el.dispatchEvent(new win.Event('input', { bubbles: true }));
  el.dispatchEvent(new win.Event('change', { bubbles: true }));
  return el;
}
function setFiles(win, sel, files) {
  const el = win.document.querySelector(sel);
  Object.defineProperty(el, 'files', { value: files, configurable: true });
  el.dispatchEvent(new win.Event('change', { bubbles: true }));
}
const unescapeHtml = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/* ---------------- STATIC CHECKS ---------------- */
console.log('STATIC: SEO head, sitemap, interlinking');
const NEW_PAGES = [
  { slug: 'pdf-merge', name: 'PDF Merge' },
  { slug: 'pdf-split', name: 'PDF Split' },
  { slug: 'image-to-pdf', name: 'Image to PDF' },
  { slug: 'bmi-calculator', name: 'BMI Calculator' },
  { slug: 'emi-calculator', name: 'EMI Calculator' },
  { slug: 'percentage-calculator', name: 'Percentage Calculator' },
];
const OLD_SLUGS = ['qr-generator', 'image-compressor', 'image-converter', 'word-counter', 'password-generator', 'age-calculator', 'unit-converter', 'color-converter', 'text-case-converter', 'json-formatter'];
for (const { slug, name } of NEW_PAGES) {
  const html = fs.readFileSync(path.join(SITE, slug, 'index.html'), 'utf8');
  const canon = `https://toolsdaily.vercel.app/${slug}/`;
  ok(html.includes(`<link rel="canonical" href="${canon}">`), `${slug}: canonical present`);
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), `${slug}: og:image present`);
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), `${slug}: twitter card present`);
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), `${slug}: no external resource loads except the GA4 tag (scripts/images are local)`);
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, `${slug}: JSON-LD parses as [WebApplication, FAQPage]`);
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === name && app.url === canon && app.offers && app.offers.price === '0', `${slug}: WebApplication schema fields correct`);
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(JSON.stringify(visible) === JSON.stringify(schema), `${slug}: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  const navHrefs = OLD_SLUGS.concat(NEW_PAGES.map((p) => p.slug)).filter((s) => s !== slug);
  ok(navHrefs.every((s) => html.includes(`href="../${s}/"`)), `${slug}: More-tools nav links all other 15 tools`);
}
{
  const sitemap = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
  ok((sitemap.match(/<loc>/g) || []).length === 30, 'sitemap.xml has 30 URLs');
  ok(NEW_PAGES.every(({ slug }) => sitemap.includes(`https://toolsdaily.vercel.app/${slug}/`)), 'sitemap includes all 6 new tools');
  ok(sitemap.includes('https://toolsdaily.vercel.app/image-resizer/'), 'sitemap includes image-resizer');
  ok(sitemap.includes('https://toolsdaily.vercel.app/base64-encoder-decoder/'), 'sitemap includes base64-encoder-decoder');
  const home = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  ok((home.match(/class="tool-card"/g) || []).length === 29, 'home has exactly 29 tool cards');
  ok(NEW_PAGES.every(({ slug }) => home.includes(`href="${slug}/"`)), 'home cards + nav include all 6 new tools');
  ok(home.includes('href="image-resizer/"'), 'home cards + nav include image-resizer');
  ok(home.includes('href="base64-encoder-decoder/"'), 'home cards + nav include base64-encoder-decoder');
  for (const slug of OLD_SLUGS) {
    const html = fs.readFileSync(path.join(SITE, slug, 'index.html'), 'utf8');
    ok(NEW_PAGES.every(({ slug: ns }) => html.includes(`href="../${ns}/"`)), `${slug}: More-tools nav now links the 6 new tools`);
  }
}

/* ---------------- HOME SEARCH (jsdom) ---------------- */
console.log('HOME SEARCH');
{
  const dom = await loadPage('');
  const w = dom.window;
  const visibleCount = () => [...w.document.querySelectorAll('.tool-card')].filter((c) => !c.classList.contains('hidden')).length;
  ok(visibleCount() === 29, 'home shows 29 cards before searching');
  setVal(w, '#tool-search', 'pdf');
  ok(visibleCount() === 3, 'search "pdf" filters to the 3 PDF tools');
  setVal(w, '#tool-search', 'calculator');
  ok(visibleCount() === 6, 'search "calculator" finds age, bmi, emi, percentage, date-difference, tip (6)');
  setVal(w, '#tool-search', 'base64');
  ok(visibleCount() === 1, 'search "base64" finds only the new tool (1)');
  setVal(w, '#tool-search', '');
  ok(visibleCount() === 29, 'clearing the search restores all 29 cards');
  dom.window.close();
}

/* ---------------- BMI ---------------- */
console.log('BMI CALCULATOR');
{
  const dom = await loadPage('bmi-calculator/');
  const w = dom.window, TD = w.TD_bmi;
  ok(typeof TD === 'function', 'TD_bmi exposed');
  const r = TD(70, 175);
  ok(r.bmi === 22.9 && r.category === 'Normal', '70 kg / 175 cm = BMI 22.9, Normal (hand-computed)');
  ok(r.healthyMin === 56.7 && r.healthyMax === 76.3, 'healthy range for 175 cm = 56.7 to 76.3 kg (18.5x1.75^2, 24.9x1.75^2)');
  ok(TD(50, 175).category === 'Underweight' && TD(50, 175).bmi === 16.3, '50 kg / 175 cm = 16.3 Underweight');
  ok(TD(90, 175).category === 'Overweight' && TD(90, 175).bmi === 29.4, '90 kg / 175 cm = 29.4 Overweight');
  ok(TD(120, 175).category === 'Obese' && TD(120, 175).bmi === 39.2, '120 kg / 175 cm = 39.2 Obese');
  ok(!!TD(0, 175).error && !!TD(70, 0).error, 'zero height/weight returns an error');
  setVal(w, '#weight', '70'); setVal(w, '#height-cm', '175');
  w.document.querySelector('#calc').click();
  ok(w.document.querySelector('#r-bmi').textContent === '22.9', 'UI shows 22.9');
  ok(w.document.querySelector('#r-cat').textContent === 'Normal', 'UI shows category Normal');
  ok(w.document.querySelector('#r-range').textContent === '56.7 – 76.3', 'UI shows healthy range 56.7 – 76.3');
  setVal(w, '#height-unit', 'ftin');
  ok(w.document.querySelector('#h-cm').classList.contains('hidden') && !w.document.querySelector('#h-ftin').classList.contains('hidden'), 'unit toggle swaps cm inputs for ft/in inputs');
  setVal(w, '#height-ft', '5'); setVal(w, '#height-in', '9');
  w.document.querySelector('#calc').click();
  ok(w.document.querySelector('#r-bmi').textContent === '22.8', 'UI: 5 ft 9 in (=175.26 cm) at 70 kg = BMI 22.8');
  ok(w.document.querySelector('#r-range').textContent === '56.8 – 76.5', 'UI: healthy range for 175.26 cm = 56.8 – 76.5');
  dom.window.close();
}

/* ---------------- EMI ---------------- */
console.log('EMI CALCULATOR');
{
  const dom = await loadPage('emi-calculator/');
  const w = dom.window, TD = w.TD_emi;
  ok(typeof TD === 'function', 'TD_emi exposed');
  const r = TD(100000, 10, 12);
  ok(approx(r.emi, 8791.59, 0.02), 'EMI for 100000 at 10% over 12 months = 8791.59 (known value)');
  ok(approx(r.totalInterest, 5499.08, 1.5), 'total interest ~ 5499.08');
  ok(approx(r.totalPayment, 105499.08, 1.5), 'total payment ~ 105499.08');
  // Independent check: bisect the monthly payment so the amortisation balance ends at exactly 0.
  const balAfter = (P, pct, n, pay) => { const rr = pct / 1200; let bal = P; for (let i = 0; i < n; i++) bal = bal * (1 + rr) - pay; return bal; };
  let lo = 0, hi = 100000;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (balAfter(250000, 7.5, 60, mid) > 0) lo = mid; else hi = mid; }
  const r2 = TD(250000, 7.5, 60);
  ok(approx(r2.emi, (lo + hi) / 2, 0.02), 'EMI for 250000 at 7.5% over 60 months matches independent amortisation bisection');
  ok(approx(r2.totalInterest, ((lo + hi) / 2) * 60 - 250000, 1.5), 'total interest matches the independent simulation');
  ok(TD(12000, 0, 12).emi === 1000 && TD(12000, 0, 12).totalInterest === 0, '0% interest: EMI = principal/months, zero interest');
  ok(!!TD(0, 10, 12).error && !!TD(1000, -1, 12).error && !!TD(1000, 10, 0).error, 'invalid inputs return errors');
  setVal(w, '#amount', '100000'); setVal(w, '#rate', '10'); setVal(w, '#tenure', '1'); setVal(w, '#tenure-unit', 'years');
  ok(w.document.querySelector('#r-emi').textContent === '8,791.59', 'UI shows formatted EMI 8,791.59 for 1-year tenure');
  // Total interest is computed from the UNROUNDED EMI (5499.05/06 depending on float tail),
  // so compare against the page function's own verified value, formatted the same way.
  const fmtT = (x) => x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  ok(w.document.querySelector('#r-interest').textContent === fmtT(r.totalInterest), 'UI total interest matches the verified TD_emi value, formatted');
  ok(w.document.querySelector('#r-total').textContent === fmtT(r.totalPayment), 'UI total payment matches the verified TD_emi value, formatted');
  dom.window.close();
}

/* ---------------- PERCENTAGE ---------------- */
console.log('PERCENTAGE CALCULATOR');
{
  const dom = await loadPage('percentage-calculator/');
  const w = dom.window, TD = w.TD_percent;
  ok(TD.of(15, 200) === 30, '15% of 200 = 30');
  ok(TD.of(0, 200) === 0 && TD.of(100, 55) === 55, '0% and 100% edge cases');
  ok(TD.whatPercent(50, 200) === 25, '50 is 25% of 200');
  ok(TD.whatPercent(1, 4) === 25 && TD.whatPercent(0, 200) === 0, 'more ratio cases');
  ok(TD.whatPercent(5, 0) === null, 'x% of 0-total returns null (no divide-by-zero)');
  ok(TD.change(80, 100) === 25, 'change 80 -> 100 = +25%');
  ok(TD.change(100, 80) === -20, 'change 100 -> 80 = -20%');
  ok(TD.change(50, 50) === 0 && TD.change(0, 5) === null, 'no-change = 0; change from 0 = null');
  setVal(w, '#a-x', '15'); setVal(w, '#a-y', '200');
  ok(w.document.querySelector('#a-result').textContent === '15% of 200 = 30', 'UI mode A renders "15% of 200 = 30"');
  setVal(w, '#b-part', '50'); setVal(w, '#b-whole', '200');
  ok(w.document.querySelector('#b-result').textContent === '50 is 25% of 200', 'UI mode B renders "50 is 25% of 200"');
  setVal(w, '#c-from', '80'); setVal(w, '#c-to', '100');
  ok(w.document.querySelector('#c-result').textContent.includes('Increase of 25%'), 'UI mode C renders an increase of 25%');
  setVal(w, '#b-whole', '0');
  ok(w.document.querySelector('#b-result').textContent.includes('divide by zero'), 'UI mode B shows a divide-by-zero message');
  dom.window.close();
}

/* ---------------- PDF TOOLS (jsdom, real page functions) ---------------- */
console.log('PDF MERGE');
const bytesA = fs.readFileSync(path.join(SITE, 'tests/sample-a.pdf'));
const bytesB = fs.readFileSync(path.join(SITE, 'tests/sample-b.pdf'));
const bytesPng = fs.readFileSync(path.join(SITE, 'tests/test-image.png'));
const bytesJpg = fs.readFileSync(path.join(SITE, 'tests/test-image.jpg'));
{
  const dom = await loadPage('pdf-merge/', true);
  const w = dom.window;
  ok(typeof w.TD_mergePdfs === 'function' && typeof w.PDFLib === 'object', 'page exposes TD_mergePdfs and the vendored PDFLib');
  const out = await w.TD_mergePdfs([new w.Uint8Array(bytesA), new w.Uint8Array(bytesB)]);
  const check = await w.PDFLib.PDFDocument.load(out);
  ok(check.getPageCount() === 3, 'TD_mergePdfs(sample-a 2p + sample-b 1p) = 3 pages');
  // NOTE: size arrays must be window-realm (w.Array.from) — pdf-lib's type check inside
  // the jsdom window rejects node-realm arrays. Real browsers have a single realm; page code
  // only ever passes same-realm arrays, so this is a test-harness quirk only.
  async function makeDoc(widths) { const d = await w.PDFLib.PDFDocument.create(); widths.forEach((x) => d.addPage(w.Array.from([x, 700]))); return d.save(); }
  const mergedOrder = await w.TD_mergePdfs([await makeDoc([612, 500]), await makeDoc([400])]);
  const widths = (await w.PDFLib.PDFDocument.load(mergedOrder)).getPages().map((p) => p.getWidth());
  ok(JSON.stringify(widths) === '[612,500,400]', 'merge preserves file order and page order (widths 612, 500, 400)');
  let threw = false;
  try { await w.TD_mergePdfs([new w.Uint8Array([9, 9, 9, 9])]); } catch { threw = true; }
  ok(threw, 'TD_mergePdfs rejects a corrupt buffer (page shows a friendly error)');
  const fA = new w.File([new w.Uint8Array(bytesA)], 'sample-a.pdf', { type: 'application/pdf' });
  const fB = new w.File([new w.Uint8Array(bytesB)], 'sample-b.pdf', { type: 'application/pdf' });
  setFiles(w, '#file', [fA, fB]);
  ok(w.document.querySelectorAll('#file-list li').length === 2, 'UI lists both selected files');
  ok(w.document.querySelector('#merge').disabled === false, 'Merge button enables with 2 files');
  w.document.querySelector('#merge').click();
  await sleep(700);
  ok(!w.document.querySelector('#dl').classList.contains('hidden'), 'after Merge, the download link appears');
  ok(w.document.querySelector('#msg').textContent.includes('3 pages'), 'success message reports 3 pages');
  const fTxt = new w.File(['hello'], 'notes.txt', { type: 'text/plain' });
  w.document.querySelector('#clear').click();
  setFiles(w, '#file', [fTxt]);
  ok(w.document.querySelector('#msg').textContent.includes('Not a PDF file'), 'a non-PDF selection shows an error');
  ok(w.document.querySelector('#merge').disabled === true, 'Merge stays disabled with no valid PDFs');
  dom.window.close();
}
console.log('PDF SPLIT');
{
  const dom = await loadPage('pdf-split/', true);
  const w = dom.window, PR = w.TD_parseRange;
  ok(typeof PR === 'function' && typeof w.TD_splitPdf === 'function', 'page exposes TD_parseRange and TD_splitPdf');
  ok(JSON.stringify(PR('1-3', 4).indices) === '[0,1,2]', 'range "1-3" of 4 -> indices [0,1,2]');
  ok(JSON.stringify(PR('2,5', 5).indices) === '[1,4]', 'range "2,5" -> indices [1,4]');
  ok(JSON.stringify(PR('1-3, 7', 8).indices) === '[0,1,2,6]', 'mixed "1-3, 7" -> [0,1,2,6]');
  ok(JSON.stringify(PR('1,1,2', 5).indices) === '[0,1]', 'duplicates are removed');
  ok(/backwards/.test(PR('3-1', 5).error || ''), 'backwards range "3-1" errors');
  ok(/out of range/.test(PR('9', 5).error || ''), 'page 9 of 5 errors as out of range');
  ok(!!PR('abc', 5).error && !!PR('', 5).error, 'garbage and empty ranges error');
  const src = await w.PDFLib.PDFDocument.create();
  [300, 400, 500, 600].forEach((x) => src.addPage(w.Array.from([x, 700])));
  const srcBytes = await src.save();
  const outBytes = await w.TD_splitPdf(srcBytes, PR('2-3', 4).indices);
  const checkDoc = await w.PDFLib.PDFDocument.load(outBytes);
  ok(checkDoc.getPageCount() === 2, 'TD_splitPdf(range 2-3 of 4 pages) = 2 pages');
  ok(checkDoc.getPage(0).getWidth() === 400 && checkDoc.getPage(1).getWidth() === 500, 'extracted pages are originals 2 and 3');
  const fA = new w.File([new w.Uint8Array(bytesA)], 'sample-a.pdf', { type: 'application/pdf' });
  setFiles(w, '#file', [fA]);
  await sleep(500);
  ok(w.document.querySelector('#file-info').textContent.includes('2 pages'), 'UI shows the page count after selecting sample-a.pdf');
  ok(w.document.querySelector('#split').disabled === false && w.document.querySelector('#range').disabled === false, 'range input and Extract button enable after load');
  setVal(w, '#range', '2');
  w.document.querySelector('#split').click();
  await sleep(500);
  ok(!w.document.querySelector('#dl').classList.contains('hidden'), 'after Extract, the download link appears');
  ok(w.document.querySelector('#msg').textContent.includes('Extracted 1 page'), 'success message reports 1 extracted page');
  setVal(w, '#range', '9');
  w.document.querySelector('#split').click();
  await sleep(200);
  ok(w.document.querySelector('#msg').textContent.includes('out of range'), 'UI shows the out-of-range error for page 9 of 2');
  const fBad = new w.File([new w.Uint8Array([9, 9, 9, 9, 9, 9])], 'bad.pdf', { type: 'application/pdf' });
  setFiles(w, '#file', [fBad]);
  await sleep(400);
  ok(w.document.querySelector('#msg').textContent.includes('Could not read'), 'a corrupt PDF shows the friendly read error');
  const fTxt = new w.File(['hello'], 'notes.txt', { type: 'text/plain' });
  setFiles(w, '#file', [fTxt]);
  await sleep(200);
  ok(w.document.querySelector('#msg').textContent.includes('not a PDF file'), 'a non-PDF selection shows an error');
  dom.window.close();
}
console.log('IMAGE TO PDF');
{
  const dom = await loadPage('image-to-pdf/', true);
  const w = dom.window;
  ok(typeof w.TD_imagesToPdf === 'function' && typeof w.TD_imageKind === 'function', 'page exposes TD_imagesToPdf and TD_imageKind');
  ok(w.TD_imageKind(new w.Uint8Array(bytesPng)) === 'png', 'TD_imageKind detects PNG by magic bytes');
  ok(w.TD_imageKind(new w.Uint8Array(bytesJpg)) === 'jpg', 'TD_imageKind detects JPEG by magic bytes');
  ok(w.TD_imageKind(new w.Uint8Array([104, 101, 108, 108, 111])) === null, 'TD_imageKind returns null for non-images');
  const one = await w.TD_imagesToPdf([new w.Uint8Array(bytesPng)]);
  const oneDoc = await w.PDFLib.PDFDocument.load(one);
  ok(oneDoc.getPageCount() === 1, 'one PNG -> a 1-page PDF');
  ok(oneDoc.getPage(0).getWidth() === 872 && oneDoc.getPage(0).getHeight() === 672, 'page = image 800x600 + 36pt margins (872x672)');
  const two = await w.TD_imagesToPdf([new w.Uint8Array(bytesPng), new w.Uint8Array(bytesJpg)]);
  ok((await w.PDFLib.PDFDocument.load(two)).getPageCount() === 2, 'PNG + JPG -> a 2-page PDF');
  let threw = false;
  try { await w.TD_imagesToPdf([new w.Uint8Array([1, 2, 3])]); } catch { threw = true; }
  ok(threw, 'TD_imagesToPdf rejects a non-image buffer');
  const fPng = new w.File([new w.Uint8Array(bytesPng)], 'test-image.png', { type: 'image/png' });
  setFiles(w, '#file', [fPng]);
  ok(w.document.querySelector('#convert').disabled === false, 'Convert enables after selecting an image');
  w.document.querySelector('#convert').click();
  await sleep(700);
  ok(!w.document.querySelector('#dl').classList.contains('hidden'), 'after Convert, the download link appears');
  ok(w.document.querySelector('#msg').textContent.includes('1 page'), 'success message reports 1 page');
  const fTxt = new w.File(['hello'], 'notes.txt', { type: 'text/plain' });
  w.document.querySelector('#clear').click();
  setFiles(w, '#file', [fTxt]);
  ok(w.document.querySelector('#msg').textContent.includes('skipped'), 'a non-image selection is skipped with a message');
  ok(w.document.querySelector('#convert').disabled === true, 'Convert stays disabled with no valid images');
  dom.window.close();
}

/* ---------------- IMAGE RESIZER (2026-11-01 daily tool) ---------------- */
console.log('IMAGE RESIZER STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'image-resizer', 'index.html'), 'utf8');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/image-resizer/">'), 'image-resizer: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'image-resizer: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'image-resizer: twitter card present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'image-resizer: no external resource loads except the GA4 tag');
  ok(html.includes('G-KX85CZXTR4'), 'image-resizer: GA4 tag present');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'image-resizer: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'Image Resizer' && app.url === 'https://toolsdaily.vercel.app/image-resizer/' && app.offers.price === '0', 'image-resizer: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(JSON.stringify(visible) === JSON.stringify(schema), `image-resizer: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  const others = OLD_SLUGS.concat(NEW_PAGES.map((p) => p.slug));
  ok(others.every((s) => html.includes(`href="../${s}/"`)), 'image-resizer: More-tools nav links all other 16 tools');
}
console.log('IMAGE RESIZER');
function stubResizeEnv(win) {
  win.__lastCanvas = null;
  win.URL.createObjectURL = () => 'blob:fake';
  win.URL.revokeObjectURL = () => {};
  win.HTMLCanvasElement.prototype.getContext = function () { return { drawImage: () => {}, fillRect: () => {}, fillStyle: '' }; };
  win.HTMLCanvasElement.prototype.toBlob = function (cb) {
    win.__lastCanvas = { w: this.width, h: this.height };
    cb(new win.Blob(['x'.repeat(1500)], { type: 'image/png' }));
  };
  win.Image = class {
    set src(v) { const self = this; setTimeout(() => { if (self.onload) self.onload(); }, 0); }
    get naturalWidth() { return 2000; }
    get naturalHeight() { return 1000; }
  };
}
{
  const dom = await loadPage('image-resizer/');
  const w = dom.window, TD = w.TD_resizeDims;
  ok(typeof TD === 'function', 'TD_resizeDims exposed');
  ok(JSON.stringify(TD(2000, 1000, { mode: 'width', width: 800, lock: true })) === '{"width":800,"height":400}', 'width 800 locked on 2000x1000 -> 800x400');
  ok(JSON.stringify(TD(2000, 1000, { mode: 'width', width: 801, lock: true })) === '{"width":801,"height":401}', 'width 801 locked -> 801x401 (rounding .5 up)');
  ok(JSON.stringify(TD(2000, 1000, { mode: 'height', height: 250, lock: true })) === '{"width":500,"height":250}', 'height 250 locked -> 500x250');
  ok(JSON.stringify(TD(2000, 1000, { mode: 'percent', percent: 50 })) === '{"width":1000,"height":500}', '50% of 2000x1000 -> 1000x500');
  ok(JSON.stringify(TD(2000, 1000, { mode: 'percent', percent: 200 })) === '{"width":4000,"height":2000}', '200% -> 4000x2000');
  ok(JSON.stringify(TD(2000, 1000, { mode: 'exact', width: 300, height: 300 })) === '{"width":300,"height":300}', 'exact 300x300');
  ok(JSON.stringify(TD(2000, 1000, { mode: 'width', width: 800, height: 333, lock: false })) === '{"width":800,"height":333}', 'lock off: width mode keeps given height 333');
  ok(JSON.stringify(TD(2000, 1000, { mode: 'width', width: 800, lock: false })) === '{"width":800,"height":1000}', 'lock off without height keeps original height');
  ok(!!TD(2000, 1000, { mode: 'width', width: 0 }).error, 'width 0 errors');
  ok(!!TD(2000, 1000, { mode: 'percent', percent: 0 }).error && !!TD(2000, 1000, { mode: 'percent', percent: 501 }).error, 'percent 0 and 501 error');
  ok(!!TD(2000, 1000, { mode: 'exact', width: 300 }).error, 'exact without height errors');
  ok(!!TD(2000, 1000, { mode: 'bogus' }).error, 'unknown mode errors');
  // UI: mode rows toggle, and a full resize through the stubbed canvas pipeline.
  setVal(w, '#mode', 'percent');
  ok(!w.document.querySelector('#row-percent').classList.contains('hidden') && w.document.querySelector('#row-width').classList.contains('hidden'), 'percent mode shows percent row, hides width row');
  setVal(w, '#mode', 'width');
  setVal(w, '#lock', ''); // no-op guard: checkbox value is not its state; use checked below
  w.document.querySelector('#lock').checked = true;
  w.document.querySelector('#lock').dispatchEvent(new w.Event('change', { bubbles: true }));
  ok(!w.document.querySelector('#row-width').classList.contains('hidden') && w.document.querySelector('#row-height').classList.contains('hidden'), 'width mode + lock on shows width row only');
  w.document.querySelector('#lock').checked = false;
  w.document.querySelector('#lock').dispatchEvent(new w.Event('change', { bubbles: true }));
  ok(!w.document.querySelector('#row-height').classList.contains('hidden'), 'lock off reveals the height row too');
  dom.window.close();
}
{
  const dom = await loadPage('image-resizer/', (win) => stubResizeEnv(win));
  const w = dom.window;
  // loadPage's beforeParse hook is not wired in logic-v2's loader, so stub here instead:
  // (the page script already ran; re-stubbing canvas/Image affects only later clicks via prototypes)
  stubResizeEnv(w);
  const input = w.document.querySelector('#file');
  Object.defineProperty(input, 'files', { value: [{ name: 'note.txt', type: 'text/plain', size: 100 }], configurable: true });
  input.dispatchEvent(new w.Event('change', { bubbles: true }));
  ok(w.document.querySelector('#msg').className.includes('err'), 'non-image file is rejected with an error');
  ok(w.document.querySelector('#resize').disabled === true, 'resize stays disabled for non-image');
  Object.defineProperty(input, 'files', { value: [{ name: 'photo.png', type: 'image/png', size: 5000 }], configurable: true });
  input.dispatchEvent(new w.Event('change', { bubbles: true }));
  ok(w.document.querySelector('#resize').disabled === false, 'image file enables Resize');
  setVal(w, '#mode', 'width');
  w.document.querySelector('#lock').checked = true;
  setVal(w, '#width', '1000');
  w.document.querySelector('#resize').click();
  await sleep(80);
  ok(w.__lastCanvas && w.__lastCanvas.w === 1000 && w.__lastCanvas.h === 500, 'width 1000 locked scales stub 2000x1000 canvas to 1000x500');
  ok(w.document.querySelector('#orig-dims').textContent === '2000 × 1000', 'original dimensions shown');
  ok(w.document.querySelector('#new-dims').textContent === '1000 × 500', 'new dimensions shown');
  ok(w.document.querySelector('#orig-size').textContent === '4.88 KB', 'original size shown (5000 B -> 4.88 KB)');
  ok(w.document.querySelector('#out-size').textContent === '1.46 KB', 'resized size shown (1500 B stub -> 1.46 KB)');
  const dl = w.document.querySelector('#dl');
  ok(dl.getAttribute('href') === 'blob:fake' && dl.getAttribute('download') === 'resized.png', 'download link points at blob with resized.png name');
  dom.window.close();
}

console.log(`\nLOGIC-V2 TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
