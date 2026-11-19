// Logic + UI tests for the Loan Calculator tool (2026-11-16).
// Drives the real page code through jsdom; core functions are window.TD_loan.
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
// Independent check: binary-search the payment that zeroes the balance after
// `months` months of continuous compounding (no rounding anywhere).
function bisectPayment(amount, annualRate, months) {
  const r = annualRate / 100 / 12;
  function balAfter(p) {
    let b = amount;
    for (let i = 0; i < months; i++) b = b * (1 + r) - p;
    return b;
  }
  let lo = 0, hi = amount * (1 + r) + 1000;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (balAfter(mid) > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
function sumKey(rows, key) { return rows.reduce((s, x) => s + x[key], 0); }

console.log('LOAN STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'loan-calculator', 'index.html'), 'utf8');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/loan-calculator/">'), 'loan: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'loan: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'loan: twitter card present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'loan: no external resource loads except the GA4 tag');
  ok(html.includes('G-KX85CZXTR4'), 'loan: GA4 tag present');
  ok(html.includes('Calculators · No. 51'), 'loan: eyebrow is Calculators · No. 51');
  ok((html.match(/<h1/g) || []).length === 1, 'loan: exactly one h1');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'loan: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'Loan Calculator' && app.url === 'https://toolsdaily.vercel.app/loan-calculator/' && app.offers.price === '0', 'loan: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(visible.length === 3 && JSON.stringify(visible) === JSON.stringify(schema), `loan: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  const nav = html.match(/<nav class="more">[\s\S]*?<\/nav>/)[0];
  const related = ['emi-calculator', 'mortgage-calculator', 'compound-interest-calculator', 'percentage-calculator', 'tip-calculator'];
  const navHrefs = [...nav.matchAll(/href="\.\.\/([^/]+)\/"/g)].map((m) => m[1]);
  ok(JSON.stringify(navHrefs) === JSON.stringify(related), 'loan: More-tools nav lists exactly the 5 related tools in order');
  ok(html.includes('<p>68 tools · New tools added regularly.</p>'), 'loan: footer count line stays "68 tools"');
  ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u.test(html), 'loan: no emoji anywhere in the page');
}

console.log('LOAN CORE');
{
  const dom = await loadPage('loan-calculator/');
  const w = dom.window, TD = w.TD_loan;
  ok(TD && typeof TD.calc === 'function' && typeof TD.buildCSV === 'function' && typeof TD.fmt === 'function', 'TD_loan exposed with calc/buildCSV/fmt');
  ok(TD.fmt(599.55) === '$599.55' && TD.fmt(100000) === '$100,000.00' && TD.fmt(0) === '$0.00', 'fmt: $599.55 / $100,000.00 / $0.00');
  ok(TD.round2(115838.449) === 115838.45 && TD.round2(10 / 3) === 3.33, 'round2 rounds to 2 decimals');
  // Hand-check 1: $100,000 at 6% annual, 360 months.
  const a = TD.calc({ amount: 100000, annualRate: 6, months: 360, extra: 0 });
  ok(!a.error && Math.abs(a.payment - 599.55) < 0.01, 'core: $100k 6% 360mo payment $599.55 (got ' + (a.error || a.payment) + ')');
  ok(!a.error && Math.abs(a.totalInterest - 115838.45) < 0.01, 'core: $100k 6% 360mo total interest $115,838.45 (got ' + (a.error || a.totalInterest) + ')');
  ok(!a.error && Math.abs(a.totalInterest - 115838.19) < 2.00, 'core: total interest within $2 of the $115,838.19 reference figure');
  ok(!a.error && Math.abs(a.totalPaid - 215838.45) < 0.01 && a.months === 360 && a.schedule.length === 360, 'core: $100k 6% 360mo total paid $215,838.45 over 360 months');
  // Bisection cross-checks (independent, unrounded) for 3 parameter sets.
  for (const [amt, rate, n] of [[100000, 6, 360], [250000, 4.5, 180], [15000, 9.9, 60]]) {
    const r = TD.calc({ amount: amt, annualRate: rate, months: n, extra: 0 });
    const bis = bisectPayment(amt, rate, n);
    ok(!r.error && Math.abs(bis - r.payment) < 0.02, `core bisection: $${amt} ${rate}% ${n}mo payment ${r.payment} agrees with bisection ${bis.toFixed(4)} within $0.02`);
  }
  // Hand-check 2: $10,000 at 0%, 12 months.
  const z = TD.calc({ amount: 10000, annualRate: 0, months: 12, extra: 0 });
  ok(!z.error && z.payment === 833.33 && z.months === 12 && z.totalInterest === 0, 'core: $10k 0% 12mo payment $833.33, 12 months, $0 interest');
  ok(!z.error && z.schedule.slice(0, 11).every((s) => s.payment === 833.33) && z.schedule[11].payment === 833.37, 'core: $10k 0% 12mo is 11 payments of $833.33 plus a final $833.37');
  ok(!z.error && z.schedule[11].balance === 0, 'core: $10k 0% 12mo final balance exactly $0.00');
  // Hand-check 3: extra $100/mo shortens the loan and cuts the interest.
  const e = TD.calc({ amount: 100000, annualRate: 6, months: 360, extra: 100 });
  ok(!e.error && e.months === 252 && e.months >= 240 && e.months <= 260, 'core: $100k 6% 360mo + $100 extra pays off in 252 months (got ' + (e.error || e.months) + ')');
  ok(!e.error && e.totalInterest === 75938.04 && e.totalInterest < a.totalInterest, 'core: extra $100/mo total interest $75,938.04, strictly less than $115,838.45');
  // 1-month edge case.
  const one = TD.calc({ amount: 5000, annualRate: 12, months: 1, extra: 0 });
  ok(!one.error && one.payment === 5050 && one.months === 1 && one.schedule[0].interest === 50 && one.schedule[0].principal === 5000 && one.schedule[0].balance === 0, 'core: $5k 12% 1mo payment $5,050.00 (5000 principal + 50 interest)');
  // Term-unit conversion is a UI concern: 30 years must equal 360 months.
  const yrs = TD.calc({ amount: 100000, annualRate: 6, months: 30 * 12, extra: 0 });
  ok(yrs.payment === a.payment && yrs.totalInterest === a.totalInterest, 'core: 30*12 months gives the same payment and interest as 360 months');
  // Extra so large the loan ends in month 1.
  const huge = TD.calc({ amount: 100000, annualRate: 6, months: 360, extra: 100000 });
  ok(!huge.error && huge.months === 1 && huge.schedule[0].payment === 100500 && huge.schedule[0].balance === 0, 'core: huge extra payment clears the loan in 1 month ($100,500.00)');
  // Invalid inputs each return an error.
  const bad = [
    [{ amount: 0, annualRate: 6, months: 360, extra: 0 }, 'amount 0'],
    [{ amount: -5, annualRate: 6, months: 360, extra: 0 }, 'amount -5'],
    [{ amount: 100000, annualRate: -1, months: 360, extra: 0 }, 'rate -1'],
    [{ amount: 100000, annualRate: 101, months: 360, extra: 0 }, 'rate 101'],
    [{ amount: 100000, annualRate: 6, months: 0, extra: 0 }, 'months 0'],
    [{ amount: 100000, annualRate: 6, months: 601, extra: 0 }, 'months 601'],
    [{ amount: 100000, annualRate: 6, months: 360, extra: -10 }, 'extra -10'],
    [{ amount: 100000, annualRate: 6, months: 12.5, extra: 0 }, 'months 12.5 (not an integer)'],
    [{ amount: 100000001, annualRate: 6, months: 360, extra: 0 }, 'amount over $100,000,000'],
  ];
  for (const [opts, label] of bad) {
    ok(TD.calc(opts).error, 'core invalid input (' + label + ') returns an error');
  }
  // Schedule integrity for several cases.
  for (const [amt, rate, n, ex] of [[100000, 6, 360, 0], [10000, 0, 12, 0], [250000, 4.5, 180, 0], [15000, 9.9, 60, 50], [5000, 12, 1, 0]]) {
    const r = TD.calc({ amount: amt, annualRate: rate, months: n, extra: ex });
    ok(!r.error && Math.abs(sumKey(r.schedule, 'principal') - amt) < 0.01, `core integrity $${amt} ${rate}% ${n}mo extra ${ex}: principal sums to the loan amount`);
    ok(!r.error && Math.abs(sumKey(r.schedule, 'interest') - r.totalInterest) < 0.01, `core integrity $${amt} ${rate}% ${n}mo extra ${ex}: interest sums to total interest`);
    ok(!r.error && r.schedule[r.schedule.length - 1].balance === 0, `core integrity $${amt} ${rate}% ${n}mo extra ${ex}: final balance exactly $0.00`);
    ok(!r.error && r.schedule.length === r.months && r.schedule.every((s, i) => s.month === i + 1), `core integrity $${amt} ${rate}% ${n}mo extra ${ex}: months are 1..N in order`);
  }
  // buildCSV.
  const csv = TD.buildCSV(a);
  const lines = csv.split('\n');
  ok(lines[0] === 'Month,Payment,Interest,Principal,Balance', 'core buildCSV: header row');
  ok(lines.length === 361, 'core buildCSV: 360 data rows plus the header');
  ok(lines[1] === '1,599.55,500.00,99.55,99900.45', 'core buildCSV: month 1 row is 1,599.55,500.00,99.55,99900.45');
  ok(lines[360].endsWith(',0.00'), 'core buildCSV: final row ends with a $0.00 balance');
  dom.window.close();
}

console.log('LOAN UI');
{
  const dom = await loadPage('loan-calculator/');
  const w = dom.window;
  // Defaults on load: $100,000 at 6% over 30 years.
  ok(w.document.querySelector('#r-payment').textContent === '$599.55', 'UI defaults: monthly payment $599.55');
  ok(w.document.querySelector('#r-interest').textContent === '$115,838.45', 'UI defaults: total interest $115,838.45');
  ok(w.document.querySelector('#r-total').textContent === '$215,838.45', 'UI defaults: total paid $215,838.45');
  ok(w.document.querySelector('#r-months').textContent === '360 months (30 years)', 'UI defaults: payoff time "360 months (30 years)"');
  ok(w.document.querySelectorAll('#sched-body tr').length === 360, 'UI defaults: schedule table has 360 rows');
  ok(w.document.querySelector('#sched-table thead').textContent.includes('Principal') && w.document.querySelector('#sched-table thead').textContent.includes('Balance'), 'UI defaults: table headers include Principal and Balance');
  // Live update: doubling the amount doubles the payment.
  setVal(w, '#amount', '200000');
  ok(w.document.querySelector('#r-payment').textContent === '$1,199.10', 'UI live update: $200,000 gives $1,199.10 a month');
  setVal(w, '#amount', '100000');
  ok(w.document.querySelector('#r-payment').textContent === '$599.55', 'UI live update: back to $100,000 gives $599.55');
  // Calculate button re-renders.
  setVal(w, '#amount', '50000');
  w.document.querySelector('#calc').click();
  ok(w.document.querySelector('#r-payment').textContent === '$299.78', 'UI Calculate button: $50,000 gives $299.78 a month');
  ok(w.document.querySelector('#msg').textContent === 'Calculated — see your monthly payment, totals and full schedule below.' && w.document.querySelector('#msg').className === 'msg ok', 'UI Calculate button: visible success message');
  setVal(w, '#amount', '100000');
  // Term-unit conversion: 360 months must match 30 years.
  setVal(w, '#term-unit', 'months');
  setVal(w, '#term', '360');
  ok(w.document.querySelector('#r-payment').textContent === '$599.55' && w.document.querySelector('#r-months').textContent === '360 months (30 years)', 'UI term unit: 360 months gives the same $599.55 payment as 30 years');
  setVal(w, '#term-unit', 'years');
  setVal(w, '#term', '30');
  // Extra payment shortens the payoff time and the table.
  setVal(w, '#extra', '100');
  ok(w.document.querySelector('#r-months').textContent === '252 months (21 years)', 'UI extra $100: payoff time shortens to "252 months (21 years)"');
  ok(w.document.querySelector('#r-interest').textContent === '$75,938.04', 'UI extra $100: total interest drops to $75,938.04');
  ok(w.document.querySelectorAll('#sched-body tr').length === 252, 'UI extra $100: schedule table shrinks to 252 rows');
  setVal(w, '#extra', '0');
  ok(w.document.querySelectorAll('#sched-body tr').length === 360, 'UI extra back to 0: schedule table back to 360 rows');
  // Invalid input shows a visible error and clears the results.
  setVal(w, '#amount', '0');
  ok(w.document.querySelector('#msg').textContent === 'Please enter a loan amount greater than $0.' && w.document.querySelector('#msg').className === 'msg err', 'UI invalid amount 0: visible error message');
  ok(w.document.querySelector('#r-payment').textContent === '–' && w.document.querySelector('#r-interest').textContent === '–' && w.document.querySelector('#r-total').textContent === '–' && w.document.querySelector('#r-months').textContent === '–', 'UI invalid amount 0: stats cleared to dashes');
  ok(w.document.querySelectorAll('#sched-body tr').length === 0, 'UI invalid amount 0: schedule table cleared');
  // Download with invalid input errors instead of downloading nothing.
  w.document.querySelector('#download').click();
  ok(w.document.querySelector('#msg').textContent === 'Nothing to download yet — Please enter a loan amount greater than $0.' && w.document.querySelector('#msg').className === 'msg err', 'UI download with invalid input: visible error, nothing downloaded');
  ok(w.document.querySelector('#dl').getAttribute('href') === '#', 'UI download with invalid input: download link still unset');
  // Download with a stubbed createObjectURL.
  setVal(w, '#amount', '100000');
  ok(w.document.querySelector('#r-payment').textContent === '$599.55', 'UI restore: $599.55 again after fixing the amount');
  w.URL.createObjectURL = () => 'blob:fake';
  w.document.querySelector('#download').click();
  const dl = w.document.querySelector('#dl');
  ok(dl.getAttribute('href') === 'blob:fake' && dl.getAttribute('download') === 'loan-amortization-schedule.csv', 'UI download link points at blob with loan-amortization-schedule.csv name');
  ok(w.document.querySelector('#msg').textContent === 'Downloaded loan-amortization-schedule.csv.' && w.document.querySelector('#msg').className === 'msg ok', 'UI download shows a visible success message');
  dom.window.close();
}

console.log(`\nLOGIC-LOAN TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
