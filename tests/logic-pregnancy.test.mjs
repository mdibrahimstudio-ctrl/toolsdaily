// Logic + UI tests for the Pregnancy Due Date Calculator (2026-11-18 daily tool).
// Drives the real page code through jsdom; core functions are window.TD_pregnancy.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire('/tmp/tooltests/package.json');
const { JSDOM, VirtualConsole } = require('jsdom');

const BASE = process.env.TD_BASE || 'http://127.0.0.1:8805/';
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

console.log('PREGNANCY STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'pregnancy-due-date-calculator', 'index.html'), 'utf8');
  ok(html.includes('<p class="eyebrow">Calculators · No. 61</p>'), 'pregnancy: eyebrow Calculators · No. 61');
  ok(html.includes('<h1 class="rise rise-1">Pregnancy Due Date Calculator</h1>'), 'pregnancy: H1 is Pregnancy Due Date Calculator');
  ok((html.match(/<h1/g) || []).length === 1, 'pregnancy: exactly one H1');
  ok(html.includes('<a class="skip" href="#tool">Skip to tool</a>'), 'pregnancy: skip link present');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/pregnancy-due-date-calculator/">'), 'pregnancy: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'pregnancy: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'pregnancy: twitter card present');
  ok(html.includes('G-KX85CZXTR4'), 'pregnancy: GA4 tag present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'pregnancy: no external resource loads except the GA4 tag');
  ok(html.includes('<link rel="stylesheet" href="../assets/design.css">'), 'pregnancy: design.css stylesheet');
  ok(html.includes('<script src="../assets/site.js"></script>'), 'pregnancy: site.js at end');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  ok(blocks.length === 1, 'pregnancy: exactly one JSON-LD script block');
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'pregnancy: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'Pregnancy Due Date Calculator' && app.url === 'https://toolsdaily.vercel.app/pregnancy-due-date-calculator/' && app.offers.price === '0', 'pregnancy: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(visible.length === 3 && JSON.stringify(visible) === JSON.stringify(schema), `pregnancy: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  const ids = ['lmp', 'cycle', 'calc', 'copy', 'download', 'reset', 'r-due', 'r-weeks', 'r-conception', 'r-tri1', 'r-tri2', 'r-tri3', 'msg', 'dl'];
  ok(ids.every((id) => html.includes(`id="${id}"`)), 'pregnancy: all required element IDs present');
  ok((html.match(/id="download"/g) || []).length === 1, 'pregnancy: exactly one #download button');
  ok(html.includes('<a id="dl" class="hidden" href="#" download="pregnancy-due-date.txt">'), 'pregnancy: hidden #dl anchor with pregnancy-due-date.txt download name');
  const nav = html.match(/<nav class="more">[\s\S]*?<\/nav>/)[0];
  const related = ['age-calculator', 'date-difference-calculator', 'bmi-calculator', 'calorie-tdee-calculator', 'tip-calculator'];
  const navHrefs = [...nav.matchAll(/href="\.\.\/([^/]+)\/"/g)].map((m) => m[1]);
  ok(JSON.stringify(navHrefs) === JSON.stringify(related), 'pregnancy: nav.more has exactly the 5 related links in order');
  ok(nav.includes('Age Calculator') && nav.includes('Date Difference Calculator') && nav.includes('BMI Calculator') && nav.includes('Calorie &amp; TDEE Calculator') && nav.includes('Tip Calculator'), 'pregnancy: nav.more display names correct');
  ok(html.includes('<p>63 tools · New tools added regularly.</p>'), 'pregnancy: footer says 63 tools');
  ok(html.includes('Estimate only'), 'pregnancy: estimate-only note present');
}

console.log('PREGNANCY CORE');
{
  const dom = await loadPage('pregnancy-due-date-calculator/');
  const w = dom.window, TD = w.TD_pregnancy;
  ok(TD && typeof TD.calculate === 'function' && typeof TD.summary === 'function' && typeof TD.fmtDate === 'function', 'TD_pregnancy exposed');
  ok(dom._winErrors.length === 0, `pregnancy: zero JS errors on load (got ${dom._winErrors.length})`);
  const jsErrs = dom._jsdomErrors.filter((e) => !/Could not load/i.test(String((e && e.message) || e)));
  ok(jsErrs.length === 0, `pregnancy: zero jsdom script errors on load (got ${jsErrs.length})`);
  // LMP 2026-01-01, 28-day cycle, today 2026-02-01: due 2026-10-08, conception 2026-01-15, 4w 3d.
  const a = TD.calculate('2026-01-01', 28, '2026-02-01');
  ok(!a.error && a.due === '2026-10-08' && a.conception === '2026-01-15' && a.weeks === 4 && a.days === 3, 'LMP 2026-01-01 + 28d cycle, today 2026-02-01 -> due 2026-10-08, conception 2026-01-15, 4w 3d');
  // 35-day cycle moves conception 7 days later (LMP + 21 days).
  const b = TD.calculate('2026-01-01', 35, '2026-02-01');
  ok(!b.error && b.conception === '2026-01-22' && b.due === '2026-10-08' && b.weeks === 4 && b.days === 3, 'LMP 2026-01-01 + 35d cycle -> conception 2026-01-22, due still 2026-10-08');
  // 21-day cycle: conception is LMP + 7 days.
  const b21 = TD.calculate('2026-01-01', 21, '2026-02-01');
  ok(!b21.error && b21.conception === '2026-01-08', 'LMP 2026-01-01 + 21d cycle -> conception 2026-01-08');
  // Trimester ranges for LMP 2026-01-01.
  ok(!a.error && a.trimester1.start === '2026-01-01' && a.trimester1.end === '2026-04-08', 'tri1 2026-01-01 to 2026-04-08 (LMP + 97d)');
  ok(!a.error && a.trimester2.start === '2026-04-09' && a.trimester2.end === '2026-07-15', 'tri2 2026-04-09 to 2026-07-15 (LMP + 98d to + 195d)');
  ok(!a.error && a.trimester3.start === '2026-07-16' && a.trimester3.end === '2026-10-08', 'tri3 2026-07-16 to 2026-10-08 (LMP + 196d to due)');
  // Leap year: 29 Feb 2024 + 280 days = 5 Dec 2024; 15 days later = 2w 1d.
  const leap = TD.calculate('2024-02-29', 28, '2024-03-15');
  ok(!leap.error && leap.due === '2024-12-05' && leap.weeks === 2 && leap.days === 1, 'leap: LMP 2024-02-29 -> due 2024-12-05, today 2024-03-15 = 2w 1d');
  // Future LMP: weeks and days clamp to 0, due date still computed.
  const fut = TD.calculate('2026-06-01', 28, '2026-02-01');
  ok(!fut.error && fut.weeks === 0 && fut.days === 0 && fut.due === '2027-03-08', 'future LMP 2026-06-01 -> weeks 0, days 0, due 2027-03-08');
  // Same-day: 0 weeks, 0 days.
  const same = TD.calculate('2026-01-01', 28, '2026-01-01');
  ok(!same.error && same.weeks === 0 && same.days === 0, 'same-day LMP -> weeks 0, days 0');
  // Errors.
  ok(!!TD.calculate('not-a-date', 28, '2026-02-01').error, 'bad date string errors');
  ok(!!TD.calculate('', 28, '2026-02-01').error, 'empty LMP errors');
  ok(!!TD.calculate('2026-02-30', 28, '2026-03-01').error, 'impossible date 2026-02-30 errors');
  ok(!!TD.calculate('2026-01-01', 20, '2026-02-01').error, 'cycle 20 errors');
  ok(!!TD.calculate('2026-01-01', 36, '2026-02-01').error, 'cycle 36 errors');
  ok(!!TD.calculate('2026-01-01', 28.5, '2026-02-01').error, 'cycle 28.5 errors');
  ok(!!TD.calculate('2026-01-01', null, '2026-02-01').error, 'missing cycle errors');
  // Formatting.
  ok(TD.fmtDate('2026-10-08') === '8 October 2026', 'fmtDate 2026-10-08 -> 8 October 2026');
  ok(TD.fmtDate('2026-01-01') === '1 January 2026', 'fmtDate 2026-01-01 -> 1 January 2026');
  ok(TD.fmtDate('2024-12-05') === '5 December 2024', 'fmtDate 2024-12-05 -> 5 December 2024');
  // Summary text contains the key figures.
  const s = TD.summary(a);
  ok(s.includes('Estimated due date: 8 October 2026') && s.includes('Weeks pregnant: 4 weeks, 3 days') && s.includes('Estimated conception: 15 January 2026'), 'summary lists due date, weeks pregnant and conception');
  ok(s.includes('First trimester: 1 January 2026') && s.includes('Second trimester: 9 April 2026') && s.includes('Third trimester: 16 July 2026'), 'summary lists all three trimester ranges');
  dom.window.close();
}

console.log('PREGNANCY UI');
{
  const dom = await loadPage('pregnancy-due-date-calculator/');
  const w = dom.window;
  // Defaults on load: LMP 2026-01-01, cycle 28 -> due 8 October 2026.
  ok(w.document.querySelector('#lmp').value === '2026-01-01' && w.document.querySelector('#cycle').value === '28', 'UI defaults: LMP 2026-01-01, cycle 28');
  ok(w.document.querySelector('#r-due').textContent === '8 October 2026', 'UI defaults: due date 8 October 2026 on load');
  ok(w.document.querySelector('#r-conception').textContent === '15 January 2026', 'UI defaults: conception 15 January 2026 on load');
  // LMP 2026-03-01 -> due 6 December 2026.
  setVal(w, '#lmp', '2026-03-01');
  w.document.querySelector('#calc').click();
  ok(w.document.querySelector('#r-due').textContent === '6 December 2026', 'UI LMP 2026-03-01 -> due 6 December 2026');
  ok(w.document.querySelector('#r-conception').textContent === '15 March 2026', 'UI LMP 2026-03-01 -> conception 15 March 2026');
  // Invalid input: clear LMP -> error shown and results cleared.
  setVal(w, '#lmp', '');
  w.document.querySelector('#calc').click();
  ok(w.document.querySelector('#msg').textContent.length > 0 && w.document.querySelector('#msg').className === 'msg err' && w.document.querySelector('#r-due').textContent === '–' && w.document.querySelector('#r-weeks').textContent === '–', 'UI cleared LMP shows an error and clears the results');
  // Back to valid inputs for copy/download.
  setVal(w, '#lmp', '2026-01-01');
  setVal(w, '#cycle', '28');
  w.document.querySelector('#calc').click();
  ok(w.document.querySelector('#r-due').textContent === '8 October 2026', 'UI valid inputs after error: due 8 October 2026 again');
  // Copy with a stubbed clipboard.
  let copied = null;
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (t) => { copied = t; } }, configurable: true });
  w.document.querySelector('#copy').click();
  await sleep(80);
  ok(copied && copied.includes('Estimated due date: 8 October 2026') && copied.includes('Weeks pregnant:') && copied.includes('Estimated conception: 15 January 2026') && w.document.querySelector('#msg').textContent === 'Copied to clipboard.' && w.document.querySelector('#msg').className === 'msg ok', 'UI copy writes the summary to the clipboard and shows a visible success message');
  // Download with a stubbed createObjectURL.
  w.URL.createObjectURL = () => 'blob:fake';
  w.document.querySelector('#download').click();
  const dl = w.document.querySelector('#dl');
  ok(dl.getAttribute('href') === 'blob:fake' && dl.getAttribute('download') === 'pregnancy-due-date.txt', 'UI download link points at blob with pregnancy-due-date.txt name');
  ok(w.document.querySelector('#msg').textContent === 'Downloaded pregnancy-due-date.txt.' && w.document.querySelector('#msg').className === 'msg ok', 'UI download shows a visible success message');
  // Download with invalid inputs: link stays '#' and a hint shows.
  setVal(w, '#lmp', '');
  w.document.querySelector('#download').click();
  ok(dl.getAttribute('href') === '#' && w.document.querySelector('#msg').textContent.length > 0, 'UI download with invalid inputs leaves #dl at # and shows a hint');
  // Reset restores the defaults.
  w.document.querySelector('#reset').click();
  ok(w.document.querySelector('#lmp').value === '2026-01-01' && w.document.querySelector('#cycle').value === '28', 'UI reset restores the default inputs');
  ok(w.document.querySelector('#r-due').textContent === '8 October 2026' && w.document.querySelector('#r-conception').textContent === '15 January 2026', 'UI reset restores the default results');
  ok(dl.getAttribute('href') === '#', 'UI reset puts #dl back to #');
  dom.window.close();
}

console.log(`\nLOGIC-PREGNANCY TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
