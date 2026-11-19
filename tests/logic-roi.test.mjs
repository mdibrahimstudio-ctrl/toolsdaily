// Logic + UI tests for the ROI Calculator (2026-11-18 daily tool).
// Drives the real page code through jsdom; core functions are window.TD_roi.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire('/tmp/tooltests/package.json');
const { JSDOM, VirtualConsole } = require('jsdom');

const BASE = process.env.TD_BASE || 'http://127.0.0.1:8801/';
const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const unescapeHtml = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

async function loadPage(p) {
  const vc = new VirtualConsole();
  const jsdomErrors = [];
  vc.on('jsdomError', (e) => { jsdomErrors.push(e); });
  const dom = await JSDOM.fromURL(BASE + p, {
    resources: 'usable', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
  });
  const winErrors = [];
  dom.window.addEventListener('error', (e) => { winErrors.push(e.message || String(e.error || e)); });
  await new Promise((res) => {
    if (dom.window.document.readyState === 'complete') res();
    else dom.window.addEventListener('load', res);
    setTimeout(res, 5000);
  });
  await sleep(150);
  dom._winErrors = winErrors;
  dom._jsdomErrors = jsdomErrors;
  return dom;
}
function setVal(win, sel, value) {
  const el = win.document.querySelector(sel);
  el.value = value;
  el.dispatchEvent(new win.Event('input', { bubbles: true }));
  el.dispatchEvent(new win.Event('change', { bubbles: true }));
  return el;
}

console.log('ROI STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'roi-calculator', 'index.html'), 'utf8');
  ok(html.includes('<p class="eyebrow">Calculators · No. 59</p>'), 'roi: eyebrow Calculators · No. 59');
  ok(html.includes('<h1 class="rise rise-1">ROI Calculator</h1>'), 'roi: H1 is ROI Calculator');
  ok((html.match(/<h1/g) || []).length === 1, 'roi: exactly one H1');
  ok(html.includes('<a class="skip" href="#tool">Skip to tool</a>'), 'roi: skip link present');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/roi-calculator/">'), 'roi: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'roi: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'roi: twitter card present');
  ok(html.includes('G-KX85CZXTR4'), 'roi: GA4 tag present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'roi: no external resource loads except the GA4 tag');
  ok(html.includes('<link rel="stylesheet" href="../assets/design.css">'), 'roi: design.css stylesheet');
  ok(html.includes('<script src="../assets/site.js"></script>'), 'roi: site.js at end');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  ok(blocks.length === 1, 'roi: exactly one JSON-LD script block');
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'roi: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'ROI Calculator' && app.url === 'https://toolsdaily.vercel.app/roi-calculator/' && app.offers.price === '0', 'roi: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(visible.length === 3 && JSON.stringify(visible) === JSON.stringify(schema), `roi: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  const ids = ['invest', 'return', 'years', 'calc', 'copy', 'download', 'reset', 'r-roi', 'r-profit', 'r-cagr', 'year-table', 'year-body', 'msg', 'dl'];
  ok(ids.every((id) => html.includes(`id="${id}"`)), 'roi: all required element IDs present');
  ok((html.match(/id="download"/g) || []).length === 1, 'roi: exactly one #download button');
  ok(html.includes('<a id="dl" class="hidden" href="#" download="roi-calculator-schedule.csv">'), 'roi: hidden #dl anchor with roi-calculator-schedule.csv download name');
  const nav = html.match(/<nav class="more">[\s\S]*?<\/nav>/)[0];
  const related = ['compound-interest-calculator', 'emi-calculator', 'loan-calculator', 'mortgage-calculator', 'percentage-calculator'];
  const navHrefs = [...nav.matchAll(/href="\.\.\/([^/]+)\/"/g)].map((m) => m[1]);
  ok(JSON.stringify(navHrefs) === JSON.stringify(related), 'roi: nav.more has exactly the 5 related links in order');
  ok(nav.includes('Compound Interest Calculator') && nav.includes('EMI Calculator') && nav.includes('Loan Calculator') && nav.includes('Mortgage Calculator') && nav.includes('% Percentage Calculator'), 'roi: nav.more display names correct');
  ok(html.includes('<p>68 tools · New tools added regularly.</p>'), 'roi: footer says 68 tools');
}

console.log('ROI CORE');
{
  const dom = await loadPage('roi-calculator/');
  const w = dom.window, TD = w.TD_roi;
  ok(TD && typeof TD.calculate === 'function' && typeof TD.buildCSV === 'function' && typeof TD.summary === 'function' && typeof TD.fmt === 'function', 'TD_roi exposed');
  ok(dom._winErrors.length === 0, `roi: zero JS errors on load (got ${dom._winErrors.length})`);
  const jsErrs = dom._jsdomErrors.filter((e) => !/Could not load/i.test(String((e && e.message) || e)));
  ok(jsErrs.length === 0, `roi: zero jsdom script errors on load (got ${jsErrs.length})`);
  // Default case: $10,000 invested, $12,500 back over 5 years: ROI 25%, profit $2,500, CAGR 4.56%.
  const a = TD.calculate(10000, 12500, 5);
  ok(!a.error && a.roiPct === 25 && a.profit === 2500 && a.cagrPct === 4.56, '$10,000/$12,500/5y -> ROI 25%, profit 2500, CAGR 4.56%');
  // No years: no CAGR and no yearly table.
  const b = TD.calculate(10000, 12500, null);
  ok(!b.error && b.roiPct === 25 && b.profit === 2500 && b.cagrPct === null && Array.isArray(b.yearly) && b.yearly.length === 0, '$10,000/$12,500/no years -> ROI 25%, profit 2500, CAGR null, yearly []');
  // $5,000 -> $7,500 over 2 years: ROI 50%, profit $2,500, CAGR 22.47%.
  const c = TD.calculate(5000, 7500, 2);
  ok(!c.error && c.roiPct === 50 && c.profit === 2500 && c.cagrPct === 22.47, '$5,000/$7,500/2y -> ROI 50%, profit 2500, CAGR 22.47%');
  // Loss: $10,000 -> $8,000 over 3 years: ROI -20%, profit -$2,000.
  const d = TD.calculate(10000, 8000, 3);
  ok(!d.error && d.roiPct === -20 && d.profit === -2000, '$10,000/$8,000/3y -> ROI -20%, profit -2000');
  // Errors.
  ok(!!TD.calculate(0, 12500, 5).error, 'zero investment errors');
  ok(!!TD.calculate(-100, 12500, 5).error, 'negative investment errors');
  ok(!!TD.calculate(NaN, 12500, 5).error, 'NaN investment errors');
  ok(!!TD.calculate(10000, -1, 5).error, 'negative return errors');
  ok(!!TD.calculate(10000, 12500, 0).error, 'years 0 errors');
  ok(!!TD.calculate(10000, 12500, 51).error, 'years 51 errors');
  ok(!!TD.calculate(10000, 12500, 2.5).error, 'years 2.5 errors');
  // Yearly table for the default case: 5 rows, starts at the investment, ends exactly at the return.
  ok(a.yearly.length === 5 && a.yearly[0].start === 10000 && a.yearly[4].end === 12500, 'yearly table: 5 rows, first start 10000, last end 12500');
  ok(a.yearly.every((row, i) => row.year === i + 1 && Math.abs(row.start + row.growth - row.end) < 0.011), 'yearly table: start + growth = end on every row');
  // Formatting.
  ok(TD.fmt(0) === '$0.00' && TD.fmt(2500) === '$2,500.00' && TD.fmt(-100) === '-$100.00', 'fmt: $0.00/$2,500.00/-$100.00');
  // Summary text contains the key figures, including the CAGR line when years are given.
  const s = TD.summary(a);
  ok(s.includes('Investment: $10,000.00') && s.includes('Total return: $12,500.00') && s.includes('Net profit: $2,500.00') && s.includes('ROI: 25.00%') && s.includes('CAGR') && s.includes('4.56%'), 'summary lists investment, return, profit, ROI and CAGR for the default case');
  const s2 = TD.summary(b);
  ok(s2.includes('ROI: 25.00%') && !s2.includes('CAGR'), 'summary without years omits the CAGR line');
  // CSV: header + one line per year.
  const csv = TD.buildCSV(a);
  const csvLines = csv.split('\n');
  ok(csvLines[0] === 'Year,Start Balance,Growth,End Balance' && csvLines.length === 6 && csvLines[5].startsWith('5,'), 'buildCSV: header + 5 data lines');
  ok(TD.buildCSV(b) === 'Year,Start Balance,Growth,End Balance', 'buildCSV with no years is just the header');
  dom.window.close();
}

console.log('ROI UI');
{
  const dom = await loadPage('roi-calculator/');
  const w = dom.window;
  // Defaults on load: $10,000 / $12,500 / 5 years.
  ok(w.document.querySelector('#r-roi').textContent === '25.00%', 'UI defaults: ROI 25.00% on load');
  ok(w.document.querySelector('#r-profit').textContent === '$2,500.00', 'UI defaults: profit $2,500.00 on load');
  ok(w.document.querySelector('#r-cagr').textContent === '4.56%', 'UI defaults: CAGR 4.56% on load');
  ok(w.document.querySelectorAll('#year-body tr').length === 5, 'UI defaults: 5 rows in the year table on load');
  // Change inputs: $5,000 / $7,500 / 2 years -> ROI 50.00%, profit $2,500.00, CAGR 22.47%.
  setVal(w, '#invest', '5000');
  setVal(w, '#return', '7500');
  setVal(w, '#years', '2');
  w.document.querySelector('#calc').click();
  ok(w.document.querySelector('#r-roi').textContent === '50.00%' && w.document.querySelector('#r-profit').textContent === '$2,500.00' && w.document.querySelector('#r-cagr').textContent === '22.47%', 'UI $5,000/$7,500/2y -> ROI 50.00%, profit $2,500.00, CAGR 22.47%');
  // Blank years: no CAGR, empty table.
  setVal(w, '#years', '');
  w.document.querySelector('#calc').click();
  ok(w.document.querySelector('#r-cagr').textContent === '–' && w.document.querySelectorAll('#year-body tr').length === 0 && w.document.querySelector('#r-roi').textContent === '50.00%', 'UI blank years -> CAGR –, empty table, ROI still 50.00%');
  // Loss case: $10,000 / $8,000 / 3 years.
  setVal(w, '#invest', '10000');
  setVal(w, '#return', '8000');
  setVal(w, '#years', '3');
  w.document.querySelector('#calc').click();
  ok(w.document.querySelector('#r-roi').textContent === '-20.00%' && w.document.querySelector('#r-profit').textContent === '-$2,000.00', 'UI $10,000/$8,000/3y -> ROI -20.00%, profit -$2,000.00');
  // Invalid investment shows an error and clears the results.
  setVal(w, '#invest', '0');
  w.document.querySelector('#calc').click();
  ok(w.document.querySelector('#msg').textContent.length > 0 && w.document.querySelector('#msg').className === 'msg err' && w.document.querySelector('#r-roi').textContent === '–' && w.document.querySelector('#r-profit').textContent === '–' && w.document.querySelector('#r-cagr').textContent === '–', 'UI investment of 0 shows an error and clears the results');
  // Back to valid inputs for copy/download.
  setVal(w, '#invest', '10000');
  setVal(w, '#return', '12500');
  setVal(w, '#years', '5');
  w.document.querySelector('#calc').click();
  ok(w.document.querySelector('#r-roi').textContent === '25.00%' && w.document.querySelector('#r-profit').textContent === '$2,500.00' && w.document.querySelector('#r-cagr').textContent === '4.56%', 'UI valid inputs after error: ROI 25.00%, profit $2,500.00, CAGR 4.56% again');
  // Copy with a stubbed clipboard.
  let copied = null;
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (t) => { copied = t; } }, configurable: true });
  w.document.querySelector('#copy').click();
  await sleep(80);
  ok(copied && copied.includes('Investment: $10,000.00') && copied.includes('Total return: $12,500.00') && copied.includes('Net profit: $2,500.00') && copied.includes('ROI: 25.00%') && copied.includes('4.56%') && w.document.querySelector('#msg').textContent === 'Copied to clipboard.' && w.document.querySelector('#msg').className === 'msg ok', 'UI copy writes the summary to the clipboard and shows a visible success message');
  // Download with a stubbed createObjectURL.
  w.URL.createObjectURL = () => 'blob:fake';
  w.document.querySelector('#download').click();
  const dl = w.document.querySelector('#dl');
  ok(dl.getAttribute('href') === 'blob:fake' && dl.getAttribute('download') === 'roi-calculator-schedule.csv', 'UI download link points at blob with roi-calculator-schedule.csv name');
  ok(w.document.querySelector('#msg').textContent === 'Downloaded roi-calculator-schedule.csv.' && w.document.querySelector('#msg').className === 'msg ok', 'UI download shows a visible success message');
  // Download with invalid inputs: link stays '#' and a hint shows.
  setVal(w, '#invest', '0');
  w.document.querySelector('#download').click();
  ok(dl.getAttribute('href') === '#' && w.document.querySelector('#msg').textContent.length > 0, 'UI download with invalid inputs leaves #dl at # and shows a hint');
  // Reset restores the defaults.
  w.document.querySelector('#reset').click();
  ok(w.document.querySelector('#invest').value === '10000' && w.document.querySelector('#return').value === '12500' && w.document.querySelector('#years').value === '5', 'UI reset restores the default inputs');
  ok(w.document.querySelector('#r-roi').textContent === '25.00%' && w.document.querySelector('#r-profit').textContent === '$2,500.00' && w.document.querySelector('#r-cagr').textContent === '4.56%', 'UI reset restores the default results');
  ok(dl.getAttribute('href') === '#', 'UI reset puts #dl back to #');
  dom.window.close();
}

console.log(`\nLOGIC-ROI TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
