// Logic + UI tests for the Markup & Margin Calculator (2026-11-17 daily tool).
// Drives the real page code through jsdom; core functions are window.TD_markup.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire('/tmp/tooltests/package.json');
const { JSDOM, VirtualConsole } = require('jsdom');

const BASE = process.env.TD_BASE || 'http://127.0.0.1:8796/';
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

console.log('MARKUP STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'markup-margin-calculator', 'index.html'), 'utf8');
  ok(html.includes('<p class="eyebrow">Calculators · No. 58</p>'), 'markup: eyebrow Calculators · No. 58');
  ok(html.includes('<h1 class="rise rise-1">Markup &amp; Margin Calculator</h1>'), 'markup: H1 is Markup & Margin Calculator');
  ok((html.match(/<h1/g) || []).length === 1, 'markup: exactly one H1');
  ok(html.includes('<a class="skip" href="#tool">Skip to tool</a>'), 'markup: skip link present');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/markup-margin-calculator/">'), 'markup: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'markup: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'markup: twitter card present');
  ok(html.includes('G-KX85CZXTR4'), 'markup: GA4 tag present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'markup: no external resource loads except the GA4 tag');
  ok(html.includes('<link rel="stylesheet" href="../assets/design.css">'), 'markup: design.css stylesheet');
  ok(html.includes('<script src="../assets/site.js"></script>'), 'markup: site.js at end');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  ok(blocks.length === 1, 'markup: exactly one JSON-LD script block');
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'markup: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'Markup & Margin Calculator' && app.url === 'https://toolsdaily.vercel.app/markup-margin-calculator/' && app.offers.price === '0', 'markup: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(visible.length === 3 && JSON.stringify(visible) === JSON.stringify(schema), `markup: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  const ids = ['cost', 'price', 'target-margin', 'calc', 'calc-price', 'copy', 'download', 'reset', 'r-markup', 'r-margin', 'r-profit', 'r-price', 'msg', 'dl'];
  ok(ids.every((id) => html.includes(`id="${id}"`)), 'markup: all required element IDs present');
  ok((html.match(/id="download"/g) || []).length === 1, 'markup: exactly one #download button');
  ok(html.includes('<a id="dl" class="hidden" href="#" download="markup-margin-calculator.txt">'), 'markup: hidden #dl anchor with markup-margin-calculator.txt download name');
  const nav = html.match(/<nav class="more">[\s\S]*?<\/nav>/)[0];
  const related = ['percentage-calculator', 'discount-calculator', 'tip-calculator', 'emi-calculator', 'loan-calculator'];
  const navHrefs = [...nav.matchAll(/href="\.\.\/([^/]+)\/"/g)].map((m) => m[1]);
  ok(JSON.stringify(navHrefs) === JSON.stringify(related), 'markup: nav.more has exactly the 5 related links in order');
  ok(nav.includes('% Percentage Calculator') && nav.includes('Discount Calculator') && nav.includes('Tip Calculator') && nav.includes('EMI Calculator') && nav.includes('Loan Calculator'), 'markup: nav.more display names correct');
  ok(html.includes('<p>63 tools · New tools added regularly.</p>'), 'markup: footer says 63 tools');
}

console.log('MARKUP CORE');
{
  const dom = await loadPage('markup-margin-calculator/');
  const w = dom.window, TD = w.TD_markup;
  ok(TD && typeof TD.calculate === 'function' && typeof TD.priceFromMargin === 'function' && typeof TD.fmtCents === 'function' && typeof TD.summary === 'function', 'TD_markup exposed');
  ok(dom._winErrors.length === 0, `markup: zero JS errors on load (got ${dom._winErrors.length})`);
  const jsErrs = dom._jsdomErrors.filter((e) => !/Could not load/i.test(String((e && e.message) || e)));
  ok(jsErrs.length === 0, `markup: zero jsdom script errors on load (got ${jsErrs.length})`);
  // $40 cost, $60 price: markup 50%, margin 33.33%, profit $20.00.
  const a = TD.calculate(40, 60);
  ok(!a.error && a.costCents === 4000 && a.priceCents === 6000 && a.profitCents === 2000 && a.markupPct === 50 && a.marginPct === 33.33, '$40/$60 -> markup 50%, margin 33.33%, profit 2000c');
  // $10 cost, $15 price: same percentages, profit $5.00.
  const b = TD.calculate(10, 15);
  ok(!b.error && b.markupPct === 50 && b.marginPct === 33.33 && b.profitCents === 500, '$10/$15 -> markup 50%, margin 33.33%, profit 500c');
  // $25 cost, $40 price: markup 60%, margin 37.5%, profit $15.00.
  const c = TD.calculate(25, 40);
  ok(!c.error && c.markupPct === 60 && c.marginPct === 37.5 && c.profitCents === 1500, '$25/$40 -> markup 60%, margin 37.5%, profit 1500c');
  // Price below cost: negative markup, margin and profit.
  const d = TD.calculate(50, 40);
  ok(!d.error && d.markupPct === -20 && d.marginPct === -25 && d.profitCents === -1000, '$50/$40 -> markup -20%, margin -25%, profit -1000c');
  // Zero price: margin undefined, markup -100%.
  const e = TD.calculate(40, 0);
  ok(!e.error && e.markupPct === -100 && e.marginPct === null && e.profitCents === -4000, '$40/$0 -> markup -100%, margin null, profit -4000c');
  // Zero cost handling: markup is undefined, so it errors.
  ok(!!TD.calculate(0, 60).error, 'zero cost errors');
  ok(!!TD.calculate(-5, 60).error, 'negative cost errors');
  ok(!!TD.calculate(null, 60).error, 'missing cost errors');
  ok(!!TD.calculate(NaN, 60).error, 'NaN cost errors');
  ok(!!TD.calculate(40, -1).error, 'negative price errors');
  ok(!!TD.calculate(40, null).error, 'missing price errors');
  ok(!!TD.calculate(1000000.01, 60).error, 'cost over $1,000,000 errors');
  ok(!!TD.calculate(40, 1000000.01).error, 'price over $1,000,000 errors');
  // Price-solving: $40 cost + 40% margin -> $66.67.
  const f = TD.priceFromMargin(40, 40);
  ok(!f.error && f.priceCents === 6667 && f.profitCents === 2667 && f.markupPct === 66.68 && f.marginPct === 40, '$40 + 40% margin -> price 6667c ($66.67), markup 66.68%');
  // $100 cost + 25% margin -> $133.33.
  const g = TD.priceFromMargin(100, 25);
  ok(!g.error && g.priceCents === 13333 && g.profitCents === 3333, '$100 + 25% margin -> price 13333c ($133.33)');
  // 0% margin -> price equals cost.
  const h = TD.priceFromMargin(40, 0);
  ok(!h.error && h.priceCents === 4000 && h.profitCents === 0 && h.markupPct === 0, '$40 + 0% margin -> price 4000c, no profit');
  // Margin >= 100% rejected.
  ok(!!TD.priceFromMargin(40, 100).error, 'margin 100% rejected for price-solving');
  ok(!!TD.priceFromMargin(40, 150).error, 'margin 150% rejected for price-solving');
  ok(!!TD.priceFromMargin(40, -5).error, 'negative target margin rejected');
  ok(!!TD.priceFromMargin(40, null).error, 'missing target margin rejected');
  ok(!!TD.priceFromMargin(0, 40).error, 'zero cost rejected for price-solving');
  ok(!!TD.priceFromMargin(-10, 40).error, 'negative cost rejected for price-solving');
  // Huge values: $500,000 cost + 50% margin -> $1,000,000.00.
  const big = TD.priceFromMargin(500000, 50);
  ok(!big.error && big.priceCents === 100000000, '$500,000 + 50% margin -> price 100000000c ($1,000,000)');
  const bigA = TD.calculate(999999.99, 1000000);
  ok(!bigA.error && bigA.profitCents === 1 && bigA.markupPct === 0 && bigA.marginPct === 0, '$999,999.99/$1,000,000 -> profit 1c, markup 0%, margin 0%');
  // Half-cent rounding: $10.005 cost rounds to 1001c, $20.01 price to 2001c.
  const r = TD.calculate(10.005, 20.01);
  ok(!r.error && r.costCents === 1001 && r.priceCents === 2001 && r.profitCents === 1000, '$10.005/$20.01 -> cost 1001c, price 2001c, profit 1000c (half-cent rounds up)');
  // Price-solving rounding: $10 + 33.33% margin -> 1000/0.6667 = 1499.925 -> 1500c.
  const rr = TD.priceFromMargin(10, 33.33);
  ok(!rr.error && rr.priceCents === 1500, '$10 + 33.33% margin -> price 1500c ($15.00)');
  // Formatting.
  ok(TD.fmtCents(0) === '$0.00' && TD.fmtCents(5) === '$0.05' && TD.fmtCents(2000) === '$20.00' && TD.fmtCents(123456) === '$1,234.56' && TD.fmtCents(-1000) === '-$10.00', 'fmtCents: 0/$0.05/$20.00/$1,234.56/-$10.00');
  ok(TD.fmtPct(50) === '50.00%' && TD.fmtPct(33.33) === '33.33%' && TD.fmtPct(-25) === '-25.00%', 'fmtPct: 50.00%/33.33%/-25.00%');
  // Summary text contains the key figures.
  const s = TD.summary(a, f);
  ok(s.includes('Cost: $40.00') && s.includes('Selling price: $60.00') && s.includes('Profit per unit: $20.00') && s.includes('Markup: 50.00%') && s.includes('Margin: 33.33%') && s.includes('Price for a 40% margin: $66.67'), 'summary text lists cost, price, profit, markup, margin and solved price');
  const s2 = TD.summary(a, null);
  ok(s2.includes('Markup: 50.00%') && !s2.includes('Price for a'), 'summary without a solved price omits the price line');
  dom.window.close();
}

console.log('MARKUP UI');
{
  const dom = await loadPage('markup-margin-calculator/');
  const w = dom.window;
  // Defaults on load: cost $40, price $60, target margin 40%.
  ok(w.document.querySelector('#r-markup').textContent === '50.00%', 'UI defaults: markup 50.00% on load');
  ok(w.document.querySelector('#r-margin').textContent === '33.33%', 'UI defaults: margin 33.33% on load');
  ok(w.document.querySelector('#r-profit').textContent === '$20.00', 'UI defaults: profit $20.00 on load');
  ok(w.document.querySelector('#r-price').textContent === '$66.67', 'UI defaults: solved price $66.67 on load');
  // Mode A: $100 cost, $150 price -> markup 50%, margin 33.33%, profit $50.00.
  setVal(w, '#cost', '100');
  setVal(w, '#price', '150');
  w.document.querySelector('#calc').click();
  ok(w.document.querySelector('#r-markup').textContent === '50.00%' && w.document.querySelector('#r-margin').textContent === '33.33%' && w.document.querySelector('#r-profit').textContent === '$50.00', 'UI mode A: $100/$150 -> markup 50.00%, margin 33.33%, profit $50.00');
  // Mode A, price below cost: $50 cost, $40 price -> negative figures.
  setVal(w, '#cost', '50');
  setVal(w, '#price', '40');
  w.document.querySelector('#calc').click();
  ok(w.document.querySelector('#r-markup').textContent === '-20.00%' && w.document.querySelector('#r-margin').textContent === '-25.00%' && w.document.querySelector('#r-profit').textContent === '-$10.00', 'UI mode A: $50/$40 -> markup -20.00%, margin -25.00%, profit -$10.00');
  // Invalid cost shows an error and clears the results.
  setVal(w, '#cost', '0');
  w.document.querySelector('#calc').click();
  ok(w.document.querySelector('#msg').textContent.length > 0 && w.document.querySelector('#r-markup').textContent === '–' && w.document.querySelector('#r-profit').textContent === '–', 'UI cost of 0 shows an error and clears the results');
  // Mode B: cost $40 + 40% margin -> $66.67.
  setVal(w, '#cost', '40');
  setVal(w, '#price', '60');
  setVal(w, '#target-margin', '40');
  w.document.querySelector('#calc-price').click();
  ok(w.document.querySelector('#r-price').textContent === '$66.67', 'UI mode B: $40 + 40% margin -> price $66.67');
  // Mode B: cost $100 + 25% margin -> $133.33.
  setVal(w, '#cost', '100');
  setVal(w, '#target-margin', '25');
  w.document.querySelector('#calc-price').click();
  ok(w.document.querySelector('#r-price').textContent === '$133.33', 'UI mode B: $100 + 25% margin -> price $133.33');
  // Mode B: 100% margin rejected, price cleared.
  setVal(w, '#target-margin', '100');
  w.document.querySelector('#calc-price').click();
  ok(w.document.querySelector('#msg').textContent.length > 0 && w.document.querySelector('#r-price').textContent === '–', 'UI mode B: 100% margin shows an error and clears the price');
  // Back to valid inputs for copy/download.
  setVal(w, '#cost', '40');
  setVal(w, '#price', '60');
  setVal(w, '#target-margin', '40');
  w.document.querySelector('#calc').click();
  w.document.querySelector('#calc-price').click();
  ok(w.document.querySelector('#r-markup').textContent === '50.00%' && w.document.querySelector('#r-price').textContent === '$66.67', 'UI valid inputs after error: markup 50.00% and price $66.67 again');
  // Copy with a stubbed clipboard.
  let copied = null;
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (t) => { copied = t; } }, configurable: true });
  w.document.querySelector('#copy').click();
  await sleep(80);
  ok(copied && copied.includes('Cost: $40.00') && copied.includes('Selling price: $60.00') && copied.includes('Profit per unit: $20.00') && copied.includes('Markup: 50.00%') && copied.includes('Margin: 33.33%') && copied.includes('Price for a 40% margin: $66.67') && w.document.querySelector('#msg').textContent === 'Copied to clipboard.' && w.document.querySelector('#msg').className === 'msg ok', 'UI copy writes the summary to the clipboard and shows a visible success message');
  // Download with a stubbed createObjectURL.
  w.URL.createObjectURL = () => 'blob:fake';
  w.document.querySelector('#download').click();
  const dl = w.document.querySelector('#dl');
  ok(dl.getAttribute('href') === 'blob:fake' && dl.getAttribute('download') === 'markup-margin-calculator.txt', 'UI download link points at blob with markup-margin-calculator.txt name');
  ok(w.document.querySelector('#msg').textContent === 'Downloaded markup-margin-calculator.txt.' && w.document.querySelector('#msg').className === 'msg ok', 'UI download shows a visible success message');
  // Download with invalid inputs: link stays '#' and a hint shows.
  setVal(w, '#cost', '0');
  w.document.querySelector('#download').click();
  ok(dl.getAttribute('href') === '#' && w.document.querySelector('#msg').textContent.length > 0, 'UI download with invalid inputs leaves #dl at # and shows a hint');
  // Reset restores the defaults.
  w.document.querySelector('#reset').click();
  ok(w.document.querySelector('#cost').value === '40' && w.document.querySelector('#price').value === '60' && w.document.querySelector('#target-margin').value === '40', 'UI reset restores the default inputs');
  ok(w.document.querySelector('#r-markup').textContent === '50.00%' && w.document.querySelector('#r-margin').textContent === '33.33%' && w.document.querySelector('#r-profit').textContent === '$20.00' && w.document.querySelector('#r-price').textContent === '$66.67', 'UI reset restores the default results');
  ok(dl.getAttribute('href') === '#', 'UI reset puts #dl back to #');
  dom.window.close();
}

console.log(`\nLOGIC-MARKUP TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
