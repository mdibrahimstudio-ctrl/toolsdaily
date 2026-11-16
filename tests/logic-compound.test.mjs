// Logic + UI tests for the Compound Interest Calculator tool (2026-11-16).
// Drives the real page code through jsdom; core functions are window.TD_compound.
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const unescapeHtml = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

async function loadPage(p) {
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => {});
  const dom = await JSDOM.fromURL(BASE + p, {
    resources: 'usable', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
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
// Independent closed-form check: FV = P*(1+i)^n + PMTperPeriod*[((1+i)^n - 1)/i],
// with i = annualRate/100/freq, n = freq*years, PMT per period = monthly*(12/freq).
function closedForm(P, PMT, rPct, freq, years) {
  const i = rPct / 100 / freq, n = freq * years;
  const f = Math.pow(1 + i, n);
  if (i === 0) return P + PMT * 12 * years;
  return P * f + PMT * (12 / freq) * ((f - 1) / i);
}

console.log('COMPOUND STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'compound-interest-calculator', 'index.html'), 'utf8');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/compound-interest-calculator/">'), 'compound: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'compound: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'compound: twitter card present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'compound: no external resource loads except the GA4 tag');
  ok(html.includes('G-KX85CZXTR4'), 'compound: GA4 tag present');
  ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}]/u.test(html), 'compound: no emoji anywhere');
  ok((html.match(/<h1/g) || []).length === 1, 'compound: exactly one h1');
  ok(html.includes('Calculators · No. 50'), 'compound: eyebrow says Calculators · No. 50');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'compound: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'Compound Interest Calculator' && app.url === 'https://toolsdaily.vercel.app/compound-interest-calculator/' && app.offers.price === '0', 'compound: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(visible.length === 3, 'compound: exactly 3 visible FAQs');
    ok(JSON.stringify(visible) === JSON.stringify(schema), 'compound: FAQPage schema exactly matches the visible FAQs');
  }
  const nav = html.match(/<nav class="more">[\s\S]*?<\/nav>/)[0];
  const related = ['emi-calculator', 'loan-calculator', 'mortgage-calculator', 'tip-calculator', 'percentage-calculator'];
  ok((nav.match(/<li>/g) || []).length === related.length && related.every((s) => nav.includes(`href="../${s}/"`)), 'compound: More-tools nav links exactly its 5 related tools in order');
  const navHrefs = [...nav.matchAll(/href="\.\.\/([^/]+)\/"/g)].map((m) => m[1]);
  ok(JSON.stringify(navHrefs) === JSON.stringify(related), 'compound: nav.more order is emi, loan, mortgage, tip, percentage');
  ok(html.includes('<p>53 tools · New tools added regularly.</p>'), 'compound: footer count line stays 53 tools');
}

console.log('COMPOUND CORE');
{
  const dom = await loadPage('compound-interest-calculator/');
  const w = dom.window, TD = w.TD_compound;
  ok(TD && typeof TD.calc === 'function' && typeof TD.buildCSV === 'function' && typeof TD.fmt === 'function', 'TD_compound exposed with calc, buildCSV, fmt');
  ok(TD.round2(3.674) === 3.67 && TD.round2(3.676) === 3.68 && TD.round2(10 / 3) === 3.33, 'round2 rounds to 2 decimals');
  // Hand-check 1: P=10000, PMT=0, r=5%, freq=1, 1yr -> 10500.00.
  const c1 = TD.calc({ principal: 10000, monthly: 0, annualRate: 5, years: 1, freq: 1 });
  ok(!c1.error && c1.futureValue === 10500 && c1.totalContributions === 10000 && c1.interest === 500, 'hand-check 1: 10000/0/5%/1y annual -> FV 10500.00, interest 500.00');
  ok(c1.yearly.length === 1 && c1.yearly[0].year === 1 && c1.yearly[0].start === 10000 && c1.yearly[0].contributions === 0 && c1.yearly[0].interest === 500 && c1.yearly[0].end === 10500, 'hand-check 1: yearly row 1 is 10000/0/500/10500');
  // Hand-check 2: P=0, PMT=100, r=0, 10y -> 12000.00.
  const c2 = TD.calc({ principal: 0, monthly: 100, annualRate: 0, years: 10, freq: 12 });
  ok(!c2.error && c2.futureValue === 12000 && c2.totalContributions === 12000 && c2.interest === 0, 'hand-check 2: 0/100/0%/10y -> FV 12000.00, zero interest');
  ok(c2.yearly.length === 10 && c2.yearly[9].end === 12000 && c2.yearly.every((r) => r.interest === 0), 'hand-check 2: 10 yearly rows, no interest in any year');
  // Hand-check 3: P=10000, PMT=100, r=5%, freq=12, 10y -> 31998.32 (simulation; closed form 31998.32).
  const c3 = TD.calc({ principal: 10000, monthly: 100, annualRate: 5, years: 10, freq: 12 });
  ok(!c3.error && Math.abs(c3.futureValue - 31998.32) <= 0.5, `hand-check 3: 10000/100/5%/10y monthly -> FV ${c3.futureValue} (expected 31998.32 ± 0.50)`);
  ok(c3.futureValue === 31998.32, 'hand-check 3: exact simulated future value is 31998.32');
  ok(c3.totalContributions === 22000 && Math.abs(c3.interest - 9998.32) < 0.01, 'hand-check 3: contributions 22000.00, interest 9998.32');
  ok(c3.yearly.length === 10 && c3.yearly[9].end === c3.futureValue, 'hand-check 3: year 10 end balance equals futureValue');
  ok(c3.yearly[0].start === 10000 && c3.yearly[0].contributions === 1200, 'hand-check 3: year 1 starts at 10000 with 1200 contributions');
  // Closed-form vs simulation agreement within $0.01 (independent check).
  const agreeCases = [
    [10000, 100, 5, 12, 10],
    [1000, 50, 6, 12, 5],
    [5000, 200, 4, 4, 5],
    [2000, 0, 8, 12, 3],
    [500, 25, 5, 1, 10],
    [8000, 0, 6, 2, 10],
    [20000, 250, 5, 12, 5],
  ];
  for (const [P, PMT, r, f, y] of agreeCases) {
    const sim = TD.calc({ principal: P, monthly: PMT, annualRate: r, years: y, freq: f });
    const cf = closedForm(P, PMT, r, f, y);
    ok(!sim.error && Math.abs(sim.futureValue - cf) <= 0.01, `closed-form agrees within $0.01: P=${P} PMT=${PMT} r=${r}% f=${f} y=${y} (sim ${sim.futureValue} vs closed ${cf.toFixed(2)})`);
  }
  // Zero rate with contributions, zero principal, zero everything.
  const zr = TD.calc({ principal: 5000, monthly: 200, annualRate: 0, years: 5, freq: 4 });
  ok(!zr.error && zr.futureValue === 17000 && zr.interest === 0 && zr.totalContributions === 17000, 'zero rate: 5000/200/0%/5y -> FV 17000.00, no interest');
  const zp = TD.calc({ principal: 0, monthly: 0, annualRate: 5, years: 10, freq: 12 });
  ok(!zp.error && zp.futureValue === 0 && zp.interest === 0 && zp.totalContributions === 0, 'zero principal and zero contributions -> FV 0');
  // Invalid inputs each return an error.
  ok(TD.calc({ principal: -1, monthly: 100, annualRate: 5, years: 10, freq: 12 }).error, 'invalid: negative principal returns an error');
  ok(TD.calc({ principal: 10000, monthly: -5, annualRate: 5, years: 10, freq: 12 }).error, 'invalid: negative monthly contribution returns an error');
  ok(TD.calc({ principal: 10000, monthly: 100, annualRate: -1, years: 10, freq: 12 }).error, 'invalid: negative rate returns an error');
  ok(TD.calc({ principal: 10000, monthly: 100, annualRate: 101, years: 10, freq: 12 }).error, 'invalid: rate 101 returns an error');
  ok(TD.calc({ principal: 10000, monthly: 100, annualRate: 5, years: 0, freq: 12 }).error, 'invalid: years 0 returns an error');
  ok(TD.calc({ principal: 10000, monthly: 100, annualRate: 5, years: 51, freq: 12 }).error, 'invalid: years 51 returns an error');
  ok(TD.calc({ principal: 10000, monthly: 100, annualRate: 5, years: 2.5, freq: 12 }).error, 'invalid: non-integer years returns an error');
  ok(TD.calc({ principal: 10000, monthly: 100, annualRate: 5, years: 10, freq: 7 }).error, 'invalid: freq 7 returns an error');
  ok(TD.calc({ principal: 10000, monthly: 100, annualRate: 5, years: 10, freq: 3 }).error, 'invalid: freq 3 returns an error');
  ok(TD.calc({ principal: NaN, monthly: 100, annualRate: 5, years: 10, freq: 12 }).error, 'invalid: missing principal returns an error');
  // Yearly rows: exactly `years` rows; interest sums to total interest.
  const sumInt = c3.yearly.reduce((a, r) => a + r.interest, 0);
  ok(Math.abs(sumInt - c3.interest) <= 0.02, `yearly interest sums to total interest (sum ${sumInt.toFixed(2)} vs ${c3.interest})`);
  const long = TD.calc({ principal: 25000, monthly: 500, annualRate: 8, years: 30, freq: 12 });
  ok(long.yearly.length === 30 && long.yearly[29].end === long.futureValue, '30-year case: exactly 30 yearly rows, last end equals futureValue');
  const sumLong = long.yearly.reduce((a, r) => a + r.interest, 0);
  ok(Math.abs(sumLong - long.interest) <= 0.02, `30-year yearly interest sums to total interest (sum ${sumLong.toFixed(2)} vs ${long.interest})`);
  ok(long.yearly.every((r, i) => i === 0 || r.start === long.yearly[i - 1].end), 'yearly rows chain: each start equals the previous end');
  // CSV: header + first/last rows correct.
  const csv = TD.buildCSV(c3);
  const lines = csv.split('\n');
  ok(lines[0] === 'Year,Start Balance,Contributions,Interest,End Balance', 'CSV header row correct');
  ok(lines.length === 11, 'CSV has header + 10 yearly rows');
  ok(lines[1].startsWith('1,10000.00,1200.00,'), `CSV year 1 row starts at principal 10000.00 (got ${lines[1]})`);
  ok(lines[10].endsWith(',31998.32'), `CSV last row ends at futureValue 31998.32 (got ${lines[10]})`);
  ok(lines[10].startsWith('10,'), 'CSV last row is year 10');
  // fmt: $ with thousands separators and 2 decimals.
  ok(TD.fmt(31998.32) === '$31,998.32', 'fmt(31998.32) is $31,998.32');
  ok(TD.fmt(10500) === '$10,500.00', 'fmt(10500) is $10,500.00');
  ok(TD.fmt(0) === '$0.00', 'fmt(0) is $0.00');
  ok(TD.fmt(1000000.5) === '$1,000,000.50', 'fmt(1000000.5) is $1,000,000.50');
  dom.window.close();
}

console.log('COMPOUND UI');
{
  const dom = await loadPage('compound-interest-calculator/');
  const w = dom.window;
  const doc = w.document;
  // Defaults on load: 10000/100/5%/10y/monthly -> FV $31,998.32.
  ok(doc.querySelector('#principal').value === '10000', 'UI defaults: principal 10000');
  ok(doc.querySelector('#monthly').value === '100', 'UI defaults: monthly 100');
  ok(doc.querySelector('#rate').value === '5', 'UI defaults: rate 5');
  ok(doc.querySelector('#years').value === '10', 'UI defaults: years 10');
  ok(doc.querySelector('#frequency').value === '12', 'UI defaults: frequency monthly (12)');
  ok(doc.querySelector('#r-future').textContent === '$31,998.32', 'UI defaults: future value $31,998.32 on load');
  ok(doc.querySelector('#r-contrib').textContent === '$22,000.00', 'UI defaults: total contributions $22,000.00');
  ok(doc.querySelector('#r-interest').textContent === '$9,998.32', 'UI defaults: interest earned $9,998.32');
  ok(doc.querySelectorAll('#year-body tr').length === 10, 'UI defaults: table has 10 yearly rows');
  ok(doc.querySelectorAll('#chart .chart-bar').length === 10, 'UI defaults: chart has 10 bars');
  ok(doc.querySelector('#year-body tr:last-child td:last-child').textContent === '$31,998.32', 'UI defaults: last table row ends at $31,998.32');
  // Changing #years to 20 updates the result and the table to 20 rows.
  setVal(w, '#years', '20');
  const r20 = w.TD_compound.calc({ principal: 10000, monthly: 100, annualRate: 5, years: 20, freq: 12 });
  ok(doc.querySelector('#r-future').textContent === w.TD_compound.fmt(r20.futureValue), `UI live update: years 20 gives future value ${w.TD_compound.fmt(r20.futureValue)}`);
  ok(doc.querySelectorAll('#year-body tr').length === 20, 'UI live update: table has 20 rows after years -> 20');
  ok(doc.querySelectorAll('#chart .chart-bar').length === 20, 'UI live update: chart has 20 bars after years -> 20');
  // Calculate button re-runs the calculation.
  setVal(w, '#years', '10');
  setVal(w, '#rate', '10');
  doc.querySelector('#calc').click();
  const r10 = w.TD_compound.calc({ principal: 10000, monthly: 100, annualRate: 10, years: 10, freq: 12 });
  ok(doc.querySelector('#r-future').textContent === w.TD_compound.fmt(r10.futureValue), 'UI Calculate button: rate 10% updates future value');
  setVal(w, '#rate', '5');
  // Download with a stubbed createObjectURL.
  w.URL.createObjectURL = () => 'blob:fake';
  doc.querySelector('#download').click();
  const dl = doc.querySelector('#dl');
  ok(dl.getAttribute('href') === 'blob:fake' && dl.getAttribute('download') === 'compound-interest-schedule.csv', 'UI download link points at blob with compound-interest-schedule.csv name');
  ok(doc.querySelector('#msg').textContent === 'Downloaded compound-interest-schedule.csv.' && doc.querySelector('#msg').className === 'msg ok', 'UI download shows a visible success message');
  // Download button is visible from page load.
  ok(doc.querySelector('#download') && doc.querySelector('#download').textContent.includes('Download schedule (.csv)'), 'UI download button visible with .csv label');
  ok(!doc.querySelector('#download').classList.contains('hidden'), 'UI download button is not hidden');
  // Invalid input (rate 200) shows a visible error and clears results.
  setVal(w, '#rate', '200');
  ok(doc.querySelector('#msg').textContent === 'Annual interest rate must be between 0% and 100%.' && doc.querySelector('#msg').className === 'msg err', 'UI invalid rate 200: visible error message');
  ok(doc.querySelector('#r-future').textContent === '–' && doc.querySelector('#r-contrib').textContent === '–' && doc.querySelector('#r-interest').textContent === '–', 'UI invalid rate 200: stats cleared to dashes');
  ok(doc.querySelectorAll('#year-body tr').length === 0, 'UI invalid rate 200: table cleared');
  ok(doc.querySelectorAll('#chart .chart-bar').length === 0, 'UI invalid rate 200: chart cleared');
  // Download with invalid input errors instead of downloading.
  doc.querySelector('#download').click();
  ok(doc.querySelector('#msg').textContent === 'Nothing to download yet — Annual interest rate must be between 0% and 100%.' && doc.querySelector('#msg').className === 'msg err', 'UI download with invalid input: visible error, nothing downloaded');
  // Fixing the input restores the result.
  setVal(w, '#rate', '5');
  ok(doc.querySelector('#r-future').textContent === '$31,998.32', 'UI recovery: rate back to 5 restores $31,998.32');
  dom.window.close();
}

console.log(`\nLOGIC-COMPOUND TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
