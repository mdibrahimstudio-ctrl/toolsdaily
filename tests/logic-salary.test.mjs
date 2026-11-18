// Logic + UI tests for the Salary & Hourly Pay Calculator (2026-11-17 daily tool).
// Drives the real page code through jsdom; core functions are window.TD_salary.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire('/tmp/tooltests/package.json');
const { JSDOM, VirtualConsole } = require('jsdom');

const BASE = process.env.TD_BASE || 'http://127.0.0.1:8794/';
const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const unescapeHtml = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

async function loadPage(p) {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', (e) => { errors.push(String((e && e.message) || e)); });
  const dom = await JSDOM.fromURL(BASE + p, {
    resources: 'usable', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
  });
  await new Promise((res) => {
    if (dom.window.document.readyState === 'complete') res();
    else dom.window.addEventListener('load', res);
    setTimeout(res, 5000);
  });
  await sleep(150);
  return { dom, errors };
}
function setVal(win, sel, value) {
  const el = win.document.querySelector(sel);
  el.value = value;
  el.dispatchEvent(new win.Event('input', { bubbles: true }));
  el.dispatchEvent(new win.Event('change', { bubbles: true }));
  return el;
}
function setCheck(win, sel, checked) {
  const el = win.document.querySelector(sel);
  el.checked = checked;
  el.dispatchEvent(new win.Event('change', { bubbles: true }));
  return el;
}

console.log('SALARY STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'salary-pay-calculator', 'index.html'), 'utf8');
  ok(html.includes('<p class="eyebrow">Calculators · No. 56</p>'), 'salary: eyebrow "Calculators · No. 56"');
  ok(html.includes('<title>Salary &amp; Hourly Pay Calculator'), 'salary: title names the tool');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/salary-pay-calculator/">'), 'salary: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'salary: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'salary: twitter card present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'salary: no external resource loads except the GA4 tag');
  ok(html.includes('G-KX85CZXTR4'), 'salary: GA4 tag present');
  ok(html.includes("localStorage.getItem('td-theme')"), 'salary: theme-init script present');
  ok(html.includes('<link rel="stylesheet" href="../assets/design.css">'), 'salary: design.css stylesheet');
  ok(html.includes('<script src="../assets/site.js"></script>'), 'salary: site.js at end');
  ok(html.includes('<a class="skip" href="#tool">Skip to tool</a>'), 'salary: skip link present');
  ok((html.match(/<h1/g) || []).length === 1, 'salary: exactly one H1');
  ok(!/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(html), 'salary: no emoji anywhere');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'salary: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'Salary & Hourly Pay Calculator' && app.url === 'https://toolsdaily.vercel.app/salary-pay-calculator/' && app.offers.price === '0', 'salary: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(visible.length === 3 && JSON.stringify(visible) === JSON.stringify(schema), `salary: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  const ids = ['pay', 'period', 'hours', 'ot', 'ot-hours', 'calc', 'copy', 'download', 'reset', 'r-hourly', 'r-weekly', 'r-biweekly', 'r-monthly', 'r-annual', 'r-ot', 'msg', 'dl'];
  ok(ids.every((id) => html.includes(`id="${id}"`)), 'salary: all required element IDs present');
  ok((html.match(/id="download"/g) || []).length === 1, 'salary: exactly one #download button');
  ok(html.includes('<a id="dl" class="hidden" href="#" download="salary-pay-calculator.txt">'), 'salary: hidden #dl anchor with salary-pay-calculator.txt download name');
  const nav = html.match(/<nav class="more">[\s\S]*?<\/nav>/)[0];
  const related = ['emi-calculator', 'loan-calculator', 'compound-interest-calculator', 'tip-calculator', 'percentage-calculator'];
  const navHrefs = [...nav.matchAll(/href="\.\.\/([^/]+)\/"/g)].map((m) => m[1]);
  ok(JSON.stringify(navHrefs) === JSON.stringify(related), 'salary: nav.more has exactly the 5 related links, in order');
  ok(html.includes('63 tools · New tools added regularly.'), 'salary: footer says 63 tools');
}

console.log('SALARY CORE');
{
  const { dom, errors } = await loadPage('salary-pay-calculator/');
  const w = dom.window, TD = w.TD_salary;
  ok(errors.length === 0, `salary: zero JS errors on load${errors.length ? ' — ' + errors.join(' | ') : ''}`);
  ok(TD && typeof TD.calculate === 'function' && typeof TD.fmtCents === 'function' && typeof TD.summary === 'function', 'TD_salary exposed');
  // Defaults: $25/h x 40h -> $1,000/wk, $2,000 biweekly, $4,333.33/mo, $52,000/yr.
  const a = TD.calculate({ pay: 25, period: 'hourly', hours: 40, ot: false, otHours: 0 });
  ok(!a.error && a.hourlyCents === 2500 && a.weeklyCents === 100000 && a.biweeklyCents === 200000 && a.monthlyCents === 433333 && a.annualCents === 5200000 && a.otWeeklyCents === 0, '$25/h x 40h -> hourly 2500c, weekly 100000c, biweekly 200000c, monthly 433333c, annual 5200000c');
  // $52,000/yr at 40h round-trips to $25/h.
  const b = TD.calculate({ pay: 52000, period: 'annual', hours: 40, ot: false, otHours: 0 });
  ok(!b.error && b.hourlyCents === 2500 && b.weeklyCents === 100000 && b.monthlyCents === 433333 && b.annualCents === 5200000, '$52,000/yr at 40h -> $25/h, weekly $1,000, annual $52,000');
  // $4,333.33/month at 40h -> $25/h, $1,000/wk, $4,333.33/mo.
  const c = TD.calculate({ pay: 4333.33, period: 'monthly', hours: 40, ot: false, otHours: 0 });
  ok(!c.error && c.hourlyCents === 2500 && c.weeklyCents === 100000 && c.monthlyCents === 433333, '$4,333.33/mo at 40h -> $25/h, weekly $1,000, monthly $4,333.33');
  // $2,000 biweekly at 40h -> $25/h, $52,000/yr.
  const d = TD.calculate({ pay: 2000, period: 'biweekly', hours: 40, ot: false, otHours: 0 });
  ok(!d.error && d.hourlyCents === 2500 && d.weeklyCents === 100000 && d.annualCents === 5200000, '$2,000 biweekly at 40h -> $25/h, annual $52,000');
  // $1,000/week at 40h -> $25/h.
  const e = TD.calculate({ pay: 1000, period: 'weekly', hours: 40, ot: false, otHours: 0 });
  ok(!e.error && e.hourlyCents === 2500 && e.annualCents === 5200000, '$1,000/wk at 40h -> $25/h, annual $52,000');
  // $60,000/yr at 37.5h -> $30.77/h, $1,153.85/wk, $2,307.69 biweekly, $5,000/mo, $60,000/yr.
  const f = TD.calculate({ pay: 60000, period: 'annual', hours: 37.5, ot: false, otHours: 0 });
  ok(!f.error && f.hourlyCents === 3077 && f.weeklyCents === 115385 && f.biweeklyCents === 230769 && f.monthlyCents === 500000 && f.annualCents === 6000000, '$60,000/yr at 37.5h -> hourly 3077c, weekly 115385c, biweekly 230769c, monthly 500000c, annual 6000000c');
  // $8,666.67/month at 40h -> $50/h, $2,000/wk, $8,666.67/mo.
  const g = TD.calculate({ pay: 8666.67, period: 'monthly', hours: 40, ot: false, otHours: 0 });
  ok(!g.error && g.hourlyCents === 5000 && g.weeklyCents === 200000 && g.biweeklyCents === 400000 && g.monthlyCents === 866667 && g.annualCents === 10400004, '$8,666.67/mo at 40h -> hourly 5000c, weekly 200000c, biweekly 400000c, monthly 866667c, annual 10400004c');
  // Overtime: $20/h, 40h + 10 OT h -> weekly $1,100, OT $300/wk, annual $57,200.
  const h = TD.calculate({ pay: 20, period: 'hourly', hours: 40, ot: true, otHours: 10 });
  ok(!h.error && h.hourlyCents === 2000 && h.baseWeeklyCents === 80000 && h.otWeeklyCents === 30000 && h.weeklyCents === 110000 && h.biweeklyCents === 220000 && h.monthlyCents === 476667 && h.annualCents === 5720000, '$20/h, 40h + 10 OT h -> OT 30000c, weekly 110000c, biweekly 220000c, monthly 476667c, annual 5720000c');
  // Overtime from an annual figure: $52,000/yr, 40h, 5 OT h -> OT $187.50/wk, weekly $1,187.50.
  const i = TD.calculate({ pay: 52000, period: 'annual', hours: 40, ot: true, otHours: 5 });
  ok(!i.error && i.hourlyCents === 2500 && i.otWeeklyCents === 18750 && i.weeklyCents === 118750, '$52,000/yr, 40h + 5 OT h -> OT 18750c, weekly 118750c');
  // Overtime switched off ignores the OT hours entirely.
  const j = TD.calculate({ pay: 20, period: 'hourly', hours: 40, ot: false, otHours: 10 });
  ok(!j.error && j.otWeeklyCents === 0 && j.weeklyCents === 80000, 'OT off with 10 OT hours entered -> OT 0c, weekly $800');
  // Overtime on with 0 OT hours -> no overtime pay.
  const k = TD.calculate({ pay: 20, period: 'hourly', hours: 40, ot: true, otHours: 0 });
  ok(!k.error && k.otWeeklyCents === 0 && k.weeklyCents === 80000, 'OT on with 0 OT hours -> OT 0c, weekly $800');
  // Half-cent rounding, rounds up: $7.25/h x 37.5h = $271.875 -> $271.88.
  const l = TD.calculate({ pay: 7.25, period: 'hourly', hours: 37.5, ot: false, otHours: 0 });
  ok(!l.error && l.weeklyCents === 27188 && l.annualCents === 1413750, '$7.25/h x 37.5h -> weekly 27188c (half-cent rounds up), annual 1413750c');
  // Half-cent overtime: $7.25/h x 1 OT h = $10.875 -> $10.88.
  const m = TD.calculate({ pay: 7.25, period: 'hourly', hours: 40, ot: true, otHours: 1 });
  ok(!m.error && m.otWeeklyCents === 1088, '$7.25/h, 1 OT h -> OT 1088c (half-cent rounds up)');
  // Huge but valid: $1,000,000/yr at 40h -> $480.77/h, $19,230.77/wk, $1,000,000/yr.
  const n = TD.calculate({ pay: 1000000, period: 'annual', hours: 40, ot: false, otHours: 0 });
  ok(!n.error && n.hourlyCents === 48077 && n.weeklyCents === 1923077 && n.biweeklyCents === 3846154 && n.monthlyCents === 8333333 && n.annualCents === 100000000, '$1,000,000/yr at 40h -> hourly 48077c, weekly 1923077c, biweekly 3846154c, monthly 8333333c, annual 100000000c');
  // Formatting.
  ok(TD.fmtCents(0) === '$0.00' && TD.fmtCents(5) === '$0.05' && TD.fmtCents(2500) === '$25.00' && TD.fmtCents(433333) === '$4,333.33' && TD.fmtCents(5200000) === '$52,000.00', 'fmtCents: 0/$0.05/$25.00/$4,333.33/$52,000.00');
  // Decimal-string cent conversion avoids the 10.005 float trap.
  ok(TD.toCents(10.005) === 1001 && TD.toCents(47.25) === 4725 && isNaN(TD.toCents('abc')) && isNaN(TD.toCents('')), 'toCents: 10.005 -> 1001c, 47.25 -> 4725c, "abc"/empty -> NaN');
  // Summary text contains the key figures.
  const s = TD.summary(a, 25, 'hourly', 40, false, 0);
  ok(s.includes('Pay entered: $25.00 per hour') && s.includes('Hourly: $25.00') && s.includes('Weekly: $1,000.00') && s.includes('Biweekly: $2,000.00') && s.includes('Monthly: $4,333.33') && s.includes('Annual: $52,000.00') && s.includes('Overtime pay (weekly): No overtime'), 'summary text lists entered pay and all five equivalents, no overtime');
  const s2 = TD.summary(h, 20, 'hourly', 40, true, 10);
  ok(s2.includes('Overtime: 10 hours/week at 1.5x') && s2.includes('Overtime pay (weekly): $300.00') && s2.includes('Weekly: $1,100.00'), 'summary with overtime lists OT hours, $300 OT pay and $1,100 weekly');
  // Errors.
  ok(!!TD.calculate({}).error, 'missing pay errors');
  ok(!!TD.calculate({ pay: 0, period: 'hourly', hours: 40 }).error, 'zero pay errors');
  ok(!!TD.calculate({ pay: -5, period: 'hourly', hours: 40 }).error, 'negative pay errors');
  ok(!!TD.calculate({ pay: 'abc', period: 'hourly', hours: 40 }).error, 'non-numeric pay errors');
  ok(!!TD.calculate({ pay: 10000000.01, period: 'hourly', hours: 40 }).error, 'pay over $10,000,000 errors');
  ok(!!TD.calculate({ pay: 25, period: 'daily', hours: 40 }).error, 'invalid period errors');
  ok(!!TD.calculate({ pay: 25, period: 'hourly', hours: null }).error, 'missing hours errors');
  ok(!!TD.calculate({ pay: 25, period: 'hourly', hours: 0 }).error, 'zero hours errors');
  ok(!!TD.calculate({ pay: 25, period: 'hourly', hours: -10 }).error, 'negative hours errors');
  ok(!!TD.calculate({ pay: 25, period: 'hourly', hours: 169 }).error, 'hours over 168 errors');
  ok(!!TD.calculate({ pay: 25, period: 'hourly', hours: 40, ot: true, otHours: -1 }).error, 'negative OT hours errors');
  ok(!!TD.calculate({ pay: 25, period: 'hourly', hours: 40, ot: true, otHours: NaN }).error, 'missing OT hours errors when OT is on');
  ok(!!TD.calculate({ pay: 25, period: 'hourly', hours: 100, ot: true, otHours: 100 }).error, 'regular + OT hours over 168 errors');
  dom.window.close();
}

console.log('SALARY UI');
{
  const { dom } = await loadPage('salary-pay-calculator/');
  const w = dom.window;
  // Defaults on load: $25/h, 40h, no overtime.
  ok(w.document.querySelector('#r-hourly').textContent === '$25.00', 'UI defaults: hourly $25.00 on load');
  ok(w.document.querySelector('#r-weekly').textContent === '$1,000.00', 'UI defaults: weekly $1,000.00 on load');
  ok(w.document.querySelector('#r-biweekly').textContent === '$2,000.00', 'UI defaults: biweekly $2,000.00 on load');
  ok(w.document.querySelector('#r-monthly').textContent === '$4,333.33', 'UI defaults: monthly $4,333.33 on load');
  ok(w.document.querySelector('#r-annual').textContent === '$52,000.00', 'UI defaults: annual $52,000.00 on load');
  ok(w.document.querySelector('#r-ot').textContent === 'No overtime', 'UI defaults: overtime line says "No overtime" on load');
  ok(w.document.querySelector('#ot-hours').disabled === true, 'UI defaults: OT hours input disabled until the OT box is ticked');
  // Convert from annual: $60,000/yr at 37.5h.
  setVal(w, '#pay', '60000');
  setVal(w, '#period', 'annual');
  setVal(w, '#hours', '37.5');
  w.document.querySelector('#calc').click();
  ok(w.document.querySelector('#r-hourly').textContent === '$30.77', 'UI annual: $60,000/yr at 37.5h -> hourly $30.77');
  ok(w.document.querySelector('#r-weekly').textContent === '$1,153.85', 'UI annual: weekly $1,153.85');
  ok(w.document.querySelector('#r-annual').textContent === '$60,000.00', 'UI annual: annual stays $60,000.00');
  // Overtime: $20/h, 40h + 10 OT h.
  setVal(w, '#pay', '20');
  setVal(w, '#period', 'hourly');
  setVal(w, '#hours', '40');
  setCheck(w, '#ot', true);
  ok(w.document.querySelector('#ot-hours').disabled === false, 'UI OT: ticking the OT box enables the OT hours input');
  setVal(w, '#ot-hours', '10');
  w.document.querySelector('#calc').click();
  ok(w.document.querySelector('#r-weekly').textContent === '$1,100.00', 'UI OT: weekly $1,100.00');
  ok(w.document.querySelector('#r-ot').textContent === '$300.00', 'UI OT: overtime line $300.00');
  ok(w.document.querySelector('#r-annual').textContent === '$57,200.00', 'UI OT: annual $57,200.00');
  // Untick overtime: OT line back to "No overtime", weekly back to base pay.
  setCheck(w, '#ot', false);
  ok(w.document.querySelector('#r-ot').textContent === 'No overtime', 'UI OT off: overtime line says "No overtime" again');
  ok(w.document.querySelector('#r-weekly').textContent === '$800.00', 'UI OT off: weekly back to $800.00');
  ok(w.document.querySelector('#ot-hours').disabled === true, 'UI OT off: OT hours input disabled again');
  // Invalid pay shows an error and clears the results.
  setVal(w, '#pay', '0');
  ok(w.document.querySelector('#msg').textContent.length > 0 && w.document.querySelector('#r-hourly').textContent === '–' && w.document.querySelector('#r-annual').textContent === '–', 'UI pay of 0 shows an error and clears the results');
  // Back to a valid pay for copy/download.
  setVal(w, '#pay', '25');
  setVal(w, '#period', 'hourly');
  ok(w.document.querySelector('#r-annual').textContent === '$52,000.00', 'UI valid pay after error: annual $52,000.00 again');
  // Copy with a stubbed clipboard.
  let copied = null;
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (t) => { copied = t; } }, configurable: true });
  w.document.querySelector('#copy').click();
  await sleep(80);
  ok(copied && copied.includes('Pay entered: $25.00 per hour') && copied.includes('Weekly: $1,000.00') && copied.includes('Annual: $52,000.00') && w.document.querySelector('#msg').textContent === 'Copied to clipboard.' && w.document.querySelector('#msg').className === 'msg ok', 'UI copy writes the summary to the clipboard and shows a visible success message');
  // Reset restores the defaults.
  setVal(w, '#pay', '99');
  w.document.querySelector('#reset').click();
  ok(w.document.querySelector('#pay').value === '25' && w.document.querySelector('#period').value === 'hourly' && w.document.querySelector('#hours').value === '40' && w.document.querySelector('#ot').checked === false && w.document.querySelector('#ot-hours').value === '0' && w.document.querySelector('#ot-hours').disabled === true, 'UI reset: inputs back to $25/hour, 40h, OT off');
  ok(w.document.querySelector('#r-annual').textContent === '$52,000.00' && w.document.querySelector('#r-ot').textContent === 'No overtime', 'UI reset: results back to the defaults');
  ok(w.document.querySelector('#dl').getAttribute('href') === '#' && w.document.querySelector('#msg').textContent === 'Reset to $25/hour, 40 hours a week.', 'UI reset: download link back to # and reset message shown');
  // Download with a stubbed createObjectURL: a valid render sets #dl href.
  w.URL.createObjectURL = () => 'blob:fake';
  setVal(w, '#pay', '25');
  const dl = w.document.querySelector('#dl');
  ok(dl.getAttribute('href') === 'blob:fake' && dl.getAttribute('download') === 'salary-pay-calculator.txt', 'UI download link points at blob with salary-pay-calculator.txt name after a valid render');
  w.document.querySelector('#download').click();
  ok(w.document.querySelector('#msg').textContent === 'Downloaded salary-pay-calculator.txt.' && w.document.querySelector('#msg').className === 'msg ok', 'UI download shows a visible success message');
  // Download with invalid input: hint shown, nothing downloaded.
  setVal(w, '#pay', '0');
  ok(w.document.querySelector('#dl').getAttribute('href') === '#', 'UI invalid pay: download link back to #');
  w.document.querySelector('#download').click();
  ok(w.document.querySelector('#msg').textContent === 'Nothing to download yet — enter a valid pay amount first.' && w.document.querySelector('#msg').className === 'msg err' && w.document.querySelector('#dl').getAttribute('href') === '#', 'UI download with invalid input shows a hint and downloads nothing');
  dom.window.close();
}

console.log(`\nLOGIC-SALARY TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
