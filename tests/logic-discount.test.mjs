// Logic + UI tests for the Discount Calculator (2026-11-17 daily tool).
// Drives the real page code through jsdom; core functions are window.TD_discount.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire('/tmp/tooltests/package.json');
const { JSDOM, VirtualConsole } = require('jsdom');

const BASE = process.env.TD_BASE || 'http://127.0.0.1:8792/';
const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const unescapeHtml = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

async function loadPage(p) {
  const vc = new VirtualConsole();
  const jsErrors = [];
  vc.on('jsdomError', (e) => { jsErrors.push(e); });
  const dom = await JSDOM.fromURL(BASE + p, {
    resources: 'usable', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
  });
  await new Promise((res) => {
    if (dom.window.document.readyState === 'complete') res();
    else dom.window.addEventListener('load', res);
    setTimeout(res, 5000);
  });
  await sleep(150);
  return { dom, jsErrors };
}
function setVal(win, sel, value) {
  const el = win.document.querySelector(sel);
  el.value = value;
  el.dispatchEvent(new win.Event('input', { bubbles: true }));
  el.dispatchEvent(new win.Event('change', { bubbles: true }));
  return el;
}

console.log('DISCOUNT STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'discount-calculator', 'index.html'), 'utf8');
  ok(html.includes('<p class="eyebrow">Calculators · No. 54</p>'), 'discount: eyebrow "Calculators · No. 54"');
  ok((html.match(/<h1/g) || []).length === 1, 'discount: exactly one H1');
  ok(html.includes('<h1 class="rise rise-1">Discount Calculator</h1>'), 'discount: H1 is "Discount Calculator"');
  ok(html.includes('<a class="skip" href="#tool">Skip to tool</a>'), 'discount: skip link present');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/discount-calculator/">'), 'discount: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'discount: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'discount: twitter card present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'discount: no external resource loads except the GA4 tag');
  ok(html.includes('G-KX85CZXTR4'), 'discount: GA4 tag present');
  ok(html.includes('<link rel="stylesheet" href="../assets/design.css">'), 'discount: design.css stylesheet');
  ok(html.includes('<script src="../assets/site.js"></script>'), 'discount: site.js at end');
  ok(html.includes("localStorage.getItem('td-theme')"), 'discount: theme-init script present');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(blocks.length === 1 && Array.isArray(data) && data.length === 2, 'discount: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'Discount Calculator' && app.url === 'https://toolsdaily.vercel.app/discount-calculator/' && app.offers.price === '0', 'discount: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(visible.length === 3 && JSON.stringify(visible) === JSON.stringify(schema), `discount: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  ok((html.match(/<details>/g) || []).length === 3, 'discount: exactly 3 visible FAQ details');
  ok((html.match(/id="download"/g) || []).length === 1, 'discount: exactly one #download button');
  ok(html.includes('<a id="dl" class="hidden" href="#" download="discount-calculator.txt">'), 'discount: hidden #dl anchor with discount-calculator.txt');
  const nav = html.match(/<nav class="more">[\s\S]*?<\/nav>/)[0];
  const related = ['tip-calculator', 'percentage-calculator', 'emi-calculator', 'loan-calculator', 'mortgage-calculator'];
  ok((nav.match(/<li>/g) || []).length === 5, 'discount: nav.more has exactly 5 related links');
  ok(related.every((s, i) => nav.indexOf(`href="../${s}/"`) > (i === 0 ? -1 : nav.indexOf(`href="../${related[i - 1]}/"`))), 'discount: nav.more links in order tip, percentage, emi, loan, mortgage');
  ok(nav.includes('>Tip Calculator<') && nav.includes('>Percentage Calculator<') && nav.includes('>EMI Calculator<') && nav.includes('>Loan Calculator<') && nav.includes('>Mortgage Calculator<'), 'discount: nav.more display names match the linked pages');
  ok(html.includes('<p>68 tools · New tools added regularly.</p>'), 'discount: footer says 68 tools');
  for (const id of ['price', 'pct', 'qty', 'calc', 'copy', 'download', 'reset', 'r-final', 'r-savings', 'r-orig', 'r-each', 'msg', 'dl']) {
    ok(html.includes(`id="${id}"`), `discount: element #${id} present`);
  }
  ok(['10', '20', '25', '30', '50'].every((p) => html.includes(`data-pct="${p}"`)), 'discount: quick buttons 10/20/25/30/50% present');
  ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u.test(html), 'discount: no emoji anywhere in the page');
}

console.log('DISCOUNT CORE');
{
  const { dom, jsErrors } = await loadPage('discount-calculator/');
  const w = dom.window, TD = w.TD_discount;
  const realErrors = jsErrors.filter((e) => !/Could not load/.test(String((e && e.message) || e)));
  ok(realErrors.length === 0, `discount: zero JS errors on load (${realErrors.length} real errors)`);
  ok(TD && typeof TD.calculate === 'function' && typeof TD.fmtCents === 'function' && typeof TD.summary === 'function', 'TD_discount exposed with calculate/fmtCents/summary');
  // Defaults: $120 at 25% off, qty 1 -> final $90.00, savings $30.00.
  const a = TD.calculate({ price: 120, pct: 25, qty: 1 });
  ok(!a.error && a.priceCents === 12000 && a.discountPerItemCents === 3000 && a.finalCents === 9000 && a.savingsCents === 3000 && a.origCents === 12000 && a.eachCents === 9000, '$120, 25%, qty 1 -> final 9000c, savings 3000c, orig 12000c, each 9000c');
  // 0% off: nothing saved, final equals original.
  const b = TD.calculate({ price: 50, pct: 0, qty: 2 });
  ok(!b.error && b.discountPerItemCents === 0 && b.finalCents === 10000 && b.savingsCents === 0 && b.origCents === 10000 && b.eachCents === 5000, '$50, 0%, qty 2 -> final 10000c, savings 0c, each 5000c');
  // 100% off: everything free.
  const c = TD.calculate({ price: 80, pct: 100, qty: 1 });
  ok(!c.error && c.finalCents === 0 && c.savingsCents === 8000 && c.origCents === 8000 && c.eachCents === 0, '$80, 100%, qty 1 -> final 0c, savings 8000c');
  // 50% off $0.99: half of 99c is 49.5c -> 50c discount, final 49c.
  const d = TD.calculate({ price: 0.99, pct: 50, qty: 1 });
  ok(!d.error && d.discountPerItemCents === 50 && d.finalCents === 49 && d.savingsCents === 50 && d.eachCents === 49, '$0.99, 50% -> discount 50c (half-cent rounds up), final 49c');
  // Half-cent rounding: $47.25 at 18% = $8.505 -> $8.51 discount, final $38.74.
  const e = TD.calculate({ price: 47.25, pct: 18, qty: 1 });
  ok(!e.error && e.discountPerItemCents === 851 && e.finalCents === 3874 && e.savingsCents === 851, '$47.25, 18% -> discount 851c (half-cent rounds up), final 3874c');
  // Quantity 3: $120 at 25% -> orig $360.00, savings $90.00, final $270.00, each $90.00.
  const f = TD.calculate({ price: 120, pct: 25, qty: 3 });
  ok(!f.error && f.origCents === 36000 && f.savingsCents === 9000 && f.finalCents === 27000 && f.eachCents === 9000, '$120, 25%, qty 3 -> orig 36000c, savings 9000c, final 27000c, each 9000c');
  // Decimal percent: $200 at 12.5%, qty 4 -> discount $25.00 each, final $700.00.
  const g = TD.calculate({ price: 200, pct: 12.5, qty: 4 });
  ok(!g.error && g.discountPerItemCents === 2500 && g.finalCents === 70000 && g.savingsCents === 10000 && g.origCents === 80000, '$200, 12.5%, qty 4 -> final 70000c, savings 10000c, orig 80000c');
  // Huge values: $999,999.99 at 50%, qty 1000.
  const h = TD.calculate({ price: 999999.99, pct: 50, qty: 1000 });
  ok(!h.error && h.priceCents === 99999999 && h.discountPerItemCents === 50000000 && h.finalCents === 49999999000 && h.savingsCents === 50000000000 && h.origCents === 99999999000, '$999,999.99, 50%, qty 1000 -> final 49999999000c, savings 50000000000c, orig 99999999000c');
  // Formatting.
  ok(TD.fmtCents(0) === '$0.00' && TD.fmtCents(5) === '$0.05' && TD.fmtCents(9000) === '$90.00' && TD.fmtCents(123456) === '$1,234.56', 'fmtCents: 0/$0.05/$90.00/$1,234.56');
  // Summary text contains the key figures.
  const s = TD.summary(a, 120, 25, 1);
  ok(s.includes('Original price: $120.00') && s.includes('Discount: 25%') && s.includes('Total savings: $30.00') && s.includes('Final price: $90.00') && s.includes('Price per item after discount: $90.00'), 'summary text lists price, discount, savings, final and per-item amounts');
  // Errors.
  ok(!!TD.calculate({ price: null, pct: 25, qty: 1 }).error, 'missing price errors');
  ok(!!TD.calculate({ price: NaN, pct: 25, qty: 1 }).error, 'NaN price errors');
  ok(!!TD.calculate({ price: 0, pct: 25, qty: 1 }).error, 'price of 0 errors');
  ok(!!TD.calculate({ price: -5, pct: 25, qty: 1 }).error, 'negative price errors');
  ok(!!TD.calculate({ price: 1000001, pct: 25, qty: 1 }).error, 'price over $1,000,000 errors');
  ok(!!TD.calculate({ price: 120, pct: null, qty: 1 }).error, 'missing discount % errors');
  ok(!!TD.calculate({ price: 120, pct: -1, qty: 1 }).error, 'negative discount % errors');
  ok(!!TD.calculate({ price: 120, pct: 101, qty: 1 }).error, 'discount % over 100 errors');
  ok(!!TD.calculate({ price: 120, pct: 25, qty: null }).error, 'missing quantity errors');
  ok(!!TD.calculate({ price: 120, pct: 25, qty: 0 }).error, 'quantity 0 errors');
  ok(!!TD.calculate({ price: 120, pct: 25, qty: 2.5 }).error, 'non-integer quantity errors');
  ok(!!TD.calculate({ price: 120, pct: 25, qty: 1001 }).error, 'quantity over 1000 errors');
  dom.window.close();
}

console.log('DISCOUNT UI');
{
  const { dom } = await loadPage('discount-calculator/');
  const w = dom.window;
  // Defaults on load: $120, 25%, qty 1.
  ok(w.document.querySelector('#r-final').textContent === '$90.00', 'UI defaults: final $90.00 on load');
  ok(w.document.querySelector('#r-savings').textContent === '$30.00', 'UI defaults: savings $30.00 on load');
  ok(w.document.querySelector('#r-orig').textContent === '$120.00', 'UI defaults: original total $120.00 on load');
  ok(w.document.querySelector('#r-each').textContent === '$90.00', 'UI defaults: per item $90.00 on load');
  // Live update: $200, 10%, qty 2 -> final $360.00, savings $40.00, orig $400.00, each $180.00.
  setVal(w, '#price', '200');
  setVal(w, '#pct', '10');
  setVal(w, '#qty', '2');
  ok(w.document.querySelector('#r-final').textContent === '$360.00', 'UI live: final $360.00');
  ok(w.document.querySelector('#r-savings').textContent === '$40.00', 'UI live: savings $40.00');
  ok(w.document.querySelector('#r-orig').textContent === '$400.00', 'UI live: original total $400.00');
  ok(w.document.querySelector('#r-each').textContent === '$180.00', 'UI live: per item $180.00');
  // Calculate button recalculates after a direct value change without events.
  w.document.querySelector('#price').value = '100';
  w.document.querySelector('#pct').value = '50';
  w.document.querySelector('#qty').value = '1';
  w.document.querySelector('#calc').click();
  ok(w.document.querySelector('#r-final').textContent === '$50.00' && w.document.querySelector('#r-savings').textContent === '$50.00', 'UI #calc button: $100 at 50% -> final $50.00, savings $50.00');
  // Quick-discount button sets the percentage and recalculates.
  setVal(w, '#price', '120');
  setVal(w, '#qty', '1');
  w.document.querySelector('[data-pct="30"]').click();
  ok(w.document.querySelector('#pct').value === '30' && w.document.querySelector('#r-final').textContent === '$84.00' && w.document.querySelector('#r-savings').textContent === '$36.00', 'UI quick 30% button sets 30% and final becomes $84.00, savings $36.00');
  // Invalid price shows an error and clears the results.
  setVal(w, '#price', '0');
  ok(w.document.querySelector('#msg').textContent.length > 0 && w.document.querySelector('#r-final').textContent === '–' && w.document.querySelector('#r-savings').textContent === '–', 'UI price of 0 shows an error and clears the results');
  // Download with invalid input: dl href stays '#' and a hint is shown, nothing downloads.
  w.document.querySelector('#download').click();
  ok(w.document.querySelector('#dl').getAttribute('href') === '#' && w.document.querySelector('#msg').textContent.includes('Nothing to download yet'), 'UI download with invalid input leaves #dl at # and shows a hint');
  // Back to valid inputs, then reset restores the defaults.
  setVal(w, '#price', '200');
  setVal(w, '#pct', '10');
  setVal(w, '#qty', '2');
  w.document.querySelector('#reset').click();
  ok(w.document.querySelector('#price').value === '120' && w.document.querySelector('#pct').value === '25' && w.document.querySelector('#qty').value === '1' && w.document.querySelector('#r-final').textContent === '$90.00' && w.document.querySelector('#r-savings').textContent === '$30.00', 'UI reset restores $120 / 25% / qty 1 and final $90.00, savings $30.00');
  // Copy with a stubbed clipboard.
  let copied = null;
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (t) => { copied = t; } }, configurable: true });
  w.document.querySelector('#copy').click();
  await sleep(80);
  ok(copied && copied.includes('Original price: $120.00') && copied.includes('Discount: 25%') && copied.includes('Final price: $90.00') && w.document.querySelector('#msg').textContent === 'Copied to clipboard.' && w.document.querySelector('#msg').className === 'msg ok', 'UI copy writes the summary to the clipboard and shows a visible success message');
  // Download with a stubbed createObjectURL.
  w.URL.createObjectURL = () => 'blob:fake';
  w.document.querySelector('#download').click();
  const dl = w.document.querySelector('#dl');
  ok(dl.getAttribute('href') === 'blob:fake' && dl.getAttribute('download') === 'discount-calculator.txt', 'UI download link points at blob with discount-calculator.txt name');
  ok(w.document.querySelector('#msg').textContent === 'Downloaded discount-calculator.txt.' && w.document.querySelector('#msg').className === 'msg ok', 'UI download shows a visible success message');
  dom.window.close();
}

console.log(`\nLOGIC-DISCOUNT TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
