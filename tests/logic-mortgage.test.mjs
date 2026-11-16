// Logic + UI tests for the Mortgage Calculator tool (2026-11-16).
// Drives the real page code through jsdom; core functions are window.TD_mortgage.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire('/tmp/tooltests/package.json');
const { JSDOM, VirtualConsole } = require('jsdom');

const BASE = process.env.TD_BASE || 'http://127.0.0.1:8795/';
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
// Independent check: binary-search the fixed monthly payment that zeroes the
// balance after n months (raw float balance, no rounding), then compare.
function bisectPayment(loan, annualRate, years) {
  const months = years * 12, r = annualRate / 100 / 12;
  if (r === 0) return loan / months;
  let lo = 0, hi = loan;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    let bal = loan;
    for (let m = 0; m < months; m++) bal = bal * (1 + r) - mid;
    if (bal > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
function scheduleCheck(TD, opts) {
  const r = TD.calc(opts);
  if (r.error) return false;
  const principalSum = r.schedule.reduce((a, m) => a + m.principal, 0);
  return r.schedule.length === opts.years * 12
    && Math.abs(principalSum - r.loan) <= 0.01
    && r.schedule[r.schedule.length - 1].balance === 0
    && r.schedule.every((m) => m.payment === r.pi)
    && Math.abs(r.schedule.reduce((a, m) => a + m.interest, 0) - r.totalInterest) <= 0.01;
}

console.log('MORTGAGE STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'mortgage-calculator', 'index.html'), 'utf8');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/mortgage-calculator/">'), 'mortgage: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'mortgage: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'mortgage: twitter card present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'mortgage: no external resource loads except the GA4 tag');
  ok(html.includes('G-KX85CZXTR4'), 'mortgage: GA4 tag present');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'mortgage: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'Mortgage Calculator' && app.url === 'https://toolsdaily.vercel.app/mortgage-calculator/' && app.offers.price === '0', 'mortgage: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(visible.length === 3, 'mortgage: exactly 3 visible FAQs');
    ok(JSON.stringify(visible) === JSON.stringify(schema), `mortgage: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  const nav = html.match(/<nav class="more">[\s\S]*?<\/nav>/)[0];
  const related = ['loan-calculator', 'emi-calculator', 'compound-interest-calculator', 'percentage-calculator', 'tip-calculator'];
  ok((nav.match(/<li>/g) || []).length === related.length && related.every((s) => nav.includes(`href="../${s}/"`)), 'mortgage: More-tools nav links exactly its 5 related tools');
  const hrefs = [...nav.matchAll(/href="\.\.\/([^/]+)\/"/g)].map((m) => m[1]);
  ok(JSON.stringify(hrefs) === JSON.stringify(related), 'mortgage: More-tools nav is in the specified order');
  ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u.test(html), 'mortgage: no emoji anywhere on the page');
  ok(html.includes('Calculators · No. 52'), 'mortgage: eyebrow says Calculators · No. 52');
  ok((html.match(/<h1/g) || []).length === 1, 'mortgage: exactly one h1');
}

console.log('MORTGAGE CORE');
{
  const dom = await loadPage('mortgage-calculator/');
  const w = dom.window, TD = w.TD_mortgage;
  ok(TD && typeof TD.calc === 'function' && typeof TD.buildCSV === 'function' && typeof TD.fmt === 'function', 'TD_mortgage exposed with calc/buildCSV/fmt');
  ok(TD.round2(2.675) === 2.68 || TD.round2(10 / 3) === 3.33, 'round2 rounds to 2 decimals');
  ok(TD.fmt(2022.62) === '$2,022.62' && TD.fmt(320000) === '$320,000.00' && TD.fmt(0) === '$0.00', 'fmt formats $ with thousands separators and 2 decimals');

  // Hand-check case 1: $400k price, $80k down (20%), 6.5%, 30y, tax $4800, insurance $1800, PMI 0.5%.
  // Formula P&I = $2,022.62 (verified against the bisection check below); the brief's
  // $2,022.78 figure is $0.16 high — the formula + bisection agree on $2,022.62.
  const main = TD.calc({ price: 400000, down: 80000, annualRate: 6.5, years: 30, tax: 4800, insurance: 1800, pmiRate: 0.5 });
  ok(!main.error, 'core main case: no error');
  ok(main.loan === 320000, 'core main case: loan $320,000.00');
  ok(main.pi === 2022.62, 'core main case: P&I exactly $2,022.62');
  ok(main.taxMonthly === 400 && main.insMonthly === 150, 'core main case: monthly tax $400.00, monthly insurance $150.00');
  ok(main.pmiApplies === false && main.pmiMonthly === 0, 'core main case: 20% down -> no PMI, $0.00');
  ok(main.total === 2572.62, 'core main case: total monthly payment exactly $2,572.62');
  ok(Math.abs(main.pi - bisectPayment(320000, 6.5, 30)) <= 0.02, 'core main case: P&I agrees with independent bisection within $0.02');
  ok(main.schedule.length === 360, 'core main case: schedule has 360 rows');
  ok(main.schedule[0].month === 1 && main.schedule[0].interest === 1733.33 && main.schedule[0].principal === 289.29 && main.schedule[0].balance === 319710.71, 'core main case: month 1 row (interest $1,733.33, principal $289.29, balance $319,710.71)');
  ok(main.schedule[359].balance === 0, 'core main case: final schedule balance exactly 0.00');

  // Hand-check case 2: same inputs, down $40,000 (10%) -> PMI applies.
  const low = TD.calc({ price: 400000, down: 40000, annualRate: 6.5, years: 30, tax: 4800, insurance: 1800, pmiRate: 0.5 });
  ok(!low.error && low.loan === 360000, 'core 10% down: loan $360,000.00');
  ok(low.pmiApplies === true && low.pmiMonthly === 150, 'core 10% down: PMI $150.00/month, pmiApplies true');
  ok(low.pi === 2275.44, 'core 10% down: P&I $2,275.44');
  ok(low.total === 2975.44, 'core 10% down: total $2,975.44');
  ok(Math.abs(low.pi - bisectPayment(360000, 6.5, 30)) <= 0.02, 'core 10% down: P&I agrees with independent bisection within $0.02');

  // Zero-rate case: $120k price, $20k down, 0%, 10y -> P&I $833.33, final balance 0.
  const zero = TD.calc({ price: 120000, down: 20000, annualRate: 0, years: 10, tax: 0, insurance: 0, pmiRate: 0 });
  ok(!zero.error && zero.loan === 100000 && zero.pi === 833.33, 'core zero rate: P&I $833.33 (100000/120)');
  ok(zero.schedule.length === 120 && zero.schedule[119].balance === 0, 'core zero rate: 120 rows, final balance exactly 0.00');
  ok(zero.total === 833.33, 'core zero rate: total $833.33 with no tax/insurance/PMI');

  // Second bisection cross-check set: $200k loan at 4.25% over 15y.
  const mid = TD.calc({ price: 250000, down: 50000, annualRate: 4.25, years: 15, tax: 3000, insurance: 1200, pmiRate: 0.5 });
  ok(!mid.error && mid.pi === 1504.56, 'core 4.25%/15y: P&I $1,504.56');
  ok(Math.abs(mid.pi - bisectPayment(200000, 4.25, 15)) <= 0.02, 'core 4.25%/15y: P&I agrees with independent bisection within $0.02');
  ok(mid.pmiApplies === false && mid.total === 1854.56, 'core 4.25%/15y: no PMI at 20% down, total $1,854.56');

  // PMI boundary: exactly 20% -> no PMI; 19.9% -> PMI applies.
  const edge20 = TD.calc({ price: 400000, down: 80000, annualRate: 6.5, years: 30, tax: 0, insurance: 0, pmiRate: 0.5 });
  ok(edge20.pmiApplies === false && edge20.pmiMonthly === 0, 'core PMI boundary: exactly 20% down -> no PMI');
  const edge199 = TD.calc({ price: 400000, down: 79600, annualRate: 6.5, years: 30, tax: 0, insurance: 0, pmiRate: 0.5 });
  ok(edge199.pmiApplies === true && edge199.pmiMonthly === 133.5, 'core PMI boundary: 19.9% down -> PMI applies, $133.50/month');
  const zeroPmiRate = TD.calc({ price: 400000, down: 40000, annualRate: 6.5, years: 30, tax: 0, insurance: 0, pmiRate: 0 });
  ok(zeroPmiRate.pmiApplies === true && zeroPmiRate.pmiMonthly === 0, 'core PMI: 0% PMI rate -> $0.00 even when PMI applies');

  // Invalid inputs each return an error.
  const base = { price: 400000, down: 80000, annualRate: 6.5, years: 30, tax: 4800, insurance: 1800, pmiRate: 0.5 };
  ok(TD.calc({ ...base, down: 400000 }).error, 'core invalid: down = price rejected');
  ok(TD.calc({ ...base, down: 500000 }).error, 'core invalid: down > price rejected');
  ok(TD.calc({ ...base, down: -1 }).error, 'core invalid: negative down rejected');
  ok(TD.calc({ ...base, price: 0 }).error, 'core invalid: price 0 rejected');
  ok(TD.calc({ ...base, price: -5000 }).error, 'core invalid: negative price rejected');
  ok(TD.calc({ ...base, price: 100000001 }).error, 'core invalid: price above $100,000,000 rejected');
  ok(TD.calc({ ...base, annualRate: 101 }).error, 'core invalid: rate 101% rejected');
  ok(TD.calc({ ...base, annualRate: -1 }).error, 'core invalid: negative rate rejected');
  ok(TD.calc({ ...base, years: 0 }).error, 'core invalid: term 0 years rejected');
  ok(TD.calc({ ...base, years: 51 }).error, 'core invalid: term 51 years rejected');
  ok(TD.calc({ ...base, years: 30.5 }).error, 'core invalid: fractional term rejected');
  ok(TD.calc({ ...base, pmiRate: 6 }).error, 'core invalid: PMI rate 6% rejected');
  ok(TD.calc({ ...base, pmiRate: -0.1 }).error, 'core invalid: negative PMI rate rejected');
  ok(TD.calc({ ...base, tax: -100 }).error, 'core invalid: negative tax rejected');
  ok(TD.calc({ ...base, insurance: -50 }).error, 'core invalid: negative insurance rejected');
  ok(TD.calc({ ...base, price: NaN }).error, 'core invalid: missing price rejected');

  // Schedule integrity for several cases.
  ok(scheduleCheck(TD, base), 'core schedule integrity: main case (principal sums to loan, final balance 0)');
  ok(scheduleCheck(TD, { ...base, down: 40000 }), 'core schedule integrity: 10% down case');
  ok(scheduleCheck(TD, { price: 120000, down: 20000, annualRate: 0, years: 10, tax: 0, insurance: 0, pmiRate: 0 }), 'core schedule integrity: zero-rate case');
  ok(scheduleCheck(TD, { price: 250000, down: 50000, annualRate: 4.25, years: 15, tax: 3000, insurance: 1200, pmiRate: 0.5 }), 'core schedule integrity: 4.25%/15y case');
  ok(scheduleCheck(TD, { price: 75000, down: 0, annualRate: 9.9, years: 5, tax: 900, insurance: 600, pmiRate: 1.2 }), 'core schedule integrity: small loan, 0 down, 5y case');
  ok(main.totalInterest > 400000 && main.totalInterest < 410000, 'core main case: total interest in the expected $400k-$410k range');
  ok(Math.abs(main.totalInterest - (main.pi * 360 - main.loan)) <= 5, 'core main case: total interest close to P&I*360 - loan');

  // buildCSV.
  const csv = TD.buildCSV(main);
  const lines = csv.split('\n');
  ok(lines[0] === 'Month,Payment,Interest,Principal,Balance', 'core buildCSV: header line exact');
  ok(lines.length === 361, 'core buildCSV: 360 data rows + header');
  ok(lines[1] === '1,2022.62,1733.33,289.29,319710.71', 'core buildCSV: month 1 row exact');
  ok(lines[360].startsWith('360,2022.62,') && lines[360].endsWith(',0.00'), 'core buildCSV: final row ends at balance 0.00');
  dom.window.close();
}

console.log('MORTGAGE UI');
{
  const dom = await loadPage('mortgage-calculator/');
  const w = dom.window;
  // Defaults on load: $400k / $80k / 6.5% / 30y / tax $4800 / insurance $1800 / PMI 0.5%.
  ok(w.document.querySelector('#r-loan').textContent === '$320,000.00', 'UI defaults: loan $320,000.00');
  ok(w.document.querySelector('#r-pi').textContent === '$2,022.62', 'UI defaults: P&I $2,022.62');
  ok(w.document.querySelector('#r-tax').textContent === '$400.00', 'UI defaults: monthly tax $400.00');
  ok(w.document.querySelector('#r-ins').textContent === '$150.00', 'UI defaults: monthly insurance $150.00');
  ok(w.document.querySelector('#r-pmi').textContent === '$0.00', 'UI defaults: PMI $0.00');
  ok(w.document.querySelector('#r-total').textContent === '$2,572.62', 'UI defaults: total $2,572.62');
  ok(w.document.querySelector('#pmi-note').textContent === 'No PMI — your down payment is 20% or more.', 'UI defaults: "No PMI" note shown');
  ok(w.document.querySelectorAll('#sched-body tr').length === 360, 'UI defaults: schedule table has 360 rows');
  ok(w.document.querySelector('#download').textContent === 'Download schedule (.csv)', 'UI defaults: download button visible from page load');
  // Changing down to $40,000 (10%) shows PMI $150.00 and the PMI-applies note.
  setVal(w, '#down', '40000');
  ok(w.document.querySelector('#r-loan').textContent === '$360,000.00', 'UI 10% down: loan $360,000.00');
  ok(w.document.querySelector('#r-pi').textContent === '$2,275.44', 'UI 10% down: P&I $2,275.44');
  ok(w.document.querySelector('#r-pmi').textContent === '$150.00', 'UI 10% down: PMI $150.00');
  ok(w.document.querySelector('#r-total').textContent === '$2,975.44', 'UI 10% down: total $2,975.44');
  ok(w.document.querySelector('#pmi-note').textContent === 'PMI applies because your down payment is under 20% of the home price.', 'UI 10% down: PMI-applies note shown');
  ok(w.document.querySelectorAll('#sched-body tr').length === 360, 'UI 10% down: schedule still has 360 rows');
  // Calculate button recalculates on click.
  setVal(w, '#rate', '5');
  w.document.querySelector('#calc').click();
  ok(w.document.querySelector('#r-pi').textContent === '$1,932.56', 'UI calculate button: rate 5% on $360k/30y gives P&I $1,932.56');
  // Download with a stubbed createObjectURL.
  setVal(w, '#rate', '6.5');
  w.URL.createObjectURL = () => 'blob:fake';
  w.document.querySelector('#download').click();
  const dl = w.document.querySelector('#dl');
  ok(dl.getAttribute('href') === 'blob:fake' && dl.getAttribute('download') === 'mortgage-amortization-schedule.csv', 'UI download link points at blob with mortgage-amortization-schedule.csv name');
  ok(w.document.querySelector('#msg').textContent === 'Downloaded mortgage-amortization-schedule.csv.' && w.document.querySelector('#msg').className === 'msg ok', 'UI download shows a visible success message');
  // Invalid input (down = price) shows a visible error and clears results.
  setVal(w, '#down', '400000');
  ok(w.document.querySelector('#msg').className === 'msg err' && w.document.querySelector('#msg').textContent.length > 0, 'UI invalid input: visible error message');
  ok(w.document.querySelector('#r-pi').textContent === '–' && w.document.querySelector('#r-total').textContent === '–' && w.document.querySelector('#r-loan').textContent === '–', 'UI invalid input: stats cleared to dashes');
  ok(w.document.querySelectorAll('#sched-body tr').length === 0, 'UI invalid input: schedule table cleared');
  ok(w.document.querySelector('#pmi-note').textContent === '', 'UI invalid input: PMI note cleared');
  // Download with invalid inputs errors instead of downloading nothing.
  w.document.querySelector('#download').click();
  ok(w.document.querySelector('#msg').className === 'msg err' && w.document.querySelector('#msg').textContent.startsWith('Nothing to download yet'), 'UI download with invalid inputs: visible error, nothing downloaded');
  dom.window.close();
}

console.log(`\nLOGIC-MORTGAGE TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
